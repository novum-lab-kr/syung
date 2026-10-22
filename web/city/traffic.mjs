// 도시 교통 엔진 — a road graph built from the vector tiles' street lines, little cars driving on it,
// and an instanced renderer that draws vehicles from a list of poses.
//
// Kept apart from the city props (city_life.mjs) on purpose: a later real-time bus layer can put its
// own vehicles on the same graph (route path + reported position → pose) and hand them to the same
// renderer. Nothing here knows about tiles or MapLibre: coordinates are local metres (x east, y south,
// as web mercator runs), the caller converts.
//
//   const G = new RoadGraph();
//   G.addCell(key, lines, box);           // lines: [{pts:[[x,y],…], cls, oneway, level, width, lanes, speed}], box: [x0,y0,x1,y1]
//   G.removeCell(key);
//   G.poseAt(edge, s, offset) → {x, y, fx, fy}
//   const sim = new TrafficSim(G, {pack}); sim.step(dt, {box, cap, fade, now}); sim.poses / sim.count
//   const R = new VehicleRenderer(pack); R.init(gl); R.draw(gl, MT, mu, sim.poses, sim.count, {light, lit, night, zoom, pixelRatio});

export const hashi = (a, b, c = 0) => { let x = Math.imul(a | 0, 0x85ebca6b) ^ Math.imul((b | 0) + 0x6b43a9b5, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1); x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; return (x >>> 0) / 4294967296 };
const hexRgb = h => { h = String(h).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) };

// ── the graph ───────────────────────────────────────────────────────────────────────────────────
const SNAP = .7;              // m: line ends this close together are one node
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);

// Liang–Barsky: the parts of a polyline inside the box, each a list of [x, y, onBoundary]
function clipPolyline(pts, [x0, y0, x1, y1]) {
  const out = []; let cur = null;
  const inside = p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  for (let i = 0; i + 1 < pts.length; i++) {
    const A = pts[i], B = pts[i + 1], dx = B[0] - A[0], dy = B[1] - A[1];
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, A[0] - x0], [dx, x1 - A[0]], [-dy, A[1] - y0], [dy, y1 - A[1]]]) {
      if (p === 0) { if (q < 0) { ok = false; break } continue }
      const r = q / p;
      if (p < 0) { if (r > t1) { ok = false; break } if (r > t0) t0 = r } else { if (r < t0) { ok = false; break } if (r < t1) t1 = r }
    }
    if (!ok) { cur = null; continue }
    const P = [A[0] + dx * t0, A[1] + dy * t0, t0 > 0 || (i === 0 && !inside(A))], Q = [A[0] + dx * t1, A[1] + dy * t1, t1 < 1];
    if (!cur || t0 > 0) { cur = [P]; out.push(cur) }
    cur.push(Q);
    if (t1 < 1) cur = null;
  }
  return out.filter(l => l.length > 1);
}

