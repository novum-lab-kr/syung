// 스타크래프트 유닛 모양(unit_shapes.mjs — Codex 시안)을 그리는 쪽에 넘기는 도우미. 첫 화면 코드다: 버스 모양은 버스 렌더러가 처음 그리기 전에
// 등록해야 해서(registerBusLook) 본체가 첫 화면에서 부른다. 지하철 행렬(convoy.mjs)은 모드 코드 받기로 늦게 오고 이 파일의 삼각형을 쓴다.
// 모양 좌표: x 앞 · y 왼쪽 · z 위, 폭 1(지하철 몸 폭 · 버스 폭), x ∈ [-len/2, len/2]. 색은 palette 번호 또는 'line'(노선 · 버스 종류 색).
// part: body · legA · legB(걷는 동안 z = rig.hip 을 축으로 흔듦, A 와 B 는 반대 박자 — 축의 x 는 그 상자 x 가운데)
import { meshBuilder } from '../../bus/mesh.mjs';
import { UNIT_SHAPES } from './unit_shapes.mjs';

export { UNIT_SHAPES };
export const LINE = 'line';
const LEG = { body: 0, legA: 1, legB: -1 };

// 모양 하나의 삼각형: [{p:[x,y,z], n:[x,y,z], color, leg(0 · 1 · -1), pivot:[x, z]}] — 세 개씩 한 삼각형. scale 은 모든 좌표에 곱한다
export function shapeTriangles(shape, scale = 1) {
  const out = [], hip = (shape.rig?.hip ?? 0) * scale;
  const quad = (a, b, c, d, n, color, part = 'body', px = null) => {
    const leg = LEG[part] ?? 0, P = [a, b, c, d].map(v => v.map(x => x * scale));
    const pivot = [px ?? (Math.min(P[0][0], P[1][0], P[2][0], P[3][0]) + Math.max(P[0][0], P[1][0], P[2][0], P[3][0])) / 2, hip];
    for (const i of [0, 1, 2, 0, 2, 3]) out.push({ p: P[i], n, color, leg, pivot });
  };
  const box = (x0, y0, z0, x1, y1, z1, color, part = 'body') => {
    const px = (x0 + x1) / 2 * scale;   // 다리 축: 상자 가운데
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],color,part,px);
    quad([x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[0,1,0],color,part,px);
    quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0],color,part,px);
    quad([x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[-1,0,0],color,part,px);
    quad([x0,y1,z1],[x1,y1,z1],[x1,y0,z1],[x0,y0,z1],[0,0,1],color,part,px);
    quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1],color,part,px);
  };
  shape.build({ box, quad: (a, b, c, d, n, color, part) => quad(a, b, c, d, n, color, part) });
  return out;
}

// 버스 렌더러용 메시(web/bus/mesh.mjs 의 꼭짓점 — 자리 3 · 법선 3 · uv 2 · 재료 1): 'line' 은 재료 39(버스 종류 색), palette i 는 재료 40 + i,
// 다리는 재료에 100 을 더하고 uv = (축 x, ±엉덩이 높이 — 부호가 박자). 버스 자리(길이 3.1 · 폭 1)에 맞게 짧은 유닛은 키운다(폭 1.3 배까지)
export function buildUnitBusMesh(key) {
  const shape = UNIT_SHAPES[key], s = Math.min(2.6 / shape.len, 1.3), { data } = meshBuilder();
  for (const t of shapeTriangles(shape, s)) {
    const m = (t.color === LINE ? 39 : 40 + t.color) + (t.leg ? 100 : 0), uv = t.leg ? [t.pivot[0], t.leg * Math.max(.01, t.pivot[1])] : [0, 0];
    data.push(...t.p, ...t.n, ...uv, m);
  }
  return new Float32Array(data);
}
// 버스 모양 등록 자료: 메시 · 재료 40~ 의 색(palette) · 걸음(다리가 있으면 달리는 동안 흔든다)
export function unitBusLook(key) {
  const shape = UNIT_SHAPES[key];
  return { build: () => buildUnitBusMesh(key), carriers: true, headlights: false, palette: shape.palette };
}
