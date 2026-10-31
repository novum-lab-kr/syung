// 창덕궁 구역(둘레 담장 · 돈화문 · 인정전 일곽 · 선정전 · 희정당 · 대조전 · 낙선재 · 후원 정자 · 나머지 한옥 틀) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 부품은 경복궁과 같다(monuments_palace.mts — 기준점 틀만 창덕궁 것을 넘긴다). 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 모두 OSM(© OpenStreetMap contributors): 둘레 = way 789965985(창덕궁) 경계, 건물 = 그 안의 building 198동(monuments_changdeokgung_data.mts), 나무 = 같은 둘레 안의 wood · tree(monuments_changdeokgung_trees_data.mts).
// 출처로 확인한 것(위키백과 ko): 돈화문 정면 5칸 · 측면 2칸 우진각 다포 / 인정전 정면 5칸 · 측면 4칸 중층 팔작 / 인정문 3×2 / 낙선재 정면 6칸 · 측면 2칸 단층 · 단청 없는 사대부 주택 꼴 / 희정당 현재 정면 11칸 · 측면 5칸 / 관람정 부채꼴 지붕 / 선정전 청기와 · 대조전 용마루 없는 지붕 / 청의정 볏짚 지붕.
// 선정전 정면 3칸 · 측면 3칸은 Codex 리뷰(2026-11-01)가 알려 준 값이다 — 우리가 찾은 위키백과 글에는 칸 수가 없어 출처 미확인(그대로 따름).
// 사진 비례 근사(출처 못 찾음 · 값마다 주석에 "사진 비례 근사"): 건물 높이 · 처마 · 기단(월대) 치수 전부, 대조전 7칸 · 주합루 5칸 · 영화당 5칸 · 문들의 칸 수 · 정자 칸 수, 부용정 팔 너비 · 존덕정 겹지붕 층 높이 · 관람정 부채 각도와 방향 · 인정전 오얏꽃 장식 자리.
// 못 그린 것: 팔작의 합각 세부 · 단청 세부 무늬 · 창호 살 · 부용지 · 애련지 · 관람지 연못과 다리 · 월대 박석 · 잡상 · 인정전 안 어좌 · 낙선재 기단과 툇마루 · 석복헌 · 수강재 세부(윤곽 압출만).
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { CDG_AT, CDG_ORIGIN, cdgRing } from './monuments_data.mts';
import { CDG_BUILDINGS } from './monuments_changdeokgung_data.mts';
import { CDG_TREES } from './monuments_changdeokgung_trees_data.mts';
import { CDG_TORCHES } from './monuments_changdeokgung_torches_data.mts';
import { frameOf, rectOf, place, hall, buildWallLine, buildFrames, buildFrameOutline, clamp, FINE, MID, ROUGH } from './monuments_hanok.mts';
import type { Rect, Hall } from './monuments_hanok.mts';
import { toM } from './life.mts';

export const trees = { at: CDG_AT, data: CDG_TREES };
export const torches = { at: CDG_AT, data: CDG_TORCHES };   // 밤 길가 횃불(길 양쪽 한 쌍씩 같은 간격)
const FRAME = frameOf(CDG_AT, CDG_ORIGIN);
const local = (lng:number, lat:number):[number, number] => { const [mx, my] = toM(lng, lat); return [mx - FRAME.ox, -(my - FRAME.oy)] };

// ── 담장 ───────────────────────────────────────────────────────────────────────────────────────────────────
// 둘레 경계를 따라 한 바퀴. 문이 있는 자리(돈화문 · 금호문 · 단봉문)는 담장을 짓지 않고 문 모델이 대신 선다
const WALL_GAPS = ['돈화문', '금호문', '단봉문'];
function buildWall(w:MeshWriter):void {
  const ring = cdgRing().map(([lng, lat]) => { const [x, y] = local(lng, lat); return [x, y, 0] as V3 });
  ring.push(ring[0]!);
  const gaps = CDG_BUILDINGS.filter(each => WALL_GAPS.includes(each.name)).map(each => {
    const r = rectOf(each.p, FRAME), xs = r.pts.map(p => p[0]), ys = r.pts.map(p => p[1]);
    return [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...ys) - 2, Math.max(...ys) + 2] as const;
  });
  buildWallLine(w, ring, (x, y) => gaps.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
}

