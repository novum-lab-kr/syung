// 타고 가기 카드: 카드 자체가 캐릭터의 말풍선(슝 소개 사이트 첫 화면 모양 — 시안 .storybook/ride_along.stories.tsx (라)).
// 큰 글 한 줄 · 한마디(형광펜, 기다리기 카드만) · 작은 글(또는 「다른 길 찾기 ›」) · ✕, 오른쪽 아래에 캐릭터 온몸(꼬리가 가리킨다).
// 그리기만 한다 — 글 · 그림 이름은 lib/ride-along.mts, 상태 · 위치 · 카메라는 ui/ride_along.mts
import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { RideCardView, RideDevView, RideInfoView, RideListView, RideSaid, RideSkySpot } from '../lib/ride-along.mts';
import type { WeatherTalk } from '../map/sky_weather.mts';
import type { ComponentChild } from 'preact';
import { GoalFlag, MapArrival, type ArrivalMap } from './ride_arrival.tsx';

const CLOSE = <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>;

export interface RideCardActions { close():void; detour():void; follow():void; answer?(value:'rode' | 'not_rode'):void }

// 개발자 회원만(2026-11-11 계획서 D2): 정답 누름 [탔음] [안 탔음] — 기초 버튼(components/button.tsx)과 같은 class(.sy-btn)로 그린다
// (그 파일을 부르면 첫 화면에 받는 파일이 늘어 모양만 같이 쓴다). 누른 쪽은 주 버튼 모양 · aria-pressed
const DEV_ANSWERS = [['rode', '탔음'], ['not_rode', '안 탔음']] as const;
function DevAnswer({ dev, answer }:{ dev:RideDevView; answer?:RideCardActions['answer'] }) {
  return <div class="rg-dev" role="group" aria-label="개발자 기록 — 탔는지 표시">
    {DEV_ANSWERS.map(([value, label]) => <button key={value} type="button" class={`sy-btn ${dev.answered === value ? 'sy-btn-primary' : 'sy-btn-secondary'}`}
      aria-pressed={dev.answered === value ? 'true' : 'false'} onClick={() => answer?.(value)}>{label}</button>)}
  </div>;
}

// 말풍선 글 조각(lib/ride-along RideSaid): 표시가 붙은 조각은 손으로 그은 밑줄(.rg-line) · 별표(.rg-star) — 2026-11-25 사용자 「밑줄 쫙 긋거나 별표 치거나」
const said = (parts:readonly RideSaid[]) => parts.map(part => typeof part === 'string' ? part : <span class={`rg-${part.mark}`}>{part.text}</span>);