export class RoadGraph {
  constructor() { this.cells = new Map(); this.nodes = new Map(); this.edges = new Set(); this.version = 0; this._id = 0 }
  nodeAt(x, y) {
    const gx = Math.round(x / SNAP), gy = Math.round(y / SNAP);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const n = this.nodes.get((gx + dx) + ',' + (gy + dy)); if (n && Math.hypot(n.x - x, n.y - y) <= SNAP) return n }
    const n = { x, y, key: gx + ',' + gy, out: [], signal: null, boundary: false }; this.nodes.set(n.key, n); return n;
  }
  // The cell's streets become edges between nodes; where two streets at the same level cross, both are cut
  // there; a street ending on another's side cuts it too (a T). Cut at the box edge: boundary nodes, which
  // the neighbouring cell's streets meet (same snap grid, the box edge is the same number on both sides).
  addCell(key, lines, box) { const g = this.addCellGen(key, lines, box); let r; do { r = g.next() } while (!r.done); return r.value }
  // The same in steps (a generator), so a caller building in time slices can yield between the phases:
  // clipping and the segment grid · the crossings (a crossing counts in the grid cell that holds it: no pair set) ·
  // the ends on other streets' sides · cutting and the edges · the signals.
  *addCellGen(key, lines, box) {
    if (this.cells.has(key)) this.removeCell(key);
    const L = [];
    for (const ln of lines) for (const part of clipPolyline(ln.pts, box)) L.push({ ...ln, pts: part });
    const segs = [], grid = new Map(), CELL = 24, gk = (x, y) => Math.floor(x / CELL) + ',' + Math.floor(y / CELL);
    L.forEach((ln, li) => { for (let i = 0; i + 1 < ln.pts.length; i++) { const A = ln.pts[i], B = ln.pts[i + 1]; const s = { li, si: i, ax: A[0], ay: A[1], bx: B[0], by: B[1], level: ln.level || 0, idx: segs.length }; segs.push(s);
      const cx0 = Math.floor(Math.min(A[0], B[0]) / CELL), cx1 = Math.floor(Math.max(A[0], B[0]) / CELL), cy0 = Math.floor(Math.min(A[1], B[1]) / CELL), cy1 = Math.floor(Math.max(A[1], B[1]) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) { const k = cx + ',' + cy; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(s) } } });
    yield;
    const splits = L.map(() => []);
    const addSplit = (li, si, t) => { if (t > 1e-6 && t < 1 - 1e-6) splits[li].push([si, t]) };
    let n = 0;
    for (const [k, list] of grid) {
      if (++n % 500 === 0) yield;
      if (list.length < 2) continue;
      const [cx, cy] = k.split(',').map(Number), x0 = cx * CELL, y0 = cy * CELL;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j]; if (A.li === B.li && Math.abs(A.si - B.si) <= 1) continue; if (A.level !== B.level) continue;
        const d = (A.bx - A.ax) * (B.by - B.ay) - (A.by - A.ay) * (B.bx - B.ax); if (Math.abs(d) < 1e-9) continue;
        const t = ((B.ax - A.ax) * (B.by - B.ay) - (B.ay - A.ay) * (B.bx - B.ax)) / d, u = ((B.ax - A.ax) * (A.by - A.ay) - (B.ay - A.ay) * (A.bx - A.ax)) / d;
        if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
        const px = A.ax + (A.bx - A.ax) * t, py = A.ay + (A.by - A.ay) * t;
        if (px < x0 || px >= x0 + CELL || py < y0 || py >= y0 + CELL) continue;   // counted where it lies, once
        addSplit(A.li, A.si, t); addSplit(B.li, B.si, u);
      }
    }
    yield;
    // a street's end on another street's side (any level: a ramp lands on the road below at its end)
    L.forEach((ln, li) => { for (const P of [ln.pts[0], ln.pts[ln.pts.length - 1]]) {
      const cx = Math.floor(P[0] / CELL), cy = Math.floor(P[1] / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const s of grid.get((cx + dx) + ',' + (cy + dy)) || []) {
        if (s.li === li) continue; const ex = s.bx - s.ax, ey = s.by - s.ay, l2 = ex * ex + ey * ey || 1, u = ((P[0] - s.ax) * ex + (P[1] - s.ay) * ey) / l2;
        if (u <= 1e-6 || u >= 1 - 1e-6) continue; if (Math.hypot(s.ax + ex * u - P[0], s.ay + ey * u - P[1]) <= SNAP) addSplit(s.li, s.si, u) } } });
    yield;
    // cut and make edges
    const edges = [], touched = new Set(), cell = { key, edges, box };
    L.forEach((ln, li) => {
      const S = splits[li].sort((a, b) => a[0] - b[0] || a[1] - b[1]), pieces = [[ln.pts[0]]];
      let si = 0; for (let i = 0; i + 1 < ln.pts.length; i++) {
        const A = ln.pts[i], B = ln.pts[i + 1];
        while (si < S.length && S[si][0] === i) { const t = S[si][1], P = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], last = pieces[pieces.length - 1]; if (Math.hypot(P[0] - last[last.length - 1][0], P[1] - last[last.length - 1][1]) > .05) last.push(P); pieces.push([P]); si++ }
        pieces[pieces.length - 1].push(B);
      }
      for (const pts of pieces) {
        const xs = new Float64Array(pts.length), ys = new Float64Array(pts.length), cum = new Float64Array(pts.length);
        for (let i = 0; i < pts.length; i++) { xs[i] = pts[i][0]; ys[i] = pts[i][1]; if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) }
        const len = cum[pts.length - 1]; if (len < 1) continue;
        const a = this.nodeAt(xs[0], ys[0]), b = this.nodeAt(xs[pts.length - 1], ys[pts.length - 1]); if (a === b) continue;
        if (pts[0][2]) a.boundary = true; if (pts[pts.length - 1][2]) b.boundary = true;
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity; for (let i = 0; i < pts.length; i++) { bx0 = Math.min(bx0, xs[i]); by0 = Math.min(by0, ys[i]); bx1 = Math.max(bx1, xs[i]); by1 = Math.max(by1, ys[i]) }
        const e = { id: ++this._id, cell: key, xs, ys, cum, len, cls: ln.cls, oneway: ln.oneway || 0, level: ln.level || 0, width: ln.width, lanes: ln.lanes || 1, speed: ln.speed || 8, sidewalk: ln.sidewalk || 0, ramp: !!ln.ramp, a, b, box: [bx0, by0, bx1, by1], q: [] };
        a.out.push({ e, end: 0 }); b.out.push({ e, end: 1 }); edges.push(e); this.edges.add(e); touched.add(a); touched.add(b);
      }
    });
    yield;
    for (const n of touched) this.signalAt(n);
    this.cells.set(key, cell); this.version++;
    return cell;
  }
  removeCell(key) {
    const cell = this.cells.get(key); if (!cell) return;
    const touched = new Set();
    for (const e of cell.edges) { this.edges.delete(e); for (const n of [e.a, e.b]) { n.out = n.out.filter(o => o.e !== e); touched.add(n) } }
    for (const n of touched) { if (!n.out.length) this.nodes.delete(n.key); else this.signalAt(n) }
    this.cells.delete(key); this.version++;
  }
  // heading of an edge leaving a node
  static heading(o) { const e = o.e, n = e.xs.length; return o.end === 0 ? Math.atan2(e.ys[1] - e.ys[0], e.xs[1] - e.xs[0]) : Math.atan2(e.ys[n - 2] - e.ys[n - 1], e.xs[n - 2] - e.xs[n - 1]) }
  // A crossing of two or more major streets gets a two-phase signal: arms grouped by heading (mod π).
  // Per arm, where its stop line is: back from the node by the widest crossing arm's half width,
  // the crossing's setback and depth (so cars wait before the zebra, not on it).
  signalAt(n) {
    n.signal = null; if (n.out.length < 3) return;
    const majors = n.out.filter(o => MAJOR.has(o.e.cls)); if (majors.length < 2) return;
    const h = o => { let a = RoadGraph.heading(o) % Math.PI; if (a < 0) a += Math.PI; return a };
    const hA = h(majors[0]), diff = (a, b) => { let d = Math.abs(a - b); return Math.min(d, Math.PI - d) };
    const A = new Set(), B = new Set();
    for (const o of n.out) (diff(h(o), hA) < .6 ? A : B).add(o.e);
    if (![...A].some(e => MAJOR.has(e.cls)) || ![...B].some(e => MAJOR.has(e.cls))) return;   // a lane joining a main road from the side: no lights
    const r = hashi(Math.round(n.x), Math.round(n.y), 7), period = 26 + 8 * r;
    const stop = new Map(); for (const o of n.out) { let w = 0; for (const p of n.out) if (p.e !== o.e && !((A.has(o.e) ? A : B).has(p.e))) w = Math.max(w, p.e.width / 2); stop.set(o.e, w + 2 + 3) }
    n.signal = { A, B, period, offset: period * hashi(Math.round(n.x), Math.round(n.y), 9), stop };
  }
  // 'green' | 'yellow' | 'red' for an edge arriving at node n at time t (s)
  light(n, e, t) {
    const S = n.signal; if (!S) return 'green';
    const u = ((t + S.offset) % S.period) / S.period, mine = S.A.has(e) ? 0 : S.B.has(e) ? 1 : -1; if (mine < 0) return 'red';
    const v = mine ? (u + .5) % 1 : u;   // each group's half of the cycle
    return v < .40 ? 'green' : v < .46 ? 'yellow' : 'red';
  }
  // point s (m) along an edge, moved `off` m to the right of the direction of travel (dir ±1)
  poseAt(e, s, off = 0, dir = 1) {
    const n = e.xs.length; let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (e.cum[m] <= s) lo = m; else hi = m }
    const l = (e.cum[hi] - e.cum[lo]) || 1, u = Math.max(0, Math.min(1, (s - e.cum[lo]) / l)), fx = (e.xs[hi] - e.xs[lo]) / l * dir, fy = (e.ys[hi] - e.ys[lo]) / l * dir;
    return { x: e.xs[lo] + (e.xs[hi] - e.xs[lo]) * u - fy * off, y: e.ys[lo] + (e.ys[hi] - e.ys[lo]) * u + fx * off, fx, fy };
  }
}

