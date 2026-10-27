// 회원: 메뉴 [로그인] → 화면 위 로그인 팝업 / 로그인 뒤 이름 줄 → '내 정보' · [승차권] → 승차권 목록 · 발권 화면.
// 승차권 한 장 = 이름 · 출발지 → 도착지 · 출발 시각 · 타는 날 · 고른 경로(server/routes/members.py /api/me/tickets).
// 앞면: 이름 · 시각 · 점선 슝 로고 줄 · '○○권' 띠 · 일련번호 · 오늘 / 누르면 뒤집혀 뒷면: 갈아타는 곳 이어 쓰기(고른 경로 —
// 없으면 뒤집을 때 /api/route 로 계산) · 출발 시각 · 마그네틱 띠 · 타는 날 · 고치기.
// 발권 화면: 장소 칸 → 장소 고르기 쪽 · 경로 칸 → 경로 선택 쪽(/api/route 결과 · 기본은 가장 빠른 길).
// 로그인 방법이 하나도 설정되지 않았으면(/api/auth/providers 빈 목록 · 실패) 아무것도 보이지 않는다 — 로그인 안 한 화면은 지금과 같다.
// 본체가 지도를 다 띄운 뒤 import() 로 부른다(첫 화면 코드에 없음).
import {routeTrack} from '../lib/journey-ui.mjs';   // 경로 띠: 길찾기 결과와 같은 그림(본체가 이미 받은 파일)

const $ = id => document.getElementById(id);
const CHANGE = {'X-Requested-With': 'syung'};   // 바꾸는 요청에 붙이는 머리말(서버가 확인한다)
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];   // 1(월) … 7(일)
const LOGIN_ERRORS = {
  denied: '로그인을 취소했어요.',
  provider: '로그인 서비스가 답하지 않아요. 잠시 뒤 다시 해 주세요.',
  limit: '시도가 너무 많아요. 10분 뒤 다시 해 주세요.',
};
const PROVIDER_NAMES = {kakao: '카카오', google: '구글', apple: 'Apple'};
const KAKAO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7S17 4 12 4z" fill="#191919"/></svg>';
const GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.89 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>';
const APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 12.54c.03 3.27 2.87 4.36 2.9 4.38-.02.08-.45 1.55-1.49 3.07-.9 1.31-1.83 2.62-3.3 2.65-1.44.03-1.91-.86-3.56-.86-1.64 0-2.16.83-3.53.89-1.42.05-2.5-1.42-3.41-2.73C2.8 17.26 1.39 12.36 3.3 9.05a5.3 5.3 0 0 1 4.49-2.72c1.4-.03 2.72.94 3.56.94.83 0 2.4-1.16 4.04-.99.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.3 4.15ZM14.35 4.5c.76-.92 1.28-2.2 1.14-3.48-1.1.04-2.44.74-3.23 1.66-.7.81-1.32 2.11-1.15 3.35 1.23.1 2.48-.63 3.24-1.53Z"/></svg>';
const PROVIDERS = {kakao: ['카카오로 계속하기', KAKAO], google: ['구글로 계속하기', GOOGLE], apple: ['Apple로 계속하기', APPLE]};
// 점선 슝 로고(속도선 + 기차, 노랑 네모 없이) — 앞면에 5개를 가로로, 가운데 하나가 정가운데
const LOGO = '<svg viewBox="0 0 100 60"><g fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray=".3 2.3" stroke-linecap="round"><rect x="36" y="11" width="56" height="38" rx="19"/><rect x="40.5" y="15.5" width="47" height="29" rx="14.5"/><circle cx="74" cy="30" r="7.5"/><circle cx="74" cy="30" r="3.5"/><rect x="15" y="16" width="17" height="7" rx="3.5"/><rect x="8" y="26.5" width="24" height="7" rx="3.5"/><rect x="15" y="37" width="17" height="7" rx="3.5"/></g></svg>';

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const todayDay = () => (new Date().getDay() + 6) % 7 + 1;   // 1(월) … 7(일)
const daysText = days => days.length ? days.map(d => DAYS[d - 1]).join(' ') : '없음';
const shortName = name => name.length >= 7 ? `${name.slice(0, 3)}‥${name.slice(-2)}` : name;   // 긴 이름은 앞 3 ‥ 뒤 2

