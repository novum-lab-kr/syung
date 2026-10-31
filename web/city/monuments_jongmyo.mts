// 종묘 구역(바깥 · 안 담장 · 정전 · 영녕전 · 공신당 · 칠사당 · 외대문 · 신문 · 동문 · 서문 · 나머지 한옥 틀) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 부품은 경복궁 · 창덕궁과 같다(monuments_hanok.mts). 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 모두 OSM(© OpenStreetMap contributors): 바깥 둘레 = 바깥 담 way 를 이은 경계(JM_RING), 안 담 = way 170403817 · 170403830 · 382428456, 건물 = 둘레 안 building 29동(monuments_jongmyo_data.mts), 나무 = 같은 둘레 안의 wood · tree.
// 출처로 확인한 것(위키백과 ko 종묘 · 종묘 정전 · 영녕전): 정전 감실 19칸(+ 좌우 협실 각 2칸 · 남으로 꺾인 월랑 5칸 — 총 길이 101 m) · 정전 전면은 퇴칸 기둥만 서고 벽 없이 묘정으로 트이고 측면 · 뒷면은 전벽돌로 두껍게 쌓음 ·
// 각 칸 두 짝 판문 / 영녕전 16칸 / 공신당 16칸 / 정문(외대문) 3칸 · 측면 2칸 맞배 / 신문 3칸 · 동문 3칸 · 서문 1칸 / 묘정 월대 동서 109 m · 남북 69 m(하월대 · 상월대) / 공신당 · 칠사당은 묘정 월대 남쪽 아래 동서쪽 / 단청이 극도로 절제됨.
// 사진 비례 근사(출처 못 찾음 · 값마다 "근사"): 건물 높이 · 처마 · 기단(월대) 높이 전부, 맞배 지붕의 박공 내밂 · 단면 곡선(monument_matbae.mts — 양 끝이 수직인 진짜 맞배), 영녕전 가운데 본전 · 좌우 익실의 높이 차, 판문 재질(붉은 칠 근사 — 밤에 빛나지 않는 K.red), OSM 정전 윤곽 91.8 m 를 기단선으로 보고 칸 폭에 맞춘 것(위키 101 m 는 월랑 포함),
// 이름 없는 문 건물이 어느 문인지(170403781 = 정전 동문 · 382428482 = 정전 서문 · 382428477 · 382428478 · 170403796 = 영녕전 쪽 문 — 자리와 크기로 짐작), 공신당 · 칠사당이 북쪽(정전 쪽)을 본다는 것(월대 남쪽에 놓인 자리에서 읽음).
// 못 그린 것: 단청 세부 · 판문 살 · 신로(月臺 한가운데 길) · 판위 · 판문 틈 · 월랑 꺾임(OSM 윤곽 그대로 한옥 틀) · 예감 · 수복방 · 재궁 · 잡상 · 영녕전 월대.
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { JM_AT, JM_ORIGIN, jmRing } from './monuments_data.mts';
import { JM_BUILDINGS, JM_WALLS } from './monuments_jongmyo_data.mts';
import { JM_TREES } from './monuments_jongmyo_trees_data.mts';
import { JM_TORCHES } from './monuments_jongmyo_torches_data.mts';
import { frameOf, rectOf, place, hall, buildWallLine, buildFrames, FINE, MID } from './monuments_hanok.mts';
import type { Rect, Hall } from './monuments_hanok.mts';
import { toM } from './life.mts';

export const trees = { at: JM_AT, data: JM_TREES };
export const torches = { at: JM_AT, data: JM_TORCHES };   // 밤 길가 · 전각 앞 횃불
const FRAME = frameOf(JM_AT, JM_ORIGIN);
const local = (lng:number, lat:number):[number, number] => { const [mx, my] = toM(lng, lat); return [mx - FRAME.ox, -(my - FRAME.oy)] };
const byId = new Map(JM_BUILDINGS.map(each => [each.id, each]));

// ── 문(이름 없는 것은 id 로) ──────────────────────────────────────────────────────────────────────────────
// 칸 수는 위키 문장(정문 3칸 · 신문 3칸 · 동문 3칸 · 서문 1칸), 어느 건물이 어느 문인지는 근사(머리 주석)
const GATE_BAYS:Record<number, [number, number]> = { 170403782: [3, 2], 170403786: [3, 2], 170403796: [3, 2], 170403781: [3, 2], 382428482: [1, 1], 382428477: [3, 1], 382428478: [1, 1] };
const WALL_GAPS = Object.keys(GATE_BAYS).map(Number);

