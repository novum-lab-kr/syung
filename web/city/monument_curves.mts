// 기념물 곡면 메시 도우미: 격자(세로 줄 × 둘레 칸)로 곡면을 짓고 정점마다 매끈한 법선을 준다. 동상(monuments_statues.mts)이 쓴다.
// 잎 모듈 — monument_parts.mts 만 import 한다. 상자 · 사다리꼴(MeshWriter.box · frustum)과 달리 모서리가 없는 몸 · 옷 · 팔다리를 지을 때 쓴다.
import type { MeshWriter, V3 } from './monument_parts.mts';

const sub = (a:V3, b:V3):V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a:V3, b:V3):V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a:V3, b:V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a:V3):V3 => { const len = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / len, a[1] / len, a[2] / len] };
const add = (a:V3, b:V3):V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a:V3, k:number):V3 => [a[0] * k, a[1] * k, a[2] * k];

export interface LoftOptions { closed?:boolean; sign?:1 | -1; inward?:boolean; s?:(v:number, u:number) => number }   // closed: 둘레가 이어진다(기본 참) · sign: 법선 방향을 강제(열린 면) · inward: 자동으로 맞춘 바깥 방향을 뒤집는다(그릇 안쪽) · s: 보조값

// 격자 곡면: at(v, u) 가 점을 준다(v 0…1 = 세로 · u 0…1 = 둘레). 면의 방향은 (닫힌 면이면) 바깥으로 자동으로 맞춘다.
export function loft(w:MeshWriter, rows:number, cols:number, at:(v:number, u:number) => V3, kind:number, options:LoftOptions = {}):void {
  const closed = options.closed ?? true, width = closed ? cols : cols + 1, P:V3[][] = [];
  for (let i = 0; i <= rows; i++) { const row:V3[] = []; for (let j = 0; j < width; j++) row.push(at(i / rows, j / cols)); P.push(row) }
  const N:V3[][] = P.map(row => row.map(() => [0, 0, 0] as V3));
  const wrap = (j:number) => closed ? (j + width) % width : j;
  for (let i = 0; i < rows; i++) for (let j = 0; j < (closed ? width : width - 1); j++) {
    const j1 = wrap(j + 1), a = P[i]![j]!, b = P[i]![j1]!, c = P[i + 1]![j1]!, e = P[i + 1]![j]!;
    const n1 = cross(sub(b, a), sub(c, a)), n2 = cross(sub(c, a), sub(e, a));
    for (const [ii, jj, n] of [[i, j, n1], [i, j1, n1], [i + 1, j1, n1], [i, j, n2], [i + 1, j1, n2], [i + 1, j, n2]] as const) N[ii]![jj] = add(N[ii]![jj]!, n);
  }
  // 한 점으로 모이는 끝(극): 이웃 줄 법선의 평균을 쓴다
  for (const [i, near] of [[0, 1], [rows, rows - 1]] as const) {
    const row = P[i]!;
    if (row.every(p => Math.hypot(...sub(p, row[0]!)) < 1e-6)) { let sum:V3 = [0, 0, 0]; for (const n of N[near]!) sum = add(sum, unit(n)); N[i] = row.map(() => sum) }
  }
  let flip = options.sign ?? 0;
  if (!flip) {   // 줄마다 가운데에서 바깥을 보는지 합쳐 본다
    let total = 0;
    for (let i = 0; i <= rows; i++) { let center:V3 = [0, 0, 0]; for (const p of P[i]!) center = add(center, p); center = scale(center, 1 / width); for (let j = 0; j < width; j++) total += dot(unit(N[i]![j]!), sub(P[i]![j]!, center)) }
    flip = total >= 0 ? 1 : -1;
  }
  if (options.inward) flip = -flip;
  const normal = (i:number, j:number):V3 => scale(unit(N[i]![j]!), flip);
  const area = (a:V3, b:V3, c:V3) => Math.hypot(...cross(sub(b, a), sub(c, a)));   // 극에서 한 점으로 접힌 삼각형(면적 0)은 내보내지 않는다
  for (let i = 0; i < rows; i++) for (let j = 0; j < (closed ? width : width - 1); j++) {
    const j1 = wrap(j + 1), pa = P[i]![j]!, pb = P[i]![j1]!, pc = P[i + 1]![j1]!, pe = P[i + 1]![j]!;
    const s = (ii:number, jj:number) => options.s ? options.s(ii / rows, jj / cols) : 0;
    if (area(pa, pb, pc) > 1e-9) w.triN(pa, pb, pc, normal(i, j), normal(i, j1), normal(i + 1, j1), kind, s(i, j), s(i, j1), s(i + 1, j1));
    if (area(pa, pc, pe) > 1e-9) w.triN(pa, pc, pe, normal(i, j), normal(i + 1, j1), normal(i + 1, j), kind, s(i, j), s(i + 1, j1), s(i + 1, j));
  }
}

