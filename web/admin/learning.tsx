// 관리 화면 '학습 현황'(admin/learning.html 의 <main>): 지하철 · 버스 탭 — 오픈 기준 · 채점 · 모은 기록 · 노선 · 역 · 날짜별 표, 버스 학습 · 수집.
// 셈은 admin/learning_data.mts. 자료는 /admin/learning.json 하나(매일 03:10 재학습 때 바뀜 · 401 이면 로그인 화면으로).
// 받은 뒤 옛 차례대로(오픈 기준 → 버스 → 지하철) 읽어 한 번에 그린다. 못 받으면(또는 자료가 이상해 읽다 멈추면) 첫 그림에 '불러오지 못했어요'.
// 화면 상태는 view 하나 — set() 이 바꾸고 바로(같은 작업 안에서) 다시 그린다(회원 · 디버깅 화면과 같은 틀).
// 표시(DOM 모양 · class · 문구 · aria)는 옛 HTML 과 같다 — 첫 그림은 HTML 에 그대로 있고 이 모듈이 비우고 그린다.
import { createRef, render } from 'preact';
import type { ComponentChildren } from 'preact';
import {
  BUS_DAYS, BUS_TYPES, CRITERIA, events, firstStopLine, fmt, growth, lineColor, lineTiers, md, openPass, pct, r1, scoreChart, scoreDelta, scores, sightings, stopRows, addDay, ENOUGH, byLineOrder,
} from './learning_data.mts';
import type { Bus, BusScore, Day, Gap, History, Latest, LineValues, Replay, ReplayWindow, Score } from './learning_data.mts';
import type { Learning } from './learning_data.mts';

// 받은 자료로 채운 칸(없으면 첫 그림 그대로)
interface Filled {
  open?:{ text:string; windows:ReplayWindow[] | null; criteria:typeof CRITERIA };
  bus?:{ days:Bus['days'] & object; routes:NonNullable<Bus['routes']>; learned:NonNullable<NonNullable<Bus['pace']>['routes']>; paceDays?:number; scores:BusScore[]; shown?:BusScore };
  subway?:{ last?:Score; scores:Score[]; days:Day[]; history:History[]; latest:Latest; generatedAt:string };
}
interface View { tab:number; touched:boolean; filled:Filled; error:boolean; stopLine:string | null }
let view:View = { tab: 0, touched: false, filled: {}, error: false, stopLine: null };
const main = document.querySelector('main')!;
const tabRefs = [createRef<HTMLButtonElement>(), createRef<HTMLButtonElement>()];
function set(patch:Partial<View>) { view = { ...view, ...patch }; render(<LearningPage />, main) }

// 지하철 · 버스 탭(#bus 로 버스 탭을 바로 연다)
const TABS:[string, string, string][] = [['tabSubway', 'panelSubway', ''], ['tabBus', 'panelBus', '#bus']];
function showTab(index:number, focus?:boolean) {
  set({ tab: index, touched: true });
  if (focus) tabRefs[index]!.current!.focus();
  history.replaceState(null, '', TABS[index]![2] || location.pathname + location.search);
}

// ---- 작은 조각 ----
const Dot = ({ color }:{ color:string }) => <span class="dot" style={`--c:${color}`}></span>;
const km = (value:number | null | undefined) => value == null ? '–' : `${value}m`;
const sign = (value:number) => `${value > 0 ? '+' : ''}${value}초`;
function Sgn({ value }:{ value:number }) {
  if (value > 0) return <span class="up">{`+${value}`}</span>;
  return value < 0 ? <span class="dn">{`−${-value}`}</span> : <>0</>;
}
function Pair({ before, after }:{ before:number | null; after:number | null }) {
  if (after == null) return <>–</>;
  return before == null ? <>{`${after}`}</> : <>{`${before} → `}<b>{after}</b></>;
}
function PerCent({ pace }:{ pace:number }) {
  const value = pct(pace);
  if (value > 0) return <span class="up">{`+${value}%`}</span>;
  return value < 0 ? <span class="dn">{`−${-value}%`}</span> : <>0%</>;
}
// 배운 값 · 없으면 회색 기본값(기본값도 없으면 –)
function OrDefault({ value, fallback, show }:{ value:number | null | undefined; fallback:number | null | undefined; show:(value:number) => ComponentChildren }) {
  if (value != null) return <>{show(value)}</>;
  return <span class="def">{fallback != null ? show(fallback) : '–'}</span>;
}
function PaceWords({ pace }:{ pace:number | null | undefined }) {
  if (pace == null) return <>시간표대로 달려요</>;
  const value = pct(pace);
  if (value === 0) return <>시간표대로 달려요</>;
  return value < 0 ? <>시간표보다 <span class="faster">{`${-value}% 빠르게`}</span> 달려요</> : <>시간표보다 <span class="slower">{`${value}% 느리게`}</span> 달려요</>;
}