// ── the cars ────────────────────────────────────────────────────────────────────────────────────
// Each car: an edge, a distance along it, a direction, a lane. It keeps its distance from the car ahead
// in its lane, stops at a red light, picks a way on at the end of the edge (straight on preferred), and
// goes when nothing continues (the cell beyond is not built, a one-way dead end). Spawned on the streets
// in view to the pack's density per 100 m of road, faded in and out by scale.
const KIND_W = [.8, .2];   // sedan, SUV (pack.suvRatio overrides)
// The parts of an edge inside a box as ranges of s (its distance along) and their total length: where people and
// cars are put so that they appear in view, not somewhere along a street that merely crosses it (a long street's
// middle, or its end, is often off screen while the street itself runs right through the view).
export function visibleRanges(e, [x0, y0, x1, y1]) {
  const xs = e.xs, ys = e.ys, cum = e.cum, r = []; let len = 0;
  for (let i = 1; i < xs.length; i++) {
    const ax = xs[i - 1], ay = ys[i - 1], dx = xs[i] - ax, dy = ys[i] - ay; let t0 = 0, t1 = 1, ok = true;   // Liang–Barsky
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) { if (p === 0) { if (q < 0) { ok = false; break } continue } const t = q / p; if (p < 0) { if (t > t1) { ok = false; break } if (t > t0) t0 = t } else { if (t < t0) { ok = false; break } if (t < t1) t1 = t } }
    if (!ok) continue; const L = cum[i] - cum[i - 1], s0 = cum[i - 1] + t0 * L, s1 = cum[i - 1] + t1 * L; if (s1 <= s0) continue;
    if (r.length && Math.abs(r[r.length - 1][1] - s0) < 1e-6) r[r.length - 1][1] = s1; else r.push([s0, s1]); len += s1 - s0;
  }
  return { r, len };
}
// a distance along the edge at fraction u (0..1) of its visible length
export function sampleS(V, u) { let d = u * V.len; for (const [s0, s1] of V.r) { if (d <= s1 - s0) return s0 + d; d -= s1 - s0 } const last = V.r[V.r.length - 1]; return last ? last[1] : 0 }

