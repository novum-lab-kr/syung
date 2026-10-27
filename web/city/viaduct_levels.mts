// 심시티 고가의 층 (levels) — where two lines' platforms overlap in plan at a transfer station (약수 3·6호선, 충무로 3·4호선,
// 서울역 1·4호선·공항철도·경의중앙선…), the lines take different levels of the viaduct, the pack's levels.stepM apart
// (11 m, 18 m, 25 m, …). Lines that do not overlap share a level, so the top never climbs higher than it must.
// The assignment is fixed by rule (the lines in a fixed order, each taking the lowest free level), so a station
// never changes between frames or sessions. Between stations the deck ramps gently (levels.grade) from one level to
// the other, next to the higher station's platform; single stations between two raised transfer stations close by
// keep the raised level rather than dipping and climbing again. All of it in pure functions (the tests use them).
import SEOUL from '../modes/basic/city.mjs';

// 평면의 점(미터) · 두 끝점으로 된 선분
type Pt = readonly [number, number];
type StationId = string | number;
// 팩에서 이 파일이 읽는 칸(modes/basic/city.mjs viaduct)
interface LevelsSpec { stepM:number; grade:number; marginM:number; humpGrade?:number; humpPadM?:number; crossAngleDeg?:number }
export interface LevelsPack { viaduct?:{ railHeightM:number; levels:LevelsSpec } }
// 고가 상판의 줄(ribbonRows): 시작에서 s 미터 지점의 평면 위치
interface Row { s:number; x:number; y:number }
// 역과 역 사이 한 구간(city/viaduct.mjs edgeList): box = [minX, minY, maxX, maxY]
export interface LevelEdge { id:string; line:string; rows:Row[]; box:readonly [number, number, number, number]; lo:StationId; hi:StationId }
// 두 노선의 상판이 가까워지는 곳: 각 구간을 따라 s 범위
export interface OverlapRegion { a:string; b:string; sa0:number; sa1:number; sb0:number; sb1:number; d:number; ang?:number }
// 다른 상판을 넘는 혹: [s0, s1] 에서 높이 h
export interface Hump { s0:number; s1:number; h:number; over?:string; so0?:number; so1?:number }
type Profile = (s:number) => number;
export interface CrossingEnv {
  edges:Map<string, LevelEdge>; profile:(edge:LevelEdge) => Profile; stationH:(line:string, id:StationId) => number;
  platHalf:(line:string, id:StationId) => number; base:(line:string) => number; levelH:(line:string, level:number) => number;
  apply?:(floors:Map<string, number>, humps:Map<string, Hump[]>) => void;
}

const V_OF = (pack:LevelsPack) => pack.viaduct || SEOUL.viaduct;
export const smooth01 = (t:number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) };

// a fixed order of the lines: the numbered lines by number, then the rest by their names' code points
export function lineRank(line:string):number | null { const m = /^(\d+)호선$/.exec(line); return m ? +m[1]! : null }
export function compareLines(a:string, b:string):number { const ra = lineRank(a), rb = lineRank(b); if (ra !== null && rb !== null) return ra - rb; if (ra !== null) return -1; if (rb !== null) return 1; return a < b ? -1 : a > b ? 1 : 0 }

