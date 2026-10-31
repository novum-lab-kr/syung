// 운현궁 구역(수직사 · 김승현 가옥 · 행랑채 틀 · 유물전시관 · 양관) 모델. 궁궐이 아니라 대원군의 사저라 단청 · 월대 없이 원목 기둥 · 회벽 · 기와의 민가식으로 짓는다.
// monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다. 부품은 monuments_hanok.mts(공용 틀 monuments_palace_kit.mts) 의 원목 한옥(buildTimberHouse) + 서양식 monuments_western.mts.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 모두 OSM(© OpenStreetMap contributors): 둘레 = way 771236312(운현궁) 경계 · 건물 = 그 안의 building 8동 + 둘레 밖 운현궁 양관(way 414771660)(monuments_unhyeongung_data.mts),
// 나무 = OSM natural=tree 점 3그루(수종 표기 없음 = 수종 미상, monuments_unhyeongung_trees_data.mts).
// 출처로 확인한 것(위키백과 ko 운현궁): 현재 운현궁은 노안당 · 노락당 · 이로당과 부속 행랑채 / 노안당 정(丁)자형 정면 6칸 측면 2칸 + 동쪽 7칸 · 노락당 초익공 홑처마 팔작 / 이로당 口자형 정면 7칸 측면 7칸 / 양관은 덕성여대 평생교육원으로 쓰는 서양식 건물 / 김승현 가옥(옛 영로당 터)은 서울 민속자료 제19호.
// 노안당 · 노락당 · 이로당 자리는 OSM relation 8815075(운현궁 본채)의 바깥 둘레 way 634120500 · 414771657 + 이로당 마당 way 709490448 (monuments_unhyeongung_data.mts).
// 못 그린 것(자료 없음 — 사실로 짓지 않는다): 대문 · 담장 · 마당 · 연못 · 경송비.
// 윤곽만 있는 이름 없는 historic 건물(행랑채로 보이나 이름 표기가 없어 단정하지 않는다)은 원목 기둥 윤곽 압출 틀로만 세운다.
// 사진 비례 근사(출처 못 찾음): 수직사 · 김승현 가옥 높이 · 처마, 유물전시관 층 수 · 벽 · 평지붕, 양관 층 높이 · 현관 폭 · 지붕 경사(1912 · 밝은 색 르네상스풍 2층만 출처 있음).
import { K } from './monument_parts.mts';
import { UHG_AT, UHG_ORIGIN, uhgRing } from './monuments_data.mts';
import { UHG_BUILDINGS } from './monuments_unhyeongung_data.mts';
import { UHG_TREES } from './monuments_unhyeongung_trees_data.mts';
import { UHG_TORCHES } from './monuments_unhyeongung_torches_data.mts';
import { frameOf, rectOf, place, clamp, hall, ROUGH } from './monuments_hanok.mts';
import type { Rect } from './monuments_hanok.mts';
import { buildZone, half, timberHall, TIMBER_REMAP } from './monuments_palace_kit.mts';
import type { Builder, ZoneSpec } from './monuments_palace_kit.mts';
import { westernBuilding } from './monuments_western.mts';
import type { WesternLook } from './monuments_western.mts';

export const trees = { at: UHG_AT, data: UHG_TREES };
export const torches = { at: UHG_AT, data: UHG_TORCHES };   // 밤 길가 · 건물 앞 횃불
const FRAME = frameOf(UHG_AT, UHG_ORIGIN);

// 양관(1912): 밝은 색 서양 르네상스풍 2층(경향신문 · 위키백과 — 붉은 벽돌이 아니다). 연한 석회색 벽 · 아치 창 · 현관 · 2층 발코니 난간. 층 높이 · 현관 폭 · 지붕 경사는 사진 비례 근사
const YANGGWAN:WesternLook = { floors: 2, storey: 4.0, wall: K.cream, plinth: .7, roof: 'hip', roofRise: 2.8, eave: .8, arch: true, balustrade: true, bayWidth: 3.2, trim: K.trim };
const YANGGWAN_PORCH:WesternLook = { ...YANGGWAN, portico: { cols: 4, depth: 2.4, balcony: true } };
const EXHIBITION:WesternLook = { floors: 2, storey: 3.6, wall: K.plaster, plinth: .4, roof: 'flat', roofRise: 0, bayWidth: 3.4, trim: K.trim };   // 유물전시관(현대 건물) — 사진 비례 근사
const western = (look:WesternLook, margin:number):Builder => (w, r) => { const { hx, hy } = half(r, margin); westernBuilding(w, hx, hy, look) };

