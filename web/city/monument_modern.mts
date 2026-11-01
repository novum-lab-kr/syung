// 근대 건물 · 사찰 구역 공용 부품(명동성당 · 문화역서울 284 · 서대문형무소 · 조계사 · 봉은사 · 탑골공원): 윤곽(OSM)을 그대로 세우는 다각형 압출 · 창 줄 · 첨탑 · 돔 · 담.
// 한옥 부품(monuments_hanok.mts)과 서양식 부품(monuments_western_modern.mts)은 그대로 쓰고, 여기는 윤곽이 사각이 아닌 건물을 위한 것만 둔다.
// 구역 자료(건물 · 기준점)를 import 하지 않는다 — 부르는 쪽이 윤곽 · 기준점을 넘긴다. 모드 · 테마 입력 없음(실물 색 하나).
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { rectOf } from './monuments_hanok.mts';
import type { Frame, Rect } from './monuments_hanok.mts';

export type P2 = [number, number];
export const ptsOf = (flat:number[], frame:Frame):P2[] => rectOf(flat, frame).pts;
const signedArea = (pts:P2[]):number => { let sum = 0; for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!; sum += ax * by - bx * ay } return sum / 2 };
// 닫힘 점(처음과 같은 마지막 점)과 겹친 점을 걷어내고 반시계 방향으로 맞춘다
export function ccw(pts:P2[]):P2[] {
  const out = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]!; return Math.hypot(p[0] - q[0], p[1] - q[1]) > .05 });
  return signedArea(out) < 0 ? out.reverse() : out;
}
export const centroid = (pts:P2[]):P2 => [pts.reduce((sum, p) => sum + p[0], 0) / pts.length, pts.reduce((sum, p) => sum + p[1], 0) / pts.length];
export const faceSouth = (r:Rect):Rect => (Math.cos(r.ang) < 0 ? { ...r, ang: r.ang + Math.PI } : r);   // 한옥 정면(−y)이 남쪽을 보게(사찰 · 전각은 남향 — 근사)

// ── 귀 자르기(오목한 윤곽의 윗면 덮개) ───────────────────────────────────────────────────────────────────────────
export function triangulate(pts:P2[]):[number, number, number][] {
  const out:[number, number, number][] = [], idx = pts.map((_, i) => i);
  const cross = (a:P2, b:P2, c:P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = 0;
  while (idx.length > 3 && guard++ < pts.length * pts.length) {
    let clipped = false;
    for (let i = 0; i < idx.length && !clipped; i++) {
      const a = idx[(i + idx.length - 1) % idx.length]!, b = idx[i]!, c = idx[(i + 1) % idx.length]!;
      if (cross(pts[a]!, pts[b]!, pts[c]!) <= 1e-9) continue;   // 안으로 꺾인 점(귀가 아님)
      const blocked = idx.some(k => k !== a && k !== b && k !== c && cross(pts[a]!, pts[b]!, pts[k]!) >= -1e-9 && cross(pts[b]!, pts[c]!, pts[k]!) >= -1e-9 && cross(pts[c]!, pts[a]!, pts[k]!) >= -1e-9);
      if (blocked) continue;
      out.push([a, b, c]); idx.splice(i, 1); clipped = true;
    }
    if (!clipped) break;
  }
  for (let i = 1; i + 1 < idx.length; i++) out.push([idx[0]!, idx[i]!, idx[i + 1]!]);   // 남은 셋(또는 막힌 나머지는 부채꼴)
  return out;
}
export function capPolygon(w:MeshWriter, pts:P2[], z:number, kind:number, up = true):void {
  for (const [a, b, c] of triangulate(pts)) w.tri([pts[a]![0], pts[a]![1], z], [pts[b]![0], pts[b]![1], z], [pts[c]![0], pts[c]![1], z], kind, [0, 0, up ? 1 : -1]);
}
// 윤곽을 세운 벽(반시계 윤곽 — 바깥이 오른쪽). s = 둘레를 따라 잰 미터(벽돌 줄 · 이음)
export function extrude(w:MeshWriter, pts:P2[], z0:number, z1:number, kind:number):void {
  let travelled = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!, len = Math.hypot(bx - ax, by - ay);
    if (len < .05) continue;
    w.quad([ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1], kind, [by - ay, -(bx - ax), 0], travelled, travelled + len, travelled + len, travelled);
    travelled += len;
  }
}
export function prismPoly(w:MeshWriter, pts:P2[], z0:number, z1:number, wall:number, cap:number):void { extrude(w, pts, z0, z1, wall); capPolygon(w, pts, z1, cap) }
// 윤곽을 바깥으로 d 만큼(안쪽이면 음수) 민 윤곽(꼭짓점마다 이웃 두 변의 평균 법선 — 처마 · 돌림띠용 근사)
export function offsetPoly(pts:P2[], d:number):P2[] {
  return pts.map((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length]!, c = pts[(i + 1) % pts.length]!;
    const n1:P2 = (() => { const l = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1; return [(p[1] - a[1]) / l, -(p[0] - a[0]) / l] })();
    const n2:P2 = (() => { const l = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1; return [(c[1] - p[1]) / l, -(c[0] - p[0]) / l] })();
    const bx = n1[0] + n2[0], by = n1[1] + n2[1], bl = Math.hypot(bx, by) || 1, k = d / Math.max(.35, (bx * n1[0] + by * n1[1]) / bl);
    return [p[0] + bx / bl * k, p[1] + by / bl * k];
  });
}

