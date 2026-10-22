// 스타크래프트 종족 건물: 도시 엔진 부품 'race'(web/city/parts.mjs). 팩에 race({kind: 'terran' · 'zerg' · 'protoss'})가 있으면
// web/city/mesh.mjs 가 건물마다 이 부품을 부르고, 여기서 종족 모양(race_shapes.mjs)으로 짓는다. 못 지으면(타일에 잘린 건물,
// 고가가 지나는 건물, 너무 작거나 좁은 건물) false 를 돌려 보통 건물로 짓는다.
// 모양은 그 건물 윤곽 안에서만 짓는다(옆 건물과 겹치지 않게): 몸통은 윤곽 그대로 · 안으로 들인 고리, 둥근 것은 윤곽에 내접하는 원 안.
// 칠은 도시 셰이더의 종류를 그대로 쓴다 — wall(벽 · 창, 재질 색), roof(평지붕), accent(경사면 KIND.PITCHED, 팩 buildings.house.roof.pitched.colors 3색),
// glow(KIND.SIGN, 팩 signs.colors 8색 — 밤에 스스로 빛남), metal(KIND.EQUIP 한 색, 가까이서만 자란다), trim(KIND.AWNING 3색, 가까이서만 자란다).
// 메인 스레드는 모드 코드 받기로, Worker 는 정적 import 로 이 모듈을 불러 등록한다.
import { registerCityPart } from '../../city/parts.mjs';
import { KIND } from '../../city/mesh.mjs';
import { insetRing, orientedBox, deepestPoint } from '../../city/geom.mjs';
import { RACE_SHAPES } from './race_shapes.mjs';

const NO_AO = 8;   // (mesh.mjs FLAG.NO_AO)
const LOOK = { wall: KIND.WALL, roof: KIND.ROOF, accent: KIND.PITCHED, glow: KIND.SIGN, metal: KIND.EQUIP, trim: KIND.AWNING };
export const RACE_LIMITS = { minAreaM2: 30, minRadiusM: 2, maxVerts: 6000 };   // 이보다 작은 건물은 보통 건물로, 한 건물의 꼭짓점 상한

