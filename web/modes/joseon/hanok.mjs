// 조선 모드의 건물 — every footprint as a Joseon building, when the style pack carries `hanok` (web/modes/joseon/style.mts).
//
// The footprint is fitted with an oriented rectangle of its own area (a little inside it: pack fitK), then given a type:
//   · 초가집 (thatched, mud walls) or 기와집 (tiled, 회벽 · 창호) — by the land use, the size and a smooth district noise, so
//     thatched villages and tiled quarters come in patches;
//   · a plan: ㅡ자, ㄱ자, ㄷ자, ㅁ자 (wings round a yard) as the lot allows; a small lot sometimes walled (돌담 or 기와 담장)
//     with the house set back behind a front yard;
//   · a big lot becomes a compound — houses in rows with yards between, some cells left open, a wall and a gate round it;
//   · a tall building keeps its height (the owner's references, 2026-10-09: a 9층 목탑 and a hanok high-rise): a 한옥 고층 —
//     timber-framed floors with a 기와 skirt round them, a hanok podium, a roof (three on a long slab) on top — or, tall and
//     squarish, a 목탑 with a roof round every storey and a golden 상륜; a middling one becomes a 중층 전각 (two storeys).
// A roof is a 우진각 (기와: concave slope, lifted and kicked-out corners, a ridge) or a rounded 초가 with a thick cut edge.
// Detail by zoom, as city_mesh's lists: `lo` (drawn below LOD_HI) holds a plain four-face roof, `hi` (from LOD_HI) the
// curved one and the ridge; `walls` is drawn at every zoom.
//
// Tiles: a footprint cut by the tile edge is laid out on its whole outline, which both tiles hold, and each house (each
// wall stretch) is drawn by the tile its centre falls in, so the halves never draw the same house twice. An outline the
// tile's buffer also cut (each tile then holds a different piece of it) falls back to the part inside the tile.
import { area as ringArea, simplifyRing, orientedBox } from '../../city/geom.mts';
import { HANOK_KIND, POSTS } from '../../city/mesh.mts';   // (메시 형식의 몫: 꼭짓점 종류 · 기둥 수)
import { registerCityPart } from '../../city/parts.mts';
export { HANOK_KIND, POSTS };


const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const CIVIC = new Set(['school', 'university', 'college', 'hospital', 'civic', 'public']);

// an outline the tile's buffer cut: an axis-aligned edge on the buffer's line (OpenFreeMap: 64 of 4096 round the tile;
// each tile then holds a different piece of it). Other axis-aligned edges out there are only walls running north–south
export function bufferCut(r, E) {
  const n = r.length / 2, b = E / 64;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = r[i * 2], ay = r[i * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1];
    if ((ax === bx && ay !== by && (ax <= -b || ax >= E + b)) || (ay === by && ax !== bx && (ay <= -b || ay >= E + b))) return true;
  }
  return false;
}

// a smooth 0..1 noise over the city (value noise on a lattice of `cell` metres): the districts
function hash2(x, y) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
export function districtNoise(xm, ym, cell) {
  const x = xm / cell, y = ym / cell, ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), fx), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), fx), fy);
}

// What a footprint becomes: {kind: 'house' | 'hall' | 'pagoda', thatch, floors}. H: its height (m), A: its area (m²),
// district: the noise there (0..1), r(k): stable 0..1
export function hanokType(H, A, aspect, landuse, district, K, r) {
  const T = K.tall;
  if (H >= T.pagodaMinH && aspect <= T.pagodaMaxAspect && r(1) < T.pagodaShare) return { kind: 'pagoda', thatch: false, H };
  if (H >= T.towerMinH) return { kind: 'tower', thatch: false, H };
  if (H >= T.hallMinH && A >= T.hallMinAreaM2 && r(2) < (landuse === 'residential' ? T.hallShareResidential : T.hallShare)) return { kind: 'hall', thatch: false };
  const base = CIVIC.has(landuse) ? 0 : K.thatch.byLanduse[landuse] ?? K.thatch.byLanduse.unknown;
  const p = A > K.thatch.maxAreaM2 || H >= T.towerMinH ? 0 : clamp(base * (.2 + 1.6 * smooth(clamp((district - .25) / .5, 0, 1))), 0, .95);
  return { kind: 'house', thatch: r(3) < p };
}

// one house's wings on a lot L × S (m, L ≥ S), centred: [{x, y, hl, hd, turn}] — turn: the wing runs across the lot
// (its length along y). ㅡ (set back with a yard in front when the lot is deep), ㄱ, ㄷ, ㅁ as the lot allows
export function houseWings(L, S, K, rnd, thatch) {
  const m = K.eaveOutM * .5, a = L / 2 - m, b = S / 2 - m;
  if (a < 1.6 || b < 1.4) return [{ x: 0, y: 0, hl: Math.max(1.2, a), hd: Math.max(1.2, b), turn: false }];
  const d = clamp(Math.min(L, S) * .42, 4.2, thatch ? 5.2 : 6.6), sb = rnd(4) < .5 ? 1 : -1, sx = rnd(5) < .5 ? 1 : -1;   // wing depth; which side is the back; which end the ㄱ turns at
  const fitsL = 2 * b >= d + 3.5 && 2 * a >= 2 * d, fitsU = fitsL && 2 * a >= 2 * d + 3, fitsO = 2 * a >= 2 * d + 4 && 2 * b >= 2 * d + 4;
  const w = thatch ? K.plans.thatch : K.plans.giwa, u = rnd(6);
  let plan = u < w[0] ? 'ㅡ' : u < w[0] + w[1] ? 'ㄱ' : u < w[0] + w[1] + w[2] ? 'ㄷ' : 'ㅁ';
  if (plan === 'ㅁ' && !fitsO) plan = 'ㄷ'; if (plan === 'ㄷ' && !fitsU) plan = 'ㄱ'; if (plan === 'ㄱ' && !fitsL) plan = 'ㅡ';
  const back = { x: 0, y: sb * (b - d / 2), hl: a, hd: d / 2, turn: false };
  if (plan === 'ㅡ') return 2 * b > d * 1.5 ? [back] : [{ x: 0, y: 0, hl: a, hd: b, turn: false }];
  const side = s => { const y0 = sb * (b - d / 2), y1 = plan === 'ㅁ' ? -y0 : -sb * b; return { x: s * (a - d / 2), y: (y0 + y1) / 2, hl: Math.abs(y0 - y1) / 2, hd: d / 2, turn: true } };
  if (plan === 'ㄱ') return [back, side(sx)];
  if (plan === 'ㄷ') return [back, side(1), side(-1)];
  return [back, { x: 0, y: -back.y, hl: a, hd: d / 2, turn: false }, side(1), side(-1)];
}

