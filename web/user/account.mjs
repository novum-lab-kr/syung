// 회원: 메뉴 [로그인] → 화면 위 로그인 팝업 / 로그인 뒤 이름 줄 → '내 정보' · [승차권] → 승차권 목록 · 발권 화면.
// 승차권 한 장 = 이름 · 출발지 → 도착지 · 출발 시각 · 타는 날 · 고른 경로(server/routes/members.py /api/me/tickets).
// 앞면: 이름 · 시각 · 점선 슝 로고 줄 · '○○권' 띠 · 일련번호 · 오늘 / 누르면 뒤집혀 뒷면: 갈아타는 곳 이어 쓰기(고른 경로 —
// 없으면 뒤집을 때 /api/route 로 계산) · 출발 시각 · 마그네틱 띠 · 타는 날 · 고치기.
// 발권 화면: 장소 칸 → 장소 고르기 쪽 · 경로 칸 → 경로 선택 쪽(/api/route 결과 · 기본은 가장 빠른 길).
// 내 정보(2026-10-27): 닉네임 고치기 · 프로필 사진 올리기 · 캐릭터 고르기(server/routes/members.py /api/me/profile · /api/me/avatar).
// 사진은 브라우저에서 가운데를 정사각 256×256 으로 잘라 다시 그려(WebP, 안 되면 JPEG) 올린다 — 다시 그리면 위치(GPS) 같은 사진 정보가 빠진다.
// 내 정보 아래 내 통계 · 계정 칸(2026-10-27 계획서 D1~D6): 내 정보를 열 때만 /api/me/stats · /api/me/sessions 를 받는다.
// 내 통계 = 함께한 날 · 승차권 · 최근 30일 사용(슝 연 날 · 길찾기 · 승차권 본 번) · 이번 달 예상 교통비(승차권대로 다 탄다고 가정).
// 계정 = 로그인한 기기(종류 · 마지막 사용 · 하나씩 로그아웃 · 다른 기기 모두) · 내 데이터 내려받기(JSON 파일).
// 사용 횟수는 로그인했을 때만 종류만 보낸다(장소 · 검색어 · 시각 없음): 슝을 열 때 open · 길찾기 결과(journey-ui 의 'syung:route') route ·
// 승차권 뒷면을 볼 때 ticket.
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

// 프로필 캐릭터(내 위치 캐릭터 — web/map/avatars/). 얼굴 그림은 web/brand/faces/<이름>-84 · 240.png(tools/avatar_face/make.sh).
// 첫째(새싹)가 기본 — 고르면 서버에는 '기본으로'(DELETE)를 보낸다
const CHARACTERS = [['sprout', '새싹 볼빵 후디'], ['builder', '꼬마 건설 반장'], ['seonbi', '갓 쓴 꼬마 선비'], ['visitor', '두근두근 나들이'],
  ['scv', '테란 SCV'], ['drone', '저그 드론'], ['probe', '프로토스 프로브']];