// 회전 · 타원체: 가운데 · 반지름(x y z) · 방향(yaw: 위에서 본 시계 반대 방향 라디안 · pitch: 앞으로 숙임 · roll)
export interface Pose { yaw?:number; pitch?:number; roll?:number }
export const rotate = (p:V3, pose:Pose):V3 => {
  let [x, y, z] = p;
  const { yaw = 0, pitch = 0, roll = 0 } = pose;
  if (pitch) { const c = Math.cos(pitch), s = Math.sin(pitch); [y, z] = [y * c - z * s, y * s + z * c] }   // x 축 둘레
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll); [x, z] = [x * c + z * s, -x * s + z * c] }   // y 축 둘레
  if (yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); [x, y] = [x * c - y * s, x * s + y * c] }   // z 축 둘레
  return [x, y, z];
};
export function ellipsoid(w:MeshWriter, center:V3, radii:V3, kind:number, pose:Pose = {}, detail:[number, number] = [10, 14]):void {
  loft(w, detail[0], detail[1], (v, u) => {
    const phi = v * Math.PI, theta = u * Math.PI * 2, r = Math.sin(phi);
    return add(center, rotate([radii[0] * r * Math.cos(theta), radii[1] * r * Math.sin(theta), -radii[2] * Math.cos(phi)], pose));
  }, kind);
}

// 선 따라 가는 관: 제어점 [x, y, z, 가로 반지름, 세로 반지름]을 매끈한 곡선(Catmull-Rom)으로 잇고 단면은 타원. 끝은 둥글게 막는다.
export type Knot = [number, number, number, number, number];
export const spline = (k:Knot[], t:number):Knot => {   // t 0…k.length-1
  const i = Math.min(k.length - 2, Math.max(0, Math.floor(t))), f = t - i, p0 = k[Math.max(0, i - 1)]!, p1 = k[i]!, p2 = k[i + 1]!, p3 = k[Math.min(k.length - 1, i + 2)]!;
  const f2 = f * f, f3 = f2 * f;
  return p1.map((_, d) => .5 * (2 * p1[d]! + (p2[d]! - p0[d]!) * f + (2 * p0[d]! - 5 * p1[d]! + 4 * p2[d]! - p3[d]!) * f2 + (3 * p1[d]! - p0[d]! - 3 * p2[d]! + p3[d]! ) * f3)) as Knot;
};
export function tube(w:MeshWriter, knots:Knot[], kind:number, options:{ sides?:number; steps?:number; cap?:number; up?:V3 } = {}):void {
  const sides = options.sides ?? 10, steps = options.steps ?? (knots.length - 1) * 4, capRows = options.cap ?? 3, up = options.up ?? [0, 0, 1];
  const samples:Knot[] = []; for (let i = 0; i <= steps; i++) samples.push(spline(knots, i / steps * (knots.length - 1)));
  const centers:V3[] = samples.map(k => [k[0], k[1], k[2]]), tangents = centers.map((_, i) => unit(sub(centers[Math.min(i + 1, steps)]!, centers[Math.max(i - 1, 0)]!)));
  // 단면 축: 처음 한 번 정하고 따라 옮긴다(꼬이지 않게)
  const frames:[V3, V3][] = []; let side = cross(tangents[0]!, Math.abs(dot(tangents[0]!, up)) > .95 ? [1, 0, 0] : up);
  for (const tangent of tangents) { side = unit(sub(side, scale(tangent, dot(side, tangent)))); frames.push([side, unit(cross(tangent, side))]) }
  const rows:{ c:V3; a:V3; b:V3; rx:number; ry:number }[] = [];
  const first = samples[0]!, last = samples[steps]!;
  for (let i = capRows; i >= 1; i--) { const phi = i / (capRows + 1) * Math.PI / 2, shift = Math.sin(phi), shrink = Math.cos(phi); rows.push({ c: sub(centers[0]!, scale(tangents[0]!, shift * Math.max(first[3], first[4]))), a: frames[0]![0], b: frames[0]![1], rx: first[3] * shrink, ry: first[4] * shrink }) }
  samples.forEach((k, i) => rows.push({ c: centers[i]!, a: frames[i]![0], b: frames[i]![1], rx: k[3], ry: k[4] }));
  for (let i = 1; i <= capRows; i++) { const phi = i / (capRows + 1) * Math.PI / 2, shift = Math.sin(phi), shrink = Math.cos(phi); rows.push({ c: add(centers[steps]!, scale(tangents[steps]!, shift * Math.max(last[3], last[4]))), a: frames[steps]![0], b: frames[steps]![1], rx: last[3] * shrink, ry: last[4] * shrink }) }
  const end0 = rows[0]!, endN = rows[rows.length - 1]!;
  loft(w, rows.length + 1, sides, (v, u) => {   // 양 끝에 점 하나씩(극)을 더해 막는다
    const i = Math.round(v * (rows.length + 1)) - 1;
    if (i < 0) return sub(end0.c, scale(tangents[0]!, .001)); if (i >= rows.length) return add(endN.c, scale(tangents[steps]!, .001));
    const row = rows[i]!, theta = u * Math.PI * 2;
    return add(row.c, add(scale(row.a, row.rx * Math.cos(theta)), scale(row.b, row.ry * Math.sin(theta))));
  }, kind);
}

