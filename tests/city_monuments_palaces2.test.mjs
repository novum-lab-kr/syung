// 덕수궁 · 창경궁 · 경희궁 · 운현궁 전용 모델: 메시 · 자리 · 나무 · 횃불 · 숨김 · 구역 화면 판정 · import 격리
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MONUMENTS, MONUMENT_HIDES, monumentsInView, monumentBuildingFilter, DSG_AT, DSG_ORIGIN, dsgRing, jmjRing, CGG_AT, CGG_ORIGIN, cggRing, GHG_AT, GHG_ORIGIN, ghgRing, hhmRing, UHG_AT, UHG_ORIGIN, uhgRing } from '../web/city/monuments_data.mts';
import * as deoksugung from '../web/city/monuments_deoksugung.mts';
import * as changgyeonggung from '../web/city/monuments_changgyeonggung.mts';
import * as gyeonghuigung from '../web/city/monuments_gyeonghuigung.mts';
import * as unhyeongung from '../web/city/monuments_unhyeongung.mts';
import { DSG_BUILDINGS } from '../web/city/monuments_deoksugung_data.mts';
import { CGG_BUILDINGS } from '../web/city/monuments_changgyeonggung_data.mts';
import { GHG_BUILDINGS } from '../web/city/monuments_gyeonghuigung_data.mts';
import { UHG_BUILDINGS } from '../web/city/monuments_unhyeongung_data.mts';
import { DSG_TREES } from '../web/city/monuments_deoksugung_trees_data.mts';
import { CGG_TREES } from '../web/city/monuments_changgyeonggung_trees_data.mts';
import { GHG_TREES } from '../web/city/monuments_gyeonghuigung_trees_data.mts';
import { UHG_TREES } from '../web/city/monuments_unhyeongung_trees_data.mts';

const STRIDE = 8;
const EARTH = 40075016.685578488, ORG = [126.978, 37.5665];
const mercX = (lng) => lng / 360 + .5, mercY = (lat) => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
const toM = (lng, lat) => { const unit = 1 / (EARTH * Math.cos(ORG[1] * Math.PI / 180)); return [(mercX(lng) - mercX(ORG[0])) / unit, (mercY(lat) - mercY(ORG[1])) / unit] };
const toLocalAt = ([lng, lat], at) => { const [ox, oy] = toM(at[0], at[1]), [x, y] = toM(lng, lat); return [x - ox, -(y - oy)] };
const contains = (poly, x, y) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside } return inside };
const segDist = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len)) : 0; return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) };
const lineDist = (x, y, line) => Math.min(...line.slice(0, -1).map((pt, i) => segDist(x, y, pt, line[i + 1])));
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const neighbors = fixture('palaces2_neighbors.json');

// 구역마다: 모듈 · 자료 · 기준점 · 숨김 · 시험할 둘레(터 둘레 + 둘레 밖 부속 터)
const ZONES = {
  deoksugung: { id: 'dsg', module: deoksugung, buildings: DSG_BUILDINGS, trees: DSG_TREES, at: DSG_AT, origin: DSG_ORIGIN, rings: () => [dsgRing(), jmjRing()], obstacles: 'deoksugung_obstacles.json', halls: [10, 30], torchesFile: 'deoksugung' },
  changgyeonggung: { id: 'cgg', module: changgyeonggung, buildings: CGG_BUILDINGS, trees: CGG_TREES, at: CGG_AT, origin: CGG_ORIGIN, rings: () => [cggRing()], obstacles: 'changgyeonggung_obstacles.json', halls: [10, 30], torchesFile: 'changgyeonggung' },
  gyeonghuigung: { id: 'ghg', module: gyeonghuigung, buildings: GHG_BUILDINGS, trees: GHG_TREES, at: GHG_AT, origin: GHG_ORIGIN, rings: () => [ghgRing(), hhmRing()], obstacles: 'gyeonghuigung_obstacles.json', halls: [8, 30], torchesFile: 'gyeonghuigung' },
  unhyeongung: { id: 'uhg', module: unhyeongung, buildings: UHG_BUILDINGS, trees: UHG_TREES, at: UHG_AT, origin: UHG_ORIGIN, rings: () => [uhgRing()], obstacles: 'unhyeongung_obstacles.json', halls: [6, 25], torchesFile: 'unhyeongung' },
};
const footprint = (zone, b) => Array.from({ length: b.p.length / 2 }, (_, i) => toLocalAt([zone.origin[0] + b.p[i * 2] / 1e6, zone.origin[1] + b.p[i * 2 + 1] / 1e6], zone.at));