// the layout of a footprint's rectangle L × S (m, L ≥ S) for its type: {houses: [{x, y, hl, hd, turn, thatch, kind}],
// wall: {hx, hy, stone, gate (±1: the side of the gate along y)} or null}. rnd(i): 0..1, stable
export function hanokLayout(L, S, K, rnd = () => .5, type = { kind: 'house', thatch: false }) {
  const eave = K.eaveOutM, one = K.single, C = K.compound, thatch = !!type.thatch, gate = rnd(9) < .5 ? 1 : -1;
  const court = (h, stone) => ({ hx: L / 2 - C.insetM, hy: S / 2 - C.insetM, stone, gate });
  const T = K.tall;
  if (type.kind === 'tower') {   // the lot: the podium at its edge, the tower inside it
    const a = Math.max(2.5, L / 2 - .3 - T.podiumOutM), b = Math.max(2.5, S / 2 - .3 - T.podiumOutM), [ma, mb] = T.towerMaxHalfM;
    if (a <= ma && b <= mb) return { houses: [{ x: 0, y: 0, hl: a, hd: b, turn: false, thatch: false, kind: 'tower', H: type.H }], wall: null };
    // a broad one (a mall, a hotel): a palace court — the tower in the middle at most ma × mb, a 중층 전각 either side where it fits
    const ta = Math.min(a, ma), tb = Math.min(b, mb), houses = [{ x: 0, y: 0, hl: ta, hd: tb, turn: false, thatch: false, kind: 'tower', H: type.H }], side = L / 2 - ta - T.podiumOutM - 4;
    if (side >= 9) for (const sx of [-1, 1]) houses.push({ x: sx * (L / 2 - side / 2 - 1.5), y: 0, hl: Math.min(side / 2 - 1, T.hallHalfM[0]), hd: clamp(S / 2 - 6, 3.5, T.hallHalfM[1]), turn: false, thatch: false, kind: 'hall' });
    return { houses, wall: court(0, false) };
  }
  if (type.kind === 'pagoda') {   // in the middle of its lot, a walled court round it when the lot is big enough
    const s = Math.max(3, Math.min(L, S) / 2 - T.pagodaEaveM - .5), walled = L * S >= C.minAreaM2 && Math.min(L, S) / 2 - s > 4;
    return { houses: [{ x: 0, y: 0, hl: s, hd: s, turn: false, thatch: false, kind: 'pagoda', H: type.H }], wall: walled ? court(0, false) : null };
  }
  if (type.kind === 'hall') {
    const hl = clamp(L / 2 - 4, 4, T.hallHalfM[0]), hd = clamp(S / 2 - 4, 3.5, T.hallHalfM[1]);
    return { houses: [{ x: 0, y: 0, hl, hd, turn: false, thatch: false, kind: 'hall' }], wall: L * S >= C.minAreaM2 ? court(0, false) : null };
  }
  if (L <= one.maxLengthM && S <= one.maxDepthM) {
    // a walled lot: the house set back behind a front yard on the gate side
    const P = K.lot, lot = L * S >= P.minAreaM2 && rnd(1) < (thatch ? P.thatchShare : P.giwaShare);
    if (lot) {
      const mx = C.insetM + P.wallThickM + .8, li = L - 2 * mx, si = S - 2 * mx - P.yardM;
      if (li >= 5 && si >= 4) return { houses: houseWings(li, si, K, rnd, thatch).map(h => ({ ...h, y: h.y - gate * P.yardM / 2, thatch, kind: 'house' })), wall: court(0, thatch || rnd(2) < P.stoneShareGiwa) };
    }
    return { houses: houseWings(L, S, K, rnd, thatch).map(h => ({ ...h, thatch, kind: 'house' })), wall: null };
  }
  const walled = L * S >= C.minAreaM2, edge = walled ? C.insetM + C.wallThickM + eave + 1 : eave * .5;
  const Li = Math.max(4, L - 2 * edge), Si = Math.max(4, S - 2 * edge), [d0, d1] = K.houseDepthM;
  let nR = Math.max(1, Math.floor((Si + K.yardM) / (d1 + K.yardM))), nC = Math.max(1, Math.round((Li + K.gapM) / (K.houseLengthM + K.gapM)));
  while (nR * nC > K.maxHouses) { if (nC >= nR) nC--; else nR-- }
  const D = clamp((Si - (nR - 1) * K.yardM) / nR, Math.min(d0, Si), d1), Lc = Math.min(K.maxLengthM, (Li - (nC - 1) * K.gapM) / nC);
  // centres a house length plus the gap apart (wall to wall: gapM), the row centred in the lot; rows likewise
  const pitchL = Lc + K.gapM, x0 = -(nC * Lc + (nC - 1) * K.gapM) / 2 + Lc / 2, pitchS = nR > 1 ? (Si - D) / (nR - 1) : 0, houses = [];
  for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
    const k = r * 97 + c; if (nR * nC >= 3 && rnd(k) < K.emptyShare) continue;   // an open yard
    const fl = .72 + .28 * rnd(k + 41), fd = .8 + .2 * rnd(k + 53);   // each house its own size within its cell
    houses.push({ x: x0 + pitchL * c, y: nR > 1 ? -Si / 2 + D / 2 + pitchS * r : 0, hl: Math.max(1.2, Lc / 2 * fl), hd: Math.max(1.2, D / 2 * fd), turn: false, thatch: thatch && rnd(k + 67) < .85, kind: 'house' });
  }
  if (!houses.length) houses.push({ x: 0, y: 0, hl: Math.max(1.2, Lc / 2), hd: D / 2, turn: false, thatch, kind: 'house' });
  return { houses, wall: walled ? court(0, thatch || rnd(2) < C.stoneShare) : null };
}

