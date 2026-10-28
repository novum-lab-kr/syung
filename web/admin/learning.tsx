// 관리 화면 '학습 현황'(admin/learning.html 의 <main>): 지하철 · 버스 탭 — 오픈 기준 · 채점 · 모은 기록 · 노선 · 역 · 날짜별 표, 버스 학습 · 수집.
// 셈은 admin/learning_data.mts. 자료는 /admin/learning.json 하나(매일 03:10 재학습 때 바뀜 · 401 이면 로그인 화면으로).
// 받은 뒤 옛 인라인 스크립트가 칸을 채우던 차례(STEPS) 그대로 한 칸씩 읽는다 — 칸마다 글자를 다 만든 뒤 넣으므로 그리기는 멈추지 않고,
// 자료가 이상해 읽다 멈추면 거기까지 채운 칸은 남기고 '학습 기록을 불러오지 못했어요'(옛 화면과 같게 · #79 R1).
// 화면 상태는 view 하나 — set() 이 바꾸고 바로(같은 작업 안에서) 다시 그린다(회원 · 디버깅 화면과 같은 틀).
// 표시(DOM 모양 · class · 문구 · aria)는 옛 HTML 과 같다 — 첫 그림은 HTML 에 그대로 있고 이 모듈이 비우고 그린다.
import { createRef, render } from 'preact';
import type { ComponentChildren } from 'preact';
import {
  BUS_DAYS, BUS_TYPES, CRITERIA, ENOUGH, addDay, byLineOrder, events, firstStopLine, fmt, growth, lineColor, lineTiers, md, openPass, pct, r1, scoreChart, scoreDelta, scores, sightings, stopRows,
} from './learning_data.mts';
import type { Day, Gap, Growth, Learning, Score, ScoreChart } from './learning_data.mts';

// ---- 그릴 것: 다 만든 글자 · 굵게 · 색 span 조각(옛 innerHTML 의 모양 그대로) ----
type Rich = string | { tag:'b' | 'span'; cls?:string; kids:Rich[] } | { tag:'dot'; color:string } | Rich[];
const bold = (...kids:Rich[]):Rich => ({ tag: 'b', kids });
const span = (cls:string, ...kids:Rich[]):Rich => ({ tag: 'span', cls, kids });
function Show({ rich }:{ rich:Rich }):ComponentChildren {
  if (typeof rich === 'string') return rich;
  if (Array.isArray(rich)) return <>{rich.map(part => <Show rich={part} />)}</>;
  if (rich.tag === 'dot') return <span class="dot" style={`--c:${rich.color}`}></span>;   // 노선 색 점
  const kids = rich.kids.map(part => <Show rich={part} />);
  return rich.tag === 'b' ? <b>{kids}</b> : <span class={rich.cls}>{kids}</span>;
}
interface Cell { rich:Rich; cls?:string; colSpan?:number; classFirst?:boolean }   // classFirst: 옛 줄이 class 를 colspan 앞에 적었다
interface Row { cls?:string; cells:Cell[] }
const cell = (rich:Rich, cls?:string):Cell => ({ rich, cls });
const Cells = ({ rows }:{ rows:Row[] | undefined }) => <>{rows?.map(row =>
  <tr class={row.cls}>{row.cells.map(item => item.classFirst
    ? <td class={item.cls} colSpan={item.colSpan}><Show rich={item.rich} /></td>
    : <td colSpan={item.colSpan} class={item.cls}><Show rich={item.rich} /></td>)}</tr>)}</>;
const dot = (color:string):Rich => ({ tag: 'dot', color });

// 받은 자료로 채운 칸(없는 칸은 첫 그림 그대로)
interface Filled {
  openTable?:Row[]; openText?:string;
  busScore?:{ hidden:boolean; rows:Row[] }; busLearnHidden?:boolean; busLearn?:{ note:string; rows:Row[] };
  busHero?:{ label?:string; mean?:number; cls?:string; delta:string; text?:string }; busText?:string;
  busSteps?:{ step:number; items:[string, string][] };
  busDay?:[string, string, string]; busTotal?:[string, string]; busRoutes?:[string, string];
  busGrowth?:Growth | null; busRouteTable?:Row[]; busDayTable?:Row[];
  err?:string; delta?:{ cls:string; text:string }; heroText?:string; kinds?:{ title:string; items:[string, string][] };
  scores?:ScoreChart | null; sDay?:[string, string, string]; sTotal?:[string, string]; sShare?:string; growth?:Growth | null;
  groups?:{ name:string; cls:string; head:string; cards:{ line:string; items:Rich[]; title:string; width:string }[] }[];
  kindTable?:Row[]; collectTable?:Row[]; lineTable?:Row[]; stopLines?:string[];
  stop?:{ line:string; summary:string; rows:Row[] }; daysTable?:Row[]; updated?:string;
}
interface View { tab:number; touched:boolean; filled:Filled; error:boolean }
let view:View = { tab: 0, touched: false, filled: {}, error: false };
let data:Learning = {};   // 받은 자료(역 노선을 고를 때 다시 읽는다)
const main = document.querySelector('main')!;
const tabRefs = [createRef<HTMLButtonElement>(), createRef<HTMLButtonElement>()];
function set(patch:Partial<View>) { view = { ...view, ...patch }; render(<LearningPage />, main) }
const fill = (patch:Filled) => set({ filled: { ...view.filled, ...patch } });

