// 스타크래프트 종족 건물: 도시 엔진 부품 'race'(web/city/parts.mjs). 팩에 race({kind: 'terran' · 'zerg' · 'protoss'})가 있으면
// web/city/mesh.mjs 가 건물마다 이 부품을 부르고, 여기서 네모 빌딩 대신 원작 건물 모형(building_models.mjs, Codex 시안)을 세운다
// (행님 2026-10-22: 네모 건물에 색 · 뚜껑만 바꾸지 말고 진짜 스타크래프트 건물로). 못 지으면(타일에 잘린 건물, 고가가 지나는 건물,
// 너무 작거나 좁은 땅) false 를 돌려 보통 건물로 짓는다.
// 겹치지 않게: 모형은 윤곽 안에 들어가는 가장 큰 직사각형(긴 축 기준) 안에서만 — 넓으면 그 직사각형을 칸으로 나눠 칸마다 한 채, 밑에 종족 원판(race.pad).
// 모형 좌표: x ∈ [-1, 1](직사각형 긴 축), y ∈ [-1, 1](짧은 축), z 와 반지름은 s(직사각형 반 짧은 변, m) 단위.
// 칠은 도시 셰이더의 종류를 그대로 쓴다 — wall(벽, 재질 색 · 창 없음), roof(지붕 색), accent(경사면 KIND.PITCHED, 팩 buildings.house.roof.pitched.colors 3색),
// glow(KIND.SIGN, 팩 signs.colors 8색 — 밤에 스스로 빛남), metal(KIND.EQUIP 한 색, 가까이서만 자란다), trim(KIND.AWNING 3색, 가까이서만 자란다).
// 메인 스레드는 모드 코드 받기로, Worker 는 정적 import 로 이 모듈을 불러 등록한다.
import { registerCityPart } from '../../city/parts.mjs';
import { KIND } from '../../city/mesh.mjs';
import { orientedBox, pointInPolygon, deepestPoint, edgeDistance } from '../../city/geom.mjs';
import { BUILDING_MODELS } from './building_models.mjs';

const NO_AO = 8;   // (mesh.mjs FLAG.NO_AO)
const LOOK = { wall: KIND.WALL, roof: KIND.ROOF, accent: KIND.PITCHED, glow: KIND.SIGN, metal: KIND.EQUIP, trim: KIND.AWNING };
// 이보다 작은 땅 · 좁은 직사각형은 보통 건물로, 모형 바닥 높이(m — 원판 두께), 칸 반 변 목표 · 작은 칸 · 큰 건물 칸 기준(m), 빈 칸 비율
// 휴대폰(tb.opts.phone): 칸을 크게(cellMPhone — 한 땅에 짓는 채 수를 줄여 그리는 양을 줄인다, 2026-10-23 덕배: 휴대폰 버벅임)
// tinyHalfM: 휴대폰에서 이보다 좁은 칸은 작은 모형(TINY — 화면에서 몇 픽셀이라 원작 모형 대신 조각 두셋)
export const RACE_LIMITS = { minAreaM2: 30, minHalfM: 2.5, baseM: .08, cellM: 16, cellMPhone: 26, smallHalfM: 7, bigHalfM: 11, emptyCell: .12, tinyHalfM: 6 };

