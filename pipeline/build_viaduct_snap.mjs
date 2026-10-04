#!/usr/bin/env node
// 심시티 고가: where a line really runs in a tunnel under a street but OSM's (coarse) track shape cuts across a block, move the
// viaduct's path onto that street's centre line — only in the simcity mode (the runtime reads web/lib/city_viaduct_snap.mjs
// through CityViaduct.snapped). Also lists the stretches that still pass through buildings (no street to follow) for the
// city builders: scratchpad …/city/life/through-buildings.json.
//
//   node pipeline/build_viaduct_snap.mjs [--report DIR] [--only 9호선] [--cache DIR]
//
// Roads and buildings come from the OpenFreeMap z14 tiles the app itself draws (so the deck lands exactly on the drawn
// street); tunnel/bridge from the cached OSM line-*.json (as build_viaduct_flags.py reads them). Rules (pack.viaduct.snap):
//  · only real-tunnel stretches (OSM tunnel=*), never real bridges; the edge's ends (the stations) stay put over holdM and
//    blend in over the next holdM
//  · a street counts when it runs the track's way (within 30°) and is near: within nearM (45 m) always — the track most likely
//    is under it; up to maxOffsetM (150 m) only over a short run (farRunM; 0 = never: the Kakao map showed the lines that cut
//    across blocks really do run under them — those stretches go to the city builders instead, through-buildings.json)
//  · the move is smoothed (no kinks), and dropped when it is under 2 m anywhere
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodeTile } from '../web/lib/city_mvt.mjs';
import { CityViaduct } from '../web/lib/city_viaduct.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), CACHE = path.join(ROOT, 'data', 'osm-tracks');
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null };
const REPORT = opt('--report') || path.join(ROOT, 'scratchpad-snap-report'), ONLY = opt('--only'), TILES = opt('--cache') || path.join(REPORT, 'tiles14');
mkdirSync(REPORT, { recursive: true }); mkdirSync(TILES, { recursive: true });
const pack = (await import('../web/lib/city_style_seoul.mjs')).default, SN = pack.viaduct.snap, NEAR_M = SN.nearM ?? 60, FAR_M = SN.maxOffsetM ?? 150, HOLD_M = SN.holdM ?? 40;
const SAMPLE_M = 6, NEAR_WAY_M = 60, MIN_RUN_M = 60, FAR_RUN_M = SN.farRunM ?? 500, GRID = 100, CLASSES = { motorway: 0, trunk: 0, primary: 0, secondary: 4, tertiary: 10, minor: 22 }, BIG = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);