// 지하철 · 버스 탭(#bus 로 버스 탭을 바로 연다)
const TABS:[string, string, string][] = [['tabSubway', 'panelSubway', ''], ['tabBus', 'panelBus', '#bus']];
function showTab(index:number, focus?:boolean) {
  set({ tab: index, touched: true });
  if (focus) tabRefs[index]!.current!.focus();
  history.replaceState(null, '', TABS[index]![2] || location.pathname + location.search);
}

// ---- 글자 조각(옛 sgn · pair · pp · or · paceWords) ----
const km = (value:number | null | undefined) => value == null ? '–' : `${value}m`;
const sign = (value:number) => `${value > 0 ? '+' : ''}${value}초`;
function sgn(value:number):Rich {
  if (value > 0) return span('up', `+${value}`);
  return value < 0 ? span('dn', `−${-value}`) : '0';
}
const pair = (before:number | null, after:number | null):Rich => {
  if (after == null) return '–';
  return before == null ? `${after}` : [`${before} → `, bold(`${after}`)];
};
function perCent(pace:number):Rich {
  const value = pct(pace);
  if (value > 0) return span('up', `+${value}%`);
  return value < 0 ? span('dn', `−${-value}%`) : '0%';
}
const orDefault = (value:number | null | undefined, show:(value:number) => Rich, fallback:number | null | undefined):Rich =>
  value != null ? show(value) : span('def', fallback != null ? show(fallback) : '–');
function paceWords(pace:number | null | undefined):Rich {
  if (pace == null) return '시간표대로 달려요';
  const value = pct(pace);
  if (value === 0) return '시간표대로 달려요';
  return value < 0 ? ['시간표보다 ', span('faster', `${-value}% 빠르게`), ' 달려요'] : ['시간표보다 ', span('slower', `${value}% 느리게`), ' 달려요'];
}
const RESULTS:Record<string, string> = { published: '적용', 'kept current': '유지', backfill: '나중에 계산' };
const KINDS = [['도착→출발', '역에 서 있는 시간'], ['출발→다음 도착', '출발해서 다음 역 도착'], ['도착→다음 도착', '도착해서 다음 역 도착']] as const;
const FEEDS = [['samples', '도착정보'], ['position', '열차 위치']] as const;