// 휴대폰 작은 칸의 모형(종족마다 둘): 조각 두셋으로 실루엣만 — 삼각형 30 안팎. 템플릿 번호는 그 종족 모형 목록 뒤에 이어 붙는다(Worker · 메인 같게)
export const TINY = {
  terran: [{ id: 'tinyDepot', build(M) { M.box(0, 0, .9, .85, 0, .55, { look: 'accent', slot: 0 }); M.box(.15, 0, .55, .5, .55, .8, { look: 'accent', slot: 1 }) } },
    { id: 'tinyBunker', build(M) { M.frustum(0, 0, .95, .6, 0, .6, { n: 6, sx: M.aspect, look: 'accent', slot: 0 }); M.box(0, 0, .25, .25, .6, .85, { look: 'accent', slot: 2 }) } }],
  zerg: [{ id: 'tinyMound', build(M) { M.frustum(0, 0, .95, .45, 0, .7, { n: 6, sx: M.aspect, look: 'accent', slot: 0 }); M.frustum(0, 0, .45, 0, .7, 1.1, { n: 4, look: 'accent', slot: 1 }) } },
    { id: 'tinyColony', build(M) { M.frustum(0, 0, .9, .7, 0, .35, { n: 6, sx: M.aspect, look: 'accent', slot: 2 }); M.frustum(0, 0, .55, 0, .35, .9, { n: 5, look: 'accent', slot: 0 }) } }],
  protoss: [{ id: 'tinyPylon', build(M) { M.box(0, 0, .8, .7, 0, .3, { look: 'accent', slot: 0 }); M.frustum(0, 0, .35, 0, .3, 1.3, { n: 4, rot: Math.PI / 4, look: 'glow', slot: 0 }) } },
    { id: 'tinyShrine', build(M) { M.frustum(0, 0, .9, .6, 0, .45, { n: 6, sx: M.aspect, look: 'accent', slot: 0 }); M.frustum(0, 0, .3, 0, .45, 1, { n: 4, look: 'glow', slot: 1 }) } }],
};

// 윤곽 안에 드는 직사각형(긴 축 = 감싸는 상자의 긴 축): 보통 건물(거의 네모)은 상자 가운데에서 조금만 줄이면 끝나고,
// 오목하거나 비뚠 땅은 가운데 몇 자리(상자 3×3 · 가장 깊은 점) × 가로세로 비 몇 가지에서 네 변의 점이 다 윤곽 안인 가장 큰 것
export function fitRect(outer, holes) {
  const obb = orientedBox(outer); if (!obb) return null;
  const { ux, uy } = obb, vx = -uy, vy = ux;
  const inside = (cx, cy, hx, hy) => {
    for (let i = 0; i <= 4; i++) for (const [a, b] of [[-1 + i / 2, -1], [-1 + i / 2, 1], [-1, -1 + i / 2], [1, -1 + i / 2]]) {
      if (!pointInPolygon(cx + ux * hx * a + vx * hy * b, cy + uy * hx * a + vy * hy * b, outer, holes)) return false;
    }
    return true;
  };
  // 가운데 (cx, cy), 상자 비율에서 x · y 를 fx · fy 배: 들어가는 가장 큰 배율(이분법)
  const grow = (cx, cy, fx, fy) => { let lo = 0, hi = .98; if (!inside(cx, cy, obb.hw * fx * .05, obb.hh * fy * .05)) return 0; lo = .05; for (let i = 0; i < 7; i++) { const k = (lo + hi) / 2; if (inside(cx, cy, obb.hw * fx * k, obb.hh * fy * k)) lo = k; else hi = k } return lo };
  let best = null;
  const take = (cx, cy, fx, fy) => { const k = grow(cx, cy, fx, fy); if (k <= 0) return; const hx = obb.hw * fx * k, hy = obb.hh * fy * k, a = hx * hy; if (!best || a > best.a) best = { cx, cy, hx, hy, a } };
  take(obb.cx, obb.cy, 1, 1);
  if (!best || best.hx < obb.hw * .8) {   // 네모가 아닌 땅
    const dp = deepestPoint(outer, holes), C = [[dp.x, dp.y]];
    for (const a of [-.5, 0, .5]) for (const b of [-.5, 0, .5]) C.push([obb.cx + ux * obb.hw * a + vx * obb.hh * b, obb.cy + uy * obb.hw * a + vy * obb.hh * b]);
    for (const [cx, cy] of C) { if (!pointInPolygon(cx, cy, outer, holes)) continue; for (const [fx, fy] of [[1, 1], [1, .6], [1, .35], [.6, 1], [.35, 1]]) take(cx, cy, fx, fy) }
  }
  if (!best) return null;
  return best.hx >= best.hy ? { ...best, ux, uy } : { cx: best.cx, cy: best.cy, hx: best.hy, hy: best.hx, a: best.a, ux: vx, uy: vy };   // 긴 축을 x 로
}