// one footprint (a TileBuilder item). unit(seed, k): the builder's stable 0..1
export function hanokBuilding(tb, it, unit) {
  const K = tb.P.hanok, E = tb.E, mpu = tb.mPerUnit;
  if (it.depth) return;   // a part traced inside another footprint: its container is the house
  const cut = it.clipped && bufferCut(it.raw, E), ring0 = !it.clipped || cut ? it.outer : it.raw;
  const ring = ring0.length > 160 ? simplifyRing(ring0, .5 / mpu) : ring0, box = orientedBox(ring); if (!box) return;
  const A = it.clipped && !cut ? ringArea(it.raw) * mpu * mpu : it.A;
  const k = clamp(Math.sqrt(A / Math.max(box.hw * box.hh * 4 * mpu * mpu, 1e-6)), .55, 1) * K.fitK, L = box.hw * 2 * mpu * k, S = box.hh * 2 * mpu * k;
  const rnd = i => unit(it.seed, 101 + i), n = 2 ** tb.src.z, cm = 40075016.685578488 * Math.cos(37.55 * Math.PI / 180);
  const district = districtNoise((tb.src.x + box.cx / E) / n * cm, (tb.src.y + box.cy / E) / n * cm, K.thatch.districtM);
  const type = hanokType(it.H, A, L / Math.max(S, .1), it.landuse, district, K, i => unit(it.seed, 211 + i));
  const lay = hanokLayout(L, S, K, rnd, type);
  const ux = box.ux, uy = box.uy, vx = -uy, vy = ux;
  const at = (x, y) => [box.cx + (x * ux + y * vx) / mpu, box.cy + (x * uy + y * vy) / mpu];   // metres from the rectangle's centre → tile units
  const sx = tb.src.x, sy = tb.src.y, q = v => Math.round(v * 1024) / 1024;   // whose tile a point is in: on the absolute tile grid, rounded, so both neighbours agree on a centre right on their edge
  const mine = p => Math.floor(q(sx * E + p[0]) / E) === sx && Math.floor(q(sy * E + p[1]) / E) === sy;
  const W = tb.W, seed = it.seed >>> 0; W.b = [seed & 255, (seed >>> 8) & 255, 0, 0];
  let drawn = 0;
  lay.houses.forEach((h, i) => {
    const c = at(h.x, h.y); if (!mine(c)) return;
    const F = h.turn ? frame(tb, c, vx, vy) : frame(tb, c, ux, uy), r = j => unit(it.seed, 7 + i * 13 + j);
    if (h.kind === 'tower') tower(tb, F, h.hl, h.hd, h.H, K, r);
    else if (h.kind === 'pagoda') pagoda(tb, F, h.hl, h.H, K, r);
    else if (h.kind === 'hall') hall(tb, F, h.hl, h.hd, K, r);
    else if (h.thatch) thatchHouse(tb, F, h.hl, h.hd, K, r);
    else giwaHouse(tb, F, h.hl, h.hd, K, r);
    drawn++;
  });
  if (lay.wall) drawn += walls(tb, at, mine, ux, uy, lay.wall, K);
  if (drawn) tb.count++;
}

// 한옥 고층의 처마 지붕들 (Codex 검토 2026-10-10): a face `len` m long → [[from, to], …] (m from the face's first corner).
// The first and the last are corner roofs (they run on round the corner into the next face); between them roofs about
// G.widthM wide, G.gapM apart. A short face is one roof corner to corner. The shader (city_buildings.mjs FS kind 9, wall
// type 2) lays out the same groups to put the windows and the eave's shadow under them — change both together
export function skirtGroups(len, G) {
  const leg = clamp(G.cornerK * len, G.cornerM[0], G.cornerM[1]);
  if (len <= 2 * leg + G.gapM) return [[0, len]];
  const span = len - 2 * leg - 2 * G.gapM, out = [[0, leg]];
  if (span >= G.minM) {
    const n = Math.max(1, Math.round((span + G.gapM) / (G.widthM + G.gapM))), w = (span - (n - 1) * G.gapM) / n;
    for (let i = 0; i < n; i++) { const x = leg + G.gapM + i * (w + G.gapM); out.push([x, x + w]) }
  }
  out.push([len - leg, len]);
  return out;
}

// 처마 조각 하나 (32 bytes, city_mesh.mjs INST_STRIDE): f32 the wall start x, y (the tile's mercator), z (the slope's top, m),
// the wall's angle on the tile, its length (m), u at its start (m); then bytes ×0.01 m: out · back at the first end, out ·
// along at the last (the eave's ends from the wall's), the two ends' lifts, the depth o; the 기와 colour slot.
// Read by city_buildings.mjs VS_SKIRT — change both together
export function skirtInst(xy, z, angle, L, u0, ends, l0, l1, o, slot) {
  const f = new Float32Array(8), b = new Uint8Array(f.buffer), q = v => clamp(Math.round(v * 100), 0, 255);
  f[0] = xy[0]; f[1] = xy[1]; f[2] = z; f[3] = angle; f[4] = L; f[5] = u0;
  b[24] = q(ends[0]); b[25] = q(ends[1]); b[26] = q(ends[2]); b[27] = q(ends[3]); b[28] = q(l0); b[29] = q(l1); b[30] = q(o); b[31] = slot;
  return f;
}
// the piece every 처마 instance draws: points (column 0 · .5 · 1, row t, part 0 the slope · 1 the edge's top · 2 its foot);
// index ranges: lo (one quad on the grid's corners), grid, edge
export function skirtTemplate(rows) {
  const v = [], idx = [], R = rows.length;
  for (const t of rows) for (const sc of [0, .5, 1]) v.push(sc, t, 0);
  for (const sc of [0, .5, 1]) v.push(sc, 1, 1, sc, 1, 2);
  const last = R * 3 - 1; idx.push(0, 2, last, 0, last, last - 2);
  for (let ti = 0; ti < R - 1; ti++) for (let si = 0; si < 2; si++) { const q = ti * 3 + si; idx.push(q, q + 1, q + 4, q, q + 4, q + 3) }
  const e = R * 3; for (let i = 0; i < 2; i++) { const a = e + 2 * i, b = a + 2; idx.push(a, b, b + 1, a, b + 1, a + 1) }
  return { verts: new Float32Array(v), idx: new Uint16Array(idx), lo: [0, 6], grid: [6, (R - 1) * 12], edge: [6 + (R - 1) * 12, 12] };
}