// ---- 칸 채우기: 옛 스크립트가 채우던 차례 그대로(중간에 멈추면 앞 칸만 남는다) ----
function fillAll(d:Learning) {
  const hist = d.history || [], genDay = (d.generatedAt || '').slice(0, 10);
  // 오픈 기준(learning.json replay — retrain 이 replay_score.mjs 로 매긴 화면 재현 점수, 2026-10-19 덕배 · Codex 상의)
  {
    const rp = d.replay, days = rp?.days || [], last = days.at(-1), criteria = rp?.criteria || CRITERIA;
    if (!last) fill({ openText: '아직 다시 그린 날이 없어요. 고정 채점 창은 10/19 부터 모아요 — 다음 날 새벽 03:10 학습 때 처음 매겨요.', openTable: [] });
    else {
      const day = `${last.day.slice(0, 4)}-${last.day.slice(4, 6)}-${last.day.slice(6)}`, windows = last.windows.filter(win => win.events);
      const check = (value:number | undefined, ok:boolean, text:string):Cell => value == null ? cell('—') : cell(text, ok ? 'ok' : 'no');
      const rows = windows.map(win => {
        const arrive = win.arrive || {}, depart = win.depart || {}, stalls = win.stalls || {};
        return { cells: [cell(win.line), cell(win.window), cell(`${win.trains ?? '—'}`),
          check(arrive.signedMedian, Math.abs(arrive.signedMedian!) <= criteria.bias, sign(arrive.signedMedian!)),
          check(arrive.absMedian, arrive.absMedian! <= criteria.absMedian && arrive.p90! <= criteria.p90, `${arrive.absMedian} · ${arrive.p90}초`),
          check(depart.signedMedian, Math.abs(depart.signedMedian!) <= criteria.bias, sign(depart.signedMedian!)),
          check(depart.absMedian, depart.absMedian! <= criteria.absMedian && depart.p90! <= criteria.p90, `${depart.absMedian} · ${depart.p90}초`),
          check(stalls.n, stalls.n! <= criteria.stalls, `${stalls.n}번 · 열차·시간당 ${stalls.perTrainHour}`),
          cell(win.coverage != null ? `${Math.round(win.coverage * 100)}%` : '—')] };
      });
      fill({ openTable: rows.length ? rows : [{ cells: [{ rich: '그날 위치 자료가 없어요', colSpan: 9, cls: 'muted' }] }] });
      fill({ openText: `${md(day)} 화면을 다시 그려 봤어요: ${windows.length}개 창 가운데 ${openPass(windows, criteria)}개가 기준을 다 넘었어요.${days.length > 1 ? ` (${days.length}일치 기록)` : ''}` });
    }
  }
  // 버스: 모으는 현황 + 밤 학습(구간 빠르기, bus_pace.mjs)이 배운 노선 · 날마다 채점(learning.json bus — build_learning_stats.bus_stats)
  {
    const bus = d.bus, days = (bus?.days || []).filter(day => day.date < genDay), routes = bus?.routes || [], count = days.length, last = days.at(-1);
    const rows = days.reduce((sum, day) => sum + day.rows, 0), calls = days.reduce((sum, day) => sum + day.calls, 0);
    const pace = bus?.pace, learned = pace?.routes || [], list = (bus?.scores || []).filter(item => item.results?.pace);
    // 큰 숫자: 지도 볼 때(30초마다) 거리가 1,000초 넘게 매겨진 마지막 날
    const shown = [...list].reverse().find(item => (item.results.pace!.gap30?.n as number) >= 1000);
    fill({ busScore: { hidden: !list.length, rows: view.filled.busScore?.rows ?? [] } });
    fill({ busScore: { hidden: !list.length, rows: [...list].reverse().map(item => {
      const result = item.results, near = (kind:string) => result[kind]!.gap30!, rare = (kind:string) => result[kind]!['gap60+']!;
      const nearCells = near('pace').n ? [cell(km(near('none').meanAbs)), cell(km(near('recent').meanAbs)), cell(bold(km(near('pace').meanAbs)))] : [cell('–'), cell('–'), cell('–')];
      return { cls: item === shown ? 'sep' : undefined, cells: [cell(md(item.date)), cell(`${item.trainedRoutes}개`), ...nearCells,
        cell(rare('pace').n ? [`${km(rare('recent').meanAbs)} → `, bold(km(rare('pace').meanAbs))] : '–')] };
    }) } });
    fill({ busLearnHidden: !learned.length });
    if (learned.length) {
      const note = `${pace!.days}일 기록으로 ${learned.length}개 노선을 배웠어요. 지도는 이 노선 버스를 그 시간대에 배운 빠르기로 앞질러 그리고, 나머지는 최근 2분 속도로 그려요.`;
      fill({ busLearn: { note, rows: [...learned].sort((left, right) => right.hours - left.hours).map(route => ({ cells: [cell([dot(route.color || '#888'), route.name], 'l'), cell(`${route.hours}시간`)] })) } });
    }
    if (shown) {
      const result = shown.results, mean = result.pace!.gap30!.meanAbs!, was = result.recent!.gap30!.meanAbs!, rare = result.pace!['gap60+'], rareWas = result.recent!['gap60+'] as Gap;
      fill({ busHero: { label: '버스 위치 오차 · 지도 볼 때 평균', mean, cls: `delta ${mean < was ? 'down' : 'same'}`,
        delta: mean < was ? `▼ 예전 방식(최근 속도, ${was}m)보다 ${was - mean}m 줄었어요` : `예전 방식(최근 속도)도 ${was}m · 비슷해요`,
        text: `${md(shown.date)} 버스 기록을 화면처럼 다시 그려 보니, 배운 노선 ${shown.trainedRoutes}개에서 지도 볼 때 평균 ${mean}m${rare?.n ? `, 드물게 받을 때 ${rareWas.meanAbs}m → ${rare.meanAbs}m` : ''} 어긋났어요. 노선 · 시간대 · 50m 구간마다 걸린 시간을 매일 새벽 배워요.` } });
    } else if (learned.length) fill({ busHero: { delta: `${learned.length}개 노선을 배웠어요 · 채점은 기록이 더 쌓이면` } });
    else fill({ busHero: { delta: count >= BUS_DAYS ? '기록이 다 모였어요 · 오차를 잴 차례예요' : `${count}/${BUS_DAYS}일 모았어요` } });
    if (!shown) fill({ busText: count ? `${md(days[0]!.date)}부터 ${count}일 동안 버스 위치 ${fmt(rows)}건을 모았어요. 일주일쯤 모이면 지하철처럼 오차부터 재고, 정류장 사이 달리는 시간을 구간마다 배워요.`
      : '버스 위치를 모으기 시작했어요. 오늘 모은 기록은 내일 새벽 03:10에 여기 나타나요.' });
    let step = 0;
    if (list.length) step = 2; else if (learned.length) step = 1;
    fill({ busSteps: { step, items: [['기록 모으기', `${count}일`], ['구간마다 배우기', learned.length ? `${learned.length}개 노선` : '모은 뒤'], ['날마다 채점', list.length ? `${list.length}일` : '배운 뒤']] } });
    if (last) fill({ busDay: [`${md(last.date)} 하루 모은 기록`, fmt(last.rows), `${fmt(last.calls)}번 불러서`] });
    fill({ busTotal: [fmt(rows), `${count}일 · ${fmt(calls)}번 불러서`] });
    fill({ busRoutes: [routes.length ? `${routes.length}개` : '–', routes.slice(0, 3).map(route => route.name).join(' · ')] });
    fill({ busGrowth: growth(days, day => day.rows) });
    fill({ busRouteTable: routes.length ? routes.map(route => ({ cells: [cell([dot(route.color || '#888'), route.name], 'l'), cell((route.type && BUS_TYPES[route.type]) || '–', 'l'),
      cell(fmt(route.calls)), cell(`${fmt(route.buses)}대`), cell(`${route.days}일`)] })) : [{ cells: [{ rich: '아직 모은 노선이 없어요.', cls: 'l muted', colSpan: 5, classFirst: true }] }] });
    fill({ busDayTable: days.length ? [...days].reverse().map(day => ({ cells: [cell(md(day.date)), cell(fmt(day.calls)), cell(fmt(day.rows)), cell(`${fmt(day.buses)}대`), cell(`${day.routes}`)] }))
      : [{ cells: [{ rich: '아직 없어요.', cls: 'muted', colSpan: 5, classFirst: true }] }] });
  }
  // 지하철
  const days:Day[] = (d.days || []).filter(day => day.date < genDay);   // 03:10 에 만들어 새 날은 막 시작했다
  const list = scores(hist), last:Score | undefined = list.at(-1);
  if (last) {
    fill({ err: last.cand.toFixed(1) });
    fill({ delta: scoreDelta(last) });
    const p90 = last.kinds.p90;
    fill({ heroText: `${md(last.day)} 하루 열차 움직임 ${last.n?.toLocaleString('ko-KR')}건을 예측해 봤더니 평균 ${last.cand.toFixed(1)}초 틀렸어요. 절반은 ${last.kinds.all}초 안쪽${p90 != null ? `, 10번 중 9번은 ${p90}초 안쪽` : ''}으로 맞혔어요.` });
    const means = last.kinds.means;
    fill({ kinds: { title: `어디서 틀리나요 · ${means ? '평균' : '중앙값'}`, items: KINDS.filter(([kind]) => last.kinds[kind] != null).map(([kind, title]) => [title, `${means?.[kind] ?? last.kinds[kind] as number}초`]) } });
  }
  fill({ scores: scoreChart(list) });
  const lastDay = days.at(-1), total = days.reduce((sum, day) => sum + sightings(day), 0), learnedCount = days.reduce((sum, day) => sum + events(day), 0);
  if (lastDay) fill({ sDay: [`${md(lastDay.date)} 하루 모은 기록`, fmt(sightings(lastDay)), `학습용 ${fmt(events(lastDay))}`] });
  fill({ sTotal: [fmt(total), `${days.length}일 동안`] });
  fill({ sShare: total ? `${Math.round(learnedCount / total * 100)}%` : '–' });
  fill({ growth: growth(days, events) });
  fill({ groups: lineTiers(d.latest || {}, hist).filter(group => group.lines.length).map(group => ({ name: group.name, cls: group.cls, head: `${group.lines.length}개 노선 · ${group.hint}`,
    cards: group.lines.map(({ line, values, count }) => {
      const items = [paceWords(values.pace)];
      if (values.zone != null) items.push(`역에서 약 ${values.zone}초 머물러요`);
      if (values.rushPace != null) { const value = pct(values.rushPace); items.push(['출퇴근엔 ', value > 0 ? span('slower', `${value}% 더 느려요`) : span('faster', `${-value}% 빨라요`)]) }
      return { line, items, title: `${count.toLocaleString('ko-KR')}구간`, width: `${Math.min(100, count / ENOUGH * 100)}%` };
    }) })) });
  const scored = hist.filter(item => item.candidate?.all != null).map(item => ({ day: addDay(item.date, -1), current: item.current || {}, candidate: item.candidate!, result: item.result }));
  fill({ kindTable: [...scored].reverse().map(({ day, current, candidate }) => ({ cells: [cell(md(day)), cell(fmt(candidate.n || 0)),
    ...(['도착→출발', '출발→다음 도착', '도착→다음 도착', 'all', 'mean'] as const).map(field => cell(pair(r1(current[field] as number | undefined), r1(candidate[field] as number | undefined))))] })) });
  fill({ collectTable: [...days].reverse().flatMap(day => FEEDS.map(([key, name], index) => { const feed = day[key] || {};
    return { cls: index === 0 ? 'sep' : undefined, cells: [cell(index === 0 ? md(day.date) : ''), cell(name, 'l'), cell(fmt(feed.records || 0)), cell(fmt(feed.sightings || 0)), cell(fmt(feed.event || 0)), cell(fmt(feed.trains || 0))] };
  })) });
  const latest = d.latest || {}, lineValues = latest.lines || {}, counts = latest.n || {}, fallback = latest.default || {};
  const lineIds = [...new Set([...Object.keys(lineValues), ...Object.keys(counts)])].sort(byLineOrder);
  fill({ lineTable: lineIds.map(line => { const values = lineValues[line] || {};
    return { cells: [cell([dot(lineColor(line)), line], 'l'), cell(orDefault(values.pace, perCent, fallback.pace)), cell(values.rushPace != null ? perCent(values.rushPace) : span('def', '평소와 같게')),
      cell(orDefault(values.zone, zone => `${zone}초`, fallback.zone)), cell(orDefault(values.approach, approach => `${approach}초`, fallback.approach)),
      cell(`${Object.keys(values.stops || {}).length || '–'}`), cell(fmt(counts[line]?.pace || 0))] };
  }) });
  const stations = latest.stations || {}, stopLines = Object.keys(stations).filter(line => stations[line]!.length).sort(byLineOrder);
  fill({ stopLines });
  if (stopLines.length) showStops(firstStopLine(latest, stopLines));   // 잰 역이 가장 많은 노선부터
  // 평균은 10-08 채점부터 있다: 그 전 날은 중앙값으로
  const byDay = Object.fromEntries(scored.map(({ day, current, candidate, result }) => {
    const hasMean = candidate.mean != null, field = hasMean ? 'mean' : 'all';
    return [day, { cand: r1(candidate[field] as number), cur: r1(current[field] as number | undefined), result, note: hasMean ? '' : ' (중앙값)' }];
  }));
  fill({ daysTable: [...days].reverse().map(day => { const score = byDay[day.date];
    let text = '–', outcome = '';
    if (score) { text = (score.cur != null ? `${score.cur} → ${score.cand}초` : `${score.cand}초`) + score.note; outcome = RESULTS[score.result as string] || '' }
    return { cells: [cell(md(day.date)), cell(fmt(day.samples?.sightings || 0)), cell(fmt(day.position?.sightings || 0)), cell(fmt(events(day))), cell(text), cell(outcome)] };
  }) });
  fill({ updated: `${new Date(d.generatedAt!).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}에 갱신 · 숫자는 매일 03:10 재학습 때 한 번 바뀌고, 오늘 모으는 기록은 내일 새벽에 들어가요` });
}