function Growth({ days, value, note }:{ days:{ date:string }[]; value:(day:never) => number; note:string }) {
  const chart = growth(days, value as (day:{ date:string }) => number);
  if (!chart) return <p class="muted">아직 기록이 없어요.</p>;
  return <>
    <div><svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`학습용 기록 누적 ${fmt(chart.total)}`}>
      <defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--syung)" stop-opacity=".55" /><stop offset="1" stop-color="var(--syung)" stop-opacity=".05" /></linearGradient></defs>
      <polygon points={chart.polygon} fill="url(#gf)" />
      <polyline points={chart.line} fill="none" stroke="var(--syung-deep)" stroke-width="3" stroke-linejoin="round" />
      <line x1={chart.left} x2={chart.width - chart.right} y1={chart.base} y2={chart.base} stroke="var(--rule)" />
      {chart.points.map(point => <>
        <circle cx={point.x} cy={point.y} r="4" fill="var(--paper)" stroke="var(--syung-deep)" stroke-width="2.5" /><text x={point.x} y={chart.height - 8} text-anchor="middle">{point.label}</text>
        {point.value && <text class="val" x={point.x} y={point.y - 10} text-anchor={point.value.anchor}>{point.value.text}</text>}
      </>)}
    </svg></div>
    <p class="muted" style="margin:6px 0 0;font-size:12.5px">{note}</p>
  </>;
}

function ScoreChart({ list }:{ list:Score[] }) {
  const chart = scoreChart(list);
  if (!chart) return <p class="muted">아직 채점 기록이 없어요.</p>;
  return <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="날마다 채점한 오차">
    {chart.grid.map(row => <><line x1={chart.left} x2={chart.width - chart.right} y1={row.y} y2={row.y} stroke="var(--rule)" /><text x={chart.left} y={row.y - 3}>{`${row.label}초`}</text></>)}
    {chart.points.map(point => <>
      {point.cur != null && <><line x1={point.x} x2={point.x} y1={point.cur} y2={point.candY} stroke="var(--muted)" stroke-width="2" /><circle cx={point.x} cy={point.cur} r="8" fill="var(--paper)" stroke="var(--muted)" stroke-width="2" /></>}
      <circle cx={point.x} cy={point.candY} r="5" fill="var(--syung-deep)" /><text class="val" x={point.x + 9} y={point.candY + 4}>{point.cand}</text>
      <text x={point.x} y={point.bottom} text-anchor="middle">{point.label}</text>
    </>)}
  </svg>;
}

// ---- 오픈 기준(learning.json replay — retrain 이 replay_score.mjs 로 매긴 화면 재현 점수, 2026-10-19 덕배 · Codex 상의) ----
function readOpen(replay:Replay | undefined):NonNullable<Filled['open']> {
  const days = replay?.days || [], last = days.at(-1), criteria = replay?.criteria || CRITERIA;
  if (!last) return { text: '아직 다시 그린 날이 없어요. 고정 채점 창은 10/19 부터 모아요 — 다음 날 새벽 03:10 학습 때 처음 매겨요.', windows: null, criteria };
  const day = `${last.day.slice(0, 4)}-${last.day.slice(4, 6)}-${last.day.slice(6)}`, windows = last.windows.filter(win => win.events);
  return { text: `${md(day)} 화면을 다시 그려 봤어요: ${windows.length}개 창 가운데 ${openPass(windows, criteria)}개가 기준을 다 넘었어요.${days.length > 1 ? ` (${days.length}일치 기록)` : ''}`, windows, criteria };
}
function Cell({ value, ok, text }:{ value:number | undefined; ok:boolean; text:string }) {
  return value == null ? <td>—</td> : <td class={ok ? 'ok' : 'no'}>{text}</td>;
}
function OpenRow({ win, criteria }:{ win:ReplayWindow; criteria:typeof CRITERIA }) {
  const arrive = win.arrive || {}, depart = win.depart || {}, stalls = win.stalls || {};
  return <tr><td>{win.line}</td><td>{win.window}</td><td>{win.trains ?? '—'}</td>
    <Cell value={arrive.signedMedian} ok={Math.abs(arrive.signedMedian!) <= criteria.bias} text={sign(arrive.signedMedian!)} />
    <Cell value={arrive.absMedian} ok={arrive.absMedian! <= criteria.absMedian && arrive.p90! <= criteria.p90} text={`${arrive.absMedian} · ${arrive.p90}초`} />
    <Cell value={depart.signedMedian} ok={Math.abs(depart.signedMedian!) <= criteria.bias} text={sign(depart.signedMedian!)} />
    <Cell value={depart.absMedian} ok={depart.absMedian! <= criteria.absMedian && depart.p90! <= criteria.p90} text={`${depart.absMedian} · ${depart.p90}초`} />
    <Cell value={stalls.n} ok={stalls.n! <= criteria.stalls} text={`${stalls.n}번 · 열차·시간당 ${stalls.perTrainHour}`} />
    <td>{win.coverage != null ? `${Math.round(win.coverage * 100)}%` : '—'}</td></tr>;
}

