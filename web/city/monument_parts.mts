// 기념물 공통 부품: 메시 쓰기(상자 · 사다리꼴 · 기둥) · 종류 · 실물 색표 · 지붕(우진각 · 겹처마). 광화문 · 담장 · 동상이 같이 쓰고,
// 다른 문화유산 구역도 이 부품 위에 얹는다(구역마다 파일 하나 — monuments_gyeongbok.mts 처럼, 지연 로드).
// 색표는 모드 · 테마와 무관한 실물 색 하나다(고정 규칙: monuments_data.mts 머리 주석).
export type V3 = [number, number, number];
export const STRIDE = 8;   // x y z · 법선 xyz · 종류 · 보조값 s(기와골 · 처마 끝 무늬 따라 미터, 띠 · 현판은 위로 0…1)

// 종류(색 · 무늬를 셰이더가 정한다)
export const K = { granite: 0, trim: 1, red: 2, dancheong: 3, band: 4, giwa: 5, ridge: 6, wood: 7, fascia: 8, plaque: 9, soffit: 10, deck: 11, tunnel: 12, haechi: 13, brick: 14, bracket: 15, bronze: 16, gilt: 17, stone: 18, plaster: 19, window: 20 } as const;
// K 순서: 화강암 · 테두리 돌(흰 돌 난간) · 주칠 · 단청 바탕(뇌록) · 검은 띠 · 기와 · 마루 · 상층 판문(녹색) · 처마 끝 · 현판 · 처마 밑 · 월대 바닥(모래색) · 문 안 · 해치 · 궁장 벽돌 · 공포 · 이순신상 청동(녹색 도는 어두운 청동) · 세종대왕상 금빛 청동 · 동상 받침 돌(큰 판석 · 연한 회색빛 미색) · 회벽(궁 안 건물 벽 — 기둥 사이 미색 회칠, 맞춤)
export const COLORS = ['#E6E0D2', '#F4F1EA', '#A8362A', '#3B7C68', '#3A3836', '#4B5357', '#A9A79F', '#3E6B56', '#2F6A58', '#15110E', '#356B58', '#F1E3C0', '#2A2722', '#CFC8B8', '#D9D3C6', '#3B7C68', '#3F4E44', '#B9954C', '#CFC9BC', '#D6CBB0', '#D2C6A6'];
export const hex = (value:string) => { const v = parseInt(value.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255] };