// 양관은 윤곽이 불규칙(여러 날개)이라 날개마다 짓는다 — 현관은 가장 큰 날개 하나에만
let wingNumber = 0;
const yanggwan:Builder = (w, r) => { const { hx, hy } = half(r, .4); westernBuilding(w, hx, hy, wingNumber++ === 0 ? YANGGWAN_PORCH : YANGGWAN) };

// 노안당 · 노락당 일곽(OSM way 634120500): 윤곽을 큰 직사각형 날개로 떼어 내 이름을 붙인다. 날개 이름은 윤곽 안 자리 순서로 붙인 근사다(남쪽 날개 = 노안당 · 북쪽 큰 날개 = 노락당 — 위키백과 ko: 남에서 북으로 노안당 · 노락당 · 이로당).
// 칸 수 근거(둘 다 직접 확인):
//   노안당 — 위키백과 ko: 정(丁)자형 · 몸채 정면 6칸 측면 2칸 + 몸채 동쪽 끝에 7칸 덧붙임(동쪽 끝에서 남으로 돌출한 2칸 = 누마루 영화루) · 초익공 홑처마 팔작. 몸채(동서)와 덧붙임(남북)은 서로 직각 — 한 줄 13칸이 아니다.
//   노락당 — 서울시 운현궁 안내(culture.seoul.go.kr 안내 자료): 몸채 정면 10칸 · 측면 3칸 + 왼쪽 1칸 · 오른쪽 2칸, 남쪽 행각과 연결 · 위키백과 ko: 초익공 7량 홑처마 팔작.
// 지도 윤곽과 안 맞는 곳(근사로 둔다): 남쪽 날개는 33.6 × 7.2 m — 몸채 6칸 × 2칸(3.6 m 칸)이면 21.6 m, 나머지 12 m 는 윤곽이 덧붙임 · 영화루 터까지 덮는 것으로 보고
//   덧붙임(방채 5칸 + 영화루 2칸)은 몸채 끝에 붙은 작은 날개(동서 6 m)로만 짓는다 — 윤곽의 남쪽 19.8 m · 동쪽 끝 6 m 는 비워 둔다. 위키는 영화루가 2칸만 돌출이라 하는데 윤곽은 몸채 선에서 약 16 m 나온다(행랑 · 옛 터 윤곽일 수 있다 — 확인 못 함).
//   노락당 날개는 22.2 × 14.1 m 라 10칸이면 2.2 m 칸 — 실제 칸(약 3 m)보다 좁다(윤곽이 단순화됐을 수 있다 — 확인 못 함). 칸 수를 크기에서 세지 않고 출처 값으로 고정한다.
// 나머지 날개(행랑 · 월랑)는 공개 출처가 없어 크기에서 센 근사 — 공포는 초익공이라 달지 않는다. 모두 단청 없는 원목(사대부가).
export const CORE_PLAN = {
  // 덧붙임 7칸 = 방채 5칸 + 남쪽 끝 영화루 2칸(열린 누마루). 몸채와 직각(남북으로 뻗는다)
  noandang: { body: [6, 2] as [number, number], room: [5, 2] as [number, number], numaru: [2, 2] as [number, number] },
  norakdang: { body: [10, 3] as [number, number] },
};
// 덧붙임은 몸채 동쪽 끝에 붙는 작은 날개(동서 6 m): 방채 12 m(5칸 × 2.4 m) + 영화루 6.6 m(2칸 × 3.3 m) — 윤곽의 나머지(동쪽 6 m · 남쪽 4.8 m)는 짓지 않는다(근사).
// 영화루는 벽 없는 누마루: 기둥 위에 마루를 높이 들고(누하주) 난간 · 열린 몸 · 팔작 지붕 — 사진 비례 근사(높이 · 난간 모양). 열린 누마루라는 점은 위키백과 ko 의 "누마루" 설명.
const ANNEX_WIDTH = 6, ROOM_LENGTH = 12, NUMARU_LENGTH = 6.6, NUMARU_FLOOR = 1.7;
const CORE_ANCHORS:{ name:string; at:[number, number]; bays?:[number, number]; skip?:boolean }[] = [
  { name: '노안당', at: [-1.4, -5.3] },
  { name: '노안당 덧붙임', at: [11.9, -15.1], skip: true },   // 덧붙임 덩어리 — 노안당 날개를 지을 때 함께 짓는다
  { name: '노락당', at: [-.7, 13.2], bays: CORE_PLAN.norakdang.body },
  { name: '노락당 날개', at: [-9.1, 27.6] },
];
const core:Builder = (w, r) => {
  const nearest = CORE_ANCHORS.map(anchor => ({ anchor, dist: Math.hypot(anchor.at[0] - r.cx, anchor.at[1] - r.cy) })).sort((a, b) => a.dist - b.dist)[0]!;
  const known = nearest.dist < 4 ? nearest.anchor : undefined;
  if (known?.skip) return;
  if (known?.name === '노안당') { noandang(w, r); return }
  const { hx, hy } = half(r, .5);
  timberHall(w, r, known?.bays ?? [clamp(Math.round(hx * 2 / 3), 1, 8), clamp(Math.round(hy * 2 / 3), 1, 3)]);
};
// 노안당: 몸채(동서 6칸 × 2칸) + 몸채 동쪽 끝에 직각으로 붙은 덧붙임(남북 7칸). r = 윤곽 날개(긴 변이 동서, 앞이 남쪽)
const noandang:Builder = (w, r) => {
  const cos = Math.cos(r.ang), sin = Math.sin(r.ang), bay = r.wid / CORE_PLAN.noandang.body[1];
  const strip = (aLo:number, aHi:number, bLo:number, bHi:number, ang:number, turned:boolean):Rect => {   // a = 동쪽(긴 변) · b = 북쪽 좌표
    const a = (aLo + aHi) / 2, b = (bLo + bHi) / 2, along = aHi - aLo, across = bHi - bLo;
    return { cx: r.cx + a * cos - b * sin, cy: r.cy + a * sin + b * cos, len: turned ? across : along, wid: turned ? along : across, ang, fill: 1, pts: [] };
  };
  const bodyEnd = -r.len / 2 + CORE_PLAN.noandang.body[0] * bay, northEdge = r.wid / 2;
  const body = strip(-r.len / 2, bodyEnd, -r.wid / 2, northEdge, r.ang, false);
  const room = strip(bodyEnd, bodyEnd + ANNEX_WIDTH, northEdge - ROOM_LENGTH, northEdge, r.ang - Math.PI / 2, true);   // 앞이 서쪽(마당 쪽)을 본다 — 근사
  const numaru = strip(bodyEnd, bodyEnd + ANNEX_WIDTH, northEdge - ROOM_LENGTH - NUMARU_LENGTH, northEdge - ROOM_LENGTH, r.ang - Math.PI / 2, true);
  place(w, body); timberHall(w, body, CORE_PLAN.noandang.body); w.xf = null;
  place(w, room); timberHall(w, room, CORE_PLAN.noandang.room); w.xf = null;
  place(w, numaru); yeonghwaru(w, numaru); w.xf = null;
};
// 영화루: 벽 없는 열린 누마루 — 누하주(마루 밑 기둥) 위에 마루 · 둘레 난간 · 기둥 줄 · 팔작 지붕. 모두 단청 없는 원목
const yeonghwaru:Builder = (w, r) => {
  const { hx, hy } = half(r, .3), floor = NUMARU_FLOOR, bays = CORE_PLAN.noandang.numaru, post = .2;
  w.remap = { ...TIMBER_REMAP, [K.granite]: K.timber, [K.trim]: K.timber };
  for (let i = 0; i <= bays[0]; i++) for (let j = 0; j <= bays[1]; j++) {   // 누하주
    const x = -hx + 2 * hx * i / bays[0], y = -hy + 2 * hy * j / bays[1];
    w.box(x - post, x + post, y - post, y + post, 0, floor, K.timber, { bottom: true, top: true });
  }
  w.box(-hx - .35, hx + .35, -hy - .35, hy + .35, floor - .22, floor, K.timber, { bottom: true });   // 마루
  w.dz = floor;
  hall(w, { hx, hy, podium: .05, lowPodium: [.02], body: 2.7, rise: 2.2, eave: 1.6, bays, steps: ROUGH, hollow: true, gable: .45 });
  w.dz = 0;
  const rail = (x0:number, x1:number, y0:number, y1:number):void => { w.box(x0, x1, y0, y1, floor + .8, floor + .92, K.timber, { bottom: true, top: true }) };
  rail(-hx, hx, -hy - .04, -hy + .04); rail(-hx, hx, hy - .04, hy + .04); rail(-hx - .04, -hx + .04, -hy, hy); rail(hx - .04, hx + .04, -hy, hy);   // 난간 윗대
  for (let k = 0; k <= 8; k++) {   // 난간 살(앞 · 뒤 · 옆)
    const x = -hx + 2 * hx * k / 8, y = -hy + 2 * hy * k / 8;
    for (const edge of [-hy, hy]) w.box(x - .03, x + .03, edge - .03, edge + .03, floor, floor + .8, K.timber, { bottom: true });
    for (const edge of [-hx, hx]) w.box(edge - .03, edge + .03, y - .03, y + .03, floor, floor + .8, K.timber, { bottom: true });
  }
  w.remap = null;
};