for (const [name, zone] of Object.entries(ZONES)) {
  test(`${name}: 메시 정점이 모두 유한하고 법선이 단위 길이 · 높이와 정점 수가 휴대폰 한도 안`, () => {
    for (const part of ['wall', 'halls', 'frames']) {
      const data = zone.module.buildMonument(`${zone.id}-${part}`);
      assert.ok(data.length % STRIDE === 0, `${part} 정점 배열`);
      let maxZ = 0;
      for (let i = 0; i < data.length; i += STRIDE) {
        for (let k = 0; k < STRIDE; k++) assert.ok(Number.isFinite(data[i + k]), `${part} 유한 ${i}+${k}`);
        assert.ok(Math.abs(Math.hypot(data[i + 3], data[i + 4], data[i + 5]) - 1) < 1e-4, `${part} 법선 단위 길이`);
        maxZ = Math.max(maxZ, data[i + 2]);
      }
      assert.ok(data.length / STRIDE < 600000, `${part} 정점 수 ${data.length / STRIDE}`);
      if (part === 'halls') { assert.ok(data.length > 0, '전각이 있다'); assert.ok(maxZ > zone.halls[0] && maxZ < zone.halls[1], `전각 높이 ${maxZ}`) }
    }
    assert.equal(zone.module.buildMonument('다른-이름').length, 0);
  });

  test(`${name}: MONUMENTS 에 구역 이름으로 등록되고 지도 건물 자료가 있다 · 화면이 닿을 때만 받는다`, () => {
    const entries = MONUMENTS.filter(each => each.zone === name);
    assert.ok(entries.length >= 2, `등록 ${entries.length}`);
    assert.ok(zone.buildings.length >= 7 && zone.buildings.every(b => b.p.length % 2 === 0 && b.p.every(Number.isInteger)), '건물 자료는 정수 쌍');
    const box = (lng, lat) => { const x = (lng + 180) / 360, y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2; return [x - 1e-6, y - 1e-6, x + 1e-6, y + 1e-6] };
    assert.equal(monumentsInView(box(...zone.at), name), true);
    assert.equal(monumentsInView(box(127.1, 37.45), name), false);
    assert.equal(monumentsInView(box(129.0, 35.1)), false);
  });

  test(`${name} 숨김: 모델로 바꾼 건물은 숨기고 바로 옆 일반 건물은 숨기지 않는다(도시 팩 · 기본 모드 필터 모두)`, () => {
    const areas = MONUMENT_HIDES.filter(entry => entry.area).map(entry => entry.area), rings = monumentBuildingFilter()[1][1].coordinates;
    assert.ok(areas.length >= 4 && rings.length >= areas.length, '숨김 면 목록');
    const hideRings = MONUMENT_HIDES.map((entry, index) => ({ entry, ring: rings[index][0] })).filter(({ entry }) => entry.area);
    const hidden = (center) => hideRings.some(({ entry }) => contains(entry.area.map(pt => toLocalAt(pt, zone.at)), center[0], center[1]));
    let modelled = 0;
    for (const b of zone.buildings) {
      if (b.p.length < 6) continue;
      const foot = footprint(zone, b), center = [foot.reduce((sum, pt) => sum + pt[0], 0) / foot.length, foot.reduce((sum, pt) => sum + pt[1], 0) / foot.length];
      const anyVertex = foot.some(pt => hidden(pt));
      if (name === 'unhyeongung' || hidden(center) || anyVertex) { assert.ok(hidden(center) || anyVertex, `${b.name || b.id}: 모델이 서는 자리인데 지도 건물이 남는다`); modelled++ }
    }
    assert.ok(modelled >= 5, `숨긴 모델 건물 ${modelled}`);
    const list = neighbors[name]; assert.ok(list.length >= 10, `이웃 건물 ${list.length}`);
    for (const neighbor of list) {
      const pts = neighbor.p.map(pt => toLocalAt(pt, zone.at)), center = [pts.reduce((sum, pt) => sum + pt[0], 0) / pts.length, pts.reduce((sum, pt) => sum + pt[1], 0) / pts.length];
      assert.ok(!hidden(center), `${neighbor.name || neighbor.id}: 이웃 일반 건물이 숨김에 걸린다(도시 팩)`);
      for (const { ring } of hideRings) assert.ok(!neighbor.p.every(pt => contains(ring, pt[0], pt[1])), `${neighbor.name || neighbor.id}: 이웃 일반 건물이 숨김에 걸린다(기본 모드 필터)`);
    }
  });

  test(`${name} 나무: 쌍이 맞고 정수 · 건물 위 · 길 · 담장 · 연못 위에 없다`, () => {
    const trees = Object.entries(zone.trees).flatMap(([species, list]) => { assert.equal(list.length % 2, 0); assert.ok(list.every(Number.isInteger)); return Array.from({ length: list.length / 2 }, (_, i) => ({ species, x: list[i * 2] / 10, y: list[i * 2 + 1] / 10 })) });
    assert.ok(trees.length >= 3, `나무 수 ${trees.length}`);
    const feet = zone.buildings.filter(b => b.p.length >= 6).map(b => footprint(zone, b));
    const { paths, walls, ponds } = fixture(zone.obstacles);
    const toLine = (list) => list.map(pt => toLocalAt(pt, zone.at));
    for (const tree of trees) {
      const where = `${tree.species} ${tree.x},${tree.y}`;
      assert.ok(!feet.some(foot => contains(foot, tree.x, tree.y)), `건물 위 ${where}`);
      for (const path of paths) assert.ok(lineDist(tree.x, tree.y, toLine(path.p)) > path.half, `길 위 ${where}`);
      for (const wall of walls) assert.ok(lineDist(tree.x, tree.y, toLine(wall)) > 1, `담장 위 ${where}`);
      for (const pond of ponds) assert.ok(!contains(toLine(pond.outer), tree.x, tree.y), `물 위 ${where}`);
    }
  });

  test(`${name} 횃불: 좌우 한 쌍씩 · 건물 · 모델 기단 · 계단 · 담장 · 나무 위에 없고 구역 모듈이 내놓는다`, async () => {
    const mod = await import(`../web/city/monuments_${name}_torches_data.mts`);
    const data = Object.values(mod)[0];
    assert.equal(data.length % 4, 0, '좌우 한 쌍씩'); assert.ok(data.every(Number.isInteger));
    assert.deepEqual(zone.module.torches.at, zone.at); assert.equal(zone.module.torches.data, data);
    assert.deepEqual(zone.module.trees.at, zone.at);
    const torches = Array.from({ length: data.length / 2 }, (_, i) => ({ x: data[i * 2] / 10, y: data[i * 2 + 1] / 10 }));
    if (name === 'unhyeongung') { assert.equal(torches.length, 0, 'OSM 에 전각 앞 길이 없어 횃불은 비어 있다'); return }
    assert.ok(torches.length >= 8, `횃불 수 ${torches.length}`);
    const feet = zone.buildings.filter(b => b.p.length >= 6).map(b => footprint(zone, b));
    const { walls } = fixture(zone.obstacles);
    const trees = Object.values(zone.trees).flatMap(list => Array.from({ length: list.length / 2 }, (_, i) => ({ x: list[i * 2] / 10, y: list[i * 2 + 1] / 10 })));
    // 실제 모델의 높이 0.25 m 넘는 면(기단 · 계단 · 벽)
    const at = toM(zone.at[0], zone.at[1]), solid = [];
    for (const monument of MONUMENTS.filter(each => each.zone === name)) {
      const mesh = zone.module.buildMonument(monument.id), [mx, my] = toM(monument.lngLat[0], monument.lngLat[1]);
      const world = (i) => [mx + mesh[i] - at[0], -(my - mesh[i + 1] - at[1])];
      for (let i = 0; i < mesh.length; i += STRIDE * 3) if (Math.max(mesh[i + 2], mesh[i + STRIDE + 2], mesh[i + STRIDE * 2 + 2]) > .25) solid.push([world(i), world(i + STRIDE), world(i + STRIDE * 2)]);
    }
    const inTriangle = (px, py, [a, b, c]) => { const sign = (p, q) => (px - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (py - q[1]); const d1 = sign(a, b), d2 = sign(b, c), d3 = sign(c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) };
    for (const torch of torches) {
      const where = `${torch.x},${torch.y}`;
      assert.ok(!feet.some(foot => contains(foot, torch.x, torch.y)), `건물 위 ${where}`);
      for (const wall of walls) assert.ok(lineDist(torch.x, torch.y, wall.map(pt => toLocalAt(pt, zone.at))) > 1, `담장 위 ${where}`);
      assert.ok(!trees.some(tree => Math.hypot(tree.x - torch.x, tree.y - torch.y) < 1.2), `나무 위 ${where}`);
      const hit = solid.find(tri => inTriangle(torch.x, torch.y, tri) || [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]].some(([a, b]) => segDist(torch.x, torch.y, a, b) < 1));
      assert.ok(!hit, `기단 · 계단 · 벽 1 m 안 ${where}`);
    }
    for (let i = 0; i < torches.length; i += 2) {   // 쌍: 길 양쪽 같은 폭(두 횃불 사이가 길 폭 + 2.8 m) — 길 위 한 점의 양옆
      const gap = Math.hypot(torches[i].x - torches[i + 1].x, torches[i].y - torches[i + 1].y);
      assert.ok(gap > 3 && gap < 12, `쌍 간격 ${gap}`);
    }
  });
}

