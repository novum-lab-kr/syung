// 길찾기: from a place (or my location) to a place, leaving now or at a set time.
// The sheet asks /api/place for places and /api/route for plans (server/journey.py).
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const min = s => Math.max(1, Math.round(s / 60));

export function initJourney({openSheet, closeSheet, map, colors, myLocation, button, showRoute, clearRoute}) {
  const picked = {from: null, to: null};
  let last = null;   // the last search: {d, sel, from, to, at} — kept while its route is on the map
  let inSheet = false;
  let goSeq = 0;   // the latest route search; older answers are dropped   // the journey sheet (not a station or train one) is what's open

  // bar at the bottom while the sheet is closed: the chosen route; tap to see the results again
  const bar = document.createElement('div');
  bar.className = 'jbar'; bar.hidden = true;
  bar.innerHTML = '<button type="button" class="jbar-open" aria-label="경로 결과 다시 보기"></button><button type="button" class="jbar-x" aria-label="경로 지우기">✕</button>';
  document.body.append(bar);
  bar.querySelector('.jbar-open').onclick = () => open();
  bar.querySelector('.jbar-x').onclick = () => { last = null; bar.hidden = true; clearRoute?.(); };

  const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/></svg>';
  const SWAP = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/></svg>';
  // one card, two rows (출발 / 도착), like a map app; the search runs as soon as both ends are known
  function form() {
    const here = myLocation();
    return `<div class="journey">
  <h3>길찾기</h3>
  <button type="button" class="jsum" id="jSum" hidden></button>
  <div class="jcard">
    <div class="jf jrow"><i class="jdot from" aria-hidden="true"></i>
      <input id="jFrom" type="text" autocomplete="off" aria-label="출발지" placeholder="출발지 (주소나 장소)" value="${here ? '내 위치' : ''}">
      ${here ? `<button type="button" class="jf-here" id="jHere" aria-label="내 위치에서 출발" title="내 위치">${PIN}</button>` : ''}
      <ul class="jf-list" id="jFromList" hidden></ul></div>
    <div class="jf jrow"><i class="jdot to" aria-hidden="true"></i>
      <input id="jTo" type="text" autocomplete="off" aria-label="도착지" placeholder="어디로 갈까요?">
      <ul class="jf-list" id="jToList" hidden></ul></div>
    <button type="button" class="jswap" id="jSwap" aria-label="출발지와 도착지 바꾸기" title="바꾸기">${SWAP}</button>
  </div>
  <div class="jopts" role="group" aria-label="출발 시각">
    <div class="segmented jf-when"><button type="button" data-when="now" aria-pressed="true">지금 출발</button><button type="button" data-when="later" aria-pressed="false">시간 지정</button></div>
    <div class="jf-at" hidden>
      <select id="jDay" aria-label="날짜"><option value="0">오늘</option><option value="1">내일</option></select>
      <input id="jTime" type="time" aria-label="출발 시각" step="300">
    </div>
  </div>
  <div class="jf-status" id="jStatus" role="status" aria-live="polite"></div>
  <div id="jResult"></div>
</div>`;
  }

  const pad = n => String(n).padStart(2, '0');
  function whenSet(later, at = '') {
    document.querySelectorAll('.jf-when button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.when === 'later') === later)));
    document.querySelector('.jf-at').hidden = !later;
    const day = document.getElementById('jDay'), time = document.getElementById('jTime');
    if (at) {
      const d = new Date(at), today = new Date();
      day.value = d.toDateString() === today.toDateString() ? '0' : '1';
      time.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else if (later && !time.value) {
      const d = new Date(Date.now() + 15 * 60e3);   // a quarter of an hour from now, on the 5 minutes
      time.value = `${pad(d.getHours())}:${pad(Math.floor(d.getMinutes() / 5) * 5)}`;
      day.value = d.toDateString() === new Date().toDateString() ? '0' : '1';   // past midnight: 내일
    }
  }
  function whenValue() {
    if (document.querySelector('.jf-at').hidden) return '';
    const t = document.getElementById('jTime').value;
    if (!t) return '';
    const d = new Date(); d.setDate(d.getDate() + +document.getElementById('jDay').value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${t}`;
  }

  function bindPlace(which) {
    const input = document.getElementById(which === 'from' ? 'jFrom' : 'jTo');
    const list = document.getElementById(which === 'from' ? 'jFromList' : 'jToList');
    let timer = 0, seq = 0;
    input.addEventListener('input', () => {
      picked[which] = null;
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { list.hidden = true; return; }
      timer = setTimeout(async () => {
        const my = ++seq, c = map.getCenter();
        try {
          const r = await fetch(`./api/place?q=${encodeURIComponent(q)}&near=${c.lat.toFixed(5)},${c.lng.toFixed(5)}`);
          const d = await r.json();
          if (my !== seq) return;
          list.replaceChildren();
          if (!d.ok) { list.innerHTML = `<li class="jf-empty">${esc(d.error || '검색하지 못했어요')}</li>`; list.hidden = false; return; }
          if (!d.places.length) { list.innerHTML = '<li class="jf-empty">찾는 곳이 없어요</li>'; list.hidden = false; return; }
          for (const p of d.places) {
            const li = document.createElement('li'), b = document.createElement('button');
            b.type = 'button';
            b.innerHTML = `<b>${esc(p.name)}</b><small>${esc(p.address)}</small>`;
            b.onclick = () => { picked[which] = p; input.value = p.name; list.hidden = true; next(which); };
            li.append(b); list.append(li);
          }
          list.hidden = false;
        } catch { if (my === seq) { list.innerHTML = '<li class="jf-empty">검색하지 못했어요</li>'; list.hidden = false; } }
      }, 300);
    });
  }

  // the start is known: a picked place, or 내 위치 while it is there
  const fromOf = () => picked.from || (document.getElementById('jFrom').value.trim() === '내 위치' && myLocation() ? {lat: myLocation()[1], lng: myLocation()[0]} : null);
  function next(which) {
    if (fromOf() && picked.to) { go(); return; }
    const empty = !fromOf() ? 'jFrom' : 'jTo';
    if (which) document.getElementById(empty).focus();
  }
  // results up: the form folds into one line; tap it to change the trip
  function fold(on) {
    const j = document.querySelector('.journey'); if (!j) return;
    j.classList.toggle('done', on);
    const sum = document.getElementById('jSum');
    sum.hidden = !on;
    if (on) {
      const at = whenValue(), t = at ? `${document.getElementById('jDay').value === '1' ? '내일 ' : ''}${at.slice(11)} 출발` : '지금 출발';
      sum.innerHTML = `<span class="jsum-trip"><i class="jdot from"></i><b>${esc(document.getElementById('jFrom').value)}</b><span class="jsum-arrow">→</span><i class="jdot to"></i><b>${esc(document.getElementById('jTo').value)}</b></span><span class="jsum-meta">${esc(t)} · <u>바꾸기</u></span>`;
      sum.setAttribute('aria-label', `${document.getElementById('jFrom').value}에서 ${document.getElementById('jTo').value}까지, ${t}. 눌러서 바꾸기`);
    }
  }

  function legHTML(l) {
    if (l.type === 'walk') {
      return `<li class="jl walk"><span class="jl-time"></span><span class="jl-dot"></span><div><b>걷기 ${min(l.seconds)}분</b><small>${esc(l.label)} · ${Math.round(l.metres / 10) * 10}m</small></div></li>`;
    }
    if (l.type === 'bus') {
      return `<li class="jl ride bus" style="--c:${l.color}"><span class="jl-time">${esc(l.departs)}</span><span class="jl-dot"></span><div>
      <b>${esc(l.from)}에서 <span class="jl-bus">${esc(l.route)}</span>번 버스 타기</b>
      <small>${esc(l.toward)} 방면 · ${esc(l.to)} ${esc(l.arrives)} 도착 · ${l.stops}정류장${l.wait > 60 ? ` · ${min(l.wait)}분 기다림` : ''}</small>
      ${l.alts?.length ? `<small class="jl-alts">같은 길: ${l.alts.map(a => `<span class="jl-bus">${esc(a)}</span>`).join(' ')}</small>` : ''}
      <span class="jl-est">시간표 기준 예상</span></div></li>`;
    }
    const c = colors[l.line] || '#888';
    const dest = l.destination ? `${esc(l.destination)}행` : esc(l.direction || '');
    const live = l.realtime ? `<span class="jl-live">실시간 · 지금 ${esc(l.trainNow)}</span>` : `<span class="jl-est">배차 간격 기준 예상</span>`;
    return `<li class="jl ride" style="--c:${c}"><span class="jl-time">${esc(l.departs)}</span><span class="jl-dot"></span><div>
      <b>${esc(l.from)}역에서 ${esc(l.line)} ${dest} 타기</b>
      <small>${esc(l.to)}역 ${esc(l.arrives)} 도착 · ${l.stops}정거장${l.wait > 60 ? ` · ${min(l.wait)}분 기다림` : ''}</small>${live}</div></li>`;
  }

  function planHTML(p, i) {
    const tag = p.tag;
    const lines = chips(p);
    return `<article class="jp" data-i="${i}" tabindex="0" role="button" aria-label="${esc(tag || '경로')} ${p.minutes}분, 지도에서 보기">
  <div class="jp-lines">${lines}</div>
  <header>${tag ? `<span class="jp-tag">${esc(tag)}</span>` : ''}<strong>${p.minutes}분</strong><span>${esc(p.leaveBy)} 출발 → ${esc(p.arrives)} 도착</span></header>
  <p class="jp-meta">환승 ${p.transfers}번 · 걷기 ${p.walkMinutes}분</p>
  <ol class="jl-list">${p.legs.map(legHTML).join('')}</ol>
</article>`;
  }

  function chips(p) {
    return p.legs.filter(l => l.type !== 'walk').map(l => l.type === 'bus'
      ? `<span class="jp-line bus" style="--c:${l.color}">${esc(l.route)}${l.alts?.length ? ` <i>+${l.alts.length}</i>` : ''}</span>`
      : `<span class="jp-line" style="--c:${colors[l.line] || '#888'}">${esc(l.line)}</span>`).join('') || '<span class="jp-line walk">걷기</span>';
  }

  const KINDS = [['all', '전체'], ['subway', '지하철'], ['bus', '버스'], ['mixed', '지하철+버스']];
  function render(d, sel) {
    const out = document.getElementById('jResult');
    const count = k => d.plans.filter(p => k === 'all' || p.kind === k).length;
    const tabs = KINDS.filter(([k]) => k === 'all' || count(k)).map(([k, name]) =>
      `<button type="button" class="jt${(last.tab || 'all') === k ? ' on' : ''}" data-k="${k}" aria-pressed="${(last.tab || 'all') === k}">${name} <b>${count(k)}</b></button>`).join('');
    out.innerHTML = `<div class="jtabs" role="group" aria-label="경로 종류">${tabs}</div>` + d.plans.map(planHTML).join('') + '<p class="jp-note">경로를 누르면 지도에 보여요. 창을 닫아도 경로는 남아 있어요. 첫 열차는 실시간 위치로, 이후 열차는 배차 간격으로, 버스는 시간표로 계산한 예상 시간이에요.</p>';
    const cards = [...out.querySelectorAll('.jp')];
    const filter = k => {
      last.tab = k;
      out.querySelectorAll('.jt').forEach(b => { b.classList.toggle('on', b.dataset.k === k); b.setAttribute('aria-pressed', String(b.dataset.k === k)); });
      cards.forEach((c, i) => { c.hidden = !(k === 'all' || d.plans[i].kind === k); });
      if (cards[last.sel]?.hidden) { const i = cards.findIndex(c => !c.hidden); if (i >= 0) pick(i); }
    };
    out.querySelectorAll('.jt').forEach(b => b.addEventListener('click', () => filter(b.dataset.k)));
    const pick = i => { last.sel = i; cards.forEach((c, j) => c.classList.toggle('on', j === i)); showRoute?.(d.plans[i]); };
    cards.forEach((c, i) => {
      c.addEventListener('click', () => { if (last.sel === i && c.classList.contains('on')) closeSheet?.(); else pick(i); });
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } });
    });
    pick(sel);
    filter(last.tab || 'all');
    cards[last.sel]?.scrollIntoView?.({block: 'nearest'});
  }

  async function go() {
    const status = document.getElementById('jStatus'), out = document.getElementById('jResult');
    const from = fromOf(), to = picked.to, my = ++goSeq;
    const trip = {from: document.getElementById('jFrom').value, to: document.getElementById('jTo').value, picked: {...picked}};
    if (!from) { status.textContent = '출발지를 목록에서 골라 주세요.'; return; }
    if (!to) { status.textContent = '도착지를 목록에서 골라 주세요.'; return; }
    const at = whenValue();
    status.textContent = '경로를 찾는 중…'; out.replaceChildren(); fold(false);
    document.activeElement?.blur?.();   // phone keyboard down, so the results have the room
    try {
      const r = await fetch(`./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${at ? `&at=${encodeURIComponent(at)}` : ''}`);
      const d = await r.json();
      if (my !== goSeq || !out.isConnected) return;   // a newer search took over, or the sheet shows something else now
      if (!d.ok) { status.textContent = d.error || '경로를 찾지 못했어요. 출발지나 도착지를 바꿔 보세요.'; return; }
      status.textContent = '';
      last = {d, sel: 0, from: trip.from, to: trip.to, at, picked: trip.picked};
      render(d, 0);
      fold(true);
      const sh = out.closest('.sheet-body'); if (sh) sh.scrollTop = 0;   // the trip line and the tabs first
    } catch { if (my === goSeq) status.textContent = '경로를 찾지 못했어요. 잠시 뒤 다시 시도해 주세요.'; }
  }

  function open(fresh = false) {
    bar.hidden = true;
    openSheet(form());
    inSheet = true;
    bindPlace('from'); bindPlace('to');
    document.querySelectorAll('.jf-when button').forEach(b => b.addEventListener('click', () => { const later = b.dataset.when === 'later'; whenSet(later); if (!later) next(); }));
    for (const id of ['jDay', 'jTime']) document.getElementById(id).addEventListener('change', () => next());
    document.getElementById('jSum').addEventListener('click', () => { fold(false); document.getElementById('jTo').focus(); });
    document.getElementById('jSwap').addEventListener('click', () => {
      const f = document.getElementById('jFrom'), t = document.getElementById('jTo'), fp = fromOf();
      [f.value, t.value] = [t.value, f.value];
      [picked.from, picked.to] = [picked.to, fp && !picked.from ? {...fp, name: '내 위치'} : picked.from];
      next();
    });
    document.getElementById('jHere')?.addEventListener('click', () => { picked.from = null; document.getElementById('jFrom').value = '내 위치'; next('from'); });
    if (last) {   // back to the last search, as it was
      document.getElementById('jFrom').value = last.from;
      document.getElementById('jTo').value = last.to;
      whenSet(!!last.at, last.at);
      Object.assign(picked, last.picked);
      render(last.d, last.sel);
      fold(true);
    } else if (!fresh) document.getElementById('jTo').focus();
  }

  // from a station sheet: this station is one end; ask for the other
  function openWith(end, place) {
    last = null; picked.from = picked.to = null; clearRoute?.();
    open(true);
    const other = end === 'from' ? 'to' : 'from';
    picked[end] = place;
    document.getElementById(end === 'from' ? 'jFrom' : 'jTo').value = place.name;
    const o = document.getElementById(other === 'from' ? 'jFrom' : 'jTo');
    if (other === 'from' && o.value === '내 위치') { go(); return; }   // to here from where I am: straight to the routes
    o.value = ''; o.focus();
  }

  // the sheet was closed: keep the route and show the bar when it was ours; true if a route stays up
  function sheetClosed() {
    const was = inSheet; inSheet = false;
    if (!last || !was) return false;
    const p = last.d.plans[last.sel];
    bar.querySelector('.jbar-open').innerHTML = `<span class="jbar-lines">${chips(p)}</span><b>${p.minutes}분</b><span>${esc(p.leaveBy)} → ${esc(p.arrives)}</span><span class="jbar-more">결과 보기</span>`;
    bar.hidden = false;
    return true;
  }

  // another sheet (station, train) took the place of ours
  function sheetReplaced() { if (inSheet) { inSheet = false; if (last) sheetClosed(); } }

  button.addEventListener('click', () => open());
  return {open, openWith, sheetClosed, sheetReplaced};
}