// ── 담장 ───────────────────────────────────────────────────────────────────────────────────────────────────
// 바깥 둘레 한 바퀴 + 안 담 셋(정전 일곽 · 영녕전 일곽 · 향대청 일곽). 문 자리는 담장을 짓지 않고 문 모델이 대신 선다
function buildWall(w:MeshWriter):void {
  const gaps = WALL_GAPS.flatMap(id => { const each = byId.get(id); if (!each) return []; const r = rectOf(each.p, FRAME), xs = r.pts.map(p => p[0]), ys = r.pts.map(p => p[1]); return [[Math.min(...xs) - 2.5, Math.max(...xs) + 2.5, Math.min(...ys) - 2.5, Math.max(...ys) + 2.5] as const] });
  const skip = (x:number, y:number) => gaps.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  const ring = jmRing().map(([lng, lat]) => { const [x, y] = local(lng, lat); return [x, y, 0] as V3 }); ring.push(ring[0]!);
  buildWallLine(w, ring, skip);
  for (const flat of JM_WALLS) {
    const line:V3[] = [];
    for (let i = 0; i < flat.length; i += 2) { const [x, y] = local(JM_ORIGIN[0] + flat[i]! / 1e6, JM_ORIGIN[1] + flat[i + 1]! / 1e6); line.push([x, y, 0]) }
    buildWallLine(w, line, skip);
  }
}

// ── 전용 모델 ────────────────────────────────────────────────────────────────────────────────────────────────
const southFacing = (r:Rect):Rect => (Math.cos(r.ang) < 0 ? { ...r, ang: r.ang + Math.PI } : r);
const northFacing = (r:Rect):Rect => (Math.cos(r.ang) < 0 ? r : { ...r, ang: r.ang + Math.PI });   // 앞(−y)이 북쪽을 보게
const half = (r:Rect, margin:number) => ({ hx: Math.max(1, r.len / 2 - margin), hy: Math.max(1, r.wid / 2 - margin) });
// 판문: 어두운 밤 발광(K.tunnel)이 아니라 붉은 칠 나무(K.red — 밤에 빛나지 않는다)로 바꿔 짓는다(근사)
const DOORS = { [K.tunnel]: K.red };
// 정전 · 영녕전: 옆면 · 뒷면은 전벽돌, 창호는 달지 않는다(판문 앞 칸 불빛 금지) — 창 → 벽돌 · 회벽(박공 벽 포함) → 벽돌
const SHRINE = { ...DOORS, [K.window]: K.brick, [K.plaster]: K.brick };

