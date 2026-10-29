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
// 지도에서 보기(2026-10-29 사용자 결정 A — 길찾기 아래 막대와 같은 방식): 승차권 뒷면의 길을 서랍을 닫고 지도에 그린다.
// 아래 막대(.jbar)를 누르면 서랍 · 그 쪽 · 고른 카드 · 초점이 돌아온다. 그리기 · 길찾기와 서로 치우기는 본체(routeMap).
// 경로 고르기는 지도와 함께(2026-10-29 사용자 결정): 경로 쪽에 있는 동안 서랍에 .with-map — 휴대폰은 아래 절반 시트 · 위에 지도,
// 데스크톱은 서랍 그대로 옆 지도. 고른 카드의 길을 바로 그리고, 경로 쪽을 떠나면(어떤 길로든) 지운다.
// 로그인 방법이 하나도 설정되지 않았으면(/api/auth/providers 빈 목록 · 실패) 아무것도 보이지 않는다 — 로그인 안 한 화면은 지금과 같다.
// 본체가 지도를 다 띄운 뒤 import() 로 부른다(첫 화면 코드에 없음).
import {routeTrack} from '../lib/journey-ui.mts';   // 아래 막대의 경로 띠(본체가 이미 받은 파일)
import type {Plan} from '../lib/journey-ui.mts';
import {accountView, avatarLook, nameLength, NAME_MAX} from './account_view.tsx';   // 내 정보 쪽(#menuAccount) 그리기 — Preact
import type {Me, Avatar, Stats, Session} from './account_view.tsx';
import {ticketsView, DAYS, esc, shortName, timeParts} from './tickets_view.tsx';   // 승차권 · 발권 · 장소 · 경로 쪽 그리기 — Preact
import type {Place, FoundPlace, SlimLeg, SlimRoute, Ticket} from './tickets_view.tsx';
import type {RouteKind, RouteSort} from './ticket_routes.mts';
import {usefulRoutes, quickestRoute, rideSig, nextRideDay, routeAt, routeFilterView, chosenAfter, routeUrl} from './ticket_routes.mts';   // 승차권 경로 고르기(길 모양 · 거르기 · 다음 탈 날)

// 서버 응답(server/routes/members.py · /api/auth/providers · /api/route) 가운데 이 파일이 읽는 칸(승차권 · 장소는 tickets_view.tsx)
interface Reply<B> { status:number; ok?:boolean; body:B | null }
// 바꾸는 요청의 답: 실패면 error.message, 다른 기기 로그아웃이면 removed
interface Changed { error?:{ message?:string }; removed?:number }
interface RouteAnswer { ok?:boolean; error?:string; plans?:Plan[] }
// 본체(maplibre_runtime)가 넘기는 여정 지도 표시: 그리기 · (아직 이 길이면) 지우기 · 길찾기 · 버스 노선이 지도를 차지하면 부를 함수 걸기
interface RouteMap { show(plan:Plan, pad?:{ bottom:number; right:number }):void; clear(plan:Plan):void; onGone(gone:(()=>void) | null):void }
interface Wheel { el:HTMLElement; values:number[]; label:(value:number)=>string }
// 로그인 팝업 로고 움직임(web/vendor/lottie — 받으면 globalThis.lottie)이 쓰는 칸
interface LottieAnim { destroy():void; goToAndStop(frame:number, isFrame:boolean):void; play():void; addEventListener(name:string, f:()=>void):void }
declare global { var lottie:{ loadAnimation(o:{ container:HTMLElement; renderer:string; loop:boolean; autoplay:boolean; animationData:unknown }):LottieAnim } | undefined }

const $ = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const CHANGE = {'X-Requested-With': 'syung'};   // 바꾸는 요청에 붙이는 머리말(서버가 확인한다)
const LOGIN_ERRORS:Record<string, string> = {
  denied: '로그인을 취소했어요.',
  provider: '로그인 서비스가 답하지 않아요. 잠시 뒤 다시 해 주세요.',
  limit: '시도가 너무 많아요. 10분 뒤 다시 해 주세요.',
};
const KAKAO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7S17 4 12 4z" fill="#191919"/></svg>';
const GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.89 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>';
const APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 12.54c.03 3.27 2.87 4.36 2.9 4.38-.02.08-.45 1.55-1.49 3.07-.9 1.31-1.83 2.62-3.3 2.65-1.44.03-1.91-.86-3.56-.86-1.64 0-2.16.83-3.53.89-1.42.05-2.5-1.42-3.41-2.73C2.8 17.26 1.39 12.36 3.3 9.05a5.3 5.3 0 0 1 4.49-2.72c1.4-.03 2.72.94 3.56.94.83 0 2.4-1.16 4.04-.99.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.3 4.15ZM14.35 4.5c.76-.92 1.28-2.2 1.14-3.48-1.1.04-2.44.74-3.23 1.66-.7.81-1.32 2.11-1.15 3.35 1.23.1 2.48-.63 3.24-1.53Z"/></svg>';
const PROVIDERS:Record<string, [string, string]> = {kakao: ['카카오로 계속하기', KAKAO], google: ['구글로 계속하기', GOOGLE], apple: ['Apple로 계속하기', APPLE]};