// 지붕 하나 (64 bytes): f32 the centre x, y (the tile's mercator), the local x axis's angle on the tile, a, b, o, ze, rise,
// ar, lift, kick, t1, zt (the walls' top), H (the ridge's top; 6553.5 none); bytes style (ROOF_STYLE), 초가, colour slot, 0;
// the footprint's seed bytes. Read by city_buildings.mjs VS_ROOF
export const ROOF_INST = 64, BOX_INST = 40;
export function roofInst(xy, angle, v, sty, seed) {
  const f = new Float32Array(16), b = new Uint8Array(f.buffer);
  f[0] = xy[0]; f[1] = xy[1]; f[2] = angle; f.set(v, 3);
  b[56] = sty[0]; b[57] = sty[1]; b[58] = sty[2]; b[60] = seed[0]; b[61] = seed[1];
  return f;
}
// 벽 상자 하나 (40 bytes): f32 the centre x, y, the angle, a, b, z0, zt, the storey; bytes type, mx0, mx1, the face seed (0–15);
// the footprint's seed bytes. Read by city_buildings.mjs VS_BOX
export function boxInst(xy, angle, a, b, z0, zt, storey, w, seed) {
  const f = new Float32Array(10), u = new Uint8Array(f.buffer);
  f[0] = xy[0]; f[1] = xy[1]; f[2] = angle; f[3] = a; f[4] = b; f[5] = z0; f[6] = zt; f[7] = storey;
  u[32] = w[0]; u[33] = w[1]; u[34] = w[2]; u[35] = w[3]; u[36] = seed[0]; u[37] = seed[1];
  return f;
}
// the points every roof instance draws: (part, i, j) — parts 0–1 the long faces (toward ±y; i 0..2 along, j 0..3 rows),
// 2–3 the short faces (toward ±x; i 0..1, j 0..2), 4–5 the 합각 / gable walls (i 0..6), 6 the 용마루 (i 0..11), 7 the 초가's
// cut edge (i 0..15); close up only (DETAIL_Z) 8 the eaves' underside (서까래), 9 the 기와 eave's edge (와구토), 10 the 망와 at
// the ridge's ends, 11 the 추녀마루 up the four hips. The shader folds away what a roof does not have. Index ranges: far, near, detail (near and the rest)
export function roofTemplate() {
  const v = [], P = [];
  const add = (part, n, f) => { const b = v.length / 3; P[part] = b; for (let k = 0; k < n; k++) { const [i, j] = f(k); v.push(part, i, j) } };
  for (const part of [0, 1]) add(part, 12, k => [k % 3, Math.floor(k / 3)]);
  for (const part of [2, 3]) add(part, 6, k => [k % 2, Math.floor(k / 2)]);
  for (const part of [4, 5]) add(part, 7, k => [k, 0]);
  add(6, 12, k => [k, 0]); add(7, 16, k => [k, 0]);
  add(8, 20, k => [k, 0]); add(9, 20, k => [k, 0]); add(10, 8, k => [k, 0]);   // 가까이(DETAIL_Z): 처마 밑면, 처마 끝 두께, 망와
  add(11, 36, k => [k, 0]);   // 추녀마루: 네 귀의 사선 마루(마루 h × 마디 3 × 왼 · 등 · 오른)
  const far = [], near = [], detail = [], gable = [5, 6, 1, 5, 1, 0, 0, 1, 3, 0, 3, 2, 2, 3, 4];
  for (const part of [0, 1]) { const b = P[part]; far.push(b, b + 2, b + 11, b, b + 11, b + 9); for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) { const q = b + j * 3 + i; near.push(q, q + 1, q + 4, q, q + 4, q + 3) } }
  for (const part of [2, 3]) { const b = P[part]; far.push(b, b + 1, b + 5, b, b + 5, b + 4); for (let j = 0; j < 2; j++) { const q = b + j * 2; near.push(q, q + 1, q + 3, q, q + 3, q + 2) } }
  for (const part of [4, 5]) for (const i of gable) { far.push(P[part] + i); near.push(P[part] + i) }
  for (let q = 0; q < 3; q++) { const b = P[6] + q * 4; near.push(b, b + 1, b + 2, b, b + 2, b + 3) }
  for (let f = 0; f < 4; f++) { const b = P[7] + f * 4; near.push(b + 1, b + 3, b + 2, b + 1, b + 2, b) }
  // 처마 밑면 · 끝 두께: a face's points [0..n) along the wall (or the eave's top), [n..2n) along the eave (or its foot); n 3 on a long face, 2 on a short one
  for (const part of [8, 9]) for (let f = 0, b = P[part]; f < 4; f++) { const n = f < 2 ? 3 : 2; for (let i = 0; i < n - 1; i++) detail.push(b + i, b + i + 1, b + n + i + 1, b + i, b + n + i + 1, b + n + i); b += 2 * n }
  for (const e of [0, 4]) { const b = P[10] + e; detail.push(b, b + 1, b + 2, b, b + 2, b + 3) }
  for (let h = 0; h < 4; h++) for (let q = 0; q < 2; q++) for (let c = 0; c < 2; c++) { const a = P[11] + h * 9 + q * 3 + c, b = a + 3; detail.push(a, a + 1, b + 1, a, b + 1, b) }
  return { verts: new Float32Array(v), idx: new Uint16Array([...far, ...near, ...detail]), far: [0, far.length], near: [far.length, near.length], detail: [far.length, near.length + detail.length] };
}
// the points every wall box draws: (side 0..3, end 0..1, top 0..1)
// close up only (DETAIL_Z): (4, i, 0) the 기단 round a house's foot — its four sides (i 0..15) and top (16..19); (5, i, 0) two
// stone steps up to it on one long side (i: step × 16 + face (front, left, right, top) × 4 + corner)
export function boxTemplate() {
  const v = [], idx = [];
  for (let s = 0; s < 4; s++) { for (const [e, t] of [[0, 0], [1, 0], [1, 1], [0, 1]]) v.push(s, e, t); const b = s * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3) }
  const b4 = v.length / 3; for (let i = 0; i < 20; i++) v.push(4, i, 0);
  const b5 = v.length / 3; for (let i = 0; i < 32; i++) v.push(5, i, 0);
  for (let q = 0; q < 5; q++) { const b = b4 + q * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3) }
  for (let q = 0; q < 8; q++) { const b = b5 + q * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3) }
  // (6 + side, post, corner): a post standing out of the wall on every bay line, a bracket (받침목) under the eave on top of
  // it (Codex 3차: 기둥과 지붕이 이어져 보이게) — post faces front · left · right (corners 0..11), bracket front · left · right · bottom (12..27)
  for (let sd = 0; sd < 4; sd++) for (let k = 0; k < POSTS; k++) { const b = v.length / 3; for (let c = 0; c < 28; c++) v.push(6 + sd, k, c); for (let q = 0; q < 7; q++) idx.push(b + q * 4, b + q * 4 + 1, b + q * 4 + 2, b + q * 4, b + q * 4 + 2, b + q * 4 + 3) }
  return { verts: new Float32Array(v), idx: new Uint16Array(idx), far: [0, 24], near: [0, 24], detail: [0, idx.length] };
}

