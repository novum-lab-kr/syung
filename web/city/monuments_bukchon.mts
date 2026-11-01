// 북촌 한옥마을 구역: 둘레 안 작은 집은 가벼운 한옥 틀(기단 + 회벽 몸 + 기와 맞배 — 공용 hall() 틀로 짓자 591동에 19 MB 라 휴대폰 한도를 넘어 이 구역 전용 가벼운 틀로 바꿨다), 그 밖 건물은 중립 건물.
// monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다. 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 둘레 안에 중심이 든 building 735동(monuments_bukchon_data.mts). 한옥 여부를 알리는 OSM 태그가 없어
// 면적 20~170 m² · 높이 8 m 미만 · 2층 이하 · 이름 없는 주택만 한옥 틀로 골랐다(근사 — 크기로 고른 값이라 한옥이 아닌 작은 집도, 개량 한옥도 섞인다). 둘레도 근사(monuments_data.mts BC_RING).
// 사진 · 치수를 못 찾아 한옥마다 지붕 높이 · 처마 · 칸 수는 공용 틀 값 그대로이고, 골목 · 담 · 마당 · 나무는 못 그렸다. 밤 횃불은 두지 않는다(길가 횃불 규칙을 걸 길 자료를 쓰지 않았다).
import { MeshWriter, K } from './monument_parts.mts';
import { BC_AT, BC_ORIGIN } from './monuments_data.mts';
import { BC_BUILDINGS } from './monuments_bukchon_data.mts';
import { frameOf, rectOf, place, clamp } from './monuments_hanok.mts';
import { ccw, neutralBuilding, heightOf, gableRoof } from './monument_modern.mts';

const FRAME = frameOf(BC_AT, BC_ORIGIN);

// 한옥 한 채(근사 — 높이 · 처마는 사진 비례 근사): 돌 기단 .4 m · 회벽 몸 3 m · 기와 맞배(긴 변이 용마루). 용마루 방향은 윤곽의 긴 변
function hanok(w:MeshWriter, flat:number[]):void {
  const r = rectOf(flat, FRAME);
  if (r.len * r.wid < 10) return;
  place(w, r);
  const hx = Math.max(1.2, r.len / 2 - .7), hy = Math.max(1, r.wid / 2 - .7), body = 3, rise = clamp(hy * .55 + .5, 1.1, 2.2);
  w.box(-hx - .3, hx + .3, -hy - .3, hy + .3, 0, .4, K.stone, { bottom: true });
  w.box(-hx, hx, -hy, hy, .4, .4 + body, K.plaster, { bottom: true, top: true });
  gableRoof(w, hx, hy, .4 + body, rise, .8, K.giwa, K.plaster);
  w.xf = null;
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'bc-halls') for (const each of BC_BUILDINGS) { if (each.name === '한옥') hanok(w, each.p) }
  else if (id === 'bc-frames') for (const each of BC_BUILDINGS) {
    if (each.name === '한옥' || each.p.length < 6) continue;
    const pts = ccw(rectOf(each.p, FRAME).pts);
    neutralBuilding(w, pts, heightOf(each, 8), { windows: false });   // 모양을 확인하지 못한 건물: 윤곽 · 높이만(근사 — 창 줄은 메모리 때문에 생략)
  }
  return new Float32Array(w.data);
}