// ── frames ──
const LAT0 = 37.5665, KX = Math.cos(LAT0 * Math.PI / 180) * 111320, KY = 111320;
const toM = ([lon, lat]) => [lon * KX, lat * KY], toLL = ([x, y]) => [x / KX, y / KY];
const tileOf = (lon, lat, z = 14) => { const n = 2 ** z, x = Math.floor((lon + 180) / 360 * n), r = lat * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); return [x, y] };
const tileLL = (x, y, z = 14) => { const n = 2 ** z, lon = x / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI; return [lon, lat] };
function chaikin(pts, rounds = 3) {   // as the runtime smooths the track shapes
  for (let r = 0; r < rounds && pts.length > 2; r++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; if (i > 0) out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]); if (i < pts.length - 2) out.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]) }
    out.push(pts[pts.length - 1]); pts = out;
  }
  return pts;
}
const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) };
const key = (x, y) => `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
class Grid { constructor() { this.m = new Map() } add(k, v) { let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(v) } near(x, y, r = GRID) { const out = [], gx = Math.floor(x / GRID), gy = Math.floor(y / GRID), R = Math.ceil(r / GRID); for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) { const a = this.m.get(`${gx + i},${gy + j}`); if (a) out.push(...a) } return out } }
const pip = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const yi = r[i][1], yj = r[j][1]; if ((yi > y) !== (yj > y) && x < (r[j][0] - r[i][0]) * (y - yi) / (yj - yi) + r[i][0]) c = !c } return c };

// ── the track ──
const TS = JSON.parse(readFileSync(path.join(CACHE, 'track_shapes.json'), 'utf8')), shapes = TS.edges;
const html = readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8'), block = id => JSON.parse(html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`))[1]);
const stations = block('stationData'), paths = block('linePaths'), byId = new Map(stations.map(q => [q.id, q])), nameOf = id => byId.get(+id)?.name ?? String(id);
const edges = Object.entries(shapes).filter(([k]) => !ONLY || k.startsWith(ONLY + ':')).map(([id, coords]) => {
  const pts = chaikin(coords.map(c => c.slice())).map(toM), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1], S = [];
  for (let s = 0, i = 1; s <= total && pts.length > 1; s += SAMPLE_M) { while (i < pts.length - 1 && cum[i] < s) i++; const u = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); S.push({ s, x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u }) }
  if (S.length && total - S[S.length - 1].s > 1) S.push({ s: total, x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] });
  for (let i = 0; i < S.length; i++) { const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; S[i].tx = (b.x - a.x) / l; S[i].ty = (b.y - a.y) / l }
  return { id, line: id.slice(0, id.indexOf(':')), pts, cum, total, S };
});
console.log(`edges ${edges.length}`);
// tunnel and bridge ways of each line (OSM, cached), on a grid
const wayGrids = new Map();
function waysOf(line) {
  if (wayGrids.has(line)) return wayGrids.get(line); const f = path.join(CACHE, `line-${line}.json`), out = { tunnel: new Grid(), bridge: new Grid() };
  if (existsSync(f)) { const d = JSON.parse(readFileSync(f, 'utf8')), nodes = new Map(); for (const e of d.elements) if (e.type === 'node') nodes.set(e.id, toM([e.lon, e.lat]));
    for (const w of d.elements) { if (w.type !== 'way') continue; const t = w.tags || {}, kind = t.tunnel && t.tunnel !== 'no' ? 'tunnel' : t.bridge && t.bridge !== 'no' ? 'bridge' : null; if (!kind) continue;
      const ids = w.nodes.filter(i => nodes.has(i)); for (let i = 1; i < ids.length; i++) { const A = nodes.get(ids[i - 1]), B = nodes.get(ids[i]); const x0 = Math.min(A[0], B[0]), x1 = Math.max(A[0], B[0]), y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]); for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++) for (let gy = Math.floor(y0 / GRID); gy <= Math.floor(y1 / GRID); gy++) out[kind].add(`${gx},${gy}`, [A, B]) } } }
  wayGrids.set(line, out); return out;
}
const segDist = (p, A, B) => { const ex = B[0] - A[0], ey = B[1] - A[1], l2 = ex * ex + ey * ey || 1, u = Math.max(0, Math.min(1, ((p[0] - A[0]) * ex + (p[1] - A[1]) * ey) / l2)); return Math.hypot(A[0] + ex * u - p[0], A[1] + ey * u - p[1]) };
const nearWay = (g, p) => g.near(p[0], p[1]).some(([A, B]) => segDist(p, A, B) <= NEAR_WAY_M);
for (const e of edges) { const W = waysOf(e.line); for (const q of e.S) { q.tunnel = nearWay(W.tunnel, [q.x, q.y]); q.bridge = nearWay(W.bridge, [q.x, q.y]) }
  const S = e.S; for (let i = 0; i < S.length;) { if (S[i].tunnel) { i++; continue } let j = i; while (j < S.length && !S[j].tunnel) j++; if (i > 0 && j < S.length && (j - i) * SAMPLE_M <= 150) for (let k = i; k < j; k++) if (!S[k].bridge) S[k].tunnel = true; i = Math.max(j, i + 1) } }   // a short gap in the tunnel ways (the station box, a mapping gap) is still the tunnel