// a local frame on the house: x along (ux, uy), y across, z up, metres → the writer's tile-mercator units; triangles wound
// so their face points along the normal given (front = counter-clockwise seen from outside, as city_mesh's walls). list:
// 'walls' (every zoom), 'lo' (below LOD_HI), 'hi' (from LOD_HI)
function frame(tb, c, ux, uy) {
  const W = tb.W, mpu = tb.mPerUnit, u = tb.unit, vx = -uy, vy = ux, E = tb.E, CH = Math.sqrt(tb.chunks.length);
  const ch = tb.chunks[clamp(Math.floor(c[0] / E * CH), 0, CH - 1) + CH * clamp(Math.floor(c[1] / E * CH), 0, CH - 1)];
  ch.n++;   // (result() keeps only the chunks that hold something)
  const F = {
    ch, W,
    v(p, n, uu) { W.normal(n[0] * ux + n[1] * vx, n[0] * uy + n[1] * vy, n[2]); const x = (c[0] + (p[0] * ux + p[1] * vx) / mpu) * u, y = (c[1] + (p[0] * uy + p[1] * vy) / mpu) * u; tb.extend(ch, x, y, x, y, p[2]); return W.v(x, y, p[2], uu) },
    quad(P, n, U = [0, 0, 0, 0], list = 'walls') { const i = P.map((p, j) => F.v(p, n, U[j])); push(ch[list], i, P, n) },
    // triangles of point indices into P, each point with its own normal (N) and u (U); `out` orients them
    // lists: {list: tris, …} — the same points shared by several lists (a roof's near and far faces)
    mesh(P, N, U, lists, out) { const i = P.map((p, j) => F.v(p, N[j], U[j])); for (const [list, tris] of Object.entries(lists)) for (let t = 0; t < tris.length; t += 3) tri(ch[list], i, P, tris[t], tris[t + 1], tris[t + 2], out) },
    shift(dx, dy) { return frame(tb, [c[0] + (dx * ux + dy * vx) / mpu, c[1] + (dx * uy + dy * vy) / mpu], ux, uy) },   // the same axes, centred dx, dy metres away
    at(p) { return [(c[0] + (p[0] * ux + p[1] * vx) / mpu) * u, (c[1] + (p[0] * uy + p[1] * vy) / mpu) * u] },   // local metres → the tile's mercator (nothing written)
    angle(d) { return Math.atan2(d[0] * uy + d[1] * vy, d[0] * ux + d[1] * vx) },   // a local direction's angle on the tile
    // an instance record ('skirt' · 'roof' · 'box') into this chunk (far: drawn from afar too — the skirt's far tiers; roofs and
    // walls are always drawn); pts: local points it reaches, for the chunk's bounds
    inst(kind, rec, far, pts) { (far ? ch.instFar : ch.inst)[kind].push(rec); for (const p of pts) { const q = F.at(p); tb.extend(ch, q[0], q[1], q[0], q[1], p[2]) } },
  };
  return F;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] };
// out: the side the face looks to — a vector, or a function of the triangle's points giving one
function tri(list, i, P, a, b, c, out) {
  const n = cross(sub(P[b], P[a]), sub(P[c], P[a])); if (Math.hypot(n[0], n[1], n[2]) < 1e-9) return;   // degenerate (a hip's apex)
  if (dot(n, typeof out === 'function' ? out(P[a], P[b], P[c]) : out) >= 0) list.push(i[a], i[b], i[c]); else list.push(i[a], i[c], i[b]);
}
function push(list, i, P, n) { tri(list, i, P, 0, 1, 2, n); tri(list, i, P, 0, 2, 3, n) }

// a box's sides (and top) from z0 to z1 over ±a × ±b (local metres); wallU(length, side) runs before each side
function box(F, a, b, z0, z1, top, wallU, list = 'walls') {
  const C = [[-a, -b], [a, -b], [a, b], [-a, b]];
  for (let s = 0; s < 4; s++) {
    const p = C[s], q = C[(s + 1) % 4], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy), n = [dy / l, -dx / l, 0];
    const nOut = dot([n[0], n[1], 0], [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0]) >= 0 ? n : [-n[0], -n[1], 0];
    if (wallU) wallU(l, s);
    F.quad([[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], nOut, [0, l, l, 0], list);
  }
  if (top) F.quad(C.map(([x, y]) => [x, y, z1]), [0, 0, 1], undefined, list);
}

