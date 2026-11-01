// 봉은사 구역(판전 · 대웅전 · 나머지 전각 틀 · 옹벽 · 나무) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 봉은사 전각 열넷(법왕루 · 대웅전 · 선불당 · 심검당 · 미륵전 · 운하당 · 종루 · 보우당 · 판전 · 진여문 · 북극보전 · 영각 · 다래헌 · 지장전), 옹벽 = barrier=retaining_wall(height=4), 나무 = natural=wood 면에 채운 근사.
// 출처로 확인한 것(위키백과 ko 봉은사 판전): 단층 맞배집 목조 · 1856년 창건 · 1878년 중수 · 경내에서 가장 오래된 건물 · 경판 보관과 예불을 함께 하는 독특한 창호 구성 · 정면 가운데 칸 처마에 판전 현판.
// 대웅전은 위키백과 ko 봉은사에서 이름 · 삼불좌상만 확인(칸 수 · 지붕은 못 찾음).
// 근사(출처 못 찾음 · 값마다 "근사"): 판전 · 대웅전 칸 수(윤곽 길이에서) · 판전 창호 구성 · 대웅전 지붕(팔작 다포로 근사 — 큰 법당이라) · 기둥 · 지붕 높이 · 기단 · 나머지 전각 틀(칸 수 · 높이 모두) · 옹벽 재료(화강석) · 숲 나무 자리(7 m 격자에 흔들어 채움).
// 2차 보완(Codex 1차 지적): ① 미륵대불 추가 ② 대웅전 문을 검은 면이 아닌 연한 목재색(K.timber · 근사)으로.
//   미륵대불: 위키백과 ko 봉은사 — 1996년 1월 7일 봉안 · 높이 23 m(충남 논산 관촉사 은진미륵보다 5 m 정도 높음). OSM 에 자리 점이 없고 다른 자료도 못 찾았다 —
//   대웅전 뒤(북) 언덕 쪽 빈 터(자리 근사) · 연꽃 받침 3 m + 입상 · 머리 위 보개를 합쳐 23 m(받침 · 보개 포함 여부 위키에 없음 — 합쳐서 근사) · 모양은 밝은 돌 입상 큰 실루엣만(얼굴 · 옷 주름 · 손 모양 없음).
// 못 그린 것: 미륵대불 얼굴 · 옷 주름 · 손 모양 · 보개 장식 · 판전 안 경판 · 현판 글씨 · 단청 무늬 · 법왕루 2층 여부(자료 없음 — 틀에 맡김) · 연등.
import { MeshWriter, K } from './monument_parts.mts';
import { BE_AT, BE_ORIGIN } from './monuments_data.mts';
import { BE_BUILDINGS, BE_WALLS } from './monuments_bongeunsa_data.mts';
import { BE_TREES } from './monuments_bongeunsa_trees_data.mts';
import { frameOf, rectOf, place, hall, buildFrames, clamp, local, FINE } from './monuments_hanok.mts';
import { faceSouth, wallLine, revolve } from './monument_modern.mts';
import type { P2 } from './monument_modern.mts';

const FRAME = frameOf(BE_AT, BE_ORIGIN);
export const trees = { at: BE_AT, data: BE_TREES };
const DEDICATED = ['봉은사 판전', '봉은사 대웅전'];

function panjeon(w:MeshWriter, flat:number[]):void {
  const r = faceSouth(rectOf(flat, FRAME)); place(w, r);
  const hx = r.len / 2 - 1.4, hy = r.wid / 2 - 1.4;
  hall(w, { hx, hy, podium: .9, lowPodium: [.7], body: 3.6, rise: 3.2, eave: 1.9, bays: [clamp(Math.round(hx * 2 / 3.3), 3, 7), clamp(Math.round(hy * 2 / 3.3), 2, 4)], steps: FINE, gabled: true, doors: true, stair: true });   // 단층 맞배(위키) · 칸 수는 윤곽에서(근사)
  w.xf = null;
}
function daeungjeon(w:MeshWriter, flat:number[]):void {
  const r = faceSouth(rectOf(flat, FRAME)); place(w, r);
  const hx = r.len / 2 - 2.2, hy = r.wid / 2 - 2.2;
  hall(w, { hx, hy, podium: 1.3, lowPodium: [1.1, .5], body: 5.2, rise: 4.8, eave: 2.3, bays: [clamp(Math.round(hx * 2 / 4), 3, 7), clamp(Math.round(hy * 2 / 4), 2, 5)], steps: FINE, brackets: true, doors: true, doorsAll: true, doorKind: K.timber, stair: true, gable: .5 });   // 팔작 다포로 근사(출처 못 찾음) · 문은 연한 목재색(근사)
  w.xf = null;
}
// 미륵대불(근사): 연꽃 받침 + 밝은 입상(치마 · 가슴 · 팔 둘 · 목 · 머리) + 머리 위 보개. 받침 · 보개 포함 높이 23 m
const BUDDHA_AT:[number, number] = [-15, 140];
function buddha(w:MeshWriter):void {
  const [cx, cy] = BUDDHA_AT;
  w.xf = null;
  revolve(w, cx, cy, [[5.2, 0], [5.2, .9], [4.4, 1.3], [4.6, 2.2], [3.6, 3]], K.stone, 16, 0, true);   // 받침(연꽃 층)
  revolve(w, cx, cy, [[3.6, 3], [3.0, 3.8], [2.7, 9], [2.4, 12.2], [2.7, 13.8], [2.2, 15.4], [1.1, 16], [.95, 16.7]], K.trim, 16, 0, true);   // 치마 · 가슴 · 목
  for (const side of [-1, 1]) revolve(w, cx + side * 2.75, cy, [[.9, 13.8], [1.0, 12.6], [.85, 8.8], [.6, 8.2]], K.trim, 10, 0, true);   // 아래로 내린 팔
  revolve(w, cx, cy, [[.95, 16.4], [1.55, 17.4], [1.6, 18.7], [1.1, 19.8], [.02, 20.3]], K.trim, 16, 0, true);   // 머리
  revolve(w, cx, cy, [[.35, 20.2], [.35, 21.4]], K.stone, 6);   // 보개 줄기
  revolve(w, cx, cy, [[4.4, 21.2], [4.6, 21.6], [3.8, 22.2], [.5, 23]], K.stone, 16, 0, true);   // 보개(둥근 덮개)
  revolve(w, cx, cy, [[4.6, 21.5], [4.7, 21.7], [4.5, 21.8]], K.gilt, 16);   // 보개 가장자리 금빛 띠
}
function buildHalls(w:MeshWriter):void {
  buddha(w);
  const small = BE_BUILDINGS.find(each => each.name === '봉은사 판전'); if (small) panjeon(w, small.p);
  const main = BE_BUILDINGS.find(each => each.name === '봉은사 대웅전'); if (main) daeungjeon(w, main.p);
}
function buildWall(w:MeshWriter):void {
  w.xf = null;
  for (const wall of BE_WALLS) {
    const line:P2[] = [];
    for (let i = 0; i < wall.p.length; i += 2) line.push(local(BE_ORIGIN[0] + wall.p[i]! / 1e6, BE_ORIGIN[1] + wall.p[i + 1]! / 1e6, FRAME));
    wallLine(w, line, { half: .4, height: wall.h > 0 ? wall.h : 3, kind: K.granite, cap: K.trim });   // 높이는 OSM · 재료는 근사
  }
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'be-wall') buildWall(w);
  else if (id === 'be-halls') buildHalls(w);
  else if (id === 'be-frames') buildFrames(w, BE_BUILDINGS, DEDICATED, FRAME);
  return new Float32Array(w.data);
}
