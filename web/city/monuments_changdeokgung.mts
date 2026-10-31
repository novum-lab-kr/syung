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
// 관람정: 부채꼴 정자(위키백과 "지붕이 부채꼴 모양"). 지도 윤곽이 부채를 자른 모양(넓은 호 · 좁은 호 · 곧은 두 변)이라 윤곽 점에서 꼭지 · 반지름 · 각도를 읽어 그대로 세운다 — 놓인 방향은 윤곽이 정한다(OSM).
// 꼭지 = 가장 긴 두 변(곧은 변)의 직선이 만나는 점. 기둥 수 · 높이 · 처마 내민 길이 · 지붕 높이는 사진 비례 근사
function buildFanPavilion(w:MeshWriter, pts:[number, number][]):void {
  const edges = pts.map((from, i) => ({ from, to: pts[(i + 1) % pts.length]!, len: Math.hypot(pts[(i + 1) % pts.length]![0] - from[0], pts[(i + 1) % pts.length]![1] - from[1]) })).sort((one, two) => two.len - one.len);
  const [side1, side2] = [edges[0]!, edges[1]!];
  const d1 = [side1.to[0] - side1.from[0], side1.to[1] - side1.from[1]], d2 = [side2.to[0] - side2.from[0], side2.to[1] - side2.from[1]], cross = d1[0]! * d2[1]! - d1[1]! * d2[0]!;
  if (Math.abs(cross) < 1e-6) return;
  const t = ((side2.from[0] - side1.from[0]) * d2[1]! - (side2.from[1] - side1.from[1]) * d2[0]!) / cross;
  const apex:[number, number] = [side1.from[0] + d1[0]! * t, side1.from[1] + d1[1]! * t];
  const cx = pts.reduce((sum, pt) => sum + pt[0], 0) / pts.length, cy = pts.reduce((sum, pt) => sum + pt[1], 0) / pts.length, mid = Math.atan2(cy - apex[1], cx - apex[0]);
  const polar = pts.map(pt => { let rel = Math.atan2(pt[1] - apex[1], pt[0] - apex[0]) - mid; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI; return { rel, rad: Math.hypot(pt[0] - apex[0], pt[1] - apex[1]) } });
  const radii = polar.map(item => item.rad), split = (Math.min(...radii) + Math.max(...radii)) / 2, mean = (list:number[]) => list.reduce((sum, v) => sum + v, 0) / Math.max(1, list.length);
  const rOut = mean(radii.filter(v => v > split)), rIn = mean(radii.filter(v => v <= split)), halfAng = Math.max(...polar.map(item => Math.abs(item.rel)));
  const at = (rad:number, rel:number, z:number):V3 => [apex[0] + Math.cos(mid + rel) * rad, apex[1] + Math.sin(mid + rel) * rad, z];
  const floor = .6, body = 2.5, ARC = 12;
  for (let k = 0; k < ARC; k++) {   // 마루: 부채꼴 판(넓은 호에서 좁은 호까지) + 바깥 돌 단
    const r0 = -halfAng + 2 * halfAng * k / ARC, r1 = -halfAng + 2 * halfAng * (k + 1) / ARC, mr = (r0 + r1) / 2, lo = rIn - .3, hi = rOut + .4;
    w.quad(at(lo, r0, floor), at(hi, r0, floor), at(hi, r1, floor), at(lo, r1, floor), K.deck, [0, 0, 1]);
    w.quad(at(hi, r0, 0), at(hi, r1, 0), at(hi, r1, floor), at(hi, r0, floor), K.granite, [Math.cos(mid + mr), Math.sin(mid + mr), 0]);
    w.quad(at(lo, r1, 0), at(lo, r0, 0), at(lo, r0, floor), at(lo, r1, floor), K.granite, [-Math.cos(mid + mr), -Math.sin(mid + mr), 0]);
  }
  for (const side of [-1, 1]) w.quad(at(rIn - .3, side * halfAng, 0), at(rOut + .4, side * halfAng, 0), at(rOut + .4, side * halfAng, floor), at(rIn - .3, side * halfAng, floor), K.granite, [-Math.sin(mid + side * halfAng) * side, Math.cos(mid + side * halfAng) * side, 0]);
  const post = (rad:number, rel:number):void => { const [x, y] = at(rad, rel, 0); w.box(x - .17, x + .17, y - .17, y + .17, floor, floor + body, K.red, { bottom: true, top: true }) };
  for (let k = 0; k <= 4; k++) post(rOut, -halfAng + 2 * halfAng * k / 4);   // 넓은 호 기둥 다섯
  for (let k = 0; k <= 2; k++) post(rIn, -halfAng + 2 * halfAng * k / 2);    // 좁은 호 기둥 셋
  const beam = (rad:number, z0:number, z1:number):void => { for (let k = 0; k < ARC; k++) { const r0 = -halfAng + 2 * halfAng * k / ARC, r1 = -halfAng + 2 * halfAng * (k + 1) / ARC, mr = (r0 + r1) / 2; w.quad(at(rad + .2, r0, z0), at(rad + .2, r1, z0), at(rad + .2, r1, z1), at(rad + .2, r0, z1), K.dancheong, [Math.cos(mid + mr), Math.sin(mid + mr), 0]) } };
  beam(rOut, floor + body - .45, floor + body); beam(rIn - .4, floor + body - .45, floor + body);   // 호를 따라 도는 창방(두 호)
  // 지붕: 꼭지 쪽 좁은 처마 호 → 바깥 넓은 처마 호. 가운데 방사선이 용마루, 양쪽으로 곡선 처마까지 내려온다(부채꼴 모양 그대로 윗면이 보이게)
  const eaveZ = floor + body, ridgeZ = eaveZ + 1.5, over = 1.1, outer = rOut + over, inner = Math.max(.4, rIn - .5), reach = halfAng + over / Math.max(1, rOut) * .9, RAD = 4, ANG = 14;
  const height = (rel:number, rad:number):number => eaveZ + (ridgeZ - eaveZ) * (1 - Math.abs(rel) / reach) * (.82 + .18 * (rad - inner) / (outer - inner));
  for (let i = 0; i < RAD; i++) for (let k = 0; k < ANG; k++) {
    const rad0 = inner + (outer - inner) * i / RAD, rad1 = inner + (outer - inner) * (i + 1) / RAD, r0 = -reach + 2 * reach * k / ANG, r1 = -reach + 2 * reach * (k + 1) / ANG;
    w.quad(at(rad0, r0, height(r0, rad0)), at(rad1, r0, height(r0, rad1)), at(rad1, r1, height(r1, rad1)), at(rad0, r1, height(r1, rad0)), K.giwa, [0, 0, 1], i * 1.2, (i + 1) * 1.2, (i + 1) * 1.2, i * 1.2);
  }
  for (let k = 0; k < ANG; k++) {   // 넓은 호 · 좁은 호 처마 끝 두께띠(서까래 머리)
    const r0 = -reach + 2 * reach * k / ANG, r1 = -reach + 2 * reach * (k + 1) / ANG, mr = (r0 + r1) / 2;
    w.quad(at(outer, r0, height(r0, outer) - .3), at(outer, r1, height(r1, outer) - .3), at(outer, r1, height(r1, outer)), at(outer, r0, height(r0, outer)), K.fascia, [Math.cos(mid + mr), Math.sin(mid + mr), 0]);
    w.quad(at(inner, r1, height(r1, inner) - .3), at(inner, r0, height(r0, inner) - .3), at(inner, r0, height(r0, inner)), at(inner, r1, height(r1, inner)), K.fascia, [-Math.cos(mid + mr), -Math.sin(mid + mr), 0]);
  }
  for (const side of [-1, 1]) for (let i = 0; i < RAD; i++) {   // 곧은 두 변 처마 끝
    const rad0 = inner + (outer - inner) * i / RAD, rad1 = inner + (outer - inner) * (i + 1) / RAD, rel = side * reach;
    w.quad(at(rad0, rel, height(rel, rad0) - .3), at(rad1, rel, height(rel, rad1) - .3), at(rad1, rel, height(rel, rad1)), at(rad0, rel, height(rel, rad0)), K.fascia, [-Math.sin(mid + rel) * side, Math.cos(mid + rel) * side, 0]);
  }
  for (let i = 0; i < RAD; i++) {   // 용마루(방사선) 띠: 두 겹(윗면 · 양옆)
    const rad0 = inner + (outer - inner) * i / RAD, rad1 = inner + (outer - inner) * (i + 1) / RAD, nx = -Math.sin(mid) * .22, ny = Math.cos(mid) * .22;
    const [a0, a1] = [at(rad0, 0, height(0, rad0) + .3), at(rad1, 0, height(0, rad1) + .3)];
    w.quad([a0[0] - nx, a0[1] - ny, a0[2]], [a1[0] - nx, a1[1] - ny, a1[2]], [a1[0] + nx, a1[1] + ny, a1[2]], [a0[0] + nx, a0[1] + ny, a0[2]], K.ridge, [0, 0, 1]);
    for (const side of [-1, 1]) w.quad([a0[0] + nx * side, a0[1] + ny * side, a0[2] - .3], [a1[0] + nx * side, a1[1] + ny * side, a1[2] - .3], [a1[0] + nx * side, a1[1] + ny * side, a1[2]], [a0[0] + nx * side, a0[1] + ny * side, a0[2]], K.ridge, [nx * side, ny * side, 0]);
  }
}

