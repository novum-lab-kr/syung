// 한옥 전각 공통 부품(담장 · 한옥 한 동 · 틀 건물): 경복궁(monuments_palace.mts) · 창덕궁(monuments_changdeokgung.mts)이 같이 쓴다. 구역 자료(건물 · 기준점)를 import 하지 않는다 —
// 창덕궁만 보일 때 경복궁 자료가 딸려 오지 않게 기준점 틀(Frame)과 건물 목록은 부르는 쪽이 넘긴다. 모드 · 테마 입력 없음 — 실물 색 하나.
import { MeshWriter, K, buildRoof, buildBrackets, bandBox } from './monument_parts.mts';
import { matbaeRoof } from './monument_matbae.mts';
import type { V3 } from './monument_parts.mts';
import { toM } from './life.mts';

export interface Frame { origin:[number, number]; ox:number; oy:number }
export const frameOf = (at:[number, number], origin:[number, number]):Frame => { const [ox, oy] = toM(at[0], at[1]); return { origin, ox, oy } };
export const local = (lng:number, lat:number, frame:Frame):[number, number] => { const [mx, my] = toM(lng, lat); return [mx - frame.ox, -(my - frame.oy)] };

// ── 담장 ───────────────────────────────────────────────────────────────────────────────────────────────────
const WALL_BAY = 6;   // 칸 길이(맞춤) — 사진에서 기와 지붕이 이 간격으로 단을 이룬다
// 단면(맞춤): 아래 큰 돌 1.9 m 두께 2.0 → 위 작은 벽돌 면 두께 1.7 → 기와 지붕(처마 폭 2.6 · 마루 높이 4.6)
const WALL = { stoneTop: 1.9, brickTop: 3.7, stoneHalf: 1.0, brickHalf: .85, eaveHalf: 1.3, eaveZ: 3.7, ridgeZ: 4.6 };
// 선 하나를 칸으로 나눠 그린다(점은 경복궁 기준점에서 잰 미터 · +y 북쪽). skip: 그 칸을 짓지 않는 자리
export function buildWallLine(w:MeshWriter, line:V3[], skip:(x:number, y:number) => boolean):void {
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
      // 마루(칸 전체를 덮는 낮은 띠): 담 방향을 따라 도는 좁은 띠 — 축 정렬 상자로 두면 비스듬한 담에서 톱니가 된다
      {
        const rz0 = WALL.ridgeZ - .02, rz1 = WALL.ridgeZ + .2, hw = .2, ext = .15;
        const a = [px - ux * ext, py - uy * ext], b = [qx + ux * ext, qy + uy * ext];
        const c = (point:number[], sign:number, z:number):V3 => [point[0]! + nx * hw * sign, point[1]! + ny * hw * sign, z];
        w.quad(c(a, -1, rz1), c(b, -1, rz1), c(b, 1, rz1), c(a, 1, rz1), K.ridge, [0, 0, 1]);
        for (const sign of [-1, 1]) w.quad(c(a, sign, rz0), c(b, sign, rz0), c(b, sign, rz1), c(a, sign, rz1), K.ridge, [nx * sign, ny * sign, 0]);
        w.quad(c(a, 1, rz0), c(a, -1, rz0), c(a, -1, rz1), c(a, 1, rz1), K.ridge, [-ux, -uy, 0]);
        w.quad(c(b, -1, rz0), c(b, 1, rz0), c(b, 1, rz1), c(b, -1, rz1), K.ridge, [ux, uy, 0]);
      }
      // 칸 사이 단: 칸 끝의 마구리(막음 면) — 지붕 높이가 칸마다 한 번 끊겨 보이게
      w.quad([px - nx * WALL.eaveHalf, py - ny * WALL.eaveHalf, WALL.eaveZ - .22], [px + nx * WALL.eaveHalf, py + ny * WALL.eaveHalf, WALL.eaveZ - .22], [px + nx * WALL.eaveHalf, py + ny * WALL.eaveHalf, WALL.eaveZ], [px - nx * WALL.eaveHalf, py - ny * WALL.eaveHalf, WALL.eaveZ], K.fascia, [-ux, -uy, 0]);
    }
    travelled += len;
  }
}

