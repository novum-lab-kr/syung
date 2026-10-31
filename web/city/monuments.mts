// 기념물(우리나라 문화유산) 그리기: 셰이더 · 배치 · 구역별 메시 올리기. 모델은 구역 파일(monuments_gyeongbok.mts …)이 짓고
// 이 파일은 화면에 닿은 구역만 import() 로 받는다(web/city/landmarks.mts 가 이 파일을 부른다 — 첫 화면에는 없다).
// 고정 규칙: 어느 모드 · 테마에서나 같은 모델 · 같은 실물 색(색표는 monument_parts.mts COLORS 하나). 낮 · 밤 조명만 달라진다.
// 자리 · 방향 · 구역은 monuments_data.mts. three.js 를 쓰지 않는 날 WebGL 메시(데스크톱 · 휴대폰 같은 모델).
import { MONUMENTS, GATE_DECK_Z, GATE_BASE_D, palaceRing } from './monuments_data.mts';
import { MU, toM } from './life.mts';
import { compileProgram } from './traffic.mts';
import { STRIDE, COLORS, hex } from './monument_parts.mts';
import { PalaceTorches } from './monument_torches.mts';
import { PalaceTrees } from './monument_trees.mts';
import { cityMinZoom, cityGrow, cityFarFade } from './zoom_gate.mts';   // 도시 건물과 같은 보이는 줌 · 자라기 · 폰의 먼 곳 줄이기

// 구역 파일(구역이 늘면 한 줄씩 — 닿은 구역만 받는다)
const ZONES:Record<string, () => Promise<{ buildMonument:(id:string) => Float32Array }>> = {
  gyeongbok: () => import('./monuments_gyeongbok.mts'),
};

