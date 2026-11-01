// 탑골공원 구역(원각사지 십층석탑 + 유리 보호각 · 팔각정 · 삼일문 · 대원각사비 · 관리실 · 담) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 탑 = way 320791143(name=서울원각사지십층석탑, building 태그 없음 — 윤곽 12.2 × 11.9 m 는 보호각 자리), 팔각정 = 320791145, 삼일문 = 320791144, 비 = 320791141, 관리실 = 320791142, 담 = barrier=wall.
// 출처로 확인한 것(위키백과 ko 원각사지 십층석탑 · 국가유산포털 소개): 1467년 대리석 · 높이 약 12 m · 기단 3단이 위에서 보아 아(亞)자 모양 · 탑신 10층 — 1~3층은 기단과 같은 아자, 4층부터는 정사각형 ·
// 층마다 목조건축을 본뜬 지붕 · 공포 · 기둥 · 2000년 표면 훼손으로 유리 보호 장치를 씌움.
// 근사(출처 못 찾음 · 값마다 "근사"): 기단 · 층 높이와 폭의 나눔(합이 12 m 가 되게 맞춘 값) · 아자의 돌출 폭 · 보호각 높이 14.5 m 와 지붕 모양 · 살 간격 · 팔각정 높이 · 삼일문 칸 수 · 대원각사비 크기 · 담 높이와 재료 · 관리실 · 이름 없는 건물 높이.
// 보호각은 유리 면을 칠하지 않고(불투명하게 그리면 탑이 가려진다) 철골 살만 그린다 — 안이 보이는 투명 유리의 근사. 밤에도 살은 불빛을 켜지 않는다.
// 못 그린 것: 탑 표면 부조(용 · 사자 · 연꽃 · 인물) · 공포 세부 · 기단 모서리 아자 요철 · 비의 귀부 · 이수 무늬.
import { MeshWriter, K } from './monument_parts.mts';
import { WG_AT, WG_ORIGIN } from './monuments_data.mts';
import { WG_BUILDINGS, WG_WALLS } from './monuments_wongaksa_data.mts';
import { frameOf, rectOf, place, hall, MID } from './monuments_hanok.mts';
import { ptsOf, ccw, faceSouth, neutralBuilding, heightOf, revolve, wallLine } from './monument_modern.mts';
import type { P2 } from './monument_modern.mts';
import { toM } from './life.mts';

const FRAME = frameOf(WG_AT, WG_ORIGIN);
const local = (lng:number, lat:number):P2 => { const [mx, my] = toM(lng, lat); return [mx - FRAME.ox, -(my - FRAME.oy)] };
const byName = (name:string) => WG_BUILDINGS.find(each => each.name === name);

