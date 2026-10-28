// 역 도착 시트(아래 시트 몸통): 노선 칩 · 역 이름 · 상태 줄 · 길찾기 두 단추, 곧 오는 열차(노선 · 방향마다 두 대), 출구.
// 화면 조각(Preact)이라 그리기만 한다 — 도착 정보 받기 · 고르기 · 15초마다 다시 그리기는 ui/popups.mts, 길찾기 단추 누르기는 ui/sheet.mts 가 맡는다.
// 표시(DOM 모양 · class · 문구 · aria)는 옛 HTML 글자와 같다: 스타일(syung.css · popups 의 <style>)과 단추 찾기(.st-journey [data-end])가 그대로 맞는다.
import { render } from 'preact';

// 노선 칩 하나 · 곧 오는 열차 한 줄 · 노선 · 방향 하나(ui/popups.mts 가 도착 정보에서 고른다)
export interface StationChip { name:string; color:string }
export interface ArrivalRow { text:string; destination:string; express:boolean; last:boolean }
export interface ArrivalCard { line:string; direction:string; toward:string; color:string; rows:ArrivalRow[] }
// 출구 한 칸: 번호 · 휠체어 가능
export interface ExitItem { ref:string; wheelchair:boolean }
// 받는 중(뼈대 줄 수) · 못 받음 · 받음(몇 시 기준 · 노선 · 방향들)
export type StationSheetState = { kind:'loading'; rows:number } | { kind:'failed' } | { kind:'ready'; time:string; cards:ArrivalCard[] };
export interface StationSheetProps { name:string; chips:StationChip[]; exits:ExitItem[]; state:StationSheetState }

function Head({ name, chips, sub }:{ name:string; chips:StationChip[]; sub:string }) {
  return <>
    <div class="tp-line">{chips.map(c => <span class="chip" style={`--c:${c.color}`}><span class="dot"></span>{c.name}</span>)}</div>
    <div class="tp-dest">{name}</div>
    <div class="tp-now">{sub}</div>
    <div class="st-journey"><button type="button" data-end="from">여기서 출발</button><button type="button" data-end="to">여기로 도착</button></div>
  </>;
}

function Card({ card }:{ card:ArrivalCard }) {
  return <div class="arr" style={`--c:${card.color}`}>
    <div class="arr-h"><span class="dot"></span>{card.line} <span class="muted">{card.direction}{card.toward ? ' · ' + card.toward : ''}</span></div>
    {card.rows.map(a => <div class="arr-t"><b>{a.text}</b><span class="muted">{a.destination}행{a.express ? ' · 급행' : ''}{a.last ? ' · 막차' : ''}</span></div>)}
  </div>;
}

function Exits({ exits }:{ exits:ExitItem[] }) {
  return <div class="exits">{exits.map(e => <span class="exit" title={`${e.ref}번 출구${e.wheelchair ? ' · 휠체어 가능' : ''}`}>{e.ref}{e.wheelchair && <i>♿</i>}</span>)}</div>;
}

export function StationSheet({ name, chips, exits, state }:StationSheetProps) {
  if (state.kind === 'failed') return <div class="train-inspect station-sheet"><Head name={name} chips={chips} sub="도착 정보를 불러오지 못했어요. 잠시 후 다시 눌러 주세요." /></div>;
  if (state.kind === 'loading') return <div class="train-inspect station-sheet">
    <Head name={name} chips={chips} sub="도착 정보 불러오는 중…" />
    <div class="sec">곧 오는 열차</div>
    <div class="arrs st-sk" aria-hidden="true">{Array.from({ length: state.rows }, () => <div class="arr"><i></i><i></i><i></i></div>)}</div>
  </div>;
  return <div class="train-inspect station-sheet">
    <Head name={name} chips={chips} sub={`서울시 실시간 도착정보 · ${state.time} 기준`} />
    <div class="sec">곧 오는 열차</div>
    {state.cards.length ? <div class="arrs">{state.cards.map(c => <Card card={c} />)}</div> : <div class="muted empty">지금 도착 예정 열차 정보가 없어요.</div>}
    {exits.length > 0 && <><div class="sec">출구</div><Exits exits={exits} /></>}
  </div>;
}

// 시트 몸통에 그리기 · 다시 그리기(같은 몸통이면 Preact 가 바뀐 곳만 고친다) · 치우기
export const drawStationSheet = (body:HTMLElement, props:StationSheetProps):void => render(<StationSheet {...props} />, body);
export const clearPanel = (body:HTMLElement):void => render(null, body);