// a house's walls from z0 to zt, drawn instanced (city_buildings.mjs VS_BOX; boxInst): type (a_bld.z, read by the shader):
// 0 a house (the stone band below K.baseM, then one storey of posts, beams, 회벽 and 창호), 1 the same in mud (초가), 2 a
// tall body of storeys `storey` m high (the stone band at its foot), 3 one upper storey `storey` high. The shader gets H =
// zt, each face its bays (length / K.bayM), length and the storey (types 2–3) or a seed; mx (a_misc.xy) for type 2: the
// eaves' step (floors) and where the floors start (× 5 cm)
const WALL = { HOUSE: 0, MUD: 1, STOREYS: 2, STOREY: 3 };
function houseWalls(tb, F, a, b, z0, zt, type, K, r, storey = 0, mx = [0, 0]) {
  const s = tb.W.b;   // the footprint's seed bytes (hanokBuilding)
  F.inst('box', boxInst(F.at([0, 0]), F.angle([1, 0]), a, b, z0, zt, storey, [type, mx[0], mx[1], Math.floor(r * 16)], s), true, [[-a, -b, zt], [a, b, zt], [a, -b, z0], [-a, b, z0]]);
}

// 한옥 지붕, drawn instanced (city_buildings.mjs VS_ROOF; roofInst · roofTemplate — change them together): over walls
// ±a × ±b, eaves `o` out at ze, rising `rise` to a ridge `ar` long (0: a pyramid); the height share at t (0 eave … 1 ridge)
// 기와: concave (flat at the eave, steep at the ridge), 초가: a rounded mound with a thick cut edge; lift / kick: the corners
// raised and pushed out (추녀); t1 < 1: only the lower part (a skirt roof round an upper storey). style: 'hip' 우진각 ·
// 'paljak' 팔작 (the hip faces stop at tg, a 합각 triangle stands above them and the ridge runs out to it) · 'gable' 맞배 (no
// hip faces: the long faces run out past the end walls by K.gableEndM, a gable wall under each end). The 합각 and the
// gable walls are plaster (kind DAM) at every zoom; the 용마루 (a low bar along the ridge) near only; near the curved grid,
// far one quad a face on the grid's corners
const giwaProf = t => .45 * t + .55 * t * t;
const ROOF_STYLE = { hip: 0, paljak: 1, gable: 2 };
function roof(tb, F, a, b, o, ze, rise, ar, { thatch = false, lift = 0, kick = 0, t1 = 1, style = 'hip', zt, H, slot }) {
  const s = tb.W.b, k = kick, top = H < 6000 ? H : ze + rise;
  F.inst('roof', roofInst(F.at([0, 0]), F.angle([1, 0]), [a, b, o, ze, rise, ar, lift, k, t1, zt, H], [ROOF_STYLE[style], thatch ? 1 : 0, slot], s), true,
    [[-(a + o + k + .7), -(b + o + k), ze], [a + o + k + .7, b + o + k, top], [a + o + k + .7, -(b + o + k), ze], [-(a + o + k + .7), b + o + k, ze]]);
}

// a 기와 roof (kind ROOF; H = the ridge's top for the shader's ridge band) over walls ±a × ±b topped at zt, and its 용마루
function giwaRoof(tb, F, a, b, zt, K, slot, opts = {}) {
  const o = opts.eave ?? K.eaveOutM, be = b + o, ae = a + o, ze = zt - .15, rise = clamp(K.riseK * be, K.riseM[0], K.riseM[1]);
  const R = K.ridge, ar = opts.pyramid ? 0 : Math.max(.3 * ae, ae - K.hipK * be), zr = ze + rise, top = opts.t1 ? ze + rise * giwaProf(opts.t1) : zr + R.upM;
  const style = opts.t1 || opts.pyramid ? 'hip' : opts.style || 'hip';
  roof(tb, F, a, b, o, ze, rise, ar, { lift: K.cornerLiftM, kick: K.cornerKickM * .7, t1: opts.t1 ?? 1, style, zt, H: opts.t1 ? 6553.5 : top, slot });   // (H: a skirt has no ridge band)
  return { ze, rise, zr, top };
}

// the roof's form (Codex 검토 2026-10-10: not every house 팔작 — a narrow wing 맞배, a plain house 우진각 now and then)
function roofStyle(b, K, u) {
  const S = K.roofStyles, w = b <= S.narrowHalfM ? S.narrow : S.wide;
  return u < w[0] ? 'paljak' : u < w[0] + w[1] ? 'gable' : 'hip';
}
function giwaHouse(tb, F, a, b, K, r) {
  const zt = K.baseM + lerp(K.wallM[0], K.wallM[1], clamp((b * 2 - 5) / 5, 0, 1)) * (.92 + .16 * r(1));
  houseWalls(tb, F, a, b, 0, zt, WALL.HOUSE, K, r(2));
  giwaRoof(tb, F, a, b, zt, K, Math.floor(r(3) * 3) % 3, { style: roofStyle(b, K, r(5)) });
}

// 초가: low mud walls on a low stone footing, a rounded thatch with a thick cut edge, no corner lift (kind THATCH; H = the
// top, where the shader draws the 용마름's darker band)
function thatchHouse(tb, F, a, b, K, r) {
  const T = K.thatch, zt = T.baseM + T.wallM * (.93 + .14 * r(1)), o = T.eaveOutM, be = b + o, ae = a + o;
  const ze = zt + .05, rise = clamp(T.riseK * be, T.riseM[0], T.riseM[1]), ar = Math.max(.12 * ae, ae - T.hipK * be);
  houseWalls(tb, F, a, b, 0, zt, WALL.MUD, K, r(2));
  roof(tb, F, a, b, o, ze, rise, ar, { thatch: true, zt, H: ze + rise, slot: Math.floor(r(3) * 3) % 3 });
}

// 중층 전각: a tall ground storey, a skirt roof round it, an upper storey set in, and its own roof
function hall(tb, F, a, b, K, r) {
  const T = K.tall, slot = Math.floor(r(3) * 3) % 3, z1 = K.baseM + T.hallStoreyM[0], set = T.hallSetM, a2 = a - set, b2 = b - set;
  houseWalls(tb, F, a, b, 0, z1, WALL.HOUSE, K, r(2));
  const be = b + K.eaveOutM, t1 = clamp(1 - (b2 - .3) / be, .3, .8), skirt = giwaRoof(tb, F, a, b, z1, K, slot, { t1 });
  const z2 = skirt.top - .3 + T.hallStoreyM[1];
  houseWalls(tb, F, a2, b2, skirt.top - .3, z2, WALL.STOREY, K, r(4), T.hallStoreyM[1]);
  giwaRoof(tb, F, a2, b2, z2, K, slot, { style: 'paljak' });
}

