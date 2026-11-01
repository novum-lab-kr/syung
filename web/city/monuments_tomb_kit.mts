// 왕릉 · 토성 · 고분군 구역이 같이 쓰는 부품: 윤곽 위에 세우는 판(귀 자르기) · 봉분(호석 + 흙 언덕) · 석물 · 정자각 · 비각 · 곡장.
// 구역 파일(monuments_seonjeong.mts …)이 이 파일과 자기 자료만 import 한다. 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 출처로 확인한 것(위키백과 ko 조선 왕릉 · 선릉 · 정릉 · 의릉 · 헌릉 · 인릉 · 태릉 · 강릉): 왕릉은 봉분(둥근 흙 언덕) 둘레에 호석(둘레돌)을 두르고 뒤와 옆을 곡장(낮은 담)이 감싸며,
// 봉분 앞에 상석 · 망주석 · 장명등 · 문인석을 세우고 더 아래에 제를 올리는 정자각(丁자 평면 맞배집)이 있다. 정자각 옆에 비각(비를 덮은 작은 집) · 수복방이 선다.
// 근사(출처 못 찾음 · 값마다 "근사"): 봉분 높이 · 호석 높이 · 곡장 높이 · 상석 · 망주석 · 장명등 · 문인석 크기와 자리 · 정자각 높이 · 지붕 높이 · 봉분이 보는 방향(가장 가까운 정자각 쪽으로 읽었다 — 자료에 방향 없음) · 둔덕 높이.
// 못 그린 것: 병풍석 무늬 · 난간석 · 석양 · 석호 · 무인석 · 석마 · 홍살문 · 참도 · 단청 · 문 살.
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { frameOf, local, rectOf, place, hall, wingsOf, buildFrames, clamp, MID, ROUGH } from './monuments_hanok.mts';
import type { Frame, Rect } from './monuments_hanok.mts';
import { loft } from './monument_curves.mts';

export type P2 = [number, number];
export interface NamedShape { id:number; name:string; p:number[] }
export const pointsOf = (flat:number[], origin:P2, frame:Frame):P2[] => { const out:P2[] = []; for (let i = 0; i < flat.length; i += 2) out.push(local(origin[0] + flat[i]! / 1e6, origin[1] + flat[i + 1]! / 1e6, frame)); return out };
export const centroidOf = (pts:P2[]):P2 => [pts.reduce((sum, p) => sum + p[0], 0) / pts.length, pts.reduce((sum, p) => sum + p[1], 0) / pts.length];
const signedArea = (pts:P2[]):number => { let sum = 0; for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!; sum += ax * by - bx * ay } return sum / 2 };
export const insidePoly = (x:number, y:number, poly:P2[]):boolean => { let hit = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit } return hit };

// 귀 자르기(오목한 윤곽도 된다). 겹치거나 꼬인 윤곽은 자를 수 있는 데까지만 자르고 남은 부분은 버린다
export function earClip(pts:P2[]):[number, number, number][] {
  const order = pts.map((_, index) => index); if (signedArea(pts) < 0) order.reverse();
  const out:[number, number, number][] = [];
  let guard = 0;
  while (order.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let i = 0; i < order.length && !cut; i++) {
      const a = order[(i + order.length - 1) % order.length]!, b = order[i]!, c = order[(i + 1) % order.length]!;
      const [ax, ay] = pts[a]!, [bx, by] = pts[b]!, [cx, cy] = pts[c]!;
      if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) <= 1e-9) continue;
      const blocked = order.some(other => {
        if (other === a || other === b || other === c) return false;
        const [px, py] = pts[other]!, d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax), d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx), d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
        return d1 >= 0 && d2 >= 0 && d3 >= 0;
      });
      if (blocked) continue;
      out.push([a, b, c]); order.splice(i, 1); cut = true;
    }
    if (!cut) return out;
  }
  if (order.length === 3) out.push([order[0]!, order[1]!, order[2]!]);
  return out;
}
export function fillPoly(w:MeshWriter, pts:P2[], z:number, kind:number):void {
  for (const [a, b, c] of earClip(pts)) w.tri([pts[a]![0], pts[a]![1], z], [pts[b]![0], pts[b]![1], z], [pts[c]![0], pts[c]![1], z], kind, [0, 0, 1]);
}
// 윤곽 위에 세운 판: 옆면 + 윗면
export function slab(w:MeshWriter, pts:P2[], z0:number, z1:number, side:number, top:number):void {
  const ccw = signedArea(pts) > 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!, dx = bx - ax, dy = by - ay;
    w.quad([ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1], side, ccw ? [dy, -dx, 0] : [-dy, dx, 0]);
  }
  fillPoly(w, pts, z1, top);
}
// 비탈진 둔덕: 아래 윤곽에서 안쪽으로 줄여 올린 윗면(풀)
export function terrace(w:MeshWriter, pts:P2[], height:number):void {
  const [cx, cy] = centroidOf(pts), meanR = pts.reduce((sum, p) => sum + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length, f = Math.max(.7, 1 - 3 / meanR);
  const top = pts.map(([x, y]):P2 => [cx + (x - cx) * f, cy + (y - cy) * f]), ccw = signedArea(pts) > 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length, [ax, ay] = pts[i]!, [bx, by] = pts[j]!, dx = bx - ax, dy = by - ay, [tax, tay] = top[i]!, [tbx, tby] = top[j]!;
    w.quad([ax, ay, 0], [bx, by, 0], [tbx, tby, height], [tax, tay, height], K.grass, ccw ? [dy, -dx, .6] : [-dy, dx, .6]);
  }
  fillPoly(w, top, height, K.grass);
}