// 이로당(OSM way 414771657 + 안쪽 way 709490448 = 마당): 口자형 — 위키백과 ko: 바깥으로 문을 내지 않은 폐쇄형 · 정면 7칸 측면 7칸 홑처마 팔작.
// 마당(6.6 × 6.3 m)은 OSM 안쪽 윤곽 그대로, 네 채는 마당 둘레를 감싼다(위 · 아래 채는 전 길이, 좌 · 우 채는 그 사이). 칸 폭은 한 변 7칸으로 나눈 값.
const IRO_HOLE = UHG_BUILDINGS.find(each => each.name === '이로당')!.hole!;
const irodang:Builder = (w, r) => {
  const hole = rectOf(IRO_HOLE, FRAME), dx = hole.cx - r.cx, dy = hole.cy - r.cy, cos = Math.cos(r.ang), sin = Math.sin(r.ang);
  const holeU = dx * cos + dy * sin, holeV = -dx * sin + dy * cos;   // 마당 중심(이로당 윤곽 중심 기준, 윤곽 축 방향)
  const alongHole = Math.abs(Math.cos(hole.ang - r.ang)) > .7;      // 마당 긴 변이 윤곽 긴 변과 같은 쪽인가
  const holeLen = Math.min(alongHole ? hole.len : hole.wid, r.len - 8), holeWid = Math.min(alongHole ? hole.wid : hole.len, r.wid - 8);
  const u0 = holeU - holeLen / 2, u1 = holeU + holeLen / 2, v0 = holeV - holeWid / 2, v1 = holeV + holeWid / 2;
  const strip = (uLo:number, uHi:number, vLo:number, vHi:number, ang:number, turned:boolean):Rect => {
    const u = (uLo + uHi) / 2, v = (vLo + vHi) / 2, along = uHi - uLo, across = vHi - vLo;
    return { cx: r.cx + u * cos - v * sin, cy: r.cy + u * sin + v * cos, len: turned ? across : along, wid: turned ? along : across, ang, fill: 1, pts: [] };
  };
  const north = strip(-r.len / 2, r.len / 2, v1, r.wid / 2, r.ang, false);              // 앞(−y)이 마당을 본다
  const south = strip(-r.len / 2, r.len / 2, -r.wid / 2, v0, r.ang + Math.PI, false);
  const west = strip(-r.len / 2, u0, v0, v1, r.ang - Math.PI / 2, true);
  const east = strip(u1, r.len / 2, v0, v1, r.ang + Math.PI / 2, true);
  for (const wing of [north, south, west, east]) {
    place(w, wing);
    timberHall(w, wing, [clamp(Math.round(wing.len / 3.4), 1, 8), clamp(Math.round(wing.wid / 3.4), 1, 3)]);
    w.xf = null;
  }
};
const MODERN:Record<string, Builder> = {
  '유물전시관': western(EXHIBITION, .2),
};

const SPEC:ZoneSpec = {
  frame: FRAME, ring: uhgRing, buildings: UHG_BUILDINGS, dedicated: { '이로당': irodang }, modern: MODERN, wings: { '운현궁 양관': yanggwan, '노안당·노락당': core }, wingPasses: 6,
  timber: ['수직사', '김승현 가옥'],
  timberRich: (_r:Rect) => true,   // 윤곽만 있는 나머지 한옥은 단청 없는 원목 기둥으로
};

export function buildMonument(id:string):Float32Array {
  wingNumber = 0;
  return buildZone(SPEC, id, { wall: 'uhg-wall', halls: 'uhg-halls', frames: 'uhg-frames' });
}