// ── 그리기 ────────────────────────────────────────────────────────────────────────────────────────────────
const VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in vec2 a_kind;
uniform mat4 u_matrix; uniform float u_mu, u_grow; uniform vec2 u_at, u_rot;   // u_grow: 줌 · 거리에 따른 높이 비율(도시 건물의 u_grow 와 같은 값)
out vec3 v_n, v_p; out vec2 v_k;
void main(){
  v_p = a_pos; v_k = a_kind;
  vec2 q = vec2(a_pos.x * u_rot.x - a_pos.y * u_rot.y, -(a_pos.x * u_rot.y + a_pos.y * u_rot.x));   // 모델(동 · 북) → 방향을 돌려 지역 미터(남쪽이 +y)
  v_n = vec3(a_nrm.x * u_rot.x - a_nrm.y * u_rot.y, -(a_nrm.x * u_rot.y + a_nrm.y * u_rot.x), a_nrm.z);
  gl_Position = u_matrix * vec4((u_at + q) * u_mu, a_pos.z * u_mu * u_grow, 1.);
}`;
const FS = `#version 300 es
precision highp float; in vec3 v_n, v_p; in vec2 v_k; uniform vec3 u_light; uniform vec2 u_lit; uniform float u_night; uniform vec3 u_col[21];
out vec4 o;
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float line(float x, float w){ float f = abs(fract(x) - .5) * 2.; return 1. - smoothstep(1. - w, 1., f); }
void main(){
  vec3 n = normalize(v_n); float d = max(dot(n, u_light), 0.), sky = .5 + .5 * n.z, side = 1. - abs(n.z);
  int k = int(v_k.x + .5); float s = v_k.y; vec3 c = u_col[k];
  float along = abs(n.y) > abs(n.x) ? v_p.x : v_p.y;   // 그 면을 따라 가는 가로 좌표
  if (k == 0) {   // 화강암 마름돌: 단(약 0.62 m) 줄눈 + 엇갈린 세로 줄눈, 돌마다 조금씩 다른 밝기
    float rows = v_p.z / .62, row = floor(rows), cols = (along + row * .83) / 1.6, cell = floor(cols);
    float jr = min(fract(rows), 1. - fract(rows)), jc = min(fract(cols), 1. - fract(cols)) * 1.6 / .62;
    float joint = (1. - smoothstep(0., .04, min(jr, jc))) * (1. - smoothstep(.3, .8, fwidth(rows)));
    if (side > .5) c *= (.94 + .09 * hash(vec2(cell, row))) * (1. - .22 * joint);
  } else if (k == 3) {   // 단청: 창방 띠(뇌록 바탕에 흰 점줄) · 공포(덩어리가 교대로 붉고 푸르게)
    float m = fract(along / 1.55), blk = step(.18, m) * step(m, .82), idx = floor(along / 1.55);
    vec3 blue = vec3(.17, .36, .56), white = vec3(.9, .88, .8), red = u_col[2];
    if (s < .3) c = mix(c, white, step(abs(fract(along / .5) - .5), .1) * .55);
    else if (s < .88) { vec3 head = mod(idx, 2.) < 1. ? red : blue; c = mix(c * .55, mix(c, head, .8), blk); c = mix(c, white, step(abs(s - .6), .03) * blk * .8); }
    else c = mix(c, white, step(abs(fract(along / .45) - .5), .13) * .6);
  } else if (k == 4) {   // 검은 띠: 일정한 간격의 연한 사각 무늬(화방)
    float m = fract(along / 3.2); float panel = step(.3, m) * step(m, .7) * step(.2, fract(v_p.z)) * step(fract(v_p.z), .8);
    c = mix(c, vec3(.82, .8, .74), panel * (side > .5 ? .8 : 0.));
  } else if (k == 5) {   // 기와: 내려가는 기와골, 마루는 밝은 골
    float g = line(s / .5, .45); c *= 1. - .17 * g; c *= .96 + .06 * hash(vec2(floor(s / .5), floor(v_p.z * 1.4)));
  } else if (k == 8) { c = mix(c, u_col[2], step(.5, fract(s / .4)) * .85); }   // 처마 끝: 서까래 머리(붉은 단청 점)
  else if (k == 10) { c = mix(c * .8, u_col[2], line(s / .36, .22) * .5); }
  else if (k == 7) { if (side > .5) c *= 1. - .3 * line(along / .34, .28); }
  else if (k == 9) {   // 현판: 검은 바탕 · 금빛 테두리 · 금빛 글자 덩어리 셋
    float u = (v_p.x + 2.5) / 5., v = s; vec3 gold = vec3(.85, .65, .24);
    float edge = step(u, .035) + step(.965, u) + step(v, .09) + step(.91, v);
    float glyph = (step(.12, u) * step(u, .3) + step(.42, u) * step(u, .58) + step(.7, u) * step(u, .88)) * step(.2, v) * step(v, .8) * step(.35, hash(floor(vec2(u * 18., v * 8.))));
    c = mix(c, gold, clamp(edge + glyph, 0., 1.));
  } else if (k == 14) {   // 궁장 벽돌: 작은 벽돌 줄(약 0.1 m 단)과 엇갈린 줄눈
    float rows = v_p.z / .11, row = floor(rows), cols = (along + row * .5 * .26) / .26;
    float jr = min(fract(rows), 1. - fract(rows)), jc = min(fract(cols), 1. - fract(cols)) * .26 / .11;
    float joint = (1. - smoothstep(0., .1, min(jr, jc))) * (1. - smoothstep(.3, .8, fwidth(rows)));
    c *= (.93 + .1 * hash(vec2(floor(cols), row))) * (1. - .2 * joint);
  } else if (k == 15) {   // 공포: 덩어리마다 붉고 푸르게(단청)
    c = mod(floor(along / 1.55 + .5), 2.) < 1. ? u_col[2] : vec3(.17, .36, .56);
  } else if (k == 11) {   // 월대 바닥: 큰 판석
    c *= 1. - .1 * max(line(v_p.x / 1.8, .06), line(v_p.y / 1.8, .06));
  } else if (k == 18) {   // 동상 받침: 큰 판석 줄눈이 아주 옅게
    if (side > .5) c *= 1. - .1 * max(line(v_p.z / 2.6, .035), line(along / 3.4, .035));
  } else if (k == 19) {   // 회벽: 기둥 사이 칸마다 아주 옅은 세로 결
    if (side > .5) c *= .96 + .06 * hash(vec2(floor(along / 2.4), 3.));
  } else if (k == 20) {   // 창호(한지 창): 가는 살 격자 — 낮에는 회벽과 거의 같은 색에 살만 옅게
    c *= 1. - .16 * max(line(along / .42, .14), line(v_p.z / .52, .14));
  } else if (k == 2) { c *= .9 + .1 * smoothstep(.0, 1., sky); }
  float lt = u_lit.x * (.72 + .28 * sky) + u_lit.y * d;
  if (u_night < .5) lt *= 1.32;   // 낮: 도시 조명이 모델을 지도보다 어둡게 만들어 사진의 밝은 돌 · 모래색이 눌린다 — 같은 정도로 올린다(밤은 따로)
  vec3 col = c * lt;
  if (u_night > .5) {   // 밤: 달빛에 어둡게, 아래에서 비추는 따뜻한 조명(문화재 야간 조명)이 위로 갈수록 옅게
    float up = exp(-v_p.z / 15.) * (.35 + .65 * side);
    col = c * lt * .42 + c * vec3(1., .78, .52) * (.5 * up + .05);
    if (k == 9) col += vec3(.2, .15, .05) * step(.5, c.r);
    // 안에서 새어 나오는 등불(전각 · 문루): 문 안 · 벽 사이 회벽 · 판문 · 마루 · 처마 밑이 따뜻하게 — 낮 · 라이트에는 이 줄에 들어오지 않는다
    vec3 warm = vec3(1., .62, .28); float flick = .94 + .06 * hash(floor(v_p.xy * .5));
    if (k == 12) col = mix(col, warm * flick, .88);                            // 문 안 · 홍예: 등불이 켜진 속
    else if (k == 20) { float lattice = max(line(along / .42, .14), line(v_p.z / .52, .14)); col = mix(col, warm * flick * (1. - .5 * lattice), .9); }   // 창호만 한지에 비친 등불(살은 어둡게)
    else if (k == 19) col += warm * c * .05;                                    // 회벽 · 합각 · 막힌 벽: 켜지 않는다 — 아주 약한 반사광만
    else if (k == 7) col += warm * (n.z > .5 ? .32 : .2) * c.g * 1.6;            // 판문 · 누마루 마루
    else if (k == 10) col += warm * .2;                                         // 처마 밑: 아래 등불이 비춘다
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`;

interface GLMesh { va:WebGLVertexArrayObject; b:WebGLBuffer; n:number; rect:[number, number, number, number] }   // rect: 지역 미터에서 모델이 덮는 사각 [x0, x1, y0, y1] — 폰의 거리 줄이기에 쓴다
interface Placed { M:(typeof MONUMENTS)[number]; x:number; y:number; rot:[number, number]; mesh:GLMesh | null }
export interface MonumentRender { light:[number, number, number]; lit:number[]; dark:boolean; zoom:number; phone:boolean; center:[number, number] }   // center: 지도 가운데(경위도) — 폰은 도시 건물처럼 멀리 있을수록 줄이다 뺀다

export class Monuments {
  trees = new PalaceTrees();   // 궁 안 나무(경복궁) — 인스턴스로 한 번에
  torches = new PalaceTorches();   // 궁 안 길가 횃불(경복궁) — 밤에만
  declare gl:WebGL2RenderingContext; declare p:WebGLProgram; declare items:Placed[]; declare u:Record<string, WebGLUniformLocation | null>;
  init(gl:WebGL2RenderingContext):void {
    this.gl = gl; this.p = compileProgram(gl, VS, FS);
    this.u = Object.fromEntries(['u_matrix', 'u_mu', 'u_grow', 'u_at', 'u_rot', 'u_light', 'u_lit', 'u_night', 'u_col'].map(name => [name, gl.getUniformLocation(this.p, name)]));
    this.trees.init(gl); this.torches.init(gl);
    this.items = MONUMENTS.map(M => { const [x, y] = toM(M.lngLat[0], M.lngLat[1]), a = M.yawDeg * Math.PI / 180; return { M, x, y, rot: [Math.cos(a), Math.sin(a)], mesh: null } });
  }
  zones = new Map<string, { buildMonument:(id:string) => Float32Array } | Promise<void> | 'fail'>();
  onLoad:(() => void) | null = null;
  // 구역 파일이 아직이면 받기 시작하고 null(그릴 건 다음 프레임부터), 실패하면 그 구역은 그리지 않는다
  mesh(item:Placed):GLMesh | null {
    if (item.mesh) return item.mesh;
    const zone = item.M.zone, got = this.zones.get(zone);
    if (!got || got instanceof Promise || got === 'fail') {
      if (!got) this.zones.set(zone, ZONES[zone]!().then(mod => { this.zones.set(zone, mod); this.onLoad?.() }).catch(error => { this.zones.set(zone, 'fail'); console.warn('기념물 구역 못 받음', zone, error) }));
      return null;
    }
    const gl = this.gl, data = got.buildMonument(item.M.id), va = gl.createVertexArray(), b = gl.createBuffer();
    gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    for (const [loc, size, off] of [[0, 3, 0], [1, 3, 3], [2, 2, 6]] as const) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, off * 4) }
    gl.bindVertexArray(null);
    const [cos, sin] = item.rot; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < data.length; i += STRIDE) { const px = data[i]!, py = data[i + 1]!, wx = item.x + px * cos - py * sin, wy = item.y - (px * sin + py * cos); x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy) }
    return (item.mesh = { va, b, n: data.length / STRIDE, rect: [x0, x1, y0, y1] });
  }
  // 경복궁 안인지(지역 미터) — 도시 나무가 궁 안을 비켜 전용 나무에 자리를 내준다
  palaceM:[number, number][] | null = null;
  inPalace = (x:number, y:number):boolean => {
    const ring = (this.palaceM ??= palaceRing().map(([lng, lat]) => toM(lng, lat)));
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside }
    return inside;
  };
  // 월대 위 보행자를 월대 높이로 들어 올리는 값(도시 생활이 쓴다). 모델 좌표의 월대 사각 = x ±24.35 · y −36.35 … −6.65
  get deck():{ x:number; y:number; cos:number; sin:number; centerY:number; halfX:number; halfY:number; z:number } | null {
    const item = this.items.find(each => each.M.id === 'gwanghwamun'); if (!item) return null;
    return { x: item.x, y: item.y, cos: item.rot[0], sin: item.rot[1], centerY: -GATE_BASE_D / 2 - 14.85, halfX: 24.35, halfY: 14.85, z: GATE_DECK_Z };
  }
  render(gl:WebGL2RenderingContext, MT:Float32Array, { light, lit, dark, zoom, phone, center }:MonumentRender):void {
    if (zoom < cityMinZoom(phone)) return;   // 다른 건물과 같은 줌에서 함께 사라진다
    const grow = cityGrow(phone, zoom); if (grow <= 0) return;   // 문턱에서 높이 0 → 0.6 줌 뒤 전체(도시 건물과 같은 비율)
    const [cx, cy] = toM(center[0], center[1]);
    // 폰: 도시 건물처럼 화면 가운데에서 멀수록 땅으로 가라앉다 뺀다(사각까지의 거리 — 건물 조각의 가까운 가장자리와 같은 잣대)
    const keep = (rect:[number, number, number, number]) => phone ? cityFarFade(Math.hypot(Math.max(rect[0] - cx, 0, cx - rect[1]), Math.max(rect[2] - cy, 0, cy - rect[3])), zoom) : 1;
    const u = this.u, palette = new Float32Array(COLORS.flatMap(hex));
    gl.useProgram(this.p); gl.uniformMatrix4fv(u.u_matrix!, false, MT); gl.uniform1f(u.u_mu!, MU); gl.uniform3fv(u.u_light!, light); gl.uniform2fv(u.u_lit!, lit); gl.uniform1f(u.u_night!, dark ? 1 : 0); gl.uniform3fv(u.u_col!, palette);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    let ready = true; const palaceRect:[number, number, number, number] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const item of this.items) {
      const m = this.mesh(item); if (!m) { ready = false; continue }
      if (item.M.id.startsWith('palace-')) { palaceRect[0] = Math.min(palaceRect[0], m.rect[0]); palaceRect[1] = Math.max(palaceRect[1], m.rect[1]); palaceRect[2] = Math.min(palaceRect[2], m.rect[2]); palaceRect[3] = Math.max(palaceRect[3], m.rect[3]) }
      const g = grow * keep(m.rect); if (g <= 0) continue;
      gl.uniform1f(u.u_grow!, g); gl.uniform2f(u.u_at!, item.x, item.y); gl.uniform2fv(u.u_rot!, item.rot); gl.bindVertexArray(m.va); gl.drawArrays(gl.TRIANGLES, 0, m.n);
    }
    gl.bindVertexArray(null);
    // 궁 안 나무 · 횃불은 궁 건물 메시가 다 준비된 뒤에만(지연 로드 중 · 실패 때 나무 · 횃불만 허공에 뜨지 않게)
    if (!ready) return;
    const palaceGrow = grow * keep(palaceRect); if (palaceGrow <= 0) return;
    this.trees.render(gl, MT, { light, lit, dark, grow: palaceGrow }); this.torches.render(gl, MT, { dark, grow: palaceGrow });
  }
  dispose():void {   // 모드를 나가면 GL 자원을 치운다
    const gl = this.gl; for (const item of this.items) if (item.mesh) { gl.deleteBuffer(item.mesh.b); gl.deleteVertexArray(item.mesh.va); item.mesh = null }
    gl.deleteProgram(this.p); this.trees.dispose(); this.torches.dispose();
  }
}