export class TrafficSim {
  constructor(graph, { pack, maxCars = 1400 } = {}) {
    this.G = graph; this.pack = pack; this.cars = []; this.max = maxCars; this.poses = new Float32Array(maxCars * 10); this.count = 0;
    const V = pack.props.vehicles; this.colors = V.colors.map(hexRgb); this.cw = V.weights; this.suv = V.suvRatio; const AL = pack.roads?.aliases || {}, D = V.per100M; this.per100 = Object.fromEntries(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'].map(c => [c, D[c] ?? D[AL[c]] ?? ((c === 'motorway' || c === 'trunk') ? D.primary : 0)]));   // the pack's density per class; one it leaves out (the expressways, so far) through its alias, else as busy as a primary road
    this.laneK = V.laneOffsetWidthRatio; this.clearance = V.intersectionClearanceM;
    const [lo, hi] = V.speedMps; this.vmax = { motorway: hi, trunk: hi, primary: hi, secondary: lo + (hi - lo) * .75, tertiary: lo + (hi - lo) * .5, minor: lo + (hi - lo) * .15, service: lo };
    this.stats = { cars: 0, visible: 0, target: 0 };
    this._t = 0;
  }
  pick(weights, r) { let acc = 0; for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (r < acc) return i } return weights.length - 1 }
  // e.lanes: lanes each way on a two-way street, lanes across the whole width on a one-way one (as the
  // lane marks are drawn); a car keeps to the middle of its lane, right of the centre line
  laneOffset(e, lane) {
    if (e.oneway) { const lw = e.width / e.lanes; return (lane - (e.lanes - 1) / 2) * lw }
    return (lane + .5) * e.width / (2 * e.lanes);
  }
  lanesOf(e) { return Math.max(1, e.lanes | 0) }
  spawn(e, s, dir) {
    const r = Math.random(), kind = r < this.suv ? 1 : 0, col = this.colors[this.pick(this.cw, Math.random())], len = kind ? this.pack.props.vehicles.suvSizeM[0] : this.pack.props.vehicles.carSizeM[0];
    const lanes = this.lanesOf(e), lane = Math.floor(Math.random() * lanes), vmax = (this.vmax[e.cls] || 7) * (.9 + .2 * Math.random());
    const car = { e, s, dir, lane, v: vmax * (.5 + .5 * Math.random()), vmax, kmax: vmax / (this.vmax[e.cls] || 7), len, kind, col, sc: 0, dying: false, brake: 0, idle: 0, seed: Math.random() };   // seed: 이 차의 고정 난수(스타크래프트: 어느 유닛 모양인지 — 달리는 동안 안 바뀌게)
    this.cars.push(car); return car;
  }
  // dt in s; box: the view in local metres; cap: cars allowed in view; fade: 0..1 (zoom); now: s
  step(dt, { box, cap = 240, fade = 1, now = 0, reducedMotion = false }) {
    const G = this.G, cars = this.cars; dt = Math.min(.1, Math.max(0, dt)); this._t = now;
    const [x0, y0, x1, y1] = box, W = x1 - x0, H = y1 - y0, far = [x0 - Math.max(300, W * .75), y0 - Math.max(300, H * .75), x1 + Math.max(300, W * .75), y1 + Math.max(300, H * .75)];
    // the streets in view and how many cars they call for
    const vis = []; let want = 0;
    for (const e of G.edges) { if (e.level < 0 || e.box[2] < x0 || e.box[0] > x1 || e.box[3] < y0 || e.box[1] > y1) continue; const d = this.per100[e.cls] || 0; if (!d || e.len < 2 * this.clearance + 6) continue; const V = visibleRanges(e, box); if (!V.len) continue; vis.push([e, V]); want += V.len / 100 * d }   // only the part of each street that is in view counts (and gets the cars)
    const target = Math.min(cap, Math.round(want * fade));
    // move
    for (const e of G.edges) e.q.length = 0;
    const nowPos = c => { const p = G.poseAt(c.e, c.s, 0, 1); c.x = p.x; c.y = p.y; return p };
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i], e = c.e;
      if (!G.edges.has(e)) { cars.splice(i, 1); continue }   // its street went with its cell
      if (!reducedMotion) {
        // the light ahead and the stop line
        const node = c.dir > 0 ? e.b : e.a, toEnd = c.dir > 0 ? e.len - c.s : c.s;
        let tv = c.vmax; if (toEnd < 12 && node.out.length > 2) tv *= .7;   // easing into a junction
        if (node.signal) { const L = G.light(node, e, now), st = node.signal.stop.get(e) || 5, dStop = toEnd - st;
          if (L !== 'green' && dStop > -.5 && !(L === 'yellow' && dStop < c.v * c.v / 7)) { tv = Math.min(tv, Math.sqrt(2 * 3.5 * Math.max(0, dStop))); if (dStop < .5) tv = 0 } }
        c.tv = tv;
      }
      e.q.push(c);
    }
    // following, lane by lane and direction by direction
    for (const e of G.edges) { const q = e.q; if (q.length < 2) continue;
      q.sort((a, b) => (a.dir - b.dir) || (a.lane - b.lane) || ((a.dir > 0 ? a.s : e.len - a.s) - (b.dir > 0 ? b.s : e.len - b.s)));
      for (let i = 0; i + 1 < q.length; i++) { const a = q[i], b = q[i + 1]; if (a.dir !== b.dir || a.lane !== b.lane) continue;
        const pa = a.dir > 0 ? a.s : e.len - a.s, pb = b.dir > 0 ? b.s : e.len - b.s, gap = pb - pa - (a.len + b.len) / 2 - 1.2, want = 1 + a.v * .9;
        if (gap < want) a.tv = Math.min(a.tv, gap <= .3 ? 0 : b.v * Math.min(1, gap / want) + Math.max(0, gap - 1) * .6) } }
    // speeds, positions, the way on at the end
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i], e = c.e;
      if (!reducedMotion) {
        const tv = c.tv ?? c.vmax; c.brake = tv < c.v - .2 ? 1 : 0; c.v += Math.max(-4.5 * dt, Math.min(2.2 * dt, tv - c.v)); if (c.v < 0) c.v = 0;
        c.s += c.v * dt * c.dir;
        if (c.s < 0 || c.s > e.len) {
          const over = c.s < 0 ? -c.s : c.s - e.len, node = c.s < 0 ? e.a : e.b, hd = Math.atan2(c.dir > 0 ? e.ys[e.ys.length - 1] - e.ys[e.ys.length - 2] : e.ys[0] - e.ys[1], c.dir > 0 ? e.xs[e.xs.length - 1] - e.xs[e.xs.length - 2] : e.xs[0] - e.xs[1]);
          const opts = []; let tot = 0;
          for (const o of node.out) { if (o.e === e || o.e.level < 0) continue; const dir = o.end === 0 ? 1 : -1; if (o.e.oneway && o.e.oneway !== dir) continue;
            const d = RoadGraph.heading(o) - hd, cs = Math.cos(d); let w = .25 + 2.5 * Math.max(0, cs) ** 2 + (o.e.cls === e.cls ? .4 : 0); if (cs < -.95) w *= .05; opts.push([o, dir, w]); tot += w }
          if (!opts.length) { if (e.oneway || node.boundary) { c.dying = true; c.s = Math.max(0, Math.min(e.len, c.s)) } else { c.dir = -c.dir; c.s = Math.max(0, Math.min(e.len, c.s)); c.v *= .3 } }
          else { let r = Math.random() * tot, pick = opts[0]; for (const o of opts) { r -= o[2]; if (r <= 0) { pick = o; break } }
            const ne = pick[0].e, dir = pick[1]; c.e = ne; c.dir = dir; c.s = dir > 0 ? Math.min(ne.len, over) : Math.max(0, ne.len - over); c.lane = Math.min(c.lane, this.lanesOf(ne) - 1); c.vmax = (this.vmax[ne.cls] || 7) * c.kmax }
        }
      }
      // fade in, fade out
      if (c.dying) { c.sc -= dt * 2; if (c.sc <= 0) { cars.splice(i, 1); continue } } else if (c.sc < 1) c.sc = Math.min(1, c.sc + dt * 2);
      const p = nowPos(c);
      if (p.x < far[0] || p.x > far[2] || p.y < far[1] || p.y > far[3]) { cars.splice(i, 1); continue }   // far off: gone
    }
    // keep the view to its number: spawn on streets in view (never within the clearance of their ends,
    // never on top of another car), send the excess away
    let visible = 0; for (const c of cars) if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1 && !c.dying) visible++;
    if (vis.length && visible < target && cars.length < this.max) {
      for (let k = 0; k < 6 && visible < target; k++) {
        let r = Math.random() * want, pick = vis[0]; for (const x of vis) { r -= x[1].len / 100 * (this.per100[x[0].cls] || 0); if (r <= 0) { pick = x; break } }
        const e = pick[0], s = Math.max(this.clearance, Math.min(e.len - this.clearance, sampleS(pick[1], Math.random()))), dir = e.oneway ? e.oneway : Math.random() < .5 ? 1 : -1;
        let clash = false; for (const c of e.q) if (c.dir === dir && Math.abs(c.s - s) < 12) { clash = true; break }
        if (clash) continue;
        const c = this.spawn(e, s, dir); nowPos(c); visible++;
      }
    } else if (visible > target * 1.3) { let n = Math.min(3, visible - target); for (const c of cars) { if (n <= 0) break; if (!c.dying && c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) { c.dying = true; n-- } } }
    // poses: x, y, yaw, kind, r, g, b, scale, brake, lane
    const P = this.poses; let n = 0;
    for (const c of cars) { if (n >= this.max) break; const p = G.poseAt(c.e, c.s, this.laneOffset(c.e, c.lane), c.dir), o = n * 10;
      P[o] = p.x; P[o + 1] = p.y; P[o + 2] = Math.atan2(p.fy, p.fx); P[o + 3] = c.kind; P[o + 4] = c.col[0]; P[o + 5] = c.col[1]; P[o + 6] = c.col[2]; P[o + 7] = c.sc; P[o + 8] = c.brake; P[o + 9] = c.lane; n++ }
    this.count = n; this.stats = { cars: cars.length, visible, target, edges: vis.length };
    return n;
  }
  clear() { this.cars.length = 0; this.count = 0 }
}