test('덕수궁 서양식 건물: 석조전 · 정관헌 · 돈덕전 · 중명전은 단청 없이 돌 · 벽돌 · 슬레이트 재질을 쓴다', () => {
  const halls = deoksugung.buildMonument('dsg-halls'), kinds = new Set();
  for (let i = 0; i < halls.length; i += STRIDE) kinds.add(halls[i + 6]);
  for (const [label, kind] of [['화강석', 0], ['슬레이트', 24], ['붉은 벽돌', 25]]) assert.ok(kinds.has(kind), `${label}(${kind}) 재질이 메시에 있다`);
  assert.ok(kinds.has(20), '창호');
  const dongdeokjeon = DSG_BUILDINGS.find(b => b.name === '돈덕전'), jungmyeong = DSG_BUILDINGS.find(b => b.name === '중명전'), seokjojeon = DSG_BUILDINGS.find(b => b.name === '석조전');
  assert.ok(dongdeokjeon && jungmyeong && seokjojeon, '서양식 건물 자리');
});
test('창경궁 대온실: 유리 재질이 메시에 있고(벽돌 · 한옥 단청 아님) 홍화문은 동쪽을 본다', () => {
  const halls = changgyeonggung.buildMonument('cgg-halls'), kinds = new Set();
  for (let i = 0; i < halls.length; i += STRIDE) kinds.add(halls[i + 6]);
  assert.ok(kinds.has(26), '유리(대온실)');
  assert.ok(CGG_BUILDINGS.some(b => b.name === '대온실') && CGG_BUILDINGS.some(b => b.name === '홍화문'));
});
// 어느 건물 안(바닥 윤곽 안쪽, margin 만큼 부풀림)에 있는 정점의 재질 · 높이 — 건물마다 재질을 따로 확인한다
const kindsInside = (zone, id, name, margin = 0) => {
  const building = zone.buildings.find(each => each.name === name); assert.ok(building, `${name} 자리`);
  const foot = footprint(zone, building), cx = foot.reduce((sum, pt) => sum + pt[0], 0) / foot.length, cy = foot.reduce((sum, pt) => sum + pt[1], 0) / foot.length;
  const grown = foot.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / d * margin, y + (y - cy) / d * margin] });
  const mesh = zone.module.buildMonument(id), kinds = new Map();
  for (let i = 0; i < mesh.length; i += STRIDE) if (contains(grown, mesh[i], mesh[i + 1])) kinds.set(mesh[i + 6], (kinds.get(mesh[i + 6]) ?? 0) + 1);
  return kinds;
};
const WESTERN_BANNED = [2, 3, 4, 7, 12, 20];   // 주칠 · 단청 · 검은 띠 · 상층 판문 · 문 안 · 한지 창호(한옥 창살) — 서양식 창에 쓰지 않는다
test('서양식 건물: 한지 창호(K.window) · 단청 없이 유리창(pane)을 쓴다 — 석조전 · 중명전 · 돈덕전 · 양관', () => {
  for (const [zone, id, name] of [[ZONES.deoksugung, 'dsg-halls', '석조전'], [ZONES.deoksugung, 'dsg-halls', '중명전'], [ZONES.deoksugung, 'dsg-halls', '돈덕전'], [ZONES.unhyeongung, 'uhg-halls', '운현궁 양관']]) {
    const kinds = kindsInside(zone, id, name, -.5);
    assert.ok(kinds.get(27) > 20, `${name}: 유리창(pane) ${kinds.get(27)}`);
    for (const banned of WESTERN_BANNED) assert.ok(!kinds.has(banned), `${name}: 한옥 재질 ${banned} 없음`);
  }
  assert.ok(kindsInside(ZONES.deoksugung, 'dsg-halls', '돈덕전', 3).has(28), '돈덕전 청록 창틀');
  assert.ok(kindsInside(ZONES.deoksugung, 'dsg-halls', '석조전', 6).has(1), '석조전 돌 난간 · 테라스');
});
test('덕수궁 정관헌: 막힌 벽돌 상자가 아니라 열린 열주(돌 기둥 줄) — 유리창 · 한옥 재질 없이 청록 지붕', () => {
  const kinds = kindsInside(ZONES.deoksugung, 'dsg-halls', '정관헌', 1);
  for (const banned of [...WESTERN_BANNED, 27, 26]) assert.ok(!kinds.has(banned), `재질 ${banned} 없음`);
  assert.ok(kinds.get(18) > 150, `돌 기둥 ${kinds.get(18)}`); assert.ok(kinds.get(28) > 20 && kinds.get(17) > 5, '청록 · 금빛 난간');
  assert.ok((kinds.get(25) ?? 0) < kinds.get(18), `벽돌(뒷벽 · 모서리)이 돌 기둥보다 적다 ${kinds.get(25)}`);
});
test('운현궁 노안당 · 노락당: 노안당은 몸채 6칸 + 직각 덧붙임 7칸(한 줄 13칸 아님) · 노락당 몸채 10칸', () => {
  assert.deepEqual(unhyeongung.CORE_PLAN, { noandang: { body: [6, 2], room: [5, 2], numaru: [2, 2] }, norakdang: { body: [10, 3] } });
  assert.equal(unhyeongung.CORE_PLAN.noandang.room[0] + unhyeongung.CORE_PLAN.noandang.numaru[0], 7, '덧붙임 7칸 = 방채 + 영화루'); assert.notEqual(unhyeongung.CORE_PLAN.noandang.body[0] + 7, 6, '합친 13칸이 아니다');
  // 덧붙임 자리(몸채 동쪽 끝에서 남쪽으로 돌출): 몸채 줄 남쪽 면보다 한참 남쪽에도 벽 높이의 정점이 있어야 한다
  const mesh = unhyeongung.buildMonument('uhg-halls');
  const cx = -1.4, cy = -5.3, ang = 15.9 * Math.PI / 180;   // 윤곽 날개 방향(코드의 r.ang 부호)
  const world = (a, b) => [cx + a * Math.cos(ang) - b * Math.sin(ang), cy + a * Math.sin(ang) + b * Math.cos(ang)];
  const probe = (a, b) => { const [x, y] = world(a, b); let top = 0; for (let i = 0; i < mesh.length; i += STRIDE) if (Math.hypot(mesh[i] - x, mesh[i + 1] - y) < 1.5) top = Math.max(top, mesh[i + 2]); return top };
  assert.ok(probe(7.8, -4) > 3, `방채 ${probe(7.8, -4)}`);
  assert.ok(probe(-10, -15) < 1, '몸채 서쪽 남쪽은 비어 있다(덧붙임은 동쪽 끝에만)');
});
test('운현궁 영화루: 벽 없는 열린 누마루 — 기둥 위 마루 · 난간 · 지붕, 벽 · 창 재질 없음(방채와 구분)', () => {
  const mesh = unhyeongung.buildMonument('uhg-halls'), cx = -1.4, cy = -5.3, ang = 15.9 * Math.PI / 180, cos = Math.cos(ang), sin = Math.sin(ang);
  const toAB = (x, y) => [(x - cx) * cos + (y - cy) * sin, -(x - cx) * sin + (y - cy) * cos];
  // 영화루 터: 몸채 동쪽 끝에서 6 m 폭 · 방채 남쪽 6.6 m (몸채 좌표 a 4.8..10.8 · b −15..−8.4) — 서쪽 가장자리(a<7.2)는 이웃 한옥 창이 겹쳐 뺀다
  const inRoom = (a, b) => a > 6.2 && a < 10.2 && b < -9.8 && b > -14.4, kinds = new Map();
  for (let i = 0; i < mesh.length; i += STRIDE) { const [a, b] = toAB(mesh[i], mesh[i + 1]); if (!inRoom(a, b) || mesh[i + 2] > 4.1) continue; const kind = mesh[i + 6];   // 4.1 m 위는 지붕(합각 벽 · 기와)
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1) }
  for (const wall of [19, 20, 12, 2, 3, 7]) assert.ok(!kinds.has(wall), `영화루에 벽 · 창 · 단청 재질 ${wall} 없음`);
  assert.ok(kinds.get(23) > 30, `원목 기둥 · 마루 · 난간 ${kinds.get(23)}`);
  // 마루는 땅에서 들려 있다(누하주 위): 영화루 터 안 원목 정점 중 마루 높이(1.4~1.8 m)에 있는 것이 있고, 그 아래(0.3~1.3 m)에는 가는 누하주 꼭짓점뿐이라 마루보다 훨씬 적다
  let under = 0, deck = 0, rail = 0; for (let i = 0; i < mesh.length; i += STRIDE) { const [a, b] = toAB(mesh[i], mesh[i + 1]); if (a < 4.6 || a > 11 || b > -8.6 || b < -15.4 || mesh[i + 6] !== 23) continue; const z = mesh[i + 2]; if (z > .3 && z < 1.3) under++; else if (z > 1.4 && z < 1.8) deck++; else if (z > 2.4 && z < 2.7) rail++ }
  assert.ok(deck >= 8 && rail >= 8 && under <= deck, `마루 ${deck} · 난간 ${rail} · 마루 밑 ${under}`);
  let roof = 0; for (let i = 0; i < mesh.length; i += STRIDE) { const [a, b] = toAB(mesh[i], mesh[i + 1]); if (inRoom(a, b) && mesh[i + 2] > 4.1 && mesh[i + 6] === 5) roof++ }
  assert.ok(roof > 20, `기와 지붕 ${roof}`);
});
test('운현궁 양관: 붉은 벽돌 상자가 아니라 밝은 외벽(cream) — 윤곽은 날개로 나눠 불규칙하게 짓는다', () => {
  const kinds = kindsInside(ZONES.unhyeongung, 'uhg-halls', '운현궁 양관', 2);
  assert.ok(!kinds.has(25), '붉은 벽돌 없음'); assert.ok(kinds.get(29) > 30, `밝은 외벽 ${kinds.get(29)}`);
});
test('운현궁 · 석어당: 단청 · 붉은 기둥 · 녹색 벽 · 녹색 처마 없이 원목(timber) 민가식 — 전각 · 윤곽 틀 모두', () => {
  const banned = [2, 3, 4, 7, 8, 10, 15];   // 주칠 · 단청 · 띠 · 판문 · 처마 끝 · 처마 밑 · 공포(녹색 · 붉은 것)
  const western = ['운현궁 양관', '유물전시관'];
  for (const id of ['uhg-halls', 'uhg-frames']) {
    const mesh = unhyeongung.buildMonument(id), feet = western.map(name => footprint(ZONES.unhyeongung, UHG_BUILDINGS.find(each => each.name === name)));
    const found = new Set(); let wood = 0;
    for (let i = 0; i < mesh.length; i += STRIDE) {
      if (feet.some(foot => contains(foot, mesh[i], mesh[i + 1]))) continue;
      if (banned.includes(mesh[i + 6])) found.add(mesh[i + 6]); if (mesh[i + 6] === 23) wood++;
    }
    assert.deepEqual([...found], [], `${id} 에 한옥 단청 재질 ${[...found]}`); assert.ok(wood > 100, `${id} 원목 ${wood}`);
  }
  const seoeodang = kindsInside(ZONES.deoksugung, 'dsg-halls', '석어당', 1);
  for (const kind of banned) assert.ok(!seoeodang.has(kind), `석어당 재질 ${kind} 없음`); assert.ok(seoeodang.get(23) > 100, '석어당 원목');
});
test('운현궁 노안당 · 노락당 · 이로당: OSM relation 8815075 윤곽에 원목 민가로 짓고 이로당은 마당을 비운다', () => {
  assert.ok(UHG_BUILDINGS.some(each => each.id === 634120500 && each.name === '노안당·노락당') && UHG_BUILDINGS.some(each => each.id === 414771657 && each.name === '이로당' && each.hole), '자료');
  for (const name of ['노안당·노락당', '이로당']) assert.ok(kindsInside(ZONES.unhyeongung, 'uhg-halls', name, 0).get(23) > 300, `${name} 원목`);
  const iro = UHG_BUILDINGS.find(each => each.name === '이로당'), mesh = unhyeongung.buildMonument('uhg-halls');
  const hole = footprint(ZONES.unhyeongung, { p: iro.hole }), cx = hole.reduce((sum, pt) => sum + pt[0], 0) / 4, cy = hole.reduce((sum, pt) => sum + pt[1], 0) / 4;
  const inner = hole.map(([x, y]) => [cx + (x - cx) * .5, cy + (y - cy) * .5]);
  for (let i = 0; i < mesh.length; i += STRIDE) if (contains(inner, mesh[i], mesh[i + 1])) assert.ok(mesh[i + 2] > 2.5, `이로당 마당 한가운데에 벽 · 기단이 있다 z=${mesh[i + 2]}`);
  const hides = MONUMENT_HIDES.filter(hide => hide.area && hide.lngLat === UHG_AT || false);
  assert.ok(hides.length >= 11, `숨김 윤곽 ${hides.length}`);
});
test('창경궁: 경춘전 7×4 · 양화당 6×4 · 숭문당 앞 4칸이고 숭문당은 동쪽을 보며 공포는 명정전에만 단다', () => {
  assert.deepEqual(changgyeonggung.BAYS['경춘전'], [7, 4]); assert.deepEqual(changgyeonggung.BAYS['양화당'], [6, 4]); assert.equal(changgyeonggung.BAYS['숭문당'][0], 4);
  const bracketCount = (name) => kindsInside(ZONES.changgyeonggung, 'cgg-halls', name, -1.5).get(15) ?? 0;
  assert.ok(bracketCount('명정전') > 30, '명정전 공포'); for (const name of ['경춘전', '양화당', '숭문당']) assert.equal(bracketCount(name), 0, `${name} 공포 없음`);
});
test('구역 모듈은 서로 · 경복궁 자료를 import 하지 않고 모드 이름도 묻지 않는다(첫 화면 import 깊이를 늘리지 않는다)', () => {
  const strip = (file) => readFileSync(new URL(`../web/city/${file}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  const files = ['monuments_deoksugung.mts', 'monuments_changgyeonggung.mts', 'monuments_gyeonghuigung.mts', 'monuments_unhyeongung.mts', 'monuments_palace_kit.mts', 'monuments_western.mts'];
  for (const file of files) {
    const source = strip(file);
    assert.ok(!/monuments_gyeongbok|monuments_palace_data|monuments_trees_data|monuments_torches_data|monuments_changdeokgung/.test(source), `${file}: 다른 구역 자료를 import 하지 않는다`);
    assert.ok(!/\b(simcity|joseon|coaster|retro|terran|zerg|protoss|nation)\b|modeCtl|\bmode\b/i.test(source), `${file}: 모드 이름 없음`);
  }
  const body = strip('monuments.mts');
  for (const file of ['deoksugung', 'changgyeonggung', 'gyeonghuigung', 'unhyeongung']) assert.ok(new RegExp(`import\\('\\./monuments_${file}\\.mts'\\)`).test(body), `${file} 은 import() 로만 부른다`);
  assert.ok(!/^import .*monuments_(deoksugung|changgyeonggung|gyeonghuigung|unhyeongung)/m.test(body), '정적 import 없음');
});
