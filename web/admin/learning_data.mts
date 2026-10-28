// 관리 화면 '학습 현황'의 셈(그리기는 admin/learning.tsx): 숫자 글자 · 날짜 · 채점 · 누적 그래프 점 · 노선 묶음 · 역 상태 · 오픈 기준 · 버스 글자.
// 자료는 /admin/learning.json(pipeline/build_learning_stats.py main) — 이 파일이 읽는 칸. 글자는 옛 인라인 스크립트(admin/learning.html)가 만들던 것과 같다.

export const COLORS:Record<string, string> = { '1호선': '#0052A4', '2호선': '#00A84D', '3호선': '#EF7C1C', '4호선': '#00A5DE', '5호선': '#996CAC', '6호선': '#CD7C2F', '7호선': '#747F00', '8호선': '#E6186C', '9호선': '#BDB092', 'GTX-A': '#9A6292', '경강선': '#0054A6', '경의중앙선': '#77C4A3', '경춘선': '#178C72', '공항철도': '#0090D2', '김포골드라인': '#AD8605', '서해선': '#8FC31F', '수인분당선': '#F5A200', '신림선': '#6789CA', '신분당선': '#D4003B', '에버라인선': '#6FB245', '우이신설선': '#B7C452', '의정부선': '#FDA600', '인천1호선': '#7CA8D5', '인천2호선': '#ED8B00' };
const ORDER = Object.keys(COLORS);
export const byLineOrder = (left:string, right:string):number => ORDER.indexOf(left) - ORDER.indexOf(right);
export const lineColor = (line:string):string => COLORS[line] || '#888';
// 속도 구간을 몇 번 재야 값을 믿나
export const ENOUGH = 2000, SOME = 300;
// 역 머무는 시간을 따로 배우려면 몇 번 재야 하나
export const MIN_STOPS = 30;

// ---- learning.json(이 화면이 읽는 칸) ----
export interface FeedDay { records?:number; sightings?:number; event?:number; trains?:number }
export interface Day { date:string; samples?:FeedDay; position?:FeedDay }
export interface Scored { n?:number; all?:number | null; mean?:number | null; p90?:number | null; means?:Record<string, number>; [kind:string]:unknown }
export interface History { date:string; result?:string; candidate?:Scored; current?:Scored }
export interface LineValues { pace?:number | null; rushPace?:number | null; zone?:number | null; approach?:number | null; stops?:Record<string, number> }
export interface Latest {
  lines?:Record<string, LineValues>; default?:LineValues; n?:Record<string, { pace?:number }>;
  stations?:Record<string, (number | string)[]>; stands?:Record<string, Record<string, [number, number | null, number?]>>; names?:Record<string, string>;
}
export interface Gap { n?:number; meanAbs?:number }
export interface BusScore { date:string; trainedRoutes?:number; results:Record<string, Record<string, Gap>> }
export interface BusRoute { name:string; color?:string; type?:string; calls:number; buses:number; days:number }
export interface BusDay { date:string; rows:number; calls:number; buses:number; routes:number }
export interface Bus { days?:BusDay[]; routes?:BusRoute[]; pace?:{ days?:number; routes?:{ name:string; color?:string; hours:number }[] }; scores?:BusScore[] }
export interface Stat { signedMedian?:number; absMedian?:number; p90?:number }
export interface ReplayWindow { line:string; window:string; trains?:number; events?:number; arrive?:Stat; depart?:Stat; stalls?:{ n?:number; perTrainHour?:number }; coverage?:number | null }
export interface Replay { days?:{ day:string; windows:ReplayWindow[] }[]; criteria?:{ absMedian:number; p90:number; bias:number; stalls:number } }
export interface Learning { generatedAt?:string; days?:Day[]; history?:History[]; latest?:Latest; replay?:Replay; bus?:Bus }

