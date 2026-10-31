// 경복궁 둘레 담장 · 궁 안 건물 모델(monuments_gyeongbok.mts 가 부른다). 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 모두 OSM(© OpenStreetMap contributors)에서 온다: 둘레 = relation 5501517 의 바깥 경계, 건물 = 그 안의 building 150동(monuments_gyeongbok_data.mts).
// 모양은 "맞춤"이 많다 — 칸 수 · 층수는 위키백과 문서(근정전 정면 5칸 · 측면 5칸 2층 팔작 · 경회루 정면 7칸 측면 5칸 2층 누각과 돌기둥 48개 · 사정전 정면 5칸 측면 3칸 3벌대 기단 ·
// 흥례문 정면 3칸 측면 2칸 중층 · 근정문 정면 3칸 측면 2칸 2층 우진각 · 향원정 2층 육각 정자), 높이 · 처마 · 월대 치수는 Commons 사진 비례로 맞춘 값이다.
// 못 그린 것(확인 안 됨): 팔작지붕의 합각(박공) — 긴 마루 우진각으로 줄였다 · 단청의 세부 무늬 · 창호 살 · 경회루 · 향원정을 둘러싼 연못과 다리 · 월대 위 박석 · 드므 · 잡상.
import { MeshWriter, K, buildRoof, buildBrackets, bandBox } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { PALACE_AT, PALACE_ORIGIN, palaceRing, MONUMENTS } from './monuments_data.mts';
import { PALACE_BUILDINGS } from './monuments_gyeongbok_data.mts';
import { toM } from './life.mts';

// 경복궁 기준점에서 잰 미터(+x 동쪽 · +y 북쪽)
const [OX, OY] = toM(PALACE_AT[0], PALACE_AT[1]);
const local = (lng:number, lat:number):[number, number] => { const [mx, my] = toM(lng, lat); return [mx - OX, -(my - OY)] };

// ── 담장 ───────────────────────────────────────────────────────────────────────────────────────────────────
const WALL_BAY = 6;   // 칸 길이(맞춤) — 사진에서 기와 지붕이 이 간격으로 단을 이룬다
// 단면(맞춤): 아래 큰 돌 1.9 m 두께 2.0 → 위 작은 벽돌 면 두께 1.7 → 기와 지붕(처마 폭 2.6 · 마루 높이 4.6)
const WALL = { stoneTop: 1.9, brickTop: 3.7, stoneHalf: 1.0, brickHalf: .85, eaveHalf: 1.3, eaveZ: 3.7, ridgeZ: 4.6 };
// 선 하나를 칸으로 나눠 그린다(점은 경복궁 기준점에서 잰 미터 · +y 북쪽). skip: 그 칸을 짓지 않는 자리
function buildWallLine(w:MeshWriter, line:V3[], skip:(x:number, y:number) => boolean):void {
  let travelled = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!, len = Math.hypot(bx - ax, by - ay);
    if (len < .05) continue;
    const bays = Math.max(1, Math.round(len / WALL_BAY)), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
    for (let k = 0; k < bays; k++) {
      const t0 = k / bays, t1 = (k + 1) / bays, overlap = .04;
      const px = ax + (bx - ax) * t0 - ux * overlap, py = ay + (by - ay) * t0 - uy * overlap, qx = ax + (bx - ax) * t1 + ux * overlap, qy = ay + (by - ay) * t1 + uy * overlap;
      const m0 = travelled + len * t0, m1 = travelled + len * t1;
      if (skip((px + qx) / 2, (py + qy) / 2)) continue;   // 문 · 광화문 자리는 담장을 짓지 않는다
      const side = (half:number, z0:number, z1:number, kind:number):void => {   // 두 쪽 옆면(길이 방향 s = 미터)
        for (const sign of [-1, 1]) {
          const hint:V3 = [nx * sign, ny * sign, 0];
          w.quad([px + nx * half * sign, py + ny * half * sign, z0], [qx + nx * half * sign, qy + ny * half * sign, z0], [qx + nx * half * sign, qy + ny * half * sign, z1], [px + nx * half * sign, py + ny * half * sign, z1], kind, hint, m0, m1, m1, m0);
        }
      };
      const top = (half:number, z:number, kind:number):void => w.quad([px - nx * half, py - ny * half, z], [qx - nx * half, qy - ny * half, z], [qx + nx * half, qy + ny * half, z], [px + nx * half, py + ny * half, z], kind, [0, 0, 1], m0, m1, m1, m0);
      side(WALL.stoneHalf, 0, WALL.stoneTop, K.granite); top(WALL.stoneHalf, WALL.stoneTop, K.granite);
      side(WALL.brickHalf, WALL.stoneTop, WALL.brickTop, K.brick);
      // 기와 지붕: 두 쪽 경사면(처마 → 마루) + 마루 띠. 칸마다 마루 끝에 작은 마구리 단(칸이 끊겨 보이게)
      for (const sign of [-1, 1]) {
        const eaveX = (x:number, y:number) => [x + nx * WALL.eaveHalf * sign, y + ny * WALL.eaveHalf * sign] as const;
        const [e0x, e0y] = eaveX(px, py), [e1x, e1y] = eaveX(qx, qy);
        w.quad([e0x, e0y, WALL.eaveZ], [e1x, e1y, WALL.eaveZ], [qx, qy, WALL.ridgeZ], [px, py, WALL.ridgeZ], K.giwa, [nx * sign * .55, ny * sign * .55, .83], m0, m1, m1, m0);
        w.quad([e0x, e0y, WALL.eaveZ - .22], [e1x, e1y, WALL.eaveZ - .22], [e1x, e1y, WALL.eaveZ], [e0x, e0y, WALL.eaveZ], K.fascia, [nx * sign, ny * sign, 0], m0, m1, m1, m0);   // 처마 끝 막새
      }
      const rx = ux * .2, ry = uy * .2;
      w.box(Math.min(px, qx) - Math.abs(rx) - .15, Math.max(px, qx) + Math.abs(rx) + .15, Math.min(py, qy) - Math.abs(ry) - .15, Math.max(py, qy) + Math.abs(ry) + .15, WALL.ridgeZ - .02, WALL.ridgeZ + .2, K.ridge, { bottom: true });   // 마루(칸 전체를 덮는 낮은 띠)
      // 칸 사이 단: 칸 끝의 마구리(막음 면) — 지붕 높이가 칸마다 한 번 끊겨 보이게
      w.quad([px - nx * WALL.eaveHalf, py - ny * WALL.eaveHalf, WALL.eaveZ - .22], [px + nx * WALL.eaveHalf, py + ny * WALL.eaveHalf, WALL.eaveZ - .22], [px + nx * WALL.eaveHalf, py + ny * WALL.eaveHalf, WALL.eaveZ], [px - nx * WALL.eaveHalf, py - ny * WALL.eaveHalf, WALL.eaveZ], K.fascia, [-ux, -uy, 0]);
    }
    travelled += len;
  }
}

