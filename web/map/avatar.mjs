// 내 위치 캐릭터: 줌 15 부터 노란 점 대신 열차 캔버스에 서 있는 작은 3D 사람. 걸으면 다리 · 팔을 흔들고, 서 있으면 가만히 선다.
// 모양은 이름으로 등록해 바꿔 쓴다(registerAvatar — 모양 파일은 web/map/avatars/, 본체가 첫 화면에서 등록한다). 어느 모양인지는 모드 설정 me.look.
// 다른 화면 파일을 import 하지 않는다: 본체가 위치를 넣고(createMyMotion) overlay 가 그린다(AvatarRenderer).
const RAD = Math.PI / 180;
export const AVATAR_MINZOOM = 15;   // 이 줌부터 캐릭터, 아래는 지금처럼 노란 점(map/layers.mjs 의 me 층 maxzoom)
// 키(px): 줌 15 에서 34 px, 18 에서 46 px — 버스(줌 15 길이 37 px)와 비슷한 크기
export function avatarScale(zoom) { return 34 + Math.max(0, Math.min(3, zoom - 15)) * 4 }

// 모양 등록: {build({box, quad}), rig: {hip, shoulder}, name}. 좌표는 x = 앞(얼굴), y = 왼쪽, z = 위, 발바닥 0 · 키 1.
// part: 'body'(머리 포함, 안 움직임) · 'legL' · 'legR'(z = rig.hip 을 축으로 흔듦) · 'armL' · 'armR'(z = rig.shoulder 축, 다리와 반대)
const LOOKS = new Map();
export function registerAvatar(id, look) { LOOKS.set(id, look) }
export function avatarLooks() { return [...LOOKS.keys()] }

const PARTS = { body: 0, legL: 1, legR: 2, armL: 3, armR: 4 };
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
// 꼭짓점: 자리 3 · 법선 3 · 색 3 · 부위 1 · 축(x, z) 2 = 12 float. 부위 5 = 바닥 그림자(축 칸에 원 안 좌표 −1~1)
export function buildAvatarMesh({ build, rig }) {
  const data = [];
  const put = (p, n, rgb, part, pivot) => data.push(...p, ...n, ...rgb, part, ...pivot);
  const quad = (a, b, c, d, n, color, part = 'body', pivot = null) => {
    const P = [a, b, c, d], k = PARTS[part] ?? 0, rgb = hex(color);
    // 축: 다리 · 팔은 이 면들의 x 가운데(상자는 아래 box 가 상자 가운데를 넘긴다)
    const pv = pivot || [(Math.min(a[0], b[0], c[0], d[0]) + Math.max(a[0], b[0], c[0], d[0])) / 2, k === 1 || k === 2 ? rig.hip : k ? rig.shoulder : 0];
    for (const i of [0, 1, 2, 0, 2, 3]) put(P[i], n, rgb, k, pv);
  };
  const box = (x0, y0, z0, x1, y1, z1, color, part = 'body') => {
    const k = PARTS[part] ?? 0, pv = [(x0 + x1) / 2, k === 1 || k === 2 ? rig.hip : k ? rig.shoulder : 0];
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],color,part,pv);
    quad([x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[0,1,0],color,part,pv);
    quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0],color,part,pv);
    quad([x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[-1,0,0],color,part,pv);
    quad([x0,y1,z1],[x1,y1,z1],[x1,y0,z1],[x0,y0,z1],[0,0,1],color,part,pv);
    quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1],color,part,pv);
  };
  build({ box, quad });
  // 바닥 그림자: 발밑의 옅은 원(먼저, 깊이 없이 그린다)
  const S = .42, sh = [[-S,-S,-1,-1],[S,-S,1,-1],[S,S,1,1],[-S,-S,-1,-1],[S,S,1,1],[-S,S,-1,1]];
  const shadow = [];
  for (const [x, y, u, v] of sh) shadow.push(x, y, .004, 0, 0, 1, 0, 0, 0, 5, u, v);
  return { body: new Float32Array(data), shadow: new Float32Array(shadow) };
}