// ── 창 줄 · 벽기둥 ─────────────────────────────────────────────────────────────────────────────────────────────
export interface WindowSpec { bay:number; width:number; z0:number; z1:number; arch:'flat' | 'round' | 'pointed'; pane:number; frame?:number; minEdge?:number; skip?:(x:number, y:number) => boolean }
// 변마다 창을 일정한 간격으로(변 길이를 칸으로 나눠 가운데). 위가 둥근 · 뾰족한 창은 틀 위에 유리 한 겹 + 가운데 문설주 하나
export function edgeWindows(w:MeshWriter, pts:P2[], spec:WindowSpec):void {
  const frameKind = spec.frame ?? K.trim;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!, len = Math.hypot(bx - ax, by - ay);
    if (len < (spec.minEdge ?? spec.bay * .9)) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len, nx = uy, ny = -ux, count = Math.max(1, Math.floor(len / spec.bay)), step = len / count;
    const nrm:V3 = [nx, ny, 0];
    for (let k = 0; k < count; k++) {
      const along = step * (k + .5), cx = ax + ux * along, cy = ay + uy * along;
      if (spec.skip?.(cx, cy)) continue;
      const half = Math.min(spec.width / 2, step * .36), pt = (u:number, z:number, off:number):V3 => [cx + ux * u + nx * off, cy + uy * u + ny * off, z];
      const draw = (hw:number, bottom:number, top:number, off:number, kind:number):void => {
        if (spec.arch === 'flat') { w.quad(pt(-hw, bottom, off), pt(hw, bottom, off), pt(hw, top, off), pt(-hw, top, off), kind, nrm); return }
        const spring = top - (spec.arch === 'round' ? hw : hw * 1.7);
        w.quad(pt(-hw, bottom, off), pt(hw, bottom, off), pt(hw, spring, off), pt(-hw, spring, off), kind, nrm);
        if (spec.arch === 'pointed') { w.tri(pt(-hw, spring, off), pt(hw, spring, off), pt(0, top, off), kind, nrm); return }
        for (let seg = 0; seg < 6; seg++) {
          const a0 = Math.PI * seg / 6, a1 = Math.PI * (seg + 1) / 6;
          w.tri(pt(0, spring, off), pt(hw * Math.cos(a0), spring + hw * Math.sin(a0), off), pt(hw * Math.cos(a1), spring + hw * Math.sin(a1), off), kind, nrm);
        }
      };
      draw(half, spec.z0, spec.z1, .05, frameKind);
      draw(half - .14, spec.z0 + .14, spec.z1 - .12, .08, spec.pane);
      w.quad(pt(-.04, spec.z0 + .14, .11), pt(.04, spec.z0 + .14, .11), pt(.04, spec.z1 - (spec.arch === 'flat' ? .2 : half * 1.3), .11), pt(-.04, spec.z1 - (spec.arch === 'flat' ? .2 : half * 1.3), .11), frameKind, nrm);
    }
  }
}
// 벽기둥(버팀벽): 긴 변에 일정한 간격으로 얕게 내민 기둥 — z0…z1, 폭 width, 내민 길이 out
export function pilasters(w:MeshWriter, pts:P2[], z0:number, z1:number, kind:number, opts:{ every:number; width:number; out:number; minEdge?:number; skip?:(x:number, y:number) => boolean }):void {
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!, len = Math.hypot(bx - ax, by - ay);
    if (len < (opts.minEdge ?? opts.every * 1.3)) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len, nx = uy, ny = -ux, count = Math.max(2, Math.round(len / opts.every));
    for (let k = 0; k <= count; k++) {
      const along = Math.min(len - opts.width / 2, Math.max(opts.width / 2, len * k / count)), cx = ax + ux * along, cy = ay + uy * along;
      if (opts.skip?.(cx, cy)) continue;
      const corner = (u:number, o:number, z:number):V3 => [cx + ux * u + nx * o, cy + uy * u + ny * o, z], half = opts.width / 2;
      w.quad(corner(-half, opts.out, z0), corner(half, opts.out, z0), corner(half, opts.out, z1), corner(-half, opts.out, z1), kind, [nx, ny, 0]);
      w.quad(corner(-half, 0, z0), corner(-half, opts.out, z0), corner(-half, opts.out, z1), corner(-half, 0, z1), kind, [-ux, -uy, 0]);
      w.quad(corner(half, opts.out, z0), corner(half, 0, z0), corner(half, 0, z1), corner(half, opts.out, z1), kind, [ux, uy, 0]);
      w.quad(corner(-half, opts.out, z1), corner(half, opts.out, z1), corner(half, 0, z1 + .2), corner(-half, 0, z1 + .2), kind, [nx * .5, ny * .5, 1]);   // 윗면 비스듬히
    }
  }
}
// 둘레 돌림띠: 윤곽을 d 만큼 밀어 z0…z1 사이를 한 바퀴(흰 돌 띠 · 처마 돌림띠)
export function belt(w:MeshWriter, pts:P2[], z0:number, z1:number, kind:number, d = .12):void { const out = offsetPoly(pts, d); extrude(w, out, z0, z1, kind); capPolygon(w, out, z1, kind) }

