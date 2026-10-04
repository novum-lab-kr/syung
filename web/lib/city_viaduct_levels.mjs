// 심시티 고가의 층 (levels) — where two lines' platforms overlap in plan at a transfer station (약수 3·6호선, 충무로 3·4호선,
// 서울역 1·4호선·공항철도·경의중앙선…), the lines take different levels of the viaduct, the pack's levels.stepM apart
// (11 m, 18 m, 25 m, …). Lines that do not overlap share a level, so the top never climbs higher than it must.
// The assignment is fixed by rule (the lines in a fixed order, each taking the lowest free level), so a station
// never changes between frames or sessions. Between stations the deck ramps gently (levels.grade) from one level to
// the other, next to the higher station's platform; single stations between two raised transfer stations close by
// keep the raised level rather than dipping and climbing again. All of it in pure functions (the tests use them).
import SEOUL from './city_style_seoul.mjs';

const V_OF = pack => pack.viaduct || SEOUL.viaduct;
export const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) };

// a fixed order of the lines: the numbered lines by number, then the rest by their names' code points
export function lineRank(line) { const m = /^(\d+)호선$/.exec(line); return m ? +m[1] : null }
export function compareLines(a, b) { const ra = lineRank(a), rb = lineRank(b); if (ra !== null && rb !== null) return ra - rb; if (ra !== null) return -1; if (rb !== null) return 1; return a < b ? -1 : a > b ? 1 : 0 }

// the shortest distance from a point to a segment, and between two segments (0 when they cross), in the plane
export function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
export function segmentsCross(a0, a1, b0, b1) {
  const d1 = cross(b0, b1, a0), d2 = cross(b0, b1, a1), d3 = cross(a0, a1, b0), d4 = cross(a0, a1, b1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
export function segmentDistance(a0, a1, b0, b1) {
  if (segmentsCross(a0, a1, b0, b1)) return 0;
  return Math.min(pointSegmentDistance(a0, b0, b1), pointSegmentDistance(a1, b0, b1), pointSegmentDistance(b0, a0, a1), pointSegmentDistance(b1, a0, a1));
}

// one station's lines → their levels (1 = the lowest). In line order, each takes the lowest level no earlier line
// that overlaps it in plan (station segments nearer than overlapM) has taken. items: [{line, seg: [[x,y],[x,y]]}]
export function assignLevels(items, overlapM) {
  const sorted = [...items].sort((p, q) => compareLines(p.line, q.line)), out = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const used = new Set();
    for (let j = 0; j < i; j++) if (segmentDistance(sorted[i].seg[0], sorted[i].seg[1], sorted[j].seg[0], sorted[j].seg[1]) < overlapM) used.add(out.get(sorted[j].line));
    let L = 1; while (used.has(L)) L++; out.set(sorted[i].line, L);
  }
  return out;
}
// every line:station → its level, from the station rectangles (rects: Map('line:id' → {coords: [[lon,lat]…]}), toM(lon,lat) → [x,y] metres)
export function stationLevels(rects, toM, overlapM) {
  const byStation = new Map();
  for (const [k, r] of rects) {
    const i = k.lastIndexOf(':'), line = k.slice(0, i), id = k.slice(i + 1), c = r.coords; if (!c || c.length < 2) continue;
    const seg = [toM(c[0][0], c[0][1]), toM(c[c.length - 1][0], c[c.length - 1][1])];
    if (!byStation.has(id)) byStation.set(id, []); byStation.get(id).push({ line, seg });
  }
  const out = new Map();
  for (const [id, items] of byStation) { if (items.length < 2) { out.set(items[0].line + ':' + id, 1); continue } for (const [line, L] of assignLevels(items, overlapM)) out.set(line + ':' + id, L) }
  return out;
}
// a line stays up over the single stations between two raised stations within holdM of track (no dip and climb back);
// paths: {line: [[station ids…]…]}, edgeLength(line, a, b) → metres, single(id) → the station serves one line
export function holdLevels(levels, paths, edgeLength, holdM, single) {
  for (const [line, chunks] of Object.entries(paths || {})) for (const ids of chunks) {
    const L = ids.map(id => levels.get(line + ':' + id) ?? 1);
    let i = 0;
    while (i < ids.length) {
      if (L[i] <= 1) { i++; continue }
      let j = i + 1; while (j < ids.length && L[j] <= 1 && single(ids[j])) j++;
      if (j < ids.length && L[j] > 1 && j > i + 1) {
        let len = 0; for (let k = i; k < j; k++) len += edgeLength(line, ids[k], ids[k + 1]);
        if (len <= holdM) { const lv = Math.min(L[i], L[j]); for (let k = i + 1; k < j; k++) { L[k] = lv; levels.set(line + ':' + ids[k], lv) } }
      }
      i = j;
    }
  }
  return levels;
}
export function levelHeight(level, pack = SEOUL) { const V = V_OF(pack); return V.railHeightM + (Math.max(1, level | 0) - 1) * V.levels.stepM }
// the deck's height along an edge: s metres from the lo station (0) to the hi station (total). Flat through each
// platform (its half-length + marginM), one ramp between at the pack's grade (shorter only when the edge is), next
// to the higher station's platform, eased at both ends.
export function edgeProfile(hLo, hHi, total, platLo, platHi, pack = SEOUL) {
  if (Math.abs(hLo - hHi) < 1e-6 || !(total > 0)) return () => hLo;
  const V = V_OF(pack).levels, a = Math.min(total * .45, platLo + V.marginM), b = Math.min(total * .45, platHi + V.marginM), free = Math.max(1, total - a - b);
  const ramp = Math.min(free, Math.abs(hHi - hLo) / V.grade), s0 = hLo > hHi ? a : total - b - ramp, s1 = s0 + ramp;
  return s => s <= s0 ? hLo : s >= s1 ? hHi : hLo + (hHi - hLo) * smooth01((s - s0) / ramp);
}
export default { compareLines, assignLevels, stationLevels, holdLevels, levelHeight, edgeProfile, segmentDistance };