// ── 전용 모델 ────────────────────────────────────────────────────────────────────────────────────────────────
// 앞(−y)이 남쪽을 보게 돌린다: 궁궐 전각은 모두 남향이다
const southFacing = (r:Rect):Rect => (Math.cos(r.ang) < 0 ? { ...r, ang: r.ang + Math.PI } : r);
const half = (r:Rect, margin:number) => ({ hx: Math.max(1, r.len / 2 - margin), hy: Math.max(1, r.wid / 2 - margin) });

// 인정전: 중층 팔작 · 정면 5칸 · 윤곽 = 상월대(기단) 가장자리. 둘레에 하월대(맞춤 +3.5 m) · 용마루에 오얏꽃 장식 다섯(위키백과 — 금빛, 모양은 맞춤)
function buildInjeongjeon(w:MeshWriter, r:Rect):void {
  const hx = r.len / 2, hy = r.wid / 2, upper = 2.0, out = 3.5;
  w.box(-hx - out, hx + out, -hy - out, hy + out, 0, 1.0, K.granite, { bottom: true });
  w.quad([-hx - out, -hy - out, 1.0], [hx + out, -hy - out, 1.0], [hx + out, hy + out, 1.0], [-hx - out, hy + out, 1.0], K.deck, [0, 0, 1]);
  for (let k = 0; k < 3; k++) w.box(-3.4, 3.4, -hy - out - (3 - k) * .6, -hy - out + .01, 0, 1.0 * (k + 1) / 3, K.trim, { bottom: true });
  w.box(-hx, hx, -hy, hy, 1.0, upper, K.granite, { bottom: true });
  w.quad([-hx, -hy, upper], [hx, -hy, upper], [hx, hy, upper], [-hx, hy, upper], K.deck, [0, 0, 1]);
  for (let k = 0; k < 3; k++) w.box(-3, 3, -hy - (3 - k) * .5, -hy + .01, 1.0, 1.0 + (upper - 1.0) * (k + 1) / 3, K.trim, { bottom: true });
  const S:Hall = { hx: hx - 3, hy: hy - 3, podium: 0, body: 5.0, rise: 5.2, eave: 3.2, bays: [5, 4], steps: FINE, tiers: 2, brackets: true, doors: true, lift: 1.5, upper: [.95, .93], upperRise: 3.6, ridgeFrac: .66, gable: .55 };
  w.dz = upper; const ridgeTop = hall(w, S); w.dz = 0;
  const ridgeHalf = (S.hx * .95 + .45 + S.eave) * .66 * .7;   // 용마루 위 다섯 장식(맞춤: 마루 길이의 70 %에 고르게)
  for (let k = 0; k < 5; k++) { const x = -ridgeHalf + 2 * ridgeHalf * k / 4; w.frustum(x, 0, .3, .3, upper + ridgeTop - .1, .12, .12, upper + ridgeTop + .8, K.gilt) }
  const rail = (ax:number, ay:number, bx:number, by:number) => { const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2.6)); for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; w.box(x - .15, x + .15, y - .15, y + .15, upper, upper + 1.0, K.trim, { bottom: true }) } };
  rail(-hx + .3, -hy + .3, -3.8, -hy + .3); rail(3.8, -hy + .3, hx - .3, -hy + .3); rail(-hx + .3, hy - .3, hx - .3, hy - .3);
  rail(-hx + .3, -hy + .3, -hx + .3, hy - .3); rail(hx - .3, -hy + .3, hx - .3, hy - .3);
}
// 부용정: 연못에 발을 담근 열십자 정자(지도 윤곽이 열십자). 윤곽의 긴 쪽 · 짧은 쪽 팔 둘을 가로질러 세우고 지붕이 만난다. 팔 너비는 맞춤
function buildBuyongjeong(w:MeshWriter, r:Rect):void {
  const arm:Omit<Hall, 'hx' | 'hy'> = { podium: 1.1, body: 2.8, rise: 2.6, eave: 1.3, bays: [3, 1], steps: ROUGH, hollow: true };
  hall(w, { ...arm, hx: Math.max(1.4, r.len / 2 - .5), hy: Math.max(.9, r.wid * .24) });
  place(w, { ...r, ang: r.ang + Math.PI / 2 });
  hall(w, { ...arm, hx: Math.max(1.4, r.wid / 2 - .5), hy: Math.max(.9, r.len * .24) });
}
// 정자 하나: 네모 기둥 줄 · 낮은 마루 · 열린 몸 · 우진각(또는 모임지붕). roofKind 로 기와 말고 다른 지붕(초가 …)을 줄 수 있다
function pavilion(w:MeshWriter, r:Rect, roof?:number):void {
  if (roof !== undefined) w.remap = { [K.giwa]: roof };
  const { hx, hy } = half(r, .35), bayX = clamp(Math.round(hx * 2 / 2.4), 1, 3), bayY = clamp(Math.round(hy * 2 / 2.4), 1, 3);
  hall(w, { hx, hy, podium: .7, body: 2.8, rise: clamp((hy + 1.4) * .6, 1.3, 2.6), eave: 1.4, bays: [bayX, bayY], steps: ROUGH, hollow: true });
  w.remap = null;
}
// 육각 정자(존덕정): 기둥 여섯에 겹지붕(2단). 크기는 지도 윤곽(길이 4.3 m)에서 줄인 것 · 겹지붕 층 높이는 맞춤
function buildHexPavilion(w:MeshWriter, r:Rect):void {
  const radius = clamp(Math.max(r.len, r.wid) / 2 * 1.05, 2.0, 3.6), floor = .7, body = 2.8;
  w.prism(0, 0, radius + .5, 0, floor, K.granite, 6);
  const pts = (rad:number, z:number) => Array.from({ length: 6 }, (_, k): V3 => [Math.cos(Math.PI / 3 * k) * rad, Math.sin(Math.PI / 3 * k) * rad, z]);
  for (const p of pts(radius, 0)) w.box(p[0] - .2, p[0] + .2, p[1] - .2, p[1] + .2, floor, floor + body, K.red, { bottom: true, top: true });
  const band = (rad:number, z0:number, z1:number) => { const lo = pts(rad, z0), hi = pts(rad, z1); for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6, mid = Math.PI / 3 * (k + .5); w.quad(lo[k]!, lo[k2]!, hi[k2]!, hi[k]!, K.dancheong, [Math.cos(mid), Math.sin(mid), 0]) } };
  band(radius + .25, floor + body - .4, floor + body);
  const cone = (rad:number, z0:number, rise:number, tipRad:number) => {   // 육각 모임지붕 한 단
    const lo = pts(rad, z0), hi = pts(tipRad, z0 + rise);
    for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; w.quad(lo[k]!, lo[k2]!, hi[k2]!, hi[k]!, K.giwa, [0, 0, 1], k * 1.5, (k + 1) * 1.5, (k + 1) * 1.5, k * 1.5); w.quad([lo[k]![0], lo[k]![1], z0 - .3], [lo[k2]![0], lo[k2]![1], z0 - .3], lo[k2]!, lo[k]!, K.fascia, [lo[k]![0] + lo[k2]![0], lo[k]![1] + lo[k2]![1], 0]) }
  };
  const eaveZ = floor + body;
  cone(radius + 1.5, eaveZ, 1.1, radius * .75);                    // 아래 지붕
  cone(radius * .8 + .6, eaveZ + 1.5, 1.7, .12);                   // 위 지붕(겹지붕 — 맞춤)
  w.frustum(0, 0, .2, .2, eaveZ + 3.1, .05, .05, eaveZ + 3.9, K.gilt);
}
// 관람정: 부채꼴 마루 · 부채꼴 지붕(위키백과 "지붕이 부채꼴 모양"). 부채의 각도 · 방향(꼭지가 −x 끝, 호가 +x 쪽) · 기둥 수는 지도 윤곽(길이·폭)에서 줄인 사진 비례 근사
function buildFanPavilion(w:MeshWriter, r:Rect):void {
  const hx = Math.max(2, r.len / 2 - .3), radius = hx * 2, half = clamp(Math.atan2(Math.max(1, r.wid / 2 - .3), radius * .75), .35, 1.1), floor = .7, body = 2.6, steps = 9;
  const arc = (rad:number, z:number, k:number):V3 => { const a = -half + 2 * half * k / steps; return [-hx + Math.cos(a) * rad, Math.sin(a) * rad, z] };
  const apex = (z:number):V3 => [-hx, 0, z];
  for (let k = 0; k < steps; k++) {   // 마루: 부채꼴 판 + 가장자리 돌 단
    w.tri(apex(floor), arc(radius + .4, floor, k), arc(radius + .4, floor, k + 1), K.deck, [0, 0, 1]);
    const mid = -half + 2 * half * (k + .5) / steps;
    w.quad(arc(radius + .4, 0, k), arc(radius + .4, 0, k + 1), arc(radius + .4, floor, k + 1), arc(radius + .4, floor, k), K.granite, [Math.cos(mid), Math.sin(mid), 0]);
  }
  for (const k of [0, 3, 6, 9]) { const [x, y] = arc(radius, 0, k); w.box(x - .2, x + .2, y - .2, y + .2, floor, floor + body, K.red, { bottom: true, top: true }) }
  w.box(-hx - .2, -hx + .2, -.2, .2, floor, floor + body, K.red, { bottom: true, top: true });
  const eaveZ = floor + body, over = 1.3;   // 지붕: 꼭지(안쪽) → 호(처마) 경사 부채, 처마는 바깥으로 over 만큼
  for (let k = 0; k < steps; k++) {
    const mid = -half + 2 * half * (k + .5) / steps, hint:V3 = [Math.cos(mid) * .5, Math.sin(mid) * .5, .85];
    w.tri(apex(eaveZ + 1.6), arc(radius + over, eaveZ, k), arc(radius + over, eaveZ, k + 1), K.giwa, hint, 0, k * 1.2, (k + 1) * 1.2);
    w.quad(arc(radius + over, eaveZ - .25, k), arc(radius + over, eaveZ - .25, k + 1), arc(radius + over, eaveZ, k + 1), arc(radius + over, eaveZ, k), K.fascia, [Math.cos(mid), Math.sin(mid), 0]);
  }
  for (const end of [-1, 1]) {   // 부채의 두 곧은 변(꼭지 → 호 끝) 아래 면
    const a = end < 0 ? 0 : steps;
    w.tri(apex(eaveZ + 1.6), apex(eaveZ), arc(radius + over, eaveZ, a), K.fascia, [0, end, 0]);
  }
}
// 문: 단층 우진각 · 3칸(사진 비례 근사)
const gate = (w:MeshWriter, r:Rect, bays:[number, number] = [3, 2]):void => { hall(w, { ...half(r, .8), podium: 1.1, body: 3.4, rise: 3.2, eave: 2.1, bays, steps: MID, brackets: true, doors: true, stair: r.len > 8 }) };

