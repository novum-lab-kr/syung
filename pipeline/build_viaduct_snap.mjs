#!/usr/bin/env node
// 심시티 고가: where a line really runs in a tunnel under a street but OSM's (coarse) track shape cuts across a block, move the
// viaduct's path onto that street's centre line — only in the simcity mode (the runtime reads web/lib/city_viaduct_snap.mjs
// through CityViaduct.snapped). Also lists the stretches that still pass through buildings (no street to follow) for the
// city builders: scratchpad …/city/life/through-buildings.json.
//
//   node pipeline/build_viaduct_snap.mjs [--report DIR] [--only 9호선] [--cache DIR]
// 부분 갱신: --edges 키목록.json --tilejson 캐시.json --offline [--output 검증파일.mjs]
//
// Roads and buildings come from the OpenFreeMap z14 tiles the app itself draws (so the deck lands exactly on the drawn
// street); tunnel/bridge from the cached OSM line-*.json (as build_viaduct_flags.py reads them). Rules (pack.viaduct.snap):
//  · only real-tunnel stretches (OSM tunnel=*, 또는 tunnel 태그 없는 지하 역 구간 layer ≤ -2 · level < 0; 그 노선 OSM 선로가 60 m
//    안에 없는 거친 곳은 앞뒤가 모두 지하일 때만), never real bridges — 지상 철길은 옮기지 않는다
//  · a street counts when it runs the track's way (within 30°) and is near: within nearM (45 m) always — the track most likely
//    is under it; up to maxOffsetM (150 m) when crossBlocks (2026-10-05 행님: 블록을 가로지르는 지하 구간도 도로로), else only
//    over a short run (farRunM). 선분 끝 너머로 내린 점은 쓰지 않는다(모퉁이로 몰림 · 되돌아감)
//  · 역: 승강장과 섞는 구간(platformHalf + blendM)까지 모두 지하인 역은 역 점을 stationM 안 같은 방향 도로 중심선에 내린다
//    (export stops — stops · stop_overrides 원본은 그대로; keepStations 는 옮기지 않음). 도로가 승강장 길이만큼 곧고(볼록
//    straightM 안) 승강장 끝 둘레 선로가 도로 방향에서 endTurnDeg 안이면 그 방향으로 곧은 승강장, 아니면 원래 선로 모양 그대로
//    역 점까지 평행 이동. 옮기지 않은 역(지상 · 고가 · 도로 없음)은 승강장 길이만큼 원래 선로 그대로
//  · 승강장(platformHalf + 5 m)은 고정, 그 밖은 도로 맞춤 경로로: 고정 구간을 늘인 값에서 smoothstep 으로 섞고(blendM 이상,
//    기울기 slopeMax 안), 고정 구간 · 지상 · 도로 없는 곳과 도로 사이도 기울기 slopeMax 안에서 옮겨 간다. 남은 꺾임(35° 초과)은
//    그 둘레만 더 부드럽게 한다. 옮김이 어디서나 2 m 미만이고 양 끝 역도 그대로면 버린다
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodeTile } from '../web/lib/city_mvt.mjs';
import { CityViaduct } from '../web/lib/city_viaduct.mjs';
import ORIGINAL_SNAP, { stops as ORIGINAL_STOPS } from '../web/lib/city_viaduct_snap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), CACHE = path.join(ROOT, 'data', 'osm-tracks');
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null };
const REPORT = opt('--report') || path.join(ROOT, 'scratchpad-snap-report'), ONLY = opt('--only'), TILES = opt('--cache') || path.join(REPORT, 'tiles14');
const selectedFile = opt('--edges'), selected = selectedFile ? new Set(JSON.parse(readFileSync(selectedFile, 'utf8'))) : null;
const tileJSONFile = opt('--tilejson'), offline = args.includes('--offline');
if (offline && !tileJSONFile) throw new Error('--offline에서는 --tilejson 캐시 파일이 필요해요.');
mkdirSync(REPORT, { recursive: true }); mkdirSync(TILES, { recursive: true });
const pack = (await import('../web/lib/city_style_seoul.mjs')).default, SN = pack.viaduct.snap, NEAR_M = SN.nearM ?? 60, FAR_M = SN.maxOffsetM ?? 150, HOLD_M = SN.holdM ?? 40;
const DEV_MAX_M = SN.devMaxM ?? Infinity, SLOPE_MAX = SN.slopeMax ?? 0.3, CROSS_BLOCKS = SN.crossBlocks ?? false, STATION_M = SN.stationM ?? NEAR_M, BLEND_M = SN.blendM ?? 60, STRAIGHT_M = SN.straightM ?? 4, END_TURN = Math.cos((SN.endTurnDeg ?? 35) * Math.PI / 180), KEEP_STATIONS = new Set(SN.keepStations || []);
const TRACE_TURN = (SN.traceTurnDeg ?? 2.5) * Math.PI / 180;
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
if (selected) for (const id of selected) if (!shapes[id]) throw new Error(`알 수 없는 구간: ${id}`);
const html = readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8'), block = id => JSON.parse(html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`))[1]);
const stations = block('stationData'), paths = block('linePaths'), byId = new Map(stations.map(q => [q.id, q])), nameOf = id => byId.get(+id)?.name ?? String(id);
const edges = Object.entries(shapes).filter(([k]) => (!ONLY || k.startsWith(ONLY + ':')) && (!selected || selected.has(k))).map(([id, coords]) => {
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
  if (wayGrids.has(line)) return wayGrids.get(line); const f = path.join(CACHE, `line-${line}.json`), out = { tunnel: new Grid(), bridge: new Grid(), other: new Grid() };
  if (!existsSync(f) && (selected || offline)) throw new Error(`OSM 캐시가 없어요: ${f}`);
  if (existsSync(f)) { const d = JSON.parse(readFileSync(f, 'utf8')), nodes = new Map(); for (const e of d.elements) if (e.type === 'node') nodes.set(e.id, toM([e.lon, e.lat]));
    for (const w of d.elements) { if (w.type !== 'way') continue; const t = w.tags || {}, kind = t.tunnel && t.tunnel !== 'no' ? 'tunnel' : t.bridge && t.bridge !== 'no' ? 'bridge' : t.tunnel !== 'no' && (+t.layer <= -2 || +t.level < 0) ? 'tunnel' : 'other';   // tunnel 태그 없는 지하 역 구간(layer ≤ -2 · level < 0)도 지하
      const ids = w.nodes.filter(i => nodes.has(i)); for (let i = 1; i < ids.length; i++) { const A = nodes.get(ids[i - 1]), B = nodes.get(ids[i]); const x0 = Math.min(A[0], B[0]), x1 = Math.max(A[0], B[0]), y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]); for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++) for (let gy = Math.floor(y0 / GRID); gy <= Math.floor(y1 / GRID); gy++) out[kind].add(`${gx},${gy}`, [A, B]) } } }
  wayGrids.set(line, out); return out;
}
const segDist = (p, A, B) => { const ex = B[0] - A[0], ey = B[1] - A[1], l2 = ex * ex + ey * ey || 1, u = Math.max(0, Math.min(1, ((p[0] - A[0]) * ex + (p[1] - A[1]) * ey) / l2)); return Math.hypot(A[0] + ex * u - p[0], A[1] + ey * u - p[1]) };
const nearWay = (g, p) => g.near(p[0], p[1]).some(([A, B]) => segDist(p, A, B) <= NEAR_WAY_M);
for (const e of edges) { const W = waysOf(e.line); for (const q of e.S) { q.tunnel = nearWay(W.tunnel, [q.x, q.y]); q.bridge = nearWay(W.bridge, [q.x, q.y]); q.mapped = q.tunnel || q.bridge || nearWay(W.other, [q.x, q.y]) }
  // 그 노선 OSM 선로가 60 m 안에 없는 표본(선로 모양이 거친 곳): 앞뒤 가장 가까운 표본이 모두 지하면 지하
  { const S = e.S; for (let i = 0; i < S.length;) { if (S[i].mapped) { i++; continue } let j = i; while (j < S.length && !S[j].mapped) j++; const a = S[i - 1], b = S[j]; if ((a || b) && (!a || a.tunnel && !a.bridge) && (!b || b.tunnel && !b.bridge)) for (let k = i; k < j; k++) S[k].tunnel = true; i = Math.max(j, i + 1) } }
  const S = e.S; for (let i = 0; i < S.length;) { if (S[i].tunnel) { i++; continue } let j = i; while (j < S.length && !S[j].tunnel) j++; if (i > 0 && j < S.length && (j - i) * SAMPLE_M <= 150) for (let k = i; k < j; k++) if (!S[k].bridge) S[k].tunnel = true; i = Math.max(j, i + 1) } }   // a short gap in the tunnel ways (the station box, a mapping gap) is still the tunnel

