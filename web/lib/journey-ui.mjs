// 길찾기: from a place (or my location) to a place, leaving now or at a set time.
// The sheet asks /api/place for places and /api/route for plans (server/journey.py).
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const min = s => Math.max(1, Math.round(s / 60));

export function initJourney({openSheet, map, colors, myLocation, button, showRoute}) {
  const picked = {from: null, to: null};

  function form() {
    const here = myLocation();
    return `<div class="journey">
  <h3>길찾기</h3>
  <div class="jf">
    <label for="jFrom">출발</label>
    <div class="jf-row"><input id="jFrom" type="text" autocomplete="off" placeholder="주소나 장소 (예: 강남역 스타벅스)" value="${here ? '내 위치' : ''}">
    ${here ? '<button type="button" class="jf-here" id="jHere">내 위치</button>' : ''}</div>
    <ul class="jf-list" id="jFromList" hidden></ul>
  </div>
  <div class="jf">
    <label for="jTo">도착</label>
    <input id="jTo" type="text" autocomplete="off" placeholder="어디로 갈까요?">
    <ul class="jf-list" id="jToList" hidden></ul>
  </div>
  <div class="jf jf-time">
    <label for="jAt">출발 시각</label>
    <input id="jAt" type="datetime-local">
    <span class="jf-hint">비워 두면 지금 출발</span>
  </div>
  <button type="button" class="jf-go" id="jGo">경로 찾기</button>
  <div class="jf-status" id="jStatus" role="status" aria-live="polite"></div>
  <div id="jResult"></div>
</div>`;
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
            b.onclick = () => { picked[which] = p; input.value = p.name; list.hidden = true; };
            li.append(b); list.append(li);
          }
          list.hidden = false;
        } catch { if (my === seq) { list.innerHTML = '<li class="jf-empty">검색하지 못했어요</li>'; list.hidden = false; } }
      }, 300);
    });
  }

  function legHTML(l) {
    if (l.type === 'walk') {
      const where = l.direct ? '목적지까지 걸어서' : l.to ? `${esc(l.to)}역${l.exit ? ` ${esc(l.exit)}번 출구` : ''}까지` : `${esc(l.from)}역${l.exit ? ` ${esc(l.exit)}번 출구` : ''}에서 목적지까지`;
      return `<li class="jl walk"><span class="jl-time"></span><span class="jl-dot"></span><div><b>걷기 ${min(l.seconds)}분</b><small>${where} · ${Math.round(l.metres / 10) * 10}m</small></div></li>`;
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
    const lines = p.legs.filter(l => l.type === 'ride').map(l => `<span class="jp-line" style="--c:${colors[l.line] || '#888'}">${esc(l.line)}</span>`).join('');
    return `<article class="jp" data-i="${i}" tabindex="0" role="button" aria-label="${esc(tag)} ${p.minutes}분, 지도에서 보기">
  <div class="jp-lines">${lines || '<span class="jp-line walk">걷기</span>'}</div>
  <header><span class="jp-tag">${tag}</span><strong>${p.minutes}분</strong><span>${esc(p.leaveBy)} 출발 → ${esc(p.arrives)} 도착</span></header>
  <p class="jp-meta">환승 ${p.transfers}번 · 걷기 ${p.walkMinutes}분</p>
  <ol class="jl-list">${p.legs.map(legHTML).join('')}</ol>
</article>`;
  }

  async function go() {
    const status = document.getElementById('jStatus'), out = document.getElementById('jResult');
    const here = myLocation();
    const from = picked.from || (document.getElementById('jFrom').value.trim() === '내 위치' && here ? {lat: here[1], lng: here[0]} : null);
    const to = picked.to;
    if (!from) { status.textContent = '출발지를 목록에서 골라 주세요.'; return; }
    if (!to) { status.textContent = '도착지를 목록에서 골라 주세요.'; return; }
    const at = document.getElementById('jAt').value;
    status.textContent = '경로를 찾는 중…'; out.replaceChildren();
    try {
      const r = await fetch(`./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${at ? `&at=${encodeURIComponent(at)}` : ''}`);
      const d = await r.json();
      if (!d.ok) { status.textContent = d.error || '경로를 찾지 못했어요. 출발지나 도착지를 바꿔 보세요.'; return; }
      status.textContent = '';
      out.innerHTML = d.plans.map(planHTML).join('') + '<p class="jp-note">경로를 누르면 지도에 보여요. 첫 열차는 실시간 위치로, 이후 열차는 배차 간격으로 계산한 예상 시간이에요.</p>';
      const cards = [...out.querySelectorAll('.jp')];
      const pick = i => { cards.forEach((c, j) => c.classList.toggle('on', j === i)); showRoute?.(d.plans[i]); };
      cards.forEach((c, i) => { c.addEventListener('click', () => pick(i)); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } }); });
      pick(0);
    } catch { status.textContent = '경로를 찾지 못했어요. 잠시 뒤 다시 시도해 주세요.'; }
  }

  function open() {
    openSheet(form());
    bindPlace('from'); bindPlace('to');
    document.getElementById('jHere')?.addEventListener('click', () => { picked.from = null; document.getElementById('jFrom').value = '내 위치'; });
    document.getElementById('jGo').addEventListener('click', go);
    document.getElementById('jTo').focus();
  }

  button.addEventListener('click', open);
  return {open};
}