// 둘레 담장: 경복궁 구역 경계(relation 5501517)를 따라 한 바퀴. 남쪽은 지도의 담장 선과 겹친다. 서 · 북 · 동쪽은 지도에 담장 선이 없어 **구역 경계선 기준**으로 그린 것이다.
// 짓지 않는 자리: 광화문(육축 · 월대가 대신 선다) · 건춘문(동) · 신무문(북) — 지도에 건물이 있어 한옥 틀이 대신한다. 영추문(서)은 지도에 건물이 없어 담장이 끊기지 않는다(확인 필요).
const WALL_GAPS = ['건춘문', '신무문'];
export function buildPalaceWall(w:MeshWriter):void {
  const ring = palaceRing().map(([lng, lat]) => { const [x, y] = local(lng, lat); return [x, y, 0] as V3 });
  ring.push(ring[0]!);
  const [gx, gy] = local(MONUMENTS[0]!.lngLat[0], MONUMENTS[0]!.lngLat[1]);
  const gaps = PALACE_BUILDINGS.filter(b => WALL_GAPS.includes(b.name)).map(b => {
    const xs:number[] = [], ys:number[] = [];
    for (let i = 0; i < b.p.length; i += 2) { const [x, y] = local(PALACE_ORIGIN[0] + b.p[i]! / 1e6, PALACE_ORIGIN[1] + b.p[i + 1]! / 1e6); xs.push(x); ys.push(y) }
    return [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...ys) - 2, Math.max(...ys) + 2] as const;
  });
  const skip = (x:number, y:number) => (Math.abs(x - gx) < 17 && Math.abs(y - gy) < 9) || gaps.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  buildWallLine(w, ring, skip);
}