// 색연필로 그린 것 같은 날씨 그림(2026-11-25 사용자): 선을 삐뚤빼뚤하게 밀고(feDisplacementMap) 색을 군데군데 비운다(종이 결)
const SKY_ART:Record<WeatherTalk['icon'] | 'moon', ComponentChild> = {
  sun: <><circle cx="24" cy="24" r="10" fill="#ffc928" stroke="#f08a24" stroke-width="2"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.3 4.3M33.2 33.2l4.3 4.3M10.5 37.5l4.3-4.3M33.2 14.8l4.3-4.3" stroke="#f08a24" stroke-width="3"/></>,
  moon: <><path d="M31 8a17 17 0 1 0 9 24A14 14 0 0 1 31 8z" fill="#ffd95a" stroke="#e0a526" stroke-width="2"/><path d="M9 10l1.5 3 3 1.5-3 1.5L9 19l-1.5-3-3-1.5 3-1.5z" fill="#ffd95a"/></>,
  cloud: <path d="M13 36a8 8 0 0 1 0-16 11 11 0 0 1 21-3 9 9 0 0 1 1 19z" fill="#cfe3f7" stroke="#6f9fd8" stroke-width="2.2"/>,
  rain: <><path d="M5 25a19 19 0 0 1 38 0q-4.75-5-9.5 0-4.75-5-9.5 0-4.75-5-9.5 0-4.75-5-9.5 0z" fill="#ff7b6b" stroke="#d9483b" stroke-width="2"/><path d="M24 6v-3M24 25v14a4 4 0 0 1-8 0" stroke="#7a5a48" stroke-width="2.6"/><path d="M36 33l-2 6M42 31l-2 6M8 33l-2 6" stroke="#4d9be6" stroke-width="2.6"/></>,
  snow: <><path d="M13 27a7 7 0 0 1 0-14 10 10 0 0 1 19-3 8 8 0 0 1 1 17z" fill="#dfe9f5" stroke="#8fa6c4" stroke-width="2.2"/><path d="M12 34v8M8.5 36l7 4M15.5 36l-7 4M25 33v8M21.5 35l7 4M28.5 35l-7 4M37 34v8M33.5 36l7 4M40.5 36l-7 4" stroke="#5aa7ea" stroke-width="2"/></>,
  bolt: <><path d="M13 27a7 7 0 0 1 0-14 10 10 0 0 1 19-3 8 8 0 0 1 1 17z" fill="#aab5c3" stroke="#6f7b8c" stroke-width="2.2"/><path d="M26 22l-8 12h6l-3 11 10-14h-6l4-9z" fill="#ffc928" stroke="#f08a24" stroke-width="1.6"/></>,
};
function SkyArt({ icon }:{ icon:WeatherTalk['icon'] }) {
  const night = document.documentElement.dataset.theme === 'dark';   // 풍경과 같은 밤 판정(lib/ride_info_motion) — 맑은 밤은 해 대신 달
  return <svg class="rg-sky-art" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <filter id="rg-crayon" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="2" seed="4" result="wobble"/>
      <feDisplacementMap in="SourceGraphic" in2="wobble" scale="2.6" result="shape"/>
      <feTurbulence type="fractalNoise" baseFrequency=".8 .5" numOctaves="2" seed="9"/>
      <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 2.4" result="grain"/>
      <feComposite in="shape" in2="grain" operator="in"/>
    </filter>
    <g filter="url(#rg-crayon)">{SKY_ART[night && icon === 'sun' ? 'moon' : icon]}</g>
  </svg>;
}

// 내릴 곳 날씨 한 줄(받으면 나타난다 — lib/ride_info_motion skySay · 지연 로드): 색연필 그림 + 「지금 ○○역엔 비가 와요, 12도예요.」 + 별표 한마디(「우산 챙겨요!」). 못 받으면 줄 없이
function RideSky({ spot }:{ spot:RideSkySpot }) {
  const [sky, setSky] = useState<WeatherTalk | null>(null), key = spot.at.join();
  useEffect(() => {
    let gone = false;
    setSky(null);
    void import('../lib/ride_info_motion.mts').then(motion => motion.skySay(spot.at)).then(talk => { if (!gone) setSky(talk); }).catch(() => { /* 날씨 줄 없이 */ });
    return () => { gone = true; };
  }, [key]);
  return sky ? <p class="rg-more rg-more-sky"><SkyArt icon={sky.icon} /><span>지금 {spot.name}엔 {sky.text}{sky.tip && <> <span class="rg-star">{sky.tip}</span></>}</span></p> : null;
}

export function RideCard({ view, actions }:{ view:RideCardView; actions:RideCardActions }) {
  // rg-stack: 「다시 따라가기」 · 말풍선 · 캐릭터를 한 자리에 쌓는다(말풍선 높이가 글에 따라 바뀌어도 단추는 그 위에)
  // 정보 화면이면 말하는 투의 글(talk — 목록과 겹치는 말은 뺀다) · 말풍선 안에 내려서 할 일 한 줄 · 내릴 곳 날씨 한 줄도(2026-11-25 사용자 시안 16 — 없는 줄은 뺀다)
  const info = view.info, talk = info?.talk;
  return <div class="rg-stack">
    {!view.following && <button type="button" class="sheet-follow rg-follow" onClick={actions.follow}>다시 따라가기</button>}
    <div class="rg-talk" role="status" aria-live="polite">
      <b>{talk ? said(talk.title) : view.title}</b>
      {view.say && <p class="rg-said"><span class="rg-pen">{view.say}</span></p>}
      <small>{view.detour ? <a href="#" class="rg-detour" onClick={event => { event.preventDefault(); actions.detour(); }}>다른 길 찾기 ›</a> : talk ? said(talk.sub) : view.sub}</small>
      {talk?.todo && <p class="rg-more">{said(talk.todo)}</p>}
      {info?.sky && <RideSky spot={info.sky} />}
      {view.dev && <DevAnswer dev={view.dev} answer={actions.answer} />}
      <button type="button" class="rg-x" aria-label="타고 가기 끝내기" title="타고 가기 끝내기" onClick={actions.close}>{CLOSE}</button>
    </div>
    <i class={view.flip ? 'rg-sprout flip' : 'rg-sprout'} aria-hidden="true" style={`background-image:url("./brand/characters/${view.image}")`} />
  </div>;
}

