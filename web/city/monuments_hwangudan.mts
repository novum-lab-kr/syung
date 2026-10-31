// 환구단 구역(황궁우 · 석고 · 안 담 · 나머지 틀) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 황궁우 = building 487584156(historic=ruins · name=환구단, 지름 약 16.5 m 의 팔각 윤곽), 석고 = way 710255405(name=석고), 담 = barrier=wall 셋, 둘레 = 공원 경계 way 767869618, 나무 = 같은 둘레 안의 tree · wood.
// 출처로 확인한 것(위키백과 ko 황궁우 · 환구단): 황궁우는 1899년 환구단 북쪽에 세운 3층 팔각 건물 · 화강암 기단 · 내부 바닥은 벽돌 · 통층이고 3층은 각 면에 창 3개 · 중앙 위는 황색을 칠한 원추형 지붕(위키 글 — 그러나 지금 사진 · 위키미디어 커먼스 Hwangungu 사진들에서는 세 지붕 모두 어두운 회색 기와라 지금 실물을 따라 기와로 짓는다) ·
// 앞에 돌로 만든 북 석고 3개(용무늬 — 사진: 옆으로 눕힌 둥근 북 몸통 · 평평한 두 면 · 받침돌 위에 앉는다) · 현재 남은 것은 황궁우 · 석고 3개 · 석조 대문.
// 근사(출처 못 찾음 · 값마다 "근사"): 층 높이 · 처마 내밀기 · 기단 높이 · 1 · 2층 문 · 창 자리 · 석고 크기 · 받침 높이 · 셋의 배치(윤곽 긴 쪽에 고르게) · 안 담 높이와 돌 담(담 종류는 지도에 barrier=wall 만 있다).
// 못 그린 것: 용무늬 · 단청 · 칠조룡 천장 · 석조 대문(지도에 윤곽이 없다 — 2009년 복원된 것은 다른 곳) · 환구단 원형 제단(사라짐) · 기단 계단 세부.
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { HG_AT, HG_ORIGIN } from './monuments_data.mts';
import { HG_BUILDINGS, HG_WALLS, HG_SEOKGO } from './monuments_hwangudan_data.mts';
import { HG_TREES } from './monuments_hwangudan_trees_data.mts';
import { HG_TORCHES } from './monuments_hwangudan_torches_data.mts';
import { frameOf, rectOf, place, buildFrames } from './monuments_hanok.mts';
import { loft } from './monument_curves.mts';
import { toM } from './life.mts';

export const trees = { at: HG_AT, data: HG_TREES };
export const torches = { at: HG_AT, data: HG_TORCHES };
const FRAME = frameOf(HG_AT, HG_ORIGIN);
const local = (lng:number, lat:number):[number, number] => { const [mx, my] = toM(lng, lat); return [mx - FRAME.ox, -(my - FRAME.oy)] };

// ── 담 ─────────────────────────────────────────────────────────────────────────────────────────────────────
// 안 담(지도에 barrier=wall 로만 표시): 낮은 돌담으로 근사
function stoneWall(w:MeshWriter, line:[number, number][], halfWidth:number, height:number):void {
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!, len = Math.hypot(bx - ax, by - ay);
    if (len < .05) continue;
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (const sign of [-1, 1]) w.quad([ax + nx * halfWidth * sign, ay + ny * halfWidth * sign, 0], [bx + nx * halfWidth * sign, by + ny * halfWidth * sign, 0], [bx + nx * halfWidth * sign, by + ny * halfWidth * sign, height], [ax + nx * halfWidth * sign, ay + ny * halfWidth * sign, height], K.granite, [nx * sign, ny * sign, 0]);
    w.quad([ax - nx * halfWidth, ay - ny * halfWidth, height], [bx - nx * halfWidth, by - ny * halfWidth, height], [bx + nx * halfWidth, by + ny * halfWidth, height], [ax + nx * halfWidth, ay + ny * halfWidth, height], K.trim, [0, 0, 1]);
  }
}
function buildWall(w:MeshWriter):void {
  for (const flat of HG_WALLS) {
    const line:[number, number][] = [];
    for (let i = 0; i < flat.length; i += 2) line.push(local(HG_ORIGIN[0] + flat[i]! / 1e6, HG_ORIGIN[1] + flat[i + 1]! / 1e6));
    stoneWall(w, line, .35, 1.5);
  }
}