// ── the tiles: roads and buildings near the track ──
const sampleGrid = new Grid(); for (const e of edges) for (const q of e.S) sampleGrid.add(key(q.x, q.y), q);
const nearTrack = (x, y, r) => sampleGrid.near(x, y, r).some(q => Math.hypot(q.x - x, q.y - y) <= r);
const boxNearTrack = (b, pad) => { const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad; for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++) for (let gy = Math.floor(y0 / GRID); gy <= Math.floor(y1 / GRID); gy++) for (const q of sampleGrid.m.get(`${gx},${gy}`) || []) if (q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1) return true; return false };
const need = new Set();
for (const e of edges) for (const q of e.S) { const [lon, lat] = toLL([q.x, q.y]); for (const [dx, dy] of [[0, 0], [FAR_M, 0], [-FAR_M, 0], [0, FAR_M], [0, -FAR_M]]) { const [tx, ty] = tileOf(...toLL([q.x + dx, q.y + dy])); need.add(`${tx},${ty}`) } }
const tj = await (await fetch('https://tiles.openfreemap.org/planet')).json(), tpl = tj.tiles[0];
console.log(`tiles needed ${need.size} (${tpl})`);
async function tile(x, y) {
  const f = path.join(TILES, `14-${x}-${y}.pbf`); if (existsSync(f)) return readFileSync(f);
  for (let a = 0; a < 3; a++) { try { const r = await fetch(tpl.replace('{z}', '14').replace('{x}', x).replace('{y}', y), { headers: { 'User-Agent': 'subway-live-map viaduct pipeline (syung.novum-lab.com)' } }); if (r.status === 204 || r.status === 404) { writeFileSync(f, new Uint8Array(0)); return new Uint8Array(0) } if (!r.ok) throw Error('HTTP ' + r.status); const b = new Uint8Array(await r.arrayBuffer()); writeFileSync(f, b); return b } catch (err) { if (a === 2) throw err; await new Promise(r => setTimeout(r, 800 * (a + 1))) } }
}
const roadGrid = new Grid(), bldGrid = new Grid(), buildings = []; let roads = 0;
const list = [...need].map(k => k.split(',').map(Number)); let done = 0;
for (let i = 0; i < list.length; i += 4) {
  const bufs = await Promise.all(list.slice(i, i + 4).map(([x, y]) => tile(x, y)));
  bufs.forEach((buf, j) => {
    if (!buf.length) return; const [tx, ty] = list[i + j], L = decodeTile(buf, new Set(['transportation', 'building'])), [lon0, lat0] = tileLL(tx, ty), [lon1, lat1] = tileLL(tx + 1, ty + 1);
    const ll = (layer, p) => { const ext = layer.extent, lon = lon0 + (lon1 - lon0) * p.x / ext, n = 2 ** 14, my = (ty + p.y / ext) / n; return [lon, Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI] };
    const T = L.transportation; if (T) for (let k = 0; k < T.length; k++) { const f = T.feature(k), p = f.properties; if (!(p.class in CLASSES) || p.brunnel === 'tunnel' || f.type !== 2) continue;
      for (const line of f.loadGeometry()) { const P = line.map(q => toM(ll(T, q))); for (let m = 1; m < P.length; m++) { const A = P[m - 1], B = P[m], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2; if (!nearTrack(mx, my, FAR_M + 60)) continue; const len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (len < .5) continue; const seg = { A, B, len, ux: (B[0] - A[0]) / len, uy: (B[1] - A[1]) / len, cls: p.class, ramp: p.ramp === 1 }; roads++;
        for (let gx = Math.floor(Math.min(A[0], B[0]) / GRID); gx <= Math.floor(Math.max(A[0], B[0]) / GRID); gx++) for (let gy = Math.floor(Math.min(A[1], B[1]) / GRID); gy <= Math.floor(Math.max(A[1], B[1]) / GRID); gy++) roadGrid.add(`${gx},${gy}`, seg) } } }
    const Bl = L.building; if (Bl) for (let k = 0; k < Bl.length; k++) { const f = Bl.feature(k); if (f.type !== 3) continue; const rings = f.loadGeometry(); if (!rings.length) continue;
      rings.forEach((ring, ri) => {   // at z14 a feature holds many buildings: every outer ring (MVT: positive area, y down) is one; holes are skipped
        let area = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y); if (area <= 0) return;
        const outer = ring.map(q => toM(ll(Bl, q))); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
        if (!boxNearTrack([x0, y0, x1, y1], FAR_M + 40)) return;
        const b = { ring: outer, box: [x0, y0, x1, y1], h: f.properties.render_height ?? null, id: f.id ?? null, tile: `14/${tx}/${ty}`, idx: k, ring: outer, ri }; buildings.push(b);
        for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++) for (let gy = Math.floor(y0 / GRID); gy <= Math.floor(y1 / GRID); gy++) bldGrid.add(`${gx},${gy}`, b) }) }
  });
  done += bufs.length; if (done % 100 < 4) console.log(`  tiles ${done}/${list.length}, road segments ${roads}, buildings ${buildings.length}`);
}
console.log(`roads ${roads} segments, buildings ${buildings.length} near the track`);
const inBuilding = (x, y) => { for (const b of bldGrid.near(x, y)) { const B = b.box; if (x < B[0] || x > B[2] || y < B[1] || y > B[3]) continue; if (pip(x, y, b.ring)) return b } return null };

