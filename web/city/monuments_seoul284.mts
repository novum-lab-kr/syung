// 문화역서울 284(옛 서울역사) 구역 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): way 759569673(name=문화역서울284 · building:levels=3 · 36 꼭짓점 · 남북으로 긴 138.9 × 28 m — 동쪽으로 한 곳이 내밀어 중앙홀 자리).
// 출처로 확인한 것(위키백과 en Seoul Station · ko 문화역서울284): 1925년 준공 · 붉은 벽돌 건물 · 절충 양식 · 비잔틴풍 중앙 돔 · 가운데를 중심으로 한 좌우 대칭 배치 · 중앙홀 바닥은 화강암 · 벽은 인조석.
// 근사(출처 못 찾음 · 값마다 "근사"): 벽 높이 13.2 m · 층 띠 높이 · 둥근 아치 창의 크기 · 간격 · 돔 밑 반지름 6.5 m · 북통 높이 4.2 m · 돔 높이 5.5 m · 돔 자리(중앙홀 내민 부분 가운데) · 돔 색(녹청색 구리 — 사진에서 읽은 색) · 지붕 슬레이트 색.
// 지붕 윤곽(2차 보완 — 평평한 한 장으로 읽혀 고침): 몸통 길이 방향 슬레이트 맞배 + 동쪽으로 내민 두 곳(−48 · +14 m)에 가로 맞배 + 양쪽 끝 전각을 더 높고 가파른 지붕으로 + 중앙홀 앞에 아치 셋의 출입부(현관).
//   위키 구 서울역사: 지붕은 철골에 천연 슬레이트 · 일부 동판 이음 · 1층 거친 돌 마감. 지붕 형태 · 높이 · 현관 크기 · 아치 수(3)는 사진으로 읽은 근사(지면 자료 못 찾음).
// 못 그린 것: 좌우 끝의 작은 탑(윤곽 · 높이 자료 없음 — 끝 전각 지붕을 높여 높낮이만 살림) · 돔 북통의 창 · 벽돌 사이의 흰 돌 장식 무늬 · 중앙홀 안(가려진 곳).
import { MeshWriter, K } from './monument_parts.mts';
import { S2_AT, S2_ORIGIN } from './monuments_data.mts';
import { S2_BUILDINGS } from './monuments_seoul284_data.mts';
import { frameOf } from './monuments_hanok.mts';
import { ptsOf, ccw, extrude, capPolygon, belt, edgeWindows, revolve, dome, gableRoof } from './monument_modern.mts';
import type { P2 } from './monument_modern.mts';

const FRAME = frameOf(S2_AT, S2_ORIGIN);
const WALL = 13.2, DOME_AT:[number, number] = [6.6, -12.5], DRUM = 4.2, RADIUS = 6.5;

// 지붕은 맞배(gableRoof 가 용마루를 x 방향으로 만든다) — 중심 · 방향을 xf 로 놓고 짓는다
function roofAt(w:MeshWriter, [cx, cy]:P2, alongY:boolean, hx:number, hy:number, rise:number, eave:number):void {
  w.xf = { x: cx, y: cy, cos: alongY ? 0 : 1, sin: alongY ? 1 : 0 };
  gableRoof(w, hx, hy, WALL + .3, rise, eave, K.slate, K.redBrick);
  w.xf = null;
}
// 중앙홀 앞 현관(근사): 돌 띠를 두른 붉은 벽돌 덩어리에 둥근 아치 셋(유리), 위에 낮은 슬레이트 지붕
function portico(w:MeshWriter):void {
  const front = 13.9, depth = 3.2, half = 8, height = 10.6;
  const block:P2[] = [[front - .4, -12.5 - half], [front + depth, -12.5 - half], [front + depth, -12.5 + half], [front - .4, -12.5 + half]];
  w.xf = null;
  extrude(w, block, 0, height, K.redBrick);
  belt(w, block, 0, 1.2, K.stone, .1); belt(w, block, height - .6, height + .2, K.stone, .2);
  capPolygon(w, block, height + .2, K.stone);
  edgeWindows(w, block, { bay: 5.2, width: 3.4, z0: 1.8, z1: 8.6, arch: 'round', pane: K.pane, minEdge: 8, skip: (x) => x < front + depth - .3 });
  w.xf = { x: front + 1.4, y: -12.5, cos: 0, sin: 1 };
  gableRoof(w, half + .4, 2.2, height + .2, 2.4, .5, K.slate, K.redBrick);
  w.xf = null;
}

function station(w:MeshWriter):void {
  const b = S2_BUILDINGS[0]; if (!b) return;
  const pts = ccw(ptsOf(b.p, FRAME));
  w.xf = null;
  extrude(w, pts, 0, WALL, K.redBrick);
  belt(w, pts, 0, 1.2, K.stone, .12); belt(w, pts, 5.2, 5.55, K.stone, .1); belt(w, pts, 10.2, 10.5, K.stone, .1); belt(w, pts, WALL - .5, WALL + .3, K.stone, .28);   // 흰 돌 띠(사진 · 위키 인조석)
  capPolygon(w, pts, WALL + .3, K.slate);   // 지붕 밑 바닥(아래 지붕들이 덮는다 · 돔 밑은 이것이 지붕)
  roofAt(w, [-6.6, 0], true, 56, 7.9, 3.8, .7);   // 몸통 길이 방향 맞배
  roofAt(w, [-6.6, -63.5], false, 7.9, 6.1, 6.8, .7); roofAt(w, [-6.6, 63.3], false, 7.9, 6.2, 6.8, .7);   // 양쪽 끝 전각: 더 높고 가파른 지붕
  roofAt(w, [-4.3, -44], false, 10, 4.7, 3.2, .5); roofAt(w, [-3.5, 19.2], false, 11.4, 5.5, 3.4, .5);   // 동쪽으로 내민 두 곳의 가로 맞배
  portico(w);
  edgeWindows(w, pts, { bay: 4.4, width: 2, z0: 1.9, z1: 5.0, arch: 'round', pane: K.pane, minEdge: 5 });
  edgeWindows(w, pts, { bay: 4.4, width: 2, z0: 6.4, z1: 9.9, arch: 'round', pane: K.pane, minEdge: 5 });
  edgeWindows(w, pts, { bay: 4.4, width: 1.8, z0: 11, z1: 12.6, arch: 'flat', pane: K.pane, minEdge: 5 });
  const [cx, cy] = DOME_AT, z0 = WALL + .3;
  revolve(w, cx, cy, [[RADIUS + .5, z0], [RADIUS + .5, z0 + DRUM]], K.redBrick, 16, 0, false);   // 돔 밑 북통
  revolve(w, cx, cy, [[RADIUS + .75, z0 + DRUM - .5], [RADIUS + .75, z0 + DRUM + .2], [RADIUS, z0 + DRUM + .2]], K.stone, 16);
  dome(w, cx, cy, z0 + DRUM + .2, RADIUS, 5.5, K.copper, 24);
  w.box(cx - .15, cx + .15, cy - .15, cy + .15, z0 + DRUM + 5.5, z0 + DRUM + 7.2, K.copper, {});   // 꼭대기 작은 첨(근사)
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 's2-halls') station(w);
  return new Float32Array(w.data);
}