// 문: 단층 우진각 · 3칸(사진 비례 근사)
const gate = (w:MeshWriter, r:Rect, bays:[number, number] = [3, 2]):void => { hall(w, { ...half(r, .8), podium: 1.1, body: 3.4, rise: 3.2, eave: 2.1, bays, steps: MID, brackets: true, doors: true, stair: r.len > 8 }) };

// 윤곽 그대로 세우는 큰 건물(행각 · 낙선재 일곽 둘레 · 수강재): 기본 윤곽 띠(회벽 + 가장자리 지붕 띠)에 돌 밑단 · 기둥 줄 · 창호 · 창방 · 용마루를 더해 옆 전각과 같은 결로 맞춘다.
// 낙선재 일곽(낙선재 중심 70 m 안)은 단청 없는 원목 기둥, 나머지는 붉은 기둥. 기둥 간격 · 높이는 사진 비례 근사
const NAKSEONJAE_AT:[number, number] = [221, -418];
function buildRichOutline(w:MeshWriter, r:Rect):void {
  const timber = Math.hypot(r.cx - NAKSEONJAE_AT[0], r.cy - NAKSEONJAE_AT[1]) < 70, post = timber ? K.timber : K.red, height = 3.2;
  buildFrameOutline(w, r, { band: true, height });
  const pts = r.pts; let area2 = 0; for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!; area2 += ax * by - bx * ay }
  const ccw = area2 > 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy); if (len < 1.6) continue;
    const ux = dx / len, uy = dy / len, outX = (ccw ? dy : -dy) / len, outY = (ccw ? -dx : dx) / len, bays = Math.max(1, Math.round(len / 3));
    const along = (t:number, lift:number, z:number):V3 => [ax + dx * t + outX * lift, ay + dy * t + outY * lift, z];
    w.quad(along(0, .12, 0), along(1, .12, 0), along(1, .12, .5), along(0, .12, .5), K.granite, [outX, outY, 0]);   // 돌 밑단
    w.quad(along(0, .1, height - .5), along(1, .1, height - .5), along(1, .1, height), along(0, .1, height), post, [outX, outY, 0]);   // 창방
    for (let k = 0; k <= bays; k++) { const [x, y] = along(k / bays, .12, 0); w.box(x - .13 - Math.abs(uy) * .05, x + .13 + Math.abs(uy) * .05, y - .13 - Math.abs(ux) * .05, y + .13 + Math.abs(ux) * .05, .4, height, post, { bottom: true }) }
    for (let k = 0; k < bays; k++) { const t0 = (k + .2) / bays, t1 = (k + .8) / bays; w.quad(along(t0, .07, .9), along(t1, .07, .9), along(t1, .07, height - .7), along(t0, .07, height - .7), K.window, [outX, outY, 0]) }   // 창호
    const inX = -outX, inY = -outY, depth = 2.7, ridgeZ = height + 1.7 + .12;   // 용마루: 지붕 띠 맨 위 선
    const [rx0, ry0, rx1, ry1] = [ax + inX * depth, ay + inY * depth, bx + inX * depth, by + inY * depth];
    w.quad([rx0 - inX * .15 - ux * .2, ry0 - inY * .15 - uy * .2, ridgeZ], [rx1 - inX * .15 + ux * .2, ry1 - inY * .15 + uy * .2, ridgeZ], [rx1 + inX * .15 + ux * .2, ry1 + inY * .15 + uy * .2, ridgeZ], [rx0 + inX * .15 - ux * .2, ry0 + inY * .15 - uy * .2, ridgeZ], K.ridge, [0, 0, 1]);
  }
}