// ── 건물 자리(지도 윤곽 → 가장 작은 돌린 사각형) ──────────────────────────────────────────────────────────────
interface Rect { cx:number; cy:number; len:number; wid:number; ang:number; fill:number; pts:[number, number][] }
function rectOf(p:number[]):Rect {
  const pts:[number, number][] = [];
  for (let i = 0; i < p.length; i += 2) pts.push(local(PALACE_ORIGIN[0] + p[i]! / 1e6, PALACE_ORIGIN[1] + p[i + 1]! / 1e6));
  let area = 0; for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!; area += ax * by - bx * ay }
  area = Math.abs(area) / 2;
  let best = { size: Infinity, cx: 0, cy: 0, len: 0, wid: 0, ang: 0 };
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!, theta = Math.atan2(by - ay, bx - ax), cos = Math.cos(theta), sin = Math.sin(theta);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { const u = x * cos + y * sin, v = -x * sin + y * cos; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v) }
    if ((x1 - x0) * (y1 - y0) < best.size) { const mu = (x0 + x1) / 2, mv = (y0 + y1) / 2, long = x1 - x0 >= y1 - y0; best = { size: (x1 - x0) * (y1 - y0), cx: mu * cos - mv * sin, cy: mu * sin + mv * cos, len: Math.max(x1 - x0, y1 - y0), wid: Math.min(x1 - x0, y1 - y0), ang: long ? theta : theta + Math.PI / 2 } }
  }
  return { cx: best.cx, cy: best.cy, len: best.len, wid: best.wid, ang: best.ang, fill: area / best.size, pts };
}
const place = (w:MeshWriter, r:Rect) => { w.xf = { x: r.cx, y: r.cy, cos: Math.cos(r.ang), sin: Math.sin(r.ang) } };