// 건물 하나의 짓기 도구(로컬 좌표: 미터, 원점 = 윤곽에서 가장 깊은 점, x = 긴 축, y = 그 직각, z = 땅에서 위로)
export function raceBuilder(tb, ctx, unit) {
  const mpu = tb.mPerUnit, W = tb.W, ch = ctx.chunk, u = tb.unit;
  const dp = deepestPoint(ctx.outer, ctx.holes), obb = orientedBox(ctx.outer); if (!obb || !(dp.d > 0)) return null;
  const ux = obb.ux, uy = obb.uy, cx = dp.x, cy = dp.y;
  const toTile = (x, y) => [cx + (ux * x - uy * y) / mpu, cy + (uy * x + ux * y) / mpu];
  const n0 = W.n;
  // 꼭짓점 하나를 쓰고 색 · 종류를 맞춘다
  const set = (look, slot, z0) => {
    const kind = LOOK[look] ?? KIND.PITCHED; W.kind = kind; W.w = [0, 0, 0, 0];
    W.m[0] = look === 'wall' ? ctx.mat : look === 'roof' ? ctx.roofSlot : Math.max(0, slot | 0);
    if (kind === KIND.SIGN) W.m[1] = Math.max(0, Math.min(255, Math.round(z0 / .2)));   // 간판 종류: 밑면 높이(가까이서 자라는 기준)
  };
  const keepM = W.m.slice(), keepB3 = W.b[3];
  const vert = (p, z, u0) => W.v(p[0] * u, p[1] * u, z, u0);
  const grow = (p, z) => tb.extend(ch, p[0] * u, p[1] * u, p[0] * u, p[1] * u, z);
  // 미터 거리 → 법선(타일 좌표 방향)
  const normal = (a, b, c) => {   // a, b, c: [tx, ty, z] — (b − a) × (c − a)
    const ax = (b[0] - a[0]) * mpu, ay = (b[1] - a[1]) * mpu, az = b[2] - a[2], bx = (c[0] - a[0]) * mpu, by = (c[1] - a[1]) * mpu, bz = c[2] - a[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
  };
  // 사각 면(a b c d — 아래 둘, 위 둘 순), 바깥쪽 o(타일 좌표의 중심)에서 멀어지는 쪽이 앞
  const face = (pts, o, look, slot, z0) => {
    let n = normal(pts[0], pts[1], pts[pts.length - 1]);
    if (!Number.isFinite(n[0]) || Math.hypot(n[0], n[1], n[2]) < .5) n = normal(pts[0], pts[1], pts[2]);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length - o[0], my = pts.reduce((s, p) => s + p[1], 0) / pts.length - o[1];
    if (n[0] * mx + n[1] * my < 0 && Math.abs(n[2]) < .999) n = n.map(v => -v);
    set(look, slot, z0); W.normal(n[0], n[1], n[2]); W.b[3] = keepB3 | NO_AO;
    const idx = pts.map(p => vert(p, p[2], z0)); for (const p of pts) grow(p, p[2]);
    if (idx.length === 3) ch.walls.push(idx[0], idx[1], idx[2]); else ch.walls.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
  };
  const B = {
    A: ctx.A, H: ctx.H, minH: ctx.minH, type: ctx.T.key, seed: ctx.seed,
    r: dp.d * mpu,                                  // 윤곽에 내접하는 원의 반지름(m) — 원점 둘레 이 안이면 윤곽 안
    len: obb.hw * mpu, wid: obb.hh * mpu,           // 윤곽을 감싸는 상자의 반 길이 · 반 폭(m, 긴 축 x)
    off: [(obb.cx - cx) * mpu * ux + (obb.cy - cy) * mpu * uy, -(obb.cx - cx) * mpu * uy + (obb.cy - cy) * mpu * ux],   // 그 상자 가운데(로컬 m)
    rand: k => unit(ctx.seed, 300 + k),             // 이 건물의 고정 난수 0..1
    // 몸통: 윤곽(inset m 만큼 안으로 들인 고리)의 벽 z0..z1. windows=false 면 창 없는 벽. 못 들이면 false
    body(z0, z1, { inset = 0, windows = true } = {}) {
      const ring = inset > 0 ? insetRing(ctx.outer, inset / mpu) : ctx.outer; if (!ring || z1 <= z0) return false;
      W.m = keepM.slice(); W.b[3] = keepB3;
      tb.wallsOf(ctx, ring, z0, z1, true, !windows); if (!inset) for (const h of ctx.holes) tb.wallsOf(ctx, h, z0, z1, false, !windows);
      return true;
    },
    // 평지붕: 윤곽(안으로 들인 고리)을 z 에. hole 이 있으면 그 안쪽 고리(holeInset m)를 뚫는다(층계 턱)
    roof(z, { inset = 0, holeInset = null, look = 'roof', slot = 0 } = {}) {
      const ring = inset > 0 ? insetRing(ctx.outer, inset / mpu) : ctx.outer; if (!ring) return false;
      const hole = holeInset != null ? insetRing(ctx.outer, holeInset / mpu) : null, holes = hole ? [hole] : inset ? [] : ctx.holes;
      W.m = keepM.slice(); W.b[3] = keepB3;
      const kind = LOOK[look] ?? KIND.ROOF, pick = look === 'roof' ? ctx.roofSlot : slot;
      tb.cap(ch.lo, ring, holes, z, kind, pick, 0); tb.cap(ch.hi, ring, holes, z, kind, pick, 0);
      for (let i = 0; i < ring.length; i += 2) grow([ring[i], ring[i + 1]], z);
      return true;
    },
    // 윤곽을 따라 비스듬한 띠: z0 에서 in0 m 들인 고리 → z1 에서 in1 m 들인 고리(둔덕 · 경사 기단 · 지붕 테)
    taper(z0, z1, in0, in1, { look = 'accent', slot = 0 } = {}) {
      const a = in0 > 0 ? insetRing(ctx.outer, in0 / mpu) : ctx.outer, b = in1 > 0 ? insetRing(ctx.outer, in1 / mpu) : ctx.outer;
      if (!a || !b || a.length !== b.length) return false;
      const n = a.length / 2, o = [cx, cy];
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; face([[a[i * 2], a[i * 2 + 1], z0], [a[j * 2], a[j * 2 + 1], z0], [b[j * 2], b[j * 2 + 1], z1], [b[i * 2], b[i * 2 + 1], z1]], o, look, slot, z0) }
      return true;
    },
    // 정다각형 기둥 · 뿔대(로컬 x, y 가운데, 아래 반지름 r0 · 위 r1, sx 는 x 쪽 늘림, rot 는 돌림 rad). 윤곽 안에 들게 줄인다. top: 윗면 닫기
    frustum(x, y, r0, r1, z0, z1, { n = 8, rot = 0, sx = 1, look = 'accent', slot = 0, top = true } = {}) {
      const room = B.r - Math.hypot(x, y), big = Math.max(r0, r1) * Math.max(1, sx); if (room <= .2 || z1 <= z0) return false;
      const k = big > room ? room / big : 1; r0 *= k; r1 *= k;
      const ring = (r, z) => Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n, t = toTile(x + Math.cos(a) * r * sx, y + Math.sin(a) * r); return [t[0], t[1], z] });
      const lo = ring(r0, z0), hi = ring(r1, z1), o = toTile(x, y);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (r1 > 1e-4) face([lo[i], lo[j], hi[j], hi[i]], o, look, slot, z0); else face([lo[i], lo[j], [o[0], o[1], z1]], o, look, slot, z0) }
      if (top && r1 > 1e-4) for (let i = 1; i < n - 1; i++) { set(look, slot, z0); W.normal(0, 0, 1); const a = vert(hi[0], z1, z0), b = vert(hi[i], z1, z0), c = vert(hi[i + 1], z1, z0); ch.walls.push(a, b, c) }
      return true;
    },
    // 둥근 지붕 · 알: 가운데 (x, y), 반지름 r, 밑 z0, 높이 h, rings 층으로 깎은 반구(squash: 위로 갈수록 얼마나 빨리 좁아지나, 1 = 구)
    dome(x, y, r, z0, h, { n = 10, rings = 4, sx = 1, rot = 0, look = 'accent', slot = 0, squash = 1 } = {}) {
      let ok = false;
      for (let i = 0; i < rings; i++) {
        const t0 = i / rings, t1 = (i + 1) / rings, f = t => Math.pow(Math.max(0, 1 - t * t), .5 / squash);
        ok = B.frustum(x, y, r * f(t0), i === rings - 1 ? 0 : r * f(t1), z0 + h * t0, z0 + h * t1, { n, rot, sx, look, slot, top: false }) || ok;
      }
      return ok;
    },
    // 상자(로컬 가운데 x, y, 반 길이 hx · 반 폭 hy, 돌림 rot) — 윤곽 안에 들게 줄인다
    box(x, y, hx, hy, z0, z1, { rot = 0, look = 'metal', slot = 0 } = {}) {
      const room = B.r - Math.hypot(x, y), big = Math.hypot(hx, hy); if (room <= .1 || z1 <= z0) return false;
      const k = big > room ? room / big : 1; hx *= k; hy *= k;
      const c = toTile(x, y), a = rot, bux = Math.cos(a) * ux - Math.sin(a) * uy, buy = Math.cos(a) * uy + Math.sin(a) * ux;
      const kind = LOOK[look] ?? KIND.EQUIP; set(look, slot, z0); W.b[3] = keepB3;
      tb.box(ch, c[0], c[1], bux, buy, hx / mpu, hy / mpu, z0, z1, kind, W.m[0], ch.walls);
      return true;
    },
    get verts() { return W.n - n0 },
    done() { W.m = keepM.slice(); W.b[3] = keepB3; W.kind = KIND.WALL; W.w = [0, 0, 0, 0] },
  };
  return B;
}

// 짓기: 모양 함수가 false 를 돌려주면 보통 건물로 — 그때는 아무것도 쓰기 전에 돌려줘야 한다(race_shapes.mjs)
export function building(tb, ctx, unit) {
  const R = tb.P.race, shape = R && RACE_SHAPES[R.kind]; if (!shape) return false;
  if (ctx.clipped || ctx.th || ctx.A < RACE_LIMITS.minAreaM2) return false;   // 타일에 잘린 건물 · 고가가 지나는 건물 · 아주 작은 건물: 보통 건물
  const B = raceBuilder(tb, ctx, unit); if (!B || B.r < RACE_LIMITS.minRadiusM) return false;
  const built = shape(B, R) !== false; B.done(); return built;
}

registerCityPart('race', { building });
