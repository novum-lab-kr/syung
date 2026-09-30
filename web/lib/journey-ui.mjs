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
  bar.innerHTML = '<button type="button" class="jbar-open" aria-label="경로 결과 다시 보기"></button><button type="button" class="jbar-x" aria-label="경로 지우기" title="경로 지우기"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
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
      ${here ? `<button type="button" class="jf-here" id="jHere" aria-label="내 위치에서 출발" title="내 위치">${PIN}</button>` : ''}</div>
    <div class="jf jrow"><i class="jdot to" aria-hidden="true"></i>
      <input id="jTo" type="text" autocomplete="off" aria-label="도착지" placeholder="어디로 갈까요?"></div>
    <button type="button" class="jswap" id="jSwap" aria-label="출발지와 도착지 바꾸기" title="바꾸기">${SWAP}</button>
  </div>
  <ul class="jf-list" id="jFromList" aria-label="출발지 찾기 결과" hidden></ul>
  <ul class="jf-list" id="jToList" aria-label="도착지 찾기 결과" hidden></ul>
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
      sum.innerHTML = `<span class="jsum-trip"><span class="jsum-end"><i class="jdot from"></i><b>${esc(document.getElementById('jFrom').value)}</b></span><span class="jsum-end"><i class="jdot to"></i><b>${esc(document.getElementById('jTo').value)}</b></span></span><span class="jsum-side"><span class="jsum-when">${esc(t)}</span><span class="jsum-edit">${EDIT}수정</span></span>`;
      sum.setAttribute('aria-label', `${document.getElementById('jFrom').value}에서 ${document.getElementById('jTo').value}까지, ${t}. 눌러서 바꾸기`);
    }
  }

  // ---- results: one row per route; a bar shows each part of the trip at its real share of the time
  const hm = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const legSecs = l => l.type === 'walk' ? l.seconds : Math.max(60, ((hm(l.arrives) - hm(l.departs) + 1440) % 1440) * 60);
  const legColor = l => l.type === 'bus' ? l.color : (colors[l.line] || '#888');
  const legName = l => l.type === 'bus' ? l.route : l.line;
  const legShort = l => l.type === 'bus' ? l.route : l.line.replace(/호선$/, '').replace(/선$/, '');
  // text on a line colour: dark on the light ones (수인분당, 에버라인…), white on the rest
  const inkOn = hex => { const n = parseInt(String(hex).slice(1), 16); if (Number.isNaN(n)) return '#fff';
    const [r, g, b] = [n >> 16, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    const L = .2126 * r + .7152 * g + .0722 * b;
    return 1.05 / (L + .05) >= (L + .05) / .057 ? '#fff' : '#141414'; };   // whichever reads better (#141414 ≈ L .007)
  const dur = m => m >= 60 ? `${Math.floor(m / 60)}<small>시간</small> ${m % 60}<small>분</small>` : `${m}<small>분</small>`;
  const WALK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="13" cy="4" r="2"/><path d="M10.2 7.6 7 9.4V13h2v-2.4l1.3-.7-1.6 8.1H11l1-4.3 2 2V21h2v-6.2l-2.1-2.1.6-3.1c1 1.3 2.5 2.1 4.2 2.2v-2c-1.4-.1-2.5-.9-3.1-2l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.6.1-.9.2z"/></svg>';
  const BUS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2zm0 3v5h14V6zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>';
  const EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';

  const textW = t => [...String(t)].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 11.5 : 7), 0);   // at the bar's 11.5px
  function track(p, width = 330) {
    const segs = [];
    for (const l of p.legs) {
      if (l.type !== 'walk' && l.wait > 30) segs.push({k: 'wait', s: l.wait});
      segs.push({k: l.type === 'walk' ? 'walk' : 'ride', s: legSecs(l), l});
    }
    const total = segs.reduce((a, g) => a + g.s, 0) || 1;
    return `<div class="jtrack" aria-hidden="true">${segs.map(g => {
      const px = g.s / total * width;
      if (g.k === 'walk') return `<i class="jseg walk" style="flex:${g.s} 1 0"></i>`;
      if (g.k === 'wait') return `<i class="jseg wait" style="flex:${g.s} 1 0"></i>`;
      // every ride keeps room for at least its short name (a one-stop hop is still a line to board); walks give way
      const c = legColor(g.l), full = legName(g.l), short = legShort(g.l), need = textW(short) + 12;
      const label = px >= textW(full) + 14 ? full : short;
      return `<i class="jseg ride${g.l.type === 'bus' ? ' bus' : ''}" style="flex:${g.s} 1 0;min-width:${need}px;--c:${c};--t:${inkOn(c)}">${g.l.type === 'bus' && px >= textW(full) + 34 ? BUS : ''}${esc(label)}</i>`;
    }).join('')}</div>`;
  }

  // the steps of the chosen route: places (with times) joined by rides and walks on a rail
  function steps(p) {
    const station = (l, n) => l.type === 'bus' ? n : `${n}역`;
    const items = [{n: 'start', name: last?.from || '출발', t: p.leaveBy, c: 'var(--syung)'}];
    for (const l of p.legs) {
      if (l.type === 'walk') { items.push({e: 'walk', l}); continue; }
      items.push({n: 'board', name: station(l, l.from), t: l.departs, c: legColor(l)}, {e: 'ride', l}, {n: 'alight', name: station(l, l.to), t: l.arrives, c: legColor(l)});
    }
    items.push({n: 'end', name: last?.to || '도착', t: p.arrives, c: 'var(--ink)'});
    const rows = [];
    for (let k = 0; k < items.length; k++) {   // two places in a row: one stop, where the change happens
      const a = items[k], b = items[k + 1];
      if (a.n && b?.n) { rows.push({n: 'change', name: a.name === b.name ? a.name : `${a.name} → ${b.name}`, t: a.t, t2: b.t, c: b.c}); k++; }
      else rows.push(a);
    }
    return `<ol class="jsteps">${rows.map(r => {
      if (r.n) return `<li class="js node ${r.n}" style="--c:${r.c}"><span class="js-t">${esc(r.t)}</span><span class="js-dot"></span><div class="js-b"><b>${esc(r.name)}</b>${r.n === 'change' ? `<small>갈아타기${r.t2 && r.t2 !== r.t ? ` · ${esc(r.t2)} 출발` : ''}</small>` : ''}</div></li>`;
      const l = r.l;
      if (r.e === 'walk') return `<li class="js walk"><span class="js-t"></span><span class="js-rail"></span><div class="js-b"><small>${WALK}걷기 ${min(l.seconds)}분 · ${Math.round(l.metres / 10) * 10}m${l.exit ? ` · ${esc(l.exit)}번 출구` : ''}</small></div></li>`;
      const c = legColor(l), toward = l.type === 'bus' ? `${esc(l.toward)} 방면` : (l.destination ? `${esc(l.destination)}행` : esc(l.direction || ''));
      const note = l.type === 'bus' ? (l.alts?.length ? `같은 길 ${l.alts.map(esc).join(' · ')}` : '시간표 기준') : (l.realtime ? `<span class="js-live">실시간 · 지금 ${esc(l.trainNow)}</span>` : '배차 간격 기준');
      return `<li class="js ride" style="--c:${c};--t:${inkOn(c)}"><span class="js-t"></span><span class="js-rail"></span><div class="js-b">
        <p><span class="js-chip">${l.type === 'bus' ? BUS : ''}${esc(legName(l))}</span>${toward}</p>
        <small>${l.stops}${l.type === 'bus' ? '정류장' : '정거장'}${l.wait > 60 ? ` · ${min(l.wait)}분 기다림` : ''} · ${note}</small></div></li>`;
    }).join('')}</ol>`;
  }

  function planHTML(p, i) {
    const live = p.legs.some(l => l.realtime);
    return `<article class="jp" data-i="${i}" tabindex="0" role="button" aria-label="${esc(p.tag || '경로')} ${p.minutes}분, ${esc(p.arrives)} 도착, 지도에서 보기">
  <div class="jp-top"><strong class="jp-min">${dur(p.minutes)}</strong><span class="jp-arr">${esc(p.arrives)} 도착</span>${p.tag ? `<span class="jp-tag">${esc(p.tag)}</span>` : ''}</div>
  ${track(p)}
  <p class="jp-meta">${esc(p.leaveBy)} 출발 · 환승 ${p.transfers}번 · 걷기 ${p.walkMinutes}분${live ? '<span class="jp-live">실시간</span>' : ''}</p>
  ${steps(p)}
</article>`;
  }

  const KINDS = [['all', '전체'], ['subway', '지하철'], ['bus', '버스'], ['mixed', '지하철+버스']];
  function render(d, sel) {
    const out = document.getElementById('jResult');
    const count = k => d.plans.filter(p => k === 'all' || p.kind === k).length;
    const kinds = KINDS.filter(([k]) => k !== 'all' && count(k));
    if (kinds.length < 2) last.tab = 'all';   // one kind only: nothing to filter
    const tabs = kinds.length < 2 ? '' : `<div class="segmented jkinds" role="group" aria-label="경로 종류">${KINDS.filter(([k]) => k === 'all' || count(k)).map(([k, name]) =>
      `<button type="button" data-k="${k}" aria-pressed="${(last.tab || 'all') === k}">${name}<b>${count(k)}</b></button>`).join('')}</div>`;
    out.innerHTML = tabs + `<div class="jplans">${d.plans.map(planHTML).join('')}</div>` + '<p class="jp-note">경로를 누르면 지도에 보여요. 창을 닫아도 경로는 남아 있어요. 첫 열차는 실시간 위치로, 이후 열차는 배차 간격으로, 버스는 시간표로 계산한 예상 시간이에요.</p>';
    const cards = [...out.querySelectorAll('.jp')];
    const filter = k => {
      last.tab = k;
      out.querySelectorAll('.jkinds button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
      cards.forEach((c, i) => { c.hidden = !(k === 'all' || d.plans[i].kind === k); });
      if (cards[last.sel]?.hidden) { const i = cards.findIndex(c => !c.hidden); if (i >= 0) pick(i); }
    };
    out.querySelectorAll('.jkinds button').forEach(b => b.addEventListener('click', () => filter(b.dataset.k)));
    const pick = i => { last.sel = i; cards.forEach((c, j) => { c.classList.toggle('on', j === i); c.setAttribute('aria-expanded', String(j === i)); }); showRoute?.(d.plans[i]); };
    cards.forEach((c, i) => {
      c.addEventListener('click', () => { if (last.sel === i && c.classList.contains('on')) closeSheet?.(); else pick(i); });
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } });
    });
    pick(sel);
    filter(last.tab || 'all');
  }

  // while the routes are worked out (a few seconds): the rows they will fill, 슝 running along the first
  const LOADING = `<div class="jload" aria-hidden="true">${[0, 1, 2].map(i => `<div class="jsk"><i class="jsk-min"></i><div class="jsk-track">${i === 0 ? '<span class="jsk-run"><i></i></span>' : ''}</div><i class="jsk-meta"></i></div>`).join('')}</div>`;
  function failed(out, msg) {
    const status = document.getElementById('jStatus');
    if (status) { status.textContent = `경로를 찾지 못했어요. ${msg}`; status.classList.add('sr'); }   // announced; the card below shows it
    out.innerHTML = `<div class="jerr"><b>경로를 찾지 못했어요</b><p>${esc(msg)}</p><button type="button" class="jerr-retry">다시 찾기</button></div>`;
    out.querySelector('.jerr-retry').addEventListener('click', () => go());
  }

  async function go() {
    const status = document.getElementById('jStatus'), out = document.getElementById('jResult');
    const from = fromOf(), to = picked.to, my = ++goSeq;
    const trip = {from: document.getElementById('jFrom').value, to: document.getElementById('jTo').value, picked: {...picked}};
    if (!from) { status.textContent = '출발지를 목록에서 골라 주세요.'; return; }
    if (!to) { status.textContent = '도착지를 목록에서 골라 주세요.'; return; }
    const at = whenValue();
    status.classList.remove('sr'); status.textContent = '경로를 찾고 있어요'; out.innerHTML = LOADING; fold(false);
    document.activeElement?.blur?.();   // phone keyboard down, so the results have the room
    try {
      const r = await fetch(`./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${at ? `&at=${encodeURIComponent(at)}` : ''}`);
      const d = await r.json();
      if (my !== goSeq || !out.isConnected) return;   // a newer search took over, or the sheet shows something else now
      if (!d.ok) { failed(out, d.error || '출발지나 도착지를 바꿔 보세요.'); return; }
      status.textContent = '';
      last = {d, sel: 0, from: trip.from, to: trip.to, at, picked: trip.picked};
      render(d, 0);
      fold(true);
      const sh = out.closest('.sheet-body'); if (sh) sh.scrollTop = 0;   // the trip line and the tabs first
    } catch { if (my === goSeq && out.isConnected) { failed(out, '연결이 불안정해요. 잠시 뒤 다시 찾아 주세요.'); } }
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
    bar.querySelector('.jbar-open').innerHTML = `<span class="jbar-top"><b>${dur(p.minutes)}</b><span>${esc(p.arrives)} 도착</span></span>${track(p, 240)}`;
    bar.hidden = false;
    return true;
  }

  // another sheet (station, train) took the place of ours
  function sheetReplaced() { if (inSheet) { inSheet = false; if (last) sheetClosed(); } }

  button.addEventListener('click', () => open());
  return {open, openWith, sheetClosed, sheetReplaced};
}
