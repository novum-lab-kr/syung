// 열차 시트(아래 시트 몸통): 노선 · 열차 번호 · 급행/막차, 행선지, 지금 상태, 롤코면 자리 고르기 · 타기, 서울시 실시간 원본.
// 화면 조각(Preact)이라 그리기만 한다 — 고르기 · 1초마다 다시 그리기는 ui/popups.mts, 자리 누르기 · 타기는 modes/coaster/ride.mts 가 맡는다.
// 표시(DOM 모양 · class · 문구 · aria)는 옛 HTML 글자와 같다: 스타일(syung.css · popups 의 <style>)과 단추 찾기(.ride-pick .seat · .ride-go)가 그대로 맞는다.
// 자리 배치도 속(.ride-pick)과 타기 단추 글자는 ride.mts 가 DOM 을 직접 고친다(on · aria-pressed · textContent) — 그래서 연 순간의 값으로 한 번만 그리고
// 다시 그릴 때 같은 값을 넘긴다(Preact 는 값이 같으면 손대지 않는다). 배치도 속은 옛 글자(first_person.mts seatPickerHTML) 그대로.
import { render } from 'preact';

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

// 시트 몸통에 그리기 · 다시 그리기(같은 몸통이면 Preact 가 바뀐 곳만 고친다). 치우기는 station_sheet.tsx 의 clearPanel
export const drawTrainSheet = (body:HTMLElement, props:TrainSheetProps):void => render(<TrainSheet {...props} />, body);