// the shortest distance from a point to a segment, and between two segments (0 when they cross), in the plane
export function pointSegmentDistance(p:Pt, a:Pt, b:Pt):number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
const cross = (o:Pt, a:Pt, b:Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
export function segmentsCross(a0:Pt, a1:Pt, b0:Pt, b1:Pt):boolean {
  const d1 = cross(b0, b1, a0), d2 = cross(b0, b1, a1), d3 = cross(a0, a1, b0), d4 = cross(a0, a1, b1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
export function segmentAngle(a0:Pt, a1:Pt, b0:Pt, b1:Pt):number { const ax = a1[0] - a0[0], ay = a1[1] - a0[1], bx = b1[0] - b0[0], by = b1[1] - b0[1], l = Math.hypot(ax, ay) * Math.hypot(bx, by) || 1; return Math.acos(Math.min(1, Math.abs(ax * bx + ay * by) / l)) * 180 / Math.PI }
export function segmentDistance(a0:Pt, a1:Pt, b0:Pt, b1:Pt):number {
  if (segmentsCross(a0, a1, b0, b1)) return 0;
  return Math.min(pointSegmentDistance(a0, b0, b1), pointSegmentDistance(a1, b0, b1), pointSegmentDistance(b0, a0, a1), pointSegmentDistance(b1, a0, a1));
}

// one station's lines → their levels (1 = the lowest). In line order, each takes the lowest level no earlier line
// that overlaps it in plan (station segments nearer than overlapM) has taken. items: [{line, seg: [[x,y],[x,y]]}]
export function assignLevels(items:readonly { line:string; seg:readonly [Pt, Pt] }[], overlapM:number, floors:Map<string, number> | null = null, crossAngle = 25):Map<string, number> {
  const sorted = [...items].sort((p, q) => compareLines(p.line, q.line)), out = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const used = new Set<number | undefined>();
    for (let j = 0; j < i; j++) if (segmentDistance(sorted[i]!.seg[0], sorted[i]!.seg[1], sorted[j]!.seg[0], sorted[j]!.seg[1]) < overlapM && segmentAngle(sorted[i]!.seg[0], sorted[i]!.seg[1], sorted[j]!.seg[0], sorted[j]!.seg[1]) >= crossAngle) used.add(out.get(sorted[j]!.line));   // side by side (parallel, shared track): the same level, drawn as one deck
    let L = Math.max(1, floors?.get(sorted[i]!.line) ?? 1); while (used.has(L)) L++; out.set(sorted[i]!.line, L);   // floors: a deck crossing another just outside the station holds the platform up
  }
  return out;
}
// every line:station → its level, from the station rectangles (rects: Map('line:id' → {coords: [[lon,lat]…]}), toM(lon,lat) → [x,y] metres)
export function stationLevels(rects:Map<string, { coords?:readonly (readonly [number, number])[] }>, toM:(lon:number, lat:number) => Pt, overlapM:number, floors:Map<string, number> | null = null, crossAngle = 25):Map<string, number> {
  const byStation = new Map<string, { line:string; seg:[Pt, Pt] }[]>();
  for (const [k, r] of rects) {
    const i = k.lastIndexOf(':'), line = k.slice(0, i), id = k.slice(i + 1), c = r.coords; if (!c || c.length < 2) continue;
    const seg:[Pt, Pt] = [toM(c[0]![0], c[0]![1]), toM(c[c.length - 1]![0], c[c.length - 1]![1])];
    if (!byStation.has(id)) byStation.set(id, []); byStation.get(id)!.push({ line, seg });
  }
  const out = new Map<string, number>();
  for (const [id, items] of byStation) {
    const fl = floors ? new Map(items.map(it => [it.line, floors.get(it.line + ':' + id) ?? 1])) : null;
    if (items.length < 2) { out.set(items[0]!.line + ':' + id, Math.max(1, fl?.get(items[0]!.line) ?? 1)); continue }
    for (const [line, L] of assignLevels(items, overlapM, fl, crossAngle)) out.set(line + ':' + id, L);
  }
  return out;
}
// a line stays up over the single stations between two raised stations within holdM of track (no dip and climb back);
// paths: {line: [[station ids…]…]}, edgeLength(line, a, b) → metres, single(id) → the station serves one line
export function holdLevels(levels:Map<string, number>, paths:Record<string, StationId[][]> | null | undefined, edgeLength:(line:string, a:StationId, b:StationId) => number, holdM:number, single:(id:StationId) => boolean):Map<string, number> {
  for (const [line, chunks] of Object.entries(paths || {})) for (const ids of chunks) {
    const L = ids.map(id => levels.get(line + ':' + id) ?? 1);
    let i = 0;
    while (i < ids.length) {
      if (L[i]! <= 1) { i++; continue }
      let j = i + 1; while (j < ids.length && L[j]! <= 1 && single(ids[j]!)) j++;
      if (j < ids.length && L[j]! > 1 && j > i + 1) {
        let len = 0; for (let k = i; k < j; k++) len += edgeLength(line, ids[k]!, ids[k + 1]!);
        if (len <= holdM) { const lv = Math.min(L[i]!, L[j]!); for (let k = i + 1; k < j; k++) { L[k] = lv; levels.set(line + ':' + ids[k], lv) } }
      }
      i = j;
    }
  }
  return levels;
}
export function levelHeight(level:number, pack:LevelsPack = SEOUL):number { const V = V_OF(pack); return V.railHeightM + (Math.max(1, level | 0) - 1) * V.levels.stepM }
// the deck's height along an edge: s metres from the lo station (0) to the hi station (total). Flat through each
// platform (its half-length + marginM), one ramp between at the pack's grade (shorter only when the edge is), next
// to the higher station's platform, eased at both ends.
// humps: [{s0, s1, h}] — where this deck crosses over another between the stations it rises to h over [s0, s1], ramping
// up before and down after at humpGrade (eased); the profile is the higher of the station ramp and every hump
export function edgeProfile(hLo:number, hHi:number, total:number, platLo:number, platHi:number, pack:LevelsPack = SEOUL, humps:readonly Hump[] | null = null):Profile {
  const V = V_OF(pack).levels, g = V.humpGrade ?? V.grade, H = (humps || []).filter(h => h && h.h > Math.min(hLo, hHi) + 1e-6), ref = Math.min(hLo, hHi);
  const tents = H.map(h => { const L = Math.max(1, (h.h - ref) / g); return (s:number) => { const d = s < h.s0 ? h.s0 - s : s > h.s1 ? s - h.s1 : 0; return d >= L ? -Infinity : ref + (h.h - ref) * smooth01(1 - d / L) } });
  let base:Profile;
  if (Math.abs(hLo - hHi) < 1e-6 || !(total > 0)) base = () => hLo;
  else {
    const a = Math.min(total * .45, platLo + V.marginM), b = Math.min(total * .45, platHi + V.marginM), free = Math.max(1, total - a - b);
    const ramp = Math.min(free, Math.abs(hHi - hLo) / V.grade), s0 = hLo > hHi ? a : total - b - ramp, s1 = s0 + ramp;
    base = (s:number) => s <= s0 ? hLo : s >= s1 ? hHi : hLo + (hHi - hLo) * smooth01((s - s0) / ramp);
  }
  if (!tents.length) return base;
  return (s:number) => { let h = base(s); for (const t of tents) { const v = t(s); if (v > h) h = v } return h };
}
// where two decks of different lines come within nearM of each other in plan (a crossing, or running side by side):
// regions [{a, b, sa0, sa1, sb0, sb1, d}] with the s-ranges along each edge. edges: [{id, line, rows, box}] (rows: ribbonRows)
export function edgeOverlaps(edges:readonly LevelEdge[], nearM:number, step = 8):OverlapRegion[] {
  const CELL = 600, grid = new Map<string, number[]>(), key = (x:number, y:number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`, out:OverlapRegion[] = [];
  edges.forEach((e, i) => { if (!e.rows || e.rows.length < 2) return; const b = e.box; for (let gx = Math.floor((b[0] - nearM) / CELL); gx <= Math.floor((b[2] + nearM) / CELL); gx++) for (let gy = Math.floor((b[1] - nearM) / CELL); gy <= Math.floor((b[3] + nearM) / CELL); gy++) { const k = `${gx},${gy}`; if (!grid.has(k)) grid.set(k, []); grid.get(k)!.push(i) } });
  const pairs = new Set<string>();
  for (const list of grid.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const A = edges[list[i]!]!, B = edges[list[j]!]!; if (A.line === B.line) continue; const pk = list[i]! < list[j]! ? list[i] + ':' + list[j] : list[j] + ':' + list[i]; if (pairs.has(pk)) continue; pairs.add(pk);
    const ba = A.box, bb = B.box; if (ba[2] < bb[0] - nearM || ba[0] > bb[2] + nearM || ba[3] < bb[1] - nearM || ba[1] > bb[3] + nearM) continue;
    out.push(...overlapRegions(A, B, nearM, step)) }
  return out;
}
// the nearest point of edge B's polyline to p: {d, s}
function nearestOn(B:LevelEdge, p:Pt):{ d:number; s:number; dir:Pt } {
  const R = B.rows; let best = Infinity, bs = 0, dir:Pt = [1, 0];
  for (let i = 0; i + 1 < R.length; i++) { const a = R[i]!, b = R[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a.x) * dx + (p[1] - a.y) * dy) / l2)), d = Math.hypot(p[0] - a.x - dx * t, p[1] - a.y - dy * t); if (d < best) { best = d; bs = a.s + (b.s - a.s) * t; dir = [dx, dy] } }
  return { d: best, s: bs, dir };
}
function overlapRegions(A:LevelEdge, B:LevelEdge, nearM:number, step:number):OverlapRegion[] {
  const rows = A.rows, total = rows[rows.length - 1]!.s, out:OverlapRegion[] = []; let run:{ sa0:number; sa1:number; sb0:number; sb1:number; d:number; ang:number } | null = null;
  const flush = () => { if (run) { out.push({ a: A.id, b: B.id, sa0: run.sa0, sa1: run.sa1, sb0: Math.min(run.sb0, run.sb1), sb1: Math.max(run.sb0, run.sb1), d: run.d, ang: run.ang }); run = null } };
  for (let s = 0; s <= total + 1e-9; s += step) {
    const q = rowAtRows(rows, Math.min(s, total)), n = nearestOn(B, [q.x, q.y]);
    if (n.d < nearM) {
      const q2 = rowAtRows(rows, Math.min(total, s + 4)), q1 = rowAtRows(rows, Math.max(0, s - 4)), ang = segmentAngle([q1.x, q1.y], [q2.x, q2.y], [0, 0], n.dir);
      if (!run) run = { sa0: s, sa1: s, sb0: n.s, sb1: n.s, d: n.d, ang }; else { run.sa1 = s; run.sb1 = n.s; if (n.d < run.d) { run.d = n.d; run.ang = ang } }
    } else flush();
  }
  flush(); return out;
}
// the point s along ribbon rows (as city_viaduct's rowAt, kept here so this module stands alone)
function rowAtRows(rows:readonly Row[], s:number):{ x:number; y:number } {
  let i = 1, j = rows.length - 1; while (i < j) { const m = (i + j) >> 1; if (rows[m]!.s < s) i = m + 1; else j = m }
  const A = rows[i - 1]!, B = rows[i]!, l = (B.s - A.s) || 1, u = Math.max(0, Math.min(1, (s - A.s) / l));
  return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u };
}
// Separate every crossing: for each region the later line (compareLines) goes over the other, a level above it there. The
// hump must ramp down before the platform zones at the edge's ends; where it cannot, that station's level is raised instead
// (floors). Heights only rise, so the passes converge; the order is fixed, so the result is the same every time.
// env: {edges: Map(id → edge), profile(edge) → s ⇒ h (with the current humps and floors), stationH(line, id) → h,
//       platHalf(line, id) → m, base(line) → the line's level-1 rail height, levelH(line, level) → h}
export function resolveCrossings(regions:readonly OverlapRegion[], env:CrossingEnv, pack:LevelsPack = SEOUL):{ floors:Map<string, number>; humps:Map<string, Hump[]>; notes:{ edge:string; station:string; level:number; why:string }[] } {
  const V = V_OF(pack).levels, g = V.humpGrade ?? V.grade, pad = V.humpPadM ?? 12, step = V.stepM, floors = new Map<string, number>(), humps = new Map<string, Hump[]>(), notes:{ edge:string; station:string; level:number; why:string }[] = [];
  const sorted = [...regions].filter(r => (r.ang ?? 90) >= (V.crossAngleDeg ?? 25)).sort((p, q) => (p.a + '|' + p.b).localeCompare(q.a + '|' + q.b));
  const sampleMax = (f:Profile, s0:number, s1:number) => { let m = -Infinity; for (let k = 0; k <= 6; k++) m = Math.max(m, f(s0 + (s1 - s0) * k / 6)); return m };
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (const r of sorted) {
      const A = env.edges.get(r.a), B = env.edges.get(r.b); if (!A || !B) continue;
      const up = compareLines(A.line, B.line) > 0 ? 'a' : 'b', U = up === 'a' ? A : B, L = up === 'a' ? B : A;
      const su0 = up === 'a' ? r.sa0 : r.sb0, su1 = up === 'a' ? r.sa1 : r.sb1, sl0 = up === 'a' ? r.sb0 : r.sa0, sl1 = up === 'a' ? r.sb1 : r.sa1;
      const fU = env.profile(U), fL = env.profile(L); let gap = Infinity; for (let k = 0; k <= 6; k++) gap = Math.min(gap, Math.abs(fU(su0 + (su1 - su0) * k / 6) - fL(sl0 + (sl1 - sl0) * k / 6)));
      if (gap >= step - .3) continue;   // already a level apart (either way round): nothing to do
      const hL = sampleMax(fL, sl0, sl1);
      const need = hL + step, level = Math.max(1, Math.ceil((need - env.base(U.line) - 1e-6) / step) + 1), hNeed = env.levelH(U.line, level);
      const total = U.rows[U.rows.length - 1]!.s, rampL = Math.max(0, (hNeed - Math.min(env.stationH(U.line, U.lo), env.stationH(U.line, U.hi))) / g);
      const zoneLo = env.platHalf(U.line, U.lo) + V.marginM, zoneHi = total - env.platHalf(U.line, U.hi) - V.marginM;
      const fitLo = su0 - pad - rampL >= zoneLo, fitHi = su1 + pad + rampL <= zoneHi;
      const raise = (id:StationId) => { const k = U.line + ':' + id; if ((floors.get(k) ?? 1) < level) { floors.set(k, level); changed = true; notes.push({ edge: U.id, station: k, level, why: 'no room for the ramp' }) } };
      if (!fitLo) raise(U.lo); if (!fitHi) raise(U.hi);
      const list = humps.get(U.id) || [], same = list.find(h => Math.abs(h.s0 - (su0 - pad)) < 1 && Math.abs(h.s1 - (su1 + pad)) < 1);   // the hump (where a station was raised the base profile is already up there and the hump adds nothing)
      if (!same) { list.push({ s0: su0 - pad, s1: su1 + pad, h: hNeed, over: L.id, so0: sl0, so1: sl1 }); humps.set(U.id, list); changed = true }
      else if (same.h < hNeed - 1e-6) { same.h = hNeed; changed = true }
    }
    if (env.apply) env.apply(floors, humps);   // the caller rebuilds station levels (with the floors) and profiles (with the humps) before the next pass
    if (!changed) break;
  }
  return { floors, humps, notes };
}
// the regions where two decks still share a level (for checks): [{a, b, gap, sa, sb}]
export function sameLevelRegions(regions:readonly OverlapRegion[], env:CrossingEnv, pack:LevelsPack = SEOUL):{ a:string; b:string; gap:number; sa:number; sb:number; d:number }[] {
  const V = V_OF(pack).levels, step = V.stepM, out:{ a:string; b:string; gap:number; sa:number; sb:number; d:number }[] = [];
  for (const r of regions) {
    if ((r.ang ?? 90) < (V.crossAngleDeg ?? 25)) continue;   // side by side: one deck, by design
    const A = env.edges.get(r.a), B = env.edges.get(r.b); if (!A || !B) continue; const fa = env.profile(A), fb = env.profile(B); let gap = Infinity;
    for (let k = 0; k <= 8; k++) { const ha = fa(r.sa0 + (r.sa1 - r.sa0) * k / 8), hb = fb(r.sb0 + (r.sb1 - r.sb0) * k / 8); gap = Math.min(gap, Math.abs(ha - hb)) }
    if (gap < step - .5) out.push({ a: r.a, b: r.b, gap: +gap.toFixed(2), sa: +((r.sa0 + r.sa1) / 2).toFixed(0), sb: +((r.sb0 + r.sb1) / 2).toFixed(0), d: +r.d.toFixed(1) });
  }
  return out;
}
export default { segmentAngle, compareLines, assignLevels, stationLevels, holdLevels, levelHeight, edgeProfile, segmentDistance, edgeOverlaps, resolveCrossings, sameLevelRegions };