// ---- 글자 ----
export function fmt(count:number):string {
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}백만`;
  return count >= 1e4 ? `${(count / 1e4).toFixed(1)}만` : Math.round(count).toLocaleString('ko-KR');
}
export const md = (date:string):string => { const [, month = '', day = ''] = date.split('-'); return `${+month}/${+day}` };
export const sightings = (day:Day):number => (day.samples?.sightings || 0) + (day.position?.sightings || 0);
export const events = (day:Day):number => (day.samples?.event || 0) + (day.position?.event || 0);
export const addDay = (date:string, count:number):string => { const time = new Date(`${date}T00:00:00Z`); time.setUTCDate(time.getUTCDate() + count); return time.toISOString().slice(0, 10) };
export const pct = (pace:number):number => Math.round((pace - 1) * 100);
export const r1 = (value:number | null | undefined):number | null => value == null ? null : Math.round(value * 10) / 10;

// ---- 날마다 채점(그래프 · 큰 숫자) — 밤 R 의 채점은 R − 1 날 열차를 매기므로 그 날 아래에 ----
export interface Score { day:string; cand:number; cur:number | null; n?:number; result?:string; kinds:Scored }
export const scores = (history:History[]):Score[] => history.filter(item => item.candidate?.mean != null)
  .map(item => ({ day: addDay(item.date, -1), cand: r1(item.candidate!.mean)!, cur: r1(item.current?.mean), n: item.candidate!.n, result: item.result, kinds: item.candidate! }));

export interface ScoreChart {
  width:number; height:number; left:number; right:number;
  grid:{ y:number; label:number }[]; points:{ x:number; cur:number | null; candY:number; cand:number; label:string; bottom:number }[];
}
export function scoreChart(list:Score[]):ScoreChart | null {
  if (!list.length) return null;
  const width = 560, height = 190, left = 16, right = 16, top = 26, bottom = 34, values = list.flatMap(item => [item.cand, item.cur].filter(value => value != null) as number[]);
  const low = Math.floor(Math.min(...values)) - 1, high = Math.ceil(Math.max(...values)) + 1;
  const xOf = (index:number) => list.length === 1 ? width / 2 : left + 60 + index * (width - left - right - 84) / (list.length - 1);
  const yOf = (value:number) => top + (height - top - bottom) * (high - value) / (high - low);
  const grid = [];
  for (let value = Math.ceil(low); value <= high; value += high - low > 8 ? 4 : 2) grid.push({ y: yOf(value), label: value });
  return { width, height, left, right, grid,
    points: list.map((item, index) => ({ x: xOf(index), cur: item.cur != null ? yOf(item.cur) : null, candY: yOf(item.cand), cand: item.cand, label: md(item.day), bottom: height - 8 })) };
}

// 큰 숫자 옆 비교 글자 · class
export function scoreDelta(last:Score):{ cls:string; text:string } {
  const cur = last.cur, diff = cur != null ? +(last.cand - cur).toFixed(1) : 0;
  if (cur == null) return { cls: 'delta same', text: '첫 채점' };
  if (last.result === 'kept current') return { cls: 'delta up', text: `쓰던 값(${cur}초)이 더 나아 그대로 써요` };
  if (diff < 0) return { cls: 'delta down', text: `▼ 같은 날 쓰던 값(${cur}초)보다 ${-diff}초 좋아졌어요` };
  return { cls: 'delta same', text: diff > 0 ? `쓰던 값(${cur}초)과 거의 같아요` : `같은 날 쓰던 값도 ${cur}초 · 그대로예요` };
}

// ---- 누적 그래프(학습 기록 · 버스 기록) ----
export interface Growth {
  total:number; width:number; height:number; left:number; right:number; base:number; line:string; polygon:string;
  points:{ x:number; y:number; label:string; value:{ text:string; anchor:'start' | 'end' } | null }[];
}
export function growth<T extends { date:string }>(days:T[], value:(day:T) => number):Growth | null {
  if (!days.length) return null;
  let total = 0; const points = days.map(day => ({ date: day.date, sum: (total += value(day)) }));
  const width = 560, height = 220, left = 12, right = 12, top = 28, bottom = 26, most = total * 1.1;
  const xOf = (index:number) => points.length === 1 ? width / 2 : left + 20 + index * (width - left - right - 40) / (points.length - 1), yOf = (sum:number) => top + (height - top - bottom) * (1 - sum / most);
  const line = points.map((point, index) => `${xOf(index)},${yOf(point.sum)}`).join(' ');
  return { total, width, height, left, right, base: yOf(0), line, polygon: `${xOf(0)},${yOf(0)} ${line} ${xOf(points.length - 1)},${yOf(0)}`,
    points: points.map((point, index) => ({ x: xOf(index), y: yOf(point.sum), label: md(point.date),
      value: index === points.length - 1 || index === 0 ? { text: fmt(point.sum), anchor: index === 0 ? 'start' : 'end' } : null })) };
}

// ---- 노선별 학습 상태: 속도 구간 수로 세 묶음 ----
export function lineTiers(latest:Latest, history:History[]):{ name:string; cls:string; hint:string; lines:{ line:string; values:LineValues; count:number }[] }[] {
  const lines = latest.lines || {}, counts = latest.n || ([...history].reverse().find(item => (item as History & { n?:unknown }).n) as History & { n?:Latest['n'] } | undefined)?.n || {};
  const all = [...new Set([...Object.keys(lines), ...Object.keys(counts)])].sort(byLineOrder);
  const tier = (line:string) => { const count = counts[line]?.pace || 0; if (count >= ENOUGH) return 0; return count >= SOME ? 1 : 2 };
  const meta = [['충분히 배웠어요', 'b-good', '값을 믿고 써요'], ['배우는 중', 'b-mid', '며칠 더 모으면 정확해져요'], ['데이터 모으는 중', 'b-low', '아직 대부분 기본값을 써요']] as const;
  return meta.map(([name, cls, hint], index) => ({ name, cls, hint,
    lines: all.filter(line => tier(line) === index).map(line => ({ line, values: lines[line] || {}, count: counts[line]?.pace || 0 })) }));
}

// ---- 역별 머무는 시간: 상태 칸 ----
export interface StopRow { name:string; times:number; sec:number | null; runs:number; own:boolean; use:number; base:number; status:[string, string, string] }
export function stopRows(latest:Latest, line:string):{ rows:StopRow[]; summary:string } {
  const values = latest.lines?.[line] || {}, fallback = latest.default || {}, base = (values.zone ?? fallback.zone)!, own = values.stops || {}, got = latest.stands?.[line] || {}, names = latest.names || {};
  const rows = (latest.stations?.[line] || []).map(id => {
    const [times, sec, runs = 0] = got[id as string] || [0, null, 0], timed = times >= MIN_STOPS, count = timed ? times : runs, mine = own[id as string];
    let status:[string, string, string];
    if (mine != null) status = timed ? ['b-good', '따로 배움', '따로'] : ['b-est', '도착으로 추정', '추정'];
    else status = timed || runs >= MIN_STOPS ? ['b-mid', '평균과 비슷', '비슷'] : ['b-low', `모으는 중 ${count}/${MIN_STOPS}`, `${count}/${MIN_STOPS}`];
    return { name: names[id as string] || `역 ${id}`, times, sec, runs, own: mine != null, use: mine ?? base, base, status };
  });
  const count = (cls:string) => rows.filter(row => row.status[0] === cls).length;
  return { rows, summary: `${line} ${rows.length}개 역 · 따로 배움 ${count('b-good')}${count('b-est') ? ` · 도착으로 추정 ${count('b-est')}` : ''} · 평균과 비슷 ${count('b-mid')} · 모으는 중 ${count('b-low')} · 노선 평균 ${base}초${values.zone == null ? ' (기본값)' : ''}` };
}
// 처음 여는 노선: 잰 역이 가장 많은 노선(같으면 앞 노선)
export function firstStopLine(latest:Latest, lines:string[]):string {
  const timed = (line:string) => Object.values(latest.stands?.[line] || {}).filter(([times]) => times >= MIN_STOPS).length;
  return lines.reduce((best, line) => timed(line) > timed(best) ? line : best);
}

// ---- 오픈 기준(화면 다시 그리기 점수) ----
export const CRITERIA = { absMedian: 15, p90: 30, bias: 10, stalls: 0 };
export function openPass(windows:ReplayWindow[], criteria:typeof CRITERIA):number {
  return windows.filter(win => Math.abs(win.arrive?.signedMedian as number) <= criteria.bias && (win.arrive?.absMedian as number) <= criteria.absMedian && (win.arrive?.p90 as number) <= criteria.p90
    && Math.abs(win.depart?.signedMedian as number) <= criteria.bias && (win.depart?.absMedian as number) <= criteria.absMedian && (win.depart?.p90 as number) <= criteria.p90
    && (win.stalls?.n as number) <= criteria.stalls).length;
}

// ---- 버스 ----
export const BUS_TYPES:Record<string, string> = { trunk: '간선', branch: '지선', circular: '순환', express: '광역', night: '심야' };
export const BUS_DAYS = 7;