// 모형 하나를 직사각형에 맞춰 쓰는 도구(M)
export function modelBuilder(tb, ctx, unit, rect) {
  const mpu = tb.mPerUnit, W = tb.W, ch = ctx.chunk, u = tb.unit, keepM = W.m.slice(), keepB3 = W.b[3];
  const HX = rect.hx * mpu, HY = rect.hy * mpu, s = HY, z0 = ctx.minH + RACE_LIMITS.baseM;   // 반 긴 변 · 반 짧은 변(m), 모형 단위(m), 모형 바닥 높이
  const toTile = (x, y) => { const mx = x * HX, my = y * HY; return [rect.cx + (rect.ux * mx - rect.uy * my) / mpu, rect.cy + (rect.uy * mx + rect.ux * my) / mpu] };
  const clamp = v => Math.max(-1, Math.min(1, v));
  const set = (look, slot, zb) => {
    const kind = LOOK[look] ?? KIND.PITCHED; W.kind = kind; W.w = [0, 0, 0, 0]; W.b[3] = keepB3 | NO_AO;
    W.m[0] = look === 'wall' ? ctx.mat : look === 'roof' ? ctx.roofSlot : Math.max(0, slot | 0);
    W.m[1] = kind === KIND.SIGN ? Math.max(0, Math.min(255, Math.round(zb / .2))) : keepM[1];   // 간판 종류: 밑면 높이(가까이서 자라는 기준)
    return kind;
  };
  const normal = (a, b, c) => {   // (b − a) × (c − a), 타일 좌표는 m 로
    const ax = (b[0] - a[0]) * mpu, ay = (b[1] - a[1]) * mpu, az = b[2] - a[2], bx = (c[0] - a[0]) * mpu, by = (c[1] - a[1]) * mpu, bz = c[2] - a[2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz); return l > 1e-9 ? [nx / l, ny / l, nz / l] : null;
  };
  let verts = 0;
  // 면 하나(꼭짓점 3 · 4, [tx, ty, z]): o(타일 좌표 가운데)에서 멀어지는 쪽이 앞
  const face = (pts, o, look, slot, zb) => {
    let n = normal(pts[0], pts[1], pts[pts.length - 1]) || normal(pts[0], pts[1], pts[2]); if (!n) return;
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length - o[0], my = pts.reduce((a, p) => a + p[1], 0) / pts.length - o[1], mz = pts.reduce((a, p) => a + p[2], 0) / pts.length - o[2];
    if (n[0] * mx * mpu + n[1] * my * mpu + n[2] * mz < 0) n = n.map(v => -v);
    set(look, slot, zb); W.normal(n[0], n[1], n[2]);
    const idx = pts.map(p => W.v(p[0] * u, p[1] * u, p[2], zb)); verts += idx.length;
    for (const p of pts) tb.extend(ch, p[0] * u, p[1] * u, p[0] * u, p[1] * u, p[2]);
    if (idx.length === 3) ch.walls.push(idx[0], idx[1], idx[2]); else ch.walls.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
  };
  const capPoly = (ring, z, look, slot, zb, up = 1) => {   // 볼록 다각형 윗면(부채꼴)
    if (ring.length < 3) return;
    set(look, slot, zb); W.normal(0, 0, up); const base = ring.map(p => W.v(p[0] * u, p[1] * u, z, zb)); verts += base.length;
    for (let i = 1; i < ring.length - 1; i++) ch.walls.push(base[0], base[i], base[i + 1]);
  };
  // 모형 좌표의 다각형 두 개를 이은 옆면(+ 윗면)
  const loft = (p0, zA, p1, zB, { look = 'accent', slot = 0, top = true } = {}) => {
    const n = Math.min(p0.length, p1.length); if (n < 3 || !(zB >= zA)) return false;
    const a = p0.slice(0, n).map(([x, y]) => [...toTile(clamp(x), clamp(y)), z0 + zA * s]), b = p1.slice(0, n).map(([x, y]) => [...toTile(clamp(x), clamp(y)), z0 + zB * s]);
    const o = [...toTile(p0.reduce((t, p) => t + p[0], 0) / n, p0.reduce((t, p) => t + p[1], 0) / n), z0 + (zA + zB) / 2 * s], zb = z0 + zA * s;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, q = [a[i], a[j], b[j], b[i]];
      const degenTop = Math.hypot(b[j][0] - b[i][0], b[j][1] - b[i][1]) * mpu < 1e-4;
      face(degenTop ? [a[i], a[j], b[i]] : q, o, look, slot, zb);
    }
    if (top) capPoly(b, b[0][2], look, slot, zb);
    return true;
  };
  // 둥근 것의 반지름을 직사각형 안에 들게
  const fitR = (x, y, r, sx = 1) => Math.max(0, Math.min(r, (1 - Math.abs(x)) * HX / (s * sx), (1 - Math.abs(y)) * HY / s));
  const ngon = (x, y, r, n, rot, sx) => Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return [x + Math.cos(a) * r * sx * s / HX, y + Math.sin(a) * r * s / HY] });
  const M = {
    s, area: ctx.A, H: ctx.H, Hn: Math.max(0, ctx.H - ctx.minH) / s, aspect: HX / HY, half: [HX, HY],
    rand: k => unit(ctx.seed, 500 + k),
    loft,
    box(x, y, hx, hy, zA, zB, { rot = 0, look = 'accent', slot = 0 } = {}) {
      const c = Math.cos(rot), sn = Math.sin(rot), pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => { const px = hx * i * HX, py = hy * j * HY; return [x + (c * px - sn * py) / HX, y + (sn * px + c * py) / HY] });
      return loft(pts, zA, pts, zB, { look, slot, top: true });
    },
    frustum(x, y, r0, r1, zA, zB, { n = 8, rot = 0, sx = 1, look = 'accent', slot = 0, top = true } = {}) {
      const big = Math.max(r0, r1), k = big > 0 ? fitR(x, y, big, sx) / big : 0; if (k <= 0) return false;
      r0 *= k; r1 *= k;
      const lo = ngon(x, y, r0, n, rot, sx), hi = r1 > 1e-4 ? ngon(x, y, r1, n, rot, sx) : lo.map(() => [x, y]);
      return loft(lo, zA, hi, zB, { look, slot, top: top && r1 > 1e-4 });
    },
    dome(x, y, r, zA, h, { n = 10, rings = 4, sx = 1, rot = 0, look = 'accent', slot = 0, squash = 1 } = {}) {
      let ok = false; const f = t => Math.pow(Math.max(0, 1 - t * t), .5 / squash);
      for (let i = 0; i < rings; i++) { const t0 = i / rings, t1 = (i + 1) / rings; ok = M.frustum(x, y, r * f(t0), i === rings - 1 ? 0 : r * f(t1), zA + h * t0, zA + h * t1, { n, rot, sx, look, slot, top: false }) || ok }
      return ok;
    },
    get verts() { return verts },
  };
  return M;
}