// 낙선재 · 석복헌: 윤곽이 실제 ㄱ자(날개 둘 · 셋)라 사각 틀 하나로는 넘친다. 윤곽을 격자로 훑어 가장 큰 직사각형부터 떼어 낸 날개마다 팔작지붕 한옥을 세운다.
// 단청 없는 원목: 기둥 · 창방 · 문틀을 K.timber 로, 벽은 회벽(위키백과: 단청을 하지 않은 사대부 주택 꼴). 높이 · 처마 · 칸 폭은 사진 비례 근사
function wingsOf(r:Rect):Rect[] {
  const STEP = .3, cosA = Math.cos(r.ang), sinA = Math.sin(r.ang), cols = Math.ceil(r.len / STEP), rows = Math.ceil(r.wid / STEP);
  const inside = (x:number, y:number):boolean => { let hit = false; for (let i = 0, j = r.pts.length - 1; i < r.pts.length; j = i++) { const [xi, yi] = r.pts[i]!, [xj, yj] = r.pts[j]!; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit } return hit };
  const grid = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (__, col) => { const u = (col + .5) * STEP - r.len / 2, v = (row + .5) * STEP - r.wid / 2; return inside(r.cx + u * cosA - v * sinA, r.cy + u * sinA + v * cosA) }));
  const out:Rect[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const heights = new Array<number>(cols).fill(0);
    let best = { area: 0, col0: 0, col1: 0, row0: 0, row1: 0 };
    for (let row = 0; row < rows; row++) {   // 행마다 히스토그램에서 가장 큰 직사각형
      for (let col = 0; col < cols; col++) heights[col] = grid[row]![col] ? heights[col]! + 1 : 0;
      for (let col0 = 0; col0 < cols; col0++) { let low = Infinity; for (let col1 = col0; col1 < cols && heights[col1]!; col1++) { low = Math.min(low, heights[col1]!); const area = low * (col1 - col0 + 1); if (area > best.area) best = { area, col0, col1, row0: row - low + 1, row1: row } } }
    }
    const w0 = (best.col1 - best.col0 + 1) * STEP, h0 = (best.row1 - best.row0 + 1) * STEP;
    if (best.area * STEP * STEP < 14 || Math.min(w0, h0) < 3) break;
    const uc = (best.col0 + best.col1 + 1) / 2 * STEP - r.len / 2, vc = (best.row0 + best.row1 + 1) / 2 * STEP - r.wid / 2, tall = h0 > w0;
    out.push({ cx: r.cx + uc * cosA - vc * sinA, cy: r.cy + uc * sinA + vc * cosA, len: Math.max(w0, h0), wid: Math.min(w0, h0), ang: tall ? r.ang + Math.PI / 2 : r.ang, fill: 1, pts: [] });
    for (let row = best.row0; row <= best.row1; row++) for (let col = best.col0; col <= best.col1; col++) grid[row]![col] = false;
  }
  return out;
}
function buildTimberHouse(w:MeshWriter, outline:Rect):void {
  for (const wing of wingsOf(outline)) {
    const r = southFacing(wing); place(w, r);
    w.remap = { [K.red]: K.timber, [K.dancheong]: K.timber, [K.band]: K.timber };
    const { hx, hy } = half(r, .5);
    hall(w, { hx, hy, podium: .8, lowPodium: [.7], body: 3.2, rise: 3.0, eave: 2.0, bays: [clamp(Math.round(hx * 2 / 3.0), 1, 6), clamp(Math.round(hy * 2 / 3.0), 1, 2)], steps: FINE, doors: true, stair: r.len > 8, gable: .45 });
    w.remap = null; w.xf = null;
  }
}

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
  청의정: (w, r) => pavilion(w, r, K.thatch),   // 볏짚 지붕(초가)
  인정문: (w, r) => gate(w, r), 진선문: (w, r) => gate(w, r), 숙장문: (w, r) => gate(w, r), 선정문: (w, r) => gate(w, r, [3, 1]), 금호문: (w, r) => gate(w, r, [3, 1]), 단봉문: (w, r) => gate(w, r, [3, 1]),
  ...Object.fromEntries(['애련정', '태극정', '소요정', '승재정', '취한정', '취규정', '능허정', '청심정', '농수정', '몽답정'].map(name => [name, (w:MeshWriter, r:Rect) => pavilion(w, r)])),
};