// ── 십층석탑 ───────────────────────────────────────────────────────────────────────────────────────────────
// 아(亞)자 평면(근사): 중앙 정사각 + 네 방향으로 뻗은 날개. half = 날개 끝까지 반폭
function plus(w:MeshWriter, half:number, z0:number, z1:number, kind:number):void {
  const core = half * .66, arm = half * .38;
  w.box(-core, core, -core, core, z0, z1, kind, { bottom: true });
  w.box(-half, half, -arm, arm, z0, z1, kind, { bottom: true });
  w.box(-arm, arm, -half, half, z0, z1, kind, { bottom: true });
}
// 지붕돌: 아래 넓은 처마에서 위로 좁아지는 낮은 네모뿔(목조 지붕을 본뜬 것 — 대리석이라 돌 색)
function roofStone(w:MeshWriter, half:number, z0:number, rise:number):void { w.frustum(0, 0, half, half, z0, half * .55, half * .55, z0 + rise, K.stone, { bottom: true }) }
function pagoda(w:MeshWriter):void {
  const base = [{ half: 4.6, height: 1.4 }, { half: 4.0, height: 1.2 }, { half: 3.4, height: 1.0 }];   // 기단 3단(합 3.6 m — 근사)
  let z = 0;
  for (const tier of base) { plus(w, tier.half, z, z + tier.height, K.stone); z += tier.height; w.box(-tier.half - .12, tier.half + .12, -tier.half - .12, tier.half + .12, z - .12, z, K.trim, { bottom: true }) }
  for (let storey = 1; storey <= 10; storey++) {
    const cross = storey <= 3, body = cross ? .72 : .46, roof = cross ? .38 : .24, half = cross ? 2.55 - (storey - 1) * .17 : 1.5 - (storey - 4) * .1;   // 1~3층 아자 · 4~10층 정사각(위키) — 폭 · 높이 근사
    if (cross) plus(w, half, z, z + body, K.stone); else w.box(-half, half, -half, half, z, z + body, K.stone, { bottom: true });
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) w.box(sx * half * (cross ? .66 : 1) - .06, sx * half * (cross ? .66 : 1) + .06, sy * half * (cross ? .66 : 1) - .06, sy * half * (cross ? .66 : 1) + .06, z, z + body, K.trim, { bottom: true, top: true });   // 모서리 기둥(목조 본뜸)
    z += body;
    roofStone(w, half + (cross ? .55 : .36), z, roof); z += roof;
  }
  w.box(-.1, .1, -.1, .1, z, z + .5, K.trim, {}); w.frustum(0, 0, .3, .3, z + .5, .08, .08, z + .95, K.trim);   // 꼭대기 장식(근사)
}
// 유리 보호각: 철골 살만(근사 — 머리 주석). 높이 14.5 m 근사 · 지붕은 낮은 우진각
function glassCase(w:MeshWriter, hx:number, hy:number):void {
  const height = 14.5, rail = .06, spacing = 1.9;
  const nx = Math.max(2, Math.round(hx * 2 / spacing)), ny = Math.max(2, Math.round(hy * 2 / spacing));
  for (let i = 0; i <= nx; i++) { const x = -hx + hx * 2 * i / nx; for (const y of [-hy, hy]) w.box(x - rail, x + rail, y - rail, y + rail, 0, height, K.shield, { bottom: true, top: true }) }
  for (let i = 1; i < ny; i++) { const y = -hy + hy * 2 * i / ny; for (const x of [-hx, hx]) w.box(x - rail, x + rail, y - rail, y + rail, 0, height, K.shield, { bottom: true, top: true }) }
  for (const z of [.15, height * .5, height]) {
    w.box(-hx, hx, -hy - rail, -hy + rail, z - rail, z + rail, K.shield, {}); w.box(-hx, hx, hy - rail, hy + rail, z - rail, z + rail, K.shield, {});
    w.box(-hx - rail, -hx + rail, -hy, hy, z - rail, z + rail, K.shield, {}); w.box(hx - rail, hx + rail, -hy, hy, z - rail, z + rail, K.shield, {});
  }
  const ridge = height + 1.3;   // 지붕 살: 네 귀 → 가운데 용마루 점(긴 쪽 가운데로 모이는 낮은 우진각)
  const tip = (sx:number):[number, number, number] => [sx * Math.max(0, hx - hy) * .9, 0, ridge];
  for (const [cx, cy] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as const) {
    const [tx, ty, tz] = tip(Math.sign(cx)), dx = tx - cx, dy = ty - cy, side = Math.hypot(dx, dy);
    if (side < .5) continue;
    w.quad([cx - dy / side * rail, cy + dx / side * rail, height], [cx + dy / side * rail, cy - dx / side * rail, height], [tx + dy / side * rail, ty - dx / side * rail, tz], [tx - dy / side * rail, ty + dx / side * rail, tz], K.shield, [0, 0, 1]);
  }
}
function buildPagodaCase(w:MeshWriter):void {
  const b = byName('서울원각사지십층석탑'); if (!b) return;
  const r = faceSouth(rectOf(b.p, FRAME));
  place(w, r);
  pagoda(w);
  glassCase(w, r.len / 2 - .2, r.wid / 2 - .2);
  w.xf = null;
}