const PHOTO_URL = /^\/api\/me\/avatar\/[\w-]{32}\.(?:webp|jpg)$/;   // 서버가 주는 내 사진 주소 모양(그 밖은 그리지 않는다)
const PHOTO_SIDE = 256, PHOTO_MAX = 150 * 1024;   // 서버 한도(160 KB)보다 조금 작게
const NAME_MAX = 12;
const nameLength = text => [...text.trim()].length;
const won = n => `${n.toLocaleString('ko-KR')}원`;
const monthDay = seconds => { const d = new Date(seconds * 1000); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const FARE_REASONS = {route: '고른 경로가 없는 승차권', distance: '공식 거리 자료가 없는 노선', outside: '수도권 밖 구간',
  bus: '요금 · 거리 자료가 없는 버스', none: '전철 · 버스를 타지 않는 승차권'};

// 칸(el)에 프로필을 그린다: 올린 사진이면 칸을 꽉 채우고(.photo), 아니면 캐릭터 얼굴(.face). big: 내 정보의 큰 칸(240 그림)
function paintAvatar(el, avatar, big = false) {
  const photo = avatar?.type === 'photo' && PHOTO_URL.test(avatar.url);
  const id = avatar?.type === 'character' && CHARACTERS.some(([key]) => key === avatar.id) ? avatar.id : 'sprout';
  el.classList.toggle('photo', photo);
  el.classList.toggle('face', !photo);
  // 기본 새싹 · 작은 칸은 CSS 의 image-set(28 · 56 · 84) 그대로
  el.style.backgroundImage = photo ? `url("${avatar.url}")` : (big || id !== 'sprout') ? `url("./brand/faces/${id}-${big ? 240 : 84}.png")` : '';
}
const toBlob = (canvas, type, quality) => new Promise(done => canvas.toBlob(done, type, quality));
// 고른 사진 → 가운데 정사각 256×256 WebP(안 되는 브라우저는 JPEG) Blob. 다시 그리므로 원본의 사진 정보(Exif · 위치)는 따라가지 않는다
async function shrinkPhoto(file) {
  const image = await createImageBitmap(file, {imageOrientation: 'from-image'});   // 휴대폰 사진의 회전 정보는 그리기 전에 반영
  const side = Math.min(image.width, image.height);
  let source = image, sx = (image.width - side) / 2, sy = (image.height - side) / 2, from = side;
  if (side > PHOTO_SIDE * 4) {   // 아주 큰 사진은 한 번 줄였다가 다시 줄인다(한 번에 줄이면 거칠어진다)
    const step = document.createElement('canvas');
    step.width = step.height = PHOTO_SIDE * 4;
    const stepContext = step.getContext('2d');
    stepContext.imageSmoothingQuality = 'high';
    stepContext.drawImage(image, sx, sy, side, side, 0, 0, step.width, step.height);
    source = step; sx = 0; sy = 0; from = step.width;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PHOTO_SIDE;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);   // 투명한 곳은 흰 바탕(JPEG 는 투명이 없다)
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, sx, sy, from, from, 0, 0, PHOTO_SIDE, PHOTO_SIDE);
  image.close?.();
  for (const quality of [.86, .72, .55]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);   // 사파리는 WebP 로 못 그린다(PNG 가 나온다)
    if (blob?.type === 'image/jpeg') {
      // 사파리 · 아이폰 JPEG 에 붙는 Exif(APP1) · APP13 조각을 뗀다 — 서버가 그런 JPEG 를 받지 않는다(올릴 때만 받는 파일)
      const {stripJpegMeta} = await import('./photo_meta.mjs');
      blob = new Blob([stripJpegMeta(new Uint8Array(await blob.arrayBuffer()))], {type: 'image/jpeg'});
    }
    if (blob && blob.size <= PHOTO_MAX && (blob.type === 'image/webp' || blob.type === 'image/jpeg')) return blob;
  }
  throw new Error('too big');
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const todayDay = () => (new Date().getDay() + 6) % 7 + 1;   // 1(월) … 7(일)
const daysText = days => days.length ? days.map(d => DAYS[d - 1]).join(' ') : '없음';
const shortName = name => name.length >= 7 ? `${name.slice(0, 3)}‥${name.slice(-2)}` : name;   // 긴 이름은 앞 3 ‥ 뒤 2
// 장소 검색(카카오)의 역 이름은 '잠실역 2호선'처럼 호선이 붙어 온다 — 뒷면에는 역 이름만(사용자 2026-10-27). 저장된 이름은 그대로
const stationOnly = name => name.replace(/^(.+역)\s+\S*선$/, '$1');

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
  const names = [stationOnly(t.from.name), ...rides.slice(0, -1).map(l => l.to), stationOnly(t.to.name)];
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
  // 알림 상자(#accountToast, aria-live)는 늘 문서에 두고 카드만 넣고 뺀다 — 숨긴 상자에 글을 넣으면 화면 낭독기가 놓친다
  const toastBox = $('accountToast');
  function hideToast(card) {
    card.classList.remove('show');
    setTimeout(() => { if (toastBox.firstChild === card && !card.classList.contains('show')) toastBox.replaceChildren(); }, 200);
  }
  function toast(text, error = false) {
    const card = document.createElement('div');
    card.className = error ? 'acct-toast is-error' : 'acct-toast';   // '.error' 는 index.html 의 지도 오류 화면(inset:0)과 겹친다
    card.innerHTML = `<span class="tt-speed" aria-hidden="true"><i></i><i></i></span><span>${esc(text)}</span>`;
    card.onclick = () => { clearTimeout(toastTimer); hideToast(card); };   // 누르면 바로 닫힘
    toastBox.replaceChildren(card); void card.offsetWidth; card.classList.add('show');   // 연달아 떠도 매번 슝~ 들어온다
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hideToast(card), error ? 3600 : 2400);
  }
  let me = null, tickets = [], editing = null;

  // ---- 로그인 팝업(서랍 밖 화면 전체 위 — 열 때 서랍은 닫는다) ----
  $('accountProviders').replaceChildren(...providers.filter(p => PROVIDERS[p]).map(p => {
    const a = document.createElement('a');
    a.className = `social ${p}`; a.href = `./api/auth/${p}/start`; a.innerHTML = `${PROVIDERS[p][1]}<span>${PROVIDERS[p][0]}</span>`;
    return a;
  }));
  const sheetOpen = () => !sheet.hidden;
  // 로그인 팝업 로고 움직임(Lottie): 새싹 캐릭터가 뛰어와 로고 열차에 올라타고 출발(2초 · 사용자 결정 2026-10-27).
  // 팝업을 열 때만 플레이어(web/vendor/lottie — lottie-web 5.13.0 light, svg 렌더러만)와 움직임 JSON
  // (web/brand/login-motion.json — tools/login_motion/make.mjs 가 만든다)을 받는다 — 첫 화면 코드에 없음.
  // 캔버스는 팝업 위쪽 넓은 영역(800×170) — 그 안의 로고 칸 가운데(400, 135)를 실제 로고 가운데에 맞춰 얹는다.
  // 동작 줄이기 · 받기 실패면 정지 로고 그대로. 한 번만 재생하고 끝나면 정지 로고로 바꿔 낀다
  let motionData = null;
  const MOTION = {width: 800, height: 170, slotX: 400, slotY: 135, wait: 220};   // wait: 카드가 올라오는 동안(.26 초) 기다렸다 재생
  let motionAnim = null, motionTurn = 0, motionTimer = 0;
  function stopLogoMotion() {
    motionTurn++; clearTimeout(motionTimer);
    motionAnim?.destroy(); motionAnim = null;
    sheet.querySelector('.login-motion')?.remove();
    sheet.querySelector('.login-brand').style.visibility = '';
  }
  async function playLogoMotion() {
    stopLogoMotion();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const turn = motionTurn, openedAt = performance.now();
    try {
      if (!globalThis.lottie) await import('../vendor/lottie/lottie_light.min.js');   // UMD: 받으면 globalThis.lottie 가 생긴다
      if (!motionData) {
        const res = await fetch(new URL('../brand/login-motion.json', import.meta.url));
        if (!res.ok) return;
        motionData = await res.json();
      }
    } catch { return; }
    if (turn !== motionTurn || !globalThis.lottie || !sheet.classList.contains('open')) return;   // 그사이 닫았거나 다시 열었다
    const logo = sheet.querySelector('.login-brand'), box = document.createElement('div');
    box.className = 'login-motion'; box.setAttribute('aria-hidden', 'true');
    box.style.left = `${logo.offsetLeft + logo.offsetWidth / 2 - MOTION.slotX}px`;   // 카드(.login-card, position:relative) 기준
    box.style.top = `${logo.offsetTop + logo.offsetHeight / 2 - MOTION.slotY}px`;
    logo.after(box);
    // 플레이어가 받은 자료를 고쳐 쓰므로 매번 복사본을 넘긴다. 첫 장면을 바로 깔고(로고 자리는 비움 · 자리 크기는 그대로) 잠깐 뒤 재생
    const anim = motionAnim = globalThis.lottie.loadAnimation({container: box, renderer: 'svg', loop: false, autoplay: false, animationData: structuredClone(motionData)});
    anim.goToAndStop(0, true);
    logo.style.visibility = 'hidden';
    anim.addEventListener('complete', () => { if (motionAnim === anim) stopLogoMotion(); });   // 마지막 장면 = 정지 로고 → 진짜 로고로
    motionTimer = setTimeout(() => { if (motionAnim === anim) anim.play(); }, Math.max(0, MOTION.wait - (performance.now() - openedAt)));
  }
  // 팝업 안 안내: 서랍 아래 토스트(#accountToast)는 팝업(화면 전체 위)에 가려서, 같은 토스트 모양 카드를 팝업 안에 둔다
  function openSheet(message, error = false) {
    const note = $('loginMsg');
    if (message) note.innerHTML = `<span class="acct-toast show${error ? ' is-error' : ''}"><span class="tt-speed" aria-hidden="true"><i></i><i></i></span><span>${esc(message)}</span></span>`;
    else note.replaceChildren();
    if ($('settingsPanel')?.classList.contains('open')) $('settingsClose').click();
    sheet.hidden = false; void sheet.offsetWidth; sheet.classList.add('open');
    sheet.querySelector('.social')?.focus({preventScroll: true});
    playLogoMotion();
  }
  function closeSheet() {
    stopLogoMotion();
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
    if (!me) { closeName(); closePick(); $('accountStats').hidden = true; $('accountSafe').hidden = true; accountSeq++; return; }
    paintAvatar($('accountAvatar'), me.avatar);   // 메뉴 내 정보 줄
    paintAvatar($('accountAvatarBig'), me.avatar, true);
    $('accountItemName').textContent = me.name;
    $('accountName').textContent = me.name;
    $('accountProvider').textContent = PROVIDER_NAMES[me.provider] || me.provider;
    markChoice();
  }

  // ---- 내 정보: 프로필 사진 · 캐릭터 고르기 ----
  const choices = $('avatarChoices');
  choices.append(...CHARACTERS.map(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pf-choice'; b.dataset.character = id; b.setAttribute('aria-label', label); b.title = label;
    b.onclick = () => pickCharacter(id);
    return b;
  }));
  function markChoice() {
    const avatar = me?.avatar;
    const current = avatar?.type === 'photo' ? 'photo' : avatar?.type === 'character' ? avatar.id : 'sprout';
    $('photoPick').setAttribute('aria-pressed', String(current === 'photo'));
    // 올린 사진이 있으면 사진 칸에 그 사진, 없으면 사진기 그림
    if (current === 'photo') paintAvatar($('photoPick'), avatar);
    else { $('photoPick').classList.remove('photo', 'face'); $('photoPick').style.backgroundImage = ''; }
    for (const b of choices.querySelectorAll('[data-character]')) b.setAttribute('aria-pressed', String(b.dataset.character === current));
  }
  function openPick() {
    closeName();
    for (const b of choices.querySelectorAll('[data-character]')) b.style.backgroundImage ||= `url("./brand/faces/${b.dataset.character}-240.png")`;   // 열 때만 받는다
    $('avatarPick').hidden = false; $('accountAvatarBig').setAttribute('aria-expanded', 'true');
    choices.querySelector('[aria-pressed=true]')?.focus({preventScroll: true});
  }
  function closePick() { $('avatarPick').hidden = true; $('accountAvatarBig').setAttribute('aria-expanded', 'false'); }
  $('accountAvatarBig').onclick = () => { if ($('avatarPick').hidden) openPick(); else closePick(); };
  let saving = false;
  function busy(on) {
    saving = on;
    for (const b of choices.querySelectorAll('button')) b.disabled = on;
  }
  // 바꾸기 요청 공통: 401 이면 로그인 풀림, 실패면 서버 문구, 성공이면 내 정보를 다시 그린다
  async function saveProfile(request, done) {
    if (saving) return;
    busy(true);
    try {
      const r = await request();
      if (r.status === 401) { me = null; show(); toast('로그인이 끝났어요. 다시 로그인해 주세요.', true); return; }
      if (!r.ok) { toast(r.body?.error?.message || '바꾸지 못했어요. 잠시 뒤 다시 해 주세요.', true); return; }
      me = r.body; show(); toast(done);
      return true;
    } catch { toast('바꾸지 못했어요. 연결을 확인해 주세요.', true); }
    finally { busy(false); }
  }
  function pickCharacter(id) {
    const current = me?.avatar?.type === 'character' ? me.avatar.id : me?.avatar ? 'photo' : 'sprout';
    if (id === current) return;
    saveProfile(() => id === 'sprout' ? send('DELETE', './api/me/avatar') : send('PUT', './api/me/avatar', {character: id}), '프로필을 바꿨어요');
  }
  $('photoPick').onclick = () => { if (!saving) $('photoFile').click(); };
  $('photoFile').onchange = async () => {
    const file = $('photoFile').files[0];
    $('photoFile').value = '';   // 같은 사진을 다시 골라도 change 가 오게
    if (!file) return;
    let blob;
    try { blob = await shrinkPhoto(file); } catch { toast('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.', true); return; }
    saveProfile(async () => {
      const r = await fetch('./api/me/avatar', {method: 'PUT', credentials: 'same-origin', headers: {...CHANGE, 'Content-Type': blob.type}, body: blob});
      return {status: r.status, ok: r.ok, body: r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null};
    }, '프로필 사진을 바꿨어요');
  };

  // ---- 내 정보: 닉네임 고치기(1~12자 · 같은 이름 허용 — 다듬기 · 검사는 서버가 한 번 더) ----
  function nameCount() {
    const count = nameLength($('nameInput').value);
    $('nameCount').textContent = `${count}/${NAME_MAX}`;
    $('nameCount').classList.toggle('over', count > NAME_MAX);
  }
  function openName() {
    closePick();
    $('nameInput').value = me?.name || ''; nameCount();
    $('nameForm').hidden = false; $('nameEdit').setAttribute('aria-expanded', 'true');
    $('nameInput').focus({preventScroll: true}); $('nameInput').select();
  }
  function closeName() { $('nameForm').hidden = true; $('nameEdit').setAttribute('aria-expanded', 'false'); }
  $('nameEdit').onclick = () => { if ($('nameForm').hidden) openName(); else closeName(); };
  $('nameCancel').onclick = () => { closeName(); $('nameEdit').focus({preventScroll: true}); };
  $('nameInput').addEventListener('input', nameCount);
  $('nameForm').onsubmit = async e => {
    e.preventDefault();
    const name = $('nameInput').value.trim(), count = nameLength(name);
    if (count < 1 || count > NAME_MAX) { toast(`닉네임은 1~${NAME_MAX}자예요`, true); $('nameInput').focus(); return; }
    if (name === me?.name) { closeName(); return; }
    $('nameSave').disabled = true;
    try {
      if (await saveProfile(() => send('PUT', './api/me/profile', {name}), '닉네임을 바꿨어요')) { closeName(); $('nameEdit').focus({preventScroll: true}); }
    } finally { $('nameSave').disabled = false; }
  };
  function renderTickets() {
    $('ticketList').replaceChildren(...tickets.map(t => {
      const el = ticketEl(t);
      el.onclick = e => {
        if (e.target.closest('.tk-edit')) { e.stopPropagation(); openTicket(t); return; }
        el.classList.toggle('flipped');
        if (el.classList.contains('flipped')) { fillChain(t, el.querySelector('.tk-chain')); countUse('ticket'); }
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

  // ---- 사용 횟수(내 통계) ----
  function countUse(kind) {
    if (!me) return;
    send('POST', './api/me/usage', {kind}).catch(() => {});   // 못 보내도 화면에는 아무 일 없다
  }
  addEventListener('syung:route', () => countUse('route'));

  // ---- 내 정보: 내 통계 · 계정(내 정보를 열 때만 받는다) ----
  let accountSeq = 0;
  async function loadAccountPage() {
    if (!me) return;
    const my = ++accountSeq;
    let stats, sessions;
    try { [stats, sessions] = await Promise.all([getJson('./api/me/stats'), getJson('./api/me/sessions')]); } catch { return; }
    if (my !== accountSeq || !me) return;
    if (stats.status === 401 || sessions.status === 401) { me = null; show(); return; }
    if (stats.status === 200) { renderStats(stats.body); $('accountStats').hidden = false; }
    if (sessions.status === 200) { renderSafe(sessions.body.sessions); $('accountSafe').hidden = false; }
  }
  $('accountRow').addEventListener('click', loadAccountPage);   // 본체가 쪽을 여는 onclick 과 같이 돈다

  function renderStats(st) {
    const cell = (value, label) => `<div class="st-cell"><b>${esc(value)}</b><small>${esc(label)}</small></div>`;
    const most = Math.max(1, ...st.daily.map(d => d.open + d.route + d.ticket));
    const bars = st.daily.map(d => {
      const n = d.open + d.route + d.ticket, [, m, day] = d.day.split('-').map(Number);
      return `<i style="height:${n ? Math.max(8, Math.round(n / most * 100)) : 0}%" title="${m}월 ${day}일 · ${n}번"></i>`;
    }).join('');
    const f = st.fare, [, month] = f.month.split('-').map(Number);
    const rows = f.tickets.map(t => `<li><span>${esc(t.name)}</span><small>${won(t.fare)} × ${t.rides}번</small><b>${won(t.monthly)}</b></li>`).join('');
    const why = Object.entries(f.reasons).map(([key, n]) => `${FARE_REASONS[key] || key} ${n}장`).join(' · ');
    const fare = st.tickets
      ? `<div class="st-fare"><div class="st-fare-top"><span>${month}월 예상 교통비</span><b>${won(f.total)}</b></div>`
        + `<p class="st-note">승차권대로 다 탄다고 가정한 예상이에요</p>${rows ? `<ul class="st-fare-list">${rows}</ul>` : ''}`
        + (f.skipped ? `<p class="st-skip">${f.skipped}장 계산 못 함${why ? ` — ${esc(why)}` : ''}</p>` : '')
        + '<p class="st-note">교통카드 어른 요금 · 고른 경로 거리 기준이에요. 갈아타는 시간 · 정기권 · 공휴일 · 노선마다 따로 붙는 운임은 넣지 않았어요.</p></div>'
      : '';
    $('accountStatsBody').innerHTML = `<div class="st-grid">${cell(`${st.daysTogether}일`, '함께한 날')}${cell(`${st.tickets}장`, '승차권')}`
      + `${cell(`${st.recent.openDays}일`, `최근 ${st.recent.days}일 슝 연 날`)}${cell(`${st.recent.route}번`, `최근 ${st.recent.days}일 길찾기`)}</div>`
      + `<div class="st-bars" role="img" aria-label="최근 ${st.recent.days}일 날짜별 사용 횟수">${bars}</div>`
      + `<p class="st-note">한 주에 타는 횟수 ${st.weeklyRides}번 · 승차권 본 횟수 ${st.recent.ticket}번(최근 ${st.recent.days}일)</p>${fare}`;
  }

  function renderSafe(list) {
    const body = $('accountSafeBody');
    const items = list.map(item => `<li data-session="${esc(item.id)}"><span class="dv-name">${esc(item.device)}${item.current ? '<em>이 기기</em>' : ''}</span>`
      + `<small>마지막 사용 ${monthDay(item.lastUsedAt)} · 로그인 ${monthDay(item.createdAt)}</small>`
      + (item.current ? '' : '<button type="button" class="dv-out">로그아웃</button>') + '</li>').join('');
    body.innerHTML = `<p class="acct-sub">로그인한 기기 ${list.length}대</p><ul class="dv-list">${items}</ul>`
      + `<div class="dv-actions">${list.length > 1 ? '<button type="button" id="deviceOthers">다른 기기 모두 로그아웃</button>' : ''}`
      + '<button type="button" id="dataExport">내 데이터 내려받기</button></div>'
      + '<p class="st-note">내려받기: 회원 정보 · 로그인 기기 · 승차권 · 날짜별 사용 횟수를 JSON 파일 하나로 받아요.</p>';
    for (const b of body.querySelectorAll('.dv-out')) b.onclick = () => logoutDevice(b.closest('li').dataset.session, b);
    $('deviceOthers')?.addEventListener('click', logoutOthers);
    $('dataExport').onclick = exportData;
  }
  async function logoutDevice(id, button) {
    button.disabled = true;
    try {
      const r = await send('DELETE', `./api/me/sessions/${encodeURIComponent(id)}`);
      if (r.status === 401) { me = null; show(); toast('로그인이 끝났어요. 다시 로그인해 주세요.', true); return; }
      if (!r.ok && r.status !== 404) { toast('로그아웃하지 못했어요.', true); return; }
      toast('그 기기에서 로그아웃했어요');
      loadAccountPage();
    } catch { toast('로그아웃하지 못했어요. 연결을 확인해 주세요.', true); }
    finally { button.disabled = false; }
  }
  async function logoutOthers() {
    try {
      const r = await send('DELETE', './api/me/sessions?others=1');
      if (r.status === 401) { me = null; show(); toast('로그인이 끝났어요. 다시 로그인해 주세요.', true); return; }
      if (!r.ok) { toast('로그아웃하지 못했어요.', true); return; }
      toast(`다른 기기 ${r.body?.removed ?? 0}대에서 로그아웃했어요`);
      loadAccountPage();
    } catch { toast('로그아웃하지 못했어요. 연결을 확인해 주세요.', true); }
  }
  async function exportData() {
    try {
      const r = await getJson('./api/me/export');
      if (r.status === 401) { me = null; show(); toast('로그인이 끝났어요. 다시 로그인해 주세요.', true); return; }
      if (r.status !== 200) { toast('내려받지 못했어요. 잠시 뒤 다시 해 주세요.', true); return; }
      const now = new Date(), pad = n => String(n).padStart(2, '0');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(r.body, null, 2)], {type: 'application/json'}));
      a.download = `syung-my-data-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('내 데이터를 내려받았어요');
    } catch { toast('내려받지 못했어요. 연결을 확인해 주세요.', true); }
  }

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
  if (me) { countUse('open'); await loadTickets(); }

  // 로그인에서 돌아옴(#login=ok · new · <오류>): 주소를 지운다. 성공(ok · new)이면 서랍 · 발권 화면을 열지 않고 지도 첫 화면 그대로 둔다.
  // 실패인데 이미 로그인돼 있으면 서랍 첫 화면, 로그인이 안 됐으면 서랍 없이 팝업 + 안내(오류 코드 원문은 보이지 않는다 · 취소는 오류 모양 아님)
  const back = /(?:^#|&)login=(\w+)/.exec(location.hash);
  if (back) {
    history.replaceState(null, '', location.pathname + location.search);
    const succeeded = back[1] === 'ok' || back[1] === 'new';
    if (!me) openSheet(LOGIN_ERRORS[back[1]] || '로그인하지 못했어요. 잠시 뒤 다시 해 주세요.', back[1] !== 'denied');
    else if (!succeeded) $('settingsButton')?.click();
  }
}
