// 서대문형무소 역사관(서울 구 서대문형무소 · 사적 제324호) 구역 — 옥사 · 중앙사 · 보안과청사 · 공작사 · 여공장 · 한센병사 · 사형장 · 격벽장 · 둘레 담 · 나무 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 건물 열일곱(이름이 붙은 것은 이름 그대로 · 없는 것은 짓지 않고 이름 없는 중립 건물로), 담 = barrier=wall(height=4) · 울타리 = barrier=fence 둘, 나무 = natural=tree 점 · 줄 · 숲 면.
// 출처로 확인한 것(위키백과 ko 서대문형무소 · 국가유산 설명): 보안과 청사는 1923년 지상 2층 · 지하 1층, 정면 지붕을 높고 웅장하게 세웠다 · 중앙사는 1920년대 중반 2층 · 9옥사는 1920년대 2층 ·
// 사형장은 지상 1층 · 지하 1층의 일본식 목조건물로 1916년 추정(5 m 담장이 둘러싼다). 옥사 · 중앙사 · 청사는 붉은 벽돌 건물(사진 · 현지 알림판 — 위키 본문에는 재료가 없다).
// 근사(출처 못 찾음 · 값마다 "근사"): 2층 건물 높이 7.4 m · 청사 8.6 m와 지붕 올림 · 공작사 6 m · 여공장 5.5 m · 한센병사 4.5 m · 여옥사 높이(옥사와 같게 7.4 m) · 사형장 높이 4.5 m와 지붕 · 지붕 슬레이트 색 · 창 간격 · 격벽장 담 높이 3 m ·
// 담 재료(붉은 벽돌 — 지도에 높이만 있다) · 이름 없는 건물 높이.
// 못 그린 것: 망루(어느 자료에도 자리가 없다) · 사형장을 둘러싼 5 m 담장(윤곽이 없다) · 격벽장 안 방사 칸막이 · 청사 정면 박공 · 옥사 복도 · 벽돌 줄눈 말고 세부 · 창살 · 지하층.
import { MeshWriter, K } from './monument_parts.mts';
import { SD_AT, SD_ORIGIN } from './monuments_data.mts';
import { SD_BUILDINGS, SD_WALLS } from './monuments_seodaemun_data.mts';
import { SD_TREES } from './monuments_seodaemun_trees_data.mts';
import { frameOf, rectOf, place, local } from './monuments_hanok.mts';
import { ccw, extrude, capPolygon, belt, edgeWindows, gableRoof, wallLine, fenceLine, neutralBuilding, heightOf } from './monument_modern.mts';
import type { P2 } from './monument_modern.mts';

const FRAME = frameOf(SD_AT, SD_ORIGIN);
export const trees = { at: SD_AT, data: SD_TREES };

// 이름 → 높이 · 지붕 올림 · 처마(근사 — 머리 주석). 이름 없는 건물은 중립
const BRICK:Record<string, { height:number; rise:number; eave:number }> = {
  '서대문형무소 역사관': { height: 8.6, rise: 4.4, eave: .7 },
  '중앙사': { height: 7.4, rise: 3, eave: .6 },
  '9옥사': { height: 7.4, rise: 3, eave: .6 },
  '10옥사': { height: 7.4, rise: 3, eave: .6 },
  '11옥사': { height: 7.4, rise: 3, eave: .6 },
  '12옥사': { height: 7.4, rise: 3, eave: .6 },
  '여옥사': { height: 7.4, rise: 3, eave: .6 },
  '공작사': { height: 6, rise: 2.6, eave: .6 },
  '여공장': { height: 5.5, rise: 2.4, eave: .6 },
  '한센병사': { height: 4.5, rise: 2, eave: .5 },
};
const pointsOf = (flat:number[]):P2[] => { const line:P2[] = []; for (let i = 0; i < flat.length; i += 2) line.push(local(SD_ORIGIN[0] + flat[i]! / 1e6, SD_ORIGIN[1] + flat[i + 1]! / 1e6, FRAME)); return line };

function brickBlock(w:MeshWriter, flat:number[], look:{ height:number; rise:number; eave:number }):void {
  const r = rectOf(flat, FRAME), pts = ccw(r.pts), { height } = look;
  w.xf = null;
  extrude(w, pts, 0, height, K.redBrick);
  belt(w, pts, 0, .6, K.stone, .1); belt(w, pts, height - .3, height + .1, K.stone, .12);
  capPolygon(w, pts, height + .1, K.slate);
  const floors = height > 6 ? 2 : 1, storey = height / floors;
  for (let floor = 0; floor < floors; floor++) edgeWindows(w, pts, { bay: 3.2, width: .95, z0: storey * floor + 1.2, z1: storey * floor + 2.7, arch: 'flat', pane: K.band, minEdge: 5 });   // 옥사 작은 창(불빛 없음)
  place(w, r);
  gableRoof(w, r.len / 2, r.wid / 2, height + .1, look.rise, look.eave, K.slate, K.redBrick);
  w.xf = null;
}
// 사형장: 일본식 목조 1층 — 판벽 + 기와 맞배(높이 · 지붕 근사). 한지 문이 아니라 판벽
function deathHouse(w:MeshWriter, flat:number[]):void {
  const r = rectOf(flat, FRAME);
  place(w, r);
  const hx = r.len / 2, hy = r.wid / 2;
  w.box(-hx, hx, -hy, hy, 0, .5, K.stone, { bottom: true });
  w.box(-hx + .1, hx - .1, -hy + .1, hy - .1, .5, 4.5, K.timber, { bottom: true });
  gableRoof(w, hx, hy, 4.5, 2.6, .8, K.giwa, K.timber);
  w.xf = null;
}
function buildHalls(w:MeshWriter):void {
  for (const b of SD_BUILDINGS) {
    const look = BRICK[b.name];
    if (look) brickBlock(w, b.p, look);
    else if (b.name === '사형장') deathHouse(w, b.p);
    else if (b.name === '격벽장') {   // 부채꼴 윤곽을 담으로만(안 칸막이는 못 그림)
      const ring = pointsOf(b.p); ring.push(ring[0]!);
      wallLine(w, ring, { half: .22, height: 3, kind: K.redBrick, cap: K.stone });
    }
  }
}
function buildFrames(w:MeshWriter):void {
  for (const b of SD_BUILDINGS) {
    if (BRICK[b.name] || b.name === '사형장' || b.name === '격벽장') continue;
    neutralBuilding(w, ccw(rectOf(b.p, FRAME).pts), heightOf(b, 4.5));   // 모양을 확인하지 못한 건물: 윤곽 · 높이만(근사)
  }
}
function buildWall(w:MeshWriter):void {
  w.xf = null;
  for (const wall of SD_WALLS) {
    const line = pointsOf(wall.p);
    if (wall.kind === 'fence') fenceLine(w, line);
    else wallLine(w, line, { half: .35, height: wall.h > 0 ? wall.h : 3, kind: K.redBrick, cap: K.stone });   // 높이는 OSM · 재료는 근사
  }
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'sd-wall') buildWall(w);
  else if (id === 'sd-halls') buildHalls(w);
  else if (id === 'sd-frames') buildFrames(w);
  return new Float32Array(w.data);
}