// ── 지붕 · 첨탑 · 돔 ──────────────────────────────────────────────────────────────────────────────────────────
// 맞배(박공) 지붕: 용마루가 x 방향. 처마 eave 만큼 바깥으로, 양 끝에 삼각 벽(gable)
export function gableRoof(w:MeshWriter, hx:number, hy:number, z0:number, rise:number, eave:number, roof:number, gable:number):void {
  const top = z0 + rise;
  w.quad([-hx - eave, -hy - eave, z0], [hx + eave, -hy - eave, z0], [hx + eave, 0, top], [-hx - eave, 0, top], roof, [0, -rise, hy + eave], 0, hx * 2, hx * 2, 0);
  w.quad([hx + eave, hy + eave, z0], [-hx - eave, hy + eave, z0], [-hx - eave, 0, top], [hx + eave, 0, top], roof, [0, rise, hy + eave], 0, hx * 2, hx * 2, 0);
  w.tri([-hx - eave * .2, -hy, z0], [-hx - eave * .2, hy, z0], [-hx - eave * .2, 0, top - rise * .08], gable, [-1, 0, 0]);
  w.tri([hx + eave * .2, hy, z0], [hx + eave * .2, -hy, z0], [hx + eave * .2, 0, top - rise * .08], gable, [1, 0, 0]);
}
// 돌려 깎은 모양(첨탑 · 돔 · 원뿔 지붕): 단면 점(반지름, 높이)을 아래에서 위로 — 옆 n 각. smooth 면 정점 법선을 단면 기울기에서 만들어 매끈하게
export function revolve(w:MeshWriter, cx:number, cy:number, profile:[number, number][], kind:number, sides = 16, turn = 0, smooth = false):void {
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, z0] = profile[i]!, [r1, z1] = profile[i + 1]!, dr = r1 - r0, dz = z1 - z0, norm = Math.hypot(dr, dz) || 1;
    for (let k = 0; k < sides; k++) {
      const a0 = turn + Math.PI * 2 * k / sides, a1 = turn + Math.PI * 2 * (k + 1) / sides, mid = (a0 + a1) / 2;
      const p = (r:number, z:number, angle:number):V3 => [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, z];
      if (!smooth) { w.quad(p(r0, z0, a0), p(r0, z0, a1), p(r1, z1, a1), p(r1, z1, a0), kind, [Math.cos(mid) * dz, Math.sin(mid) * dz, -dr]); continue }
      const nrm = (angle:number):V3 => [Math.cos(angle) * dz / norm, Math.sin(angle) * dz / norm, -dr / norm];
      w.triN(p(r0, z0, a0), p(r0, z0, a1), p(r1, z1, a1), nrm(a0), nrm(a1), nrm(a1), kind);
      w.triN(p(r0, z0, a0), p(r1, z1, a1), p(r1, z1, a0), nrm(a0), nrm(a1), nrm(a0), kind);
    }
  }
}
// 타원체 돔: 밑 반지름 radius · 높이 height, 위 둥근 꼭대기 — 단면을 열 칸으로 나눈 돌려 깎기
export function dome(w:MeshWriter, cx:number, cy:number, z0:number, radius:number, height:number, kind:number, sides = 24):void {
  const rings = 8, profile:[number, number][] = [];
  for (let j = 0; j <= rings; j++) { const phi = Math.PI / 2 * j / rings; profile.push([Math.max(.02, radius * Math.cos(phi)), z0 + height * Math.sin(phi)]) }
  for (let i = 0; i + 1 < profile.length; i++) {   // 타원체 법선: (cosθ·cosφ / 반지름, sinθ·cosφ / 반지름, sinφ / 높이)
    const phi0 = Math.PI / 2 * i / rings, phi1 = Math.PI / 2 * (i + 1) / rings, [r0, h0] = profile[i]!, [r1, h1] = profile[i + 1]!;
    for (let k = 0; k < sides; k++) {
      const a0 = Math.PI * 2 * k / sides, a1 = Math.PI * 2 * (k + 1) / sides;
      const pt = (r:number, z:number, angle:number):V3 => [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, z];
      const nrm = (angle:number, phi:number):V3 => { const nx = Math.cos(angle) * Math.cos(phi) / radius, ny = Math.sin(angle) * Math.cos(phi) / radius, nz = Math.sin(phi) / height, len = Math.hypot(nx, ny, nz); return [nx / len, ny / len, nz / len] };
      w.triN(pt(r0, h0, a0), pt(r0, h0, a1), pt(r1, h1, a1), nrm(a0, phi0), nrm(a1, phi0), nrm(a1, phi1), kind);
      w.triN(pt(r0, h0, a0), pt(r1, h1, a1), pt(r1, h1, a0), nrm(a0, phi0), nrm(a1, phi1), nrm(a0, phi1), kind);
    }
  }
}
// 고딕 첨탑: 팔각 뾰족 지붕(밑 반지름 → 꼭대기 끝) + 네 귀 작은 첨탑 + 꼭대기 십자(둘 다 크기 근사)
export function spire(w:MeshWriter, cx:number, cy:number, z0:number, radius:number, height:number, kind:number, accent:number):void {
  revolve(w, cx, cy, [[radius, z0], [radius * .86, z0 + height * .3], [radius * .5, z0 + height * .72], [.25, z0 + height * .96]], kind, 8, Math.PI / 8);
  for (let corner = 0; corner < 4; corner++) {   // 귀 작은 첨탑(pinnacle)
    const angle = Math.PI / 4 + Math.PI / 2 * corner, px = cx + Math.cos(angle) * radius * 1.04, py = cy + Math.sin(angle) * radius * 1.04;
    revolve(w, px, py, [[radius * .2, z0 - .2], [radius * .2, z0 + height * .12], [.06, z0 + height * .3]], accent, 4, Math.PI / 4);
  }
  const top = z0 + height * .96;
  w.box(cx - .09, cx + .09, cy - .09, cy + .09, top, top + height * .08, accent); w.box(cx - .35, cx + .35, cy - .07, cy + .07, top + height * .035, top + height * .05, accent);
}