// ── 팔각정 · 삼일문 · 비 ───────────────────────────────────────────────────────────────────────────────────
// 팔각정(OSM building=roof — 벽 없는 지붕 건물): 여덟 기둥 + 단청 띠 + 팔각 기와지붕. 높이 · 기둥 둘레는 근사
function octagonPavilion(w:MeshWriter, flat:number[]):void {
  const r = rectOf(flat, FRAME), radius = Math.min(r.len, r.wid) / 2 * .8;
  w.xf = { x: r.cx, y: r.cy, cos: 1, sin: 0 };
  revolve(w, 0, 0, [[radius * 1.1, 0], [radius * 1.1, .85]], K.granite, 8, Math.PI / 8);
  revolve(w, 0, 0, [[radius * 1.1, .85], [.02, .85]], K.stone, 8, Math.PI / 8);
  for (let k = 0; k < 8; k++) { const angle = Math.PI * 2 * k / 8 + Math.PI / 8; w.box(Math.cos(angle) * radius * .88 - .24, Math.cos(angle) * radius * .88 + .24, Math.sin(angle) * radius * .88 - .24, Math.sin(angle) * radius * .88 + .24, .85, 5.1, K.red, { bottom: true, top: true }) }
  revolve(w, 0, 0, [[radius * .94, 4.5], [radius * .94, 5.1]], K.dancheong, 8, Math.PI / 8);
  revolve(w, 0, 0, [[radius * 1.55, 4.9], [radius * 1.55, 5.2]], K.fascia, 8, Math.PI / 8);
  revolve(w, 0, 0, [[radius * 1.55, 5.2], [radius * .2, 8.3]], K.giwa, 8, Math.PI / 8);
  w.frustum(0, 0, .24, .24, 8.1, .06, .06, 9.2, K.stone);   // 꼭대기 장식(근사)
  w.xf = null;
}
function samilmun(w:MeshWriter, flat:number[]):void {
  const r = faceSouth(rectOf(flat, FRAME)); place(w, r);
  hall(w, { hx: r.len / 2 - 1.3, hy: r.wid / 2 - 1.3, podium: .6, body: 3.4, rise: 1.9, eave: 1.3, bays: [3, 1], steps: MID, hollow: true });   // 문루: 세 칸 · 벽 없이 열린 문(근사)
  w.xf = null;
}
function stele(w:MeshWriter, flat:number[]):void {
  const r = faceSouth(rectOf(flat, FRAME)); place(w, r);
  const hx = r.len / 2, hy = r.wid / 2;
  w.box(-hx, hx, -hy, hy, 0, .2, K.granite, { bottom: true });   // 낮은 돌 마당(윤곽 전체)
  w.box(-1.4, 1.4, -.8, .8, .2, .95, K.stone, { bottom: true });   // 받침(귀부 자리 — 거북 모양은 못 그림)
  w.box(-.85, .85, -.25, .25, .95, 4.4, K.stone, { bottom: true });   // 비신(크기 근사)
  w.frustum(0, 0, .95, .32, 4.4, .6, .22, 5.1, K.stone);   // 이수(머릿돌) 자리
  w.xf = null;
}

function buildHalls(w:MeshWriter):void {
  buildPagodaCase(w);
  const pavilion = byName('탑골공원 팔각정'); if (pavilion) octagonPavilion(w, pavilion.p);
  const gate = byName('삼일문'); if (gate) samilmun(w, gate.p);
  const monument = byName('서울원각사지대원각사비'); if (monument) stele(w, monument.p);
}
function buildFrames(w:MeshWriter):void {
  for (const b of WG_BUILDINGS.filter(each => ['', '탑골공원 관리실'].includes(each.name))) neutralBuilding(w, ccw(ptsOf(b.p, FRAME)), heightOf(b, 4.5));   // 모양을 확인하지 못한 건물: 윤곽 · 높이만(근사)
}
function buildWall(w:MeshWriter):void {
  for (const wall of WG_WALLS) {
    const line:P2[] = [];
    for (let i = 0; i < wall.p.length; i += 2) line.push(local(WG_ORIGIN[0] + wall.p[i]! / 1e6, WG_ORIGIN[1] + wall.p[i + 1]! / 1e6));
    wallLine(w, line, { half: .35, height: wall.h > 0 ? wall.h : 2.4, kind: K.stone, cap: K.trim });   // 높이 · 재료는 지도에 없다 — 근사
  }
}

export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'wg-wall') buildWall(w);
  else if (id === 'wg-halls') buildHalls(w);
  else if (id === 'wg-frames') buildFrames(w);
  return new Float32Array(w.data);
}