// ── 한옥 한 동(틀) ────────────────────────────────────────────────────────────────────────────────────────────
// hx · hy: 몸(기둥 줄) 반 길이 · 반 폭. 긴 쪽이 x. 마루는 x 방향.
interface Hall {
  hx:number; hy:number; podium:number; body:number; rise:number; eave:number; bays:[number, number]; steps:{ side:number; slope:number };
  tiers?:1 | 2; lift?:number; ridgeFrac?:number; upper?:[number, number]; upperRise?:number; hollow?:boolean; ridgeless?:boolean; brackets?:boolean; doors?:boolean; stair?:boolean; lowPodium?:number[];   // lowPodium: 기단을 여러 벌대로 쌓을 때 벌마다 바깥으로 내미는 폭
}
const BAND = 1.1;
function column(w:MeshWriter, x:number, y:number, z0:number, z1:number, half = .26):void { w.box(x - half, x + half, y - half, y + half, z0, z1, K.red, { bottom: true, top: true }) }
// 층 하나의 몸: 회벽 · 기둥 · 창방 · (공포) → 맨 위 높이 반환
function storey(w:MeshWriter, S:Pick<Hall, 'bays' | 'brackets' | 'doors' | 'hollow'>, hx:number, hy:number, base:number, body:number, open = false):number {
  const top = base + body;
  if (S.hollow) w.quad([-hx, -hy, base], [hx, -hy, base], [hx, hy, base], [-hx, hy, base], K.wood, [0, 0, 1]);   // 벽 없는 누각: 마루 위만 비치게
  else w.box(-hx + .2, hx - .2, -hy + .2, hy - .2, base, top, open ? K.wood : K.plaster, { top: true });   // 위층은 녹색 판문(검은 빈 면으로 보이던 것 — Codex 2026-10-31)
  for (let i = 0; i <= S.bays[0]; i++) { const x = -hx + 2 * hx * i / S.bays[0]; for (const y of [-hy, hy]) column(w, x, y, base, top) }
  for (let i = 1; i < S.bays[1]; i++) { const y = -hy + 2 * hy * i / S.bays[1]; for (const x of [-hx, hx]) column(w, x, y, base, top) }
  if (S.doors) {   // 앞(남쪽 = −y) 칸마다 어두운 문짝 자리
    const bay = 2 * hx / S.bays[0], first = S.bays[0] <= 3 ? 0 : 1, last = S.bays[0] <= 3 ? S.bays[0] - 1 : S.bays[0] - 2;
    for (let i = first; i <= last; i++) { const cx = -hx + bay * (i + .5); w.quad([cx - bay * .32, -hy - .03, base + .1], [cx + bay * .32, -hy - .03, base + .1], [cx + bay * .32, -hy - .03, top - .35], [cx - bay * .32, -hy - .03, top - .35], K.tunnel, [0, -1, 0]) }
  }
  bandBox(w, hx + .45, hy + .45, top - .4, top, K.dancheong, 0, .28);
  bandBox(w, hx + .45, hy + .45, top, top + BAND, K.dancheong, .3, 1);
  if (S.brackets) buildBrackets(w, hx + .45, hy + .45, top + .1);
  return top + BAND;
}
function podiumOf(w:MeshWriter, S:Hall):void {
  const out = S.lowPodium ?? [.9], steps = out.length;
  out.forEach((margin, i) => w.box(-S.hx - margin, S.hx + margin, -S.hy - margin, S.hy + margin, S.podium * i / steps, S.podium * (i + 1) / steps, K.granite, { bottom: true }));
  if (S.stair) {   // 앞 가운데 계단(세 단)
    const margin = out[0]!, width = Math.min(3.4, S.hx * .35);
    for (let k = 0; k < 3; k++) w.box(-width, width, -S.hy - margin - (3 - k) * .6, -S.hy - margin + .01, 0, S.podium * (k + 1) / 3, K.trim, { bottom: true });
  }
}
// 지붕 덮개: 마루 없는 지붕(강녕전 · 교태전)의 윗면을 막는다
function roofCap(w:MeshWriter, hx:number, hy:number, z:number):void { w.quad([-hx, -hy, z], [hx, -hy, z], [hx, hy, z], [-hx, hy, z], K.giwa, [0, 0, 1]) }
function roofOf(S:Hall, hx:number, hy:number, z0:number, rise:number, innerHx?:number, innerHy?:number) {
  const outerX = hx + S.eave, outerY = hy + S.eave, lift = S.lift ?? Math.min(1.1, S.eave * .45 + .2);
  if (innerHx !== undefined && innerHy !== undefined) return { hx: outerX, hy: outerY, ix: innerHx, iy: innerHy, z0, rise, lift, flare: Math.min(.9, S.eave * .4), steps: S.steps };
  if (S.ridgeless) { const iy = outerY * .3, ix = Math.max(.5, outerX - (outerY - iy)); return { hx: outerX, hy: outerY, ix, iy, z0, rise, lift, flare: Math.min(.9, S.eave * .4), steps: S.steps } }
  return { hx: outerX, hy: outerY, ix: S.ridgeFrac ? Math.max(.5, outerX * S.ridgeFrac) : Math.max(.5, outerX - outerY), iy: 0, z0, rise, lift, flare: Math.min(.9, S.eave * .4), steps: S.steps };
}
function hall(w:MeshWriter, S:Hall):number {
  podiumOf(w, S);
  const base = S.podium;
  if (S.tiers === 2) {
    const topLow = storey(w, S, S.hx, S.hy, base, S.body), upperHx = S.hx * (S.upper?.[0] ?? .86), upperHy = S.hy * (S.upper?.[1] ?? .8), roofZ = topLow - .25, lowRise = S.rise * .38;
    buildRoof(w, roofOf(S, S.hx + .45, S.hy + .45, roofZ, lowRise, upperHx + .6, upperHy + .6), { innerZ: topLow - .2, innerHx: S.hx + .45, innerHy: S.hy + .45 });
    const upperBase = roofZ + lowRise - .6, top = storey(w, { bays: S.bays, brackets: S.brackets }, upperHx, upperHy, upperBase, S.body * .85, true);
    const upperRoof = roofOf(S, upperHx + .45, upperHy + .45, top - .25, S.upperRise ?? S.rise);
    buildRoof(w, upperRoof, { innerZ: top - .2, innerHx: upperHx + .45, innerHy: upperHy + .45 });
    if (S.ridgeless) roofCap(w, upperRoof.ix, upperRoof.iy, top - .25 + S.rise);
    return top - .25 + (S.upperRise ?? S.rise);
  }
  const top = storey(w, S, S.hx, S.hy, base, S.body);
  const roof = roofOf(S, S.hx + .45, S.hy + .45, top - .25, S.rise);
  buildRoof(w, roof, { innerZ: top - .2, innerHx: S.hx + .45, innerHy: S.hy + .45 });
  if (S.ridgeless) roofCap(w, roof.ix, roof.iy, top - .25 + S.rise);
  return top - .25 + S.rise;
}
const clamp = (value:number, min:number, max:number) => Math.max(min, Math.min(max, value));