const PHOTO_SIDE = 256, PHOTO_MAX = 150 * 1024;   // 서버 한도(160 KB)보다 조금 작게
// 칸(el)에 프로필을 그린다: 올린 사진이면 칸을 꽉 채우고(.photo), 아니면 캐릭터 얼굴(.face). big: 내 정보의 큰 칸(240 그림)
function paintAvatar(el:HTMLElement, avatar:Avatar | null | undefined) {   // 메뉴 목록의 내 정보 줄(작은 칸) — 큰 칸은 account_view
  const {photo, image} = avatarLook(avatar);
  el.classList.toggle('photo', photo);
  el.classList.toggle('face', !photo);
  el.style.backgroundImage = image;
}
const toBlob = (canvas:HTMLCanvasElement, type:string, quality:number) => new Promise<Blob | null>(done => canvas.toBlob(done, type, quality));
// 고른 사진 → 가운데 정사각 256×256 WebP(안 되는 브라우저는 JPEG) Blob. 다시 그리므로 원본의 사진 정보(Exif · 위치)는 따라가지 않는다
async function shrinkPhoto(file:Blob) {
  const image = await createImageBitmap(file, {imageOrientation: 'from-image'});   // 휴대폰 사진의 회전 정보는 그리기 전에 반영
  const side = Math.min(image.width, image.height);
  let source:ImageBitmap | HTMLCanvasElement = image, sx = (image.width - side) / 2, sy = (image.height - side) / 2, from = side;
  if (side > PHOTO_SIDE * 4) {   // 아주 큰 사진은 한 번 줄였다가 다시 줄인다(한 번에 줄이면 거칠어진다)
    const step = document.createElement('canvas');
    step.width = step.height = PHOTO_SIDE * 4;
    const stepContext = step.getContext('2d')!;
    stepContext.imageSmoothingQuality = 'high';
    stepContext.drawImage(image, sx, sy, side, side, 0, 0, step.width, step.height);
    source = step; sx = 0; sy = 0; from = step.width;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PHOTO_SIDE;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff'; context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);   // 투명한 곳은 흰 바탕(JPEG 는 투명이 없다)
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, sx, sy, from, from, 0, 0, PHOTO_SIDE, PHOTO_SIDE);
  image.close?.();
  for (const quality of [.86, .72, .55]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);   // 사파리는 WebP 로 못 그린다(PNG 가 나온다)
    if (blob?.type === 'image/jpeg') {
      // 사파리 · 아이폰 JPEG 에 붙는 Exif(APP1) · APP13 조각을 뗀다 — 서버가 그런 JPEG 를 받지 않는다(올릴 때만 받는 파일)
      const {stripJpegMeta} = await import('./photo_meta.mts');
      blob = new Blob([stripJpegMeta(new Uint8Array(await blob.arrayBuffer())) as Uint8Array<ArrayBuffer>], {type: 'image/jpeg'});
    }
    if (blob && blob.size <= PHOTO_MAX && (blob.type === 'image/webp' || blob.type === 'image/jpeg')) return blob;
  }
  throw new Error('too big');
}

// 장소 검색(카카오)의 역 이름은 '잠실역 2호선'처럼 호선이 붙어 온다 — 뒷면에는 역 이름만(사용자 2026-10-27). 저장된 이름은 그대로
const stationOnly = (name:string) => name.replace(/^(.+역)\s+\S*선$/, '$1');

async function getJson<B = unknown>(url:string):Promise<Reply<B>> {
  const r = await fetch(url, {cache: 'no-store', credentials: 'same-origin'});
  return {status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null};
}
async function send<B = Changed>(method:string, url:string, body?:unknown):Promise<Reply<B>> {
  const r = await fetch(url, {method, credentials: 'same-origin', headers: body ? {...CHANGE, 'Content-Type': 'application/json'} : CHANGE,
    body: body ? JSON.stringify(body) : undefined});
  return {status: r.status, ok: r.ok, body: r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null};
}

// 뒷면 첫 줄: 승차권 출발지 → (마지막 빼고) 탄 구간마다 내린 곳 → 도착지 · 환승 N(없으면 바로).
// 발권할 때 고른 경로가 있으면 그 경로로(사용자 결정 2026-10-27), 없으면(옛 승차권) 다음 탈 날 그 시각으로 길을 찾아 거른 뒤 가장 빠른 길로(2026-10-29).
function chainHTML(t:Ticket, legs:readonly SlimLeg[]) {
  const rides = legs.filter(l => l.type !== 'walk');
  const names = [stationOnly(t.from.name), ...rides.slice(0, -1).map(l => l.to), stationOnly(t.to.name)];
  const tag = rides.length > 1 ? `환승 ${rides.length - 1}` : rides.length ? '바로' : '걸어서';
  return names.map(n => `<span title="${esc(n)}">${esc(shortName(n!))}</span>`).join('<em>→</em>') + `<small>${tag}</small>`;
}
const chains = new Map<string, string>();   // 승차권 번호 + 출발 · 도착 · 물은 시각(다음 탈 날) → 그린 HTML(한 화면에서 다시 안 부름)
// put: 뒷면 첫 줄에 넣을 HTML(고른 경로 · 이미 찾은 길이면 바로, 아니면 길을 찾은 뒤)
async function fillChain(t:Ticket, put:(html:string)=>void) {
  if (t.route) { put(chainHTML(t, t.route.legs)); return; }
  const at = routeAt(nextRideDay(t.days, t.depart, new Date()));   // 발권 화면의 경로 고르기와 같은 날 · 같은 거르기
  const key = `${t.id}|${t.from.lat},${t.from.lng}|${t.to.lat},${t.to.lng}|${t.via ? `${t.via.lat},${t.via.lng}` : ''}|${at}`;   // 다음 탈 날이 바뀌면(화면을 오래 열어 두면) 다시 찾는다
  if (chains.has(key)) { put(chains.get(key)!); return; }
  let html:string;
  try {
    const {status, body} = await getJson<RouteAnswer>(routeUrl(t.from, t.to, at, t.via));   // 경유지로 고른 승차권은 같은 경유지로
    const plan = status === 200 && body?.ok ? quickestRoute(body.plans || []) : null;
    if (!plan) throw new Error('no plan');
    html = chainHTML(t, plan.legs);
    chains.set(key, html);
  } catch {
    html = `<span>${esc(shortName(t.from.name))}</span><em>→</em><span>${esc(shortName(t.to.name))}</span><small>길을 찾지 못했어요</small>`;
  }
  put(html);
}