// ── 메시 쓰기 도우미 ────────────────────────────────────────────────────────────────────────────────────────
export class MeshWriter {
  data:number[] = [];
  // 자리 옮김(건물을 제 방향 · 제 자리로 놓을 때): 틀 안에서 그린 점을 돌린 뒤 (x, y) 만큼 옮긴다. 없으면 그대로
  xf:{ x:number; y:number; cos:number; sin:number } | null = null;
  dz = 0;   // 높이 옮김: 건물을 월대 · 마루 위에 올려 짓을 때(틀 안에서 그린 높이에 더한다)
  tri(a:V3, b:V3, c:V3, kind:number, hint:V3, sa = 0, sb = 0, sc = 0):void {
    if (this.dz) { a = [a[0], a[1], a[2] + this.dz]; b = [b[0], b[1], b[2] + this.dz]; c = [c[0], c[1], c[2] + this.dz] }
    if (this.xf) {
      const { x, y, cos, sin } = this.xf;
      a = [x + a[0] * cos - a[1] * sin, y + a[0] * sin + a[1] * cos, a[2]]; b = [x + b[0] * cos - b[1] * sin, y + b[0] * sin + b[1] * cos, b[2]]; c = [x + c[0] * cos - c[1] * sin, y + c[0] * sin + c[1] * cos, c[2]];
      hint = [hint[0] * cos - hint[1] * sin, hint[0] * sin + hint[1] * cos, hint[2]];
    }
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;   // 모서리가 겹친 삼각형(지붕 꼭대기 선)은 건너뛴다
    nx /= len; ny /= len; nz /= len; if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz }
    for (const [p, s] of [[a, sa], [b, sb], [c, sc]] as const) this.data.push(p[0], p[1], p[2], nx, ny, nz, kind, s);
  }
  quad(a:V3, b:V3, c:V3, e:V3, kind:number, hint:V3, sa = 0, sb = 0, sc = 0, se = 0):void { this.tri(a, b, c, kind, hint, sa, sb, sc); this.tri(a, c, e, kind, hint, sa, sc, se) }
  // 직육면체(아래 · 위 면을 뺄 수 있다)
  box(x0:number, x1:number, y0:number, y1:number, z0:number, z1:number, kind:number, skip:{ bottom?:boolean; top?:boolean } = {}):void {
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], kind, [0, -1, 0]); this.quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], kind, [0, 1, 0]);
    this.quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], kind, [-1, 0, 0]); this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], kind, [1, 0, 0]);
    if (!skip.top) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], kind, [0, 0, 1]);
    if (!skip.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], kind, [0, 0, -1]);
  }
  // 위로 좁아지는(또는 넓어지는) 사각 기둥: 아래 반폭 (hx0 · hy0) → 위 반폭 (hx1 · hy1), 가운데 (cx · cy)
  frustum(cx:number, cy:number, hx0:number, hy0:number, z0:number, hx1:number, hy1:number, z1:number, kind:number, skip:{ bottom?:boolean; top?:boolean } = {}):void {
    const A:V3 = [cx - hx0, cy - hy0, z0], B:V3 = [cx + hx0, cy - hy0, z0], C:V3 = [cx + hx0, cy + hy0, z0], D:V3 = [cx - hx0, cy + hy0, z0];
    const E:V3 = [cx - hx1, cy - hy1, z1], F:V3 = [cx + hx1, cy - hy1, z1], G:V3 = [cx + hx1, cy + hy1, z1], H:V3 = [cx - hx1, cy + hy1, z1];
    this.quad(A, B, F, E, kind, [0, -1, 0]); this.quad(C, D, H, G, kind, [0, 1, 0]); this.quad(D, A, E, H, kind, [-1, 0, 0]); this.quad(B, C, G, F, kind, [1, 0, 0]);
    if (!skip.top) this.quad(E, F, G, H, kind, [0, 0, 1]);
    if (!skip.bottom) this.quad(A, B, C, D, kind, [0, 0, -1]);
  }
  // 세운 원기둥(북 · 받침 …): 옆 n 각
  prism(cx:number, cy:number, radius:number, z0:number, z1:number, kind:number, sides = 10):void {
    for (let i = 0; i < sides; i++) {
      const a0 = Math.PI * 2 * i / sides, a1 = Math.PI * 2 * (i + 1) / sides, p0:[number, number] = [cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius], p1:[number, number] = [cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius], mid = (a0 + a1) / 2;
      this.quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1], kind, [Math.cos(mid), Math.sin(mid), 0]);
      this.tri([cx, cy, z1], [p0[0], p0[1], z1], [p1[0], p1[1], z1], kind, [0, 0, 1]);
    }
  }
}