// ── the tiles: roads and buildings near the track ──
const sampleGrid = new Grid(); for (const e of edges) for (const q of e.S) sampleGrid.add(key(q.x, q.y), q);
const nearTrack = (x, y, r) => sampleGrid.near(x, y, r).some(q => Math.hypot(q.x - x, q.y - y) <= r);
const boxNearTrack = (b, pad) => { const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad; for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++) for (let gy = Math.floor(y0 / GRID); gy <= Math.floor(y1 / GRID); gy++) for (const q of sampleGrid.m.get(`${gx},${gy}`) || []) if (q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1) return true; return false };
const need = new Set();
for (const e of edges) for (const q of e.S) { const [lon, lat] = toLL([q.x, q.y]); for (const [dx, dy] of [[0, 0], [FAR_M, 0], [-FAR_M, 0], [0, FAR_M], [0, -FAR_M]]) { const [tx, ty] = tileOf(...toLL([q.x + dx, q.y + dy])); need.add(`${tx},${ty}`) } }
// 캐시 옵션이 없을 때는 기존 온라인 동작을 유지한다.
const tj = tileJSONFile ? JSON.parse(readFileSync(tileJSONFile, 'utf8')) : await (await fetch('https://tiles.openfreemap.org/planet')).json(), tpl = tj.tiles[0];
console.log(`tiles needed ${need.size} (${tpl})`);
async function tile(x, y) {
  const f = path.join(TILES, `14-${x}-${y}.pbf`); if (existsSync(f)) return readFileSync(f);
  if (offline) throw new Error(`지도 타일 캐시가 없어요: ${f}`);
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
// 1) 구간마다: 표본별 같은 방향 도로를 고르고, 받아들인 연속 구간의 이동(D)을 부드럽게 한다(역 묶음 없이).
const COS30 = Math.cos(30 * Math.PI / 180), result = {}, report = [], through = [];
const roadAt = (x, y, tx, ty, maxD, prev, px0, py0) => {   // (x,y)에서 (tx,ty) 방향 30° 안의 도로 중심선 위 가장 좋은 점
  let best = null;
  for (const seg of roadGrid.near(x, y, Math.max(GRID, maxD))) {
    const cos = Math.abs(seg.ux * tx + seg.uy * ty); if (cos < COS30 || seg.ramp) continue;
    const ex = seg.B[0] - seg.A[0], ey = seg.B[1] - seg.A[1], l2 = ex * ex + ey * ey || 1, u0 = ((x - seg.A[0]) * ex + (y - seg.A[1]) * ey) / l2, u = Math.max(0, Math.min(1, u0)), px = seg.A[0] + ex * u, py = seg.A[1] + ey * u, d = Math.hypot(px - x, py - y);
    if (d > maxD || Math.abs(u0 - u) * seg.len > 1) continue;   // 선분 끝 너머로 내린 점(모퉁이로 몰림 · 되돌아감)은 쓰지 않는다
    let cost = d + 50 * (1 - cos) + CLASSES[seg.cls];
    if (prev) cost += 1.5 * Math.hypot(px - px0, py - py0);   // carry the last move forward: no hopping between streets
    if (!best || cost < best.cost) best = { px, py, d, cost, cls: seg.cls, ux: seg.ux, uy: seg.uy };
  }
  return best;
};
for (const e of edges) {
  const S = e.S, n = S.length; e.DX = new Array(n).fill(0); e.DY = new Array(n).fill(0); e.notes = []; if (n < 4) continue;
  const Q = new Array(n).fill(null); let prev = null;
  for (let i = 0; i < n; i++) {
    const q = S[i]; if (!q.tunnel || q.bridge) { prev = null; continue }
    const best = roadAt(q.x, q.y, q.tx, q.ty, FAR_M, prev, prev ? prev.px + (q.x - S[i - 1].x) : 0, prev ? prev.py + (q.y - S[i - 1].y) : 0);
    Q[i] = best; prev = best;
  }
  // runs of moved samples: 60 m 이상이고 모든 이동이 maxOffsetM 안이면 받아들인다(블록을 가로지르는 지하 구간도 도로로)
  const D = new Array(n).fill(null);
  for (let i = 0; i < n;) {
    if (!Q[i]) { i++; continue } let j = i; while (j < n && Q[j]) j++;
    const len = S[j - 1].s - S[i].s; let before = 0, after = 0, maxD = 0, allNear = true, big = true;
    for (let k = i; k < j; k++) { if (inBuilding(S[k].x, S[k].y)) before += SAMPLE_M; if (inBuilding(Q[k].px, Q[k].py)) after += SAMPLE_M; maxD = Math.max(maxD, Q[k].d); if (Q[k].d > NEAR_M) allNear = false; if (!BIG.has(Q[k].cls)) big = false }
    const ok = len >= MIN_RUN_M && (allNear || CROSS_BLOCKS || (big && len <= FAR_RUN_M && before > 15 && after < before * .5));
    if (ok) for (let k = i; k < j; k++) D[k] = [Q[k].px - S[k].x, Q[k].py - S[k].y];
    e.notes.push({ s0: +S[i].s.toFixed(0), s1: +S[j - 1].s.toFixed(0), len: +len.toFixed(0), maxD: +maxD.toFixed(1), before, after, allNear, ok });
    i = j;
  }
  // 짧은 틈(150 m 이하, 지하)은 양쪽 이동 사이를 잇는다: 교차로 등에서 같은 방향 도로가 잠깐 끊긴 곳
  for (let i = 0; i < n;) { if (D[i]) { i++; continue } let j = i; while (j < n && !D[j]) j++;
    if (i > 0 && j < n && S[j].s - S[i - 1].s <= 150 && S.slice(i, j).every(q => q.tunnel && !q.bridge)) for (let k = i; k < j; k++) { const f = (S[k].s - S[i - 1].s) / (S[j].s - S[i - 1].s); D[k] = [D[i - 1][0] + (D[j][0] - D[i - 1][0]) * f, D[i - 1][1] + (D[j][1] - D[i - 1][1]) * f] }
    i = Math.max(j, i + 1) }
  e.D = D;
}
// 2) 역: 지하 역 점을 도로 중심선에 내린다(stationM 안, 같은 방향 도로). 승강장 길이(platformHalf)만큼 도로가 곧으면
//    그 방향으로 곧은 승강장, 아니면 도로를 따라 휜다. 부분 갱신은 기존 역 점을 그대로 쓴다(이웃 구간과 끝이 어긋나지 않게).
const PH = TS.platformHalf || {}, halfOf = k => PH[k] || 90, stationPts = new Map(), stationNotes = [];
const ends = new Map(); for (const e of edges) { const i = e.id.lastIndexOf(':'), j = e.id.lastIndexOf(':', i - 1); e.lo = `${e.line}:${e.id.slice(j + 1, i)}`; e.hi = `${e.line}:${e.id.slice(i + 1)}`; for (const [k, at] of [[e.lo, 0], [e.hi, 1]]) { if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ e, at }) } }
const pointAlong = (e, at, d) => { d = Math.max(0, Math.min(e.total, at ? e.total - d : d)); let i = 1; while (i < e.pts.length - 1 && e.cum[i] < d) i++; const u = (d - e.cum[i - 1]) / ((e.cum[i] - e.cum[i - 1]) || 1); return [e.pts[i - 1][0] + (e.pts[i][0] - e.pts[i - 1][0]) * u, e.pts[i - 1][1] + (e.pts[i][1] - e.pts[i - 1][1]) * u] };
if (selected || ONLY) { for (const [k, v] of Object.entries(ORIGINAL_STOPS)) { const p = toM(v); stationPts.set(k, { p, u: v.length > 2 ? [v[2], v[3]] : null, kept: true, orig: v }) } }
else for (const [k, inc] of ends) {
  const O = inc[0].at ? inc[0].e.pts[inc[0].e.pts.length - 1] : inc[0].e.pts[0], h = halfOf(k), Z = h + BLEND_M, note = { key: k, station: nameOf(k.slice(k.lastIndexOf(':') + 1)) };
  stationNotes.push(note);
  // 승강장과 섞는 구간까지 모두 OSM 터널이어야 옮긴다(지상 · 고가 선로는 그대로)
  const under = inc.every(({ e, at }) => e.S.every(q => (at ? e.total - q.s : q.s) > Z || (q.tunnel && !q.bridge)));
  if (!under) { note.kept = '지상 또는 고가 선로(OSM 터널 아님)'; continue }
  if (KEEP_STATIONS.has(k)) { note.kept = '옮기지 않기로 한 역(keepStations)'; continue }
  // 역에서 선로 방향: 이웃 구간 위 점들(10 m ~ 승강장 끝, 짧은 승강장도 60 m 까지)의 주축
  let sxx = 0, syy = 0, sxy = 0; for (const { e, at } of inc) for (let d = 10; d <= Math.min(Math.max(h, 60), e.total / 2); d += 10) { const [x, y] = pointAlong(e, at, d), dx = x - O[0], dy = y - O[1]; sxx += dx * dx; syy += dy * dy; sxy += dx * dy }
  const th = .5 * Math.atan2(2 * sxy, sxx - syy), tx = Math.cos(th), ty = Math.sin(th);
  // 원래 선로가 승강장(+5 m) 안에서 얼마나 휘는지: 역 점을 지나는 선로 주축에서 벗어난 최대 거리
  let trackDev = 0; for (const { e, at } of inc) for (let d = 5; d <= Math.min(h + 5, e.total / 2); d += 5) { const [x, y] = pointAlong(e, at, d); trackDev = Math.max(trackDev, Math.abs((x - O[0]) * ty - (y - O[1]) * tx)) }
  note.trackDevM = +trackDev.toFixed(1);
  const road = roadAt(O[0], O[1], tx, ty, STATION_M, null);
  if (!road) { note.kept = `${STATION_M} m 안에 같은 방향 도로 없음`; continue }
  let P = [road.px, road.py];
  // 도로가 곧은지: 승강장 길이(+10 m) 동안 6 m 간격으로 도로 중심선 점을 찾아(12 m 안, 같은 방향) 직선과 2차 곡선을 맞춘다.
  // 볼록한 정도(sagitta)가 straightM 안이면 곧은 도로 — 왕복 분리 차로처럼 중심선이 몇 m 들쭉날쭉한 것은 곧은 것으로 본다.
  let ux = road.ux, uy = road.uy; if (ux * tx + uy * ty < 0) { ux = -ux; uy = -uy }
  let fit = null;
  for (let pass = 0; pass < 3; pass++) {
    const pts = []; let tried = 0, sides = [0, 0, 0, 0];
    for (let t = -(h + 10); t <= h + 10; t += 6) { tried++; sides[t < 0 ? 0 : 1]++; const q = roadAt(P[0] + ux * t, P[1] + uy * t, ux, uy, 12, null); if (q) { sides[t < 0 ? 2 : 3]++; const dx = q.px - P[0], dy = q.py - P[1]; pts.push([dx * ux + dy * uy, -dx * uy + dy * ux]) } }
    const sideCover = Math.min(sides[2] / (sides[0] || 1), sides[3] / (sides[1] || 1));
    if (pts.length < 4) { fit = { cover: pts.length / tried, sideCover }; break }
    // 최소제곱: r = a + b t (직선), r = c0 + c1 t + c2 t² (곡선)
    const N = pts.length, st1 = pts.reduce((z, [t]) => z + t, 0), sr = pts.reduce((z, [, r]) => z + r, 0), stt = pts.reduce((z, [t]) => z + t * t, 0), str = pts.reduce((z, [t, r]) => z + t * r, 0);
    const b = (N * str - st1 * sr) / ((N * stt - st1 * st1) || 1), a = (sr - b * st1) / N;
    const solve3 = (A, B) => { const M = A.map((row, i) => [...row, B[i]]); for (let c = 0; c < 3; c++) { let piv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r; [M[c], M[piv]] = [M[piv], M[c]]; for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / (M[c][c] || 1e-12); for (let k2 = c; k2 < 4; k2++) M[r][k2] -= f * M[c][k2] } } return M.map((row, i) => row[3] / (row[i] || 1e-12)) };
    const S4 = [0, 1, 2, 3, 4].map(k2 => pts.reduce((z, [t]) => z + t ** k2, 0)), R3 = [0, 1, 2].map(k2 => pts.reduce((z, [t, r]) => z + r * t ** k2, 0));
    const c2 = solve3([[S4[0], S4[1], S4[2]], [S4[1], S4[2], S4[3]], [S4[2], S4[3], S4[4]]], R3)[2];
    fit = { cover: N / tried, sideCover, sag: Math.abs(c2) * h * h, jitter: Math.max(...pts.map(([t, r]) => Math.abs(r - a - b * t))), a, b };
    // 맞춘 직선으로 방향 · 기준점을 다시 잡는다
    const l = Math.hypot(1, b), nux = (ux - uy * b) / l, nuy = (uy + ux * b) / l; P = [P[0] - uy * a, P[1] + ux * a]; ux = nux; uy = nuy;
  }
  // 승강장 끝 둘레(끝 20 m 앞 ~ 15 m 뒤)의 원래 선로 방향이 도로 방향에서 endTurnDeg 넘게 벗어나면(승강장 길이 안에서 선로가 꺾임) 곧게 하지 않는다
  const endTurn = inc.some(({ e, at }) => { const d1 = Math.min(h + 15, e.total / 2), d0 = Math.max(0, d1 - 35), a = pointAlong(e, at, d0), b = pointAlong(e, at, d1), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return Math.abs(((b[0] - a[0]) * ux + (b[1] - a[1]) * uy) / l) < END_TURN });
  let straight = !endTurn && fit.cover >= .55 && fit.sideCover >= .4 && fit.sag <= STRAIGHT_M && fit.jitter <= 10 && Math.abs(ux * tx + uy * ty) >= COS30;   // 맞춘 직선도 선로 방향 30° 안
  if (straight) { const dx = O[0] - P[0], dy = O[1] - P[1], t = dx * ux + dy * uy; P = [P[0] + ux * t, P[1] + uy * t]; if (Math.hypot(P[0] - O[0], P[1] - O[1]) > STATION_M) straight = false }   // 역 점: 원래 역 점을 도로 중심선(맞춘 직선)에 내린 점
  else P = [road.px, road.py];
  note.movedM = +Math.hypot(P[0] - O[0], P[1] - O[1]).toFixed(1); note.cover = +fit.cover.toFixed(2); if (fit.sag != null) { note.sagM = +fit.sag.toFixed(1); note.jitterM = +fit.jitter.toFixed(1) }
  if (!straight) note.curved = endTurn ? `선로가 승강장 끝에서 도로와 다른 쪽으로 꺾임` : fit.cover < .55 || fit.sideCover < .4 ? `도로가 승강장 길이만큼 이어지지 않음(${Math.round(fit.cover * 100)}%)` : fit.sag > STRAIGHT_M ? `도로가 휨(볼록 ${fit.sag.toFixed(1)} m)` : fit.jitter > 10 ? `도로 중심선이 크게 들쭉날쭉(${fit.jitter.toFixed(1)} m)` : '맞춘 도로 직선이 선로 방향 · 역 점에서 벗어남';
  // 곧지 않은 도로(2026-10-05 행님: 승강장은 전 역 도로 기준): 역 점에서 앞뒤로 도로 중심선을 6 m 씩 따라간 선(도로가 끊기면 그 방향으로 곧게)
  let trace = null;
  if (!straight) { let vx = road.ux, vy = road.uy; if (vx * tx + vy * ty < 0) { vx = -vx; vy = -vy } trace = { u: [vx, vy], plus: traceRoad(P, [vx, vy], h + 400), minus: traceRoad(P, [-vx, -vy], h + 400) } }
  stationPts.set(k, { p: P, u: straight ? [ux, uy] : null, trace });
}
// 200 m(LOOP_W 표본) 창 안의 방향 누적 회전: 그려질 경로가 원래 선로보다 40° 넘게 더 돌면 그 창의 시작 표본, 없으면 -1
const LOOP_W = Math.round(200 / SAMPLE_M);
function loopAt(T, S) {
  const turns = P => { const H = []; for (let i = 1; i < P.length; i++) H.push(Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0])); const C = [0, 0]; for (let i = 1; i < H.length; i++) { let d = H[i] - H[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; C.push(C.at(-1) + d) } return C };
  const a = turns(T), b = turns(S.map(q => [q.x, q.y]));
  for (let i = 0; i + LOOP_W < a.length; i++) if ((Math.abs(a[i + LOOP_W] - a[i]) - Math.abs(b[i + LOOP_W] - b[i])) * 180 / Math.PI > 40) return i;
  return -1;
}
// 도로 중심선 따라가기: 6 m 앞 점을 같은 방향(30°) 도로 8 m 안에 내리고, 없으면 곧게. 한 걸음에 traceTurnDeg 까지만 돈다. 3점 평균 두 번(끝점 고정)
function traceRoad(P, u, len) {
  const pts = [P.slice()]; let dir = u.slice();
  for (let t = 0; t < len; t += SAMPLE_M) { const c = pts.at(-1), probe = [c[0] + dir[0] * SAMPLE_M, c[1] + dir[1] * SAMPLE_M], q = roadAt(probe[0], probe[1], dir[0], dir[1], 8, null);
    const nx = q ? [q.px, q.py] : probe, dx = nx[0] - c[0], dy = nx[1] - c[1], l = Math.hypot(dx, dy);
    if (l < 1 || dx * dir[0] + dy * dir[1] < .5 * l) { pts.push(probe); continue }   // 뒤로 가거나 제자리면 곧게
    // 한 걸음에 TRACE_TURN 넘게 돌지 않는다(교차로에서 옆 길로 꺾여 들어가지 않게): 넘으면 그만큼만 돌린 방향으로 한 걸음
    let ang = Math.atan2(dir[0] * dy - dir[1] * dx, dir[0] * dx + dir[1] * dy); ang = Math.max(-TRACE_TURN, Math.min(TRACE_TURN, ang)); const ca = Math.cos(ang), sa = Math.sin(ang);
    dir = [dir[0] * ca - dir[1] * sa, dir[0] * sa + dir[1] * ca]; pts.push([c[0] + dir[0] * SAMPLE_M, c[1] + dir[1] * SAMPLE_M]) }
  for (let pass = 0; pass < 2; pass++) { const c = pts.map(p => p.slice()); for (let i = 1; i < pts.length - 1; i++) pts[i] = [(c[i - 1][0] + c[i][0] + c[i + 1][0]) / 3, (c[i - 1][1] + c[i][1] + c[i + 1][1]) / 3] }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum };
}
const traceAt = (tr, d) => { const { pts, cum } = tr; if (d >= cum.at(-1)) { const a = pts.at(-2), b = pts.at(-1), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, x = d - cum.at(-1); return [b[0] + (b[0] - a[0]) / l * x, b[1] + (b[1] - a[1]) / l * x] } let i = 1; while (cum[i] < d) i++; const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f] };
// 3) 구간 경로: 역 쪽 끝(승강장 길이 + 5 m)은 고정 — 옮긴 역은 곧은 승강장(또는 도로를 따라 휜 승강장), 옮기지 않은 역은
//    원래 선로. 가운데는 도로 맞춤. 고정 구간 · 지상 · 도로 없는 곳에서 도로까지는 기울기 slopeMax 안에서 비스듬히 옮겨 가고
//    (이동 거리에 비례한 길이로 섞여 급한 꺾임이 없게), 고정 구간 밖만 부드럽게 한다.
function pass3() {
  for (const k of Object.keys(result)) delete result[k]; report.length = 0; through.length = 0; const bad = new Map();
for (const e of edges) {
  const S = e.S, n = S.length, sts = [e.lo, e.hi].map(k => stationPts.get(k));
  if (n < 4 && !sts[0] && !sts[1]) continue;
  const compose = D => {
    const F = S.map((q, i) => D?.[i] ? D[i].slice() : null), fixed = new Array(n).fill(false), cap = e.total / 2 - 3, zones = [];
    for (const at of [0, 1]) {
      const st = sts[at], k = at ? e.hi : e.lo, dist = i => at ? e.total - S[i].s : S[i].s, end = at ? n - 1 : 0;
      const h = Math.min(halfOf(k) + 5, cap);
      const sg = st?.u ? (() => { const away = pointAlong(e, at, Math.min(h, e.total / 2)); return (away[0] - S[end].x) * st.u[0] + (away[1] - S[end].y) * st.u[1] < 0 ? -1 : 1 })() : 1;   // 원래 선로가 역에서 나가는 쪽
      const shift = st && !st.u && !st.trace ? [st.p[0] - S[end].x, st.p[1] - S[end].y] : null;
      // 휜 도로 역: 원래 선로가 나가는 쪽의 도로 중심선 선
      const tr = st?.trace ? (() => { const away = pointAlong(e, at, Math.min(h, e.total / 2)); return (away[0] - S[end].x) * st.trace.u[0] + (away[1] - S[end].y) * st.trace.u[1] < 0 ? st.trace.minus : st.trace.plus })() : null;
      const zoneF = i => { if (!st) return [0, 0]; if (st.u) return [st.p[0] + sg * st.u[0] * dist(i) - S[i].x, st.p[1] + sg * st.u[1] * dist(i) - S[i].y]; if (tr) { const q = traceAt(tr, dist(i)); return [q[0] - S[i].x, q[1] - S[i].y] } return shift };
      zones.push({ at, h, dist, zoneF });
      for (let i = 0; i < n; i++) { const d = dist(i); if (d > h && i !== end) continue; fixed[i] = true;
        F[i] = zoneF(i).slice() }   // 곧은 도로: 그 직선 · 휜 도로: 도로 중심선 선 · 옮기지 않은 역: 원래 선로
    }
    for (let i = 0; i < n; i++) if (!F[i] || !S[i].tunnel || S[i].bridge) { if (!fixed[i]) F[i] = [0, 0]; if (!F[i]) F[i] = [0, 0]; if (!fixed[i]) fixed[i] = 'zero' }
    // 기울기 제한: 고정 표본(값 A)에서 거리 dd 인 표본은 A 에서 slopeMax·dd 이상 벗어나지 않는다(앞 · 뒤 두 방향)
    for (const dir of [1, -1]) { let a = -1; for (let t = 0; t < n; t++) { const i = dir > 0 ? t : n - 1 - t; if (fixed[i]) { a = i; continue } if (a < 0) continue;
      const A = F[a], dx = F[i][0] - A[0], dy = F[i][1] - A[1], l = Math.hypot(dx, dy), lim = SLOPE_MAX * Math.abs(S[i].s - S[a].s); if (l > lim) F[i] = [A[0] + dx * lim / l, A[1] + dy * lim / l] } }
    // 고정 구간 밖만 부드럽게(고정 표본은 이웃 값으로만 쓰인다)
    const R = 4; for (let pass = 0; pass < 2; pass++) { const c = F.map(v => v.slice()); for (let i = 0; i < n; i++) { if (fixed[i]) continue; let sx = 0, sy = 0, m = 0; for (let k = -R; k <= R; k++) { const t = i + k; if (t < 0 || t >= n) continue; sx += c[t][0]; sy += c[t][1]; m++ } F[i] = [sx / m, sy / m] } }
    // 고정 구간 끝에서 도로 맞춤 경로로: 고정 구간을 그대로 늘인 값(곧은 승강장은 그 직선)에서 smoothstep 으로 섞는다.
    // 섞는 길이는 blendM 이상, 두 값의 차가 크면 기울기가 slopeMax 를 넘지 않게 늘린다(구간 반을 넘지 않게).
    for (const z of zones) {
      const idx = d => { let best = 0; for (let i = 0; i < n; i++) if (Math.abs(z.dist(i) - d) < Math.abs(z.dist(best) - d)) best = i; return best };
      const gapAt = d => { const i = idx(d), a = z.zoneF(i); return Math.hypot(F[i][0] - a[0], F[i][1] - a[1]) };
      let B = BLEND_M; for (let it = 0; it < 2; it++) B = Math.max(BLEND_M, 1.5 * gapAt(z.h + B) / SLOPE_MAX); B = Math.min(B, Math.max(SAMPLE_M, cap - z.h));
      for (let i = 0; i < n; i++) { const d = z.dist(i); if (d <= z.h || d >= z.h + B || fixed[i] === true) continue; const b = smooth01((d - z.h) / B), a = z.zoneF(i); F[i] = [a[0] * (1 - b) + F[i][0] * b, a[1] * (1 - b) + F[i][1] * b] }
    }
    let T = S.map((q, i) => [q.x + F[i][0], q.y + F[i][1]]);
    // 남은 꺾임(12 m 앞뒤 방향 차 35° 초과) · 되돌아감은 그 둘레만 더 부드럽게(고정 구간 제외), 없어질 때까지
    const turnAt = i => { const a = T[Math.max(0, i - 2)], b = T[i], c = T[Math.min(n - 1, i + 2)], ux1 = b[0] - a[0], uy1 = b[1] - a[1], ux2 = c[0] - b[0], uy2 = c[1] - b[1], l1 = Math.hypot(ux1, uy1), l2 = Math.hypot(ux2, uy2); if (l1 < 1e-6 || l2 < 1e-6) return 180; return Math.acos(Math.max(-1, Math.min(1, (ux1 * ux2 + uy1 * uy2) / (l1 * l2)))) * 180 / Math.PI };
    for (let round = 0; round < 40; round++) {
      const bad = []; for (let i = 2; i < n - 2; i++) if (turnAt(i) > 35) bad.push(i); if (!bad.length) break;
      const near = new Set(); for (const i of bad) for (let k = -8; k <= 8; k++) if (i + k >= 0 && i + k < n && !fixed[i + k]) near.add(i + k);
      if (!near.size) break; const c = F.map(v => v.slice());
      for (const i of near) { let sx = 0, sy = 0, m = 0; for (let k = -3; k <= 3; k++) { const t = i + k; if (t < 0 || t >= n) continue; sx += c[t][0]; sy += c[t][1]; m++ } F[i] = [sx / m, sy / m] }
      T = S.map((q, i) => [q.x + F[i][0], q.y + F[i][1]]);
    }
    return { T, F, fixed };
  };
  // 고리 · 되돌아감: 200 m 안에서 원래 선로보다 40° 넘게 더 도는 곳은 그 둘레 도로 맞춤을 빼고 다시(도로가 블록을 돌아 나가는 곳)
  let D = e.D ? e.D.slice() : null, T, F, fixed;
  for (let tries = 0; ; tries++) { ({ T, F, fixed } = compose(D));
    // 원래 선로에서 devMaxM 넘게 멀어진 표본: 도로 맞춤 때문이면 그 둘레 도로 맞춤을 빼고 다시(2026-10-05 행님 3단계)
    const far = F.findIndex(v => Math.hypot(v[0], v[1]) > DEV_MAX_M); if (far >= 0 && D && tries < 16 && D.slice(Math.max(0, far - 15), far + 16).some(Boolean)) { for (let k = Math.max(0, far - 15); k < Math.min(n, far + 16); k++) D[k] = null; e.devFixes = (e.devFixes || 0) + 1; continue }
    const w = loopAt(T, S); if (w < 0 || !D || tries >= 24) break; for (let k = Math.max(0, w - 10); k < Math.min(n, w + LOOP_W + 10); k++) D[k] = null; e.loopFixes = (e.loopFixes || 0) + 1 }
  // 그래도 멀어진 곳은 역 쪽(곧은 · 휜 승강장과 섞는 구간) 때문: 가까운 쪽 옮긴 역을 '노선 원복'으로 되돌린다
  for (let i = 0; i < n; i++) { const d = Math.hypot(F[i][0], F[i][1]); if (d <= DEV_MAX_M) continue; const at = S[i].s < e.total / 2 ? 0 : 1, k = at ? e.hi : e.lo, k2 = at ? e.lo : e.hi; if (sts[at]) bad.set(k, Math.max(bad.get(k) || 0, d)); else if (sts[1 - at]) bad.set(k2, Math.max(bad.get(k2) || 0, d)); else e.devLeft = Math.max(e.devLeft || 0, d) }
  let moved = 0; for (let i = 0; i < n; i++) moved = Math.max(moved, Math.hypot(T[i][0] - S[i].x, T[i][1] - S[i].y));
  // stretches still through buildings (not moved): for the city builders
  for (let i = 0; i < n;) {
    const off = k => Math.hypot(T[k][0] - S[k].x, T[k][1] - S[k].y), b = inBuilding(T[i][0], T[i][1]); if (!b || off(i) > 2) { i++; continue }
    let j = i; const hit = new Map(); while (j < n) { const bb = inBuilding(T[j][0], T[j][1]); if (!bb || off(j) > 2) break; hit.set(bb, (hit.get(bb) || 0) + SAMPLE_M); j++ }
    const len = (j - i) * SAMPLE_M; if (len >= 12) through.push({ edge: e.id, line: e.line, sFrom: S[i].s, sTo: S[j - 1].s, kind: S[i].bridge ? 'bridge' : S[i].tunnel ? 'tunnel' : 'surface', from: toLL([S[i].x, S[i].y]).map(v => +v.toFixed(6)), to: toLL([S[j - 1].x, S[j - 1].y]).map(v => +v.toFixed(6)), lengthM: len,
      buildings: [...hit].map(([b, m]) => ({ id: b.id, tile: b.tile, feature: b.idx, ring: b.ri, heightM: b.h, lengthM: m, center: toLL([(b.box[0] + b.box[2]) / 2, (b.box[1] + b.box[3]) / 2]).map(v => +v.toFixed(6)), bbox: [...toLL([b.box[0], b.box[1]]), ...toLL([b.box[2], b.box[3]])].map(v => +v.toFixed(6)) })) });
    i = Math.max(j, i + 1);
  }
  if (moved < 2 && !sts[0] && !sts[1]) continue;
  // the moved path: the samples moved, the ends exact (옮긴 역 점 또는 원래 끝), simplified (Douglas–Peucker 0.3 m)
  // 마지막 1 m 미만 잔여 구간은 샘플이 생략될 수 있어 끝 좌표를 직접 넣는다.
  const P = T; P[0] = sts[0] ? sts[0].p.slice() : e.pts[0].slice(); P[n - 1] = sts[1] ? sts[1].p.slice() : e.pts[e.pts.length - 1].slice();
  const keep = new Array(n).fill(false); keep[0] = keep[n - 1] = true; const stack = [[0, n - 1]];
  while (stack.length) { const [a, b] = stack.pop(); let far = 0, idx = -1; for (let k = a + 1; k < b; k++) { const d = segDist(P[k], P[a], P[b]); if (d > far) { far = d; idx = k } } if (far > .3) { keep[idx] = true; stack.push([a, idx], [idx, b]) } }
  result[e.id] = P.filter((p, i) => keep[i]).map(p => toLL(p).map(v => +v.toFixed(6)));
  report.push({ edge: e.id, movedM: +moved.toFixed(1), points: result[e.id].length, runs: e.notes.filter(x => x.ok), rejected: e.notes.filter(x => !x.ok) });
}
  return bad;
}
for (let round = 0; round < 8; round++) {
  const bad = pass3(); if (!bad.size) break;
  for (const [k, d] of bad) { if (stationPts.get(k)?.kept) continue; stationPts.delete(k); const note = stationNotes.find(x => x.key === k); if (note) { note.kept = `노선 원복(역을 옮기면 노선이 원래 선로에서 ${d.toFixed(0)} m 멀어짐)`; delete note.curved } }
}
// 역 점: 끝 좌표와 같은 반올림(6자리)으로 내보내 구간 끝과 정확히 같게 한다. 곧은 승강장은 방향(동, 북 단위벡터)도 함께.
const resultStops = {}; for (const [k, st] of stationPts) resultStops[k] = st.orig ? st.orig.slice() : [...toLL(st.p).map(v => +v.toFixed(6)), ...(st.u ? st.u.map(v => +v.toFixed(5)) : [])];
for (const id of Object.keys(result)) { const r = result[id], e = edges.find(x => x.id === id), o = shapes[id]; r[0] = resultStops[e.lo] ? resultStops[e.lo].slice(0, 2) : o[0].slice(); r[r.length - 1] = resultStops[e.hi] ? resultStops[e.hi].slice(0, 2) : o[o.length - 1].slice() }   // 옮기지 않은 끝은 원래 좌표 그대로(반올림 차 없이)
// 부분 생성에서는 계산하지 않은 항목을 보존하고 더는 스냅되지 않는 대상만 제거한다.
const outputResult = selected ? { ...ORIGINAL_SNAP } : result, outputStops = selected || ONLY ? { ...ORIGINAL_STOPS } : resultStops;
if (selected) for (const { id } of edges) {
  if (result[id]) outputResult[id] = result[id]; else delete outputResult[id];
}
// ── the rail height at each stretch, exactly as the runtime lifts the deck there: the stations' levels (transfer platforms
// overlapping in plan take different levels) and the ramps between, computed with the same code on the same station rectangles
function runtimeViaduct() {
  // 런타임처럼 옮긴 역 점 · 곧은 승강장 방향을 먼저 쓴다
  const stops = { ...(TS.stops || {}), ...Object.fromEntries(Object.entries(outputStops).map(([k, v]) => [k, v.slice(0, 2)])) }, dirs = { ...(TS.stopDirs || {}), ...Object.fromEntries(Object.entries(outputStops).filter(([, v]) => v.length > 2).map(([k, v]) => [k, v.slice(2)])) }, halfs = TS.stopHalf || {}, phalf = TS.platformHalf || {}, rects = new Map(), M = 111320;
  for (const st of stations) for (const { name: line } of st.lines) {
    const k = `${line}:${st.id}`, c = stops[k] || [st.lon, st.lat], kx = Math.cos(c[1] * Math.PI / 180), h = halfs[k] || 90; let d = dirs[k];
    if (!d) { const e = Object.keys(shapes).find(x => x.startsWith(line + ':') && x.split(':').slice(1).includes(String(st.id))); if (!e) continue; const P = shapes[e], a = P[0], b = P[P.length - 1], dx = (b[0] - a[0]) * kx * M, dy = (b[1] - a[1]) * M, l = Math.hypot(dx, dy) || 1; d = [dx / l, dy / l] }
    const toLL = (x, y) => [c[0] + x / (kx * M), c[1] + y / M], ph = phalf[k];
    rects.set(k, { coords: [toLL(-d[0] * h, -d[1] * h), toLL(d[0] * h, d[1] * h)], offset: 0, plat: ph ? Math.min(1, ph / h) : 1 });
  }
  const merc = ([lon, lat]) => ({ x: lon / 360 + .5, y: .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI) }), gcache = new Map();
  const geom = (line, lo, hi) => { const id = `${line}:${lo}:${hi}`; let g = gcache.get(id); if (g) return g; const c = outputResult[id] || (shapes[id] ? chaikin(shapes[id].map(q => q.slice())) : null) || [stops[`${line}:${lo}`] || [byId.get(lo).lon, byId.get(lo).lat], stops[`${line}:${hi}`] || [byId.get(hi).lon, byId.get(hi).lat]]; g = { pts: c.map(merc) }; gcache.set(id, g); return g };
  return new CityViaduct({ pack, net: { paths, byId, colors: {}, geom, offset: () => 0, rects, exits: {}, bodyPx: () => 13 } });
}
const viaduct = runtimeViaduct(), heightsAt = (edgeId, sFrom, sTo, total) => { const [line, lo, hi] = edgeId.split(':'); const H = []; for (let i = 0; i <= 4; i++) H.push(viaduct.heightAt(line, +lo, +hi, Math.max(0, Math.min(1, (sFrom + (sTo - sFrom) * i / 4) / total)))); return H };
for (const t of through) { const e = edges.find(x => x.id === t.edge), H = heightsAt(t.edge, t.sFrom, t.sTo, e.total); t.railM = +H[2].toFixed(2); t.railMRange = [+Math.min(...H).toFixed(2), +Math.max(...H).toFixed(2)]; t.deckBottomM = +(Math.min(...H) - pack.viaduct.deckThicknessM).toFixed(2); const [, lo, hi] = t.edge.split(':'); t.stations = `${nameOf(lo)}–${nameOf(hi)}`; t.levels = [viaduct.levelOf(t.line, +lo), viaduct.levelOf(t.line, +hi)]; delete t.sFrom; delete t.sTo }
through.sort((a, b) => b.lengthM - a.lengthM);
const OUT = opt('--output') || path.join(ROOT, 'web', 'lib', 'city_viaduct_snap.mjs');
writeFileSync(OUT, '// 심시티 고가: real-tunnel stretches of the track moved onto the street they run under, as the simcity mode draws and drives\n// them (CityViaduct.snapped) — the whole edge, lo → hi, replacing track_shapes.json\'s smoothed path there. Generated by\n// pipeline/build_viaduct_snap.mjs from the OpenFreeMap z14 tiles (© OpenMapTiles © OpenStreetMap contributors); do not edit by hand.\n' + `export default ${JSON.stringify(outputResult)};\n`
  + '// 옮긴 역 점(기본 · 심시티 지도의 역 표시 위치): line:역 → [lon, lat] 또는 곧은 승강장이면 [lon, lat, 동, 북 방향]. 위 구간 끝과 같은 좌표.\n'
  + `export const stops = ${JSON.stringify(outputStops)};\n`);