// colors: 노선 이름 → 색(본체) · routeMap: 여정 지도 표시(본체)
export async function initAccount({colors = {}, routeMap}:{ colors?:Record<string, string>; routeMap?:RouteMap } = {}) {
  const item = $('accountItem'), sheet = $('loginSheet');
  if (!item || !sheet) return;
  // 로그인 방법과 지금 로그인한 사람을 한 번에 받는다(/api/me 를 따로 물으면 메뉴 칸이 한 번 더 늦게 뜨고,
  // 로그인이 꺼진 운영에서는 방문자마다 404 가 하나 더 찍힌다)
  let answer:Reply<{ providers?:string[]; me?:Me | null }> | null = null;
  try { answer = await getJson<{ providers?:string[]; me?:Me | null }>('./api/auth/providers'); } catch { return; }
  const providers = answer.status === 200 ? answer.body?.providers || [] : [];
  if (!providers.length) return;   // 설정 전: 메뉴 칸을 숨긴 채로
  ticketsView.set({colors});   // 경로 띠 색

  const say = (id:string, text:string) => { $(id).textContent = text || ''; };
  // 알림은 모두 서랍 아래 토스트(잠깐 떴다 사라짐) — 결과 · 연결 오류 · 입력 확인(사용자 결정 2026-10-27). 입력 확인은 그 칸으로 포커스도 옮긴다
  let toastTimer:ReturnType<typeof setTimeout> | 0 = 0;
  // 알림 상자(#accountToast, aria-live)는 늘 문서에 두고 카드만 넣고 뺀다 — 숨긴 상자에 글을 넣으면 화면 낭독기가 놓친다
  const toastBox = $('accountToast');
  function hideToast(card:HTMLElement) {
    card.classList.remove('show');
    setTimeout(() => { if (toastBox.firstChild === card && !card.classList.contains('show')) toastBox.replaceChildren(); }, 200);
  }
  function toast(text:string, error = false) {
    const card = document.createElement('div');
    card.className = error ? 'acct-toast is-error' : 'acct-toast';   // '.error' 는 index.html 의 지도 오류 화면(inset:0)과 겹친다
    card.innerHTML = `<span class="tt-speed" aria-hidden="true"><i></i><i></i></span><span>${esc(text)}</span>`;
    card.onclick = () => { clearTimeout(toastTimer); hideToast(card); };   // 누르면 바로 닫힘
    toastBox.replaceChildren(card); void card.offsetWidth; card.classList.add('show');   // 연달아 떠도 매번 슝~ 들어온다
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hideToast(card), error ? 3600 : 2400);
  }
  let me:Me | null = null, tickets:Ticket[] = [], editing:Ticket | null = null;

  // ---- 로그인 팝업(서랍 밖 화면 전체 위 — 열 때 서랍은 닫는다) ----
  $('accountProviders').replaceChildren(...providers.filter(p => PROVIDERS[p]).map(p => {
    const a = document.createElement('a');
    a.className = `social ${p}`; a.href = `./api/auth/${p}/start`; a.innerHTML = `${PROVIDERS[p]![1]}<span>${PROVIDERS[p]![0]}</span>`;
    return a;
  }));
  const sheetOpen = () => !sheet.hidden;
  // 로그인 팝업 로고 움직임(Lottie): 새싹 캐릭터가 뛰어와 로고 열차에 올라타고 출발(2초 · 사용자 결정 2026-10-27).
  // 팝업을 열 때만 플레이어(web/vendor/lottie — lottie-web 5.13.0 light, svg 렌더러만)와 움직임 JSON
  // (web/brand/login-motion.json — tools/login_motion/make.mjs 가 만든다)을 받는다 — 첫 화면 코드에 없음.
  // 캔버스는 팝업 위쪽 넓은 영역(800×170) — 그 안의 로고 칸 가운데(400, 135)를 실제 로고 가운데에 맞춰 얹는다.
  // 동작 줄이기 · 받기 실패면 정지 로고 그대로. 한 번만 재생하고 끝나면 정지 로고로 바꿔 낀다
  let motionData:unknown = null;
  const MOTION = {width: 800, height: 170, slotX: 400, slotY: 135, wait: 220};   // wait: 카드가 올라오는 동안(.26 초) 기다렸다 재생
  let motionAnim:LottieAnim | null = null, motionTurn = 0, motionTimer:ReturnType<typeof setTimeout> | 0 = 0;
  function stopLogoMotion() {
    motionTurn++; clearTimeout(motionTimer);
    motionAnim?.destroy(); motionAnim = null;
    sheet.querySelector('.login-motion')?.remove();
    sheet.querySelector<HTMLElement>('.login-brand')!.style.visibility = '';
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
    const logo = sheet.querySelector<HTMLElement>('.login-brand')!, box = document.createElement('div');
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
  function openSheet(message:string, error = false) {
    const note = $('loginMsg');
    if (message) note.innerHTML = `<span class="acct-toast show${error ? ' is-error' : ''}"><span class="tt-speed" aria-hidden="true"><i></i><i></i></span><span>${esc(message)}</span></span>`;
    else note.replaceChildren();
    if ($('settingsPanel')?.classList.contains('open')) $('settingsClose').click();
    sheet.hidden = false; void sheet.offsetWidth; sheet.classList.add('open');
    sheet.querySelector<HTMLElement>('.social')?.focus({preventScroll: true});
    playLogoMotion();
  }
  function closeSheet() {
    stopLogoMotion();
    sheet.classList.remove('open');
    setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 260);
    $('settingsButton')?.focus({preventScroll: true});
  }
  $('loginOpen').onclick = () => openSheet('');
  sheet.querySelector<HTMLElement>('.login-scrim')!.onclick = closeSheet;
  // 팝업이 떠 있는 동안 Esc 는 팝업을 닫고, Tab 은 팝업 안에서만 돈다
  window.addEventListener('keydown', e => {
    if (!sheetOpen()) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const items = [...sheet.querySelectorAll<HTMLElement>('a[href],button')].filter(el => el.offsetParent);
    if (!items.length) return;
    const first = items[0]!, last = items[items.length - 1]!;
    const inside = sheet.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
  }, true);

  // ---- 화면 상태 ----
  function show() {
    item.hidden = false;
    $('loginOpen').hidden = !!me; $('accountRow').hidden = !me; $('ticketsRow').hidden = !me;
    if (!me) { closeName(); closePick(); accountView.set({statsShown: false, safeShown: false}); accountSeq++; return; }
    paintAvatar($('accountAvatar'), me.avatar);   // 메뉴 내 정보 줄
    $('accountItemName').textContent = me.name;
    accountView.set({me, marked: true});   // 내 정보 쪽: 큰 칸 · 이름 · 로그인 방법 · 고르기 눌림(로그아웃해도 마지막 그림은 그대로 — 옛 모양)
  }

  // ---- 내 정보: 프로필 사진 · 캐릭터 고르기 · 닉네임 고치기(그리기는 account_view.tsx) ----
  function openPick() {
    closeName();
    accountView.set({facesLoaded: true, pickOpen: true});   // 캐릭터 얼굴은 처음 열 때 받는다
    document.querySelector<HTMLElement>('#avatarChoices [aria-pressed=true]')?.focus({preventScroll: true});
  }
  function closePick() { accountView.set({pickOpen: false}); }
  let saving = false;
  function busy(on:boolean) {
    saving = on;
    accountView.set({saving: on});
  }
  // 바꾸기 요청 공통: 401 이면 로그인 풀림, 실패면 서버 문구, 성공이면 내 정보를 다시 그린다
  async function saveProfile(request:()=>Promise<Reply<Me & Changed>>, done:string) {
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
  function pickCharacter(id:string) {
    const current = me?.avatar?.type === 'character' ? me.avatar.id : me?.avatar ? 'photo' : 'sprout';
    if (id === current) return;
    saveProfile(() => id === 'sprout' ? send('DELETE', './api/me/avatar') : send('PUT', './api/me/avatar', {character: id}), '프로필을 바꿨어요');
  }
  async function photoChosen(file:File | undefined) {   // (고른 칸의 값은 그리기 쪽이 비운다 — 같은 사진을 다시 골라도 change 가 오게)
    if (!file) return;
    let blob:Blob;
    try { blob = await shrinkPhoto(file); } catch { toast('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.', true); return; }
    saveProfile(async () => {
      const r = await fetch('./api/me/avatar', {method: 'PUT', credentials: 'same-origin', headers: {...CHANGE, 'Content-Type': blob.type}, body: blob});
      return {status: r.status, ok: r.ok, body: r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null};
    }, '프로필 사진을 바꿨어요');
  }

  // 닉네임 고치기(1~12자 · 같은 이름 허용 — 다듬기 · 검사는 서버가 한 번 더)
  function openName() {
    closePick();
    accountView.set({nameValue: me?.name || '', nameOpen: true});
    $('nameInput').focus({preventScroll: true}); $<HTMLInputElement>('nameInput').select();
  }
  function closeName() { accountView.set({nameOpen: false}); }
  async function submitName() {
    const name = accountView.state.nameValue.trim(), count = nameLength(name);
    if (count < 1 || count > NAME_MAX) { toast(`닉네임은 1~${NAME_MAX}자예요`, true); $('nameInput').focus(); return; }
    if (name === me?.name) { closeName(); return; }
    accountView.set({nameSaving: true});
    try {
      if (await saveProfile(() => send('PUT', './api/me/profile', {name}), '닉네임을 바꿨어요')) { closeName(); $('nameEdit').focus({preventScroll: true}); }
    } finally { accountView.set({nameSaving: false}); }
  }
  // ---- 승차권 목록(그리기는 tickets_view.tsx) ----
  function renderTickets() {   // 받을 때마다 카드를 새로 만든다(뒤집힘 · 뒷면 첫 줄도 처음 모양으로)
    ticketsView.set({tickets, listTurn: ticketsView.state.listTurn + 1, flipped: tickets.map(() => false), chains: tickets.map(() => null)});
  }
  function flipTicket(index:number) {
    const view = ticketsView.state, ticket = view.tickets[index]!, turn = view.listTurn;
    const flipped = [...view.flipped]; flipped[index] = !flipped[index];
    ticketsView.set({flipped});
    if (!flipped[index]) return;
    fillChain(ticket, html => {   // 그사이 목록을 다시 받았으면(옛 카드가 빠졌으면) 그리지 않는다
      if (ticketsView.state.listTurn !== turn) return;
      const chains = [...ticketsView.state.chains]; chains[index] = html;
      ticketsView.set({chains});
    });
    countUse('ticket');
  }
  async function loadTickets() {
    try { const r = await getJson<{ tickets:Ticket[] }>('./api/me/tickets'); if (r.status === 200) { tickets = r.body!.tickets; renderTickets(); } } catch { /* 다음에 열 때 다시 */ }
  }
  // 발권 화면에서 ‹ 는 승차권 목록으로, 장소 고르기 · 경로 선택에서 ‹ 는 발권 화면으로(본체의 '메뉴로' 보다 먼저 잡는다)
  $('menuBack').addEventListener('click', e => {
    if (!$('menuPlace').hidden && placeFor === 'via') { e.stopImmediatePropagation(); backToRoute(false); }
    else if (!$('menuPlace').hidden || !$('menuRoute').hidden) { e.stopImmediatePropagation(); backToForm(); }
    else if (!$('menuTicket').hidden) { e.stopImmediatePropagation(); $('ticketsRow').click(); }
  }, true);

  // ---- 발권 화면(어디서 → 어디로 → 언제 → 경로 → 타는 날 → 이름) ----
  // 출발 · 도착 · 시각 · 경로 · 타는 날 · 이름은 ticketsView.state 에 있다(그리기가 그 값으로 칸 · 미리보기를 그린다)
  const form = () => ticketsView.state;
  let lastField:HTMLElement | null = null;   // 장소 고르기 · 경로 선택에서 돌아오면 포커스를 둘 칸
  function backToForm() { $('ticketOpen').click(); lastField?.focus({preventScroll: true}); }
  function toggleDay(day:number) {
    const days = form().days;
    ticketsView.set({days: days.includes(day) ? days.filter(other => other !== day) : [...days, day].sort((left, right) => left - right)});
  }
  function quickDays(quick:string) {
    const days = quick.split(',').map(Number);
    ticketsView.set({days: DAYS.map((_, index) => index + 1).filter(day => days.includes(day))});
  }
  // 출발 · 도착 · 시각이 바뀌면 고른 경로는 풀린다(그 경로는 그 조건에서 찾은 것)
  function routeGone() {
    if (form().route) toast('출발 · 도착 · 시각이 바뀌어서 경로를 다시 골라 주세요', true);
    ticketsView.set({route: null});
  }

  // 장소 고르기 쪽: 300 ms 늦춰 찾고, 늦게 온 답은 버린다
  // via: 경로 선택 쪽의 경유지 칸에서 연 장소 고르기 — 고르거나 ‹ 하면 경로 선택 쪽으로 돌아간다
  let placeFor:'from' | 'to' | 'via' = 'from';
  const PLACE_NAMES = {from: '출발지 고르기', to: '도착지 고르기', via: '경유지 고르기'} as const;
  function openPlace(which:'from' | 'to' | 'via') {
    placeFor = which;
    if (which !== 'via') lastField = $(which === 'from' ? 'ticketFrom' : 'ticketTo');
    $('menuPlace').setAttribute('aria-label', PLACE_NAMES[which]);
    ticketsView.set({placeTo: which === 'to', placeVia: which === 'via', placeQuery: '', placeHidden: true, placeRows: []});
    $('placeOpen').click();
    $('placeQuery').focus({preventScroll: true});
  }
  let placeTimer:ReturnType<typeof setTimeout> | 0 = 0, placeSeq = 0;
  function placeInput(value:string) {
    ticketsView.set({placeQuery: value});
    clearTimeout(placeTimer);
    const query = value.trim();
    if (query.length < 2) { ticketsView.set({placeHidden: true}); return; }
    placeTimer = setTimeout(async () => {
      const my = ++placeSeq;
      try {
        const {body} = await getJson<{ ok?:boolean; places:FoundPlace[] }>(`./api/place?q=${encodeURIComponent(query)}`);
        if (my !== placeSeq) return;
        if (!body?.ok) ticketsView.set({placeRows: '검색하지 못했어요', placeHidden: false});
        else if (!body!.places.length) ticketsView.set({placeRows: '찾는 곳이 없어요', placeHidden: false});
        else ticketsView.set({placeRows: body!.places, placeHidden: false});
      } catch { if (my === placeSeq) ticketsView.set({placeRows: '검색하지 못했어요', placeHidden: false}); }
    }, 300);
  }
  function placePick(found:FoundPlace) {
    const place:Place = {name: found.name, lat: found.lat, lng: found.lng};
    ticketsView.set({placeQuery: found.name, placeHidden: true});
    if (placeFor === 'via') { const before = form().routeVia; ticketsView.set({routeVia: place}); backToRoute(!before || before.lat !== place.lat || before.lng !== place.lng); return; }
    const before = form()[placeFor];
    ticketsView.set({[placeFor]: place});
    if (!before || before.lat !== place.lat || before.lng !== place.lng) routeGone();
    backToForm();
  }
  // 출발 시각 휠(사용자와 정한 시안 B): 오전/오후 · 시 · 분(5분 단위)을 돌려 가운데 띠에 맞춘다.
  // 돌리는 동안은 칸 · 미리보기만 바꾸고, 접을 때 시각이 바뀌었으면 고른 경로를 푼다(돌리는 중에 토스트가 연달아 뜨지 않게).
  // 칸 속(단추 · 스크롤 자리)은 여기서 바닐라로 — tickets_view 는 칸만 한 번 그리고 다시 그리지 않는다
  const ROW = 40;   // 휠 한 칸 높이(syung.css .tw-col button)
  const wheelBox = $('ticketTimePick');
  const wheels = Object.fromEntries([...wheelBox.querySelectorAll<HTMLElement>('.tw-col')].map(el => [el.dataset.part, {el, values: [], label: String}])) as Record<'ampm' | 'hour' | 'minute', Wheel>;
  const pad2 = (n:number) => String(n).padStart(2, '0');
  let timeAtOpen = '';
  const wheelIndex = (w:Wheel) => Math.max(0, Math.min(w.values.length - 1, Math.round(w.el.scrollTop / ROW)));
  function markWheel(w:Wheel) {
    const at = wheelIndex(w);
    [...w.el.children].forEach((b, index) => { b.className = index === at ? 'on' : Math.abs(index - at) === 1 ? 'near' : ''; });
    w.el.setAttribute('aria-valuetext', w.label(w.values[at]!));
  }
  function setWheel(part:keyof typeof wheels, values:number[], label:(value:number)=>string, current:number) {
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
    const value = (part:keyof typeof wheels) => wheels[part].values[wheelIndex(wheels[part])]!;
    return `${pad2(value('ampm') * 12 + value('hour') % 12)}:${pad2(value('minute'))}`;
  }
  for (const w of Object.values(wheels)) {
    let frame = 0;
    w.el.addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { markWheel(w); ticketsView.set({time: wheelTime()}); });
    }, {passive: true});
    w.el.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      w.el.scrollTo({top: (wheelIndex(w) + (e.key === 'ArrowDown' ? 1 : -1)) * ROW, behavior: 'smooth'});
    });
  }
  function openWheel() {
    const [h, m] = form().time.split(':').map(Number) as [number, number];
    timeAtOpen = form().time;
    ticketsView.set({wheelOpen: true});   // 보인 뒤에 스크롤 자리를 잡는다
    const minutes = Array.from({length: 12}, (_, index) => index * 5);
    if (!minutes.includes(m)) { minutes.push(m); minutes.sort((left, right) => left - right); }   // 예전 승차권의 08:13 같은 시각은 그대로 보여 준다
    setWheel('ampm', [0, 1], value => value ? '오후' : '오전', h < 12 ? 0 : 1);
    setWheel('hour', Array.from({length: 12}, (_, index) => index + 1), String, h % 12 || 12);
    setWheel('minute', minutes, pad2, m);
    wheels.hour.el.focus({preventScroll: true});
  }
  function closeWheel(changed = true) {
    if (!form().wheelOpen) return;
    ticketsView.set({wheelOpen: false});
    if (changed && form().time !== timeAtOpen) routeGone();
  }

  // 경로 선택 쪽: 고른 요일 중 가장 가까운 날(없으면 오늘 · 시각이 지났으면 다음 날)의 그 시각으로 길찾기
  const nextRide = () => nextRideDay(form().days, form().time, new Date());
  // 저장하는 것: 띠를 그리고 뒷면을 쓰는 데 필요한 칸만(길 모양 path 같은 큰 칸은 뺀다)
  const slimLeg = (l:Plan['legs'][number]):SlimLeg => l.type === 'walk' ? {type: 'walk', seconds: Math.max(0, Math.round(l.seconds || 0))}
    : {type: l.type, ...(l.type === 'bus' ? {route: l.route, color: l.color, ...(l.alternatives?.length ? {alternatives: l.alternatives.map(({route, color, departs, arrives}) => ({route, color, departs, arrives}))} : {})} : {line: l.line}), from: l.from, to: l.to,
      departs: l.departs, arrives: l.arrives, wait: Math.max(0, Math.round(l.wait || 0))} as SlimLeg;
  const slimRoute = (p:Plan):SlimRoute => ({tag: p.tag || '', minutes: p.minutes, leaveBy: p.leaveBy, arrives: p.arrives, transfers: p.transfers,
    walkMinutes: p.walkMinutes, legs: p.legs.map(slimLeg)});
  let routeSeq = 0;
  let routeKind:RouteKind = 'all', routeSort:RouteSort = '';   // 경로 쪽 조건(종류 · 차례)
  // 발권 화면에서 열면 경유지는 발권 화면의 것(고른 경로를 찾은 경유지)부터
  function openRoute() {
    ticketsView.set({routeVia: form().via});
    return findRoutes();
  }
  // 경유지 칸 · 장소 고르기에서 돌아올 때: 경유지가 바뀌었으면(again) 다시 찾고, 아니면 찾아 둔 목록 그대로 보인다
  function backToRoute(again:boolean) {
    if (again || !form().plans.length) { findRoutes(); return; }
    $('routeOpen').click();
    focusChosen();
    previewPlan();
  }
  function clearVia() {
    if (!form().routeVia) return;
    ticketsView.set({routeVia: null});
    findRoutes();
    $('routeVia').focus({preventScroll: true});
  }
  async function findRoutes() {
    lastField = $('ticketRoute');
    const {from, to, routeVia: via} = form();
    if (!from || !to) { toast('출발지 · 도착지를 먼저 골라 주세요', true); $(from ? 'ticketTo' : 'ticketFrom').focus(); return; }
    const when = nextRide(), time = timeParts(form().time);
    ticketsView.set({routeTrip: `${from.name} → ${to.name}`, routeWhen: `${when.getMonth() + 1}월 ${when.getDate()}일(${DAYS[(when.getDay() + 6) % 7]}) ${time.ampm} ${time.clock} 출발 기준`,
      plans: [], chosen: -1, routeMsg: '경로를 찾고 있어요', routeLoading: true, routeFilter: null});   // 길찾기 시트와 같은 글자 · 뼈대 카드
    $('routeOpen').click();
    const my = ++routeSeq;
    const at = routeAt(when);
    try {
      const {status, body} = await getJson<RouteAnswer>(routeUrl(from, to, at, via));
      if (my !== routeSeq) return;
      if (status !== 200 || !body?.ok || !body.plans?.length) { ticketsView.set({routeMsg: body?.error || '경로를 찾지 못했어요.', routeLoading: false}); return; }
      const plans = usefulRoutes(body.plans!), route = form().route;   // 길 모양으로 묶고 덜 쓸모 있는 길은 뺀다(ticket_routes.mts)
      const mine = route ? plans.findIndex(p => rideSig(p) === rideSig(route)) : -1;
      const fastest = plans.findIndex(p => p.tag === '가장 빠른 길');
      routeKind = 'all'; routeSort = '';   // 열 때마다 조건은 전체 · 지금 차례
      ticketsView.set({plans, chosen: mine >= 0 ? mine : Math.max(0, fastest), routeMsg: '', routeLoading: false,   // 기본은 가장 빠른 길(사용자 결정 2026-10-27)
        routeFilter: routeFilterView(plans, routeKind, routeSort)});
      focusChosen();
      previewPlan();   // 처음 고른 카드의 길을 바로 그린다
    } catch { if (my === routeSeq) ticketsView.set({routeMsg: '경로를 찾지 못했어요. 연결을 확인해 주세요.', routeLoading: false}); }
  }
  function pickPlan() {
    const plan = form().plans[form().chosen];
    if (!plan) return;
    ticketsView.set({route: slimRoute(plan), via: form().routeVia});   // 고른 경로와 그 경로를 찾은 경유지를 같이
    backToForm();
  }
  function choosePlan(index:number) {
    ticketsView.set({chosen: index});
    previewPlan();
  }
  // 고른 카드에 초점(목록은 조건의 차례대로라 plans 번호가 아니라 보이는 자리로 찾는다)
  function focusChosen() {
    const {chosen, routeFilter} = form(), at = routeFilter ? routeFilter.order.indexOf(chosen) : chosen;
    ($('routeList').children[at] as HTMLElement | undefined)?.focus({preventScroll: true});
  }
  // 조건 바꾸기(종류 · 차례): 받은 길을 다시 나눈다(서버를 다시 부르지 않는다). 저장된 경로가 보이면 그 카드, 아니면 처음 카드를 고르고 지도 길도 그 길로
  function refilter() {
    const {plans, route} = form(), routeFilter = routeFilterView(plans, routeKind, routeSort);
    const chosen = chosenAfter(plans, routeFilter.order, route);
    ticketsView.set({routeFilter, chosen});
    if (chosen >= 0) previewPlan(); else previewGone();   // 맞는 길이 없으면 지도 길도 지운다
  }
  const filterKind = (kind:RouteKind) => { routeKind = kind; refilter(); };
  const filterSort = (sort:RouteSort) => { routeSort = sort; refilter(); };

  // ---- 경로 고르기 지도: 경로 쪽에 있는 동안 서랍(.with-map) 옆 · 위 지도에 고른 카드의 길 ----
  const routePanel = $('settingsPanel'), routePage = $('menuRoute');
  const narrow = matchMedia('(max-width: 780px)');   // syung.css 의 반쪽 시트와 같은 너비
  let previewed:Plan | null = null;
  const onRoutePage = () => routePanel.classList.contains('open') && !routePanel.hidden && !routePage.hidden;
  function previewPlan() {
    const plan = form().plans[form().chosen];
    if (!routeMap || !plan || !onRoutePage()) return;
    mapGone();   // 승차권 뒷면의 '지도에서 보기' 막대가 남아 있으면 치운다
    // 길이 서랍 뒤에 가리지 않게: 휴대폰은 아래 시트 높이만큼, 데스크톱은 오른쪽 서랍 너비만큼 띄운다
    routeMap.show(plan, narrow.matches ? {bottom: routePanel.offsetHeight + 24, right: 40} : {bottom: 40, right: routePanel.offsetWidth + 40});
    previewed = plan;   // 그린 뒤에 둔다(그리는 동안 본체가 부르는 '지도를 차지했다'에 지워지지 않게)
  }
  function previewGone() {
    if (!previewed) return;
    const plan = previewed;
    previewed = null;
    routeMap?.clear(plan);
  }
  // 경로 쪽에 들어오고 나가는 것은 서랍 · 그 쪽의 보임으로 본다(이 경로로 · ‹ · Esc · 닫기 · 바깥 누름 · 메뉴 이동이 모두 이 칸을 바꾼다)
  const routeWatch = new MutationObserver(() => {
    const on = onRoutePage();
    if (routePanel.classList.contains('with-map') !== on) routePanel.classList.toggle('with-map', on);   // (바꿀 때만 — 이 칸도 지켜본다)
    if (!on) { routeSeq++; previewGone(); }   // 찾는 중이던 답은 버린다
  });
  routeWatch.observe(routePanel, {attributes: true, attributeFilter: ['class', 'hidden']});
  routeWatch.observe(routePage, {attributes: true, attributeFilter: ['hidden']});
  // 경로 쪽에서 Esc 는 서랍을 닫지 않고 발권 화면으로(‹ 와 같다 — 본체의 서랍 Esc 보다 먼저 잡는다). 로그인 팝업이 떠 있으면 팝업이 먼저
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || sheetOpen() || !onRoutePage()) return;
    e.stopImmediatePropagation();
    backToForm();
  }, true);

  // ---- 지도에서 보기: 서랍을 닫고 지도에 길 전체, 아래 막대(길찾기 막대와 같은 모양)로 돌아온다 ----
  const mapBar = document.createElement('div');
  mapBar.className = 'jbar'; mapBar.hidden = true;
  mapBar.innerHTML = '<button type="button" class="jbar-open"></button><button type="button" class="jbar-x" aria-label="닫고 돌아가기" title="닫고 돌아가기"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
  document.body.append(mapBar);
  const mapBarOpen = mapBar.querySelector<HTMLElement>('.jbar-open')!;
  let mapShown:{ plan:Plan; back:()=>void } | null = null;
  // 막대와 승차권 길을 치운다(지도가 아직 이 길일 때만 지운다 — 길찾기 · 버스 노선이 차지했으면 그대로)
  function mapGone() {
    if (!mapShown) return;
    const {plan} = mapShown;
    mapShown = null; mapBar.hidden = true;
    routeMap?.clear(plan);
  }
  // back: 서랍을 연 뒤 그 쪽 · 카드 · 초점으로 돌아가기 · note: 막대에 덧붙일 짧은 안내
  function showOnMap(plan:Plan, backTo:string, note:string, back:()=>void) {
    if (!routeMap) return;
    mapGone();
    $('settingsClose').click();   // 서랍 닫기(닫기 단추와 같은 길)
    routeMap.show(plan);
    mapShown = {plan, back};
    mapBarOpen.innerHTML = `<span class="jbar-top"><b><small>약 </small>${plan.minutes}<small>분</small></b><span>‹ ${esc(backTo)}${note ? ` · ${esc(note)}` : ''}</span></span>${routeTrack(plan, colors, 240)}`;
    mapBarOpen.setAttribute('aria-label', `${backTo} 돌아가기${note ? `. ${note}` : ''}`);
    mapBar.hidden = false;
    mapBarOpen.focus({preventScroll: true});
  }
  // 막대 몸통 · ✕ 둘 다: 길을 지우고 서랍을 열어 보던 쪽 · 카드 · 초점으로 돌아간다
  function mapBack(e:Event) {
    e.stopPropagation();   // 본체의 '서랍 밖을 눌렀나' 검사가 방금 연 서랍을 닫지 않게
    const back = mapShown?.back;
    mapGone();
    $('settingsButton').click();
    back?.();
  }
  mapBarOpen.addEventListener('click', mapBack);
  mapBar.querySelector<HTMLElement>('.jbar-x')!.addEventListener('click', mapBack);
  $('settingsButton').addEventListener('click', mapGone);   // 서랍을 다시 열면 승차권 길은 지운다
  routeMap?.onGone(() => { mapGone(); previewed = null; });   // 길찾기 · 버스 노선이 지도를 차지했다(그쪽이 이미 지웠다)
  // 승차권 뒷면: 저장한 경로에는 지도에 그릴 길이 없어 다음 탈 날 그 시각으로 다시 찾는다(뒷면 첫 줄 · 경로 고르기와 같은 날).
  // 저장한 경로와 같은 길 모양(rideSig)이 있으면 그 길, 없으면 거른 뒤 가장 빠른 길 + 안내(옛 승차권 — 저장한 경로가 없으면 안내 없이)
  let mapSeq = 0;
  // 찾는 도중 서랍을 닫거나(어떤 길로든) 승차권 목록을 떠나면 그 요청은 버린다 — 다시 목록으로 돌아와도 늦은 답이 서랍을 닫고 옛 길을 그리지 않게.
  // 서랍 · 목록의 보임 상태가 바뀔 때마다 본다(닫기 단추 · Esc · 바깥 누름 · ‹ · 메뉴 항목이 모두 이 두 칸을 바꾼다)
  const mapPanel = $('settingsPanel'), mapList = $('menuTickets');
  const mapWatch = new MutationObserver(() => {
    if (ticketsView.state.mapping < 0 || (mapPanel.classList.contains('open') && !mapList.hidden)) return;
    mapSeq++;
    ticketsView.set({mapping: -1});
  });
  mapWatch.observe(mapPanel, {attributes: true, attributeFilter: ['class', 'hidden']});
  mapWatch.observe(mapList, {attributes: true, attributeFilter: ['hidden']});
  async function mapTicket(index:number) {
    const view = ticketsView.state, ticket = view.tickets[index], turn = view.listTurn;
    if (!ticket || view.mapping >= 0) return;
    const my = ++mapSeq;
    ticketsView.set({mapping: index});
    try {
      const at = routeAt(nextRideDay(ticket.days, ticket.depart, new Date()));
      const {status, body} = await getJson<RouteAnswer>(routeUrl(ticket.from, ticket.to, at, ticket.via));
      // 그사이 서랍을 닫았거나 다른 쪽으로 갔거나 목록을 다시 받았으면 그리지 않는다
      if (my !== mapSeq || ticketsView.state.listTurn !== turn || !$('settingsPanel').classList.contains('open') || $('menuTickets').hidden) return;
      const plans = status === 200 && body?.ok ? body.plans || [] : [];
      const saved = ticket.route ? rideSig(ticket.route) : null;
      const same = saved === null ? null : quickestRoute(plans.filter(plan => rideSig(plan) === saved));
      const plan = same || quickestRoute(plans);
      if (!plan) { toast(body?.error || '길을 찾지 못했어요', true); return; }
      showOnMap(plan, '승차권으로', ticket.route && !same ? '지금은 다른 길이 빨라요' : '', () => {
        $('ticketsRow').click();
        $('ticketList').children[index]?.querySelector<HTMLElement>('.tk-map')?.focus({preventScroll: true});
      });
    } catch { if (my === mapSeq) toast('길을 찾지 못했어요. 연결을 확인해 주세요.', true); }
    finally { if (my === mapSeq) ticketsView.set({mapping: -1}); }
  }

  let deleteArmed = false;
  function openTicket(t:Ticket | null) {
    editing = t || null; deleteArmed = false; lastField = null;
    $('menuTicket').setAttribute('aria-label', t ? '승차권 고치기' : '승차권 발권');
    closeWheel(false);
    ticketsView.set({opened: true, editingId: t?.id, name: t?.name || '', time: t?.depart || '08:00', from: t?.from || null, to: t?.to || null, route: t?.route || null, via: t?.via || null,
      days: DAYS.map((_, index) => index + 1).filter(day => t ? t.days.includes(day) : false), deleteArmed: false});
    $('ticketOpen').click();
  }
  async function submitTicket() {
    closeWheel();
    const now = form();
    if (!now.route) return;   // 휠을 접으며 시각이 바뀌어 경로가 풀렸다(토스트로 알림)
    const body = {name: now.name.trim(), from: now.from, to: now.to, depart: now.time, days: now.days, route: now.route, via: now.via};
    if (!body.from || !body.to) { toast('출발지 · 도착지를 골라 주세요', true); $(body.from ? 'ticketTo' : 'ticketFrom').focus(); return; }
    if (!body.route) { toast('경로를 골라 주세요', true); $('ticketRoute').focus(); return; }
    if (!body.name) { toast('승차권 이름을 넣어 주세요', true); $('ticketName').focus(); return; }
    ticketsView.set({sending: true});   // 단추를 막고 '발권하는 중…'
    try {
      const r = editing ? await send('PUT', `./api/me/tickets/${(editing as Ticket).id}`, body) : await send('POST', './api/me/tickets', body);
      if (r.status === 401) { me = null; show(); toast('로그인이 끝났어요. 다시 로그인해 주세요.', true); return; }
      if (!r.ok) { toast(r.body?.error?.message || '발권하지 못했어요.', true); return; }
      const fixed = !!editing;
      await loadTickets();
      $('ticketsRow').click();
      toast(fixed ? '승차권을 고쳤어요' : '발권했어요');
    } catch { toast('발권하지 못했어요. 연결을 확인해 주세요.', true); }
    finally { ticketsView.set({sending: false}); }   // 단추는 경로 유무로 다시 열린다
  }
  async function removeTicket() {
    if (!editing) return;
    if (!deleteArmed) { deleteArmed = true; ticketsView.set({deleteArmed: true}); return; }
    try {
      const r = await send('DELETE', `./api/me/tickets/${editing!.id}`);
      if (!r.ok && r.status !== 404) { toast('지우지 못했어요.', true); return; }
      await loadTickets();
      $('ticketsRow').click();
      toast('승차권을 지웠어요');
    } catch { toast('지우지 못했어요. 연결을 확인해 주세요.', true); }
  }
  // 승차권 쪽들에서 누른 것(tickets_view.tsx 가 전한다)
  ticketsView.on({
    ticketFlip: flipTicket, ticketEdit: index => openTicket(ticketsView.state.tickets[index]!), ticketMap: mapTicket, ticketNew: () => openTicket(null),
    placeFrom: () => openPlace('from'), placeTo: () => openPlace('to'),
    timeToggle: () => { if (form().wheelOpen) closeWheel(); else openWheel(); },
    timeDone: () => { closeWheel(); $('ticketTimeBtn').focus({preventScroll: true}); },
    route: openRoute, day: toggleDay, quick: quickDays, name: value => ticketsView.set({name: value}), submit: submitTicket, remove: removeTicket,
    placeInput, placePick, plan: choosePlan, planPick: pickPlan, routeKind: filterKind, routeSort: filterSort,
    viaAdd: () => openPlace('via'), viaClear: clearVia,
  });

  // ---- 사용 횟수(내 통계) ----
  function countUse(kind:string) {
    if (!me) return;
    send('POST', './api/me/usage', {kind}).catch(() => {});   // 못 보내도 화면에는 아무 일 없다
  }
  addEventListener('syung:route', () => countUse('route'));

  // ---- 내 정보: 내 통계 · 계정(내 정보를 열 때만 받는다) ----
  let accountSeq = 0;
  async function loadAccountPage() {
    if (!me) return;
    const my = ++accountSeq;
    let stats:Reply<Stats>, sessions:Reply<{ sessions:Session[] }>;
    try { [stats, sessions] = await Promise.all([getJson<Stats>('./api/me/stats'), getJson<{ sessions:Session[] }>('./api/me/sessions')]); } catch { return; }
    if (my !== accountSeq || !me) return;
    if (stats.status === 401 || sessions.status === 401) { me = null; show(); return; }
    const view = accountView.state;   // 받을 때마다 칸을 새로 만든다(옛 innerHTML 바꾸기)
    if (stats.status === 200) accountView.set({stats: stats.body!, statsTurn: view.statsTurn + 1, statsShown: true});
    if (sessions.status === 200) accountView.set({sessions: sessions.body!.sessions, safeTurn: view.safeTurn + 1, safeShown: true});
  }
  $('accountRow').addEventListener('click', loadAccountPage);   // 본체가 쪽을 여는 onclick 과 같이 돈다

  const outBusy = (id:string, on:boolean) => accountView.set({outBusy: on ? [...accountView.state.outBusy, id] : accountView.state.outBusy.filter(other => other !== id)});
  async function logoutDevice(id:string) {
    outBusy(id, true);
    try {
      const r = await send('DELETE', `./api/me/sessions/${encodeURIComponent(id)}`);
      if (r.status === 401) { me = null; show(); toast('로그인이 끝났어요. 다시 로그인해 주세요.', true); return; }
      if (!r.ok && r.status !== 404) { toast('로그아웃하지 못했어요.', true); return; }
      toast('그 기기에서 로그아웃했어요');
      loadAccountPage();
    } catch { toast('로그아웃하지 못했어요. 연결을 확인해 주세요.', true); }
    finally { outBusy(id, false); }
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
      const now = new Date(), pad = (n:number) => String(n).padStart(2, '0');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(r.body, null, 2)], {type: 'application/json'}));
      a.download = `syung-my-data-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('내 데이터를 내려받았어요');
    } catch { toast('내려받지 못했어요. 연결을 확인해 주세요.', true); }
  }

  // ---- 로그아웃 · 탈퇴 ----
  async function logout() {
    try { await send('POST', './api/auth/logout'); } catch { /* 쿠키는 서버가 지운다 */ }
    me = null; tickets = []; show(); $('menuBack').click(); toast('로그아웃했어요');
  }
  async function deleteMe() {
    try {
      const r = await send('DELETE', './api/me');
      if (!r.ok && r.status !== 401) { toast('탈퇴하지 못했어요. 잠시 뒤 다시 해 주세요.', true); return; }
      me = null; tickets = []; accountView.set({confirmOpen: false}); show(); $('menuBack').click(); toast('탈퇴했어요');
    } catch { toast('탈퇴하지 못했어요. 연결을 확인해 주세요.', true); }
  }
  // 내 정보 쪽에서 누른 것(account_view.tsx 가 전한다)
  accountView.on({
    avatarBig: () => { if (accountView.state.pickOpen) closePick(); else openPick(); },
    pickPhoto: () => { if (!saving) $('photoFile').click(); }, photoFile: photoChosen, pickCharacter,
    nameEdit: () => { if (accountView.state.nameOpen) closeName(); else openName(); },
    nameCancel: () => { closeName(); $('nameEdit').focus({preventScroll: true}); }, nameSubmit: submitName,
    logoutDevice, logoutOthers, exportData, logout,
    deleteAsk: () => { accountView.set({confirmOpen: true}); $('accountConfirmYes').focus({preventScroll: true}); },
    deleteNo: () => accountView.set({confirmOpen: false}), deleteYes: deleteMe,
  });

  me = answer.body!.me || null;
  show();
  if (me) { countUse('open'); await loadTickets(); }

  // 로그인에서 돌아옴(#login=ok · new · <오류>): 주소를 지운다. 성공(ok · new)이면 서랍 · 발권 화면을 열지 않고 지도 첫 화면 그대로 둔다.
  // 실패인데 이미 로그인돼 있으면 서랍 첫 화면, 로그인이 안 됐으면 서랍 없이 팝업 + 안내(오류 코드 원문은 보이지 않는다 · 취소는 오류 모양 아님)
  const back = /(?:^#|&)login=(\w+)/.exec(location.hash);
  if (back) {
    history.replaceState(null, '', location.pathname + location.search);
    const succeeded = back[1] === 'ok' || back[1] === 'new';
    if (!me) openSheet(LOGIN_ERRORS[back[1]!] || '로그인하지 못했어요. 잠시 뒤 다시 해 주세요.', back[1] !== 'denied');
    else if (!succeeded) $('settingsButton')?.click();
  }
}