const DEDICATED:Record<string, (w:MeshWriter, r:Rect) => void> = {
  돈화문: (w, r) => { hall(w, { hx: Math.min(r.len / 2, 13) - .8, hy: Math.min(r.wid / 2, 6.5) - .8, podium: 1.6, lowPodium: [1.2, .6], body: 3.8, rise: 4.2, eave: 2.6, bays: [5, 2], steps: FINE, tiers: 2, brackets: true, doors: true, stair: true }) },   // 정면 5칸 2층 우진각(위키백과)
  인정전: buildInjeongjeon,
  선정전: (w, r) => { w.remap = { [K.giwa]: K.blueTile }; hall(w, { ...half(r, 1.2), podium: 1.4, lowPodium: [1.0, .4], body: 4.2, rise: 4.4, eave: 2.8, bays: [3, 3], steps: FINE, brackets: true, doors: true, stair: true, gable: .5 }); w.remap = null },   // 청기와 팔작 · 정면 3칸 측면 3칸(Codex 리뷰 전달 — 출처 미확인) · 높이 · 월대 사진 비례 근사
  희정당: (w, r) => { hall(w, { ...half(r, 1), podium: 1.3, lowPodium: [1.2, .5], body: 3.9, rise: 4.0, eave: 2.6, bays: [9, 3], steps: FINE, brackets: true, doors: true, stair: true, gable: .5 }) },   // 현재 정면 11칸 · 측면 5칸(위키백과)이나 지도 윤곽 길이에 맞춰 9칸 · 3칸으로 줄여 그림(사진 비례 근사)
  대조전: (w, r) => { hall(w, { ...half(r, 1), podium: 1.3, lowPodium: [1.2, .5], body: 3.9, rise: 3.6, eave: 2.5, bays: [7, 3], steps: FINE, ridgeless: true, doors: true, stair: true }) },   // 용마루 없는 지붕(무량각, 위키백과) · 7칸 · 높이 사진 비례 근사
  주합루: (w, r) => { hall(w, { ...half(r, .8), podium: 2.2, lowPodium: [.8, .3], body: 3.6, rise: 3.6, eave: 2.3, bays: [5, 3], steps: FINE, tiers: 2, brackets: true, doors: true, stair: true, upper: [.9, .88], upperRise: 3.2, gable: .5 }) },   // 2층 누각(1층 아래는 어수문 쪽 높은 석축)
  영화당: (w, r) => { hall(w, { ...half(r, .8), podium: 1.1, body: 3.4, rise: 3.2, eave: 2.1, bays: [5, 3], steps: MID, brackets: true, doors: true, stair: true, gable: .45 }) },
  부용정: buildBuyongjeong,
  존덕정: buildHexPavilion,
  관람정: buildFanPavilion,   // 부채꼴 지붕(위키백과)
  청의정: (w, r) => pavilion(w, r, K.thatch),   // 볏짚 지붕(초가)
  인정문: (w, r) => gate(w, r), 진선문: (w, r) => gate(w, r), 숙장문: (w, r) => gate(w, r), 선정문: (w, r) => gate(w, r, [3, 1]), 금호문: (w, r) => gate(w, r, [3, 1]), 단봉문: (w, r) => gate(w, r, [3, 1]),
  ...Object.fromEntries(['애련정', '태극정', '소요정', '승재정', '취한정', '취규정', '능허정', '청심정', '농수정', '몽답정'].map(name => [name, (w:MeshWriter, r:Rect) => pavilion(w, r)])),
};

