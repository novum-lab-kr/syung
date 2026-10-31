// 궁궐 구역 모델 공용 틀(덕수궁 · 창경궁 · 경희궁 · 운현궁): 구역 파일이 "이름 → 전각 모양" 표와 건물 자료를 넘기면 담장 · 전용 전각 · 나머지 한옥 틀을 짓는다.
// 부품은 창덕궁 · 경복궁과 같은 monuments_hanok.mts 를 쓴다. 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 구역 파일이 이 파일을 import 하고, 이 파일은 본체가 직접 부르지 않는다(구역 파일과 함께 지연 로드).
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { rectOf, place, hall, buildWallLine, buildFrames, buildFrameOutline, clamp, FINE, MID, ROUGH } from './monuments_hanok.mts';
import type { Frame, Rect, Hall } from './monuments_hanok.mts';
import { local } from './monuments_hanok.mts';

// 단청 없는 원목 한옥 재질 바꿔치기: 붉은 기둥 · 단청 · 띠 · 녹색 칸막이 · 처마 끝 · 처마 밑 · 공포를 모두 원목으로
export const TIMBER_REMAP:Record<number, number> = { [K.red]: K.timber, [K.dancheong]: K.timber, [K.band]: K.timber, [K.wood]: K.timber, [K.fascia]: K.timber, [K.soffit]: K.timber, [K.bracket]: K.timber };

export type Builder = (w:MeshWriter, r:Rect) => void;
export interface PalaceBuilding { id:number; name:string; p:number[]; hole?:number[] }
export interface ZoneSpec {
  frame:Frame;
  ring:() => [number, number][];
  buildings:PalaceBuilding[];
  dedicated:Record<string, Builder>;                 // 이름 → 전각 모양(윤곽 사각 안에 짓는다)
  wall?:{ gaps:string[]; skip?:(x:number, y:number) => boolean };   // 둘레 담장(없으면 담장을 짓지 않는다). gaps: 문 모델이 대신 서는 이름
  facing?:Record<string, [number, number]>;          // 이름 → 앞이 향하는 방향(동 · 북 +). 기본은 남쪽 [0, −1]
  timber?:string[];                                  // 단청 없는 원목 한옥(ㄱ자 날개 나눔)
  timberRich?:(r:Rect) => boolean;                   // 윤곽 그대로 세우는 큰 건물이 원목 기둥인가(아니면 붉은 기둥)
  outlineOnly?:string[];                             // 사각 틀로 못 넣고 윤곽 그대로 세울 것
  modern?:Record<string, Builder>;                   // 한옥이 아닌 건물(현대 · 서양식) — 한옥 틀 대신 이 모양
  wingPasses?:number;                                // wings 건물에서 떼어 낼 날개 수(기본 4)
  wings?:Record<string, Builder>;                    // 윤곽이 ㄱ · ㄷ자라 날개마다 따로 짓는 건물(큰 직사각형부터 떼어 낸다)
}

// 앞(−y)이 원하는 쪽을 보게 돌린다. 긴 변이 앞면이 되도록 두 방향 중 가까운 쪽을 고르고, 거의 정사각이면 네 방향 모두 따져 본다
export function faceTo(r:Rect, dir:[number, number] = [0, -1]):Rect {
  const options:Rect[] = [{ ...r }, { ...r, ang: r.ang + Math.PI }];
  if (Math.abs(r.len - r.wid) < Math.max(r.len, r.wid) * .2) options.push({ ...r, ang: r.ang + Math.PI / 2, len: r.wid, wid: r.len }, { ...r, ang: r.ang - Math.PI / 2, len: r.wid, wid: r.len });
  const score = (opt:Rect) => Math.sin(opt.ang) * dir[0] - Math.cos(opt.ang) * dir[1];
  return options.reduce((best, opt) => (score(opt) > score(best) ? opt : best));
}
export const half = (r:Rect, margin:number) => ({ hx: Math.max(1, r.len / 2 - margin), hy: Math.max(1, r.wid / 2 - margin) });

