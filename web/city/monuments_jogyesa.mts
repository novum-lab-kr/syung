// 조계사 구역(대웅전 · 일주문 · 나머지 건물 · 나무) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 대웅전 = way 432721256(38.8 × 25.7 m — 처마 · 기단 포함 윤곽), 일주문 = way 446665401(19.6 × 10.8 m), 나머지 = 조계사 둘레 안의 OSM building 넷
// (대설법전 · 한국불교역사문화기념관 · 이름 없는 둘), 나무 = natural=tree 점(백송 1그루 — Pinus bungeana 태그).
// 출처로 확인한 것(위키백과 ko 서울 조계사 대웅전): 앞면 7칸 · 옆면 4칸 단층 팔작지붕 · 공포가 기둥 위와 기둥 사이에 있는 다포양식 · 모든 벽에 꽃 모양 문살의 문 ·
// 1922년 전북 정읍에 지은 보천사 십일전을 1938년 옮긴 건물. 조계사 백송은 위키백과 ko 서울 조계사 백송 · OSM 점(Pinus bungeana)이 가리키는 한 그루.
// 근사(출처 못 찾음 · 값마다 "근사"): 윤곽에서 처마 폭 2.6 m 를 뺀 몸 크기 · 기둥 높이 6.2 m · 지붕 높이 5.6 m · 기단 1.5 m · 일주문 칸 수(3칸) · 지붕(팔작) · 높이 · 대설법전 · 기념관 · 이름 없는 건물 높이.
// 2차 보완(Codex 1차 지적): ① 대웅전 문을 검은 면이 아닌 연한 목재색(K.timber · 꽃살문 창호의 나무색 근사)으로 ② 십층 사리탑 · 회화나무를 대웅전 앞마당에 추가.
//   십층 사리탑 · 회화나무는 이름만 알려진 것이고 자리 · 크기 자료를 못 찾았다 — 대웅전 정면 앞마당(탑: 정면 가운데에서 남쪽 약 11 m · 나무: 정면 동쪽 끝 앞 약 12 m) · 탑 높이 약 11 m(기단 2벌 + 10층 + 상륜) · 층마다 줄어드는 네모 몸돌 + 지붕돌은 근사(층 수 열은 이름에서).
// 3차 보완(Codex 2차): 회화나무를 공용 나무(약 7 m)가 아닌 조계사 전용 거목으로. 제주불교신문 「식물에서 찾아보는 연화장세계 회화나무」(idxno=5209) 확인:
//   "서울 조계사 대웅전 앞마당에는 높이 24m, 둘레 4m에 이르는 회화나무" · 수령 약 450년 · 서울시 보호수. 높이 24 m · 둘레 4 m(지름 약 1.3 m)는 이 글의 값.
//   자리는 앞마당이라는 말뿐이라 근사(대웅전 정면 동쪽 끝 앞) · 수관 폭 약 20 m · 가지 · 잎 모양은 근사(둥근 덩어리 여럿).
// 4차: 수관 색은 녹청(K.copper)이 아니라 풀 재질(K.grass · 초록)로 — 잎 실물 색.
// 못 그린 것: 사리탑 부조 · 상륜 세부 · 대웅전 단청 무늬 · 꽃 문살 모양(칸마다 같은 창호) · 일주문 단청 · 대웅전 앞마당 석등 · 연등.
import { MeshWriter, K } from './monument_parts.mts';
import { JG_AT, JG_ORIGIN } from './monuments_data.mts';
import { JG_BUILDINGS } from './monuments_jogyesa_data.mts';
import { JG_TREES } from './monuments_jogyesa_trees_data.mts';
import { frameOf, rectOf, place, hall, FINE, MID } from './monuments_hanok.mts';
import { ptsOf, ccw, faceSouth, neutralBuilding, heightOf, revolve } from './monument_modern.mts';

const FRAME = frameOf(JG_AT, JG_ORIGIN);
export const trees = { at: JG_AT, data: JG_TREES };

function daeungjeon(w:MeshWriter, flat:number[]):void {
  const r = faceSouth(rectOf(flat, FRAME)); place(w, r);
  hall(w, { hx: r.len / 2 - 2.6, hy: r.wid / 2 - 2.6, podium: 1.5, lowPodium: [1.2, .6], body: 6.2, rise: 5.6, eave: 2.6, bays: [7, 4], steps: FINE, brackets: true, doors: true, doorsAll: true, doorKind: K.timber, stair: true, gable: .5 });   // 정면 7칸 · 측면 4칸 팔작 다포(위키) · 문은 연한 목재색(근사)
  w.xf = null;
}
function iljumun(w:MeshWriter, flat:number[]):void {
  const r = rectOf(flat, FRAME); place(w, r);
  hall(w, { hx: r.len / 2 - 1.3, hy: r.wid / 2 - 1.3, podium: .7, body: 3.6, rise: 2.8, eave: 1.5, bays: [3, 1], steps: MID, brackets: true, hollow: true });   // 기둥만 선 열린 문(칸 수 근사)
  w.xf = null;
}