// 목탑 (the owner's reference: 황룡사 9층 목탑): square storeys getting smaller, a deep roof round each, a pyramid on top
// and a golden 상륜 (slot 3: the spire colour). Its height is the building's own: storeys of at least pagodaStoreyMinM
function pagoda(tb, F, s, H, K, r) {
  const T = K.tall, slot = Math.floor(r(3) * 3) % 3, spire = Math.min(T.spireM, H * .12), body = Math.max(12, H - spire - 2);
  const floors = clamp(Math.round(body / Math.max(T.pagodaStoreyMinM, body / 13)), 3, 13), st = body / (floors + .35);
  let z = 0, h = s;
  for (let f = 0; f < floors; f++) {
    const storey = f ? st : st * 1.35, zt = z + storey, last = f === floors - 1, next = h * (1 - T.pagodaShrink);
    houseWalls(tb, F, h, h, z, zt, f ? WALL.STOREY : WALL.HOUSE, K, r(10 + f), storey);
    if (last) { const R = giwaRoof(tb, F, h, h, zt, K, slot, { pyramid: true, eave: T.pagodaEaveM }); tb.W.kind = HANOK_KIND.ROOF; tb.W.w = [0, 0, 0, 0]; tb.W.m = [3, 0, 255, 255]; box(F, .25, .25, R.zr - .3, R.zr + spire, true) }
    else { const be = h + T.pagodaEaveM, t1 = clamp(1 - (next - .2) / be, .25, .85), R = giwaRoof(tb, F, h, h, zt, K, slot, { t1, eave: T.pagodaEaveM }); z = R.top - .25 }
    h = next;
  }
}

// 한옥 고층 (the owner's reference: a hanok high-rise): the body's walls from the ground to the top, timber-framed storeys
// (wall type STOREYS); a podium a little wider round its foot with a tiled skirt; a 기와 skirt round every floor (every 2nd
// or 3rd on a tall one: K.tall.skirtStep); on top one roof, or on a long slab three — the middle one larger and higher
function tower(tb, F, a, b, H, K, r) {
  const T = K.tall, slot = Math.floor(r(3) * 3) % 3, top = Math.max(T.podiumM + 2 * T.storeyM, H - 2.5);
  const floors = Math.max(2, Math.round((top - T.podiumM) / T.storeyM)), st = (top - T.podiumM) / floors;
  houseWalls(tb, F, a, b, 0, top, WALL.STOREYS, K, r(2), st, [T.skirtStep.find(([n]) => floors <= n)[1], Math.round(T.podiumM * 20)]);   // (the shader: the eaves' step and the floors' origin)
  // the podium: one storey round the foot, its skirt reaching in to the body
  const pa = a + T.podiumOutM, pb = b + T.podiumOutM;
  houseWalls(tb, F, pa, pb, 0, T.podiumM, WALL.HOUSE, K, r(4));
  const be = pb + K.eaveOutM, t1 = clamp(1 - (b - .2) / be, .2, .7);
  giwaRoof(tb, F, pa, pb, T.podiumM, K, slot, { t1 });
  // the floors' eaves (Codex 검토 2026-10-10, 레퍼런스: 창 두세 칸을 묶은 지붕이 따로따로, 모서리는 더 큰 지붕이 감싼다): on each
  // face the roofs skirtGroups lays out, the same on every tier so they line up, every `step` floors. A corner roof is the
  // two faces' end pieces meeting on the diagonal, kicked out and lifted; a middle one flares a little at its lifted ends.
  const G = T.skirtGroup, step = T.skirtStep.find(([n]) => floors <= n)[1], k = K.cornerKickM * .7, rise = T.skirtRiseM;
  const C = [[-a, -b], [a, -b], [a, b], [-a, b]], sides = C.map((p, s) => {
    const q = C[(s + 1) % 4], len = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    return { p, d, n: [d[1], -d[0]], len, groups: skirtGroups(len, G) };
  });
  // one roof (Codex 2차 검토: 판이 아니라 기와지붕으로): drawn instanced (2026-10-10 덕배: 미리 만든 모양을 위치에 놓기) — the
  // renderer holds one piece (skirtTemplate: 3 columns along the eave × G.rows wall → eave, and the eave's edge) and each
  // roof is a record of 32 bytes (skirtInst); the vertex shader (city_buildings.mjs VS_SKIRT) lays it out: the slope steep at
  // the wall, flattening out to an eave turned up a little (G.upK × its depth), the ends lifted more (G.liftM: a corner end,
  // another end). A corner end runs out along the diagonal, another flares past the wall line. Far: every third tier
  for (let f = step; f < floors; f += step) {
    const zi = T.podiumM + f * st + .15, far = (f / step) % 3 === 0;   // 멀리서는 세 단에 하나만 (2026-10-10 덕배: 줌 축소가 끊긴다)
    for (const { p, d, n, len, groups } of sides) for (const [x0, x1] of groups) {
      const c0 = x0 <= 1e-6, c1 = x1 >= len - 1e-6, o = c0 || c1 ? G.cornerOutM : G.outM, ck = o + k;
      const on0 = c0 ? ck : o, al0 = c0 ? ck : G.flareM, on1 = c1 ? ck : o, al1 = c1 ? ck : G.flareM;
      const w0 = [p[0] + d[0] * x0, p[1] + d[1] * x0, zi], w1 = [p[0] + d[0] * x1, p[1] + d[1] * x1, zi];
      const e0 = [w0[0] + n[0] * on0 - d[0] * al0, w0[1] + n[1] * on0 - d[1] * al0, zi - rise], e1 = [w1[0] + n[0] * on1 + d[0] * al1, w1[1] + n[1] * on1 + d[1] * al1, zi - rise];
      F.inst('skirt', skirtInst(F.at(w0), zi, F.angle(d), x1 - x0, x0, [on0, al0, on1, al1], c0 ? G.liftM[0] : G.liftM[1], c1 ? G.liftM[0] : G.liftM[1], o, slot), far, [w0, w1, e0, e1]);
    }
  }
  // the roofs on top
  if (a / b >= T.triRoofAspect) {   // 양 끝 지붕은 아래 모서리 처마 무리 위에(Codex 1차: 꼭대기 세 채를 아래 지붕 무리와 맞추기), 가운데는 그 사이
    const leg = clamp(G.cornerK * 2 * a, G.cornerM[0], G.cornerM[1]), ae = Math.max(2, leg / 2), xe = a - ae, am = Math.max(2, Math.min(a * .34, xe - ae - 1));
    giwaRoof(tb, F.shift(-xe, 0), ae, b, top, K, slot, { style: 'paljak' });
    giwaRoof(tb, F.shift(xe, 0), ae, b, top, K, slot, { style: 'paljak' });
    houseWalls(tb, F, am, b * .92, top - .2, top + 2.2, WALL.STOREY, K, r(6), 2.4);
    giwaRoof(tb, F, am, b * .92, top + 2.2, K, slot, { style: 'paljak' });
  } else giwaRoof(tb, F, a, b, top, K, slot, { style: 'paljak' });
}