// ── 담장 ───────────────────────────────────────────────────────────────────────────────────────────────────
export function buildZoneWall(w:MeshWriter, spec:ZoneSpec):void {
  if (!spec.wall) return;
  const ring = spec.ring().map(([lng, lat]) => { const [x, y] = local(lng, lat, spec.frame); return [x, y, 0] as V3 });
  ring.push(ring[0]!);
  const gaps = spec.buildings.filter(each => spec.wall!.gaps.includes(each.name)).map(each => {
    const r = rectOf(each.p, spec.frame), xs = r.pts.map(p => p[0]), ys = r.pts.map(p => p[1]);
    return [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...ys) - 2, Math.max(...ys) + 2] as const;
  });
  buildWallLine(w, ring, (x, y) => gaps.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1) || (spec.wall!.skip?.(x, y) ?? false));
}

// ── 정자 · 문 ──────────────────────────────────────────────────────────────────────────────────────────────
// 정자 하나: 네모 기둥 줄 · 낮은 마루 · 열린 몸 · 우진각(또는 모임지붕). roof 로 기와 말고 다른 지붕(초가 …)을 줄 수 있다
export function pavilion(w:MeshWriter, r:Rect, roof?:number):void {
  if (roof !== undefined) w.remap = { [K.giwa]: roof };
  const { hx, hy } = half(r, .35), bayX = clamp(Math.round(hx * 2 / 2.4), 1, 3), bayY = clamp(Math.round(hy * 2 / 2.4), 1, 3);
  hall(w, { hx, hy, podium: .7, body: 2.8, rise: clamp((hy + 1.4) * .6, 1.3, 2.6), eave: 1.4, bays: [bayX, bayY], steps: ROUGH, hollow: true });
  w.remap = null;
}
// 문: 단층 우진각 · 칸 수는 호출하는 쪽이 정한다. 높이 · 처마는 사진 비례 근사
export const gate = (w:MeshWriter, r:Rect, bays:[number, number] = [3, 2]):void => { hall(w, { ...half(r, .8), podium: 1.1, body: 3.4, rise: 3.2, eave: 2.1, bays, steps: MID, brackets: true, doors: true, stair: r.len > 8 }) };
// 정전 · 편전 같은 큰 전각: 윤곽(기단 가장자리)에서 margin 만큼 안쪽에 몸을 세운다
export function mainHall(w:MeshWriter, r:Rect, spec:Partial<Hall> & { bays:[number, number]; margin?:number }):void {
  const { margin = 1.2, ...rest } = spec;
  hall(w, { ...half(r, margin), podium: 1.4, lowPodium: [1.0, .4], body: 4.2, rise: 4.4, eave: 2.8, steps: FINE, brackets: true, doors: true, stair: true, gable: .5, ...rest });
}