// 목록 칸 위 · 아래 끝 그림(2026-11-25 사용자 확정 「그리다 만 색연필 선」): 노선 선을 색연필로 긋다 만 것처럼 —
// 위 끝은 선이 옅은 빗금 몇 개로 흩어지고, 아래 끝은 거칠게 끊긴 자리에 색연필 한 자루가 비스듬히 놓여 심이 선 끝에 닿는다.
// 색 = 지금 구간 노선 색(갈아타면 바뀐다) · 질감은 날씨 그림(#rg-crayon)과 같은 값 · 나무 · 쇠테 · 지우개 색은 syung.css(풍경 색표)
const EDGE_CRAYON = <filter id="rg-edge-crayon" x="-20%" y="-20%" width="140%" height="140%">
  <feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="2" seed="4" result="wobble"/>
  <feDisplacementMap in="SourceGraphic" in2="wobble" scale="2.6" result="shape"/>
  <feTurbulence type="fractalNoise" baseFrequency=".8 .5" numOctaves="2" seed="9"/>
  <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 2.4" result="grain"/>
  <feComposite in="shape" in2="grain" operator="in"/>
</filter>;
// 목록의 노선 선(폭 4px)용 — 같은 질감 · 선이 좁아 옆으로 넉넉히 잡고, 줄 이음매가 패이지 않게 흔들림은 작게
const ROW_CRAYON = <filter id="rg-row-crayon" x="-100%" y="0" width="300%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="2" seed="4" result="wobble"/>
  <feDisplacementMap in="SourceGraphic" in2="wobble" scale="1.8" xChannelSelector="R" yChannelSelector="R" result="shape"/>
  <feTurbulence type="fractalNoise" baseFrequency=".8 .5" numOctaves="2" seed="9"/>
  <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 2.4" result="grain"/>
  <feComposite in="shape" in2="grain" operator="in"/>
</filter>;
// 목록 글씨용(역 이름 · 갈아타기 줄 — 2026-11-25 사용자): 읽혀야 하니 흔들림은 선보다 약하게 · 알갱이도 덜 패이게. 큰 글씨(이번 역 34px)는 조금 더 세게
const textCrayon = (id:string, wobble:number, grain:string) => <filter id={id} x="-5%" y="-15%" width="110%" height="130%">
  <feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="2" seed="4" result="wobble"/>
  <feDisplacementMap in="SourceGraphic" in2="wobble" scale={wobble} xChannelSelector="R" yChannelSelector="G" result="shape"/>
  <feTurbulence type="fractalNoise" baseFrequency=".8 .5" numOctaves="2" seed="9"/>
  <feColorMatrix values={`0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${grain}`} result="grain"/>
  <feComposite in="shape" in2="grain" operator="in"/>
</filter>;
const TEXT_CRAYON = <>{textCrayon('rg-text-crayon', 0.9, '-2.2 2.3')}{textCrayon('rg-text-crayon-big', 1.6, '-2.6 2.4')}</>;
// top · bottom = 그쪽으로 노선 선이 이어질 때만 보인다(이어질 줄이 없으면 숨김 — 2026-11-25 사용자). 필터는 목록의 선 · 점도 쓰니 늘 그려 둔다
function RideEdge({ color, top, bottom }:{ color:string; top:boolean; bottom:boolean }) {
  return <>
    <i class={`rg-edge top${top ? '' : ' off'}`} aria-hidden="true"><svg viewBox="0 0 44 56" fill="none" stroke={color} stroke-linecap="round">
      <g filter="url(#rg-edge-crayon)">
        <path d="M22 62V52l-2-4" stroke-width="4.4"/><path d="M17 43l8-11" stroke-width="4.2" opacity=".9"/><path d="M18 28l7-10" stroke-width="3.4" opacity=".68"/><path d="M19 13l5-8" stroke-width="2.6" opacity=".45"/>
      </g>
    </svg></i>
    <i class={`rg-edge bottom${bottom ? '' : ' off'}`} aria-hidden="true"><svg viewBox="0 0 120 76" fill="none" stroke-linecap="round" stroke-linejoin="round">
      {EDGE_CRAYON}{ROW_CRAYON}{TEXT_CRAYON}
      <g filter="url(#rg-edge-crayon)">
        <path d="M22 -6V40l-3 6 5 4-4 5 2 5" stroke={color} stroke-width="4.4"/>
        <g transform="translate(22 61) rotate(-28)">
          <path class="wood" d="M1 0l13-6v12z"/><path d="M0 0l5.5-2.5v5z" fill={color}/>
          <rect x="14" y="-6" width="60" height="12" fill={color}/><path class="shade" d="M14 2.5h60"/>
          <rect class="band" x="74" y="-6" width="8" height="12"/><rect class="rubber" x="82" y="-6" width="9" height="12" rx="3"/>
        </g>
      </g>
    </svg></i>
  </>;
}