// ── 지붕(우진각 · 겹처마) ──────────────────────────────────────────────────────────────────────────────────
// 바깥 처마 사각(hx · hy)에서 안쪽 사각(ix · iy)까지 네 면. 윗층은 안쪽이 용마루 선(iy = 0), 아래층은 윗층 몸을 두른 사각.
// 처마 끝은 귀(모서리)로 갈수록 솟고(lift) 바깥 대각으로 뻗고(flare), 면은 처마에서 완만하다 위로 갈수록 가파른 오목한 곡선.
export interface Roof { hx:number; hy:number; ix:number; iy:number; z0:number; rise:number; lift:number; flare:number; steps?:{ side:number; slope:number } }   // steps: 작은 건물은 칸을 성기게(없으면 SIDE_STEPS · SLOPE_STEPS)
export const SIDE_STEPS = 28, SLOPE_STEPS = 6;
export const corner = (R:Roof, c:number, inner:boolean):[number, number] => { const [sx, sy] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][c]! as [number, number]; return inner ? [sx * R.ix, sy * R.iy] : [sx * R.hx, sy * R.hy] };
export function eaveXY(R:Roof, face:number, s:number):[number, number] {   // 처마 끝의 평면 점(귀에서 바깥 대각으로 뻗는다)
  const [ax, ay] = corner(R, face, false), [bx, by] = corner(R, (face + 1) % 4, false);
  const near = s < .5 ? face : (face + 1) % 4, [sx, sy] = corner(R, near, false), amount = R.flare * Math.abs(2 * s - 1) ** 3, norm = Math.hypot(sx, sy) || 1;
  return [ax + (bx - ax) * s + sx / norm * amount, ay + (by - ay) * s + sy / norm * amount];
}
export const eaveZ = (R:Roof, s:number) => R.z0 + R.lift * Math.abs(2 * s - 1) ** 2.2;   // 앙곡: 가운데는 낮고 귀로 갈수록 부드럽게 솟는다
export function roofPoint(R:Roof, face:number, s:number, t:number):V3 {   // t 0 처마 끝 · 1 안쪽
  const [ex, ey] = eaveXY(R, face, s), [ax, ay] = corner(R, face, true), [bx, by] = corner(R, (face + 1) % 4, true), ix = ax + (bx - ax) * s, iy = ay + (by - ay) * s;
  const z = R.z0 + R.rise * t ** 1.35 + R.lift * Math.abs(2 * s - 1) ** 2.2 * (1 - t) ** 1.6;
  return [ex + (ix - ex) * t, ey + (iy - ey) * t, z];
}
export const FACE_OUT:V3[] = [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]];
export function buildRoof(w:MeshWriter, R:Roof, edge:{ innerZ:number; innerHx:number; innerHy:number }):void {
  const SIDE = R.steps?.side ?? SIDE_STEPS, SLOPE = R.steps?.slope ?? SLOPE_STEPS;
  const sideLen = (face:number) => Math.hypot(...(corner(R, face, false).map((v, i) => corner(R, (face + 1) % 4, false)[i]! - v) as [number, number]));
  for (let face = 0; face < 4; face++) {
    const len = sideLen(face), out = FACE_OUT[face]!;
    for (let i = 0; i < SIDE; i++) {
      const s0 = i / SIDE, s1 = (i + 1) / SIDE, m0 = s0 * len, m1 = s1 * len;
      for (let j = 0; j < SLOPE; j++) {   // 기와 지붕면(기와골은 내려가는 방향 — s 는 처마를 따라 잰 미터)
        const t0 = j / SLOPE, t1 = (j + 1) / SLOPE;
        w.quad(roofPoint(R, face, s0, t0), roofPoint(R, face, s1, t0), roofPoint(R, face, s1, t1), roofPoint(R, face, s0, t1), K.giwa, [0, 0, 1], m0, m1, m1, m0);
      }
      // 겹처마 끝: 부연(바깥 · 위)과 서까래(안쪽으로 물러선 아래) 두 겹, 아래는 처마 밑면
      const a = eaveXY(R, face, s0), b = eaveXY(R, face, s1), za = eaveZ(R, s0), zb = eaveZ(R, s1), inset = .38;
      const ia:[number, number] = [a[0] - out[0] * inset, a[1] - out[1] * inset], ib:[number, number] = [b[0] - out[0] * inset, b[1] - out[1] * inset];
      w.quad([a[0], a[1], za - .3], [b[0], b[1], zb - .3], [b[0], b[1], zb + .06], [a[0], a[1], za + .06], K.fascia, out, m0, m1, m1, m0);   // 부연
      w.quad([a[0], a[1], za - .3], [b[0], b[1], zb - .3], [ib[0], ib[1], zb - .3], [ia[0], ia[1], za - .3], K.soffit, [0, 0, -1], m0, m1, m1, m0);
      w.quad([ia[0], ia[1], za - .86], [ib[0], ib[1], zb - .86], [ib[0], ib[1], zb - .3], [ia[0], ia[1], za - .3], K.fascia, out, m0 + .19, m1 + .19, m1 + .19, m0 + .19);   // 서까래
      // 처마 밑: 서까래 아랫단에서 공포 윗단으로(안쪽으로 위로 비스듬히)
      const fx = (p:[number, number]) => (Math.abs(out[0]) ? Math.sign(out[0]) * edge.innerHx : Math.max(-edge.innerHx, Math.min(edge.innerHx, p[0]))), fy = (p:[number, number]) => (Math.abs(out[1]) ? Math.sign(out[1]) * edge.innerHy : Math.max(-edge.innerHy, Math.min(edge.innerHy, p[1])));
      w.quad([ia[0], ia[1], za - .86], [ib[0], ib[1], zb - .86], [fx(ib), fy(ib), edge.innerZ], [fx(ia), fy(ia), edge.innerZ], K.soffit, [0, 0, -1], m0, m1, m1, m0);
    }
  }
  // 추녀마루(귀를 따라 내려오는 마루)와 용마루(윗층): 밝은 회색 띠를 지붕면 위에 얹는다
  const ribbon = (pts:V3[], half:number, lift:number) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i]!, q = pts[i + 1]!, dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len * half, ny = dx / len * half;
      w.quad([p[0] - nx, p[1] - ny, p[2] + lift], [p[0] + nx, p[1] + ny, p[2] + lift], [q[0] + nx, q[1] + ny, q[2] + lift], [q[0] - nx, q[1] - ny, q[2] + lift], K.ridge, [0, 0, 1]);
    }
  };
  for (let c = 0; c < 4; c++) { const line:V3[] = []; for (let j = 0; j <= SLOPE * 2; j++) line.push(roofPoint(R, c, 0, j / (SLOPE * 2))); ribbon(line, .3, .14) }
  if (R.iy === 0) {   // 용마루: 두껍게 솟은 마루(양성바름)
    const zr = R.z0 + R.rise; w.box(-R.ix, R.ix, -.42, .42, zr - .1, zr + .62, K.ridge, { bottom: true });
  }
}

