// 랜드마크 전용 모델 (데이터: web/city/landmarks_data.mjs). 롯데월드타워, 그리고 조선 모드의 석탑(원각사지 십층석탑 · 불국사 삼층석탑).
//
// 심시티 · 조선 모드에서만 그린다(롤코에선 이 자리가 놀이기구 탑: coaster_towers.json).
// 심시티: 은청색 유리에 흰 금속 세로줄, 솔기 모서리는 어두운 홈, 꼭대기는 솔기 선에서 두 갈래로 갈라진 격자 왕관(밤에 빛남).
// 조선: 같은 몸에 나무 기둥 · 보와 회벽, 다섯 층마다 기와 처마를 두른 거대한 목탑. 두 갈래 꼭대기는 금색.
// 멀리서도 롯데타워로 읽히게 윤곽(가는 몸 · 볼록한 테이퍼 · 갈라진 꼭대기)을 지키고, 세로줄은 성기고 진하게(Codex 검토, 2026-10-09).
// 지역 미터 좌표(city_life 의 MERC_ORIGIN · MU)에 짓고, 고가와 같은 캔버스 · 깊이에 그린다.
import { LANDMARKS, STUPAS } from './landmarks_data.mts';
import type { Landmark, Stupa } from './landmarks_data.mts';
import { monumentsInView } from './monuments_data.mts';
import { cityMinZoom } from './zoom_gate.mts';
import { MU, MERC_ORIGIN as O, toM } from './life.mts';
import { compileProgram } from './traffic.mts';

type Pt = number[];   // 점 [x, y, z, …] — 고리 점은 넷째 칸에 둘레 몫
type Theme = 'light' | 'dark';
type LookKey = 'glass' | 'frame' | 'seamC' | 'crownC' | 'win' | 'wood' | 'plaster' | 'giwa' | 'gold' | 'dan' | 'green' | 'blue' | 'stoneB';
type TowerUniform = 'u_matrix' | 'u_mu' | 'u_at' | 'u_rot' | 'u_light' | 'u_lit' | 'u_night' | 'u_woodTower' | 'u_split' | 'u_lattice' | 'u_H' | `u_${LookKey}`;
type StupaUniform = 'u_matrix' | 'u_mu' | 'u_scale' | 'u_wmul' | 'u_at' | 'u_rot' | 'u_light' | 'u_stone' | 'u_lit' | 'u_night' | 'u_H0' | 'u_relief';
type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;
interface GLMesh { va:WebGLVertexArrayObject; b:WebGLBuffer; n:number }
// 그릴 탑 하나(meshes: 모양(look)마다 메시) · 석탑 하나(H: 이번 장면의 높이 · mesh: 셰이더 탑 메시)
interface TowerItem { L:Landmark; x:number; y:number; rot:[number, number]; meshes:Record<string, GLMesh | undefined> }
interface StupaItem { T:Stupa; x:number; y:number; lat:number; rot:[number, number]; mesh:(GLMesh & { h:number }) | null; H?:number }
// three.js 석탑(web/city/stupa3d.mts Stupa3D) — 이 파일이 부르는 것만
interface Stupa3DLayer {
  models:Record<string, { userData:{ height:number } }>; init(gl:WebGL2RenderingContext):void; has(kind:string):boolean; build(kind:string):void;
  render(gl:WebGL2RenderingContext, items:{ kind:string; M:Float32Array }[], opts:{ light:number[]; lit:number[]; dark:boolean }):void; dispose():void;
}
// render 가 받는 값(map/overlay.mjs 가 넘긴다)
interface LandmarkRenderOptions { zoom?:number; dark?:boolean; look?:string; sun?:{ azimuth:number; elevation:number } | null; lit?:number[]; phone?:boolean }

const N = 56;              // 평면 둘레 점 수(솔기 홈 점 제외)
const STRIDE = 9;          // x y z · 법선 xyz · 둘레 몫 s(0…1, 솔기 0 · .5) · 종류(0 몸 · 1 갈라진 안쪽 면 · 2 윗면 · 3 기와 처마) · 처마 안 몫

// 높이 h 에서의 [솔기 방향 반대각선, 다른 방향 비]: 표의 점 사이를 부드럽게(단조 3차)
function profileAt(P:Landmark['profile'], h:number):[number, number] {
  if (h <= P[0]![0]) return [P[0]![1], P[0]![2]];
  for (let i = 1; i < P.length; i++) if (h <= P[i]![0]) {
    const a = P[i - 1]!, b = P[i]!, t = (h - a[0]!) / (b[0]! - a[0]!), s = t * t * (3 - 2 * t);
    return [a[1]! + (b[1]! - a[1]!) * s, a[2]! + (b[2]! - a[2]!) * s];
  }
  const e = P[P.length - 1]!; return [e[1]!, e[2]!];
}
// 평면의 점(탑 좌표: u 솔기 방향, v 그 수직): 초타원, 솔기 모서리(φ 0 · π)는 홈을 판다. φ ∈ [0, 2π)
function planPoint(L:Landmark, r:number, k:number, phi:number):[number, number] {
  const n = L.roundness, c = Math.cos(phi), s = Math.sin(phi), e = 2 / n;
  let u = r * Math.sign(c) * Math.abs(c) ** e, v = r * k * Math.sign(s) * Math.abs(s) ** e;
  const W = L.seam.widthM / 2, D = L.seam.depthM;
  if (Math.abs(v) < W && Math.abs(u) > r * .5) u -= Math.sign(u) * D * (1 - Math.abs(v) / W) ** .5;   // 홈
  return [u, v];
}

