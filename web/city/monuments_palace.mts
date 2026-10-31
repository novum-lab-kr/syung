// 경복궁 둘레 담장 · 궁 안 건물 모델(monuments_gyeongbok.mts 가 부른다). 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 모두 OSM(© OpenStreetMap contributors)에서 온다: 둘레 = relation 5501517 의 바깥 경계, 건물 = 그 안의 building 150동(monuments_gyeongbok_data.mts).
// 모양은 "맞춤"이 많다 — 칸 수 · 층수는 위키백과 문서(근정전 정면 5칸 · 측면 5칸 2층 팔작 · 경회루 정면 7칸 측면 5칸 2층 누각과 돌기둥 48개 · 사정전 정면 5칸 측면 3칸 3벌대 기단 ·
// 흥례문 정면 3칸 측면 2칸 중층 · 근정문 정면 3칸 측면 2칸 2층 우진각 · 향원정 2층 육각 정자), 높이 · 처마 · 월대 치수는 Commons 사진 비례로 맞춘 값이다.
// 못 그린 것(확인 안 됨): 팔작지붕의 합각(박공) — 긴 마루 우진각으로 줄였다 · 단청의 세부 무늬 · 창호 살 · 경회루 · 향원정을 둘러싼 연못과 다리 · 월대 위 박석 · 드므 · 잡상.
import { buildRoof, buildBrackets, bandBox, MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { PALACE_AT, PALACE_ORIGIN, palaceRing, MONUMENTS } from './monuments_data.mts';
import { PALACE_BUILDINGS } from './monuments_gyeongbok_data.mts';
import { frameOf, local, buildWallLine, rectOf, place, hall, clamp, FINE, MID, ROUGH, buildFrames } from './monuments_hanok.mts';
import type { Rect, Hall } from './monuments_hanok.mts';

const GB = frameOf(PALACE_AT, PALACE_ORIGIN);
// 둘레 담장: 경복궁 구역 경계(relation 5501517)를 따라 한 바퀴. 남쪽은 지도의 담장 선과 겹친다. 서 · 북 · 동쪽은 지도에 담장 선이 없어 **구역 경계선 기준**으로 그린 것이다.
// 짓지 않는 자리: 광화문(육축 · 월대가 대신 선다) · 건춘문(동) · 신무문(북) — 지도에 건물이 있어 한옥 틀이 대신한다. 영추문(서)은 지도에 건물이 없어 담장이 끊기지 않는다(확인 필요).
const WALL_GAPS = ['건춘문', '신무문'];
export function buildPalaceWall(w:MeshWriter):void {
  const ring = palaceRing().map(([lng, lat]) => { const [x, y] = local(lng, lat, GB); return [x, y, 0] as V3 });
  ring.push(ring[0]!);
  const [gx, gy] = local(MONUMENTS[0]!.lngLat[0], MONUMENTS[0]!.lngLat[1], GB);
  const gaps = PALACE_BUILDINGS.filter(b => WALL_GAPS.includes(b.name)).map(b => {
    const xs:number[] = [], ys:number[] = [];
    for (let i = 0; i < b.p.length; i += 2) { const [x, y] = local(PALACE_ORIGIN[0] + b.p[i]! / 1e6, PALACE_ORIGIN[1] + b.p[i + 1]! / 1e6, GB); xs.push(x); ys.push(y) }
    return [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...ys) - 2, Math.max(...ys) + 2] as const;
  });
  const skip = (x:number, y:number) => (Math.abs(x - gx) < 17 && Math.abs(y - gy) < 9) || gaps.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  buildWallLine(w, ring, skip);
}