// 공포(기둥 위 · 기둥 사이에서 처마를 받치는 짜임)를 둘레에 도드라지게: 두 단으로 앞으로 나온 덩어리를 일정한 간격으로 — 안쪽 짜임은 그리지 않는다
export function buildBrackets(w:MeshWriter, hx:number, hy:number, z:number):void {
  for (const [vertical, half, along] of [[false, hy, hx], [true, hx, hy]] as const) {
    const count = Math.round(along * 2 / 1.55);
    for (const side of [-1, 1]) for (let i = 0; i <= count; i++) {
      const pos = -along + 2 * along * i / count;
      for (const [out, width, z0, z1] of [[.4, .3, z, z + .38], [.75, .42, z + .38, z + .7]] as const) {
        const face = side * half, far = face + side * out;
        if (vertical) w.box(Math.min(face, far), Math.max(face, far), pos - width, pos + width, z0, z1, K.bracket, { bottom: false });
        else w.box(pos - width, pos + width, Math.min(face, far), Math.max(face, far), z0, z1, K.bracket, { bottom: false });
      }
    }
  }
}
// 몸 둘레를 두르는 띠(창방 · 공포): 단청 무늬. s 는 위로 sa → sb(창방 0~0.28 · 공포 0.3~1)
export function bandBox(w:MeshWriter, hx:number, hy:number, z0:number, z1:number, kind:number, sa:number, sb:number):void {
  const faces:[V3, V3, V3][] = [[[-1, -1, 0], [1, -1, 0], [0, -1, 0]], [[1, -1, 0], [1, 1, 0], [1, 0, 0]], [[1, 1, 0], [-1, 1, 0], [0, 1, 0]], [[-1, 1, 0], [-1, -1, 0], [-1, 0, 0]]];
  for (const [a, b, n] of faces) w.quad([a[0] * hx, a[1] * hy, z0], [b[0] * hx, b[1] * hy, z0], [b[0] * hx, b[1] * hy, z1], [a[0] * hx, a[1] * hy, z1], kind, n, sa, sa, sb, sb);
}