async function getJson(url) {
  const r = await fetch(url, {cache: 'no-store', credentials: 'same-origin'});
  return {status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null};
}
async function send(method, url, body) {
  const r = await fetch(url, {method, credentials: 'same-origin', headers: body ? {...CHANGE, 'Content-Type': 'application/json'} : CHANGE,
    body: body ? JSON.stringify(body) : undefined});
  return {status: r.status, ok: r.ok, body: r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null};
}

// 승차권 앞면. t: {id?, name, depart, days}
function frontHTML(t) {
  const name = t.name || '승차권';
  const serial = `${t.id ? String(t.id).padStart(4, '0') : '----'} ${t.days.map(d => DAYS[d - 1]).join('')} ${(t.depart || '').replace(':', '')}`;
  const today = t.id && t.days.includes(todayDay());
  return `<div class="tk-face tk-front"><div class="tk-logos"><div class="tk-logo-row">${LOGO.repeat(5)}</div></div>`
    + `<div class="tk-top"><b>${esc(name)}</b><b>${esc(t.depart || '--:--')}</b></div>`
    + `<div class="tk-strip">${`<span><img src="./brand/syung-light.svg" alt="">${esc(t.name ? `${name}권` : name)}</span>`.repeat(7)}</div>`   // 이름이 없으면 '승차권'(승차권권 아님)
    + `<div class="tk-serial">${esc(serial)}</div>${today ? '<span class="tk-today">오늘</span>' : ''}`
    + (t.id ? '<button class="tk-flip" type="button" aria-label="뒤집기">↻</button>' : '') + '</div>';
}
function ticketEl(t) {
  const el = document.createElement('div');
  el.className = 'ticket';
  el.innerHTML = `<div class="ticket-in">${frontHTML(t)}<div class="tk-face tk-back">`
    + `<p class="tk-chain wait"><span>${esc(shortName(t.from.name))}</span><em>→</em><span>${esc(shortName(t.to.name))}</span></p>`
    + `<p class="tk-time"><span>출발 시각</span><b>${esc(t.depart)}</b></p><div class="tk-mag"></div>`
    + `<div class="tk-foot"><span>타는 날 ${esc(daysText(t.days))}</span><button class="tk-edit" type="button">고치기 ›</button></div></div></div>`;
  return el;
}