// ── 윤곽 그대로 세우는 큰 건물(행각 · 회랑 · 날개집) ────────────────────────────────────────────────────────
// 기본 윤곽 띠(회벽 + 가장자리 지붕 띠)에 돌 밑단 · 기둥 줄 · 창호 · 창방 · 용마루를 더해 옆 전각과 같은 결로 맞춘다. 기둥 간격 · 높이는 사진 비례 근사
export function buildRichOutline(w:MeshWriter, r:Rect, post:number = K.red):void {
  const height = 3.2;
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

// 윤곽을 격자로 훑어 가장 큰 직사각형부터 떼어 낸 날개마다 한옥을 세운다(ㄱ자 · ㄷ자 윤곽은 사각 틀 하나로 못 담는다)
export function wingsOf(r:Rect, passes = 3):Rect[] {
  const STEP = .3, cosA = Math.cos(r.ang), sinA = Math.sin(r.ang), cols = Math.ceil(r.len / STEP), rows = Math.ceil(r.wid / STEP);
  const inside = (x:number, y:number):boolean => { let hit = false; for (let i = 0, j = r.pts.length - 1; i < r.pts.length; j = i++) { const [xi, yi] = r.pts[i]!, [xj, yj] = r.pts[j]!; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit } return hit };
  const grid = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (__, col) => { const u = (col + .5) * STEP - r.len / 2, v = (row + .5) * STEP - r.wid / 2; return inside(r.cx + u * cosA - v * sinA, r.cy + u * sinA + v * cosA) }));
  const out:Rect[] = [];
  for (let pass = 0; pass < passes; pass++) {
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
// 단청 없는 원목 민가 한 동(칸 수를 호출하는 쪽이 정한다 — 모르면 buildTimberHouse 처럼 크기에서 셈). 높이 · 처마 · 칸 폭은 사진 비례 근사
export function timberHall(w:MeshWriter, r:Rect, bays:[number, number], margin = .5):void {
  w.remap = TIMBER_REMAP;
  const { hx, hy } = half(r, margin);
  hall(w, { hx, hy, podium: .8, lowPodium: [.7], body: 3.2, rise: 3.0, eave: 2.0, bays, steps: FINE, doors: true, stair: r.len > 8, gable: .45 });
  w.remap = null;
}
// 단청 없는 원목 한옥: 기둥 · 창방 · 문틀을 K.timber 로, 벽은 회벽. 높이 · 처마 · 칸 폭은 사진 비례 근사
export function buildTimberHouse(w:MeshWriter, outline:Rect, face:[number, number] = [0, -1], passes = 3):void {
  for (const wing of wingsOf(outline, passes)) {
    const r = faceTo(wing, face); place(w, r);
    w.remap = TIMBER_REMAP;
    const { hx, hy } = half(r, .5);
    hall(w, { hx, hy, podium: .8, lowPodium: [.7], body: 3.2, rise: 3.0, eave: 2.0, bays: [clamp(Math.round(hx * 2 / 3.0), 1, 6), clamp(Math.round(hy * 2 / 3.0), 1, 2)], steps: FINE, doors: true, stair: r.len > 8, gable: .45 });
    w.remap = null; w.xf = null;
  }
}

// ── 구역 짓기 ─────────────────────────────────────────────────────────────────────────────────────────────
const real = (list:PalaceBuilding[]) => list.filter(each => each.p.length >= 6);
export function buildZoneHalls(w:MeshWriter, spec:ZoneSpec):void {
  const timber = spec.timber ?? [];
  for (const each of real(spec.buildings).filter(item => timber.includes(item.name))) buildTimberHouse(w, rectOf(each.p, spec.frame), spec.facing?.[each.name]);
  const modern = spec.modern ?? {};
  for (const each of real(spec.buildings).filter(item => spec.dedicated[item.name] || modern[item.name])) {
    const r = faceTo(rectOf(each.p, spec.frame), spec.facing?.[each.name]); place(w, r);
    (spec.dedicated[each.name] ?? modern[each.name]!)(w, r); w.xf = null;
  }
  for (const each of real(spec.buildings).filter(item => spec.wings?.[item.name])) {
    for (const wing of wingsOf(rectOf(each.p, spec.frame), spec.wingPasses ?? 4)) { const r = faceTo(wing, spec.facing?.[each.name]); place(w, r); spec.wings![each.name]!(w, r); w.xf = null }
  }
}
export function buildZoneFrames(w:MeshWriter, spec:ZoneSpec):void {
  const outlineOnly = spec.outlineOnly ?? [], named = [...Object.keys(spec.dedicated), ...Object.keys(spec.modern ?? {}), ...Object.keys(spec.wings ?? {}), ...(spec.timber ?? [])];
  const rich = (ww:MeshWriter, r:Rect) => buildRichOutline(ww, r, spec.timberRich?.(r) ? K.timber : K.red);
  buildFrames(w, spec.buildings.filter(each => !outlineOnly.includes(each.name)), named, spec.frame, rich, spec.timberRich ? (r:Rect) => (spec.timberRich!(r) ? TIMBER_REMAP : null) : undefined);
  for (const each of real(spec.buildings).filter(item => outlineOnly.includes(item.name))) { w.xf = null; rich(w, rectOf(each.p, spec.frame)) }
}
export function buildZone(spec:ZoneSpec, id:string, suffix:{ wall:string; halls:string; frames:string }):Float32Array {
  const w = new MeshWriter();
  if (id === suffix.wall) buildZoneWall(w, spec);
  else if (id === suffix.halls) buildZoneHalls(w, spec);
  else if (id === suffix.frames) buildZoneFrames(w, spec);
  return new Float32Array(w.data);
}