export interface Rect { cx:number; cy:number; len:number; wid:number; ang:number; fill:number; pts:[number, number][] }
export function rectOf(p:number[], frame:Frame):Rect {
  const pts:[number, number][] = [];
  for (let i = 0; i < p.length; i += 2) pts.push(local(frame.origin[0] + p[i]! / 1e6, frame.origin[1] + p[i + 1]! / 1e6, frame));
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
export const place = (w:MeshWriter, r:Rect) => { w.xf = { x: r.cx, y: r.cy, cos: Math.cos(r.ang), sin: Math.sin(r.ang) } };

// ── 한옥 한 동(틀) ────────────────────────────────────────────────────────────────────────────────────────────
// hx · hy: 몸(기둥 줄) 반 길이 · 반 폭. 긴 쪽이 x. 마루는 x 방향.
export interface Hall {
  hx:number; hy:number; podium:number; body:number; rise:number; eave:number; bays:[number, number]; steps:{ side:number; slope:number };
  tiers?:1 | 2; lift?:number; ridgeFrac?:number; upper?:[number, number]; upperRise?:number; hollow?:boolean; ridgeless?:boolean; gable?:number; brackets?:boolean; doors?:boolean; doorsAll?:boolean; doorKind?:number; gabled?:boolean; stair?:boolean; lowPodium?:number[];   // lowPodium: 기단을 여러 벌대로 쌓을 때 벌마다 바깥으로 내미는 폭
}
const BAND = 1.1;
function column(w:MeshWriter, x:number, y:number, z0:number, z1:number, half = .26):void { w.box(x - half, x + half, y - half, y + half, z0, z1, K.red, { bottom: true, top: true }) }
// 창호(한지 창): 기둥 사이 칸마다 회벽 앞에 살짝 내민 창 한 장 — 밤에 안에서 불빛이 비치는 곳은 이 재질(K.window)뿐이다.
// 문을 단 앞 칸(S.doors)에는 달지 않고, 합각 벽 · 막힌 벽(윤곽 벽)에도 달지 않는다. 낮에는 회벽과 거의 같은 색에 살 무늬만 옅다
function windowPanes(w:MeshWriter, S:Pick<Hall, 'bays' | 'doors' | 'doorsAll'>, hx:number, hy:number, base:number, top:number):void {
  const z0 = base + .85, z1 = top - .6, off = .14; if (z1 - z0 < .8) return;
  const doorFirst = S.bays[0] <= 3 || S.doorsAll ? 0 : 1, doorLast = S.bays[0] <= 3 || S.doorsAll ? S.bays[0] - 1 : S.bays[0] - 2;
  const bayX = 2 * hx / S.bays[0], bayY = 2 * hy / S.bays[1];
  for (let i = 0; i < S.bays[0]; i++) {
    const cx = -hx + bayX * (i + .5), half = bayX * .31;
    if (!(S.doors && i >= doorFirst && i <= doorLast)) w.quad([cx - half, -hy + off, z0], [cx + half, -hy + off, z0], [cx + half, -hy + off, z1], [cx - half, -hy + off, z1], K.window, [0, -1, 0]);
    w.quad([cx + half, hy - off, z0], [cx - half, hy - off, z0], [cx - half, hy - off, z1], [cx + half, hy - off, z1], K.window, [0, 1, 0]);
  }
  for (let j = 0; j < S.bays[1]; j++) {
    const cy = -hy + bayY * (j + .5), half = bayY * .31;
    for (const side of [-1, 1]) w.quad([side * (hx - off), cy - half, z0], [side * (hx - off), cy + half, z0], [side * (hx - off), cy + half, z1], [side * (hx - off), cy - half, z1], K.window, [side, 0, 0]);
  }
}
// 층 하나의 몸: 회벽 · 기둥 · 창방 · (공포) → 맨 위 높이 반환
function storey(w:MeshWriter, S:Pick<Hall, 'bays' | 'brackets' | 'doors' | 'doorsAll' | 'doorKind' | 'hollow'>, hx:number, hy:number, base:number, body:number, open = false):number {
  const top = base + body;
  if (S.hollow) w.quad([-hx, -hy, base], [hx, -hy, base], [hx, hy, base], [-hx, hy, base], K.wood, [0, 0, 1]);   // 벽 없는 누각: 마루 위만 비치게
  else w.box(-hx + .2, hx - .2, -hy + .2, hy - .2, base, top, open ? K.wood : K.plaster, { top: true });   // 위층은 녹색 판문(검은 빈 면으로 보이던 것 — Codex 2026-10-31)
  for (let i = 0; i <= S.bays[0]; i++) { const x = -hx + 2 * hx * i / S.bays[0]; for (const y of [-hy, hy]) column(w, x, y, base, top) }
  for (let i = 1; i < S.bays[1]; i++) { const y = -hy + 2 * hy * i / S.bays[1]; for (const x of [-hx, hx]) column(w, x, y, base, top) }
  if (!S.hollow && !open) windowPanes(w, S, hx, hy, base, top);
  if (S.doors) {   // 앞(남쪽 = −y) 칸마다 어두운 문짝 자리
    const bay = 2 * hx / S.bays[0], first = S.bays[0] <= 3 || S.doorsAll ? 0 : 1, last = S.bays[0] <= 3 || S.doorsAll ? S.bays[0] - 1 : S.bays[0] - 2;   // doorsAll: 양 끝 칸까지 모두 문(종묘 정전 · 영녕전 감실 칸마다 판문)
    for (let i = first; i <= last; i++) { const cx = -hx + bay * (i + .5); w.quad([cx - bay * .32, -hy - .03, base + .1], [cx + bay * .32, -hy - .03, base + .1], [cx + bay * .32, -hy - .03, top - .35], [cx - bay * .32, -hy - .03, top - .35], S.doorKind ?? K.tunnel, [0, -1, 0]) }
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
  const ix = S.ridgeFrac ? Math.max(.5, outerX * S.ridgeFrac) : Math.max(.5, outerX - outerY);
  if (S.gable) return { hx: outerX, hy: outerY, ix, iy: outerY * (1 - S.gable), z0, rise: rise * S.gable, lift, flare: Math.min(.9, S.eave * .4), steps: S.steps };   // 팔작: 치마(우진각)는 윗면이 납작하게 끝나고 그 위에 맞배가 앉는다
  return { hx: outerX, hy: outerY, ix, iy: 0, z0, rise, lift, flare: Math.min(.9, S.eave * .4), steps: S.steps };
}
// 팔작지붕의 윗부분: 치마 윗면(납작한 사각) 위에 긴 쪽 두 면이 용마루로 올라가고 양 끝에 세운 삼각 벽(합각)이 선다. 치마 끝 모서리의 추녀마루가 합각 아랫 귀로 이어진다
function gableTop(w:MeshWriter, skirt:{ ix:number; iy:number; z0:number; rise:number }, fullRise:number):void {
  const { ix, iy } = skirt, zs = skirt.z0 + skirt.rise, zTop = skirt.z0 + fullRise, over = .55;   // over: 박공 끝이 합각 벽 밖으로 내미는 길이
  for (const side of [-1, 1]) {
    w.quad([-ix - over, side * (iy + over * .5), zs - over * .3], [ix + over, side * (iy + over * .5), zs - over * .3], [ix + over, 0, zTop], [-ix - over, 0, zTop], K.giwa, [0, side * (zTop - zs), iy]);
    for (const end of [-1, 1]) w.tri([end * ix, -iy, zs], [end * ix, iy, zs], [end * ix, 0, zTop], K.plaster, [end, 0, 0]);   // 합각 벽
  }
  w.box(-ix - over - .1, ix + over + .1, -.42, .42, zTop - .12, zTop + .6, K.ridge, { bottom: true });   // 용마루(양성바름)
  for (const end of [-1, 1]) for (const side of [-1, 1]) {   // 박공 끝 마루띠(합각 위 비스듬한 줄)
    const x = end * (ix + over); w.quad([x, side * (iy + over * .5) - .22, zs - over * .3], [x, side * (iy + over * .5) + .22, zs - over * .3], [x, side * .22, zTop + .1], [x, side * -.22, zTop + .1], K.ridge, [end, 0, 0]);
  }
}
export function hall(w:MeshWriter, S:Hall):number {
  podiumOf(w, S);
  const base = S.podium;
  if (S.tiers === 2) {
    const topLow = storey(w, S, S.hx, S.hy, base, S.body), upperHx = S.hx * (S.upper?.[0] ?? .86), upperHy = S.hy * (S.upper?.[1] ?? .8), roofZ = topLow - .25, lowRise = S.rise * .38;
    buildRoof(w, roofOf(S, S.hx + .45, S.hy + .45, roofZ, lowRise, upperHx + .6, upperHy + .6), { innerZ: topLow - .2, innerHx: S.hx + .45, innerHy: S.hy + .45 });
    const upperBase = roofZ + lowRise - .6, top = storey(w, { bays: S.bays, brackets: S.brackets }, upperHx, upperHy, upperBase, S.body * .85, true);
    const upperRoof = roofOf(S, upperHx + .45, upperHy + .45, top - .25, S.upperRise ?? S.rise);
    buildRoof(w, upperRoof, { innerZ: top - .2, innerHx: upperHx + .45, innerHy: upperHy + .45 });
    if (S.gable) gableTop(w, upperRoof, S.upperRise ?? S.rise);
    if (S.ridgeless) roofCap(w, upperRoof.ix, upperRoof.iy, top - .25 + S.rise);
    return top - .25 + (S.upperRise ?? S.rise);
  }
  const top = storey(w, S, S.hx, S.hy, base, S.body);
  if (S.gabled) { matbaeRoof(w, { hx: S.hx + .45, hy: S.hy + .45, eave: S.eave, z0: top - .25, rise: S.rise }); return top - .25 + S.rise }   // 맞배: 양 끝이 수직 박공
  const roof = roofOf(S, S.hx + .45, S.hy + .45, top - .25, S.rise);
  buildRoof(w, roof, { innerZ: top - .2, innerHx: S.hx + .45, innerHy: S.hy + .45 });
  if (S.gable) gableTop(w, roof, S.rise);
  if (S.ridgeless) roofCap(w, roof.ix, roof.iy, top - .25 + S.rise);
  return top - .25 + S.rise;
}
export const clamp = (value:number, min:number, max:number) => Math.max(min, Math.min(max, value));
export const FINE = { side: 12, slope: 4 }, MID = { side: 6, slope: 3 }, ROUGH = { side: 3, slope: 2 };

// ── 나머지 건물: 한옥 틀 ─────────────────────────────────────────────────────────────────────────────────────
// 윤곽에 맞는 돌린 사각형이면 낮은 기단 + 회벽 몸 + 우진각 지붕, 아니면(ㄱ · ㄷ자 …) 윤곽을 그대로 세운 벽과 낮은 한 점 지붕. 칸 수 · 높이는 크기에서 정한 맞춤값
export interface OutlineLook { wall?:number; band?:boolean; height?:number }   // wall: 벽 종류(기본 회벽) · band: 작아도 가장자리 띠 지붕(ㄱ자 집) · height: 벽 높이
// 윤곽을 격자로 훑어 가장 큰 직사각형부터 떼어 낸 날개(ㄱ · ㄷ자 집을 날개별로 세울 때). 최대 3개, 14 m² · 한 변 3 m 미만은 버린다
export function wingsOf(r:Rect):Rect[] {
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
const isConcave = (pts:[number, number][]):boolean => {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!, [cx, cy] = pts[(i + 2) % pts.length]!, cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-6) continue;
    if (sign && Math.sign(cross) !== sign) return true;
    sign = Math.sign(cross);
  }
  return false;
};
export function buildFrameOutline(w:MeshWriter, r:Rect, look:OutlineLook = {}):void {
  const pts = r.pts, cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length, cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length, wall = look.height ?? 3.4, wallKind = look.wall ?? K.plaster;
  let area2 = 0; for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!; area2 += ax * by - bx * ay }
  const ccw = area2 > 0, small = !look.band && Math.abs(area2) / 2 < 600;
  if (small && isConcave(pts)) {   // 오목한 윤곽(ㄷ · ㄱ자): 한 점 지붕은 마당을 덮으니 날개마다 한옥 한 동씩 세운다
    const wings = wingsOf(r);
    if (wings.length) {
      for (const wing of wings) {
        place(w, wing);
        const hx = Math.max(1.2, wing.len / 2 - .6), hy = Math.max(1, wing.wid / 2 - .6);
        hall(w, { hx, hy, podium: .6, body: 3.2, rise: clamp((hy + 1.6) * .55, 1.2, 3.4), eave: clamp(hy * .5, .9, 1.8), bays: [clamp(Math.round(hx * 2 / 3.3), 1, 9), clamp(Math.round(hy * 2 / 3.3), 1, 3)], steps: ROUGH });
      }
      w.xf = null;
      return;
    }
  }   // 작은 윤곽은 한 점 지붕, 큰 윤곽(마당을 두른 행각 · 회랑)은 가장자리를 따라 긴 지붕 띠(가운데 마당은 비운다)
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    w.quad([ax, ay, 0], [bx, by, 0], [bx, by, wall], [ax, ay, wall], wallKind, [dy, -dx, 0]);
    if (small) {
      const e = (x:number, y:number):V3 => [x + (cx - x) * .06, y + (cy - y) * .06, wall + .5];
      w.quad([ax, ay, wall], [bx, by, wall], e(bx, by), e(ax, ay), K.giwa, [dy, -dx, 0]);   // 벽 위 처마 띠(초록 K.fascia 로 두면 초록 가장자리가 보인다)
      w.tri(e(ax, ay), e(bx, by), [cx, cy, wall + 2], K.giwa, [0, 0, 1]);
    } else {
      const inx = (ccw ? -dy : dy) / len, iny = (ccw ? dx : -dx) / len, depth = 2.7, out = .9;   // 안쪽 방향 · 지붕 띠 폭(맞춤) · 처마 내민 길이
      const eave = (x:number, y:number):V3 => [x - inx * out, y - iny * out, wall - .1], ridge = (x:number, y:number):V3 => [x + inx * depth, y + iny * depth, wall + 1.7];
      w.quad(eave(ax, ay), eave(bx, by), ridge(bx, by), ridge(ax, ay), K.giwa, [-inx * .4, -iny * .4, .9]);
      w.quad(eave(ax, ay), eave(bx, by), [bx - inx * out, by - iny * out, wall - .35], [ax - inx * out, ay - iny * out, wall - .35], K.fascia, [-inx, -iny, 0]);
    }
  }
}
// 한옥 틀 건물들: 전용 모델이 있는 이름(dedicated)은 건너뛰고 나머지를 틀로 짓는다. 경복궁 · 창덕궁이 같이 쓴다
export function buildFrames(w:MeshWriter, buildings:{ name:string; p:number[] }[], dedicated:string[], frame:Frame, outline:(w:MeshWriter, r:Rect) => void = buildFrameOutline, remapFor?:(r:Rect) => Record<number, number> | null):void {
  for (const b of buildings.filter(each => !dedicated.includes(each.name) && each.p.length >= 6)) {
    const r = rectOf(b.p, frame);
    if (r.len * r.wid < 10) continue;   // 아주 작은 것(화장실 · 매점 …)은 건너뛴다
    if (r.fill < .78 || r.len * r.wid > 1500) { w.xf = null; outline(w, r); continue }
    place(w, r); w.remap = remapFor?.(r) ?? null;   // 원목 구역은 사각 틀도 붉은 기둥 · 단청 · 녹색 칸막이를 원목으로
    const hx = Math.max(1.2, r.len / 2 - 1), hy = Math.max(1, r.wid / 2 - 1), bay = clamp(Math.round(hx * 2 / 3.3), 1, 9);
    hall(w, { hx, hy, podium: .6, body: 3.2, rise: clamp((hy + 1.6) * .55, 1.2, 3.4), eave: clamp(hy * .5, .9, 1.8), bays: [bay, clamp(Math.round(hy * 2 / 3.3), 1, 3)], steps: ROUGH });
    w.remap = null;
  }
  w.xf = null;
}