// ---- 버스: 모으는 현황 + 밤 학습(구간 빠르기, bus_pace.mjs)이 배운 노선 · 날마다 채점(learning.json bus — build_learning_stats.bus_stats) ----
function readBus(bus:Bus | undefined, genDay:string):NonNullable<Filled['bus']> {
  const days = (bus?.days || []).filter(day => day.date < genDay), learned = bus?.pace?.routes || [], list = (bus?.scores || []).filter(item => item.results?.pace);
  // 큰 숫자: 지도 볼 때(30초마다) 거리가 1,000초 넘게 매겨진 마지막 날
  const shown = [...list].reverse().find(item => (item.results.pace!.gap30?.n as number) >= 1000);
  return { days, routes: bus?.routes || [], learned, paceDays: bus?.pace?.days, scores: list, shown };
}
function BusHero({ bus }:{ bus:Filled['bus'] }) {
  let label = '버스 도착 시각 예측', big = <b class="word" id="bState">모으는 중</b>, cls = 'delta same', delta = '불러오는 중', text = '', step = 0, steps:[string, string][] = [];
  if (bus) {
    const { days, learned, scores: list, shown } = bus, count = days.length, rows = days.reduce((sum, day) => sum + day.rows, 0);
    if (shown) {
      const result = shown.results, mean = result.pace!.gap30!.meanAbs!, was = result.recent!.gap30!.meanAbs!, rare = result.pace!['gap60+'], rareWas = result.recent!['gap60+'] as Gap;
      label = '버스 위치 오차 · 지도 볼 때 평균';
      big = <><b id="bState">{mean}</b><span>m</span></>;
      cls = `delta ${mean < was ? 'down' : 'same'}`;
      delta = mean < was ? `▼ 예전 방식(최근 속도, ${was}m)보다 ${was - mean}m 줄었어요` : `예전 방식(최근 속도)도 ${was}m · 비슷해요`;
      text = `${md(shown.date)} 버스 기록을 화면처럼 다시 그려 보니, 배운 노선 ${shown.trainedRoutes}개에서 지도 볼 때 평균 ${mean}m${rare?.n ? `, 드물게 받을 때 ${rareWas.meanAbs}m → ${rare.meanAbs}m` : ''} 어긋났어요. 노선 · 시간대 · 50m 구간마다 걸린 시간을 매일 새벽 배워요.`;
    } else if (learned.length) delta = `${learned.length}개 노선을 배웠어요 · 채점은 기록이 더 쌓이면`;
    else delta = count >= BUS_DAYS ? '기록이 다 모였어요 · 오차를 잴 차례예요' : `${count}/${BUS_DAYS}일 모았어요`;
    if (!shown) text = count ? `${md(days[0]!.date)}부터 ${count}일 동안 버스 위치 ${fmt(rows)}건을 모았어요. 일주일쯤 모이면 지하철처럼 오차부터 재고, 정류장 사이 달리는 시간을 구간마다 배워요.`
      : '버스 위치를 모으기 시작했어요. 오늘 모은 기록은 내일 새벽 03:10에 여기 나타나요.';
    if (list.length) step = 2; else step = learned.length ? 1 : 0;
    steps = [['기록 모으기', `${count}일`], ['구간마다 배우기', learned.length ? `${learned.length}개 노선` : '모은 뒤'], ['날마다 채점', list.length ? `${list.length}일` : '배운 뒤']];
  }
  return <section class="box hero" aria-label="버스 학습 상태">
    <div>
      <small id="bLabel">{label}</small>
      <div class="big" id="bBig">{big}</div>
      <span class={cls} id="bDelta">{delta}</span>
      <p id="bText">{text}</p>
    </div>
    <ul class="kinds steps" id="bSteps">{bus && <><h3>배우는 순서</h3>{steps.map(([title, value], index) => <li class={index === step ? 'now' : undefined}>{`${index + 1}. ${title}`}<b>{value}</b></li>)}</>}</ul>
  </section>;
}
function BusPanel({ bus }:{ bus:Filled['bus'] }) {
  const days = bus?.days || [], last = days.at(-1), rows = days.reduce((sum, day) => sum + day.rows, 0), calls = days.reduce((sum, day) => sum + day.calls, 0), routes = bus?.routes || [];
  const learned = bus?.learned || [], list = bus?.scores || [];
  return <div class="panel" id="panelBus" role="tabpanel" aria-labelledby="tabBus" hidden={view.tab !== 1}>
    <BusHero bus={bus} />
    <section class="stats" aria-label="모은 버스 기록">
      <div class="stat"><small id="bDayLabel">{bus && last ? `${md(last.date)} 하루 모은 기록` : '하루 모은 기록'}</small><b id="bToday">{bus && last ? fmt(last.rows) : '–'}</b><span id="bTodaySub">{bus && last ? `${fmt(last.calls)}번 불러서` : ''}</span></div>
      <div class="stat"><small>지금까지</small><b id="bTotal">{bus ? fmt(rows) : '–'}</b><span id="bTotalSub">{bus ? `${days.length}일 · ${fmt(calls)}번 불러서` : ''}</span></div>
      <div class="stat"><small>모은 노선</small><b id="bRoutes">{bus && routes.length ? `${routes.length}개` : '–'}</b><span id="bRoutesSub">{bus ? routes.slice(0, 3).map(route => route.name).join(' · ') : ''}</span></div>
    </section>
    <section class="box" id="bScoreBox" hidden={!list.length}>
      <h2>날마다 채점한 거리 오차</h2>
      <div class="tw"><table class="wide"><thead><tr><th>채점한 날</th><th>배운 노선</th><th>지도 볼 때<br />앞지르지 않음</th><th>지도 볼 때<br />최근 속도</th><th>지도 볼 때<br />배운 빠르기</th><th>드물게 받을 때<br />최근 속도 → 배운 빠르기</th></tr></thead>
        <tbody id="bScoreTable">{[...list].reverse().map(item => {
          const result = item.results, near = (kind:string) => result[kind]!.gap30!, rare = (kind:string) => result[kind]!['gap60+']!;
          return <tr class={item === bus?.shown ? 'sep' : undefined}><td>{md(item.date)}</td><td>{`${item.trainedRoutes}개`}</td>
            {near('pace').n ? <><td>{km(near('none').meanAbs)}</td><td>{km(near('recent').meanAbs)}</td><td><b>{km(near('pace').meanAbs)}</b></td></> : <><td>–</td><td>–</td><td>–</td></>}
            <td>{rare('pace').n ? <>{`${km(rare('recent').meanAbs)} → `}<b>{km(rare('pace').meanAbs)}</b></> : '–'}</td></tr>;
        })}</tbody></table></div>
      <p class="note">그 날 서버가 받은 버스 위치를 화면처럼 다시 그려, 1초마다 그린 자리와 실제 자리의 거리(평균, m)를 쟀어요. 배운 빠르기는 그 날 전 기록으로만 배운 값이에요. 지도 볼 때 = 30초마다 받는 노선, 드물게 = 학습용으로 1분 넘게 띄엄띄엄 받는 노선이에요. 실제 자리는 받은 위치 사이를 이은 값이라 신호 · 정류장에서 선 것이 빠져 있어 실제 오차는 조금 더 커요. 배운 노선이 그 날 다닌 노선과 겹친 만큼만 매겨요(학습 노선이 날마다 바뀌어서 겹치는 날이 적어요).</p>
    </section>
    <section class="box" id="bLearnBox" hidden={!learned.length}>
      <h2>배운 노선</h2>
      <p class="note" id="bLearnNote" style="margin:0 0 8px">{learned.length ? `${bus!.paceDays}일 기록으로 ${learned.length}개 노선을 배웠어요. 지도는 이 노선 버스를 그 시간대에 배운 빠르기로 앞질러 그리고, 나머지는 최근 2분 속도로 그려요.` : ''}</p>
      <div class="tw"><table><thead><tr><th class="l">노선</th><th>배운 시간대</th></tr></thead><tbody id="bLearnTable">{[...learned].sort((left, right) => right.hours - left.hours)
        .map(route => <tr><td class="l"><Dot color={route.color || '#888'} />{route.name}</td><td>{`${route.hours}시간`}</td></tr>)}</tbody></table></div>
    </section>
    <section class="box growth">
      <h2>버스 기록이 쌓이는 중</h2>
      <div id="bGrowth">{bus && <Growth days={days} value={(day:{ rows:number }) => day.rows} note="모은 버스 위치를 날마다 더한 값이에요. 버스 한 대가 한 번 찍힐 때마다 한 건이에요." />}</div>
    </section>
    <section class="box">
      <h2>노선별 수집</h2>
      <div class="tw"><table><thead><tr><th class="l">노선</th><th class="l">종류</th><th>부른 횟수</th><th>본 버스</th><th>모은 날</th></tr></thead><tbody id="bRouteTable">{bus && (routes.length
        ? routes.map(route => <tr><td class="l"><Dot color={route.color || '#888'} />{route.name}</td><td class="l">{(route.type && BUS_TYPES[route.type]) || '–'}</td><td>{fmt(route.calls)}</td><td>{`${fmt(route.buses)}대`}</td><td>{`${route.days}일`}</td></tr>)
        : <tr><td class="l muted" colSpan={5}>아직 모은 노선이 없어요.</td></tr>)}</tbody></table></div>
      <p class="note">서버가 낮(05~24시) 동안 이 노선들을 번갈아 불러 기록해요. 지도에서 누가 버스를 보고 있으면 잠깐 쉬어요.</p>
    </section>
    <section class="box">
      <h2>날짜별 수집</h2>
      <div class="tw"><table><thead><tr><th>날짜</th><th>부른 횟수</th><th>받은 기록</th><th>본 버스</th><th>노선</th></tr></thead><tbody id="bDayTable">{bus && (days.length
        ? [...days].reverse().map(day => <tr><td>{md(day.date)}</td><td>{fmt(day.calls)}</td><td>{fmt(day.rows)}</td><td>{`${fmt(day.buses)}대`}</td><td>{day.routes}</td></tr>)
        : <tr><td class="muted" colSpan={5}>아직 없어요.</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}

// ---- 지하철 ----
const KINDS = [['도착→출발', '역에 서 있는 시간'], ['출발→다음 도착', '출발해서 다음 역 도착'], ['도착→다음 도착', '도착해서 다음 역 도착']] as const;
const FEEDS = [['samples', '도착정보'], ['position', '열차 위치']] as const;

function Groups({ latest, history }:{ latest:Latest; history:History[] }) {
  return <>{lineTiers(latest, history).map(group => group.lines.length > 0 && <div class="group">
    <h3><span class={`badge ${group.cls}`}>{group.name}</span><i>{`${group.lines.length}개 노선 · ${group.hint}`}</i></h3>
    <div class="cards">{group.lines.map(({ line, values, count }) => <LineCard line={line} values={values} count={count} />)}</div>
  </div>)}</>;
}
function LineCard({ line, values, count }:{ line:string; values:LineValues; count:number }) {
  let rush = null;
  if (values.rushPace != null) {
    const value = pct(values.rushPace);
    rush = <li>출퇴근엔 {value > 0 ? <span class="slower">{`${value}% 더 느려요`}</span> : <span class="faster">{`${-value}% 빨라요`}</span>}</li>;
  }
  return <div class="lc" style={`--c:${lineColor(line)}`}><b>{line}</b><ul>
    <li><PaceWords pace={values.pace} /></li>
    {values.zone != null && <li>{`역에서 약 ${values.zone}초 머물러요`}</li>}
    {rush}
  </ul><div class="meter" title={`${count.toLocaleString('ko-KR')}구간`}><i style={`width:${Math.min(100, count / ENOUGH * 100)}%`}></i></div></div>;
}

function Stops({ latest }:{ latest:Latest }) {
  const stations = latest.stations || {}, lines = Object.keys(stations).filter(line => stations[line]!.length).sort(byLineOrder);
  const picked = view.stopLine, table = picked ? stopRows(latest, picked) : null;
  return <>
    <div class="chips" id="stopLines" role="tablist" aria-label="노선 고르기">{lines.map(line =>
      <button type="button" role="tab" data-l={line} style={`--c:${lineColor(line)}`} aria-selected={line === picked} onClick={() => set({ stopLine: line })}><span class="dot"></span>{line}</button>)}</div>
    <p class="note" id="stopSummary" style="margin:0 0 8px">{table?.summary}</p>
    <div class="tw"><table><thead><tr><th class="l">역</th><th>잰 횟수</th><th>잰 시간</th><th>지도 값</th><th class="l">상태</th></tr></thead><tbody id="stopTable">{table?.rows.map(row => {
      let measured:ComponentChildren = '–';
      if (row.n) measured = row.n.toLocaleString('ko-KR');
      else if (row.runs) measured = <span class="def"><span class="full">도착 </span>{row.runs.toLocaleString('ko-KR')}</span>;
      return <tr><td class="l">{row.name}</td><td>{measured}</td><td>{row.sec != null ? `${row.sec}초` : '–'}</td>
        <td>{row.own ? <><b>{`${row.use}초`}</b>{row.use === row.base ? ' 0초' : <>{' '}<Sgn value={row.use - row.base} />초</>}</> : <span class="def">{`${row.use}초`}</span>}</td>
        <td class="l"><span class={`badge ${row.status[0]}`}><span class="full">{row.status[1]}</span><span class="short">{row.status[2]}</span></span></td></tr>;
    })}</tbody></table></div>
  </>;
}

function SubwayPanel() {
  const { open, subway } = view.filled, last = subway?.last;
  const days = subway?.days || [], history = subway?.history || [], latest = subway?.latest || {};
  const lastDay = days.at(-1), total = days.reduce((sum, day) => sum + sightings(day), 0), learned = days.reduce((sum, day) => sum + events(day), 0);
  const lineValues = latest.lines || {}, counts = latest.n || {}, fallback = latest.default || {};
  const lineIds = [...new Set([...Object.keys(lineValues), ...Object.keys(counts)])].sort(byLineOrder);
  const scored = history.filter(item => item.candidate?.all != null).map(item => ({ day: addDay(item.date, -1), current: item.current || {}, candidate: item.candidate!, result: item.result }));
  // 평균은 10-08 채점부터 있다: 그 전 날은 중앙값으로
  const byDay = Object.fromEntries(scored.map(({ day, current, candidate, result }) => {
    const hasMean = candidate.mean != null, field = hasMean ? 'mean' : 'all';
    return [day, { cand: r1(candidate[field] as number), cur: r1(current[field] as number | undefined), result, note: hasMean ? '' : ' (중앙값)' }];
  }));
  const deltaInfo = last && scoreDelta(last);
  let heroText = '';
  if (view.error) heroText = '학습 기록을 불러오지 못했어요.';
  else if (last) {
    const p90 = last.kinds.p90;
    heroText = `${md(last.day)} 하루 열차 움직임 ${last.n?.toLocaleString('ko-KR')}건을 예측해 봤더니 평균 ${last.cand.toFixed(1)}초 틀렸어요. 절반은 ${last.kinds.all}초 안쪽${p90 != null ? `, 10번 중 9번은 ${p90}초 안쪽` : ''}으로 맞혔어요.`;
  }
  const means = last?.kinds.means;
  return <div class="panel" id="panelSubway" role="tabpanel" aria-labelledby="tabSubway" hidden={view.tab !== 0}>
    <section class="box open" aria-label="오픈 기준">
      <h2>오픈 기준 · 지도 화면 다시 그리기</h2>
      <p class="muted" id="openText" style="margin:0 0 12px;font-size:13.5px;line-height:1.6">{open ? open.text : '불러오는 중'}</p>
      <div class="tw"><table class="wide"><thead><tr><th>노선</th><th>시간</th><th>열차</th><th>도착 치우침</th><th>도착 가운데 · 90%</th><th>출발 치우침</th><th>출발 가운데 · 90%</th><th>역 사이 멈춤</th><th>맞춘 사건</th></tr></thead>
        <tbody id="openTable">{open?.windows && (open.windows.length
          ? open.windows.map(win => <OpenRow win={win} criteria={open.criteria} />)
          : <tr><td colSpan={9} class="muted">그날 위치 자료가 없어요</td></tr>)}</tbody></table></div>
      <p class="note">날마다 7 · 2 · 9호선을 출근 · 평시 · 퇴근 30분씩 그날 쓰던 학습 값으로 다시 그려, 위치 자료가 나중에 알려 준 열차 자신의 도착 · 출발 시각과 견줘요(초, + 는 슝이 늦음).
      {' '}<b class="ok">초록</b>은 기준 안(치우침 ±10초 · 가운데 15초 · 90% 30초 · 역 사이 10초 넘는 멈춤 0), <b class="no">노랑</b>은 기준 밖. 위치 자료의 '도착'은 실제로 서는 때보다 조금 이를 수 있어 치우침은 실제 탑승 비교로 함께 봐요.</p>
    </section>

    <section class="box hero" aria-label="학습 값 채점">
      <div>
        <small>학습 값 채점 · 다음 사건까지 예측 오차 평균 (오픈 기준 아님)</small>
        <div class="big"><b id="err">{last ? last.cand.toFixed(1) : '–'}</b><span>초</span></div>
        <span class={deltaInfo ? deltaInfo.cls : 'delta same'} id="delta">{deltaInfo ? deltaInfo.text : '불러오는 중'}</span>
        <p id="heroText">{heroText}</p>
      </div>
      <ul class="kinds" id="kinds">{last && <><h3>어디서 틀리나요 · {means ? '평균' : '중앙값'}</h3>{KINDS.filter(([kind]) => last.kinds[kind] != null)
        .map(([kind, title]) => <li>{title}<b>{`${means?.[kind] ?? last.kinds[kind] as number}초`}</b></li>)}</>}</ul>
    </section>

    <section class="stats" aria-label="모은 기록">
      <div class="stat"><small id="sDayLabel">{subway && lastDay ? `${md(lastDay.date)} 하루 모은 기록` : '하루 모은 기록'}</small><b id="sToday">{subway && lastDay ? fmt(sightings(lastDay)) : '–'}</b><span id="sTodaySub">{subway && lastDay ? `학습용 ${fmt(events(lastDay))}` : ''}</span></div>
      <div class="stat"><small>지금까지</small><b id="sTotal">{subway ? fmt(total) : '–'}</b><span id="sTotalSub">{subway ? `${days.length}일 동안` : ''}</span></div>
      <div class="stat"><small>학습에 쓰인 비율</small><b id="sShare">{subway && total ? `${Math.round(learned / total * 100)}%` : '–'}</b><span>자체 시각이 있는 기록</span></div>
    </section>

    <section class="box scores">
      <h2>날마다 채점한 오차</h2>
      <div class="legend"><span><i style="background:var(--syung-deep)"></i>새로 배운 값</span><span><i style="border:2px solid var(--muted)"></i>쓰던 값</span></div>
      <div id="scores">{subway && <ScoreChart list={subway.scores} />}</div>
      <div class="tw" style="margin-top:12px"><table class="wide"><thead><tr><th>채점한 날</th><th>채점 건수</th><th>역에 서 있는 시간</th><th>출발→다음 역 도착</th><th>도착→다음 역 도착</th><th>전체 중앙값</th><th>전체 평균</th></tr></thead>
        <tbody id="kindTable">{subway && [...scored].reverse().map(({ day, current, candidate }) => <tr><td>{md(day)}</td><td>{fmt(candidate.n || 0)}</td>
          {(['도착→출발', '출발→다음 도착', '도착→다음 도착', 'all', 'mean'] as const).map(field => <td><Pair before={r1(current[field] as number | undefined)} after={r1(candidate[field] as number | undefined)} /></td>)}</tr>)}</tbody></table></div>
      <p class="note">칸마다 쓰던 값 → 새로 배운 값(초)이에요. 칸별은 중앙값, 마지막 칸은 평균이에요. 그래프는 평균이라 평균을 재기 시작한 10/7부터 그려요.</p>
      <p class="muted" style="margin:6px 0 0;font-size:12.5px;line-height:1.55">날마다 그날 열차 움직임으로 채점해서 시험지가 매일 달라요. 날짜끼리 오르내림엔 그날 난이도(채점 건수, 출퇴근 비중)도 섞여 있으니, 배운 게 좋아졌는지는 같은 날의 두 점을 비교해 보세요.</p>
    </section>

    <section class="box growth">
      <h2>학습 데이터가 쌓이는 중</h2>
      <div id="growth">{subway && <Growth days={days} value={events as (day:never) => number} note="학습에 쓸 수 있는 기록을 날마다 더한 값이에요. 기울기가 가파를수록 그날 많이 모았어요." />}</div>
    </section>

    <section class="box">
      <h2>날짜별 수집 상세</h2>
      <div class="tw"><table class="wide"><thead><tr><th>날짜</th><th class="l">피드</th><th>받은 기록</th><th>새로 본 움직임</th><th>학습용</th><th>열차 수</th></tr></thead>
        <tbody id="collectTable">{subway && [...days].reverse().map(day => FEEDS.map(([key, name], index) => {
          const feed = day[key] || {};
          return <tr class={index === 0 ? 'sep' : undefined}><td>{index === 0 ? md(day.date) : ''}</td><td class="l">{name}</td><td>{fmt(feed.records || 0)}</td><td>{fmt(feed.sightings || 0)}</td><td>{fmt(feed.event || 0)}</td><td>{fmt(feed.trains || 0)}</td></tr>;
        }))}</tbody></table></div>
      <p class="note">받은 기록: API에서 받은 줄 수 · 새로 본 움직임: 같은 열차의 같은 역·상태 반복을 뺀 것 · 학습용: 그중 자기 시각이 찍혀 있어 시간을 잴 수 있는 것.</p>
    </section>

    <section class="box">
      <h2>노선별 학습 상태</h2>
      <div class="groups" id="groups">{subway && <Groups latest={latest} history={history} />}</div>
    </section>

    <section class="box">
      <h2>노선별 배운 값</h2>
      <div class="tw"><table class="wide"><thead><tr><th class="l">노선</th><th>속도</th><th>출퇴근 속도</th><th>역에 머무는 시간</th><th>진입→도착</th><th>따로 배운 역</th><th>속도 학습 구간</th></tr></thead>
        <tbody id="lineTable">{subway && lineIds.map(line => { const values = lineValues[line] || {};
          return <tr><td class="l"><Dot color={lineColor(line)} />{line}</td>
            <td><OrDefault value={values.pace} fallback={fallback.pace} show={pace => <PerCent pace={pace} />} /></td>
            <td>{values.rushPace != null ? <PerCent pace={values.rushPace} /> : <span class="def">평소와 같게</span>}</td>
            <td><OrDefault value={values.zone} fallback={fallback.zone} show={zone => `${zone}초`} /></td>
            <td><OrDefault value={values.approach} fallback={fallback.approach} show={approach => `${approach}초`} /></td>
            <td>{Object.keys(values.stops || {}).length || '–'}</td><td>{fmt(counts[line]?.pace || 0)}</td></tr>;
        })}</tbody></table></div>
      <p class="note">속도는 시간표 대비(+는 느리게, −는 빠르게)예요. 회색은 데이터가 모자라 기본값을 쓰는 칸이에요.</p>
    </section>

    <section class="box">
      <h2>역별 머무는 시간</h2>
      {subway ? <Stops latest={latest} /> : <>
        <div class="chips" id="stopLines" role="tablist" aria-label="노선 고르기"></div>
        <p class="note" id="stopSummary" style="margin:0 0 8px"></p>
        <div class="tw"><table><thead><tr><th class="l">역</th><th>잰 횟수</th><th>잰 시간</th><th>지도 값</th><th class="l">상태</th></tr></thead><tbody id="stopTable"></tbody></table></div>
      </>}
      <p class="note">지난 8일 동안 역에 도착해서 출발할 때까지를 잰 값이에요. 30번 넘게 재고 노선 평균과 5초 넘게 다른 역만 따로 배우고, 나머지 역은 노선 평균을 써요. 출발 신호가 없는 역(코레일 구간)은 도착해서 다음 역에 도착하기까지가 예상보다 얼마나 늦는지로 추정해요(도착 n = 그 기록 수). 추정값엔 다음 구간 시간표 오차도 섞여 있어요. 지도 값은 30~180초 안으로 잘라요.</p>
    </section>

    <section class="box">
      <h2>날짜별 자세한 기록</h2>
      <div class="tw"><table id="daysTable"><thead><tr><th>날짜</th><th>도착정보</th><th>열차 위치</th><th>학습용</th><th>이 날로 채점(평균)<br />쓰던 값 → 새 값</th><th>결과</th></tr></thead>
        <tbody>{subway && [...days].reverse().map(day => {
          const score = byDay[day.date];
          let outcome = '';
          if (score) outcome = ({ published: '적용', 'kept current': '유지', backfill: '나중에 계산' } as Record<string, string>)[score.result as string] || '';
          let text = '–';
          if (score) text = (score.cur != null ? `${score.cur} → ${score.cand}초` : `${score.cand}초`) + score.note;
          return <tr><td>{md(day.date)}</td><td>{fmt(day.samples?.sightings || 0)}</td><td>{fmt(day.position?.sightings || 0)}</td><td>{fmt(events(day))}</td><td>{text}</td><td>{outcome}</td></tr>;
        })}</tbody></table></div>
    </section>
  </div>;
}

function LearningPage() {
  const subway = view.filled.subway;
  return <>
    <div class="tabs" role="tablist" aria-label="무엇을 배우나">
      {(['지하철', '버스'] as const).map((label, index) => {
        let tabIndex:number | undefined = view.tab === index ? 0 : -1;
        if (!view.touched && index === 0) tabIndex = undefined;   // 옛 HTML: 처음엔 지하철 탭에 tabindex 가 없다
        return <button type="button" role="tab" id={TABS[index]![0]} aria-controls={TABS[index]![1]} aria-selected={view.tab === index} tabIndex={tabIndex} ref={tabRefs[index]}
          onClick={() => showTab(index)} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); showTab((index + 1) % TABS.length, true) } }}>{label}</button>;
      })}
    </div>
    <SubwayPanel />
    <BusPanel bus={view.filled.bus} />
    <p class="muted" id="updated" style="margin:0;font-size:12px;text-align:center">{subway
      ? `${new Date(subway.generatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}에 갱신 · 숫자는 매일 03:10 재학습 때 한 번 바뀌고, 오늘 모으는 기록은 내일 새벽에 들어가요` : ''}</p>
  </>;
}

