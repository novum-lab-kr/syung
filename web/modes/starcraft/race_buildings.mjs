// 스타크래프트 종족 건물: 도시 엔진 부품 'race'(web/city/parts.mjs). 팩에 race({kind: 'terran' · 'zerg' · 'protoss'})가 있으면
// web/city/mesh.mjs 가 건물마다 이 부품을 부르고, 여기서 네모 빌딩 대신 원작 건물 모형(building_models.mjs, Codex 시안)을 세운다
// (행님 2026-10-22: 네모 건물에 색 · 뚜껑만 바꾸지 말고 진짜 스타크래프트 건물로). 못 지으면(타일에 잘린 건물, 고가가 지나는 건물,
// 너무 작거나 좁은 땅) false 를 돌려 보통 건물로 짓는다.
// 겹치지 않게: 땅(OSM 윤곽) 전체에는 낮은 기단만 깔고, 모형은 윤곽 안에 들어가는 가장 큰 직사각형(긴 축 기준) 안에서만 짓는다.
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
export const RACE_LIMITS = { minAreaM2: 30, minHalfM: 2.5, baseM: .3 };   // 이보다 작은 땅 · 좁은 직사각형은 보통 건물로, 기단 높이

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
  // 높이는 따르지 않는다: 원작에는 고층 건물이 없다 — 높은 빌딩 자리도 원작 비율의 낮은 건물(행님 2026-10-22: 원작처럼 낮게)
  const model = pickModel(list, { area: ctx.A, aspect: rect.hx / rect.hy, tall: false, r: unit(ctx.seed, 499) });
  if (!model) return false;
  const W = tb.W, keepM = W.m.slice(), keepB3 = W.b[3], ch = ctx.chunk, zb = ctx.minH + RACE_LIMITS.baseM;
  // 기단: 윤곽 옆면(창 없음)과 윗면
  tb.wallsOf(ctx, ctx.outer, ctx.minH, zb, true, true);
  tb.cap(ch.lo, ctx.outer, ctx.holes, zb, KIND.ROOF, ctx.roofSlot, 0); tb.cap(ch.hi, ctx.outer, ctx.holes, zb, KIND.ROOF, ctx.roofSlot, 0);
  model.build(modelBuilder(tb, ctx, unit, rect));
  W.m = keepM; W.b[3] = keepB3; W.kind = KIND.WALL; W.w = [0, 0, 0, 0];
  return true;
}

registerCityPart('race', { building });
