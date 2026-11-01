// 명동성당 구역(본당 · 종탑 · 성당 안 나머지 건물) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 본당 = way 210335697(name=명동대성당 본당 · height=23 · 윤곽 60 × 30.7 m — 긴 축의 남동 끝이 반원 앱스, 북서 끝이 정면), 종탑 = way 1139745172(height=47 · 11.6 × 11 m — 정면 한가운데에 내민다).
// 출처로 확인한 것(위키백과 en Myeongdong Cathedral · ko 명동대성당): 1898년 준공 고딕 양식 · 붉은 벽돌과 회색 벽돌 · 라틴 십자 평면 · 뾰족 아치 창 · 높이 47 m 의 종탑 꼭대기 첨탑과 십자가 · 슬레이트 지붕.
// 근사(출처 못 찾음 · 값마다 "근사"): 옆 복도 벽 높이 10 m · 천장 높은 가운데 몸(고창)의 폭 20 m · 높이 15.5 m · 창 간격 · 버팀벽 간격 · 앱스 지붕 높이 · 종탑 몸통 30 m(위는 첨탑) · 첨탑 밑 반지름 · 이름 없는 건물 높이.
// 못 그린 것: 본당 양옆의 작은 첨탑(어느 자료에도 자리가 없다) · 정면 장미창 · 입구 문 세부 · 스테인드글라스 무늬 · 십자 평면의 날개(지도 윤곽은 직사각 + 앱스뿐).
import { MeshWriter, K } from './monument_parts.mts';
import { MD_AT, MD_ORIGIN } from './monuments_data.mts';
import { MD_BUILDINGS } from './monuments_myeongdong_data.mts';
import { frameOf, rectOf, place } from './monuments_hanok.mts';
import type { Rect } from './monuments_hanok.mts';
import { ptsOf, ccw, extrude, capPolygon, belt, edgeWindows, pilasters, gableRoof, spire, neutralBuilding, heightOf } from './monument_modern.mts';
import type { P2 } from './monument_modern.mts';

const FRAME = frameOf(MD_AT, MD_ORIGIN);
const NAVE_ID = 210335697, TOWER_ID = 1139745172;
const AISLE = 10, CLERE = 15.5, RIDGE = 23;   // 옆 복도 벽 · 가운데 몸 벽 · 용마루 높이(용마루 23 m 는 OSM height — 나머지 둘은 근사)

// 긴 축 위로 dx 만큼 옮긴 자리에 놓는다(본당 가운데 몸 지붕처럼 윤곽 가운데가 아닌 곳)
function placeAt(w:MeshWriter, r:Rect, dx:number):void { w.xf = { x: r.cx + dx * Math.cos(r.ang), y: r.cy + dx * Math.sin(r.ang), cos: Math.cos(r.ang), sin: Math.sin(r.ang) } }