// ── 전용 모델 ────────────────────────────────────────────────────────────────────────────────────────────────
// 근정전: 지도 윤곽 = 상월대(기단) 가장자리. 둘레에 하월대(맞춤 +6 m) · 몸은 안쪽으로 2.5 m. 중층 팔작(긴 마루 우진각으로 줄임) · 정면 5칸 측면 5칸
function buildGeunjeongjeon(w:MeshWriter, r:Rect):void {
  const hx = r.len / 2, hy = r.wid / 2;
  w.box(-hx - 6, hx + 6, -hy - 6, hy + 6, 0, 1.1, K.granite, { bottom: true });
  w.quad([-hx - 6, -hy - 6, 1.1], [hx + 6, -hy - 6, 1.1], [hx + 6, hy + 6, 1.1], [-hx - 6, hy + 6, 1.1], K.deck, [0, 0, 1]);
  const stairW = 4;   // 앞 가운데 어도 계단
  for (let k = 0; k < 4; k++) w.box(-stairW, stairW, -hy - 6 - (4 - k) * .7, -hy - 6 + .01, 0, 1.1 * (k + 1) / 4 + (k > 2 ? 0 : 0), K.trim, { bottom: true });
  // 상월대(기단) 위에 몸을 앉힌다 — 몸 바닥 높이 = 하월대 + 상월대
  const upper = 2.4;
  w.box(-hx, hx, -hy, hy, 1.1, upper, K.granite, { bottom: true });
  w.quad([-hx, -hy, upper], [hx, -hy, upper], [hx, hy, upper], [-hx, hy, upper], K.deck, [0, 0, 1]);
  const stair = 3.4; for (let k = 0; k < 3; k++) w.box(-stair, stair, -hy - (3 - k) * .6, -hy + .01, 1.1, 1.1 + (upper - 1.1) * (k + 1) / 3, K.trim, { bottom: true });
  const S:Hall = { hx: hx - 2.5, hy: hy - 2.5, podium: 0, body: 5.2, rise: 5.6, eave: 3.4, bays: [5, 5], steps: FINE, tiers: 2, brackets: true, doors: true, lift: 1.6, upper: [.95, .93], upperRise: 3.8, ridgeFrac: .66, gable: .55 };   // 윗지붕: 용마루 1.8 m 낮추고 아래 지붕에 가깝게 넓히고 긴 마루 · 처마 끝 들림 1.6 m(Codex 2026-10-31)
  w.dz = upper; hall(w, S); w.dz = 0;   // 몸을 상월대 높이만큼 올려 짓는다
  // 월대 난간: 상월대 가장자리 돌 동자주 줄(맞춤)
  const rail = (ax:number, ay:number, bx:number, by:number) => { const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2.6)); for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; w.box(x - .16, x + .16, y - .16, y + .16, upper, upper + 1.05, K.trim, { bottom: true }) } };
  rail(-hx + .3, -hy + .3, -stair - .8, -hy + .3); rail(stair + .8, -hy + .3, hx - .3, -hy + .3); rail(-hx + .3, hy - .3, hx - .3, hy - .3);
  rail(-hx + .3, -hy + .3, -hx + .3, hy - .3); rail(hx - .3, -hy + .3, hx - .3, hy - .3);
}
// 경회루: 지도 윤곽 = 섬 위 돌 기단. 1층은 돌기둥 8 × 6 = 48개(바깥 줄 24는 네모 · 안 24는 둥글게), 2층은 벽 없는 누마루와 우진각 지붕
function buildGyeonghoeru(w:MeshWriter, r:Rect):void {
  const hx = r.len / 2, hy = r.wid / 2, podium = 1.3;
  w.box(-hx, hx, -hy, hy, 0, podium, K.granite, { bottom: true });
  const bx = Math.max(10, hx - 3.5), by = Math.min(bx * 5 / 7, hy - 2.5), floorZ = podium + 5.2;   // 몸 반 길이(7칸 × 5칸 비례 — 맞춤)
  for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
    const x = -bx + 2 * bx * i / 7, y = -by + 2 * by * j / 5, outer = i === 0 || i === 7 || j === 0 || j === 5;
    if (outer) w.box(x - .42, x + .42, y - .42, y + .42, podium, floorZ, K.granite, { bottom: true, top: true });   // 길고 가는 돌기둥(Codex: 굵기 0.7~0.9 m)
    else w.prism(x, y, .42, podium, floorZ, K.granite, 8);
  }
  w.box(-bx - .9, bx + .9, -by - .9, by + .9, floorZ, floorZ + .45, K.wood, { bottom: true });   // 2층 마루 두께
  const S:Hall = { hx: bx, hy: by, podium: 0, body: 5.2, rise: 5.8, eave: 3.2, bays: [7, 5], steps: FINE, brackets: true, hollow: true, ridgeFrac: .46, lift: 1.3, gable: .5 };   // 벽 없는 열린 누각 · 긴 팔작 마루(15 m 안팎) · 상층 높이 5.2 m
  w.dz = floorZ + .45; hall(w, S); w.dz = 0;
  // 누마루 둘레 붉은 난간(높이 0.9 m, 칸마다 띄운다) · 섬 가장자리 돌 난간 동자주
  const railZ = floorZ + .45, redRail = (ax:number, ay:number, bx2:number, by2:number) => { const n = Math.max(1, Math.round(Math.hypot(bx2 - ax, by2 - ay) / 3.4)); for (let i = 0; i < n; i++) { const x0 = ax + (bx2 - ax) * i / n, y0 = ay + (by2 - ay) * i / n, x1 = ax + (bx2 - ax) * (i + 1) / n, y1 = ay + (by2 - ay) * (i + 1) / n; w.box(Math.min(x0, x1) - .07, Math.max(x0, x1) + .07, Math.min(y0, y1) - .07, Math.max(y0, y1) + .07, railZ + .78, railZ + .92, K.red, { bottom: true }); w.box(Math.min(x0, x1) - .05, Math.max(x0, x1) + .05, Math.min(y0, y1) - .05, Math.max(y0, y1) + .05, railZ + .3, railZ + .42, K.red, { bottom: true }) } };
  const rx = bx + .75, ry = by + .75; redRail(-rx, -ry, rx, -ry); redRail(-rx, ry, rx, ry); redRail(-rx, -ry, -rx, ry); redRail(rx, -ry, rx, ry);
  const stoneRail = (ax:number, ay:number, bx2:number, by2:number) => { const n = Math.max(1, Math.round(Math.hypot(bx2 - ax, by2 - ay) / 2.6)); for (let i = 0; i <= n; i++) { const x = ax + (bx2 - ax) * i / n, y = ay + (by2 - ay) * i / n; w.box(x - .15, x + .15, y - .15, y + .15, podium, podium + .85, K.trim, { bottom: true }) } };
  const sx = hx - .4, sy = hy - .4; stoneRail(-sx, -sy, sx, -sy); stoneRail(-sx, sy, sx, sy); stoneRail(-sx, -sy, -sx, sy); stoneRail(sx, -sy, sx, sy);   // 2층 마루 위에 누마루 몸과 지붕을 올려 짓는다
}
// 향원정: 지도 윤곽 = 육각 정자(2층). 둘레 연못 · 취향교는 그리지 않는다.
// Codex 2026-10-31: 중간 처마(아래 지붕)를 없애고 그 자리를 목조 발코니로, 육각 지붕 하나만 곡선(귀 들림 · 처마 완만 · 위로 가파름)으로 얹는다. 돌 받침은 낮추고 목조 마루 · 청록 창호 · 붉은 기둥.
function buildHyangwonjeong(w:MeshWriter, r:Rect):void {
  const radius = clamp(r.wid / 2 / Math.cos(Math.PI / 6) * .92, 3.2, 6), stone = .45, floor = 1.05, lower = 3.4, upper = 3.0;
  w.prism(0, 0, radius + 1.6, 0, stone, K.granite, 6);
  w.prism(0, 0, radius + .5, stone, floor, K.wood, 6);   // 목조 마루(짧은 기둥 위)
  const hexPts = (rad:number, z:number) => Array.from({ length: 6 }, (_, k): V3 => [Math.cos(Math.PI / 3 * k) * rad, Math.sin(Math.PI / 3 * k) * rad, z]);
  const wall = (rad:number, z0:number, z1:number, kind:number) => { const lo = hexPts(rad, z0), hi = hexPts(rad, z1); for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6, mid = Math.PI / 3 * (k + .5); w.quad(lo[k]!, lo[k2]!, hi[k2]!, hi[k]!, kind, [Math.cos(mid), Math.sin(mid), 0]) } };
  const column = (rad:number, z0:number, z1:number) => hexPts(rad, 0).forEach(p => w.box(p[0] - .22, p[0] + .22, p[1] - .22, p[1] + .22, z0, z1, K.red, { bottom: true, top: true }));
  // 육각 지붕: 둘레 열두 점(귀 여섯 + 변 가운데 여섯)을 위로 갈수록 좁히는 고리로 쌓는다. 귀는 솟고 바깥으로 뻗고, 면은 처마에서 완만하다 위로 갈수록 가파른 오목 곡선
  const roof = (rad:number, z0:number, rise:number, lift:number) => {
    const RINGS = 5, ring = (t:number):V3[] => {
      const pts:V3[] = [];
      for (let k = 0; k < 6; k++) {
        const a0 = Math.PI / 3 * k, a1 = Math.PI / 3 * (k + 1), scale = 1 - t, z = z0 + rise * t ** 1.35;
        pts.push([Math.cos(a0) * rad * 1.05 * scale, Math.sin(a0) * rad * 1.05 * scale, z + lift * (1 - t) ** 1.6]);   // 귀: 솟고 바깥으로
        pts.push([(Math.cos(a0) + Math.cos(a1)) / 2 * rad * scale, (Math.sin(a0) + Math.sin(a1)) / 2 * rad * scale, z]);   // 변 가운데: 낮고 완만
      }
      return pts;
    };
    for (let i = 0; i < RINGS; i++) {
      const lo = ring(i / RINGS), hi = ring((i + 1) / RINGS);
      for (let j = 0; j < 12; j++) { const j2 = (j + 1) % 12; w.quad(lo[j]!, lo[j2]!, hi[j2]!, hi[j]!, K.giwa, [0, 0, 1], j * 1.2, (j + 1) * 1.2, (j + 1) * 1.2, j * 1.2) }
    }
    const eave = ring(0);   // 처마 끝 띠(부연)와 밑면
    for (let j = 0; j < 12; j++) { const j2 = (j + 1) % 12, a = eave[j]!, b = eave[j2]!; w.quad(a, b, [b[0], b[1], b[2] - .32], [a[0], a[1], a[2] - .32], K.fascia, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0], j * 1.2, (j + 1) * 1.2, (j + 1) * 1.2, j * 1.2); w.tri([0, 0, z0 - .3], [a[0], a[1], a[2] - .32], [b[0], b[1], b[2] - .32], K.soffit, [0, 0, -1]) }
  };
  wall(radius, floor, floor + lower, K.wood); column(radius, floor, floor + lower);   // 아래층: 청록 창호
  // 발코니(중간 처마 대신): 돌출 0.9 m 마루 + 붉은 난간
  const balZ = floor + lower, balR = radius + .9;
  w.prism(0, 0, balR, balZ - .15, balZ + .12, K.wood, 6);
  const rails = hexPts(balR - .08, 0);
  for (let k = 0; k < 6; k++) {
    const a = rails[k]!, b = rails[(k + 1) % 6]!, mid:V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
    w.quad([a[0], a[1], balZ + .75], [b[0], b[1], balZ + .75], [b[0], b[1], balZ + .9], [a[0], a[1], balZ + .9], K.red, mid);
    w.quad([a[0], a[1], balZ + .3], [b[0], b[1], balZ + .3], [b[0], b[1], balZ + .42], [a[0], a[1], balZ + .42], K.red, mid);
    w.box(a[0] - .1, a[0] + .1, a[1] - .1, a[1] + .1, balZ + .12, balZ + .9, K.red, { bottom: true });
  }
  const r2 = radius * .82, z2 = balZ + .12;
  wall(r2, z2, z2 + upper, K.wood); column(r2, z2, z2 + upper);
  roof(r2 + 1.8, z2 + upper, 3.2, .55);
  w.prism(0, 0, .28, z2 + upper + 3.1, z2 + upper + 3.5, K.gilt, 8); w.frustum(0, 0, .22, .22, z2 + upper + 3.5, .05, .05, z2 + upper + 4.6, K.gilt);   // 절병통(꼭대기 장식)
}
const DEDICATED:Record<string, (w:MeshWriter, r:Rect) => void> = {
  근정전: buildGeunjeongjeon,
  경회루: buildGyeonghoeru,
  향원정: buildHyangwonjeong,
  사정전: (w, r) => { hall(w, { hx: r.len / 2 - 1, hy: r.wid / 2 - 1, podium: 1.5, lowPodium: [1.8, 1.2, .6], body: 4.4, rise: 4.3, eave: 2.8, bays: [5, 3], steps: FINE, brackets: true, doors: true, stair: true }) },   // 3벌대 기단 · 우진각
  강녕전: (w, r) => { hall(w, { hx: r.len / 2 - 1, hy: r.wid / 2 - 1, podium: 1.2, lowPodium: [1.2, .6], body: 4, rise: 3.6, eave: 2.6, bays: [7, 3], steps: FINE, ridgeless: true, doors: true, stair: true }) },   // 용마루 없는 지붕(무량각)
  교태전: (w, r) => { hall(w, { hx: r.len / 2 - 1, hy: r.wid / 2 - 1, podium: 1.2, lowPodium: [1.2, .6], body: 3.8, rise: 3.4, eave: 2.4, bays: [5, 3], steps: FINE, ridgeless: true, doors: true, stair: true }) },
  흥례문: (w, r) => { hall(w, { hx: Math.min(r.len / 2, 12) - .5, hy: Math.min(r.wid / 2, 6) - .5, podium: 1.3, body: 3.6, rise: 4, eave: 2.4, bays: [3, 2], steps: FINE, tiers: 2, brackets: true, doors: true, stair: true }) },   // 중층 문루
  근정문: (w, r) => { hall(w, { hx: Math.min(r.len / 2, 10) - .5, hy: Math.min(r.wid / 2, 5.5) - .5, podium: 1.3, body: 3.4, rise: 3.8, eave: 2.3, bays: [3, 2], steps: FINE, tiers: 2, brackets: true, doors: true, stair: true }) },
};
const rects = (names:string[], keep:boolean) => PALACE_BUILDINGS.filter(b => (names.includes(b.name) === keep) && b.p.length >= 6);
export function buildPalaceHalls(w:MeshWriter):void {
  for (const b of rects(Object.keys(DEDICATED), true)) { const r = rectOf(b.p, GB); place(w, r); DEDICATED[b.name]!(w, r) }
  w.xf = null;
}

export const buildPalaceFrames = (w:MeshWriter):void => buildFrames(w, PALACE_BUILDINGS, Object.keys(DEDICATED), GB);