// ── 큰 언덕(잔디) ───────────────────────────────────────────────────────────────────────────────────────────
// 왕릉은 산줄기 비탈(언덕) 위에 앉는다 — 봉분 뒤로 오르는 큰 언덕만 매끈한 잔디 면으로 깐다(정밀 복원 아님).
export interface Hill { x:number; y:number; r:number; h:number }
export interface Pad { x:number; y:number; z:number; flat:number; fade:number }   // 봉분이 앉는 평평한 자리: flat 안은 높이 z, fade 까지 언덕으로 이어진다
const smooth = (t:number):number => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c) };
export function groundOf(hills:Hill[], pads:Pad[], clearPolys:P2[][], clearPoints:P2[]):(x:number, y:number) => number {
  const top = Math.max(0, ...hills.map(hill => hill.h));
  const edges = clearPolys.map(poly => poly.map((p, i):[P2, P2] => [p, poly[(i + 1) % poly.length]!]));
  const clearOf = (x:number, y:number):number => {
    let best = Infinity;
    for (let n = 0; n < clearPolys.length; n++) {
      if (insidePoly(x, y, clearPolys[n]!)) return 0;
      for (const [a, b] of edges[n]!) { const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy, t = len ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / len, 0, 1) : 0; best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)) }
    }
    for (const p of clearPoints) best = Math.min(best, Math.hypot(x - p[0], y - p[1]) + 3);   // 횃불은 3 m 더 비운다(횃불은 땅 높이를 모른다)
    return smooth((best - 5) / 11);
  };
  return (x, y) => {
    let sum = 0; for (const hill of hills) { const t = Math.hypot(x - hill.x, y - hill.y) / hill.r; if (t < 1) sum += hill.h * (1 - t * t) ** 2 }
    let z = Math.min(sum, top) * clearOf(x, y);
    for (const pad of pads) { const weight = 1 - smooth((Math.hypot(x - pad.x, y - pad.y) - pad.flat) / (pad.fade - pad.flat)); z = z * (1 - weight) + pad.z * weight }
    return z;
  };
}
// 높이장을 잔디 격자 면으로(셀 한 칸 STEP m(기본 3) · 네 모서리 모두 거의 0 이면 건너뛴다). 법선은 높이 차로
export function lawn(w:MeshWriter, hills:Hill[], ground:(x:number, y:number) => number, STEP = 3):void {
  if (!hills.length) return;
  const minX = Math.min(...hills.map(hill => hill.x - hill.r)), maxX = Math.max(...hills.map(hill => hill.x + hill.r));
  const minY = Math.min(...hills.map(hill => hill.y - hill.r)), maxY = Math.max(...hills.map(hill => hill.y + hill.r));
  const cols = Math.ceil((maxX - minX) / STEP) + 1, rows = Math.ceil((maxY - minY) / STEP) + 1, z = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) z[row * cols + col] = ground(minX + col * STEP, minY + row * STEP);
  const at = (col:number, row:number):V3 => { const value = z[row * cols + col]!; return [minX + col * STEP, minY + row * STEP, value + .03] };
  const normal = (col:number, row:number):V3 => {
    const left = z[row * cols + Math.max(0, col - 1)]!, right = z[row * cols + Math.min(cols - 1, col + 1)]!, down = z[Math.max(0, row - 1) * cols + col]!, up = z[Math.min(rows - 1, row + 1) * cols + col]!;
    const nx = (left - right) / (2 * STEP), ny = (down - up) / (2 * STEP), len = Math.hypot(nx, ny, 1);
    return [nx / len, ny / len, 1 / len];
  };
  for (let row = 0; row + 1 < rows; row++) for (let col = 0; col + 1 < cols; col++) {
    const corners = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]] as const;
    if (Math.max(...corners.map(([c, r]) => z[r * cols + c]!)) < .01) continue;
    const [a, b, c, d] = corners.map(([cc, rr]) => ({ p: at(cc, rr), n: normal(cc, rr) }));
    w.triN(a!.p, b!.p, c!.p, a!.n, b!.n, c!.n, K.grass); w.triN(a!.p, c!.p, d!.p, a!.n, c!.n, d!.n, K.grass);
  }
}