// ── snapping ──
const COS30 = Math.cos(30 * Math.PI / 180), result = {}, report = [], through = [];
for (const e of edges) {
  const S = e.S, n = S.length; if (n < 4) continue;
  const Q = new Array(n).fill(null), near = new Array(n).fill(false); let prev = null;
  for (let i = 0; i < n; i++) {
    const q = S[i]; if (!q.tunnel || q.bridge) { prev = null; continue }
    let best = null;
    for (const seg of roadGrid.near(q.x, q.y)) {
      const cos = Math.abs(seg.ux * q.tx + seg.uy * q.ty); if (cos < COS30 || seg.ramp) continue;
      const ex = seg.B[0] - seg.A[0], ey = seg.B[1] - seg.A[1], l2 = ex * ex + ey * ey || 1, u = Math.max(0, Math.min(1, ((q.x - seg.A[0]) * ex + (q.y - seg.A[1]) * ey) / l2)), px = seg.A[0] + ex * u, py = seg.A[1] + ey * u, d = Math.hypot(px - q.x, py - q.y);
      if (d > FAR_M) continue;
      let cost = d + 50 * (1 - cos) + CLASSES[seg.cls];
      if (prev) { const cx = prev.px + (q.x - S[i - 1].x), cy = prev.py + (q.y - S[i - 1].y); cost += 1.5 * Math.hypot(px - cx, py - cy) }   // carry the last move forward: no hopping between streets
      if (!best || cost < best.cost) best = { px, py, d, cost, cls: seg.cls };
    }
    if (best) { Q[i] = best; near[i] = best.d <= NEAR_M; prev = best } else prev = null;
  }
  // runs of moved samples; each accepted when every move is near, or when the move takes the deck out of buildings
  const D = new Array(n).fill(null), notes = [];
  for (let i = 0; i < n;) {
    if (!Q[i]) { i++; continue } let j = i; while (j < n && Q[j]) j++;
    const len = S[j - 1].s - S[i].s; let before = 0, after = 0, maxD = 0, allNear = true, big = true;
    for (let k = i; k < j; k++) { if (inBuilding(S[k].x, S[k].y)) before += SAMPLE_M; if (inBuilding(Q[k].px, Q[k].py)) after += SAMPLE_M; maxD = Math.max(maxD, Q[k].d); if (!near[k]) allNear = false; if (!BIG.has(Q[k].cls)) big = false }
    const ok = len >= MIN_RUN_M && (allNear || (big && len <= FAR_RUN_M && before > 15 && after < before * .5));   // a far move only fixes a block cut across, not a kilometre of line
    if (ok) for (let k = i; k < j; k++) D[k] = [Q[k].px - S[k].x, Q[k].py - S[k].y];
    notes.push({ s0: +S[i].s.toFixed(0), s1: +S[j - 1].s.toFixed(0), len: +len.toFixed(0), maxD: +maxD.toFixed(1), before, after, allNear, ok });
    i = j;
  }
  // the stations stay put: nothing moves within HOLD_M of either end, blending in over the next HOLD_M; then smoothed
  const W = new Array(n).fill(0); for (let i = 0; i < n; i++) if (D[i]) W[i] = smooth01((S[i].s - HOLD_M) / HOLD_M) * smooth01((e.total - S[i].s - HOLD_M) / HOLD_M);
  let DX = S.map((q, i) => D[i] ? D[i][0] * W[i] : 0), DY = S.map((q, i) => D[i] ? D[i][1] * W[i] : 0);
  const R = 4; for (let pass = 0; pass < 2; pass++) for (const A of [DX, DY]) { const c = A.slice(); for (let i = 0; i < n; i++) { let s = 0, m = 0; for (let k = -R; k <= R; k++) { const t = i + k; if (t < 0 || t >= n) continue; s += c[t]; m++ } A[i] = s / m } }
  let moved = 0; for (let i = 0; i < n; i++) moved = Math.max(moved, Math.hypot(DX[i], DY[i]));
  // stretches still through buildings (not moved): for the city builders
  for (let i = 0; i < n;) {
    const b = inBuilding(S[i].x + DX[i], S[i].y + DY[i]); if (!b || Math.hypot(DX[i], DY[i]) > 2) { i++; continue }
    let j = i; const hit = new Map(); while (j < n) { const bb = inBuilding(S[j].x + DX[j], S[j].y + DY[j]); if (!bb || Math.hypot(DX[j], DY[j]) > 2) break; hit.set(bb, (hit.get(bb) || 0) + SAMPLE_M); j++ }
    const len = (j - i) * SAMPLE_M; if (len >= 12) through.push({ edge: e.id, line: e.line, sFrom: S[i].s, sTo: S[j - 1].s, kind: S[i].bridge ? 'bridge' : S[i].tunnel ? 'tunnel' : 'surface', from: toLL([S[i].x, S[i].y]).map(v => +v.toFixed(6)), to: toLL([S[j - 1].x, S[j - 1].y]).map(v => +v.toFixed(6)), lengthM: len,
      buildings: [...hit].map(([b, m]) => ({ id: b.id, tile: b.tile, feature: b.idx, ring: b.ri, heightM: b.h, lengthM: m, center: toLL([(b.box[0] + b.box[2]) / 2, (b.box[1] + b.box[3]) / 2]).map(v => +v.toFixed(6)), bbox: [...toLL([b.box[0], b.box[1]]), ...toLL([b.box[2], b.box[3]])].map(v => +v.toFixed(6)) })) });
    i = Math.max(j, i + 1);
  }
  if (moved < 2) continue;
  // the moved path: the samples moved, the ends exact, simplified (Douglas–Peucker 0.3 m)
  const P = S.map((q, i) => [q.x + DX[i], q.y + DY[i]]); P[0] = [S[0].x, S[0].y]; P[n - 1] = [S[n - 1].x, S[n - 1].y];
  const keep = new Array(n).fill(false); keep[0] = keep[n - 1] = true; const stack = [[0, n - 1]];
  while (stack.length) { const [a, b] = stack.pop(); let far = 0, idx = -1; for (let k = a + 1; k < b; k++) { const d = segDist(P[k], P[a], P[b]); if (d > far) { far = d; idx = k } } if (far > .3) { keep[idx] = true; stack.push([a, idx], [idx, b]) } }
  result[e.id] = P.filter((p, i) => keep[i]).map(p => toLL(p).map(v => +v.toFixed(6)));
  report.push({ edge: e.id, movedM: +moved.toFixed(1), points: result[e.id].length, runs: notes.filter(x => x.ok), rejected: notes.filter(x => !x.ok) });
}
// ── the rail height at each stretch, exactly as the runtime lifts the deck there: the stations' levels (transfer platforms
// overlapping in plan take different levels) and the ramps between, computed with the same code on the same station rectangles
function runtimeViaduct() {
  const stops = TS.stops || {}, dirs = TS.stopDirs || {}, halfs = TS.stopHalf || {}, phalf = TS.platformHalf || {}, rects = new Map(), M = 111320;
  for (const st of stations) for (const { name: line } of st.lines) {
    const k = `${line}:${st.id}`, c = stops[k] || [st.lon, st.lat], kx = Math.cos(c[1] * Math.PI / 180), h = halfs[k] || 90; let d = dirs[k];
    if (!d) { const e = Object.keys(shapes).find(x => x.startsWith(line + ':') && x.split(':').slice(1).includes(String(st.id))); if (!e) continue; const P = shapes[e], a = P[0], b = P[P.length - 1], dx = (b[0] - a[0]) * kx * M, dy = (b[1] - a[1]) * M, l = Math.hypot(dx, dy) || 1; d = [dx / l, dy / l] }
    const toLL = (x, y) => [c[0] + x / (kx * M), c[1] + y / M], ph = phalf[k];
    rects.set(k, { coords: [toLL(-d[0] * h, -d[1] * h), toLL(d[0] * h, d[1] * h)], offset: 0, plat: ph ? Math.min(1, ph / h) : 1 });
  }
  const merc = ([lon, lat]) => ({ x: lon / 360 + .5, y: .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI) }), gcache = new Map();
  const geom = (line, lo, hi) => { const id = `${line}:${lo}:${hi}`; let g = gcache.get(id); if (g) return g; const c = result[id] || (shapes[id] ? chaikin(shapes[id].map(q => q.slice())) : null) || [stops[`${line}:${lo}`] || [byId.get(lo).lon, byId.get(lo).lat], stops[`${line}:${hi}`] || [byId.get(hi).lon, byId.get(hi).lat]]; g = { pts: c.map(merc) }; gcache.set(id, g); return g };
  return new CityViaduct({ pack, net: { paths, byId, colors: {}, geom, offset: () => 0, rects, exits: {}, bodyPx: () => 13 } });
}
const viaduct = runtimeViaduct(), heightsAt = (edgeId, sFrom, sTo, total) => { const [line, lo, hi] = edgeId.split(':'); const H = []; for (let i = 0; i <= 4; i++) H.push(viaduct.heightAt(line, +lo, +hi, Math.max(0, Math.min(1, (sFrom + (sTo - sFrom) * i / 4) / total)))); return H };
for (const t of through) { const e = edges.find(x => x.id === t.edge), H = heightsAt(t.edge, t.sFrom, t.sTo, e.total); t.railM = +H[2].toFixed(2); t.railMRange = [+Math.min(...H).toFixed(2), +Math.max(...H).toFixed(2)]; t.deckBottomM = +(Math.min(...H) - pack.viaduct.deckThicknessM).toFixed(2); const [, lo, hi] = t.edge.split(':'); t.stations = `${nameOf(lo)}–${nameOf(hi)}`; t.levels = [viaduct.levelOf(t.line, +lo), viaduct.levelOf(t.line, +hi)]; delete t.sFrom; delete t.sTo }
through.sort((a, b) => b.lengthM - a.lengthM);
const OUT = path.join(ROOT, 'web', 'lib', 'city_viaduct_snap.mjs');
writeFileSync(OUT, '// 심시티 고가: real-tunnel stretches of the track moved onto the street they run under, as the simcity mode draws and drives\n// them (CityViaduct.snapped) — the whole edge, lo → hi, replacing track_shapes.json\'s smoothed path there. Generated by\n// pipeline/build_viaduct_snap.mjs from the OpenFreeMap z14 tiles (© OpenMapTiles © OpenStreetMap contributors); do not edit by hand.\n' + `export default ${JSON.stringify(result)};\n`);
writeFileSync(path.join(REPORT, 'snap-report.json'), JSON.stringify({ edges: edges.length, moved: Object.keys(result).length, report }, null, 1));
const levelsUp = viaduct.debugLevels().map(([k, L]) => ({ key: k, station: nameOf(k.slice(k.lastIndexOf(':') + 1)), level: L, railM: +viaduct.stationH(k.slice(0, k.lastIndexOf(':')), +k.slice(k.lastIndexOf(':') + 1)).toFixed(2) }));
writeFileSync(path.join(REPORT, 'through-buildings.json'), JSON.stringify({
  note: '심시티 고가가 (도로 스냅 후에도) 건물을 지나는 구간 — 따라갈 도로가 없어 옮기지 않은 곳; city-build가 이 건물들을 통과(역) 건물로 바꾼다. 좌표 lon,lat. kind: tunnel = 실제 지하(OSM tunnel), bridge = 실제 고가(OSM 선형과 건물 폴리곤 불일치), surface = 지상. railM: 그 구간 한가운데의 레일(상판 윗면) 높이 m — 노선별 기본 11 m + 환승역 층 분리(18/25 m…)와 그 앞뒤 경사 반영, 런타임(CityViaduct.heightAt)과 같은 계산; railMRange: 구간 양끝까지의 범위; deckBottomM: 상판 아랫면; levels: 이 구간 양쪽 역의 층. buildings: OFM z14 building 레이어의 폴리곤 (tile z/x/y, feature index, ring index, id when the tile has one, centre, bbox, render_height). 생성: pipeline/build_viaduct_snap.mjs',
  generated: new Date().toISOString(), summary: { stretches: through.length, totalM: through.reduce((t, x) => t + x.lengthM, 0), byKind: { tunnel: through.filter(x => x.kind === 'tunnel').length, bridge: through.filter(x => x.kind === 'bridge').length, surface: through.filter(x => x.kind === 'surface').length }, over40m: through.filter(x => x.lengthM >= 40).length, raisedStations: levelsUp.length },
  raisedStations: levelsUp, stretches: through }, null, 1));
const km = report.reduce((t, r) => t + r.runs.reduce((a, x) => a + x.len, 0), 0) / 1000;
console.log(`moved ${Object.keys(result).length} edges (${km.toFixed(1)} km of track), ${through.length} stretches still through buildings → ${path.relative(ROOT, OUT)} (${JSON.stringify(result).length} bytes), ${REPORT}`);