// ── 담 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface WallSpec { half:number; height:number; kind:number; cap:number }
// 선 하나를 두께 2·half · 높이 height 의 담으로(끝점마다 연결 — 모서리는 한 변씩 겹쳐 닫는다). 닫힌 점은 호출하는 쪽이 넘긴 선 그대로
export function wallLine(w:MeshWriter, line:P2[], spec:WallSpec):void {
  let travelled = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!, len = Math.hypot(bx - ax, by - ay);
    if (len < .05) continue;
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (const sign of [-1, 1]) w.quad([ax + nx * spec.half * sign, ay + ny * spec.half * sign, 0], [bx + nx * spec.half * sign, by + ny * spec.half * sign, 0], [bx + nx * spec.half * sign, by + ny * spec.half * sign, spec.height], [ax + nx * spec.half * sign, ay + ny * spec.half * sign, spec.height], spec.kind, [nx * sign, ny * sign, 0], travelled, travelled + len, travelled + len, travelled);
    w.quad([ax - nx * spec.half * 1.15, ay - ny * spec.half * 1.15, spec.height], [bx - nx * spec.half * 1.15, by - ny * spec.half * 1.15, spec.height], [bx + nx * spec.half * 1.15, by + ny * spec.half * 1.15, spec.height], [ax + nx * spec.half * 1.15, ay + ny * spec.half * 1.15, spec.height], spec.cap, [0, 0, 1]);
    travelled += len;
  }
}
// 연결 철망 울타리(OSM barrier=fence): 두 면 얇은 그물 한 장 + 끝 말뚝 — 낮 · 밤 모두 빛나지 않는 어두운 선
export function fenceLine(w:MeshWriter, line:P2[], height = 1.5):void {
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!, len = Math.hypot(bx - ax, by - ay);
    if (len < .05) continue;
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (const sign of [-1, 1]) w.quad([ax, ay, .1], [bx, by, .1], [bx, by, height], [ax, ay, height], K.band, [nx * sign, ny * sign, 0]);
    const posts = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= posts; k++) { const px = ax + (bx - ax) * k / posts, py = ay + (by - ay) * k / posts; w.box(px - .05, px + .05, py - .05, py + .05, 0, height + .1, K.band, { bottom: true }) }
  }
}