// ── 곡장(낮은 담): 회벽 몸 + 기와 갓 ────────────────────────────────────────────────────────────────────────
export function lowWall(w:MeshWriter, line:P2[], height = 1.5, half = .3):void {
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!, len = Math.hypot(bx - ax, by - ay);
    if (len < .05) continue;
    const nx = -(by - ay) / len, ny = (bx - ax) / len, cap = half + .12;
    for (const sign of [-1, 1]) w.quad([ax + nx * half * sign, ay + ny * half * sign, 0], [bx + nx * half * sign, by + ny * half * sign, 0], [bx + nx * half * sign, by + ny * half * sign, height], [ax + nx * half * sign, ay + ny * half * sign, height], K.plaster, [nx * sign, ny * sign, 0]);
    for (const sign of [-1, 1]) w.quad([ax + nx * cap * sign, ay + ny * cap * sign, height], [bx + nx * cap * sign, by + ny * cap * sign, height], [bx, by, height + .32], [ax, ay, height + .32], K.giwa, [nx * sign * .5, ny * sign * .5, 1]);
  }
}

// 윤곽을 따라 놓은 낮은 돌 둘레(돌 판 폭 0.3 m · 높이 0.3 m — 근사)
export function lowStone(w:MeshWriter, ring:P2[]):void {
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!, [bx, by] = ring[(i + 1) % ring.length]!, len = Math.hypot(bx - ax, by - ay);
    if (len < .05) continue;
    const nx = -(by - ay) / len, ny = (bx - ax) / len, half = .15;
    for (const sign of [-1, 1]) w.quad([ax + nx * half * sign, ay + ny * half * sign, 0], [bx + nx * half * sign, by + ny * half * sign, 0], [bx + nx * half * sign, by + ny * half * sign, .3], [ax + nx * half * sign, ay + ny * half * sign, .3], K.stone, [nx * sign, ny * sign, 0]);
    w.quad([ax - nx * half, ay - ny * half, .3], [bx - nx * half, by - ny * half, .3], [bx + nx * half, by + ny * half, .3], [ax + nx * half, ay + ny * half, .3], K.stone, [0, 0, 1]);
  }
}