// 탑 하나의 메시(지역 미터, 탑 가운데 기준 · 회전 전): Float32Array. look: 'tower'(유리 탑) · 'wood-tower'(나무 · 회벽 · 기와 처마 — 모드 설정 city.landmarks)
export function buildTower(L:Landmark, { look = 'tower' } = {}):Float32Array {
  const wood = look === 'wood-tower';   // 나무 탑(조선): 나무 기둥 · 회벽 · 기와 처마
  const d:number[] = [], H = L.height, C = L.crown, P = L.profile;
  const push = (p:Pt, n:Pt, s:number, kind:number, w = 0) => d.push(p[0]!, p[1]!, p[2]!, n[0]!, n[1]!, n[2]!, s, kind, w);
  const quad = (a:Pt, b:Pt, c:Pt, e:Pt, n:Pt, s:number[], kind:number) => { for (const [p, q] of [[a, s[0]!], [b, s[1]!], [c, s[2]!], [a, s[0]!], [c, s[2]!], [e, s[3]!]] as const) push(p, n, q, kind) };
  // 높이 고리: 아래는 촘촘히(테이퍼가 완만), 꼭대기는 갈라짐 시작에 맞춰
  const hs:number[] = []; for (let h = 0; h < H; h += h < 300 ? 9 : 6) hs.push(h); hs.push(C.splitM); hs.push(H); hs.sort((a, b) => a - b);
  const levels = [...new Set(hs.map(h => Math.round(h * 10) / 10))];
  const gapAt = (h:number) => h <= C.splitM ? 0 : C.gapTopM * ((h - C.splitM) / (H - C.splitM)) ** 1.2;
  // 고리 점: half 0 → 한 바퀴(갈라지기 전), half ±1 → 한쪽 반(v 쪽)과 자른 면, 틈만큼 밀어 냄
  const ring = (h:number, half:number):Pt[] => {
    const [r0, k] = profileAt(P, h), g = gapAt(h) / 2, out:Pt[] = [], tt = Math.max(0, (h - C.splitM) / (H - C.splitM)), r = r0 * (1 - .3 * tt * tt);   // 두 귀: 끝으로 갈수록 가늘게
    if (!half) { for (let i = 0; i < N; i++) { const phi = i / N * 2 * Math.PI; out.push([...planPoint(L, r, k, phi), h, i / N]) } return out }
    const a0 = half > 0 ? 0 : Math.PI;
    for (let i = 0; i <= N / 2; i++) { const phi = a0 + i / (N / 2) * Math.PI, [u, v] = planPoint(L, r, k, phi); out.push([u, half > 0 ? Math.max(v, 0) + g : Math.min(v, 0) - g, h, (a0 + i / (N / 2) * Math.PI) / (2 * Math.PI)]) }
    return out;   // 첫 점과 끝 점은 자른 선(v = ±g) 위
  };
  const sideNormal = (a:Pt, b:Pt, a2:Pt) => {   // 바깥쪽 법선: 둘레 방향 × 위
    const tx = b[0]! - a[0]!, ty = b[1]! - a[1]!, ux = a2[0]! - a[0]!, uy = a2[1]! - a[1]!, uz = a2[2]! - a[2]!;
    let nx = ty * uz - 0 * uy, ny = 0 * ux - tx * uz, nz = tx * uy - ty * ux; const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
  };
  const band = (lo:Pt[], hi:Pt[], closed:boolean, kind = 0) => {
    const m = lo.length;
    for (let i = 0; i < (closed ? m : m - 1); i++) {
      const j = (i + 1) % m, a = lo[i]!, b = lo[j]!, c = hi[j]!, e = hi[i]!;
      let n = sideNormal(a, b, e); if (n[0]! * (a[0]! + b[0]!) + n[1]! * (a[1]! + b[1]!) < 0) n = n.map(x => -x);
      const sb = closed && j === 0 ? 1 : b[3]!;
      quad(a, b, c, e, n, [a[3]!, sb, sb, a[3]!], kind);
    }
  };
  for (let li = 0; li + 1 < levels.length; li++) {
    const h0 = levels[li]!, h1 = levels[li + 1]!;
    if (h1 <= C.splitM) band(ring(h0, 0), ring(h1, 0), true);
    else for (const half of [1, -1]) {
      const lo = ring(h0, half), hi = ring(h1, half); band(lo, hi, false);
      // 자른 면(두 갈래 사이 틈을 보는 안쪽 면): 반의 첫 점 ~ 끝 점
      const a = lo[lo.length - 1]!, b = lo[0]!, c = hi[0]!, e = hi[hi.length - 1]!, n = [0, -half, 0];
      quad(a, b, c, e, n, [.25, .25, .25, .25], 1);
    }
  }
  // 윗면: 두 갈래 각각 부채꼴로 덮는다
  for (const half of [1, -1]) {
    const top = ring(H, half), cx = top.reduce((s, p) => s + p[0]!, 0) / top.length, cy = top.reduce((s, p) => s + p[1]!, 0) / top.length;
    for (let i = 0; i < top.length; i++) { const a = top[i]!, b = top[(i + 1) % top.length]!; push([cx, cy, H], [0, 0, 1], 0, 2); push(a, [0, 0, 1], 0, 2); push(b, [0, 0, 1], 0, 2) }
  }
  // 조선: 다섯 층(약 21 m)마다 기와 처마. 벽에서 밖으로 내밀며 내려가고, 모서리(솔기 · 다른 대각)는 들린다
  if (wood) {
    for (let h = 34; h < C.splitM - 20; h += 42) {   // 열 층(약 42 m)마다, 위로 갈수록 짧게(촘촘한 고리는 훌라후프처럼 보였다: Codex 검토)
      const [r] = profileAt(P, h), out = Math.max(2.6, r * .15) * (1 - .4 * h / H), drop = out * .55, lo = ring(h, 0);   // (2026-10-11 행님: 더 조선 건물답게 — 처마를 더 깊게, 귀를 더 들어 올린다)
      const outer = lo.map(p => { const l = Math.hypot(p[0]!, p[1]!) || 1, corner = Math.abs(Math.cos(2 * p[3]! * 2 * Math.PI)) ** 6; return [p[0]! + p[0]! / l * out * (1 + .6 * corner), p[1]! + p[1]! / l * out * (1 + .6 * corner), h - drop + corner * drop * 2.4, p[3]!] });
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N, a = lo[i]!, b = lo[j]!, c = outer[j]!, e = outer[i]!, sb = j === 0 ? 1 : b[3]!;
        const n = (() => { const ax = b[0]! - a[0]!, ay = b[1]! - a[1]!, bx = e[0]! - a[0]!, by = e[1]! - a[1]!, bz = e[2]! - a[2]!; let nx = ay * bz, ny = -ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; return nz < 0 ? [-nx, -ny, -nz] : [nx, ny, nz] })();
        for (const [p, q, w] of [[a, a[3]!, 0], [b, sb, 0], [c, sb, 1], [a, a[3]!, 0], [c, sb, 1], [e, a[3]!, 1]] as const) push(p, n, q, 3, w);
        for (const [p, q, w] of [[a, a[3]!, 0], [c, sb, 1], [b, sb, 0], [a, a[3]!, 0], [e, a[3]!, 1], [c, sb, 1]] as const) push(p, n.map(x => -x), q, 3, w);   // 밑면(처마 안)
      }
    }
  }
  if (wood) {   // 두 귀 꼭대기: 기와를 얹은 모임지붕, 그 위 금빛 찰주와 보주(넓은 금판 대신 — 목탑 상륜)
    for (const half of [1, -1]) {
      const top = ring(H, half), cx = top.reduce((s, p) => s + p[0]!, 0) / top.length, cy = top.reduce((s, p) => s + p[1]!, 0) / top.length;
      const eave = top.map(p => [cx + (p[0]! - cx) * 1.35, cy + (p[1]! - cy) * 1.35, H - 2.5, p[3]!]), apex = [cx, cy, H + 9];
      for (let i = 0; i < eave.length; i++) { const a = eave[i]!, b = eave[(i + 1) % eave.length]!; const n = (() => { const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, vx = apex[0]! - a[0]!, vy = apex[1]! - a[1]!, vz = apex[2]! - a[2]!; let nx = uy * vz, ny = -ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; return nz < 0 ? [-nx / l, -ny / l, -nz / l] : [nx / l, ny / l, nz / l] })();
        push(a, n, a[3]!, 3, 1); push(b, n, b[3]!, 3, 1); push(apex, n, a[3]!, 3, 0);
        for (const p of [a, top[(i + 1) % top.length]!, b]) push(p, [0, 0, -1], a[3]!, 3, 0); push(a, [0, 0, -1], a[3]!, 3, 0); push(top[i]!, [0, 0, -1], a[3]!, 3, 0); push(top[(i + 1) % top.length]!, [0, 0, -1], a[3]!, 3, 0) }   // 처마 밑
      const R = 1.1; for (let k = 0; k < 8; k++) { const a0 = k / 8 * 2 * Math.PI, a1 = (k + 1) / 8 * 2 * Math.PI, A = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], B = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)], n = [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0];
        quad([...A, H + 7], [...B, H + 7], [...B, H + 24], [...A, H + 24], n, [0, 0, 0, 0], 2) }   // 찰주
      for (const [z0, z1, r0, r1] of [[H + 12, H + 13.5, 2.6, 2.6], [H + 16, H + 17.5, 2.2, 2.2], [H + 20, H + 21.2, 1.8, 1.8], [H + 24, H + 26.5, 1.6, 2.2], [H + 26.5, H + 30, 2.2, .3]] as const)   // 보륜 셋 · 보주
        for (let k = 0; k < 8; k++) { const a0 = k / 8 * 2 * Math.PI, a1 = (k + 1) / 8 * 2 * Math.PI, n = [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), .3];
          quad([cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0), z0], [cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1), z0], [cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1), z1], [cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0), z1], n, [0, 0, 0, 0], 2) }
    }
  }
  return new Float32Array(d);
}

