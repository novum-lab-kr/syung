// 거북선 — 조선 모드의 지하철. 열차 한 대가 거북선 몇 척의 선단이 되어 공중 수로(심시티 고가에 물을 채운 것) 위를 간다.
//
// 배 한 척은 단위 공간의 고정 메시다(a_x: 배 길이 L 의 몇 분의 몇, 0 고물 · 1 이물, a_p: 몸 폭 W 단위의 앞뒤 덧붙임 · 옆 · 위,
// 물높이 z = 0). 화면의 배마다 인스턴스 하나: TrainLayer 가 주는 선로 위 틀(밑 가운데 점, F 앞, R 옆, U 위), L · W(px),
// 노선 색, 움직이는지. 생김새: 판옥선 몸통(널판 · 총통 구멍 · 노선 색 뱃전 띠), 육각 철갑과 쇠못을 그린 둥근 등딱지(용마루는
// 노선 색), 이물의 용머리와 귀면, 고물 깃대에 노선 색 깃발, 양옆의 노(배가 가는 동안 저어 간다). 밤에는 총통 구멍에 불빛.
// 깊이: 건물 벽 깊이와 맞대어 가려지고(가려진 몫은 occlude 만큼 비친다), 제 깊이를 써서 등딱지가 노 위에 선다.
//
//   const s=new TurtleShips(style); s.init(gl);
//   s.begin(ox,oy); s.ship(frame,L,W,rgb,moving,key)…; s.draw(gl,M,ox,oy,{zoom,unit,walls,occlude,dark,time}); s.dispose(gl)

import { compile, hexRGB } from './park_night.mjs';

const SUN = (v => { const l = Math.hypot(...v); return v.map(c => c / l) })([-.30, .46, .84]);   // coaster_train 과 같은 해
const LOD_MID = 9, LOD_HI = 20;   // W px: 노는 LOD_MID 부터, 용 눈 · 노 여덟 쌍은 LOD_HI 부터
const INST = 20;
const fnv1a = s => { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h >>> 0 };
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] };

// 칠하는 방식(a_part)
const P_FLAT = 0, P_HULL = 1, P_SHELL = 2, P_LINE = 3, P_HEAD = 4, P_BOW = 5, P_FLAG = 6, P_OAR = 7, P_DECK = 8;
// 팔레트 자리(u_pal)
const S_WOOD = 0, S_WOOD_DARK = 1, S_SHELL = 2, S_SHELL_EDGE = 3, S_SPIKE = 4, S_RED = 5, S_GOLD = 6, S_WHITE = 7, S_INK = 8, S_OAR = 9, S_LAMP = 10, PAL = 11;

// 배의 평면 반폭(W 단위)과 뱃전 높이: 가운데가 가장 넓고, 이물 · 고물은 뭉툭하게 잘린다
export const hullHalf = t => Math.max(.2, .5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 3)), .38));
export const gunwale = t => .3 + .1 * Math.pow(Math.abs(2 * t - 1), 2);
// 등딱지: 뱃전 위로 솟는 높이(가운데 가장 높고 끝으로 둥글게 내려간다), 앞뒤 범위
const SHELL_T = [.07, .93];
const shellRise = t => { const u = (t - SHELL_T[0]) / (SHELL_T[1] - SHELL_T[0]); return .42 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 4)), .5) };
const OAR_PIVOT = { y: .45, z: .17 };   // 노가 뱃전에 걸리는 자리(옆 · 위, W 단위): 셰이더가 이 둘레로 젓는다