// 뒷면 첫 줄: 승차권 출발지 → (마지막 빼고) 탄 구간마다 내린 곳 → 도착지 · 환승 N(없으면 바로).
// 발권할 때 고른 경로가 있으면 그 경로로(사용자 결정 2026-10-27), 없으면(옛 승차권) 그때 길을 찾아 가장 일찍 닿는 길로.
function chainHTML(t, legs) {
  const rides = legs.filter(l => l.type !== 'walk');
  const names = [t.from.name, ...rides.slice(0, -1).map(l => l.to), t.to.name];
  const tag = rides.length > 1 ? `환승 ${rides.length - 1}` : rides.length ? '바로' : '걸어서';
  return names.map(n => `<span title="${esc(n)}">${esc(shortName(n))}</span>`).join('<em>→</em>') + `<small>${tag}</small>`;
}
const chains = new Map();   // 승차권 번호 + 출발 · 도착 · 시각 → 그린 HTML(한 화면에서 다시 안 부름)
async function fillChain(t, p) {
  if (t.route) { p.innerHTML = chainHTML(t, t.route.legs); p.classList.remove('wait'); return; }
  const key = `${t.id}|${t.from.lat},${t.from.lng}|${t.to.lat},${t.to.lng}|${t.depart}`;
  if (chains.has(key)) { p.innerHTML = chains.get(key); p.classList.remove('wait'); return; }
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${t.depart}`;
  let html;
  try {
    const {status, body} = await getJson(`./api/route?from=${t.from.lat},${t.from.lng}&to=${t.to.lat},${t.to.lng}&at=${encodeURIComponent(at)}`);
    const plan = status === 200 && body?.ok ? body.plans?.[0] : null;
    if (!plan) throw new Error('no plan');
    html = chainHTML(t, plan.legs);
    chains.set(key, html);
  } catch {
    html = `<span>${esc(shortName(t.from.name))}</span><em>→</em><span>${esc(shortName(t.to.name))}</span><small>길을 찾지 못했어요</small>`;
  }
  p.innerHTML = html;
  p.classList.remove('wait');
}

function placeSearch(input, found, onPick) {
  let timer = 0, seq = 0;
  input.addEventListener('input', () => {
    onPick(null); clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { found.hidden = true; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      const row = text => { const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; return li; };
      try {
        const {body} = await getJson(`./api/place?q=${encodeURIComponent(q)}`);
        if (my !== seq) return;
        if (!body?.ok) found.replaceChildren(row('검색하지 못했어요'));
        else if (!body.places.length) found.replaceChildren(row('찾는 곳이 없어요'));
        else found.replaceChildren(...body.places.map(p => {
          const li = document.createElement('li'), b = document.createElement('button'), name = document.createElement('b'), addr = document.createElement('small');
          b.type = 'button'; name.textContent = p.name; addr.textContent = p.address; b.append(name, addr);
          b.onclick = () => { input.value = p.name; found.hidden = true; onPick({name: p.name, lat: p.lat, lng: p.lng}); };
          li.append(b); return li;
        }));
        found.hidden = false;
      } catch { if (my === seq) { found.replaceChildren(row('검색하지 못했어요')); found.hidden = false; } }
    }, 300);
  });
}

export async function initAccount({colors = {}} = {}) {   // colors: 노선 이름 → 색(본체)
  const item = $('accountItem'), sheet = $('loginSheet');
  if (!item || !sheet) return;
  // 로그인 방법과 지금 로그인한 사람을 한 번에 받는다(/api/me 를 따로 물으면 메뉴 칸이 한 번 더 늦게 뜨고,
  // 로그인이 꺼진 운영에서는 방문자마다 404 가 하나 더 찍힌다)
  let answer = null;
  try { answer = await getJson('./api/auth/providers'); } catch { return; }
  const providers = answer.status === 200 ? answer.body?.providers || [] : [];
  if (!providers.length) return;   // 설정 전: 메뉴 칸을 숨긴 채로

  const say = (id, text) => { $(id).textContent = text || ''; };
  // 알림은 모두 서랍 아래 토스트(잠깐 떴다 사라짐) — 결과 · 연결 오류 · 입력 확인(사용자 결정 2026-10-27). 입력 확인은 그 칸으로 포커스도 옮긴다
  let toastTimer = 0;
  const toastEl = $('accountToast');
  toastEl.onclick = () => { clearTimeout(toastTimer); toastEl.classList.remove('show'); setTimeout(() => { if (!toastEl.classList.contains('show')) toastEl.hidden = true; }, 160); };   // 누르면 바로 닫힘
  function toast(text, error = false) {
    const el = $('accountToast');
    el.innerHTML = `<span class="tt-speed" aria-hidden="true"><i></i><i></i></span><span>${esc(text)}</span>`;
    el.classList.toggle('is-error', error);   // '.error' 는 index.html 의 지도 오류 화면(inset:0)과 겹친다
    el.classList.remove('show'); el.hidden = false; void el.offsetWidth; el.classList.add('show');   // 연달아 떠도 매번 슝~ 들어온다
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 200);
    }, error ? 3600 : 2400);
  }
  let me = null, tickets = [], editing = null;

  // ---- 로그인 팝업(서랍 밖 화면 전체 위 — 열 때 서랍은 닫는다) ----
  $('accountProviders').replaceChildren(...providers.filter(p => PROVIDERS[p]).map(p => {
    const a = document.createElement('a');
    a.className = `social ${p}`; a.href = `./api/auth/${p}/start`; a.innerHTML = `${PROVIDERS[p][1]}<span>${PROVIDERS[p][0]}</span>`;
    return a;
  }));
  const sheetOpen = () => !sheet.hidden;
  function openSheet(message) {
    say('loginMsg', message);
    if ($('settingsPanel')?.classList.contains('open')) $('settingsClose').click();
    sheet.hidden = false; void sheet.offsetWidth; sheet.classList.add('open');
    sheet.querySelector('.social')?.focus({preventScroll: true});
  }
  function closeSheet() {
    sheet.classList.remove('open');
    setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 260);
    $('settingsButton')?.focus({preventScroll: true});
  }
  $('loginOpen').onclick = () => openSheet('');
  sheet.querySelector('.login-scrim').onclick = closeSheet;
  // 팝업이 떠 있는 동안 Esc 는 팝업을 닫고, Tab 은 팝업 안에서만 돈다
  window.addEventListener('keydown', e => {
    if (!sheetOpen()) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const items = [...sheet.querySelectorAll('a[href],button')].filter(el => el.offsetParent);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const inside = sheet.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
  }, true);

  // ---- 화면 상태 ----
  function show() {
    item.hidden = false;
    $('loginOpen').hidden = !!me; $('accountRow').hidden = !me; $('ticketsRow').hidden = !me;
    if (!me) return;
    const initial = [...me.name][0] || '나';
    $('accountAvatar').textContent = initial; $('accountAvatarBig').textContent = initial;
    $('accountItemName').textContent = me.name;
    $('accountName').textContent = me.name;
    $('accountProvider').textContent = PROVIDER_NAMES[me.provider] || me.provider;
  }
  function renderTickets() {
    $('ticketList').replaceChildren(...tickets.map(t => {
      const el = ticketEl(t);
      el.onclick = e => {
        if (e.target.closest('.tk-edit')) { e.stopPropagation(); openTicket(t); return; }
        el.classList.toggle('flipped');
        if (el.classList.contains('flipped')) fillChain(t, el.querySelector('.tk-chain'));
      };
      return el;
    }));
  }
  async function loadTickets() {
    try { const r = await getJson('./api/me/tickets'); if (r.status === 200) { tickets = r.body.tickets; renderTickets(); } } catch { /* 다음에 열 때 다시 */ }
  }
  // 발권 화면에서 ‹ 는 승차권 목록으로, 장소 고르기 · 경로 선택에서 ‹ 는 발권 화면으로(본체의 '메뉴로' 보다 먼저 잡는다)
  $('menuBack').addEventListener('click', e => {
    if (!$('menuPlace').hidden || !$('menuRoute').hidden) { e.stopImmediatePropagation(); backToForm(); }
    else if (!$('menuTicket').hidden) { e.stopImmediatePropagation(); $('ticketsRow').click(); }
  }, true);

  // ---- 발권 화면(어디서 → 어디로 → 언제 → 경로 → 타는 날 → 이름) ----
  const form = {from: null, to: null, route: null};
  let lastField = null;   // 장소 고르기 · 경로 선택에서 돌아오면 포커스를 둘 칸
  function backToForm() { $('ticketOpen').click(); lastField?.focus({preventScroll: true}); }
  const dayBox = $('ticketDays');
  dayBox.replaceChildren(...DAYS.map((label, index) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset.day = String(index + 1); b.setAttribute('aria-pressed', 'false');
    b.onclick = () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); daysChanged(); };
    return b;
  }));
  const pickedDays = () => [...dayBox.children].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => +b.dataset.day);
  function daysChanged() {
    const now = pickedDays().join(',');
    for (const b of $('ticketQuick').children) b.setAttribute('aria-pressed', String(b.dataset.quick === now));
    preview();
  }
  for (const b of $('ticketQuick').children) b.onclick = () => {
    const days = b.dataset.quick.split(',');
    for (const day of dayBox.children) day.setAttribute('aria-pressed', String(days.includes(day.dataset.day)));
    daysChanged();
  };
  function preview() {
    $('ticketPreview').innerHTML = `<div class="ticket"><div class="ticket-in">${frontHTML({id: editing?.id, name: $('ticketName').value.trim(),
      depart: $('ticketTime').value, days: pickedDays()})}</div></div>`;
  }
  $('ticketName').addEventListener('input', () => { $('ticketNameCount').textContent = `${[...$('ticketName').value].length}/12`; preview(); });

  function showPlaces() {
    for (const [id, place, empty] of [['ticketFrom', form.from, '출발지 고르기'], ['ticketTo', form.to, '도착지 고르기']]) {
      const b = $(id).querySelector('b');
      b.textContent = place?.name || empty; b.classList.toggle('ph', !place);
    }
  }
  function showTime() {
    const [h, m] = ($('ticketTime').value || '08:00').split(':').map(Number);
    $('ticketTimeText').innerHTML = `<em>${h < 12 ? '오전' : '오후'}</em> ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
  }
  function showRoute() {
    const r = form.route, b = $('ticketRoute');
    b.classList.toggle('empty', !r);
    b.innerHTML = r ? `${routeTrack(r, colors, 270)}<span class="pk"><b>${r.minutes}분</b> · ${esc(r.arrives)} 도착 · 환승 ${r.transfers}</span><u>바꾸기</u>`
      : `<span class="pk">경로 고르기</span><svg class="tf-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`;
    $('ticketSave').disabled = !r;
  }
  // 출발 · 도착 · 시각이 바뀌면 고른 경로는 풀린다(그 경로는 그 조건에서 찾은 것)
  function routeGone() {
    if (form.route) toast('출발 · 도착 · 시각이 바뀌어서 경로를 다시 골라 주세요', true);
    form.route = null; showRoute();
  }

  // 장소 고르기 쪽
  let placeFor = 'from';
  function openPlace(which) {
    placeFor = which; lastField = $(which === 'from' ? 'ticketFrom' : 'ticketTo');
    $('menuPlace').setAttribute('aria-label', which === 'from' ? '출발지 고르기' : '도착지 고르기');
    $('placeDot').classList.toggle('to', which === 'to');
    $('placeQuery').value = ''; $('placeList').hidden = true; $('placeList').replaceChildren();
    $('placeOpen').click();
    $('placeQuery').focus({preventScroll: true});
  }
  $('ticketFrom').onclick = () => openPlace('from');
  $('ticketTo').onclick = () => openPlace('to');
  placeSearch($('placeQuery'), $('placeList'), place => {
    if (!place) return;
    const before = form[placeFor];
    form[placeFor] = place;
    if (!before || before.lat !== place.lat || before.lng !== place.lng) routeGone();
    showPlaces(); backToForm();
  });
  $('ticketSwap').onclick = () => {
    [form.from, form.to] = [form.to, form.from];
    if (form.from || form.to) routeGone();
    showPlaces();
  };
  // 출발 시각 휠(사용자와 정한 시안 B): 오전/오후 · 시 · 분(5분 단위)을 돌려 가운데 띠에 맞춘다.
  // 돌리는 동안은 칸 · 미리보기만 바꾸고, 접을 때 시각이 바뀌었으면 고른 경로를 푼다(돌리는 중에 토스트가 연달아 뜨지 않게)
  const ROW = 40;   // 휠 한 칸 높이(syung.css .tw-col button)
  const wheelBox = $('ticketTimePick');
  const wheels = Object.fromEntries([...wheelBox.querySelectorAll('.tw-col')].map(el => [el.dataset.part, {el, values: [], label: String}]));
  const pad2 = n => String(n).padStart(2, '0');
  let timeAtOpen = '';
  const wheelIndex = w => Math.max(0, Math.min(w.values.length - 1, Math.round(w.el.scrollTop / ROW)));
  function markWheel(w) {
    const at = wheelIndex(w);
    [...w.el.children].forEach((b, index) => { b.className = index === at ? 'on' : Math.abs(index - at) === 1 ? 'near' : ''; });
    w.el.setAttribute('aria-valuetext', w.label(w.values[at]));
  }
  function setWheel(part, values, label, current) {
    const w = wheels[part];
    w.values = values; w.label = label;
    w.el.replaceChildren(...values.map((value, index) => {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.textContent = label(value);
      b.onclick = () => w.el.scrollTo({top: index * ROW, behavior: 'smooth'});
      return b;
    }));
    w.el.scrollTop = Math.max(0, values.indexOf(current)) * ROW;
    markWheel(w);
  }
  function wheelTime() {
    const value = part => wheels[part].values[wheelIndex(wheels[part])];
    return `${pad2(value('ampm') * 12 + value('hour') % 12)}:${pad2(value('minute'))}`;
  }
  for (const w of Object.values(wheels)) {
    let frame = 0;
    w.el.addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { markWheel(w); $('ticketTime').value = wheelTime(); showTime(); preview(); });
    }, {passive: true});
    w.el.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      w.el.scrollTo({top: (wheelIndex(w) + (e.key === 'ArrowDown' ? 1 : -1)) * ROW, behavior: 'smooth'});
    });
  }
  function openWheel() {
    const [h, m] = $('ticketTime').value.split(':').map(Number);
    timeAtOpen = $('ticketTime').value;
    wheelBox.hidden = false; $('ticketTimeBtn').setAttribute('aria-expanded', 'true');   // 보인 뒤에 스크롤 자리를 잡는다
    const minutes = Array.from({length: 12}, (_, index) => index * 5);
    if (!minutes.includes(m)) { minutes.push(m); minutes.sort((left, right) => left - right); }   // 예전 승차권의 08:13 같은 시각은 그대로 보여 준다
    setWheel('ampm', [0, 1], value => value ? '오후' : '오전', h < 12 ? 0 : 1);
    setWheel('hour', Array.from({length: 12}, (_, index) => index + 1), String, h % 12 || 12);
    setWheel('minute', minutes, pad2, m);
    wheels.hour.el.focus({preventScroll: true});
  }
  function closeWheel(changed = true) {
    if (wheelBox.hidden) return;
    wheelBox.hidden = true; $('ticketTimeBtn').setAttribute('aria-expanded', 'false');
    if (changed && $('ticketTime').value !== timeAtOpen) routeGone();
  }
  $('ticketTimeBtn').onclick = () => { if (wheelBox.hidden) openWheel(); else closeWheel(); };
  $('ticketTimeDone').onclick = () => { closeWheel(); $('ticketTimeBtn').focus({preventScroll: true}); };

  // 경로 선택 쪽: 고른 요일 중 가장 가까운 날(없으면 오늘 · 시각이 지났으면 다음 날)의 그 시각으로 길찾기
  function nextRide() {
    const days = pickedDays(), [h, m] = $('ticketTime').value.split(':').map(Number), now = new Date();
    for (let ahead = 0; ahead < 8; ahead++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, h, m);
      const weekday = (day.getDay() + 6) % 7 + 1;
      if (day > now && (!days.length || days.includes(weekday))) return day;
    }
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m);
  }
  // 저장하는 것: 띠를 그리고 뒷면을 쓰는 데 필요한 칸만(길 모양 path 같은 큰 칸은 뺀다)
  const slimLeg = l => l.type === 'walk' ? {type: 'walk', seconds: Math.max(0, Math.round(l.seconds || 0))}
    : {type: l.type, ...(l.type === 'bus' ? {route: l.route, color: l.color} : {line: l.line}), from: l.from, to: l.to,
      departs: l.departs, arrives: l.arrives, wait: Math.max(0, Math.round(l.wait || 0))};
  const slimRoute = p => ({tag: p.tag || '', minutes: p.minutes, leaveBy: p.leaveBy, arrives: p.arrives, transfers: p.transfers,
    walkMinutes: p.walkMinutes, legs: p.legs.map(slimLeg)});
  const rideSig = p => p.legs.filter(l => l.type !== 'walk').map(l => `${l.line || l.route}|${l.from}|${l.to}`).join('>');
  let plans = [], chosen = -1, routeSeq = 0;
  function drawPlans() {
    $('routeList').replaceChildren(...plans.map((p, index) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rt-plan'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(index === chosen));
      b.setAttribute('aria-label', `${p.tag || '경로'} ${p.minutes}분, ${p.arrives} 도착, 환승 ${p.transfers}번`);
      b.innerHTML = `<i class="rt-radio" aria-hidden="true"></i><span class="rt-b"><span class="jp-top"><strong class="jp-min">${p.minutes}<small>분</small></strong>`
        + `<span class="jp-arr">${esc(p.arrives)} 도착</span>${p.tag ? `<span class="jp-tag">${esc(p.tag)}</span>` : ''}</span>`
        + `${routeTrack(p, colors, 250)}<span class="jp-meta">${esc(p.leaveBy)} 출발 · 환승 ${p.transfers}번 · 걷기 ${p.walkMinutes}분</span></span>`;
      // 다시 그리지 않고 표시만 바꾼다 — 누른 버튼이 문서에서 빠지면 본체의 '서랍 밖을 눌렀나' 검사가 서랍을 닫는다
      b.onclick = () => { chosen = index; for (const [other, el] of [...$('routeList').children].entries()) el.setAttribute('aria-checked', String(other === chosen)); };
      return b;
    }));
    $('routePick').hidden = !plans.length;
  }
  async function openRoute() {
    lastField = $('ticketRoute');
    if (!form.from || !form.to) { toast('출발지 · 도착지를 먼저 골라 주세요', true); $(form.from ? 'ticketTo' : 'ticketFrom').focus(); return; }
    const when = nextRide(), pad = n => String(n).padStart(2, '0');
    $('routeTrip').textContent = `${form.from.name} → ${form.to.name}`;
    $('routeWhen').textContent = `${when.getMonth() + 1}월 ${when.getDate()}일(${DAYS[(when.getDay() + 6) % 7]}) ${$('ticketTimeText').textContent} 출발 기준`;
    plans = []; chosen = -1; drawPlans(); say('routeMsg', '경로를 찾는 중…');
    $('routeOpen').click();
    const my = ++routeSeq;
    const at = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
    try {
      const {status, body} = await getJson(`./api/route?from=${form.from.lat},${form.from.lng}&to=${form.to.lat},${form.to.lng}&at=${encodeURIComponent(at)}`);
      if (my !== routeSeq) return;
      if (status !== 200 || !body?.ok || !body.plans?.length) { say('routeMsg', body?.error || '경로를 찾지 못했어요.'); return; }
      plans = body.plans;
      const mine = form.route ? plans.findIndex(p => rideSig(p) === rideSig(form.route)) : -1;
      const fastest = plans.findIndex(p => p.tag === '가장 빠른 길');
      chosen = mine >= 0 ? mine : Math.max(0, fastest);   // 기본은 가장 빠른 길(사용자 결정 2026-10-27)
      say('routeMsg', ''); drawPlans();
      $('routeList').children[chosen]?.focus({preventScroll: true});
    } catch { if (my === routeSeq) say('routeMsg', '경로를 찾지 못했어요. 연결을 확인해 주세요.'); }
  }
  $('ticketRoute').onclick = openRoute;
  $('routePick').onclick = () => {
    if (!plans[chosen]) return;
    form.route = slimRoute(plans[chosen]);
    showRoute(); backToForm();
  };

  let deleteArmed = false;
  function openTicket(t) {
    editing = t || null; deleteArmed = false; lastField = null;
    $('menuTicket').setAttribute('aria-label', t ? '승차권 고치기' : '승차권 발권');
    $('ticketName').value = t?.name || '';
    $('ticketNameCount').textContent = `${[...$('ticketName').value].length}/12`;
    closeWheel(false); $('ticketTime').value = t?.depart || '08:00';
    form.from = t?.from || null; form.to = t?.to || null; form.route = t?.route || null;
    for (const b of dayBox.children) b.setAttribute('aria-pressed', String(t ? t.days.includes(+b.dataset.day) : false));
    $('ticketDelete').hidden = !t; $('ticketDelete').textContent = '이 승차권 지우기';
    showPlaces(); showTime(); showRoute(); daysChanged();
    $('ticketOpen').click();
  }
  $('ticketNew').onclick = () => openTicket(null);
  $('ticketForm').onsubmit = async e => {
    e.preventDefault();
    closeWheel();
    if (!form.route) return;   // 휠을 접으며 시각이 바뀌어 경로가 풀렸다(토스트로 알림)
    const body = {name: $('ticketName').value.trim(), from: form.from, to: form.to, depart: $('ticketTime').value, days: pickedDays(), route: form.route};
    if (!body.from || !body.to) { toast('출발지 · 도착지를 골라 주세요', true); $(body.from ? 'ticketTo' : 'ticketFrom').focus(); return; }
    if (!body.route) { toast('경로를 골라 주세요', true); $('ticketRoute').focus(); return; }
    if (!body.name) { toast('승차권 이름을 넣어 주세요', true); $('ticketName').focus(); return; }
    const save = $('ticketSave');
    save.disabled = true; save.textContent = '발권하는 중…';
    try {
      const r = editing ? await send('PUT', `./api/me/tickets/${editing.id}`, body) : await send('POST', './api/me/tickets', body);
      if (r.status === 401) { me = null; show(); toast('로그인이 끝났어요. 다시 로그인해 주세요.', true); return; }
      if (!r.ok) { toast(r.body?.error?.message || '발권하지 못했어요.', true); return; }
      const fixed = !!editing;
      await loadTickets();
      $('ticketsRow').click();
      toast(fixed ? '승차권을 고쳤어요' : '발권했어요');
    } catch { toast('발권하지 못했어요. 연결을 확인해 주세요.', true); }
    finally { save.textContent = '발권하기'; showRoute(); }   // showRoute 가 경로 유무로 버튼을 다시 연다
  };

  $('ticketDelete').onclick = async () => {
    if (!editing) return;
    if (!deleteArmed) { deleteArmed = true; $('ticketDelete').textContent = '한 번 더 누르면 지워요'; return; }
    try {
      const r = await send('DELETE', `./api/me/tickets/${editing.id}`);
      if (!r.ok && r.status !== 404) { toast('지우지 못했어요.', true); return; }
      await loadTickets();
      $('ticketsRow').click();
      toast('승차권을 지웠어요');
    } catch { toast('지우지 못했어요. 연결을 확인해 주세요.', true); }
  };

  // ---- 로그아웃 · 탈퇴 ----
  $('accountLogout').onclick = async () => {
    try { await send('POST', './api/auth/logout'); } catch { /* 쿠키는 서버가 지운다 */ }
    me = null; tickets = []; show(); $('menuBack').click(); toast('로그아웃했어요');
  };
  $('accountDelete').onclick = () => { $('accountConfirm').hidden = false; $('accountConfirmYes').focus({preventScroll: true}); };
  $('accountConfirmNo').onclick = () => { $('accountConfirm').hidden = true; };
  $('accountConfirmYes').onclick = async () => {
    try {
      const r = await send('DELETE', './api/me');
      if (!r.ok && r.status !== 401) { toast('탈퇴하지 못했어요. 잠시 뒤 다시 해 주세요.', true); return; }
      me = null; tickets = []; $('accountConfirm').hidden = true; show(); $('menuBack').click(); toast('탈퇴했어요');
    } catch { toast('탈퇴하지 못했어요. 연결을 확인해 주세요.', true); }
  };

  me = answer.body.me || null;
  show();
  if (me) await loadTickets();

  // 로그인에서 돌아옴(#login=ok · new · <오류>): 주소를 지우고 서랍 첫 화면을 연다 — 처음 가입이면 발권 화면으로 바로. 실패면 서랍 없이 팝업만
  const back = /(?:^#|&)login=(\w+)/.exec(location.hash);
  if (back) {
    history.replaceState(null, '', location.pathname + location.search);
    if (me) $('settingsButton')?.click();
    if (me && back[1] === 'new') openTicket(null);
    else if (!me) openSheet(LOGIN_ERRORS[back[1]] || '로그인이 끝나지 않았어요. 다시 해 주세요.');
  }
}