// ── 석탑(조선 모드): 원각사지 십층석탑 · 불국사 삼층석탑 ──────────────────────────────────────────────────────────────
// 실제 치수(m)로 짓고 그릴 때 높이에 맞춰 키운다. 정점: x y z · 법선 xyz · 종류(0 몸돌 · 1 낙수면 · 2 지붕돌 밑 · 층급받침 · 3 상륜 · 4 기단 · 5 처마 끝) · 면 좌표 uv(3)
const SQ = (h:number):number[][] => [[h, -h], [h, h], [-h, h], [-h, -h]];
const AH = (h:number, n:number):number[][] => [[h, -h + n], [h, h - n], [h - n, h - n], [h - n, h], [-h + n, h], [-h + n, h - n], [-h, h - n], [-h, -h + n], [-h + n, -h + n], [-h + n, -h], [h - n, -h], [h - n, -h + n]];   // 亞자: 네모의 네 귀를 따낸 꼴
const OCT = (r:number):number[][] => Array.from({ length: 8 }, (_, i) => { const a = (i + .5) / 8 * 2 * Math.PI; return [r * Math.cos(a), r * Math.sin(a)] });
// 변을 m 조각으로 나누고, 꼭짓점에 가까울수록 1(지붕돌 귀를 들어 올릴 몫)
function subdiv(poly:number[][], m:number):Pt[] { const out:Pt[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; for (let k = 0; k < m; k++) { const t = k / m; out.push([a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, Math.abs(2 * t - 1) ** 3]) } } return out }
export function buildStupa(kind:string):{ data:Float32Array; height:number } {
  const d:number[] = [];
  // 정점마다 면 좌표 uv: x 그 면 안 가로(0~1) · y 위로(0~1) · z 둘레 몫(0~1) — 셰이더가 기둥 · 이음 · 기와골을 새긴다
  const put = (p:Pt, n:Pt, k:number, t:Pt) => d.push(p[0]!, p[1]!, p[2]!, n[0]!, n[1]!, n[2]!, k, t[0]!, t[1]!, t[2]!);
  const tri = (a:Pt, b:Pt, c:Pt, k:number, up:number | null = null, ta:Pt = [.5, 1, 0], tb = ta, tc = ta) => {   // 법선: 바깥(가운데 축에서 먼 쪽) 또는 위 · 아래로
    const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!, vx = c[0]! - a[0]!, vy = c[1]! - a[1]!, vz = c[2]! - a[2]!;
    let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    if (up != null) { if (Math.sign(n[2] || up) !== up) n = n.map(x => -x) } else { const cx = (a[0]! + b[0]! + c[0]!) / 3, cy = (a[1]! + b[1]! + c[1]!) / 3; if (n[0]! * cx + n[1]! * cy < 0) n = n.map(x => -x) }
    put(a, n, k, ta); put(b, n, k, tb); put(c, n, k, tc);
  };
  // 두 고리(같은 점 수) 사이 옆면 + (원하면) 윗면 · 밑면. seg: 한 면을 몇 조각으로 나눴나(지붕돌 4 — 면 좌표는 원래 변 하나 기준)
  const loft = (lo:Pt[], hi:Pt[], k:number, { top = null, bottom = null, seg = 1 }:{ top?:number | null; bottom?:number | null; seg?:number } = {}) => {
    const m = lo.length;
    for (let i = 0; i < m; i++) { const j = (i + 1) % m, u0 = (i % seg) / seg, u1 = u0 + 1 / seg, p0 = i / m, p1 = (i + 1) / m;
      tri(lo[i]!, lo[j]!, hi[j]!, k, null, [u0, 0, p0], [u1, 0, p1], [u1, 1, p1]); tri(lo[i]!, hi[j]!, hi[i]!, k, null, [u0, 0, p0], [u1, 1, p1], [u0, 1, p0]) }
    if (top != null) { const z = hi.reduce((s, p) => s + p[2]!, 0) / m; for (let i = 0; i < m; i++) tri([0, 0, z], hi[i]!, hi[(i + 1) % m]!, top, 1, [.5, 1, -1]) }
    if (bottom != null) { const z = lo.reduce((s, p) => s + p[2]!, 0) / m; for (let i = 0; i < m; i++) tri([0, 0, z], lo[(i + 1) % m]!, lo[i]!, bottom, -1, [.5, 0, -1]) }
  };
  const ring = (poly:number[][], z:number):Pt[] => poly.map(p => [p[0]!, p[1]!, z]);
  const prism = (poly:number[][], z0:number, z1:number, k:number, caps:{ top?:number | null; bottom?:number | null } = { top: k }) => loft(ring(poly, z0), ring(poly, z1), k, caps);
  // 지붕돌: 귀가 들린 두툼한 판(옆 · 밑) + 위로 좁아지는 낙수면(윗면)
  const roof = (poly:number[][], z:number, e:number, rise:number, topPoly:number[][], lift:number) => {
    const sd = subdiv(poly, 8), up = (q:Pt) => q[2]! * lift;
    const lo = sd.map(q => [q[0]!, q[1]!, z + up(q)]), hi = sd.map(q => [q[0]!, q[1]!, z + e + up(q)]);
    loft(lo, hi, 5, { bottom: 2, seg: 8 });   // 5: 지붕돌 옆(처마 끝)
    // 낙수면: 처마에서 위로 오목하게(두 단 — 처마 쪽은 완만하게 펴지고 위로 갈수록 가파르게)
    const tq = subdiv(topPoly, 8), mid = sd.map((q, i) => { const t = tq[i]!; return [q[0]! * .45 + t[0]! * .55, q[1]! * .45 + t[1]! * .55, z + e + rise * .3 + up(q) * .35] });
    loft(hi, mid, 1, { seg: 8 }); loft(mid, tq.map(q => [q[0]!, q[1]!, z + e + rise]), 1, { top: 1, seg: 8 });
  };
  let z = 0;
  if (kind === 'wongaksa') {
    for (const [h, t, n] of [[2.7, .5, .55], [2.35, .5, .48], [2, .5, .42]] as const) { prism(AH(h, n), z, z + t, 4); z += t; prism(AH(h + .15, n), z, z + .12, 4, { top: 1, bottom: 2 }); z += .12 }   // 亞자 기단 3단과 갑석
    for (let i = 0; i < 10; i++) {
      const b = 1.45 - i * .085, bh = .82 - i * .04, P = i < 3 ? ((r:number) => AH(r, r * .3)) : SQ;   // 아래 세 층은 亞자, 위 일곱 층은 네모
      prism(P(b), z, z + bh, 0); z += bh;
      const nb = 1.45 - (i + 1) * .085; roof(P(b * 1.4), z, .14, .24, P(i < 9 ? nb * .95 : b * .7), .16 * b * 1.4); z += .14 + .24;
    }
    for (const [r, t] of [[.35, .25], [.25, .3], [.3, .08], [.16, .15], [.3, .08], [.16, .15], [.3, .08]] as const) { prism(OCT(r), z, z + t, 3); z += t }   // 상륜: 받침 · 보륜
    loft(ring(OCT(.2), z), ring(OCT(.05), z + .4), 3, { top: 3 }); z += .4;   // 보주
  } else {   // 불국사 삼층석탑(석가탑)
    prism(SQ(2.3), z, z + .9, 4); z += .9; loft(ring(SQ(2.45), z), ring(SQ(2.45), z + .15), 4, { bottom: 2 }); loft(ring(SQ(2.45), z + .15), ring(SQ(1.95), z + .26), 1, { top: 1 }); z += .26;   // 아래 기단
    prism(SQ(1.75), z, z + 1.25, 4); z += 1.25; loft(ring(SQ(1.9), z), ring(SQ(1.9), z + .15), 4, { bottom: 2 }); loft(ring(SQ(1.9), z + .15), ring(SQ(1.25), z + .26), 1, { top: 1 }); z += .26;   // 위 기단
    const B = [[1.08, 1.3], [.95, .62], [.84, .55]] as const;
    B.forEach(([b, bh], i) => {
      prism(SQ(b), z, z + bh, 0); z += bh;
      for (let k = 0; k < 4; k++) { const r = b * (1.06 + k * .12); prism(SQ(r), z, z + .07, 2, { bottom: 2 }); z += .07 }   // 층급받침 네 단
      const R = b * 1.62, nb = i < 2 ? B[i + 1]![0] : b * .55; roof(SQ(R), z, .16, .45, SQ(nb * .95), .12 * R); z += .16 + .45;
    });
    prism(SQ(.42), z, z + .25, 3); z += .25;                                                  // 노반
    loft(ring(OCT(.38), z), ring(OCT(.3), z + .22), 3, { top: 3 }); z += .22;                 // 복발
    loft(ring(OCT(.25), z), ring(OCT(.38), z + .2), 3, { top: 3 }); z += .2;                  // 앙화
    for (let k = 0; k < 3; k++) { prism(OCT(.3), z, z + .06, 3); z += .06; prism(OCT(.12), z, z + .14, 3); z += .14 }   // 보륜
    prism(OCT(.06), z, z + .6, 3); z += .6; loft(ring(OCT(.12), z), ring(OCT(.02), z + .25), 3, { top: 3 }); z += .25;   // 찰주 · 보주
  }
  return { data: new Float32Array(d), height: z };
}
const STUPA_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in float a_kind; layout(location=3) in vec3 a_uv;
uniform mat4 u_matrix; uniform float u_mu, u_scale, u_wmul; uniform vec2 u_at, u_rot;
out vec3 v_n, v_uv, v_p; out float v_kind, v_h;
void main(){
  v_uv = a_uv; v_p = a_pos;
  vec3 p = vec3(a_pos.xy * u_scale * u_wmul, a_pos.z * u_scale); vec2 q = vec2(p.x * u_rot.x - p.y * u_rot.y, -(p.x * u_rot.y + p.y * u_rot.x));
  v_n = vec3(a_nrm.x * u_rot.x - a_nrm.y * u_rot.y, -(a_nrm.x * u_rot.y + a_nrm.y * u_rot.x), a_nrm.z); v_kind = a_kind; v_h = a_pos.z;
  gl_Position = u_matrix * vec4((u_at + q) * u_mu, p.z * u_mu, 1.);
}`;
const STUPA_FS = `#version 300 es
precision highp float; in vec3 v_n, v_uv, v_p; in float v_kind, v_h; uniform vec3 u_light, u_stone; uniform vec2 u_lit; uniform float u_night, u_H0, u_relief;
out vec4 o;
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float line(float x, float at, float w){ return 1. - smoothstep(0., w, abs(x - at)); }
void main(){
  vec3 n = normalize(v_n); float d = max(dot(n, u_light), 0.), sky = .5 + .5 * n.z, side = 1. - abs(n.z);
  float k = v_kind, uf = v_uv.x, vv = v_uv.y, per = v_uv.z, aw = max(fwidth(uf), 1e-4), vw = max(fwidth(vv), 1e-4);
  vec3 c = u_stone * (k > 4.5 ? .9 : k > 3.5 ? .94 : k > 2.5 ? .84 : k > 1.5 ? .6 : k > .5 ? .86 : 1.);   // 지붕돌 옆 · 기단 · 상륜 · 지붕돌 밑(그늘) · 낙수면 · 몸돌
  // 돌결: 덩어리마다 조금씩 다른 밝기, 아래로 흘러내린 얼룩
  c *= .95 + .08 * hash(floor(v_p.xy * 1.7) + floor(v_p.z * 1.3) * 7.1);
  if ((k < .5 || (k > 3.5 && k < 4.5)) && side > .5) {
    // 우주(모서리 기둥) · 탱주(기단 가운데 기둥): 살짝 밝게 도드라지고 테두리는 홈
    float e = .085, pil = max(1. - smoothstep(e - aw, e, uf), smoothstep(1. - e, 1. - e + aw, uf));
    if (k > 3.5) pil = max(pil, 1. - smoothstep(.04 - aw, .04, abs(uf - .5)));
    c *= 1. + .07 * pil;
    float groove = max(line(uf, e, aw * 1.6), line(uf, 1. - e, aw * 1.6)); if (k > 3.5) groove = max(groove, max(line(uf, .46, aw * 1.6), line(uf, .54, aw * 1.6)));
    c *= 1. - .3 * groove;
    c *= 1. - .25 * max(line(vv, .02, vw * 1.5), line(vv, .98, vw * 1.5));   // 위아래 이음
    if (k < .5) {
      c *= mix(1., .62, smoothstep(.62, 1., vv));   // 지붕돌 밑 그늘
      // 원각사지 몸돌 부조(감실 안 부처 · 보살): 가운데 판을 오목하게, 둥근 감실 테두리와 앉은 형상 그림자
      if (u_relief > .5 && uf > .14 && uf < .86 && vv > .12 && vv < .82) {
        vec2 q = vec2((uf - .5) / .36, (vv - .12) / .7);
        float arch = q.y < .62 ? abs(q.x) : length(vec2(q.x, (q.y - .62) / .38 * .9));
        c *= mix(.86, 1., smoothstep(.96, 1.02, arch));                                // 오목한 감실
        c *= 1. - .3 * line(arch, .98, .05);                                            // 감실 테두리
        float fig = length(vec2(q.x * 1.6, (q.y - .3) * 1.2)), head = length(vec2(q.x * 3.2, (q.y - .7) * 3.));
        c *= 1. - .18 * (1. - smoothstep(.45, .6, fig)) - .16 * (1. - smoothstep(.4, .55, head));   // 앉은 몸 · 머리
      }
    }
  }
  if (k > .5 && k < 1.5 && per >= 0.) {   // 낙수면: 기와골(둘레 따라 촘촘히), 귀마루는 밝게, 처마 끝은 어두운 선
    float g = abs(fract(per * 96.) - .5) * 2., gw = max(fwidth(per * 96.), 1e-3) * 2.;
    c *= 1. - .16 * (1. - smoothstep(.35 - gw, .35 + gw, g));
    float ridge = 0.; for (int i = 0; i < 4; i++) ridge = max(ridge, line(per, float(i) * .25, max(fwidth(per), 1e-4) * 3.));
    c = mix(c, u_stone * 1.08, ridge * .7);
    c *= 1. - .3 * line(vv, 0., vw * 2.);
  }
  if (k > 4.5) c *= 1. - .35 * line(vv, .5, vw * 2.5);   // 처마 끝 두 겹(내민 판의 홈)
  if (k > 1.5 && k < 2.5) c *= .9 + .1 * hash(floor(v_p.xy * 4.));   // 층급받침 · 지붕돌 밑
  float lt = u_lit.x * (.72 + .28 * sky) + u_lit.y * d;
  vec3 col = c * lt;
  if (u_night > .5) {   // 밤: 달빛에 어둡게, 아래에서 비추는 따뜻한 조명(문화재 야간 조명)이 위로 갈수록 옅게
    float rel = clamp(v_h / u_H0, 0., 1.);
    col = c * lt * .45 + c * vec3(1., .8, .58) * (.55 * exp(-rel * 2.4) * (.35 + .65 * side) + (k > 1.5 && k < 2.5 ? .0 : .05));
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`;
const STONE:Record<string, Record<Theme, string>> = { wongaksa: { light: '#E6E3DB', dark: '#DCD7CC' }, seokga: { light: '#CFC6B5', dark: '#C8BFAE' } };   // 대리석 · 화강암

const VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in vec3 a_m;
uniform mat4 u_matrix; uniform float u_mu; uniform vec2 u_at, u_rot;
out vec3 v_n; out vec3 v_p; out vec3 v_m;
void main(){
  // 탑 좌표(u 솔기 방향, v 그 왼쪽) → 동 · 북으로 돌리고, 지역 미터(y 남쪽)로 뒤집는다
  vec2 q = vec2(a_pos.x * u_rot.x - a_pos.y * u_rot.y, -(a_pos.x * u_rot.y + a_pos.y * u_rot.x));
  v_n = vec3(a_nrm.x * u_rot.x - a_nrm.y * u_rot.y, -(a_nrm.x * u_rot.y + a_nrm.y * u_rot.x), a_nrm.z); v_p = a_pos; v_m = a_m;
  gl_Position = u_matrix * vec4((u_at + q) * u_mu, a_pos.z * u_mu, 1.);
}`;
const FS = `#version 300 es
precision highp float; in vec3 v_n; in vec3 v_p; in vec3 v_m; uniform vec3 u_light; uniform vec2 u_lit; uniform float u_night, u_woodTower, u_split, u_lattice, u_H;
uniform vec3 u_glass, u_frame, u_seamC, u_crownC, u_wood, u_plaster, u_giwa, u_gold, u_win, u_dan, u_green, u_blue, u_stoneB;
out vec4 o;
float pint(float x,float a,float b){float f=floor(x),r=x-f;return f*(b-a)+clamp(r-a,0.0,b-a);}
float pulse(float x,float a,float b,float w){w=max(w,1e-4);return (pint(x+w*.5,a,b)-pint(x-w*.5,a,b))/w;}
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
void main(){
  vec3 n = normalize(v_n); float d = max(dot(n, u_light), 0.), light = u_lit.x + u_lit.y * (.5 + .5 * d);
  float s = v_m.x, kind = v_m.y, z = v_p.z, ws = fwidth(s), wz = fwidth(z);
  float seam = 1. - smoothstep(.006, .012 + ws, min(min(abs(s), abs(s - .5)), abs(s - 1.)));   // 솔기 모서리(둘레 몫 0 · .5)
  vec3 col;
  if (kind > 2.5) {   // 조선 기와 처마: 기와 골(둘레 방향), 끝은 흰 와구토
    float g = pulse(s * 220., 0., .35, ws * 220.);
    col = u_giwa * (1. - .25 * g) * light; if (v_m.z > .9) col = mix(col, vec3(.9, .88, .82) * light, .7);
  } else if (kind > 1.5) {   // 윗면
    col = (u_woodTower > .5 ? u_gold : u_frame * .9) * light;
  } else if (u_woodTower > .5) {   // 조선 몸: 붉은 기둥(주칠) · 층 보 · 회벽에 창호 살, 처마 밑 공포 · 단청 띠, 처마 위 난간, 돌 기단(2026-10-11 행님: 더 조선 건물답게)
    float zz = mod(z - 34., 42.), top = u_split - 18.;
    if (z < 12.) {   // 돌 기단: 다듬은 화강암 마름돌
      vec2 st = vec2(s * 120. + floor(z / 1.5) * .5, z / 1.5); float j = max(pulse(st.x, 0., .06, ws * 120.), pulse(st.y, 0., .08, wz / 1.5));
      col = u_stoneB * (.92 + .1 * hash(floor(st))) * light * (1. - .35 * j);
    } else if (z > 20. && zz > 35.2 && z < top) {   // 처마 밑: 아래 창방(녹색 띠에 단청 머리초) · 위 공포(층층이 내민 나무 블록)
      float t = (zz - 35.2) / 6.8;
      if (t < .38) { float m = fract(s * 48.); col = u_green * light; col = mix(col, u_blue * light, step(.38, abs(m - .5)) * .8); col = mix(col, u_dan * light, pulse(s * 48., .1, .16, ws * 48.)); col = mix(col, vec3(.92, .9, .84) * light, pulse(s * 192., .45, .55, ws * 192.) * step(.15, t) * step(t, .25)); }
      else { float blk = pulse(s * 144., 0., .55, ws * 144.), tier = pulse((t - .38) / .62 * 3., 0., .7, wz / 6.8 * 3. / .62); col = mix(u_green * .55, mix(u_green, u_dan, step(.5, fract(s * 72.))) * 1.05, blk * tier) * light; }
    } else if (z > 34. && zz < 2.6 && z < top + 6.) {   // 처마 위 난간: 붉은 난간동자 · 위 난간대
      float bal = pulse(s * 240., 0., .3, ws * 240.), rail = step(.78, zz / 2.6);
      col = mix(u_wood * .45 * light, u_dan * light, max(bal, rail));
    } else {   // 몸: 회벽 · 창호(살 무늬, 밤엔 몇 칸 창호지 불빛) · 붉은 기둥 · 짙은 보
      float post = pulse(s * 48., 0., .14, ws * 48.), beam = pulse(z / 4.2, 0., .12, wz / 4.2);
      vec2 cell = vec2(floor(s * 48.), floor(z / 4.2));
      bool lit = u_night > .5 && hash(cell) < .35;
      float lat = max(pulse(s * 48. * 4., 0., .12, ws * 192.), pulse(z / 4.2 * 3., 0., .12, wz / 1.4)) * step(.25, fract(z / 4.2)) * step(fract(z / 4.2), .9);   // 창호 살
      col = (lit ? u_win * 1.2 : u_plaster * light);
      col = mix(col, (lit ? u_win * .55 : u_wood * light), lat * .55);
      col = mix(col, u_wood * light, beam);
      col = mix(col, u_dan * light, post);
    }
    col = mix(col, u_wood * .6 * light, seam);
  } else {   // 심시티 몸: 은청색 유리, 흰 금속 세로줄(성기고 진하게), 옅은 층 줄, 솔기 홈은 어둡게
    float sky = .5 + .5 * n.z;
    col = u_glass * (light * .85 + .25 * sky);
    float mull = pulse(s * 64., 0., .16, ws * 64.), floorL = pulse(z / 4.3, 0., .08, wz / 4.3);
    if (u_night > .5) { vec2 cell = vec2(floor(s * 128.), floor(z / 4.3)); col = u_glass * .4 + (hash(cell) < .16 ? u_win * (.35 + .25 * hash(cell + 7.)) : vec3(0.)); }   // 밤: 몇 칸만 은은하게
    col = mix(col, u_frame * light * (u_night > .5 ? .35 : 1.), mull * .75);
    col = mix(col, col * .82, floorL);
    col = mix(col, u_seamC * light, seam * .55);
    // 왕관: 갈라지는 높이 아래부터 대각 격자, 그 사이 밝은 유리(밤엔 빛남)
    float cr = smoothstep(u_lattice - 60., u_lattice + 10., z) * .9;   // 몸통에서 왕관으로 서서히(뚝 끊기지 않게)
    if (cr > 0.) {
      float a = s * 40. + z / 9., b = s * 40. - z / 9.;
      float lat = max(pulse(a, 0., .18, fwidth(a)), pulse(b, 0., .18, fwidth(b)));
      vec3 c2 = mix(u_crownC * (u_night > .5 ? 1.4 : light), u_frame * light, lat);
      col = mix(col, c2, cr);
    }
  }
  if (kind > .5 && kind < 1.5) col = (u_woodTower > .5 ? u_wood * .5 : u_crownC * .55) * light * (u_night > .5 && u_woodTower < .5 ? 2.2 : 1.);   // 두 갈래 사이 안쪽 면
  o = vec4(clamp(col, 0., 1.), 1.);
}`;
const hex = (h:string) => { const v = parseInt(h.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255] };
const LOOK:Record<Theme, Record<LookKey, string>> = {
  light: { glass: '#C4D3DD', frame: '#F4F6F6', seamC: '#2E3A44', crownC: '#EEF5F8', win: '#FFE9B8', wood: '#5A3E2B', plaster: '#ECE4D2', giwa: '#4A5459', gold: '#D9A43A', dan: '#9C3B2C', green: '#3E7A66', blue: '#2F5A86', stoneB: '#B9B2A4' },
  dark: { glass: '#3B4C5C', frame: '#C9D2D8', seamC: '#141B22', crownC: '#BFE3FF', win: '#FFD08A', wood: '#3E2A1E', plaster: '#8E897C', giwa: '#2C3336', gold: '#C08A2A', dan: '#6E2A20', green: '#2A5446', blue: '#203E5C', stoneB: '#6E6A62' },   // dan 주칠 · green 뇌록 · blue 단청 청 · stoneB 기단 돌
};

export class CityLandmarks {
  // 필드는 선언만(declare — 실행 코드 없음, 값은 constructor · init · render 가 넣는다)
  declare gl:WebGL2RenderingContext | null; declare items:TowerItem[] | null; declare broken:boolean; declare MT:Float32Array;
  declare p:WebGLProgram; declare u:Uniforms<TowerUniform>; declare pS:WebGLProgram; declare uS:Uniforms<StupaUniform>; declare stupas:StupaItem[];
  declare mon:import('./monuments.mts').Monuments | null | undefined; declare monp:Promise<void> | null | undefined; declare monFail:boolean | undefined; declare monMT:Float32Array | undefined; monGen = 0;   // monGen: 모델 코드 받기의 세대(문화유산 모드를 나가면 올려 받던 것을 무효로 한다)
  declare s3:Stupa3DLayer | null | undefined; declare s3p:Promise<void> | null | undefined; declare s3fail:boolean | undefined;
  constructor() { this.gl = null; this.items = null; this.broken = false; this.MT = new Float32Array(16) }
  init(gl:WebGL2RenderingContext):void {
    this.gl = gl; this.p = compileProgram(gl, VS, FS);
    this.u = Object.fromEntries((['u_matrix', 'u_mu', 'u_at', 'u_rot', 'u_light', 'u_lit', 'u_night', 'u_woodTower', 'u_split', 'u_lattice', 'u_H', 'u_glass', 'u_frame', 'u_seamC', 'u_crownC', 'u_wood', 'u_plaster', 'u_giwa', 'u_gold', 'u_win', 'u_dan', 'u_green', 'u_blue', 'u_stoneB'] as const).map(n => [n, gl.getUniformLocation(this.p, n)])) as Uniforms<TowerUniform>;
    this.items = LANDMARKS.map(L => { const [x, y] = toM(L.lngLat[0], L.lngLat[1]), a = L.seamDeg * Math.PI / 180; return { L, x, y, rot: [Math.cos(a), Math.sin(a)], meshes: {} } });
    this.pS = compileProgram(gl, STUPA_VS, STUPA_FS);
    this.uS = Object.fromEntries((['u_matrix', 'u_mu', 'u_scale', 'u_wmul', 'u_at', 'u_rot', 'u_light', 'u_stone', 'u_lit', 'u_night', 'u_H0', 'u_relief'] as const).map(n => [n, gl.getUniformLocation(this.pS, n)])) as Uniforms<StupaUniform>;
    this.stupas = STUPAS.map(T => { const [x, y] = toM(T.lngLat[0], T.lngLat[1]), a = (T.yawDeg || 0) * Math.PI / 180; return { T, x, y, lat: T.lngLat[1], rot: [Math.cos(a), Math.sin(a)], mesh: null } });
  }
  mesh(it:TowerItem, look:string):GLMesh {
    const k = look; if (it.meshes[k]) return it.meshes[k];
    const gl = this.gl!, data = buildTower(it.L, { look }), va = gl.createVertexArray(), b = gl.createBuffer();
    gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    for (const [loc, n, off] of [[0, 3, 0], [1, 3, 3], [2, 3, 6]] as const) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE * 4, off * 4) }
    gl.bindVertexArray(null); return (it.meshes[k] = { va, b, n: data.length / STRIDE });
  }
  render(gl:WebGL2RenderingContext, matrix:ArrayLike<number>, opts:LandmarkRenderOptions = {}):void {
    if (this.broken) return;
    try { if (!this.gl) this.init(gl); this._render(gl, matrix, opts) }
    catch (e) { this.broken = true; console.error('city-landmarks: off —', e) }
  }
  // 문화유산 모드를 나가면 모델 · 나무 GPU 자원을 치우고 받던 코드도 무효로 한다(다시 들어오면 새로 받는다)
  releaseMonuments():void {
    this.monGen++; this.monp = null;
    if (this.mon) { this.mon.dispose(); this.mon = null }
  }
  // 우리나라 문화유산 모델(광화문 · 궁장 · 동상 …): 어느 모드에서나 같은 모델 · 같은 실물 색으로 그린다(2026-10-31 사용자 결정 — 모드 설정 · 스타일이 덮지 못한다).
  // 이 길은 탑(render)과 따로다: 선로 종류(track.kind)와 상관없이 부르고, 보이는 자리에 들어올 때 코드를 받는다. 못 받으면 그 층만 빠진다
  renderMonuments(gl:WebGL2RenderingContext, matrix:ArrayLike<number>, { zoom = 15, dark = false, sun = null, lit = [.64, .36], bounds, phone = false, center = [126.978, 37.5665] }:{ zoom?:number; dark?:boolean; phone?:boolean; center?:[number, number]; sun?:{ azimuth:number; elevation:number } | null; lit?:number[]; bounds:[number, number, number, number] }):void {
    if (this.monFail || zoom < cityMinZoom(phone) || !monumentsInView(bounds)) return;   // 다른 건물과 같은 줌에서 함께 사라진다
    if (!this.mon) {
      if (!this.monp) { const gen = this.monGen; this.monp = import('./monuments.mts').then(m => { if (gen !== this.monGen) { this.monp = null; return } const layer = new m.Monuments(); layer.init(gl); layer.onLoad = repaint; this.mon = layer; this.monp = null; repaint() }).catch(e => { this.monFail = true; console.warn('city-landmarks: 기념물 못 받음 —', e) }) }
      return;
    }
    const MT = (this.monMT ??= new Float32Array(16)); for (let i = 0; i < 16; i++) MT[i] = matrix[i]!; for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r]! * O.x + matrix[4 + r]! * O.y + matrix[12 + r]!;
    const az = (sun?.azimuth ?? 225) * Math.PI / 180, el = Math.max(sun?.elevation ?? 42, 12) * Math.PI / 180;
    this.mon.render(gl, MT, { light: [Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)], lit, dark, zoom, phone, center });
    gl.bindVertexArray(null); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  _render(gl:WebGL2RenderingContext, matrix:ArrayLike<number>, { zoom = 15, dark = false, look = 'tower', sun = null, lit = [.64, .36], phone = false }:LandmarkRenderOptions):void {
    const wood = look === 'wood-tower';   // 나무 탑(조선): 나무 기둥 · 회벽 · 기와 처마
    if (zoom < 11) return;
    const MT = this.MT; for (let i = 0; i < 16; i++) MT[i] = matrix[i]!; for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r]! * O.x + matrix[4 + r]! * O.y + matrix[12 + r]!;
    const az = (sun?.azimuth ?? 225) * Math.PI / 180, el = Math.max(sun?.elevation ?? 42, 12) * Math.PI / 180, C = LOOK[dark ? 'dark' : 'light'], u = this.u;
    gl.useProgram(this.p); gl.uniformMatrix4fv(u.u_matrix, false, MT); gl.uniform1f(u.u_mu, MU);
    gl.uniform3f(u.u_light, Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)); gl.uniform2fv(u.u_lit, lit);
    gl.uniform1f(u.u_night, dark ? 1 : 0); gl.uniform1f(u.u_woodTower, wood ? 1 : 0);
    for (const k of ['glass', 'frame', 'seamC', 'crownC', 'win', 'wood', 'plaster', 'giwa', 'gold', 'dan', 'green', 'blue', 'stoneB'] as const) gl.uniform3fv(u['u_' + k as TowerUniform], hex(C[k]));
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    for (const it of this.items!) {
      if (STUPAS.some(T => T.replaces === it.L.id && T.looks.includes(look))) continue;   // 조선: 롯데타워 자리는 거대한 석탑
      const m = this.mesh(it, look), L = it.L;
      gl.uniform2f(u.u_at, it.x, it.y); gl.uniform2fv(u.u_rot, it.rot); gl.uniform1f(u.u_split, L.crown.splitM); gl.uniform1f(u.u_lattice, L.crown.latticeFromM); gl.uniform1f(u.u_H, L.height);
      gl.bindVertexArray(m.va); gl.drawArrays(gl.TRIANGLES, 0, m.n);
    }
    // 석탑(모양이 맞을 때만): 실제 치수 메시를 높이에 맞춰 키운다. minPx 가 있으면 화면에서 그만큼은 보이게.
    // 데스크톱은 three.js 디테일 모델(web/city/stupa3d.mts — 조선 모드에서만 받는다, 화면에 들어온 탑만 짓는다), 휴대폰 · 받는 중 · 실패면 아래 셰이더 탑
    if (this.s3 && look !== 'wood-tower') { this.s3.dispose(); this.s3 = null; this.s3p = null }   // 조선을 나가면 three 자원을 치운다
    const S0 = this.stupas.filter(it => it.T.looks.includes(look)), use3 = !phone && !this.s3fail && S0.length > 0, three:StupaItem[] = [];
    if (use3 && !this.s3p) this.s3p = import('./stupa3d.mts').then(m => { if (!this.gl) return; const s3 = new m.Stupa3D() as unknown as Stupa3DLayer; s3.init(this.gl); this.s3 = s3; repaint() }).catch(e => { this.s3fail = true; console.warn('city-landmarks: 3D 석탑 못 받음 —', e) });
    let built = false;
    const S = S0.filter(it => {
      const mpp = 40075016.686 * Math.cos(it.lat * Math.PI / 180) / (512 * 2 ** zoom); it.H = Math.max(it.T.height, (it.T.minPx || 0) * mpp);
      const X = it.x * MU, Y = it.y * MU, Z = it.H * .5 * MU, w = MT[3]! * X + MT[7]! * Y + MT[11]! * Z + MT[15]!;   // 화면 밖이면 건너뛴다(그 탑 가운데가 넉넉한 화면 상자 밖)
      if (w <= 0) return false; const cx = (MT[0]! * X + MT[4]! * Y + MT[8]! * Z + MT[12]!) / w, cy = (MT[1]! * X + MT[5]! * Y + MT[9]! * Z + MT[13]!) / w; if (Math.abs(cx) > 2.5 || Math.abs(cy) > 2.5) return false;
      if (!use3 || !this.s3) return true;
      if (!this.s3.has(it.T.kind)) { if (!built) { built = true; try { this.s3.build(it.T.kind) } catch (e) { this.s3fail = true; console.warn('city-landmarks: 3D 석탑 짓기 실패 —', e) } } return true }   // 한 프레임에 하나만 짓고, 다 지을 때까지는 셰이더 탑
      three.push(it); return false;
    });
    if (built) repaint();
    if (S.length) {
      const v = this.uS; gl.useProgram(this.pS); gl.uniformMatrix4fv(v.u_matrix, false, MT); gl.uniform1f(v.u_mu, MU);
      gl.uniform3f(v.u_light, Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)); gl.uniform2fv(v.u_lit, lit); gl.uniform1f(v.u_night, dark ? 1 : 0);
      for (const it of S) {
        if (!it.mesh) { const B = buildStupa(it.T.kind), va = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, B.data, gl.STATIC_DRAW);
          for (const [loc, n, off] of [[0, 3, 0], [1, 3, 3], [2, 1, 6], [3, 3, 7]] as const) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 40, off * 4) } gl.bindVertexArray(null); it.mesh = { va, b, n: B.data.length / 10, h: B.height } }
        gl.uniform1f(v.u_scale, it.H! / it.mesh.h); gl.uniform1f(v.u_wmul, it.T.widthMul || 1); gl.uniform1f(v.u_relief, it.T.kind === 'wongaksa' ? 1 : 0); gl.uniform1f(v.u_H0, it.mesh.h); gl.uniform2f(v.u_at, it.x, it.y); gl.uniform2fv(v.u_rot, it.rot); gl.uniform3fv(v.u_stone, hex(STONE[it.T.kind]![dark ? 'dark' : 'light']));
        gl.bindVertexArray(it.mesh.va); gl.drawArrays(gl.TRIANGLES, 0, it.mesh.n);
      }
    }
    if (three.length) {   // three.js 석탑: 모델(m, Y 위 · Z 남) → 지역 미터(방위 · 가로 비) → 지도 행렬
      const items = three.map(it => {
        const m = this.s3!.models[it.T.kind]!, k = it.H! / m.userData.height, w = it.T.widthMul || 1, c = it.rot[0], s = it.rot[1];
        const L = [c * w * k * MU, -s * w * k * MU, 0, 0, 0, 0, k * MU, 0, s * w * k * MU, c * w * k * MU, 0, 0, it.x * MU, it.y * MU, 0, 1];
        return { kind: it.T.kind, M: mul4(MT, L) };
      });
      this.s3!.render(gl, items, { light: [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)], lit, dark });
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.CULL_FACE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);   // three 가 텍스처를 올리며 바꾼 것(다른 층의 글자 · 블룸 텍스처가 뒤집히지 않게)
    }
    gl.bindVertexArray(null); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}
// 지도를 한 번 더 그리게(3D 석탑을 받았거나 지었을 때 — 지도가 멈춰 있어도 바로 보이게)
const repaint = () => (globalThis as { __subwayWebGL?:{ map?:{ triggerRepaint?:() => void } } }).__subwayWebGL?.map?.triggerRepaint?.();
// 4×4 열 우선 곱 a · b
function mul4(a:ArrayLike<number>, b:ArrayLike<number>):Float32Array { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + r]! * b[c * 4 + k]!; o[c * 4 + r] = v } return o }