// 십층 사리탑(근사): 네모 기단 둘 + 열 층(몸돌 + 지붕돌, 위로 갈수록 작게) + 상륜. 높이 약 11 m
const SARI_AT:[number, number] = [-26, -45];   // 대웅전 정면(남쪽 끝 y≈-34)에서 남쪽으로 약 11 m, 정면 가운데
function sariPagoda(w:MeshWriter):void {
  const [cx, cy] = SARI_AT;
  w.xf = null;
  w.box(cx - 3.1, cx + 3.1, cy - 3.1, cy + 3.1, 0, .5, K.stone, { bottom: true });
  w.box(cx - 2.5, cx + 2.5, cy - 2.5, cy + 2.5, .5, 1.1, K.granite, { bottom: true });
  let z = 1.1;
  for (let story = 0; story < 10; story++) {
    const body = 1.55 - story * .08, cap = body + .38, bodyHeight = .62 - story * .01;
    w.box(cx - body, cx + body, cy - body, cy + body, z, z + bodyHeight, K.granite, { bottom: true });
    z += bodyHeight;
    w.box(cx - cap, cx + cap, cy - cap, cy + cap, z, z + .2, K.stone, { bottom: true });
    z += .2;
  }
  w.box(cx - .22, cx + .22, cy - .22, cy + .22, z, z + 2.2, K.gilt, { bottom: true });
}
// 회화나무 거목(전용): 굵은 줄기 + 갈라지는 굵은 가지 셋 + 넓은 수관(타원체 덩어리 여럿). 높이 24 m(출처) · 둘레 4 m(출처) · 나머지 모양은 근사
const SOPHORA_AT:[number, number] = [-7, -48];
function ellipsoid(w:MeshWriter, cx:number, cy:number, cz:number, rx:number, rz:number, kind:number):void {
  const profile:[number, number][] = [];
  for (let step = 0; step <= 6; step++) { const phi = -Math.PI / 2 + Math.PI * step / 6; profile.push([Math.max(.05, rx * Math.cos(phi)), cz + rz * Math.sin(phi)]) }
  revolve(w, cx, cy, profile, kind, 14, 0, true);
}
function sophora(w:MeshWriter):void {
  const [cx, cy] = SOPHORA_AT;
  w.xf = null;
  revolve(w, cx, cy, [[1.05, 0], [.68, 1.2], [.62, 5], [.5, 8.5], [.4, 10.5]], K.timber, 10, 0, true);   // 줄기: 둘레 4 m 는 밑동 지름 약 1.3 m
  for (const [dx, dy] of [[-3.2, .6], [2.6, 2.4], [1.2, -3.1]] as const) {   // 굵은 가지: 줄기에서 갈라져 수관 아래로(기울인 마디 세 개)
    revolve(w, cx + dx * .35, cy + dy * .35, [[.34, 8.4], [.3, 10.2], [.22, 12]], K.timber, 6, 0, true);
    revolve(w, cx + dx * .8, cy + dy * .8, [[.26, 11.2], [.2, 13], [.14, 14.6]], K.timber, 6, 0, true);
  }
  ellipsoid(w, cx, cy, 14.2, 9.8, 4.6, K.grass);   // 가운데 큰 수관
  ellipsoid(w, cx - 6.4, cy + 2, 12.4, 5.4, 3.4, K.grass); ellipsoid(w, cx + 6.2, cy - 2.2, 12.8, 5.6, 3.5, K.grass); ellipsoid(w, cx + 1, cy + 6.2, 12.2, 5, 3.3, K.grass); ellipsoid(w, cx - 1.4, cy - 6.4, 12.5, 5.2, 3.3, K.grass);   // 옆 수관
  ellipsoid(w, cx + .6, cy + .4, 19.4, 6.6, 4.6, K.grass);   // 위 수관(꼭대기 약 24 m)
}
function buildHalls(w:MeshWriter):void {
  sariPagoda(w);
  sophora(w);
  const main = JG_BUILDINGS.find(each => each.name === '대웅전'); if (main) daeungjeon(w, main.p);
  const gate = JG_BUILDINGS.find(each => each.name === '일주문'); if (gate) iljumun(w, gate.p);
}
function buildFrames(w:MeshWriter):void {
  w.xf = null;
  for (const b of JG_BUILDINGS.filter(each => each.name !== '대웅전' && each.name !== '일주문')) neutralBuilding(w, ccw(ptsOf(b.p, FRAME)), heightOf(b, 5));   // 모양을 확인하지 못한 건물: 윤곽 · 높이만(근사)
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'jg-halls') buildHalls(w);
  else if (id === 'jg-frames') buildFrames(w);
  return new Float32Array(w.data);
}