// ── 황궁우 ─────────────────────────────────────────────────────────────────────────────────────────────────
// 3층 팔각 · 화강암 기단 · 층마다 처마(통층이라 층 사이는 기둥만) · 중앙 위 황색 원추형 지붕. 3층 각 면 창 3개(위키)
const SIDES = 8;
const ring = (radius:number, z:number, turn = Math.PI / SIDES):V3[] => Array.from({ length: SIDES }, (_, k): V3 => [Math.cos(turn + Math.PI * 2 * k / SIDES) * radius, Math.sin(turn + Math.PI * 2 * k / SIDES) * radius, z]);
const mid = (k:number, turn = Math.PI / SIDES) => turn + Math.PI * 2 * (k + .5) / SIDES;
function wallBand(w:MeshWriter, radius:number, z0:number, z1:number, kind:number):void {
  const lo = ring(radius, z0), hi = ring(radius, z1);
  for (let k = 0; k < SIDES; k++) { const next = (k + 1) % SIDES; w.quad(lo[k]!, lo[next]!, hi[next]!, hi[k]!, kind, [Math.cos(mid(k)), Math.sin(mid(k)), 0]) }
}
function hwanggungu(w:MeshWriter, flat:number[]):void {
  const r = rectOf(flat, FRAME), base = Math.min(r.len, r.wid) / 2 * 1.02;   // 기단 외접 반지름: 윤곽 짧은 쪽 반
  place(w, { ...r, cx: r.cx, cy: r.cy, ang: 0 });
  const plinth = 1.1, storey = 3.3, wallR = base * .78;
  // 기단(화강암) + 벽돌 바닥은 안이라 생략
  const lo = ring(base, 0), hi = ring(base, plinth);
  for (let k = 0; k < SIDES; k++) { const next = (k + 1) % SIDES; w.quad(lo[k]!, lo[next]!, hi[next]!, hi[k]!, K.granite, [Math.cos(mid(k)), Math.sin(mid(k)), 0]) }
  w.quad(hi[0]!, hi[1]!, hi[2]!, hi[3]!, K.stone, [0, 0, 1]); w.quad(hi[0]!, hi[3]!, hi[4]!, hi[5]!, K.stone, [0, 0, 1]); w.quad(hi[0]!, hi[5]!, hi[6]!, hi[7]!, K.stone, [0, 0, 1]);
  for (let tier = 0; tier < 3; tier++) {
    const z0 = plinth + storey * tier, z1 = z0 + storey, radius = wallR - tier * .55;
    wallBand(w, radius, z0 + .1, z1 - .1, K.plaster);
    for (const p of ring(radius, z0)) w.box(p[0] - .22, p[0] + .22, p[1] - .22, p[1] + .22, z0, z1, K.red, { bottom: true, top: true });
    wallBand(w, radius + .04, z1 - .55, z1 - .1, K.dancheong);
    if (tier === 2) {   // 3층 각 면 창 셋(위키) — 밤 불빛이 비치는 곳
      for (let k = 0; k < SIDES; k++) {
        const angle = mid(k), face = radius * Math.cos(Math.PI / SIDES) + .06, side = radius * 2 * Math.sin(Math.PI / SIDES), pitch = side / 3.4;
        for (let n = -1; n <= 1; n++) {
          const along = n * pitch, half = pitch * .32, cx = Math.cos(angle) * face - Math.sin(angle) * along, cy = Math.sin(angle) * face + Math.cos(angle) * along, tx = -Math.sin(angle) * half, ty = Math.cos(angle) * half;
          w.quad([cx - tx, cy - ty, z0 + .8], [cx + tx, cy + ty, z0 + .8], [cx + tx, cy + ty, z1 - .9], [cx - tx, cy - ty, z1 - .9], K.window, [Math.cos(angle), Math.sin(angle), 0]);
        }
      }
    } else {   // 1 · 2층: 판문 한 짝씩(근사)
      for (let k = 0; k < SIDES; k++) {
        const angle = mid(k), face = radius * Math.cos(Math.PI / SIDES) + .06, half = radius * Math.sin(Math.PI / SIDES) * .35, cx = Math.cos(angle) * face, cy = Math.sin(angle) * face, tx = -Math.sin(angle) * half, ty = Math.cos(angle) * half;
        w.quad([cx - tx, cy - ty, z0 + .3], [cx + tx, cy + ty, z0 + .3], [cx + tx, cy + ty, z1 - 1.0], [cx - tx, cy - ty, z1 - 1.0], K.red, [Math.cos(angle), Math.sin(angle), 0]);   // 판문: 밤에 빛나지 않는 붉은 칠 나무(근사)
      }
    }
  }
  // 처마: 층마다 팔각 한 단(세 층 모두 기와 — 사진은 어두운 회색 기와, 맨 위는 원추)
  const eave = (radius:number, z:number, rise:number, tip:number, kind:number):void => {
    const out = ring(radius, z), inner = ring(tip, z + rise);
    for (let k = 0; k < SIDES; k++) {
      const next = (k + 1) % SIDES;
      w.quad(out[k]!, out[next]!, inner[next]!, inner[k]!, kind, [Math.cos(mid(k)) * .6, Math.sin(mid(k)) * .6, .8], k, k + 1, k + 1, k);
      w.quad([out[k]![0], out[k]![1], z - .25], [out[next]![0], out[next]![1], z - .25], out[next]!, out[k]!, K.fascia, [Math.cos(mid(k)), Math.sin(mid(k)), 0]);
    }
  };
  eave(wallR + 1.7, plinth + storey, 1.3, wallR - .1, K.giwa);
  eave(wallR - .55 + 1.6, plinth + storey * 2, 1.3, wallR - .65, K.giwa);
  const topZ = plinth + storey * 3;
  eave(wallR - 1.1 + 1.5, topZ, 3.4, .12, K.giwa);   // 원추형 지붕: 사진의 기와색(위키 글의 "황색"은 지금 실물에 없다)
  w.frustum(0, 0, .22, .22, topZ + 3.2, .05, .05, topZ + 4.6, K.stone);   // 꼭대기 장식(절병통형 — 크기 근사 · 사진의 돌색)
  w.xf = null;
}