writeFileSync(path.join(REPORT, 'snap-report.json'), JSON.stringify({ edges: edges.length, moved: Object.keys(result).length, stations: stationNotes, report, ...(selected ? { selectedEdges: edges.map(e => e.id) } : {}) }, null, 1));
const levelsUp = viaduct.debugLevels().map(([k, L]) => ({ key: k, station: nameOf(k.slice(k.lastIndexOf(':') + 1)), level: L, railM: +viaduct.stationH(k.slice(0, k.lastIndexOf(':')), +k.slice(k.lastIndexOf(':') + 1)).toFixed(2) }));
writeFileSync(path.join(REPORT, 'through-buildings.json'), JSON.stringify({
  note: '심시티 고가가 (도로 스냅 후에도) 건물을 지나는 구간 — 따라갈 도로가 없어 옮기지 않은 곳; city-build가 이 건물들을 통과(역) 건물로 바꾼다. 좌표 lon,lat. kind: tunnel = 실제 지하(OSM tunnel), bridge = 실제 고가(OSM 선형과 건물 폴리곤 불일치), surface = 지상. railM: 그 구간 한가운데의 레일(상판 윗면) 높이 m — 노선별 기본 11 m + 환승역 층 분리(18/25 m…)와 그 앞뒤 경사 반영, 런타임(CityViaduct.heightAt)과 같은 계산; railMRange: 구간 양끝까지의 범위; deckBottomM: 상판 아랫면; levels: 이 구간 양쪽 역의 층. buildings: OFM z14 building 레이어의 폴리곤 (tile z/x/y, feature index, ring index, id when the tile has one, centre, bbox, render_height). 생성: pipeline/build_viaduct_snap.mjs',
  generated: new Date().toISOString(), summary: { stretches: through.length, totalM: through.reduce((t, x) => t + x.lengthM, 0), byKind: { tunnel: through.filter(x => x.kind === 'tunnel').length, bridge: through.filter(x => x.kind === 'bridge').length, surface: through.filter(x => x.kind === 'surface').length }, over40m: through.filter(x => x.lengthM >= 40).length, raisedStations: levelsUp.length },
  raisedStations: levelsUp, stretches: through }, null, 1));