// ── 봉분 ─────────────────────────────────────────────────────────────────────────────────────────────────
// 호석(둘레돌 원통) + 매끈한 흙 언덕 + 앞쪽 석물. facing: 봉분이 보는 단위 방향(동 · 북)
export function royalTomb(w:MeshWriter, outline:P2[], facing:P2):void {
  const [cx, cy] = centroidOf(outline), radius = clamp(outline.reduce((sum, p) => sum + Math.hypot(p[0] - cx, p[1] - cy), 0) / outline.length, 3, 9);
  const ringH = 1.0, domeH = clamp(radius * .45, 2.2, 3.4);
  w.prism(cx, cy, radius, 0, ringH, K.granite, 22);   // 호석
  loft(w, 6, 22, (v, u):V3 => { const angle = Math.PI * 2 * u, t = v * Math.PI / 2; return [cx + Math.cos(angle) * radius * .94 * Math.cos(t), cy + Math.sin(angle) * radius * .94 * Math.cos(t), ringH - .1 + domeH * Math.sin(t)] }, K.grass);
  const angle = Math.atan2(facing[1], facing[0]);
  w.xf = { x: cx, y: cy, cos: Math.cos(angle), sin: Math.sin(angle) };   // 모델 x = 보는 쪽
  w.box(radius + 1.0, radius + 2.2, -1.25, 1.25, 0, .85, K.stone);   // 상석
  for (const side of [-1, 1]) {
    w.frustum(radius + .7, side * 2.6, .32, .32, 0, .2, .2, 2.0, K.stone, { bottom: true });   // 망주석
    w.frustum(radius + 6.5, side * 3.4, .42, .42, 0, .3, .3, 2.6, K.stone, { bottom: true });   // 문인석
  }
  w.box(radius + 3.6, radius + 4.3, -.35, .35, 0, .7, K.stone);   // 장명등 받침
  w.frustum(radius + 3.95, 0, .3, .3, .7, .22, .22, 2.0, K.stone, { bottom: true });   // 장명등 몸
  w.xf = null;
}

// ── 정자각 · 비각 ────────────────────────────────────────────────────────────────────────────────────────
// 정자각: 丁자 평면 — 윤곽을 날개별 직사각형으로 떼어(wingsOf) 맞배집 한 동씩 세운다
export function jeongjagak(w:MeshWriter, r:Rect):void {
  const wings = r.fill < .88 ? wingsOf(r) : [], parts = wings.length ? wings : [r];
  for (const wing of parts) {
    place(w, wing);
    const hx = Math.max(1.5, wing.len / 2 - .5), hy = Math.max(1.2, wing.wid / 2 - .5);
    hall(w, { hx, hy, podium: .9, lowPodium: [.6], body: 3.3, rise: 2.6, eave: 1.6, bays: [clamp(Math.round(hx * 2 / 3.6), 1, 5), clamp(Math.round(hy * 2 / 3.6), 1, 3)], steps: MID, gabled: true, doors: true });
  }
  w.xf = null;
}
// 비각 · 신도비각: 비를 덮은 작은 우진각 집(비는 안이라 생략)
export function bigak(w:MeshWriter, r:Rect):void {
  place(w, r);
  const hx = Math.max(1.2, r.len / 2 - .6), hy = Math.max(1, r.wid / 2 - .6);
  hall(w, { hx, hy, podium: .5, body: 2.7, rise: clamp((hy + 1.4) * .6, 1.2, 2.6), eave: clamp(hy * .6, .8, 1.5), bays: [clamp(Math.round(hx * 2 / 3), 1, 3), 1], steps: ROUGH });
  w.xf = null;
}
// 새 건물(관리소 · 전시관 …)이 숨김 둘레에 들어 사라지지 않게: 무늬 없는 상자(회벽 · 평지붕)
const MODERN = /관리|전시|안내|박물관|매표|역사문화관|강당|화장실|매점/;
export function plainBlock(w:MeshWriter, r:Rect):void { slab(w, r.pts, 0, 3.4, K.plaster, K.slate) }