// the wall round a court or a lot, a gate in the middle of the side `w.gate` (±y); each stretch drawn by the tile holding its
// middle, near zoom only (list 'hi': from afar the walls are under a pixel high and cost a third of the far triangles). 기와 담장 (plaster over stone, a tiled cap) or 돌담 (fieldstone, lower, thicker, no cap). Returns the stretches drawn
function walls(tb, at, mine, ux, uy, w, K) {
  const C = K.compound, W = tb.W, stone = w.stone, t = (stone ? K.lot.wallThickM : C.wallThickM) / 2, z = stone ? K.lot.stoneWallM : C.wallM;
  const { hx, hy } = w, gate = Math.min(C.gateM, hx) / 2, g = w.gate;
  const segs = [[[-hx, -g * hy], [hx, -g * hy]], [[hx, -hy], [hx, hy]], [[-hx, hy], [-hx, -hy]], [[-hx, g * hy], [-gate, g * hy]], [[gate, g * hy], [hx, g * hy]]];
  let n = 0;
  for (const [p, q] of segs) {
    const m = at((p[0] + q[0]) / 2, (p[1] + q[1]) / 2); if (!mine(m)) continue;
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l < .3) continue;
    const F = frame(tb, m, ux, uy), ex = (q[0] - p[0]) / l, ey = (q[1] - p[1]) / l, nx = -ey, ny = ex;   // in the stretch's own local terms (centred on m)
    const P = (s, d, zz) => { const x = (s - .5) * l, y = d; return [x * ex + y * nx, x * ey + y * ny, zz] };
    W.m = [0, 0, Math.min(255, Math.round((z + .35) * 10)), 0];
    W.kind = stone ? HANOK_KIND.STONE : HANOK_KIND.DAM; const lq = Math.min(65535, Math.round(l * 20)); W.w = [0, lq & 255, lq >>> 8, 0];
    const tz = stone ? z - .15 : z;   // 돌담: the top a little narrower and rounded off
    F.quad([P(0, t, 0), P(1, t, 0), P(1, t * (stone ? .75 : 1), tz), P(0, t * (stone ? .75 : 1), tz)], [nx, ny, 0], [0, l, l, 0], 'hi');
    F.quad([P(1, -t, 0), P(0, -t, 0), P(0, -t * (stone ? .75 : 1), tz), P(1, -t * (stone ? .75 : 1), tz)], [-nx, -ny, 0], [l, 0, 0, l], 'hi');
    F.quad([P(0, -t, 0), P(0, t, 0), P(0, t, z), P(0, -t, z)], [-ex, -ey, 0], undefined, 'hi');
    F.quad([P(1, t, 0), P(1, -t, 0), P(1, -t, z), P(1, t, z)], [ex, ey, 0], undefined, 'hi');
    if (stone) {   // the rounded top: two slopes up to the crest
      F.quad([P(0, t * .75, tz), P(1, t * .75, tz), P(1, 0, z), P(0, 0, z)], norm([nx, ny, 1.2]), [0, l, l, 0], 'hi');
      F.quad([P(1, -t * .75, tz), P(0, -t * .75, tz), P(0, 0, z), P(1, 0, z)], norm([-nx, -ny, 1.2]), [l, 0, 0, l], 'hi');
    } else {   // the 기와 cap
      W.kind = HANOK_KIND.ROOF; W.m[0] = 0; const c = t + .16, zc = z + .35, zo = z - .05;
      F.quad([P(0, c, zo), P(1, c, zo), P(1, 0, zc), P(0, 0, zc)], norm([nx * .35, ny * .35, c]), [0, l, l, 0], 'hi');
      F.quad([P(1, -c, zo), P(0, -c, zo), P(0, 0, zc), P(1, 0, zc)], norm([-nx * .35, -ny * .35, c]), [l, 0, 0, l], 'hi');
    }
    n++;
  }
  // 문간: two posts and a small tiled roof over the gate of a 기와 담장, drawn by the tile holding the gate
  const gm = at(0, g * hy);
  if (!stone && mine(gm)) {
    const G = C.gateRoof, F = frame(tb, gm, ux, uy), hw = G.widthM / 2, hd = G.depthM / 2, zt = G.heightM, Hq = Math.min(65535, Math.round((zt + 1) * 10));
    W.kind = HANOK_KIND.WALL; W.b[2] = 0; W.w = [0, 0, 0, 0]; W.m = [0, 0, Hq & 255, Hq >>> 8];
    for (const x of [-gate, gate]) box(F.shift(x, 0), .14, .14, 0, zt, false, null, 'hi');
    W.kind = HANOK_KIND.ROOF; W.m = [0, 0, Hq & 255, Hq >>> 8];
    for (const sd of [-1, 1]) F.quad([[-hw, sd * hd, zt], [hw, sd * hd, zt], [hw, 0, zt + .8], [-hw, 0, zt + .8]], norm([0, sd * .8, hd]), [-hw, hw, hw, -hw], 'hi');
    n++;
  }
  return n;
}

// 도시 엔진 부품 'hanok'(web/city/parts.mjs): 엔진은 이름으로 받는다 — 이 모듈을 부르면(메인: 모드 코드 받기, Worker: 정적 import) 등록된다
registerCityPart('hanok', { building: hanokBuilding, skirtTemplate, roofTemplate, boxTemplate });