// 받은 자료를 옛 차례대로 읽는다 — 중간에 이상하면 거기까지 읽은 칸만 그린다
function readAll(data:Learning):Filled {
  const filled:Filled = {}, history = data.history || [], genDay = (data.generatedAt || '').slice(0, 10);
  filled.open = readOpen(data.replay);
  filled.bus = readBus(data.bus, genDay);
  const list = scores(history);
  filled.subway = { last: list.at(-1), scores: list, days: (data.days || []).filter(day => day.date < genDay), history, latest: data.latest || {}, generatedAt: data.generatedAt! };   // 03:10 에 만들어 새 날은 막 시작했다
  return filled;
}

// HTML 에 있던 첫 그림(같은 모양)을 비우고 그 자리에 그린다 — 같은 작업 안이라 깜박이지 않는다
main.textContent = '';
set({});
if (location.hash === '#bus') showTab(1);
fetch('/admin/learning.json', { cache: 'no-cache' }).then(response => { if (response.status === 401) { location.href = '/admin/login.html?next=/admin/learning'; throw 0 } return response.json() }).then((data:Learning) => {
  const filled = readAll(data), latest = filled.subway!.latest, stations = latest.stations || {};
  const lines = Object.keys(stations).filter(line => stations[line]!.length).sort(byLineOrder);
  set({ filled, stopLine: lines.length ? firstStopLine(latest, lines) : null });
}).catch(error => { if (error !== 0) set({ error: true }) });
