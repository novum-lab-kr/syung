// 열차 시트 몸통: 노선 · 열차 번호 · 급행/막차, 행선지, 지금 상태, 롤코면 자리 고르기 · 타기, 서울시 실시간 원본.
// props 만 받아 그린다 — 고르기 · 1초마다 다시 그리기는 ui/popups.mts, 자리 누르기 · 타기는 modes/coaster/ride.mts 가 맡는다.
// 표시(DOM 모양 · class · 문구 · aria)는 옛 HTML 글자와 같다: 스타일(syung.css · 아래 TRAIN_SHEET_CSS)과 단추 찾기(.ride-pick .seat · .ride-go)가 그대로 맞는다.
// 자리 배치도 속(.ride-pick)과 타기 단추 글자는 ride.mts 가 DOM 을 직접 고친다(on · aria-pressed · textContent) — 그래서 연 순간의 값으로 한 번만 그리고
// 다시 그릴 때 같은 값을 넘긴다(Preact 는 값이 같으면 손대지 않는다). 배치도 속은 옛 글자(first_person.mts seatPickerHTML) 그대로.

// 역 · 열차 시트가 같이 쓰는 기본 규칙: 화면은 ui/popups.mts 가 head 에 넣고, 스토리도 이 글자를 그대로 쓴다
export const TRAIN_SHEET_CSS = '.train-inspect{min-width:190px}.train-inspect .tp-line{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--c)}.train-inspect .tp-line .dot{width:9px;height:9px;border-radius:50%;background:var(--c)}.train-inspect .tp-line .no{color:#7a8a90;font-weight:600;font-variant-numeric:tabular-nums}.train-inspect .b{font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;color:#fff;background:var(--c)}.train-inspect .b.last{background:#141414}.train-inspect .tp-dest{font-size:20px;font-weight:800;margin:4px 0 2px;letter-spacing:-.01em}.train-inspect .tp-now{font-size:12px;color:#6b7b80}.train-inspect details{margin-top:8px;font-size:12px}.train-inspect summary{cursor:pointer;color:#8a979b;font-weight:600}.train-inspect table{border-collapse:collapse;font-size:12px;margin-top:4px}.train-inspect th{text-align:left;color:#6b7b80;font-weight:600;padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top}.train-inspect td{padding:2px 0}.train-inspect .sec{padding-top:8px;font-weight:800;color:#172429;border-bottom:1px solid #dbe1e2}.train-inspect .muted{color:#8a979b}';

// 서울시 실시간 원본 한 묶음(dl 칸) — 글자는 popups 가 옛것과 같게 만들어 넘긴다
export interface TrainRawView { station:string; status:string; direction:string; destination:string; recorded:string; ageSec:number; fetched:string }
// 자리 고르기(롤코만): 배치도 HTML · 타기 단추 글자
export interface TrainRideView { seatsHTML:string; goLabel:string }
export interface TrainSheetProps {
  color:string; line:string; trainNo:string; express:boolean; last:boolean;
  dest:string; now:string; ride:TrainRideView | null; raw:TrainRawView;
}

function Raw({ raw }:{ raw:TrainRawView }) {
  return <dl class="kv">
    <dt>역</dt><dd>{raw.station}</dd><dt>상태</dt><dd>{raw.status}</dd><dt>방향</dt><dd>{raw.direction}</dd><dt>행선지</dt><dd>{raw.destination}</dd>
    <dt>기록 시각</dt><dd>{`${raw.recorded} `}<span class="muted">{`(${raw.ageSec}초 전)`}</span></dd><dt>받은 시각</dt><dd>{raw.fetched}</dd>
  </dl>;
}

export function TrainSheet({ color, line, trainNo, express, last, dest, now, ride, raw }:TrainSheetProps) {
  return <div class="train-inspect" style={`--c:${color}`}>
    <div class="tp-line"><span class="dot"></span>{line}<span class="no">{trainNo}</span>{express && <span class="b ex">급행</span>}{last && <span class="b last">막차</span>}</div>
    <div class="tp-dest">{dest}</div>
    <div class="tp-now">{now}</div>
    {ride && <>
      <div class="sec">자리 고르고 타기 <span class="muted">· 위가 진행 방향</span></div>
      <div class="ride-pick" dangerouslySetInnerHTML={{ __html: ride.seatsHTML }}></div>
      <button type="button" class="ride-go">{ride.goLabel}</button>
    </>}
    <div class="sec">서울시 실시간 원본</div>
    <Raw raw={raw} />
  </div>;
}