// ── 구역 하나(왕릉) ─────────────────────────────────────────────────────────────────────────────────────
export interface TombZoneData { at:P2; origin:P2; buildings:NamedShape[]; tombs:NamedShape[]; walls:number[][]; banks:number[][]; torches?:number[]; levels?:Record<number, number> }
const isShrine = (name:string) => /정자각/.test(name), isStele = (name:string) => /비각|신도비/.test(name);
const TERRACE_H = .7;   // 둔덕 높이(근사)
const TOMB_LEVEL = 3;   // 봉분 자리 높이(근사 — 의릉처럼 위 · 아래 능침은 levels 로 따로)
export function tombZone(data:TombZoneData) {
  const frame = frameOf(data.at, data.origin), banks = data.banks.map(flat => pointsOf(flat, data.origin, frame));
  const shrines = data.buildings.filter(each => isShrine(each.name)).map(each => centroidOf(pointsOf(each.p, data.origin, frame)));
  const others = data.buildings.map(each => centroidOf(pointsOf(each.p, data.origin, frame)));
  const bankAt = (x:number, y:number) => banks.some(bank => insidePoly(x, y, bank));
  const facingOf = (cx:number, cy:number):P2 => {
    const pool = shrines.length ? shrines : others;
    let best:P2 | null = null, bestDist = Infinity;
    for (const p of pool) { const d = Math.hypot(p[0] - cx, p[1] - cy); if (d < bestDist) { bestDist = d; best = p } }
    if (!best || bestDist < 1) return [0, -1];   // 정자각이 없으면 남쪽(근사)
    return [(best[0] - cx) / bestDist, (best[1] - cy) / bestDist];
  };
  // 큰 언덕: 봉분마다 보는 쪽(정자각)의 반대로 오르는 언덕 둘(앞 언덕 + 뒤 능선)과 평평한 자리. 모양은 근사
  const hills:Hill[] = [], pads:Pad[] = [];
  const tombAt = data.tombs.map(tomb => { const outline = pointsOf(tomb.p, data.origin, frame), [cx, cy] = centroidOf(outline); return { id: tomb.id, cx, cy, level: data.levels?.[tomb.id] ?? TOMB_LEVEL, face: facingOf(cx, cy) } });
  for (const { cx, cy, level, face } of tombAt) {
    const reach = 22 + level * 1.7, peak = level * 1.6;
    hills.push({ x: cx - face[0] * reach * .45, y: cy - face[1] * reach * .45, r: reach, h: peak }, { x: cx - face[0] * reach * .95, y: cy - face[1] * reach * .95, r: reach * .8, h: peak * .8 });
    pads.push({ x: cx, y: cy, z: level, flat: 14, fade: 22 });
  }
  const torchAt:P2[] = []; for (let i = 0; i + 1 < (data.torches?.length ?? 0); i += 2) torchAt.push([data.torches![i]! / 10, -data.torches![i + 1]! / 10]);
  const ground = groundOf(hills, pads, data.buildings.map(each => pointsOf(each.p, data.origin, frame)).filter(poly => poly.length >= 3), torchAt);
  const levelAt = (x:number, y:number):number => { const near = pads.find(pad => Math.hypot(x - pad.x, y - pad.y) < pad.fade); return near ? near.z : ground(x, y) };
  return {
    wall(w:MeshWriter):void {
      lawn(w, hills, ground);
      for (const bank of banks) if (ground(...centroidOf(bank)) < TERRACE_H) terrace(w, bank, TERRACE_H);
      for (const flat of data.walls) {
        const line = pointsOf(flat, data.origin, frame), [mx, my] = centroidOf(line);
        w.dz = levelAt(mx, my) + (bankAt(mx, my) && ground(mx, my) < TERRACE_H ? TERRACE_H : 0); lowWall(w, line); w.dz = 0;
      }
    },
    halls(w:MeshWriter):void {
      for (const tomb of data.tombs) {
        const outline = pointsOf(tomb.p, data.origin, frame), [cx, cy] = centroidOf(outline);
        w.dz = levelAt(cx, cy) + (bankAt(cx, cy) && ground(cx, cy) < TERRACE_H ? TERRACE_H : 0); royalTomb(w, outline, facingOf(cx, cy)); w.dz = 0;
      }
      for (const each of data.buildings) {
        if (each.p.length < 6) continue;
        const r = rectOf(each.p, frame);
        if (isShrine(each.name)) jeongjagak(w, r);
        else if (isStele(each.name)) bigak(w, r);
      }
    },
    frames(w:MeshWriter):void {
      const rest = data.buildings.filter(each => !isShrine(each.name) && !isStele(each.name));
      buildFrames(w, rest.filter(each => !MODERN.test(each.name)), [], frame);
      for (const each of rest.filter(item => MODERN.test(item.name) && item.p.length >= 6)) plainBlock(w, rectOf(each.p, frame));
    },
  };
}
export function buildBySuffix(id:string, parts:{ wall:(w:MeshWriter) => void; halls:(w:MeshWriter) => void; frames:(w:MeshWriter) => void }):Float32Array {
  const w = new MeshWriter();
  if (id.endsWith('-wall')) parts.wall(w); else if (id.endsWith('-halls')) parts.halls(w); else if (id.endsWith('-frames')) parts.frames(w);
  return new Float32Array(w.data);
}