class Mesh {
  constructor() { this.d = []; this.n = 0 }
  // 꼭짓점 하나: x(× L), p(× W: 앞뒤 덧붙임 · 옆 · 위), 법선, 칠, 자리 — 9 floats
  v(x, p, n, part, slot) { this.d.push(x, p[0], p[1], p[2], n[0], n[1], n[2], part, slot); this.n++ }
  tri(a, b, c, o) {   // [x, [ex, y, z]] 셋, 법선은 면에서 (L 을 모르니 x 를 W 의 4배로 보고 셈한다: 배는 대개 그만큼 길다)
    const P = q => [q[0] * 4 + q[1][0], q[1][1], q[1][2]], A = P(a), B = P(b), C = P(c);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let n = norm([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
    if (o.out) { const c = [A[0] - o.out[0], A[1] - o.out[1], A[2] - o.out[2]]; if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) n = n.map(v => -v) }   // 바깥쪽(o.out 에서 멀어지는 쪽)을 보게
    for (const q of [a, b, c]) this.v(q[0], q[1], n, o.part, o.slot);
  }
  quad(a, b, c, d, o) { this.tri(a, b, c, o); this.tri(a, c, d, o) }
  // 상자: 한 x 자리에서 가운데 c(W 단위: 앞뒤 · 옆 · 위), 반 크기 h
  box(x, c, h, o) {
    const V = (i, j, k) => [x, [c[0] + i * h[0], c[1] + j * h[1], c[2] + k * h[2]]], q = (a, b, cc, d, n) => { for (const p of [a, b, cc, a, cc, d]) this.v(p[0], p[1], n, o.part, o.slot) };
    q(V(1, -1, -1), V(1, 1, -1), V(1, 1, 1), V(1, -1, 1), [1, 0, 0]); q(V(-1, 1, -1), V(-1, -1, -1), V(-1, -1, 1), V(-1, 1, 1), [-1, 0, 0]);
    q(V(-1, 1, -1), V(1, 1, -1), V(1, 1, 1), V(-1, 1, 1), [0, 1, 0]); q(V(1, -1, -1), V(-1, -1, -1), V(-1, -1, 1), V(1, -1, 1), [0, -1, 0]);
    q(V(-1, -1, 1), V(1, -1, 1), V(1, 1, 1), V(-1, 1, 1), [0, 0, 1]); if (o.bottom) q(V(-1, 1, -1), V(1, 1, -1), V(1, -1, -1), V(-1, -1, -1), [0, 0, -1]);
  }
  buffer() { return new Float32Array(this.d) }
}

// 몸통: 물 아래 조금부터 뱃전까지, 아래가 조금 좁다. 이물 · 고물은 판으로 막는다(이물판에는 귀면)
function hull(M, rings) {
  const side = { part: P_HULL, slot: S_WOOD }, z0 = -.06, ts = Array.from({ length: rings + 1 }, (_, i) => i / rings);
  for (let i = 0; i < rings; i++) {
    const a = ts[i], b = ts[i + 1];
    for (const s of [-1, 1]) M.quad([a, [0, s * hullHalf(a) * .84, z0]], [b, [0, s * hullHalf(b) * .84, z0]], [b, [0, s * hullHalf(b), gunwale(b)]], [a, [0, s * hullHalf(a), gunwale(a)]], { ...side, out: [a * 4, 0, .1] });
  }
  const end = (t, part, slot, dir) => { const h = hullHalf(t), g = gunwale(t); M.quad([t, [0, -h * .84, z0]], [t, [0, h * .84, z0]], [t, [0, h, g]], [t, [0, -h, g]], { part, slot, out: [(t - dir * .1) * 4, 0, .1] }) };
  end(1, P_BOW, S_RED, 1); end(0, P_HULL, S_WOOD_DARK, -1);
  // 뱃전 위 판(등딱지 끝 바깥에 보이는 갑판)
  const deck = { part: P_DECK, slot: S_WOOD_DARK };
  for (const [t0, t1] of [[0, SHELL_T[0]], [SHELL_T[1], 1]]) {
    const n = 2; for (let i = 0; i < n; i++) { const a = t0 + (t1 - t0) * i / n, b = t0 + (t1 - t0) * (i + 1) / n;
      M.quad([a, [0, -hullHalf(a), gunwale(a)]], [b, [0, -hullHalf(b), gunwale(b)]], [b, [0, hullHalf(b), gunwale(b)]], [a, [0, hullHalf(a), gunwale(a)]], { ...deck, out: [0, 0, -5] }) }
  }
}
// 등딱지: 뱃전 안쪽에서 솟는 아치를 앞뒤로 이어 붙인다. 맨 위 띠는 노선 색 용마루
function shell(M, rings, arcs) {
  const o = { part: P_SHELL, slot: S_SHELL }, ridge = { part: P_LINE, slot: S_SHELL_EDGE };
  const at = (t, k) => { const h = hullHalf(t) * .97, g = gunwale(t), th = Math.PI * k / arcs, r = shellRise(t); return [t, [0, -Math.cos(th) * h, g + Math.pow(Math.sin(th), .7) * r]] };
  for (let i = 0; i < rings; i++) {
    const a = SHELL_T[0] + (SHELL_T[1] - SHELL_T[0]) * i / rings, b = SHELL_T[0] + (SHELL_T[1] - SHELL_T[0]) * (i + 1) / rings;
    for (let k = 0; k < arcs; k++) M.quad(at(a, k), at(b, k), at(b, k + 1), at(a, k + 1), { ...o, out: [(a + b) * 2, 0, -2] });
    const m = (a + b) / 2, rr = shellRise(m) + gunwale(m) + .012, w = .045;   // 용마루: 꼭대기를 따라 가는 띠
    M.quad([a, [0, -w, shellRise(a) + gunwale(a) + .012]], [b, [0, -w, shellRise(b) + gunwale(b) + .012]], [b, [0, w, shellRise(b) + gunwale(b) + .012]], [a, [0, w, shellRise(a) + gunwale(a) + .012]], { ...ridge, out: [m * 4, 0, rr - 5] });
  }
}
// 이물의 용머리: 앞으로 뻗어 오르는 목과 머리, 금빛 뿔, 가까이서는 흰 눈
function dragon(M, eyes) {
  const red = { part: P_HEAD, slot: S_RED, bottom: true }, gold = { part: P_FLAT, slot: S_GOLD, bottom: true };
  M.box(1, [.1, 0, .4], [.12, .1, .08], red);       // 목
  M.box(1, [.28, 0, .5], [.12, .12, .085], red);    // 머리
  M.box(1, [.37, 0, .44], [.05, .1, .03], gold);    // 아래턱
  for (const s of [-1, 1]) M.box(1, [.2, s * .07, .62], [.025, .025, .06], gold);   // 뿔
  if (eyes) for (const s of [-1, 1]) M.box(1, [.3, s * .123, .54], [.03, .006, .025], { part: P_FLAT, slot: S_WHITE });
}
// 고물의 깃대와 노선 색 깃발(깃발은 셰이더가 바람에 흔든다)
function flag(M) {
  M.box(0, [.12, 0, .62], [.018, .018, .3], { part: P_FLAT, slot: S_WOOD_DARK });
  const f = { part: P_FLAG, slot: 0 }, x0 = .12, x1 = -.36, z0 = .64, z1 = .9;
  M.quad([0, [x0, 0, z0]], [0, [x1, 0, z0]], [0, [x1, 0, z1]], [0, [x0, 0, z1]], { ...f, out: [0, -5, 0] });
}
// 노: 뱃전에서 물까지 비스듬히. a_x 는 노가 걸린 자리(셰이더가 OAR_PIVOT 둘레로 젓는다)
function oars(M, n) {
  const o = { part: P_OAR, slot: S_OAR };
  for (let i = 0; i < n; i++) {
    const t = .24 + .52 * (i + .5) / n;
    for (const s of [-1, 1]) {
      const y0 = s * OAR_PIVOT.y, y1 = s * (OAR_PIVOT.y + .22), z0 = OAR_PIVOT.z, z1 = -.03, w = .022;
      M.quad([t, [-w, y0, z0]], [t, [w, y0, z0]], [t, [w, y1, z1]], [t, [-w, y1, z1]], { ...o, out: [t * 4, 0, -5] });
      M.quad([t, [-w * 2.2, y1 - s * .09, z1 + .025]], [t, [w * 2.2, y1 - s * .09, z1 + .025]], [t, [w * 2.2, y1, z1]], [t, [-w * 2.2, y1, z1]], { ...o, out: [t * 4, 0, -5] });   // 노깃
    }
  }
}
export function buildShip(lod) {
  const M = new Mesh();
  hull(M, lod ? 12 : 6); shell(M, lod ? 10 : 5, lod > 1 ? 8 : lod ? 6 : 4); dragon(M, lod > 1); flag(M);
  if (lod) oars(M, lod > 1 ? 8 : 5);
  return M.buffer();
}

// ── 셰이더 ──────────────────────────────────────────────────────────────────────────────────────
const VS = `#version 300 es
precision highp float;
in float a_x;in vec3 a_p;in vec3 a_n;in float a_part;in float a_slot;
in vec3 i_o;in vec3 i_F;in vec3 i_R;in vec3 i_U;in vec2 i_LW;in vec3 i_rgb;in float i_flag;in float i_seed;
uniform mat4 u_matrix;uniform float u_unit,u_time;
out vec3 v_loc;out vec3 v_n;flat out vec3 v_rgb;flat out float v_part;flat out float v_slot;flat out vec2 v_LW;flat out float v_seed;
void main(){
  float L=i_LW.x,W=i_LW.y;vec3 p=a_p;vec3 nn=a_n;float x=a_x*L;
  bool moving=mod(floor(i_flag/4.),2.)>.5;
  if(a_part==${P_OAR}.){   // 노: 걸린 자리 둘레로 앞뒤로 젓고, 돌아올 때 물에서 든다(배가 멈춰 있으면 가만히)
    float s=sign(p.y),ph=u_time*2.6+i_seed*6.283,sw=moving?sin(ph)*.42:0.,lift=moving?max(0.,cos(ph))*.07:0.;
    vec2 d=vec2(p.x,p.y-s*${OAR_PIVOT.y});float c=cos(sw*s),sn=sin(sw*s);
    d=vec2(c*d.x-sn*d.y,sn*d.x+c*d.y);p.x=d.x;p.y=d.y+s*${OAR_PIVOT.y};p.z+=lift*abs(d.y)/.22;
  }
  if(a_part==${P_FLAG}.){float k=clamp((.12-p.x)/.48,0.,1.);p.y+=sin(u_time*3.1+p.x*9.+i_seed*20.)*.06*k;}   // 깃발: 깃대에서 멀수록 펄럭
  vec3 loc=vec3(x+p.x*W,p.y*W,p.z*W);
  vec3 w=i_o+(i_F*loc.x+i_R*loc.y+i_U*loc.z)*u_unit;
  gl_Position=u_matrix*vec4(w,1.);
  v_loc=vec3(a_x,p.y,p.z);v_n=i_F*nn.x+i_R*nn.y+i_U*nn.z;v_rgb=i_rgb;v_part=a_part;v_slot=a_slot;v_LW=i_LW;v_seed=i_seed;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 v_loc;in vec3 v_n;flat in vec3 v_rgb;flat in float v_part;flat in float v_slot;flat in vec2 v_LW;flat in float v_seed;
uniform float u_alpha,u_amb,u_dif,u_dark;uniform vec3 u_pal[${PAL}];uniform vec3 u_light;
out vec4 o;
float ink(float d){float a=max(.02,fwidth(d)*.7);return 1.-smoothstep(-a,a,d);}
void main(){
  int part=int(v_part+.5);float L=v_LW.x,W=v_LW.y,ax=v_loc.x*L/W;   // ax: 고물에서 앞으로, W 단위
  vec3 col=u_pal[int(v_slot+.5)];float glow=0.;
  float detail=smoothstep(7.,16.,W);
  if(part==${P_HULL}){   // 몸통: 널판 줄, 뱃전 아래 노선 색 띠, 그 밑 총통 구멍
    float z=v_loc.z,g=.3+.1*pow(abs(2.*v_loc.x-1.),2.);
    col=mix(col,u_pal[${S_WOOD_DARK}],ink(abs(fract(z/.075)-.5)*.075-.006)*.55*detail);
    col=mix(col,v_rgb,ink(abs(z-(g-.045))-.032));
    float cell=fract(ax/.36)-.5,port=ink(max(abs(cell)*.36-.045,abs(z-.17)-.035))*step(.12,v_loc.x)*step(v_loc.x,.88);
    col=mix(col,mix(u_pal[${S_INK}],u_pal[${S_LAMP}],u_dark),port*detail);glow=port*detail*u_dark;
  }else if(part==${P_SHELL}){   // 등딱지: 육각 철갑, 이음마다 쇠못
    vec2 q=vec2(ax,v_loc.y*1.15+v_loc.z*.6)/.16;
    vec2 r=vec2(1.,1.732),h=r*.5,a=mod(q,r)-h,b=mod(q-h,r)-h,gv=dot(a,a)<dot(b,b)?a:b;
    float e=max(abs(gv.x)*.866+abs(gv.y)*.5,abs(gv.y));   // 육각 칸 안에서 가장자리까지
    col=mix(col,u_pal[${S_SHELL_EDGE}],ink(.47-e)*.85*detail);
    col=mix(col,u_pal[${S_SPIKE}],ink(length(gv)-.13)*detail);
  }else if(part==${P_LINE})col=v_rgb;
  else if(part==${P_HEAD}){col=mix(col,u_pal[${S_GOLD}],ink(abs(v_loc.z-.5)-.012)*detail);}   // 용머리: 금빛 눈썹 줄
  else if(part==${P_BOW}){   // 이물판의 귀면: 붉은 얼굴에 흰 눈 · 이빨
    vec2 f=vec2(v_loc.y,v_loc.z-.17);
    col=mix(col,u_pal[${S_WHITE}],ink(length(vec2(abs(f.x)-.08,f.y-.05))-.035)*detail);
    col=mix(col,u_pal[${S_INK}],ink(length(vec2(abs(f.x)-.08,f.y-.05))-.015)*detail);
    col=mix(col,u_pal[${S_WHITE}],ink(max(abs(f.x)-.1,abs(f.y+.05)-.018))*ink(abs(fract(f.x/.04)-.5)*.04-.012)*detail);
  }else if(part==${P_FLAG})col=mix(v_rgb,u_pal[${S_WHITE}],1.-ink(abs(v_loc.z-.77)-.105));   // 깃발: 노선 색, 흰 테두리
  float nl=length(v_n),d=nl>1e-6?abs(dot(v_n/nl,u_light)):0.;
  col*=u_amb+u_dif*d;col=mix(col,u_pal[${S_LAMP}],glow*.8);
  o=vec4(col,1.)*u_alpha;
}`;

const DEFAULT_STYLE = { wood: '#5A3E2B', woodDark: '#3B2A1E', shell: '#4E5B4A', shellEdge: '#2F3A31', spike: '#C9C3B0', red: '#B23A2A', gold: '#D9A43A', white: '#F2EBDC', ink: '#17120E', oar: '#8A6A4A', lamp: '#FFC874' };

export class TurtleShips {
  static last = null;   // 마지막 프레임에 그린 것(캡처 스크립트가 읽는다)
  constructor(style) {
    const S = { ...DEFAULT_STYLE, ...(style || {}) };
    this.pal = new Float32Array(PAL * 3);
    [S.wood, S.woodDark, S.shell, S.shellEdge, S.spike, S.red, S.gold, S.white, S.ink, S.oar, S.lamp].forEach((h, i) => this.pal.set(hexRGB(h), i * 3));
    this.inst = new Float32Array(INST * 256); this.n = 0; this.M = new Float32Array(16); this.flip = 0; this.seeds = new Map();
  }
  init(gl) {
    if (this.p) return;
    this.p = compile(gl, VS, FS);
    const inst = ['i_o', 'i_F', 'i_R', 'i_U', 'i_LW', 'i_rgb', 'i_flag', 'i_seed'];
    this.attr = Object.fromEntries(['a_x', 'a_p', 'a_n', 'a_part', 'a_slot', ...inst].map(n => [n, gl.getAttribLocation(this.p, n)]));
    this.uni = Object.fromEntries(['u_matrix', 'u_unit', 'u_time', 'u_alpha', 'u_amb', 'u_dif', 'u_dark', 'u_pal', 'u_light'].map(n => [n, gl.getUniformLocation(this.p, n)]));
    this.meshes = new Map(); const A = this.attr, ptrs = [[A.a_x, 1, 0], [A.a_p, 3, 4], [A.a_n, 3, 16], [A.a_part, 1, 28], [A.a_slot, 1, 32]];
    for (const lod of [0, 1, 2]) {
      const data = buildShip(lod), b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const va = gl.createVertexArray(); gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      for (const [loc, size, off] of ptrs) if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, off) }
      gl.bindVertexArray(null); this.meshes.set(lod, { b, va, n: data.length / 9 });
    }
    this.ib = [gl.createBuffer(), gl.createBuffer()]; this.cap = 0;
  }
  begin(ox, oy) { this.ox = ox; this.oy = oy; this.n = 0 }
  // 배 한 척: 선로 위 틀(fr: 고물 밑 가운데, F, R, U — 메르카토르), 길이 L · 폭 W(px), 노선 색, 가는 중인지, 열차 id(노 젓는 박자)
  ship(fr, L, W, rgb, moving, key) {
    for (let k = 0; k < 12; k++) if (!Number.isFinite(fr[k])) return;
    if ((this.n + 1) * INST > this.inst.length) { const g = new Float32Array(this.inst.length * 2); g.set(this.inst); this.inst = g }
    const d = this.inst, i = this.n * INST;
    d[i] = fr[0] - this.ox; d[i + 1] = fr[1] - this.oy; d[i + 2] = fr[2]; for (let k = 0; k < 9; k++) d[i + 3 + k] = fr[3 + k];
    d[i + 12] = L; d[i + 13] = W; d[i + 14] = rgb[0]; d[i + 15] = rgb[1]; d[i + 16] = rgb[2]; d[i + 17] = moving ? 4 : 0;
    let s = this.seeds.get(key); if (s == null) { s = fnv1a(String(key)) / 4294967296; if (this.seeds.size > 4096) this.seeds.clear(); this.seeds.set(key, s) }
    d[i + 18] = s; this.n++;
  }
  // o: zoom, unit(px 하나의 메르카토르), walls(버퍼에 건물 깊이), occlude(벽 뒤 몫의 알파), dark, time(초)
  draw(gl, M, ox, oy, o) {
    if (!this.n || !this.p) { TurtleShips.last = { n: 0 }; return }
    const MT = this.M; MT.set(M); for (let r = 0; r < 4; r++) MT[12 + r] = M[r] * ox + M[4 + r] * oy + M[12 + r];
    this.flip ^= 1; gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip]);
    if (this.cap < this.inst.length) { gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip ^ 1]); gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip]); this.cap = this.inst.length }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, this.n * INST);
    const W = this.inst[13], lod = W < LOD_MID ? 0 : W < LOD_HI ? 1 : 2, m = this.meshes.get(lod);
    const at = []; for (let k = 0; k < Math.min(this.n, 40); k++) at.push([this.inst[k * INST] + ox, this.inst[k * INST + 1] + oy, this.inst[k * INST + 2]]);   // 배 자리(메르카토르): 캡처가 배를 찾아 간다
    TurtleShips.last = { n: this.n, lod, W, L: this.inst[12], zoom: o.zoom, at };
    gl.useProgram(this.p); gl.bindVertexArray(m.va); gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip]);
    for (const [n, size, off] of [['i_o', 3, 0], ['i_F', 3, 12], ['i_R', 3, 24], ['i_U', 3, 36], ['i_LW', 2, 48], ['i_rgb', 3, 56], ['i_flag', 1, 68], ['i_seed', 1, 72]]) {
      const loc = this.attr[n]; if (loc < 0) continue; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, INST * 4, off); gl.vertexAttribDivisor(loc, 1);
    }
    const U = this.uni; gl.uniformMatrix4fv(U.u_matrix, false, MT); gl.uniform1f(U.u_unit, o.unit); gl.uniform1f(U.u_time, o.time ?? performance.now() / 1000);
    gl.uniform1f(U.u_amb, o.dark ? .5 : .62); gl.uniform1f(U.u_dif, o.dark ? .22 : .42); gl.uniform1f(U.u_dark, o.dark ? 1 : 0); gl.uniform3fv(U.u_pal, this.pal); gl.uniform3fv(U.u_light, SUN);
    gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST);
    const pass = alpha => { gl.uniform1f(U.u_alpha, alpha); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, this.n) };
    gl.depthMask(false);
    if (o.walls && o.occlude) { gl.depthFunc(gl.GREATER); pass(o.occlude) }   // 건물 뒤: 희미하게(배 제 깊이를 쓰기 전에)
    gl.depthFunc(gl.LEQUAL); gl.depthMask(true); pass(1); gl.depthMask(false);
    for (const n of ['i_o', 'i_F', 'i_R', 'i_U', 'i_LW', 'i_rgb', 'i_flag', 'i_seed']) { const loc = this.attr[n]; if (loc >= 0) gl.vertexAttribDivisor(loc, 0) }
    gl.bindVertexArray(null); gl.depthFunc(gl.LEQUAL);
  }
  dispose(gl) {
    if (!this.p) return;
    for (const m of this.meshes.values()) { gl.deleteBuffer(m.b); gl.deleteVertexArray(m.va) }
    for (const b of this.ib) gl.deleteBuffer(b);
    gl.deleteProgram(this.p); this.p = null;
  }
}
export default TurtleShips;