// 여정 전체 역(정류장) 세로 목록(lib/ride-along rideList · 2026-11-25 사용자 시안 15 · 16): 역을 전부 적고 손가락으로 스크롤해 다 볼 수 있다(칸은 말풍선 밑까지 — 말풍선 · 새싹이는 그 위에 떠 있다).
// 처음 열 때 · 이번 역이 바뀔 때만 이번 역을 말풍선 위로 보이는 부분의 가운데로 스크롤한다(움직임 줄이기면 바로) — 그 사이엔 사용자가 스크롤한 자리를 그대로 둔다.
// 손가락이 닿아 있는 동안 역이 바뀌면 손을 뗀 뒤에 맞춘다. 줄 높이가 정해져 있어(syung.css .rg-list — 이번 역만 72px · 나머지 40px) 자리는 줄 번호 × 40px
const LIST_ROW_PX = 40, EDGE_TOP_PX = 56, EDGE_BOTTOM_PX = 76;   // 끝 그림 높이(syung.css .rg-edge.top · .bottom)
function RideList({ list, unit }:{ list:RideListView; unit:RideInfoView['unit'] }) {
  const box = useRef<HTMLDivElement>(null), touching = useRef(false), waiting = useRef(false), opened = useRef(false);
  const centre = useCallback((smooth:boolean) => {
    const calm = !smooth || matchMedia('(prefers-reduced-motion:reduce)').matches;
    box.current?.scrollTo({top: list.at * LIST_ROW_PX, behavior: calm ? 'auto' : 'smooth'});
  }, [list.at]);
  useEffect(() => {
    if (touching.current) { waiting.current = true; return; }
    centre(opened.current);
    opened.current = true;
  }, [list.at]);
  // 끝 그림은 노선 선이 그 끝까지 닿을 때만: 첫 줄 가운데(선이 시작하는 곳)가 위 끝 그림 자리 안 · 마지막 줄 가운데가 아래 끝 그림 자리 안
  const [ends, setEnds] = useState({top: false, bottom: false});
  const measure = useCallback(() => {
    const host = box.current, rows = host?.querySelectorAll('li');
    const first = rows?.[0], last = rows?.[rows.length - 1];
    if (!host || !first || !last) return;
    const frame = host.getBoundingClientRect(), head = first.getBoundingClientRect(), tail = last.getBoundingClientRect();
    const top = head.top + head.height / 2 < frame.top + EDGE_TOP_PX, bottom = tail.top + tail.height / 2 > frame.bottom - EDGE_BOTTOM_PX;
    setEnds(seen => seen.top === top && seen.bottom === bottom ? seen : {top, bottom});
  }, []);
  useEffect(measure, [list.at, list.rows.length]);
  const release = useCallback(() => { touching.current = false; if (waiting.current) { waiting.current = false; centre(true); } }, [centre]);
  const lined = list.rows.slice(0, list.at + 1).reverse().concat(list.rows).find(row => row.kind !== 'gap');   // 지금 구간(없으면 첫 구간)의 노선 색
  return <div class="rg-list-box"><div class="rg-list" ref={box} onScroll={measure} onTouchStart={() => { touching.current = true; }} onTouchEnd={release} onTouchCancel={release}>
    <ol>
      {list.rows.map((row, order) => {
        const gone = order < list.at ? ' past' : '';   // 지난 줄(갈아타기 · 한 줄 구간 포함)은 점 · 선까지 흐리게
        if (row.kind === 'gap') return <li class={`gap${gone}`}><i>{row.text}</i></li>;
        if (row.kind === 'leg') return <li class={`leg${gone}`} style={`--rg-line:${row.color}`}><b>{row.text}</b></li>;
        const now = order === list.at, state = now ? 'now' : order < list.at ? 'past' : 'rest';
        return <li class={`stop ${state}${row.edge ? ` ${row.edge}` : ''}`} style={`--rg-line:${row.color}`} aria-current={now ? 'step' : undefined}>
          {now && <small>이번 {unit}</small>}
          <span><b>{row.name}</b>{row.off && <em>내림</em>}</span>
        </li>;
      })}
    </ol>
  </div>{lined && <RideEdge color={lined.color} top={ends.top} bottom={ends.bottom} />}</div>;
}