// 석고: 윤곽(8 × 8 m 안팎) 위에 낮은 돌 단 + 돌북 셋(긴 쪽에 고르게). 돌북은 사진(위키미디어 커먼스 석고 사진)대로 옆으로 눕힌 둥근 몸통 — 마주 보는 두 면이 평평한 원이고 가운데가 부풀며(배) 받침돌 위에 앉는다. 지름 · 두께 · 받침 높이 근사
function drum(w:MeshWriter, cx:number, baseZ:number):void {
  const radius = .85, thick = .55, stand = .4, centerZ = baseZ + stand + radius;
  w.box(cx - thick * .9, cx + thick * .9, -.7, .7, baseZ, baseZ + stand, K.stone, { bottom: true });   // 받침돌
  // 몸통: 축이 x(줄 방향 — 사진에서 면이 서로 줄 쪽을 본다)인 북. 둘레(u)로 한 바퀴 · 세로(v)로 한쪽 면(−x) 가장자리 → 배(가장 불룩) → 반대 면 가장자리. 면 가장자리 반지름은 배의 .93
  const belly = (v:number) => radius * (.93 + .07 * Math.sin(Math.PI * v));
  loft(w, 8, 20, (v, u) => { const angle = Math.PI * 2 * u, r = belly(v); return [cx - thick + 2 * thick * v, Math.cos(angle) * r, centerZ + Math.sin(angle) * r] }, K.stone);
  for (const side of [-1, 1]) loft(w, 1, 20, (v, u) => { const angle = Math.PI * 2 * u, r = radius * .93 * (1 - v); return [cx + side * thick, Math.cos(angle) * r, centerZ + Math.sin(angle) * r] }, K.stone);   // 평평한 두 면(둥근 마개)
}
function seokgo(w:MeshWriter, flat:number[]):void {
  const r = rectOf(flat, FRAME);
  place(w, r);
  const hx = r.len / 2, hy = r.wid / 2;
  w.box(-hx, hx, -hy, hy, 0, .35, K.granite, { bottom: true });
  w.quad([-hx, -hy, .35], [hx, -hy, .35], [hx, hy, .35], [-hx, hy, .35], K.stone, [0, 0, 1]);
  for (let n = 0; n < 3; n++) drum(w, -hx + 2 * hx * (n + .5) / 3, .35);
  w.xf = null;
}

function buildHalls(w:MeshWriter):void {
  const main = HG_BUILDINGS.find(each => each.name === '환구단'); if (main) hwanggungu(w, main.p);
  seokgo(w, HG_SEOKGO);
}
function buildRest(w:MeshWriter):void {
  buildFrames(w, HG_BUILDINGS.filter(each => each.name !== '환구단'), [], FRAME);
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'hg-wall') buildWall(w);
  else if (id === 'hg-halls') buildHalls(w);
  else if (id === 'hg-frames') buildRest(w);
  return new Float32Array(w.data);
}
