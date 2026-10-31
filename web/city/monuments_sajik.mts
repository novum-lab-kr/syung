// 사직단 구역(바깥 돌담 · 사방 홍살문 · 유(낮은 담) · 사단 · 직단 · 이름 없는 건물) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 유 = barrier=wall 닫힌 선, 사단 · 직단 = 그 안 닫힌 선 둘, 이름 없는 건물 = building 447954376(name 비어 있음 · 신문이라는 근거 없음 — 근사), 바깥 담 = 근사(SJ_RING — monuments_data.mts).
// 출처로 확인한 것(위키백과 ko 서울 사직단): 사직단은 두 겹의 담장 안에 있고 담장 사방에 홍살문 / 사단(동쪽)과 직단(서쪽)은 네모난 방형 / 단 둘레에 3층 돌계단을 사방으로 두르고 (오방색 흙은 옛 제도 — 지금 실물은 2012년 보수로 "사단 및 직단 황토 다짐"이라 위는 황토 한 빛으로 짓는다 — 국가유산 · 한국민족문화대백과 사직단) / 담은 두 겹(바깥 담 · 유) 모두 사방에 홍살문, 바깥 담 북쪽 문은 삼문(문 셋 — 한국민족문화대백과 · 국가유산청 디지털 자료) /
// 사방 2장 5척(약 7.7 m — 지도 윤곽 7 m 와 맞음) / 이름 없는 건물(OSM 447954376)은 무엇인지 자료로 확인 못 함 — 작은 단층 맞배집으로 둔 근사 / 유(壝)는 단을 둘러싼 낮은 담 / 현재는 돌담 너머로만 보인다.
// 근사(출처 못 찾음 · 값마다 "근사"): 바깥 담 사각(OSM 문 · 산울타리 선에서 읽음) · 돌담 높이 · 단 높이(약 3척) · 계단 폭 · 홍살문 크기 · 홍살문 자리(담 네 변 가운데로 읽음 — 자료에 좌표 없음) · 삼문 세 문 사이 간격 · 유 터짐 폭 · 황토 빛깔 · 이름 없는 건물의 정체 · 높이.
// 못 그린 것: 오방색 흙(옛 제도라 지금 모습이 아니다) · 단 위 신위 · 제기 · 돌계단 난간 · 사단 · 직단 구별(두 단 모양이 같다) · 제실 · 담장 옆 산울타리 · 기와(담은 돌담으로 지었다).
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { SJ_AT, SJ_ORIGIN, sjRing } from './monuments_data.mts';
import { SJ_BUILDINGS, SJ_YU, SJ_ALTARS } from './monuments_sajik_data.mts';
import { SJ_TREES } from './monuments_sajik_trees_data.mts';
import { SJ_TORCHES } from './monuments_sajik_torches_data.mts';
import { frameOf, rectOf, place, hall, buildFrames, MID } from './monuments_hanok.mts';
import type { Rect } from './monuments_hanok.mts';
import { toM } from './life.mts';

export const trees = { at: SJ_AT, data: SJ_TREES };
export const torches = { at: SJ_AT, data: SJ_TORCHES };
const FRAME = frameOf(SJ_AT, SJ_ORIGIN);
const local = (lng:number, lat:number):[number, number] => { const [mx, my] = toM(lng, lat); return [mx - FRAME.ox, -(my - FRAME.oy)] };
const points = (flat:number[]):[number, number][] => { const out:[number, number][] = []; for (let i = 0; i < flat.length; i += 2) out.push(local(SJ_ORIGIN[0] + flat[i]! / 1e6, SJ_ORIGIN[1] + flat[i + 1]! / 1e6)); return out };