// 전각을 모아 짓는다
function buildHalls(w:MeshWriter):void {
  for (const each of CDG_BUILDINGS.filter(item => TIMBER_HOUSES.includes(item.name) && item.p.length >= 6)) buildTimberHouse(w, rectOf(each.p, FRAME));
  for (const each of CDG_BUILDINGS.filter(item => FAN_PAVILIONS.includes(item.name) && item.p.length >= 6)) { w.xf = null; buildFanPavilion(w, rectOf(each.p, FRAME).pts) }
  for (const each of CDG_BUILDINGS.filter(item => DEDICATED[item.name] && item.p.length >= 6)) {
    const r = southFacing(rectOf(each.p, FRAME)); place(w, r); DEDICATED[each.name]!(w, r); w.xf = null;
  }
}
// 나머지: 한옥 틀. 윤곽이 어긋난 수강재는 윤곽 그대로 세운다(틀로 넣으면 사각이 윤곽 밖으로 넘친다)
const OUTLINE_ONLY = ['수강재'];
const TIMBER_HOUSES = ['낙선재', '석복헌'];
const FAN_PAVILIONS = ['관람정'];
function buildRest(w:MeshWriter):void {
  const names = [...Object.keys(DEDICATED), ...TIMBER_HOUSES, ...FAN_PAVILIONS];
  buildFrames(w, CDG_BUILDINGS.filter(each => !OUTLINE_ONLY.includes(each.name)), names, FRAME, buildRichOutline);
  for (const each of CDG_BUILDINGS.filter(item => OUTLINE_ONLY.includes(item.name))) { w.xf = null; buildRichOutline(w, rectOf(each.p, FRAME)) }
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'cdg-wall') buildWall(w);
  else if (id === 'cdg-halls') buildHalls(w);
  else if (id === 'cdg-frames') buildRest(w);
  return new Float32Array(w.data);
}