// 종족 모형 고르기: 높은 건물엔 tall 모형만, 낮은 건물엔 그 밖의 것만, 넓이 · 비율이 맞는 것 중 weight 로
export function pickModel(list, { area, aspect, tall, r }) {
  const ok = list.filter(m => !!m.fit?.tall === tall && area >= (m.fit?.minArea ?? 0) && area <= (m.fit?.maxArea ?? Infinity) && aspect <= (m.fit?.maxAspect ?? Infinity));
  const pool = ok.length ? ok : list.filter(m => !!m.fit?.tall === tall); if (!pool.length) return null;
  const sum = pool.reduce((a, m) => a + (m.fit?.weight ?? 1), 0); let t = r * sum;
  for (const m of pool) { t -= m.fit?.weight ?? 1; if (t <= 0) return m }
  return pool[pool.length - 1];
}

// 서울을 대표하는 건물 자리(팩 race.keep [경도, 위도, 반지름 m])를 이 타일 단위로: [x, y, 반지름] — 타일마다 한 번
const MX = lng => lng / 360 + .5, MY = lat => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
function keeps(tb, R) {
  if (tb._raceKeep && tb._raceKeepOf === R.keep) return tb._raceKeep;
  const E = tb.E || 4096, out = [];
  for (const [lng, lat, rM] of R.keep || []) {
    const x = (MX(lng) - tb.ox) / tb.unit, y = (MY(lat) - tb.oy) / tb.unit, r = rM / tb.mPerUnit;
    if (x > -r - E && x < 2 * E + r && y > -r - E && y < 2 * E + r) out.push([x, y, r]);
  }
  tb._raceKeep = out; tb._raceKeepOf = R.keep; return out;
}