// 도로 위 비율: 그려지는 경로(snap 이 있으면 snap, 없으면 원래 선로)가 같은 방향 도로 중심선 8 m 안에 있는 길이 — 이 실행 전 파일과 새 파일
function onRoad(snap) {
  const per = {}; let L = 0, R = 0, LT = 0, RT = 0;
  for (const e of edges) { const c = snap[e.id] ? snap[e.id].map(toM) : e.pts; per[e.line] ??= [0, 0, 0, 0]; const P = per[e.line];
    let tot = 0; for (let i = 1; i < c.length; i++) tot += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]); let run = 0;
    for (let i = 1; i < c.length; i++) { const A = c[i - 1], B = c[i], l = Math.hypot(B[0] - A[0], B[1] - A[1]); if (l < 1e-6) continue; const n = Math.max(1, Math.ceil(l / SAMPLE_M));
      for (let k = 0; k < n; k++) { const f = (k + .5) / n, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f, on = !!roadAt(x, y, (B[0] - A[0]) / l, (B[1] - A[1]) / l, 8, null);
        const q = e.S[Math.min(e.S.length - 1, Math.round((run + l * f) / (tot || 1) * (e.S.length - 1)))], under = q && q.tunnel && !q.bridge, w = l / n;   // 지하 여부: 같은 비율 위치의 원래 표본
        P[0] += w; L += w; if (on) { P[1] += w; R += w } if (under) { P[2] += w; LT += w; if (on) { P[3] += w; RT += w } } }
      run += l } }
  const f = v => +(v / 1000).toFixed(1);
  return { totalKm: f(L), onRoadKm: f(R), undergroundKm: f(LT), undergroundOnRoadKm: f(RT), byLine: Object.fromEntries(Object.entries(per).map(([k, [a, r, t, rt]]) => [k, { km: f(a), onRoad: +(r / a).toFixed(3), undergroundKm: f(t), undergroundOnRoad: t ? +(rt / t).toFixed(3) : null }])) };
}
const coverage = { before: onRoad(ORIGINAL_SNAP), after: onRoad(outputResult) };
writeFileSync(path.join(REPORT, 'road-coverage.json'), JSON.stringify(coverage, null, 1));
console.log(`도로 위(같은 방향 도로 8 m 안) ${coverage.before.onRoadKm}/${coverage.before.totalKm} km → ${coverage.after.onRoadKm}/${coverage.after.totalKm} km · 지하만 ${coverage.before.undergroundOnRoadKm}/${coverage.before.undergroundKm} → ${coverage.after.undergroundOnRoadKm}/${coverage.after.undergroundKm} km`);
const km = report.reduce((t, r) => t + r.runs.reduce((a, x) => a + x.len, 0), 0) / 1000;
console.log(`moved ${Object.keys(result).length} edges (${km.toFixed(1)} km of track), ${through.length} stretches still through buildings → ${path.relative(ROOT, OUT)} (${JSON.stringify(outputResult).length} bytes), ${REPORT}`);