// ── the renderer ────────────────────────────────────────────────────────────────────────────────
// One low-poly car mesh in unit space (x along, y across, z up; 0..1 each), scaled per kind by the pack's
// metres, drawn instanced from the poses. Flat-shaded faces: body colour, dark glass, dark wheels, and
// the lamps (which glow at night; the tail lamps also when braking). Scale is the fade.
function carMesh() {
  const d = [];
  const quad = (A, B, C, D, n, slot) => { for (const p of [A, B, C, A, C, D]) d.push(p[0], p[1], p[2], n[0], n[1], n[2], slot) };
  const box = (x0, y0, z0, x1, y1, z1, slots) => {   // slots: [+x, -x, +y, -y, top, bottom]
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], slots[0]);
    quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [-1, 0, 0], slots[1]);
    quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [0, 1, 0], slots[2]);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], slots[3]);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], slots[4]);
    if (slots[5] != null) quad([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [0, 0, -1], slots[5]);
  };
  box(-.5, -.5, .17, .5, .5, .56, [0, 0, 0, 0, 0, null]);                    // the body
  box(-.3, -.43, .56, .2, .43, 1, [1, 1, 1, 1, 0, null]);                     // the cabin: glass round, roof on top
  for (const x of [-.31, .31]) for (const y of [-.5, .5]) box(x - .1, y - .05, 0, x + .1, y + .05, .32, [2, 2, 2, 2, 2, null]);   // wheels
  for (const y of [-.32, .32]) { quad([.502, y - .09, .36], [.502, y + .09, .36], [.502, y + .09, .48], [.502, y - .09, .48], [1, 0, 0], 3);   // head lamps
    quad([-.502, y + .1, .34], [-.502, y - .1, .34], [-.502, y - .1, .47], [-.502, y + .1, .47], [-1, 0, 0], 4) }                 // tail lamps
  return new Float32Array(d);
}
const CAR_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in float a_slot;
layout(location=3) in vec4 i_a;   // x, y (local m), yaw, kind
layout(location=4) in vec4 i_b;   // r, g, b, scale
layout(location=5) in vec2 i_c;   // brake, lane
uniform mat4 u_matrix; uniform float u_mu, u_night, u_grow; uniform vec3 u_dims[3]; uniform vec3 u_light, u_glass, u_dark, u_head, u_tail; uniform vec2 u_lit;
out vec3 v_col;
void main(){
  float s = i_b.w; if (s <= .002) { gl_Position = vec4(2., 2., 2., 1.); return; }
  vec3 D = u_dims[int(i_a.w + .5)] * s * u_grow;
  vec3 p = vec3(a_pos.x * D.x, a_pos.y * D.y, a_pos.z * D.z);
  float c = cos(i_a.z), sn = sin(i_a.z);
  p.xy = vec2(p.x * c - p.y * sn, p.x * sn + p.y * c);
  vec3 n = vec3(a_nrm.x * c - a_nrm.y * sn, a_nrm.x * sn + a_nrm.y * c, a_nrm.z);
  gl_Position = u_matrix * vec4((i_a.xy + p.xy) * u_mu, p.z * u_mu, 1.);
  float d = max(dot(n, u_light), 0.), lit = u_lit.x + u_lit.y * (.5 + .5 * d);
  bool night = u_night > .5;
  vec3 base = a_slot < .5 ? i_b.rgb : a_slot < 1.5 ? u_glass : a_slot < 2.5 ? u_dark : a_slot < 3.5 ? (night ? u_head : mix(i_b.rgb, vec3(1.), .55)) : (night || i_c.x > .5 ? u_tail : mix(i_b.rgb, u_tail, .55));
  bool emit = a_slot > 2.5 && (night || (a_slot > 3.5 && i_c.x > .5));
  v_col = emit ? base * 1.08 : base * lit;
}`;
const CAR_FS = `#version 300 es
precision highp float; in vec3 v_col; out vec4 o; void main(){ o = vec4(clamp(v_col, 0., 1.), 1.); }`;
// the head lamps' pool on the road ahead (night, close up): a short soft wedge
const BEAM_VS = `#version 300 es
layout(location=0) in vec2 a_q;   // along 0..1, across -1..1
layout(location=3) in vec4 i_a; layout(location=4) in vec4 i_b;
uniform mat4 u_matrix; uniform float u_mu, u_len, u_grow; uniform vec3 u_dims[3];
out vec2 v_q;
void main(){
  float s = i_b.w; if (s <= .002) { gl_Position = vec4(2., 2., 2., 1.); return; }
  vec3 D = u_dims[int(i_a.w + .5)] * s * u_grow;
  vec2 p = vec2(D.x * .5 + a_q.x * u_len, a_q.y * D.y * (.55 + .45 * a_q.x));
  float c = cos(i_a.z), sn = sin(i_a.z);
  p = vec2(p.x * c - p.y * sn, p.x * sn + p.y * c);
  gl_Position = u_matrix * vec4((i_a.xy + p) * u_mu, .05 * u_mu, 1.);
  gl_Position.z -= 2e-5 * gl_Position.w;
  v_q = a_q;
}`;
const BEAM_FS = `#version 300 es
precision highp float; in vec2 v_q; uniform vec3 u_rgb; uniform float u_alpha; out vec4 o;
void main(){ float a = u_alpha * (1. - v_q.x) * (1. - v_q.x) * (1. - abs(v_q.y) * abs(v_q.y)); if (a <= .002) discard; o = vec4(u_rgb * a, a); }`;

export function compileProgram(gl, vs, fs) {
  const sh = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(x)); return x };
  const p = gl.createProgram(), v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p); gl.deleteShader(v); gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p)); return p;
}
export class VehicleRenderer {
  constructor(pack) { this.pack = pack; const V = pack.props.vehicles; this.dims = new Float32Array([...V.carSizeM, ...V.suvSizeM, ...(V.bus?.sizeM || V.suvSizeM)]); this.head = hexRgb(V.headlights); this.tail = hexRgb(V.taillights); this.beamLen = V.beamMaxM; this.beamA = V.beamMaxOpacity }
  init(gl) {
    if (this.p) return;
    this.p = compileProgram(gl, CAR_VS, CAR_FS); this.pB = compileProgram(gl, BEAM_VS, BEAM_FS);
    const U = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
    this.u = U(this.p, ['u_matrix', 'u_mu', 'u_night', 'u_grow', 'u_dims', 'u_light', 'u_glass', 'u_dark', 'u_head', 'u_tail', 'u_lit']);
    this.uB = U(this.pB, ['u_matrix', 'u_mu', 'u_len', 'u_grow', 'u_dims', 'u_rgb', 'u_alpha']);
    const mesh = carMesh(); this.n = mesh.length / 7;
    this.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vb); gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
    this.qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]), gl.STATIC_DRAW);
    this.inst = [gl.createBuffer(), gl.createBuffer()]; this.ping = 0; this.cap = 0;
    this.va = gl.createVertexArray(); gl.bindVertexArray(this.va); gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    this.vaB = gl.createVertexArray(); gl.bindVertexArray(this.vaB); gl.bindBuffer(gl.ARRAY_BUFFER, this.qb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  instPtr(gl, b) { gl.bindBuffer(gl.ARRAY_BUFFER, b); for (const [loc, n, off] of [[3, 4, 0], [4, 4, 16], [5, 2, 32]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 40, off); gl.vertexAttribDivisor(loc, 1) } }
  // MT: the matrix with the local origin folded in; mu: mercator units a metre; poses from TrafficSim (10 floats each)
  draw(gl, MT, mu, poses, n, { light = [-.5, .5, .7], lit = [.64, .36], night = false, glass = [.32, .41, .42], dark = [.16, .18, .2], grow = 1, beams = false, beamAlpha = null, pixelRatio = 1 } = {}) {   // beamAlpha: 앞불 줄기 진하기(밤 불빛, 없으면 팩 값)
    if (!this.p || !n) return;
    const b = this.inst[this.ping = this.ping ^ 1];   // never the store the last frame may still be drawing from
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, poses.byteLength, gl.DYNAMIC_DRAW); gl.bufferSubData(gl.ARRAY_BUFFER, 0, poses, 0, n * 10);
    gl.useProgram(this.p); gl.uniformMatrix4fv(this.u.u_matrix, false, MT); gl.uniform1f(this.u.u_mu, mu); gl.uniform1f(this.u.u_night, night ? 1 : 0); gl.uniform1f(this.u.u_grow, grow);
    gl.uniform3fv(this.u.u_dims, this.dims); gl.uniform3fv(this.u.u_light, light); gl.uniform2fv(this.u.u_lit, lit); gl.uniform3fv(this.u.u_glass, glass); gl.uniform3fv(this.u.u_dark, dark); gl.uniform3fv(this.u.u_head, this.head); gl.uniform3fv(this.u.u_tail, this.tail);
    gl.bindVertexArray(this.va); this.instPtr(gl, b);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.n, n);
    if (night && beams) {
      gl.useProgram(this.pB); gl.uniformMatrix4fv(this.uB.u_matrix, false, MT); gl.uniform1f(this.uB.u_mu, mu); gl.uniform1f(this.uB.u_len, this.beamLen); gl.uniform1f(this.uB.u_grow, grow);
      gl.uniform3fv(this.uB.u_dims, this.dims); gl.uniform3fv(this.uB.u_rgb, this.head); gl.uniform1f(this.uB.u_alpha, beamAlpha ?? this.beamA);
      gl.bindVertexArray(this.vaB); this.instPtr(gl, b);
      gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
      gl.depthMask(true);
    }
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  dispose(gl) { if (!this.p) return; gl.deleteProgram(this.p); gl.deleteProgram(this.pB); gl.deleteBuffer(this.vb); gl.deleteBuffer(this.qb); for (const b of this.inst) gl.deleteBuffer(b); gl.deleteVertexArray(this.va); gl.deleteVertexArray(this.vaB); this.p = null }
}
export default { RoadGraph, TrafficSim, VehicleRenderer };