// 전각을 모아 짓는다
function buildHalls(w:MeshWriter):void {
  for (const each of CDG_BUILDINGS.filter(item => TIMBER_HOUSES.includes(item.name) && item.p.length >= 6)) { w.xf = null; buildFrameOutline(w, rectOf(each.p, FRAME), { wall: K.timber, band: true, height: 3.2 }) }
  for (const each of CDG_BUILDINGS.filter(item => DEDICATED[item.name] && item.p.length >= 6)) {
    const r = southFacing(rectOf(each.p, FRAME)); place(w, r); DEDICATED[each.name]!(w, r); w.xf = null;
  }
}
// 나머지: 한옥 틀. 윤곽이 어긋난 수강재는 윤곽 그대로 세운다(틀로 넣으면 사각이 윤곽 밖으로 넘친다)
const OUTLINE_ONLY = ['수강재'];
// 낙선재 · 석복헌: 윤곽이 실제 ㄱ자라 사각 틀로는 넘친다 → 윤곽 그대로 세우고, 단청 없는 원목 벽 + 가장자리 지붕 띠(정면 6칸 · 측면 2칸 단층, 위키백과 · 높이 사진 비례 근사)
const TIMBER_HOUSES = ['낙선재', '석복헌'];
function buildRest(w:MeshWriter):void {
  const names = [...Object.keys(DEDICATED), ...TIMBER_HOUSES];
  buildFrames(w, CDG_BUILDINGS.filter(each => !OUTLINE_ONLY.includes(each.name)), names, FRAME);
  for (const each of CDG_BUILDINGS.filter(item => OUTLINE_ONLY.includes(item.name))) { w.xf = null; buildFrameOutline(w, rectOf(each.p, FRAME)) }
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'cdg-wall') buildWall(w);
  else if (id === 'cdg-halls') buildHalls(w);
  else if (id === 'cdg-frames') buildRest(w);
  return new Float32Array(w.data);
}