// 묘정 월대(동서 109 m · 남북 69 m — 위키): 정전 앞으로 펼쳐지는 하월대. 정전 기단의 뒤쪽 끝에서 남으로 69 m. 높이는 근사
function moyeongWoldae(w:MeshWriter, hy:number):void {
  const back = hy + 3.0, front = back - 69, top = .75, hx = 54.5;
  w.box(-hx, hx, front, back, 0, top, K.granite, { bottom: true });
  w.quad([-hx, front, top], [hx, front, top], [hx, back, top], [-hx, back, top], K.stone, [0, 0, 1]);
}
// 정전: 감실 19칸 · 측면 3칸 · 맞배. 앞은 퇴칸 기둥 + 판문(19칸 모두 — 각 칸 두 짝), 옆 · 뒤는 전벽돌. 월대 위(상월대 근사 1.1 m + 하월대)
function buildJeongjeon(w:MeshWriter, r:Rect):void {
  const S:Hall = { ...half(r, .8), podium: 1.3, lowPodium: [1.4, .7], body: 5.0, rise: 4.6, eave: 3.2, bays: [19, 3], steps: FINE, gabled: true, doors: true, doorsAll: true, stair: true };
  moyeongWoldae(w, S.hy);
  w.remap = SHRINE; hall(w, S); w.remap = null;
}
// 영녕전: 16칸 = 가운데 본전 4칸(높다) + 좌우 익실 각 6칸(낮다)(위키: 옆 익실은 본전보다 작다). 칸 수는 위키, 높이 차 · 높이는 근사. 맞배 셋을 일렬로 세운다
function buildYeongnyeongjeon(w:MeshWriter, r:Rect):void {
  const base = half(r, .8), bay = base.hx / 8, wing = { ...base, hx: bay * 3 };   // 16칸을 8 로 나눈 반폭 = bay · 본전 4칸 반폭 = 2 bay · 익실 6칸 반폭 = 3 bay
  const cos = Math.cos(r.ang), sin = Math.sin(r.ang), center = { ...base, hx: bay * 2 };
  w.remap = SHRINE;
  hall(w, { ...center, podium: 1.1, lowPodium: [1.2, .6], body: 5.0, rise: 4.4, eave: 3.0, bays: [4, 3], steps: FINE, gabled: true, doors: true, doorsAll: true, stair: true });
  for (const side of [-1, 1]) {
    const offset = side * bay * 5;   // 본전 반폭 2 + 익실 반폭 3
    place(w, { ...r, cx: r.cx + cos * offset, cy: r.cy + sin * offset });
    hall(w, { ...wing, podium: .9, lowPodium: [1.0, .5], body: 3.4, rise: 2.5, eave: 2.4, bays: [6, 3], steps: FINE, gabled: true, doors: true, doorsAll: true });
  }
  w.remap = null; place(w, r);
}
// 공신당: 16칸 · 홑집 · 가운데 세 칸만 판문, 나머지 칸은 광창(위키) — 광창은 창호(밤 불빛)로. 북쪽(정전 쪽)을 본다
function buildGongsindang(w:MeshWriter, r:Rect):void {
  const S:Hall = { ...half(r, .4), podium: .9, lowPodium: [.8], body: 3.6, rise: 3.0, eave: 2.0, bays: [16, 1], steps: MID, gabled: true };
  w.remap = DOORS; hall(w, S);
  const bayX = 2 * S.hx / 16, doorTop = S.podium + S.body - .7;
  for (let k = 6; k <= 8; k++) { const cx = -S.hx + bayX * (k + .5), dx = bayX * .36; w.quad([cx - dx, -S.hy - .03, S.podium + .3], [cx + dx, -S.hy - .03, S.podium + .3], [cx + dx, -S.hy - .03, doorTop], [cx - dx, -S.hy - .03, doorTop], K.tunnel, [0, -1, 0]) }
  w.remap = null;
}
// 칠사당: 3칸 작은 건물(위키 "정전 담장 안에 있는 3칸 짜리 작은 건물"). 북쪽을 본다
const gate = (w:MeshWriter, r:Rect, bays:[number, number]):void => { hall(w, { ...half(r, .6), podium: 1.0, lowPodium: [.9, .4], body: 3.4, rise: 3.0, eave: 2.1, bays, steps: MID, gabled: true, doors: true, stair: r.len > 7 }) };

const DEDICATED:Record<string, (w:MeshWriter, r:Rect) => void> = {
  정전: buildJeongjeon,
  영녕전: buildYeongnyeongjeon,
  칠사당: (w, r) => hall(w, { ...half(r, .4), podium: .9, lowPodium: [.8], body: 3.4, rise: 2.8, eave: 1.9, bays: [3, 1], steps: MID, gabled: true, doors: true }),
  외대문: (w, r) => gate(w, r, [3, 2]),
  남신문: (w, r) => gate(w, r, [3, 2]),
};
const FACING_NORTH = ['공신당', '칠사당'];

function buildHalls(w:MeshWriter):void {
  for (const each of JM_BUILDINGS) {
    const gateBays = GATE_BAYS[each.id], dedicated = DEDICATED[each.name], builder = each.name === '공신당' ? buildGongsindang : dedicated ?? (gateBays ? (ww:MeshWriter, rr:Rect) => gate(ww, rr, gateBays) : null);
    if (!builder || each.p.length < 6) continue;
    const base = rectOf(each.p, FRAME), r = FACING_NORTH.includes(each.name) ? northFacing(base) : southFacing(base);
    place(w, r); w.remap = DOORS; builder(w, r); w.remap = null; w.xf = null;
  }
}
// 나머지: 한옥 틀(전사청 · 향대청 · 관리소 · 공민왕신당 · 월랑 · 이름 없는 건물)
function buildRest(w:MeshWriter):void {
  const names = [...Object.keys(DEDICATED), '공신당'];
  const rest = JM_BUILDINGS.filter(each => !GATE_BAYS[each.id]);
  buildFrames(w, rest, names, FRAME);
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'jm-wall') buildWall(w);
  else if (id === 'jm-halls') buildHalls(w);
  else if (id === 'jm-frames') buildRest(w);
  return new Float32Array(w.data);
}