// ── 전용 모델 ────────────────────────────────────────────────────────────────────────────────────────────────
const FINE = { side: 12, slope: 4 }, MID = { side: 6, slope: 3 }, ROUGH = { side: 3, slope: 2 };
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
  const S:Hall = { hx: hx - 2.5, hy: hy - 2.5, podium: 0, body: 5.2, rise: 5.6, eave: 3.4, bays: [5, 5], steps: FINE, tiers: 2, brackets: true, doors: true, lift: 1.6, upper: [.95, .93], upperRise: 3.8, ridgeFrac: .66 };   // 윗지붕: 용마루 1.8 m 낮추고 아래 지붕에 가깝게 넓히고 긴 마루 · 처마 끝 들림 1.6 m(Codex 2026-10-31)
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
  const S:Hall = { hx: bx, hy: by, podium: 0, body: 5.2, rise: 5.8, eave: 3.2, bays: [7, 5], steps: FINE, brackets: true, hollow: true, ridgeFrac: .46, lift: 1.3 };   // 벽 없는 열린 누각 · 긴 팔작 마루(15 m 안팎) · 상층 높이 5.2 m
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
  for (const b of rects(Object.keys(DEDICATED), true)) { const r = rectOf(b.p); place(w, r); DEDICATED[b.name]!(w, r) }
  w.xf = null;
}

// ── 나머지 건물: 한옥 틀 ─────────────────────────────────────────────────────────────────────────────────────
// 윤곽에 맞는 돌린 사각형이면 낮은 기단 + 회벽 몸 + 우진각 지붕, 아니면(ㄱ · ㄷ자 …) 윤곽을 그대로 세운 벽과 낮은 한 점 지붕. 칸 수 · 높이는 크기에서 정한 맞춤값
function buildFrameOutline(w:MeshWriter, r:Rect):void {
  const pts = r.pts, cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length, cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length, wall = 3.4;
  let area2 = 0; for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!; area2 += ax * by - bx * ay }
  const ccw = area2 > 0, small = Math.abs(area2) / 2 < 600;   // 작은 윤곽은 한 점 지붕, 큰 윤곽(마당을 두른 행각 · 회랑)은 가장자리를 따라 긴 지붕 띠(가운데 마당은 비운다)
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    w.quad([ax, ay, 0], [bx, by, 0], [bx, by, wall], [ax, ay, wall], K.plaster, [dy, -dx, 0]);
    if (small) {
      const e = (x:number, y:number):V3 => [x + (cx - x) * .06, y + (cy - y) * .06, wall + .5];
      w.quad([ax, ay, wall], [bx, by, wall], e(bx, by), e(ax, ay), K.fascia, [dy, -dx, 0]);
      w.tri(e(ax, ay), e(bx, by), [cx, cy, wall + 2], K.giwa, [0, 0, 1]);
    } else {
      const inx = (ccw ? -dy : dy) / len, iny = (ccw ? dx : -dx) / len, depth = 2.7, out = .9;   // 안쪽 방향 · 지붕 띠 폭(맞춤) · 처마 내민 길이
      const eave = (x:number, y:number):V3 => [x - inx * out, y - iny * out, wall - .1], ridge = (x:number, y:number):V3 => [x + inx * depth, y + iny * depth, wall + 1.7];
      w.quad(eave(ax, ay), eave(bx, by), ridge(bx, by), ridge(ax, ay), K.giwa, [-inx * .4, -iny * .4, .9]);
      w.quad(eave(ax, ay), eave(bx, by), [bx - inx * out, by - iny * out, wall - .35], [ax - inx * out, ay - iny * out, wall - .35], K.fascia, [-inx, -iny, 0]);
    }
  }
}
export function buildPalaceFrames(w:MeshWriter):void {
  for (const b of rects(Object.keys(DEDICATED), false)) {
    const r = rectOf(b.p);
    if (r.len * r.wid < 10) continue;   // 아주 작은 것(화장실 · 매점 …)은 건너뛴다
    if (r.fill < .78 || r.len * r.wid > 1500) { w.xf = null; buildFrameOutline(w, r); continue }
    place(w, r);
    const hx = Math.max(1.2, r.len / 2 - 1), hy = Math.max(1, r.wid / 2 - 1), bay = clamp(Math.round(hx * 2 / 3.3), 1, 9);
    hall(w, { hx, hy, podium: .6, body: 3.2, rise: clamp((hy + 1.6) * .55, 1.2, 3.4), eave: clamp(hy * .5, .9, 1.8), bays: [bay, clamp(Math.round(hy * 2 / 3.3), 1, 3)], steps: ROUGH });
  }
  w.xf = null;
}