// 역별 머무는 시간(노선 고르기 — 옛 showStops)
function showStops(line:string) {
  const { rows, summary } = stopRows(data.latest || {}, line);
  fill({ stop: { line, summary, rows: rows.map(row => {
    let measured:Rich = '–';
    if (row.times) measured = row.times.toLocaleString('ko-KR');
    else if (row.runs) measured = span('def', span('full', '도착 '), row.runs.toLocaleString('ko-KR'));
    const use:Rich = row.own ? [bold(`${row.use}초`), row.use === row.base ? ' 0초' : [' ', sgn(row.use - row.base), '초']] : span('def', `${row.use}초`);
    return { cells: [cell(row.name, 'l'), cell(measured), cell(row.sec != null ? `${row.sec}초` : '–'), cell(use),
      cell(span(`badge ${row.status[0]}`, span('full', row.status[1]), span('short', row.status[2])), 'l')] };
  }) } });
}

// ---- 그리기 ----
function GrowthChart({ chart, note }:{ chart:Growth | null; note:string }) {
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

function ScoresChart({ chart }:{ chart:ScoreChart | null }) {
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

function BusPanel() {
  const filled = view.filled, hero = filled.busHero;
  return <div class="panel" id="panelBus" role="tabpanel" aria-labelledby="tabBus" hidden={view.tab !== 1}>
    <section class="box hero" aria-label="버스 학습 상태">
      <div>
        <small id="bLabel">{hero?.label ?? '버스 도착 시각 예측'}</small>
        <div class="big" id="bBig">{hero?.mean != null ? <><b id="bState">{hero.mean}</b><span>m</span></> : <b class="word" id="bState">모으는 중</b>}</div>
        <span class={hero?.cls ?? 'delta same'} id="bDelta">{hero ? hero.delta : '불러오는 중'}</span>
        <p id="bText">{hero?.text ?? filled.busText ?? ''}</p>
      </div>
      <ul class="kinds steps" id="bSteps">{filled.busSteps && <><h3>배우는 순서</h3>{filled.busSteps.items.map(([title, value], index) =>
        <li class={index === filled.busSteps!.step ? 'now' : undefined}>{`${index + 1}. ${title}`}<b>{value}</b></li>)}</>}</ul>
    </section>
    <section class="stats" aria-label="모은 버스 기록">
      <div class="stat"><small id="bDayLabel">{filled.busDay?.[0] ?? '하루 모은 기록'}</small><b id="bToday">{filled.busDay?.[1] ?? '–'}</b><span id="bTodaySub">{filled.busDay?.[2] ?? ''}</span></div>
      <div class="stat"><small>지금까지</small><b id="bTotal">{filled.busTotal?.[0] ?? '–'}</b><span id="bTotalSub">{filled.busTotal?.[1] ?? ''}</span></div>
      <div class="stat"><small>모은 노선</small><b id="bRoutes">{filled.busRoutes?.[0] ?? '–'}</b><span id="bRoutesSub">{filled.busRoutes?.[1] ?? ''}</span></div>
    </section>
    <section class="box" id="bScoreBox" hidden={filled.busScore ? filled.busScore.hidden : true}>
      <h2>날마다 채점한 거리 오차</h2>
      <div class="tw"><table class="wide"><thead><tr><th>채점한 날</th><th>배운 노선</th><th>지도 볼 때<br />앞지르지 않음</th><th>지도 볼 때<br />최근 속도</th><th>지도 볼 때<br />배운 빠르기</th><th>드물게 받을 때<br />최근 속도 → 배운 빠르기</th></tr></thead>
        <tbody id="bScoreTable"><Cells rows={filled.busScore?.rows} /></tbody></table></div>
      <p class="note">그 날 서버가 받은 버스 위치를 화면처럼 다시 그려, 1초마다 그린 자리와 실제 자리의 거리(평균, m)를 쟀어요. 배운 빠르기는 그 날 전 기록으로만 배운 값이에요. 지도 볼 때 = 30초마다 받는 노선, 드물게 = 학습용으로 1분 넘게 띄엄띄엄 받는 노선이에요. 실제 자리는 받은 위치 사이를 이은 값이라 신호 · 정류장에서 선 것이 빠져 있어 실제 오차는 조금 더 커요. 배운 노선이 그 날 다닌 노선과 겹친 만큼만 매겨요(학습 노선이 날마다 바뀌어서 겹치는 날이 적어요).</p>
    </section>
    <section class="box" id="bLearnBox" hidden={filled.busLearnHidden ?? true}>
      <h2>배운 노선</h2>
      <p class="note" id="bLearnNote" style="margin:0 0 8px">{filled.busLearn?.note ?? ''}</p>
      <div class="tw"><table><thead><tr><th class="l">노선</th><th>배운 시간대</th></tr></thead><tbody id="bLearnTable"><Cells rows={filled.busLearn?.rows} /></tbody></table></div>
    </section>
    <section class="box growth">
      <h2>버스 기록이 쌓이는 중</h2>
      <div id="bGrowth">{filled.busGrowth !== undefined && <GrowthChart chart={filled.busGrowth} note="모은 버스 위치를 날마다 더한 값이에요. 버스 한 대가 한 번 찍힐 때마다 한 건이에요." />}</div>
    </section>
    <section class="box">
      <h2>노선별 수집</h2>
      <div class="tw"><table><thead><tr><th class="l">노선</th><th class="l">종류</th><th>부른 횟수</th><th>본 버스</th><th>모은 날</th></tr></thead><tbody id="bRouteTable"><Cells rows={filled.busRouteTable} /></tbody></table></div>
      <p class="note">서버가 낮(05~24시) 동안 이 노선들을 번갈아 불러 기록해요. 지도에서 누가 버스를 보고 있으면 잠깐 쉬어요.</p>
    </section>
    <section class="box">
      <h2>날짜별 수집</h2>
      <div class="tw"><table><thead><tr><th>날짜</th><th>부른 횟수</th><th>받은 기록</th><th>본 버스</th><th>노선</th></tr></thead><tbody id="bDayTable"><Cells rows={filled.busDayTable} /></tbody></table></div>
    </section>
  </div>;
}

function SubwayPanel() {
  const filled = view.filled, stop = filled.stop;
  return <div class="panel" id="panelSubway" role="tabpanel" aria-labelledby="tabSubway" hidden={view.tab !== 0}>
    <section class="box open" aria-label="오픈 기준">
      <h2>오픈 기준 · 지도 화면 다시 그리기</h2>
      <p class="muted" id="openText" style="margin:0 0 12px;font-size:13.5px;line-height:1.6">{filled.openText ?? '불러오는 중'}</p>
      <div class="tw"><table class="wide"><thead><tr><th>노선</th><th>시간</th><th>열차</th><th>도착 치우침</th><th>도착 가운데 · 90%</th><th>출발 치우침</th><th>출발 가운데 · 90%</th><th>역 사이 멈춤</th><th>맞춘 사건</th></tr></thead>
        <tbody id="openTable"><Cells rows={filled.openTable} /></tbody></table></div>
      <p class="note">날마다 7 · 2 · 9호선을 출근 · 평시 · 퇴근 30분씩 그날 쓰던 학습 값으로 다시 그려, 위치 자료가 나중에 알려 준 열차 자신의 도착 · 출발 시각과 견줘요(초, + 는 슝이 늦음).
      {' '}<b class="ok">초록</b>은 기준 안(치우침 ±10초 · 가운데 15초 · 90% 30초 · 역 사이 10초 넘는 멈춤 0), <b class="no">노랑</b>은 기준 밖. 위치 자료의 '도착'은 실제로 서는 때보다 조금 이를 수 있어 치우침은 실제 탑승 비교로 함께 봐요.</p>
    </section>

    <section class="box hero" aria-label="학습 값 채점">
      <div>
        <small>학습 값 채점 · 다음 사건까지 예측 오차 평균 (오픈 기준 아님)</small>
        <div class="big"><b id="err">{filled.err ?? '–'}</b><span>초</span></div>
        <span class={filled.delta?.cls ?? 'delta same'} id="delta">{filled.delta?.text ?? '불러오는 중'}</span>
        <p id="heroText">{view.error ? '학습 기록을 불러오지 못했어요.' : filled.heroText ?? ''}</p>
      </div>
      <ul class="kinds" id="kinds">{filled.kinds && <><h3>{filled.kinds.title}</h3>{filled.kinds.items.map(([title, value]) => <li>{title}<b>{value}</b></li>)}</>}</ul>
    </section>

    <section class="stats" aria-label="모은 기록">
      <div class="stat"><small id="sDayLabel">{filled.sDay?.[0] ?? '하루 모은 기록'}</small><b id="sToday">{filled.sDay?.[1] ?? '–'}</b><span id="sTodaySub">{filled.sDay?.[2] ?? ''}</span></div>
      <div class="stat"><small>지금까지</small><b id="sTotal">{filled.sTotal?.[0] ?? '–'}</b><span id="sTotalSub">{filled.sTotal?.[1] ?? ''}</span></div>
      <div class="stat"><small>학습에 쓰인 비율</small><b id="sShare">{filled.sShare ?? '–'}</b><span>자체 시각이 있는 기록</span></div>
    </section>

    <section class="box scores">
      <h2>날마다 채점한 오차</h2>
      <div class="legend"><span><i style="background:var(--syung-deep)"></i>새로 배운 값</span><span><i style="border:2px solid var(--muted)"></i>쓰던 값</span></div>
      <div id="scores">{filled.scores !== undefined && <ScoresChart chart={filled.scores} />}</div>
      <div class="tw" style="margin-top:12px"><table class="wide"><thead><tr><th>채점한 날</th><th>채점 건수</th><th>역에 서 있는 시간</th><th>출발→다음 역 도착</th><th>도착→다음 역 도착</th><th>전체 중앙값</th><th>전체 평균</th></tr></thead>
        <tbody id="kindTable"><Cells rows={filled.kindTable} /></tbody></table></div>
      <p class="note">칸마다 쓰던 값 → 새로 배운 값(초)이에요. 칸별은 중앙값, 마지막 칸은 평균이에요. 그래프는 평균이라 평균을 재기 시작한 10/7부터 그려요.</p>
      <p class="muted" style="margin:6px 0 0;font-size:12.5px;line-height:1.55">날마다 그날 열차 움직임으로 채점해서 시험지가 매일 달라요. 날짜끼리 오르내림엔 그날 난이도(채점 건수, 출퇴근 비중)도 섞여 있으니, 배운 게 좋아졌는지는 같은 날의 두 점을 비교해 보세요.</p>
    </section>

    <section class="box growth">
      <h2>학습 데이터가 쌓이는 중</h2>
      <div id="growth">{filled.growth !== undefined && <GrowthChart chart={filled.growth} note="학습에 쓸 수 있는 기록을 날마다 더한 값이에요. 기울기가 가파를수록 그날 많이 모았어요." />}</div>
    </section>

    <section class="box">
      <h2>날짜별 수집 상세</h2>
      <div class="tw"><table class="wide"><thead><tr><th>날짜</th><th class="l">피드</th><th>받은 기록</th><th>새로 본 움직임</th><th>학습용</th><th>열차 수</th></tr></thead>
        <tbody id="collectTable"><Cells rows={filled.collectTable} /></tbody></table></div>
      <p class="note">받은 기록: API에서 받은 줄 수 · 새로 본 움직임: 같은 열차의 같은 역·상태 반복을 뺀 것 · 학습용: 그중 자기 시각이 찍혀 있어 시간을 잴 수 있는 것.</p>
    </section>

    <section class="box">
      <h2>노선별 학습 상태</h2>
      <div class="groups" id="groups">{filled.groups?.map(group => <div class="group">
        <h3><span class={`badge ${group.cls}`}>{group.name}</span><i>{group.head}</i></h3>
        <div class="cards">{group.cards.map(card => <div class="lc" style={`--c:${lineColor(card.line)}`}><b>{card.line}</b><ul>{card.items.map(item => <li><Show rich={item} /></li>)}</ul>
          <div class="meter" title={card.title}><i style={`width:${card.width}`}></i></div></div>)}</div>
      </div>)}</div>
    </section>

    <section class="box">
      <h2>노선별 배운 값</h2>
      <div class="tw"><table class="wide"><thead><tr><th class="l">노선</th><th>속도</th><th>출퇴근 속도</th><th>역에 머무는 시간</th><th>진입→도착</th><th>따로 배운 역</th><th>속도 학습 구간</th></tr></thead>
        <tbody id="lineTable"><Cells rows={filled.lineTable} /></tbody></table></div>
      <p class="note">속도는 시간표 대비(+는 느리게, −는 빠르게)예요. 회색은 데이터가 모자라 기본값을 쓰는 칸이에요.</p>
    </section>

    <section class="box">
      <h2>역별 머무는 시간</h2>
      <div class="chips" id="stopLines" role="tablist" aria-label="노선 고르기">{filled.stopLines?.map(line =>
        <button type="button" role="tab" data-l={line} style={`--c:${lineColor(line)}`} aria-selected={stop ? line === stop.line : undefined} onClick={() => showStops(line)}><span class="dot"></span>{line}</button>)}</div>
      <p class="note" id="stopSummary" style="margin:0 0 8px">{stop?.summary ?? ''}</p>
      <div class="tw"><table><thead><tr><th class="l">역</th><th>잰 횟수</th><th>잰 시간</th><th>지도 값</th><th class="l">상태</th></tr></thead><tbody id="stopTable"><Cells rows={stop?.rows} /></tbody></table></div>
      <p class="note">지난 8일 동안 역에 도착해서 출발할 때까지를 잰 값이에요. 30번 넘게 재고 노선 평균과 5초 넘게 다른 역만 따로 배우고, 나머지 역은 노선 평균을 써요. 출발 신호가 없는 역(코레일 구간)은 도착해서 다음 역에 도착하기까지가 예상보다 얼마나 늦는지로 추정해요(도착 n = 그 기록 수). 추정값엔 다음 구간 시간표 오차도 섞여 있어요. 지도 값은 30~180초 안으로 잘라요.</p>
    </section>

    <section class="box">
      <h2>날짜별 자세한 기록</h2>
      <div class="tw"><table id="daysTable"><thead><tr><th>날짜</th><th>도착정보</th><th>열차 위치</th><th>학습용</th><th>이 날로 채점(평균)<br />쓰던 값 → 새 값</th><th>결과</th></tr></thead>
        <tbody><Cells rows={filled.daysTable} /></tbody></table></div>
    </section>
  </div>;
}

function LearningPage() {
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
    <BusPanel />
    <p class="muted" id="updated" style="margin:0;font-size:12px;text-align:center">{view.filled.updated ?? ''}</p>
  </>;
}

// HTML 에 있던 첫 그림(같은 모양)을 비우고 그 자리에 그린다 — 같은 작업 안이라 깜박이지 않는다
main.textContent = '';
set({});
if (location.hash === '#bus') showTab(1);
fetch('/admin/learning.json', { cache: 'no-cache' }).then(response => { if (response.status === 401) { location.href = '/admin/login.html?next=/admin/learning'; throw 0 } return response.json() }).then((received:Learning) => {
  data = received;
  fillAll(received);
}).catch(error => { if (error !== 0) set({ error: true }) });