// 지하철 · 버스를 탄 동안 지도 대신(2026-11-25 사용자 결정): 「가고 있다」 풍경 움직임(lib/ride_info_motion — 지연 로드) · 여정 전체 역(버스는 정류장) 목록.
// 말풍선 카드(✕ · 다시 따라가기)는 그 위에 그대로 둔다
// 가운데 로고도 같은 모듈이 그린다(로그인 화면의 로고 움직임 — 노란 바탕 없이 · 2026-11-25 사용자)
// 내려서 할 일 · 내릴 곳 날씨는 말풍선 안에(RideCard — 시안 16)
function RideInfo({ info }:{ info:RideInfoView }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false, stop:(() => void) | null = null;
    void import('../lib/ride_info_motion.mts').then(motion => { if (!gone && box.current) stop = motion.startRideMotion(box.current, info.here); }).catch(() => { /* 풍경 없이 역 목록만 */ });
    return () => { gone = true; stop?.(); };
  }, []);
  return <section class="rg-info" aria-label="타고 가는 곳">
    <div class="rg-info-view" aria-hidden="true"><div class="rg-info-scene" ref={box}></div></div>
    <RideList list={info.list} unit={info.unit} />
  </section>;
}

// 장면·플레이어를 못 받으면 기존 말풍선으로 복귀한다. MapArrival 정리에서 내 위치 숨김도 해제된다.
function ArrivalCard({ view, actions, map, hideMe }:{ view:RideCardView; actions:RideCardActions; map:ArrivalMap; hideMe?:(on:boolean) => void }) {
  const [failed, setFailed] = useState(false), fail = useCallback(() => setFailed(true), []);
  const at = view.arrival?.at;
  if (failed || !view.arrival || !at) return <RideCard view={view} actions={actions} />;
  return <MapArrival map={map} at={at} hideMe={hideMe} arrival={view.arrival} onClose={actions.close} onError={fail} />;
}

// 카드 자리(ui/ride_along 이 만든다)에 그리기 · 다시 그리기 · 치우기(view 가 null)
// 타고 가는 동안 길 끝 자리에 깃발을 미리 세운다(GoalFlag — 도착 뒤에도 같은 열쇠로 남는다).
// 도착하면 말풍선 대신 지도 속 도착 자리에서 연기한다(MapArrival — map · 도착 자리가 있을 때만, 없으면 「슝 도착!」 말풍선).
// 타는 중엔 카드 앞(카드가 깃발을 덮는다) · 도착하면 연기 뒤에 둬서 열차 · 새싹이보다 앞에 그린다(같은 z-index — 문서 차례가 위아래)
export function drawRideCard(host:HTMLElement, view:RideCardView | null, actions:RideCardActions, map?:ArrivalMap, hideMe?:(on:boolean) => void):void {
  const goal = view?.goal?.at, flag = map && goal ? <GoalFlag key="goal" map={map} at={goal} /> : null;
  const draw = (body:ComponentChild, flagOnTop = false) => render(flag ? <>{flagOnTop ? null : flag}{body}{flagOnTop ? flag : null}</> : body, host);
  const at = view?.arrival?.at;
  if (view?.arrival && map && at) { draw(<ArrivalCard key="arrival" view={view} actions={actions} map={map} hideMe={hideMe} />, true); return; }
  const card = view ? <RideCard key="card" view={view} actions={actions} /> : null;
  draw(view?.info ? <><RideInfo key="info" info={view.info} />{card}</> : card);
}