// 짓기: 땅 전체에 낮은 기단(지붕 색), 그 위 직사각형 안에 모형
export function building(tb, ctx, unit) {
  const R = tb.P.race, list = R && BUILDING_MODELS[R.kind]; if (!list?.length) return false;
  if (ctx.clipped || ctx.th || ctx.A < RACE_LIMITS.minAreaM2) return false;   // 타일에 잘린 건물 · 고가가 지나는 건물 · 아주 작은 건물: 보통 건물
  if (keeps(tb, R).some(([x, y, r]) => pointInPolygon(x, y, ctx.outer, ctx.holes) || edgeDistance(x, y, [ctx.outer]) <= r)) return false;   // 서울을 대표하는 건물: 원래 모양에 종족 색만
  const rect = fitRect(ctx.outer, ctx.holes); if (!rect || rect.hy * tb.mPerUnit < RACE_LIMITS.minHalfM) return false;
  // 높이는 따르지 않는다: 원작에는 고층 건물이 없다 — 높은 빌딩 자리도 원작 비율의 낮은 건물(행님 2026-10-22: 원작처럼 낮게).
  // 넓은 땅은 칸으로 나눠 건물 여러 채(행님 2026-10-22: 땅마다 건물 여러 채) — 칸 반 변이 약 cellM 이 되게, 많아야 4 × 3.
  // 휴대폰 메모리(행님 2026-10-22): 모형은 건물마다 꼭짓점을 쓰지 않고 기록 하나(40 바이트)만 남긴다 — 모양은 종족 템플릿(raceTemplates)을 같이 쓴다
  const mpu = tb.mPerUnit, u = tb.unit, T = raceTemplates(R), recs = tb.models || (tb.models = []);
  const cellM = tb.opts?.phone ? RACE_LIMITS.cellMPhone : RACE_LIMITS.cellM;
  const HX = rect.hx * mpu, HY = rect.hy * mpu, nx = Math.max(1, Math.min(4, Math.round(HX / cellM))), ny = Math.max(1, Math.min(3, Math.round(HY / cellM)));
  const vx = -rect.uy, vy = rect.ux, gap = nx * ny > 1 ? .84 : 1;   // 칸 사이 틈(한 채면 땅 전체)
  const W = tb.W, b = W.b, Hq = Math.min(65535, Math.round(ctx.H * 10));
  let built = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const seed = (ctx.seed ^ Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663)) >>> 0;
    if (nx * ny > 2 && unit(seed, 97) < RACE_LIMITS.emptyCell) continue;   // 가끔 빈 칸(마당)
    const ox = (-1 + (2 * i + 1) / nx) * rect.hx, oy = (-1 + (2 * j + 1) / ny) * rect.hy;
    const cell = { cx: rect.cx + rect.ux * ox + vx * oy, cy: rect.cy + rect.uy * ox + vy * oy, hx: rect.hx / nx * gap, hy: rect.hy / ny * gap, ux: rect.ux, uy: rect.uy };
    if (cell.hy > cell.hx) Object.assign(cell, { hx: cell.hy, hy: cell.hx, ux: vx, uy: vy });   // 긴 축을 x 로
    const area = 4 * cell.hx * cell.hy * mpu * mpu, half = cell.hy * mpu, aspect = cell.hx / cell.hy;
    const pool = half < RACE_LIMITS.smallHalfM ? list.filter(m => m.fit?.small) : nx * ny > 1 ? list.filter(m => !m.fit?.big || half >= RACE_LIMITS.bigHalfM) : list;
    const tiny = tb.opts?.phone && half < RACE_LIMITS.tinyHalfM && TINY[R.kind]?.length;   // 휴대폰 작은 칸: 작은 모형(그리는 양 — 2026-10-23)
    const model = tiny ? null : pickModel(pool.length ? pool : list, { area, aspect, tall: false, r: unit(seed, 499) }); if (!tiny && !model) continue;
    const t = tiny ? templateIndex(list.length + Math.floor(unit(seed, 496) * TINY[R.kind].length), aspect) : templateIndex(list.indexOf(model), aspect), hx = cell.hx * mpu, hy = cell.hy * mpu;
    // 기록: 템플릿 번호, 자리(타일 메르카토르) · 바닥 높이 · 긴 축, 반 길이 · 반 폭 · 높이 단위(m), 재질 · 지붕 색 · 높이(10 cm), 건물 바이트(씨앗 · 종류 · 그림자 없음)
    recs.push([t, cell.cx * u, cell.cy * u, ctx.minH, cell.ux, cell.uy, hx, hy, hy, ctx.mat, ctx.roofSlot, Hq & 255, Hq >>> 8, seed & 255, (seed >>> 8) & 255, b[2], b[3] | NO_AO]);
    const top = ctx.minH + T.tops[t] * hy, c = (a, d) => [(cell.cx + cell.ux * cell.hx * a + vx * cell.hy * d) * u, (cell.cy + cell.uy * cell.hx * a + vy * cell.hy * d) * u];
    for (const [a, d] of [[-1, -1], [1, 1]]) { const p = c(a, d); tb.extend(ctx.chunk, p[0], p[1], p[0], p[1], top) }
    built++;
  }
  return built > 0;
}

