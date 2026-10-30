// 경로 선택 머리말(#129): 왼쪽 달력 날짜 | 오른쪽 '출발지에서 → 도착지까지 → 시각 출발'(목적지가 제목). props 만 받아 그린다
export interface RouteWhen { month:number; day:number; weekday:string; time:string }

export function RouteHead({ when, from, to }:{ when:RouteWhen | null; from:string | undefined; to:string | undefined }) {
  return <div class="rt-sum">{when && <div class="rt-cal" id="routeWhen" aria-label={`${when.month}월 ${when.day}일 ${when.weekday}`}><span class="rt-month">{when.month}월</span><b class="rt-day">{when.day}</b><span class="rt-wd">{when.weekday}</span></div>}
    <div class="rt-trip"><p class="rt-origin"><b id="routeFrom">{from}</b>에서</p>
      <p class="rt-dest"><b id="routeTo">{to}</b><span class="rt-to-sfx">까지</span></p>
      {when && <p class="rt-time"><b>{when.time} 출발</b><span>이 시각 출발 기준으로 찾은 경로</span></p>}</div></div>;
}
