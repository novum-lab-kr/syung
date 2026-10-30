// 내 정보 부품: 내 통계 — 숫자 칸 네 개 · 날짜별 막대 · 예상 교통비. props 만 받는다(받기는 화면 user/account.mts).
export interface Stats {
  daysTogether:number; tickets:number; weeklyRides:number; recent:{ days:number; openDays:number; route:number; ticket:number };
  daily:{ day:string; open:number; route:number; ticket:number }[];
  fare:{ month:string; total:number; skipped:number; reasons:Record<string, number>; tickets:{ name:string; fare:number; rides:number; monthly:number }[] };
}

const FARE_REASONS:Record<string, string> = { route: '고른 경로가 없는 승차권', distance: '공식 거리 자료가 없는 노선', outside: '수도권 밖 구간',
  extra: '추가 운임 노선(신분당선 · 의정부경전철 · 공항철도 영종 구간)', bus: '요금 · 거리 자료가 없는 버스', none: '전철 · 버스를 타지 않는 승차권' };
const won = (count:number) => `${count.toLocaleString('ko-KR')}원`;

export const StatCell = ({ value, label }:{ value:string; label:string }) => <div class="st-cell"><b>{value}</b><small>{label}</small></div>;

export function StatsPanel({ stats }:{ stats:Stats }) {
  const most = Math.max(1, ...stats.daily.map(day => day.open + day.route + day.ticket)), fare = stats.fare, [, month] = fare.month.split('-').map(Number);
  const why = Object.entries(fare.reasons).map(([key, count]) => `${FARE_REASONS[key] || key} ${count}장`).join(' · ');
  return <>
    <div class="st-grid"><StatCell value={`${stats.daysTogether}일`} label="함께한 날" /><StatCell value={`${stats.tickets}장`} label="승차권" />
      <StatCell value={`${stats.recent.openDays}일`} label={`최근 ${stats.recent.days}일 슝 연 날`} /><StatCell value={`${stats.recent.route}번`} label={`최근 ${stats.recent.days}일 길찾기`} /></div>
    <div class="st-bars" role="img" aria-label={`최근 ${stats.recent.days}일 날짜별 사용 횟수`}>{stats.daily.map(day => {
      const count = day.open + day.route + day.ticket, [, dayMonth, date] = day.day.split('-').map(Number);
      return <i style={`height:${count ? Math.max(8, Math.round(count / most * 100)) : 0}%`} title={`${dayMonth}월 ${date}일 · ${count}번`}></i>;
    })}</div>
    <p class="st-note">{`한 주에 타는 횟수 ${stats.weeklyRides}번 · 승차권 본 횟수 ${stats.recent.ticket}번(최근 ${stats.recent.days}일)`}</p>
    {stats.tickets ? <div class="st-fare"><div class="st-fare-top"><span>{`${month}월 예상 교통비`}</span><b>{won(fare.total)}</b></div>
      <p class="st-note">승차권대로 다 탄다고 가정한 예상이에요</p>
      {fare.tickets.length > 0 && <ul class="st-fare-list">{fare.tickets.map(ticket => <li><span>{ticket.name}</span><small>{`${won(ticket.fare)} × ${ticket.rides}번`}</small><b>{won(ticket.monthly)}</b></li>)}</ul>}
      {fare.skipped ? <p class="st-skip">{`${fare.skipped}장 계산 못 함${why ? ` — ${why}` : ''}`}</p> : null}
      <p class="st-note">교통카드 어른 요금 · 고른 경로 거리 기준이에요. 갈아타는 시간 · 정기권 · 공휴일은 넣지 않았어요.</p></div> : null}
  </>;
}