// 움직임: 위치를 받을 때마다 fix(), 그릴 때마다 at(지금) → {lngLat, yaw, walk, phase}.
// GPS 는 서 있어도 몇 m 씩 튄다 — 최근 6초 안에서 3초 넘게 쌓인 이동이 정확도의 반 · 5 m 보다 크고(천천히 걸어도 0.85 m/s 면 잡힌다),
// 그 속도가 사람 걸음(0.5~3 m/s)일 때만 걷는다. 더 빠르면 탄 것(열차 · 버스)으로 보고 서 있는다.
// 화면의 자리는 새 위치로 순간이동하지 않고 0.6초 남짓에 미끄러져 간다(그 사이 걷는 모습).
const M_PER_DEG = 111320;
const metres = (a, b) => { const k = Math.cos(((a[1] + b[1]) / 2) * RAD); return Math.hypot((b[0] - a[0]) * M_PER_DEG * k, (b[1] - a[1]) * M_PER_DEG) };
export function createMyMotion({ now = () => performance.now() } = {}) {
  let fixes = [], shown = null, target = null, yaw = null, walking = false, lastMove = -Infinity, walk = 0, phase = 0, at = null, gap = 1000;
  const WINDOW = 10000, RECENT = 6000, MIN_SPAN = 3000;
  // 멈춘 뒤 서기까지: 2초, 위치가 띄엄띄엄 오면(2~3초 간격) 그 간격의 1.5배 — 다음 위치를 기다리는 동안 섰다 걸었다 깜빡이지 않게(많아야 6초)
  const hold = () => Math.min(6000, Math.max(2000, gap * 1.5));
  return {
    // pos: GeolocationPosition 모양({coords:{longitude, latitude, accuracy}, timestamp}). t 는 받은 때(now 시계)
    fix(pos, t = now()) {
      const c = pos.coords, p = [c.longitude, c.latitude], acc = Number.isFinite(c.accuracy) ? c.accuracy : 30;
      if (!shown || metres(shown, p) > 200) { shown = p.slice(); fixes = [] }   // 처음 · 멀리 뛰면 그 자리로
      if (fixes.length) gap = t - fixes[fixes.length - 1].t;
      target = p; fixes.push({ p, t, acc }); while (fixes.length > 1 && t - fixes[0].t > WINDOW) fixes.shift();
      const recent = fixes.filter(f => t - f.t <= RECENT), a = recent[0], d = metres(a.p, p), span = t - a.t, speed = span > 0 ? d / (span / 1000) : 0;
      const meanAcc = recent.reduce((s, f) => s + f.acc, 0) / recent.length;
      const moved = span >= MIN_SPAN && d > Math.max(5, meanAcc * .5) && speed >= .5;
      if (moved && speed <= 3) { walking = true; lastMove = t }
      else if (moved) walking = false;   // 탄 것: 서 있는다(방향은 바꾼다)
      else if (t - lastMove > hold()) walking = false;
      // 방향: 움직이는 동안, 지금 자리에서 3 m 넘게 떨어진 가장 가까운 지난 위치 → 지금(메르카토르 x 동 · y 남 — 버스 yaw 와 같다)
      if (moved || walking) for (let i = fixes.length - 2; i >= 0; i--) {
        const q = fixes[i].p; if (metres(q, p) <= 3) continue;
        yaw = Math.atan2(-(p[1] - q[1]), (p[0] - q[0]) * Math.cos(p[1] * RAD)); break;
      }
    },
    has: () => !!shown,
    shown: () => shown && shown.slice(),   // 지금 그린 자리(파장 · 열차 캔버스가 같이 쓴다), 아직 없으면 null
    // 이 프레임의 모습. 움직이는 중이면 animating true(부르는 쪽이 다음 프레임을 부탁한다)
    at(t = now()) {
      if (!shown) return null;
      const dt = at == null ? 0 : Math.min(.25, Math.max(0, (t - at) / 1000)); at = t;
      if (t - lastMove > hold()) walking = false;
      const k = 1 - Math.exp(-dt / .25);
      shown[0] += (target[0] - shown[0]) * k; shown[1] += (target[1] - shown[1]) * k;
      walk += ((walking ? 1 : 0) - walk) * (1 - Math.exp(-dt / .15));
      phase = (phase + dt * 1.7 * Math.max(walk, .001)) % 1;   // 걸음 1.7 번/초, 멈추면 그 자리에서 다리를 모은다(진폭 walk)
      const gliding = metres(shown, target) > .05;
      return { lngLat: shown.slice(), yaw, walk, phase, animating: gliding || walk > .01 };
    },
    get walking() { return walking },
  };
}

const VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_normal; layout(location=2) in vec3 a_color;
layout(location=3) in float a_part; layout(location=4) in vec2 a_pivot;
uniform mat4 u_matrix; uniform vec4 u_pose; uniform float u_unit,u_walk,u_phase;
out vec3 v_normal; out vec3 v_color; out vec2 v_disc; flat out float v_part;
void main(){vec3 p=a_pos,n=a_normal;float ph=6.2832*u_phase,a=0.;
  // 다리: 엉덩이 축, 왼발 · 오른발 반대 박자. 팔: 어깨 축, 같은 쪽 다리와 반대
  if(a_part>.5&&a_part<2.5)a=u_walk*.5*sin(ph)*(a_part<1.5?1.:-1.);
  else if(a_part>2.5&&a_part<4.5)a=-u_walk*.4*sin(ph)*(a_part<3.5?1.:-1.);
  if(a!=0.){float ca=cos(a),sa=sin(a);vec2 d=vec2(p.x-a_pivot.x,p.z-a_pivot.y);p.x=a_pivot.x+ca*d.x-sa*d.y;p.z=a_pivot.y+sa*d.x+ca*d.y;
    n=vec3(ca*n.x-sa*n.z,n.y,sa*n.x+ca*n.z);}
  if(a_part<4.5)p.z+=u_walk*.03*abs(sin(ph));   // 걸음마다 살짝 들썩(그림자는 바닥에)
  float c=cos(u_pose.z),s=sin(u_pose.z);vec3 w=p*u_pose.w*u_unit;w.xy=vec2(c*w.x-s*w.y,s*w.x+c*w.y)+u_pose.xy;
  gl_Position=u_matrix*vec4(w,1.);v_normal=vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z);v_color=a_color;v_part=a_part;v_disc=a_pivot;}`;
const FS = `#version 300 es
precision highp float;in vec3 v_normal;in vec3 v_color;in vec2 v_disc;flat in float v_part;uniform float u_fade,u_dark;out vec4 o;
void main(){vec3 col=v_color;float alpha=1.;
  if(v_part>4.5){float d=length(v_disc);alpha=mix(.24,.4,u_dark)*(1.-smoothstep(.3,1.,d));col=vec3(.05,.06,.06);}
  else col*=.74+.26*max(dot(normalize(v_normal),normalize(vec3(-.5,.65,1.))),0.);   // 버스와 같은 빛
  alpha*=u_fade;if(alpha<.005)discard;o=vec4(col*alpha,alpha);}`;

export class AvatarRenderer {
  constructor() { this.matrix = new Float32Array(16) }
  init(gl) {
    if (this.gl === gl && this.p) return;
    this.gl = gl; this.p = gl.createProgram(); this.meshes = new Map();
    for (const [kind, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const s = gl.createShader(kind); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      gl.attachShader(this.p, s); gl.deleteShader(s);
    }
    gl.linkProgram(this.p); if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.p));
    this.u = Object.fromEntries(['matrix', 'pose', 'unit', 'walk', 'phase', 'fade', 'dark'].map(k => [k, gl.getUniformLocation(this.p, 'u_' + k)]));
  }
  // 모양마다 한 번 짓는다(몸 · 그림자 두 묶음)
  mesh(id) {
    let m = this.meshes.get(id); if (m) return m;
    const look = LOOKS.get(id); if (!look) return null;
    const gl = this.gl, built = buildAvatarMesh(look);
    m = Object.fromEntries(Object.entries(built).map(([k, data]) => {
      const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      for (const [loc, n, off] of [[0, 3, 0], [1, 3, 3], [2, 3, 6], [3, 1, 9], [4, 2, 10]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 48, off * 4) }
      return [k, { vao, buf, count: data.length / 12 }];
    }));
    gl.bindVertexArray(null); this.meshes.set(id, m); return m;
  }
  // world: 메르카토르 [x, y], yaw: 앞 방향(라디안, 버스와 같음), scale: 키 px, unit: 1/(512·2^줌),
  // occlude: 건물 뒤에 가린 부분을 비치게 그릴 불투명도(열차 · 버스와 같은 자리에서)
  render(gl, matrix, { look = null, world, origin, yaw, scale, unit, walk = 0, phase = 0, dark = false, occlude = 0 }) {
    this.init(gl); const m = this.mesh(look) || this.mesh(LOOKS.keys().next().value); if (!m) return;
    this.matrix.set(matrix); for (let i = 0; i < 4; i++) this.matrix[12 + i] = matrix[i] * origin[0] + matrix[4 + i] * origin[1] + matrix[12 + i];
    gl.useProgram(this.p); gl.uniformMatrix4fv(this.u.matrix, false, this.matrix);
    gl.uniform4f(this.u.pose, world[0] - origin[0], world[1] - origin[1], yaw, scale); gl.uniform1f(this.u.unit, unit);
    gl.uniform1f(this.u.walk, walk); gl.uniform1f(this.u.phase, phase); gl.uniform1f(this.u.dark, dark ? 1 : 0);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const draw = (b, fade, func, write) => { gl.uniform1f(this.u.fade, fade); gl.depthFunc(func); gl.depthMask(write); gl.bindVertexArray(b.vao); gl.drawArrays(gl.TRIANGLES, 0, b.count) };
    draw(m.shadow, 1, gl.LEQUAL, false);
    if (occlude > 0) draw(m.body, occlude, gl.GREATER, false);   // 건물 뒤: 비치게(깊이를 쓰기 전)
    draw(m.body, 1, gl.LEQUAL, true);
    gl.bindVertexArray(null); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
  }
  dispose() {
    if (!this.gl) return; const gl = this.gl;
    for (const m of this.meshes.values()) for (const b of Object.values(m)) { gl.deleteBuffer(b.buf); gl.deleteVertexArray(b.vao) }
    gl.deleteProgram(this.p); this.p = null; this.gl = null;
  }
}