function nave(w:MeshWriter):void {
  const b = MD_BUILDINGS.find(each => each.id === NAVE_ID); if (!b) return;
  const r = rectOf(b.p, FRAME), pts = ccw(r.pts), half = r.wid / 2, apse = -r.len / 2 + half;   // 앱스 중심 = 긴 축 남동 끝에서 반 폭만큼 안
  w.xf = null;
  extrude(w, pts, 0, AISLE, K.redBrick);
  belt(w, pts, 0, 1.1, K.stone, .12); belt(w, pts, AISLE - .3, AISLE + .1, K.stone, .16);
  capPolygon(w, pts, AISLE + .1, K.slate);
  edgeWindows(w, pts, { bay: 4.4, width: 1.7, z0: 3.2, z1: 8.8, arch: 'pointed', pane: K.pane, minEdge: 6 });
  pilasters(w, pts, 0, AISLE + .5, K.stone, { every: 6, width: .9, out: .6, minEdge: 8 });
  placeAt(w, r, 0);
  const x0 = apse, x1 = r.len / 2 - .2, mid = (x0 + x1) / 2, body = 10;   // 가운데 몸: 앱스 중심 ~ 정면
  w.box(x0, x1, -body, body, AISLE, CLERE, K.redBrick, {});
  edgeWindows(w, [[x0, -body], [x1, -body], [x1, body], [x0, body]], { bay: 4.4, width: 1.6, z0: AISLE + 1.2, z1: CLERE - .5, arch: 'pointed', pane: K.pane, minEdge: 8, skip: x => x < x0 + 2 });
  for (const side of [-1, 1]) w.quad([x0, side * (half + .4), AISLE + .1], [x1, side * (half + .4), AISLE + .1], [x1, side * body, CLERE - .3], [x0, side * body, CLERE - .3], K.slate, [0, side * -1, .55]);   // 옆 복도 낮은 지붕
  placeAt(w, r, mid);
  gableRoof(w, (x1 - x0) / 2, body, CLERE, RIDGE - CLERE, .4, K.slate, K.redBrick);   // 가운데 몸 맞배 지붕(처마 .4 m)
  placeAt(w, r, 0);
  const rim = half + .5, apexZ = AISLE + 9;   // 앱스 반원 원뿔 지붕: 긴 축 남동쪽 반만(근사 높이)
  const steps = 12;
  for (let k = 0; k < steps; k++) {
    const a0 = Math.PI / 2 + Math.PI * k / steps, a1 = Math.PI / 2 + Math.PI * (k + 1) / steps, mid2 = (a0 + a1) / 2;
    w.tri([apse + Math.cos(a0) * rim, Math.sin(a0) * rim, AISLE + .1], [apse + Math.cos(a1) * rim, Math.sin(a1) * rim, AISLE + .1], [apse, 0, apexZ], K.slate, [Math.cos(mid2) * 9, Math.sin(mid2) * 9, rim]);
  }
  w.xf = null;
}
function tower(w:MeshWriter):void {
  const b = MD_BUILDINGS.find(each => each.id === TOWER_ID); if (!b) return;
  const r = rectOf(b.p, FRAME), pts = ccw(r.pts), shaft = 30;   // 몸통 높이 근사 — 전체 47 m(OSM) 에서 첨탑을 뺀 값
  w.xf = null;
  extrude(w, pts, 0, shaft, K.redBrick);
  belt(w, pts, 0, 1.4, K.stone, .15); belt(w, pts, 10, 10.4, K.stone, .12); belt(w, pts, 20, 20.4, K.stone, .12); belt(w, pts, shaft - .5, shaft, K.stone, .35);
  capPolygon(w, pts, shaft, K.slate);
  edgeWindows(w, pts, { bay: 3.4, width: 1.2, z0: 3.8, z1: 8.6, arch: 'pointed', pane: K.pane, minEdge: 6 });
  edgeWindows(w, pts, { bay: 3.4, width: 1.2, z0: 21.4, z1: 28.2, arch: 'pointed', pane: K.pane, minEdge: 6 });
  pilasters(w, pts, 0, shaft + .4, K.stone, { every: 11, width: 1, out: .7, minEdge: 8 });
  place(w, r);
  spire(w, 0, 0, shaft, 4.6, 47 / 1.04 - shaft / 1.04, K.slate, K.stone);   // 첨탑: 꼭대기 십자까지 47 m
  w.xf = null;
}
function compound(w:MeshWriter):void {
  for (const b of MD_BUILDINGS) {
    if (b.id === NAVE_ID || b.id === TOWER_ID) continue;
    const pts:P2[] = ccw(ptsOf(b.p, FRAME));
    neutralBuilding(w, pts, heightOf(b, 6));   // 모양을 확인하지 못한 건물: 윤곽 · 높이만(근사)
  }
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'md-halls') { nave(w); tower(w) }
  else if (id === 'md-frames') compound(w);
  return new Float32Array(w.data);
}