// 종족 템플릿: 모형마다 가로세로 비 BUCKETS 가지를 한 번만 지어 둔다(모형 좌표 — x · y 는 반 변으로 나눈 −1..1, z 와 바닥 높이는 높이 단위로 나눈 값).
// 꼭짓점 8 float: 자리 3 · 법선 3(모형 좌표로 — 인스턴스가 늘린 만큼 셰이더가 되돌린다) · 조각 바닥 높이 · 종류 × 16 + 색 칸. 색인은 전체 꼭짓점 번호(Uint32).
// 메인 스레드(그리기)와 Worker(기록 고르기)가 같은 목록 · 차례로 만들어 번호가 같다
export const BUCKETS = [1, 1.7, 2.8];
const TPL_S = 10, TEMPLATES = new Map(), EXTRA_MODELS = new Map();
// 다른 모드의 모형 목록도 같은 템플릿 · 인스턴스 그리기로(나라 모드 — web/modes/nations/models.mjs). 짓기(building)는 각자, 템플릿 번호는 같은 templateIndex
export function registerBuildingModels(kind, list) { if (BUILDING_MODELS[kind]) throw new Error(`모형 ${kind}: 스타크래프트 종족 이름과 겹침`); EXTRA_MODELS.set(kind, list) }
export const modelList = kind => BUILDING_MODELS[kind] || EXTRA_MODELS.get(kind) || [];
export const templateIndex = (mi, aspect) => { let bi = 0, bd = Infinity; BUCKETS.forEach((b, k) => { const d = Math.abs(Math.log(aspect / b)); if (d < bd) { bd = d; bi = k } }); return mi * BUCKETS.length + bi };
const tplHash = (h, k) => ((Math.imul(h ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b) >>> 8) / 16777216);
export function raceTemplates(R) {
  // R.lod 'low'(휴대폰 — buildings.mjs modelTemplate): 둥근 조각 면 6 · 돔 2단, 모형은 M.low 로 작은 장식을 뺄 수 있다. 템플릿 번호(모형 목록 · 차례)는 lod 와 상관없이 같다(Worker 기록이 맞게)
  const key = R.kind + '|' + JSON.stringify(R.pad || null) + '|' + (R.lod || ''); let T = TEMPLATES.get(key); if (T) return T;
  const list = modelList(R.kind), verts = [], idx = [], ranges = [], tops = [];
  [...list, ...(TINY[R.kind] || [])].forEach((model, mi) => BUCKETS.forEach((bk, bi) => {
    const HX = bk * TPL_S, HY = TPL_S, V = [], nrm = [0, 0, 1];
    const W = { n: 0, kind: 0, w: [0, 0, 0, 0], b: [0, 0, 0, 0], m: [0, 0, 0, 0], normal(x, y, z) { nrm[0] = x; nrm[1] = y; nrm[2] = z }, v(x, y, z, zb) { V.push([x, y, z, ...nrm, zb, this.kind, this.m[0]]); return this.n++ } };
    const ch = { walls: [], lo: [], hi: [] }, tb = { mPerUnit: 1, unit: 1, W, extend() {} };
    const ctx = { minH: -RACE_LIMITS.baseM, A: 4 * HX * HY, H: 10, seed: (0x5bd1e995 * (mi + 1) + bi * 977) >>> 0, chunk: ch, mat: 0, roofSlot: 0 };
    const M = modelBuilder(tb, ctx, tplHash, { cx: 0, cy: 0, hx: HX, hy: HY, ux: 1, uy: 0 });
    if (R.lod === 'low') { M.low = true; const fr = M.frustum, dm = M.dome; M.frustum = (x, y, r0, r1, zA, zB, o = {}) => fr(x, y, r0, r1, zA, zB, { ...o, n: Math.min(o.n || 8, 6) }); M.dome = (x, y, r, zA, h, o = {}) => dm(x, y, r, zA, h, { ...o, n: Math.min(o.n || 10, 6), rings: Math.min(o.rings || 4, 2) }) }
    if (R.pad) padOf(M, R.pad, tplHash(ctx.seed, 498));
    try { model.build(M) } catch (e) { console.warn('race template', R.kind, model.id, e) }
    const base = verts.length / 8, i0 = idx.length; let zmax = 0;
    for (const [x, y, z, nx, ny, nz, zb, kind, slot] of V) {
      const nl = Math.hypot(nx * HX, ny * HY, nz * TPL_S) || 1;
      verts.push(x / HX, y / HY, z / TPL_S, nx * HX / nl, ny * HY / nl, nz * TPL_S / nl, zb / TPL_S, kind * 16 + Math.min(15, slot)); zmax = Math.max(zmax, z);
    }
    for (const k of ch.walls) idx.push(base + k);
    ranges.push([i0, idx.length - i0]); tops.push(zmax / TPL_S);
  }));
  T = { verts: new Float32Array(verts), idx: new Uint32Array(idx), ranges, tops, key };
  TEMPLATES.set(key, T); return T;
}

// 건물 밑 원판: 칸을 거의 채우는 얇은 판(저그는 둥근 크립, 그 밖은 네모 판 · 팔각 판)
function padOf(M, pad, r) {
  const z1 = -RACE_LIMITS.baseM + .06 / M.s, o = { look: pad.look || 'accent', slot: pad.slot ?? 0 };
  if (pad.shape === 'blob') M.frustum(0, 0, 1.3, 1.2, -RACE_LIMITS.baseM / M.s, z1, { n: 12, sx: Math.min(1.8, M.aspect), rot: r * Math.PI, ...o });
  else if (pad.shape === 'octagon') M.frustum(0, 0, 1.25, 1.2, -RACE_LIMITS.baseM / M.s, z1, { n: 8, rot: Math.PI / 8, sx: Math.min(1.8, M.aspect), ...o });
  else M.box(0, 0, .97, .97, -RACE_LIMITS.baseM / M.s, z1, o);
}

registerCityPart('race', { building, templates: raceTemplates });