// ── 돌담 ───────────────────────────────────────────────────────────────────────────────────────────────────
// 선을 따라 돌담 한 줄(두 쪽 옆면 + 윗면). gaps: 터 놓는 자리(가운데 x · y · 반폭)
type Gap = readonly [number, number, number];
function stoneWall(w:MeshWriter, line:[number, number][], halfWidth:number, height:number, gaps:Gap[]):void {
  let travelled = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!, len = Math.hypot(bx - ax, by - ay);
    if (len < .05) continue;
    const bays = Math.max(1, Math.round(len / 3)), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
    for (let k = 0; k < bays; k++) {
      const t0 = k / bays, t1 = (k + 1) / bays, px = ax + (bx - ax) * t0 - ux * .03, py = ay + (by - ay) * t0 - uy * .03, qx = ax + (bx - ax) * t1 + ux * .03, qy = ay + (by - ay) * t1 + uy * .03;
      const mx = (px + qx) / 2, my = (py + qy) / 2;
      if (gaps.some(([gx, gy, reach]) => Math.hypot(mx - gx, my - gy) < reach)) continue;
      const s0 = travelled + len * t0, s1 = travelled + len * t1;
      for (const sign of [-1, 1]) w.quad([px + nx * halfWidth * sign, py + ny * halfWidth * sign, 0], [qx + nx * halfWidth * sign, qy + ny * halfWidth * sign, 0], [qx + nx * halfWidth * sign, qy + ny * halfWidth * sign, height], [px + nx * halfWidth * sign, py + ny * halfWidth * sign, height], K.granite, [nx * sign, ny * sign, 0], s0, s1, s1, s0);
      w.quad([px - nx * halfWidth, py - ny * halfWidth, height], [qx - nx * halfWidth, qy - ny * halfWidth, height], [qx + nx * halfWidth, qy + ny * halfWidth, height], [px + nx * halfWidth, py + ny * halfWidth, height], K.trim, [0, 0, 1], s0, s1, s1, s0);
    }
    travelled += len;
  }
}
// 닫힌 선: 한 직선 위에 박힌 중간 점(변 가운데 점)을 빼고 모서리만 남긴다. 지도 윤곽은 변마다 점이 더 있어(유 = 8점 · 4변) 점마다 터면 틈이 변 하나에 둘 생긴다
const cornersOf = (ring:[number, number][]):[number, number][] => {
  const first = ring[0]!, last = ring[ring.length - 1]!, pts = Math.hypot(first[0] - last[0], first[1] - last[1]) < .01 ? ring.slice(0, -1) : ring.slice();
  return pts.filter((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length]!, b = pts[(i + 1) % pts.length]!, d1x = p[0] - a[0], d1y = p[1] - a[1], d2x = b[0] - p[0], d2y = b[1] - p[1];
    return Math.abs(d1x * d2y - d1y * d2x) > .14 * Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y);   // 꺾임 약 8° 넘는 점만 모서리
  });
};
interface Side { mid:[number, number]; along:[number, number]; out:[number, number] }   // out: 바깥을 보는 단위 법선(+y 가 북쪽)
const sidesOf = (corners:[number, number][]):Side[] => {
  const cx = corners.reduce((sum, p) => sum + p[0], 0) / corners.length, cy = corners.reduce((sum, p) => sum + p[1], 0) / corners.length;
  return corners.map((a, i) => {
    const b = corners[(i + 1) % corners.length]!, len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, mid:[number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const sign = (-uy * (mid[0] - cx) + ux * (mid[1] - cy)) >= 0 ? 1 : -1;
    return { mid, along: [ux, uy], out: [-uy * sign, ux * sign] };
  });
};
const closed = (corners:[number, number][]):[number, number][] => [...corners, corners[0]!];
const outerCorners = ():[number, number][] => cornersOf(sjRing().map(([lng, lat]) => local(lng, lat)));
const yuCorners = ():[number, number][] => cornersOf(points(SJ_YU));
const YU_GAP = 1.4;   // 유 홍살문 터짐 반폭(근사)
const GATE_GAP = 1.6;   // 바깥 담 홍살문 터짐 반폭(근사)
const SAMMUN_PITCH = 4.4;   // 바깥 담 북쪽 삼문: 세 문 가운데 사이 간격(근사)
// 문 자리: 변마다 가운데 하나. 바깥 담에서 북쪽을 가장 크게 보는 변은 삼문 — 세 군데(근사)
const northSide = (sides:Side[]):Side => sides.reduce((best, side) => (side.out[1] > best.out[1] ? side : best));
interface Gate { x:number; y:number; along:[number, number]; span:number; reach:number }   // reach: 담을 터 놓는 반경
export function gatesOf(): { outer:Gate[]; yu:Gate[] } {
  const outerSides = sidesOf(outerCorners()), north = northSide(outerSides), outer:Gate[] = [];
  for (const side of outerSides) for (const n of side === north ? [-1, 0, 1] : [0]) outer.push({ x: side.mid[0] + side.along[0] * n * SAMMUN_PITCH, y: side.mid[1] + side.along[1] * n * SAMMUN_PITCH, along: side.along, span: GATE_GAP, reach: GATE_GAP + (side === north ? 1.4 : .5) });
  const yu = sidesOf(yuCorners()).map((side):Gate => ({ x: side.mid[0], y: side.mid[1], along: side.along, span: YU_GAP, reach: YU_GAP + .5 }));
  return { outer, yu };
}

function buildWall(w:MeshWriter):void {
  const { outer, yu } = gatesOf();
  stoneWall(w, closed(outerCorners()), .45, 1.9, outer.map(gate => [gate.x, gate.y, gate.reach] as const));   // 바깥 담: 높이 근사
  stoneWall(w, closed(yuCorners()), .35, 1.0, yu.map(gate => [gate.x, gate.y, gate.reach] as const));   // 유: 낮은 담(높이 근사)
}

// 홍살문: 붉은 기둥 둘 + 윗 보 + 홍살(촘촘한 창살) — 담 변에 직각으로 서서 길이 방향은 담과 나란하다. 크기는 근사
function hongsalmun(w:MeshWriter, gate:Gate):void {
  const { x, y, along, span } = gate, [ux, uy] = along, nx = -uy, ny = ux, post = .22, top = 4.0;
  const at = (u:number, v:number, z:number):V3 => [x + ux * u + nx * v, y + uy * u + ny * v, z];
  for (const sign of [-1, 1]) { const [px, py] = at(span * sign, 0, 0); w.box(px - post, px + post, py - post, py + post, 0, top, K.red, { bottom: true, top: true }) }
  w.quad(at(-span, -.1, top - .5), at(span, -.1, top - .5), at(span, -.1, top), at(-span, -.1, top), K.red, [nx * -1, ny * -1, 0]);
  w.quad(at(span, .1, top - .5), at(-span, .1, top - .5), at(-span, .1, top), at(span, .1, top), K.red, [nx, ny, 0]);
  w.quad(at(-span, -.1, top), at(span, -.1, top), at(span, .1, top), at(-span, .1, top), K.red, [0, 0, 1]);
  for (let k = 0; k <= 8; k++) { const [px, py] = at(-span + 2 * span * k / 8, 0, 0); w.frustum(px, py, .05, .05, top, .015, .015, top + .55, K.band) }
}
function buildGates(w:MeshWriter):void {
  const { outer, yu } = gatesOf();
  for (const gate of [...outer, ...yu]) hongsalmun(w, gate);   // 바깥 담 사방(북쪽은 삼문) + 유 사방
}

// ── 단 ─────────────────────────────────────────────────────────────────────────────────────────────────────
// 사단 · 직단: 네모난 방형 단 + 사방 3층 돌계단 + 위는 황토 다짐(2012 보수). 윤곽이 지도의 정사각(7 m 안팎)이라 그대로 앉힌다. 높이 약 3척(근사)
function buildAltar(w:MeshWriter, flat:number[]):void {
  const r = rectOf(flat, FRAME);
  let ang = r.ang; while (Math.cos(ang) < .7) ang += Math.PI / 2;   // 틀의 +y 가 북쪽 가까이 가게(방위 색을 가르는 기준)
  place(w, { ...r, ang });
  const hx = (r.len + r.wid) / 4, height = .93;   // 정사각으로 본다(두 변 평균)
  w.box(-hx, hx, -hx, hx, 0, height, K.granite, { bottom: true });
  const topZ = height + .02;
  w.quad([-hx, -hx, topZ], [hx, -hx, topZ], [hx, hx, topZ], [-hx, hx, topZ], K.thatch, [0, 0, 1]);   // 윗면: 황토 다짐(2012 보수 · 실물) — 빛깔은 근사(K.thatch 황토색)
  for (let side = 0; side < 4; side++) {   // 사방 3층 돌계단: 바깥 단이 가장 낮고 안쪽으로 오를수록 높다(너비 1.2 m 안 · 단 깊이 0.32 m 는 근사)
    const cos = [0, 1, 0, -1][side]!, sin = [-1, 0, 1, 0][side]!, halfW = 1.2;
    const corner = (u:number, v:number):[number, number] => [cos * u - sin * v, sin * u + cos * v];
    for (let step = 0; step < 3; step++) {
      const x0 = hx + .32 * (2 - step), x1 = x0 + .32, z1 = height * (step + 1) / 4;
      const near = corner(x0, -halfW), far = corner(x1, -halfW), near2 = corner(x0, halfW), far2 = corner(x1, halfW);
      w.quad([near[0], near[1], z1], [far[0], far[1], z1], [far2[0], far2[1], z1], [near2[0], near2[1], z1], K.trim, [0, 0, 1]);
      w.quad([far[0], far[1], 0], [far2[0], far2[1], 0], [far2[0], far2[1], z1], [far[0], far[1], z1], K.granite, [cos, sin, 0]);
      for (const sign of [-1, 1]) { const from = sign < 0 ? near : near2, to = sign < 0 ? far : far2; w.quad([from[0], from[1], 0], [to[0], to[1], 0], [to[0], to[1], z1], [from[0], from[1], z1], K.granite, [-sin * sign, cos * sign, 0]) }
    }
  }
  w.xf = null;
}

// 이름 없는 건물(근사): 자료에 이름이 없어 정체 미확인. 작은 단층 맞배집으로 짓고 앞이 유(단 쪽)를 보게 돌린다. 칸 수 · 높이 · 처마 모두 근사
function buildUnnamedHall(w:MeshWriter, flat:number[]):void {
  const r = rectOf(flat, FRAME), yu = yuCorners(), tx = yu.reduce((sum, p) => sum + p[0], 0) / yu.length - r.cx, ty = yu.reduce((sum, p) => sum + p[1], 0) / yu.length - r.cy;
  const front = (ang:number) => Math.sin(ang) * tx - Math.cos(ang) * ty;   // 앞 방향(−y 를 돌린 것)과 유 쪽의 내적
  const face:Rect = { ...r, ang: front(r.ang) >= 0 ? r.ang : r.ang + Math.PI };
  place(w, face); w.remap = { [K.tunnel]: K.red };
  hall(w, { hx: Math.max(1, face.len / 2 - .4), hy: Math.max(1, face.wid / 2 - .4), podium: .7, lowPodium: [.5], body: 3.0, rise: 2.4, eave: 1.5, bays: [3, 2], steps: MID, gabled: true, doors: true });
  w.remap = null; w.xf = null;
}

function buildHalls(w:MeshWriter):void {
  buildGates(w);
  for (const altar of SJ_ALTARS) buildAltar(w, altar);
  const unnamed = SJ_BUILDINGS[0]; if (unnamed) buildUnnamedHall(w, unnamed.p);
}
function buildRest(w:MeshWriter):void {
  buildFrames(w, SJ_BUILDINGS.slice(1), [], FRAME);   // 이름 없는 건물 외 건물이 생기면 한옥 틀(지금은 없음)
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'sj-wall') buildWall(w);
  else if (id === 'sj-halls') buildHalls(w);
  else if (id === 'sj-frames') buildRest(w);
  return new Float32Array(w.data);
}