// ── 이름 모를 건물 ─────────────────────────────────────────────────────────────────────────────────────────────
// 높이: OSM height > building:levels × 3.3 + 1 > 대체값(근사 — 건물마다 근거 없는 값은 이 대체값으로)
export const heightOf = (b:{ h:number; lv:number }, fallback = 8):number => (b.h > 0 ? b.h : b.lv > 0 ? b.lv * 3.3 + 1 : fallback);
// 중립 건물: 미색 벽 + 평지붕 + 처마띠 + 가는 창 줄 — 사진 · 자료로 모양을 확인하지 못한 건물(윤곽과 높이만 맞춘다)
export function neutralBuilding(w:MeshWriter, pts:P2[], height:number, opts:{ wall?:number; roof?:number; windows?:boolean } = {}):void {
  const wall = opts.wall ?? K.cream;
  prismPoly(w, pts, 0, height, wall, opts.roof ?? K.stone);
  belt(w, pts, height, height + .35, K.trim, .1);
  if (opts.windows === false || height < 6) return;
  const floors = Math.max(2, Math.round(height / 3.4)), storey = height / floors;   // 층마다 창 한 줄(층 수는 높이에서 — 근사)
  for (let floor = 0; floor < floors; floor++) edgeWindows(w, pts, { bay: 3.6, width: 1.5, z0: storey * floor + .9, z1: storey * (floor + 1) - .7, arch: 'flat', pane: K.pane, minEdge: 5 });
}