// 세운 몸(옷 · 몸통 · 투구 · 북): 제어점 [가운데 x, 가운데 y, 높이 z, 반지름 x, 반지름 y]를 위로 이어 타원 단면의 매끈한 몸을 짓는다.
// 위 · 아래 마개는 평평하게(옆면과 법선을 나눠 모서리가 둥글게 번지지 않는다). fold: 둘레 · 높이를 따라 반지름에 곱하는 작은 값(v 0 아래 … 1 위, u 0…1 둘레)
export function body(w:MeshWriter, knots:Knot[], kind:number, options:{ cols?:number; rows?:number; fold?:(v:number, u:number) => number } = {}):void {
  const cols = options.cols ?? 20, rows = options.rows ?? (knots.length - 1) * 4, fold = options.fold;
  const first = knots[0]!, last = knots[knots.length - 1]!;
  const ringPoint = (t:number, u:number):V3 => {
    const k = spline(knots, t * (knots.length - 1)), theta = u * Math.PI * 2, f = fold ? 1 + fold(t, u) : 1;
    return [k[0] + k[3] * f * Math.cos(theta), k[1] + k[4] * f * Math.sin(theta), k[2]];
  };
  loft(w, rows, cols, (v, u) => ringPoint(Math.round(v * rows) / rows, u), kind);
  for (const [t, z, nz] of [[0, first[2], -1], [1, last[2], 1]] as const) {   // 평평한 마개: 가운데 점에서 둘레로 부채살
    const center:V3 = [t ? last[0] : first[0], t ? last[1] : first[1], z], flat:V3 = [0, 0, nz];
    for (let j = 0; j < cols; j++) w.triN(center, ringPoint(t, j / cols), ringPoint(t, (j + 1) / cols), flat, flat, flat, kind);
  }
}

// 고리(혼천의 테): 가운데 · 큰 반지름 · 단면 반지름 · 자세. 단면은 원
export function torus(w:MeshWriter, center:V3, major:number, minor:number, kind:number, pose:Pose = {}, detail:[number, number] = [6, 24]):void {
  loft(w, detail[0], detail[1], (v, u) => {
    const around = u * Math.PI * 2, section = v * Math.PI * 2, radius = major + minor * Math.cos(section);
    return add(center, rotate([radius * Math.cos(around), radius * Math.sin(around), minor * Math.sin(section)], pose));
  }, kind, { sign: 1 });
}

// 오목한 그릇(앙부일구): 반구 바깥 + 안쪽(안쪽 면은 법선이 안을 본다). 가운데 · 바깥 반지름 · 벽 두께. 위가 열린다
export function bowl(w:MeshWriter, center:V3, radius:number, wall:number, kind:number, detail:[number, number] = [6, 20]):void {
  const shell = (r:number) => (v:number, u:number):V3 => { const phi = v * Math.PI / 2, theta = u * Math.PI * 2; return add(center, [r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), -r * Math.cos(phi)]) };
  loft(w, detail[0], detail[1], shell(radius), kind);
  loft(w, detail[0], detail[1], shell(radius - wall), kind, { inward: true });
  // 가장자리 두께: 바깥 · 안쪽 가장자리를 잇는 좁은 띠(위를 본다)
  loft(w, 1, detail[1], (v, u) => { const theta = u * Math.PI * 2, r = radius - wall * v; return add(center, [r * Math.cos(theta), r * Math.sin(theta), 0]) }, kind, { sign: 1 });
}

// 속이 빈 통(측우기): 가운데(바닥 중심) · 바깥 반지름 · 벽 두께 · 높이. 위는 뚫려 있고 안쪽 바닥이 보인다(마개 없음)
export function cup(w:MeshWriter, center:V3, radius:number, wall:number, height:number, kind:number, cols = 20):void {
  const ring = (r:number, z:number, u:number):V3 => add(center, [r * Math.cos(u * Math.PI * 2), r * Math.sin(u * Math.PI * 2), z]);
  loft(w, 1, cols, (v, u) => ring(radius, v * height, u), kind);
  loft(w, 1, cols, (v, u) => ring(radius - wall, v * height, u), kind, { inward: true });
  const up:V3 = [0, 0, 1], floor = height * .12;
  for (let col = 0; col < cols; col++) {
    const a = col / cols, b = (col + 1) / cols;
    w.triN(ring(radius, height, a), ring(radius - wall, height, a), ring(radius - wall, height, b), up, up, up, kind);   // 가장자리 두께(위를 본다)
    w.triN(ring(radius, height, a), ring(radius - wall, height, b), ring(radius, height, b), up, up, up, kind);
    w.triN(add(center, [0, 0, floor]), ring(radius - wall, floor, a), ring(radius - wall, floor, b), up, up, up, kind);   // 안쪽 바닥
  }
}
