// 기념물 전용 모델(광화문): 정점이 유한하고, 높이 · 폭이 자료(높이 19 m · 월대 48.7 × 29.7 m · 육축 31 m)와 맞는지
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildGwanghwamun, buildMonument } from '../web/city/monuments_gyeongbok.mts';
import { createModeRegistry } from '../web/modes/index.mts';
import basic from '../web/modes/basic/index.mts';
import simcity from '../web/modes/simcity/index.mts';
import joseon from '../web/modes/joseon/index.mts';
import coaster from '../web/modes/coaster/index.mts';
import retro from '../web/modes/retro/index.mts';
import starcraft from '../web/modes/starcraft/index.mts';
import nations from '../web/modes/nations/index.mts';
import * as dataModule from '../web/city/monuments_data.mts';
import { PALACE_TREES } from '../web/city/monuments_trees_data.mts';
import { PALACE_BUILDINGS } from '../web/city/monuments_gyeongbok_data.mts';
import { PALACE_AT, PALACE_ORIGIN, palaceRing } from '../web/city/monuments_data.mts';
import { withMonumentHides, MONUMENT_HIDES, monumentBuildingFilter, monumentsInView, MONUMENTS, CDG_AT, CDG_ORIGIN, cdgRing } from '../web/city/monuments_data.mts';
import { CDG_BUILDINGS } from '../web/city/monuments_changdeokgung_data.mts';
import { CDG_TREES } from '../web/city/monuments_changdeokgung_trees_data.mts';
import { MeshWriter, K } from '../web/city/monument_parts.mts';
import { body, ellipsoid, torus, bowl } from '../web/city/monument_curves.mts';
import { buildMonument as buildCdg } from '../web/city/monuments_changdeokgung.mts';

const STRIDE = 8;
test('광화문 메시: 정점이 모두 유한하고 법선이 단위 길이', () => {
  const data = buildGwanghwamun();
  assert.equal(data.length % (STRIDE * 3), 0);
  for (let i = 0; i < data.length; i += STRIDE) {
    for (let k = 0; k < STRIDE; k++) assert.ok(Number.isFinite(data[i + k]), `정점 ${i / STRIDE} 칸 ${k}`);
    assert.ok(Math.abs(Math.hypot(data[i + 3], data[i + 4], data[i + 5]) - 1) < 1e-3, `법선 ${i / STRIDE}`);
  }
});
test('광화문 메시: 월대 윗면에서 용마루 꼭대기 19 m · 월대 48.7 m × 29.7 m', () => {
  const data = buildGwanghwamun(); let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = 0, gateMinY = Infinity;
  for (let i = 0; i < data.length; i += STRIDE) {
    minX = Math.min(minX, data[i]); maxX = Math.max(maxX, data[i]); minY = Math.min(minY, data[i + 1]); maxY = Math.max(maxY, data[i + 1]); maxZ = Math.max(maxZ, data[i + 2]);
    if (Math.abs(data[i]) < 25) gateMinY = Math.min(gateMinY, data[i + 1]);
  }
  assert.ok(Math.abs(maxZ - (1.1 + 19)) < .05, `높이 ${maxZ}`);
  assert.ok(gateMinY <= -(13.3 / 2 + 29.7) && gateMinY > -(13.3 / 2 + 29.7 + 8), `월대 남쪽 끝 ${gateMinY}`);   // 월대 + 육축 깊이(+ 앞 계단 · 해치)
  assert.ok(minX > -30 && maxX < 30, `광화문 메시는 육축 · 월대만 — 담장은 palace-wall 이 짓는다 ${minX} … ${maxX}`);
});
test('기념물 자리 비우기: 항상 기존 팩에 덧붙인 복사본(같은 팩은 같은 복사본) · 원본은 그대로', () => {
  const pack = { landmarkHide: [{ lngLat: [126.9, 37.5], radiusM: 10, minH: 0 }] };
  const merged = withMonumentHides(pack);
  assert.notEqual(merged, pack); assert.equal(merged, withMonumentHides(pack));
  assert.equal(merged.landmarkHide.length, 1 + MONUMENT_HIDES.length); assert.equal(pack.landmarkHide.length, 1);
});
const heightOf = (id) => { const data = buildMonument(id); let top = 0; for (let i = 0; i < data.length; i += STRIDE) { assert.ok(Number.isFinite(data[i + 2])); top = Math.max(top, data[i + 2]); } return top; };
test('이순신 동상: 정점이 유한하고 받침 10.5 m + 동상 6.5 m = 약 17 m', () => {
  const data = buildMonument('yi-sunsin');
  assert.equal(data.length % (STRIDE * 3), 0);
  for (let i = 0; i < data.length; i += STRIDE) assert.ok(Math.abs(Math.hypot(data[i + 3], data[i + 4], data[i + 5]) - 1) < 1e-3);
  assert.ok(Math.abs(heightOf('yi-sunsin') - 17) < .6, `높이 ${heightOf('yi-sunsin')}`);
});
test('세종대왕 동상: 서울미래유산 공식값 — 기단 4.2 m + 동상 6.2 m = 총 10.4 m · 폭 4.3 m 안팎 · 정점이 유한하고 법선이 단위 길이', () => {
  const data = buildMonument('sejong');
  assert.equal(data.length % (STRIDE * 3), 0);
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < data.length; i += STRIDE) {
    for (let k = 0; k < STRIDE; k++) assert.ok(Number.isFinite(data[i + k]), `정점 ${i / STRIDE} 칸 ${k}`);
    assert.ok(Math.abs(Math.hypot(data[i + 3], data[i + 4], data[i + 5]) - 1) < 1e-3, `법선 ${i / STRIDE}`);
    if (data[i + 2] > 4.2 && data[i + 2] < 8) { minX = Math.min(minX, data[i]); maxX = Math.max(maxX, data[i]) }
  }
  assert.ok(Math.abs(heightOf('sejong') - 10.4) < .1, `높이 ${heightOf('sejong')}`);
  assert.ok(Math.abs((maxX - minX) - 4.3) < .6, `동상 폭 ${maxX - minX}`);   // 의자 폭이 공식 폭 4.3 m
});
test('이순신 동상: 좌표 · 법선 전체가 유한', () => {
  const data = buildMonument('yi-sunsin');
  for (let i = 0; i < data.length; i++) assert.ok(Number.isFinite(data[i]), `칸 ${i}`);
});
test('곡면 도우미: 그릇 바깥은 바깥으로 · 안쪽은 중심(속)으로 법선이 향하고, 통 마개는 평평한 법선이 따로다', () => {
  const bowlWriter = new MeshWriter(); bowl(bowlWriter, [0, 0, 1], 1, .1, K.gilt);
  let outerOk = 0, outerAll = 0, innerOk = 0, innerAll = 0;
  for (let i = 0; i < bowlWriter.data.length; i += STRIDE) {
    const [x, y, z, nx, ny, nz] = bowlWriter.data.slice(i, i + 6), radial = Math.hypot(x, y, z - 1), dot = nx * x + ny * y + nz * (z - 1);
    if (z - 1 > -.02) continue;   // 가장자리 띠는 위를 본다
    if (radial > .96) { outerAll++; if (dot > 0) outerOk++ } else if (radial < .94 && radial > .8) { innerAll++; if (dot < 0) innerOk++ }
  }
  assert.ok(outerAll > 100 && outerOk / outerAll > .95, `바깥 ${outerOk}/${outerAll}`);
  assert.ok(innerAll > 100 && innerOk / innerAll > .95, `안쪽 ${innerOk}/${innerAll}`);
  const column = new MeshWriter(); body(column, [[0, 0, 0, 1, 1], [0, 0, 2, 1, 1]], K.bronze);
  let flatCap = 0, sideBad = 0;
  for (let i = 0; i < column.data.length; i += STRIDE) {
    const [, , z, nx, ny, nz] = column.data.slice(i, i + 6);
    if (Math.abs(nz) > .999) flatCap++; else if (Math.abs(nz) > .05 && z > .01 && z < 1.99) sideBad++;
  }
  assert.ok(flatCap >= 20, `마개 법선 ${flatCap}`); assert.equal(sideBad, 0, '옆면 법선에 마개 방향이 섞였다');
});
test('곡면 도우미: 극점의 면적 0 삼각형이 없고 고리(torus)는 바깥을 향한다', () => {
  for (const make of [(w) => ellipsoid(w, [0, 0, 0], [1, 1, 1], K.gilt), (w) => bowl(w, [0, 0, 0], 1, .1, K.gilt), (w) => torus(w, [0, 0, 0], 2, .2, K.gilt), (w) => body(w, [[0, 0, 0, 1, 1], [0, 0, 2, 1, 1]], K.gilt)]) {
    const writer = new MeshWriter(); make(writer); const d = writer.data;
    for (let i = 0; i < d.length; i += STRIDE * 3) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = [d[i], d[i + 1], d[i + 2], d[i + STRIDE], d[i + STRIDE + 1], d[i + STRIDE + 2], d[i + STRIDE * 2], d[i + STRIDE * 2 + 1], d[i + STRIDE * 2 + 2]];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      assert.ok(Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > 1e-9, `면적 0 삼각형 ${i / STRIDE}`);
    }
  }
  const ring = new MeshWriter(); torus(ring, [0, 0, 0], 2, .2, K.gilt);
  let out = 0, all = 0;
  for (let i = 0; i < ring.data.length; i += STRIDE) { const [x, y, z, nx, ny, nz] = ring.data.slice(i, i + 6), r = Math.hypot(x, y); all++; if (nx * (x - x / r * 2) + ny * (y - y / r * 2) + nz * z > 0) out++ }
  assert.ok(out / all > .98, `고리 바깥 ${out}/${all}`);
});
test('세종 자리 비우기(고정 자료): 받침 위 건물 조각은 숨고, 이순신 · 광화문 · 주변 건물은 숨지 않는다', () => {
  const filter = monumentBuildingFilter(), ring = filter[1][1].coordinates[MONUMENT_HIDES.findIndex(each => each.lngLat[0] === 126.97691 && each.lngLat[1] === 37.57285)][0], [cx, cy] = [126.97691, 37.57285];
  const inside = ([lng, lat]) => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) hit = !hit } return hit };
  const meter = (east, north) => [cx + east / (111320 * Math.cos(cy * Math.PI / 180)), cy + north / 110574];
  assert.ok(inside(meter(0, 0)) && inside(meter(4, -3)), '받침 위');
  for (const [east, north] of [[40, 0], [-40, 0], [0, 40], [0, -40], [60, 60]]) assert.ok(!inside(meter(east, north)), `이웃 ${east},${north}`);
  assert.ok(!inside([126.97695, 37.57097]) && !inside([126.976817, 37.575928]), '이순신 · 광화문 자리');
});
test('동상 곡면 메시: 정점 수가 한도 안(휴대폰 버퍼 — 둘 합쳐 정점 6만 개 이하) · 동상은 곡면 법선(평면 법선만이 아니다)', () => {
  let total = 0;
  for (const id of ['yi-sunsin', 'sejong']) {
    const data = buildMonument(id), count = data.length / STRIDE; total += count;
    const normals = new Set();
    for (let i = 0; i < data.length; i += STRIDE) normals.add(`${data[i + 3].toFixed(2)},${data[i + 4].toFixed(2)},${data[i + 5].toFixed(2)}`);
    assert.ok(normals.size > 400, `${id} 서로 다른 법선 ${normals.size}`);
  }
  assert.ok(total < 60000, `정점 ${total}`);
});
test('동상 합치기: STATUES 따로 없이 MONUMENTS · MONUMENT_HIDES 한 곳에서 이순신 · 세종을 다룬다', () => {
  const ids = MONUMENTS.map((entry) => entry.id);
  assert.ok(ids.includes('yi-sunsin') && ids.includes('sejong'));
  assert.ok(!('STATUES' in dataModule) && !('STATUE_HIDES' in dataModule));
});
test('적용 모드: city.heritage 가 참인 모드만 문화유산 모델 — 일곱 모드 참, 기본 · 나라 모드 거짓', () => {
  const registry = createModeRegistry([basic, simcity, joseon, coaster, retro, ...starcraft, ...nations]);
  const yes = ['simcity', 'joseon', 'coaster', 'retro', ...starcraft.map((mode) => mode.id)], no = ['basic', ...nations.map((mode) => mode.id)];
  for (const id of yes) assert.equal(registry.settings(id).city.heritage, true, id);
  for (const id of no) assert.equal(registry.settings(id).city.heritage, false, id);
  assert.equal(yes.length, 7);
});
test('고정 규칙: 모드 설정에는 기념물 이름이 없고 heritage 칸(참 · 거짓)만 있다', () => {
  const dir = new URL('../web/modes/', import.meta.url);
  const walk = (url) => readdirSync(url, { withFileTypes: true }).flatMap((ent) => ent.isDirectory() ? walk(new URL(`${ent.name}/`, url)) : [new URL(ent.name, url)]);
  for (const file of walk(dir)) {
    if (!/\.m[jt]s$/.test(file.pathname)) continue;
    assert.ok(!/monuments/i.test(readFileSync(file, 'utf8')), `${file.pathname} 가 기념물을 건드린다`);
  }
});
test('고정 규칙: 기념물 모듈은 모드를 import 하지 않고 그리기 입구는 모드 · 테마 값을 받지 않는다', () => {
  for (const name of ['monuments.mts', 'monuments_data.mts', 'monument_parts.mts', 'monuments_gyeongbok.mts', 'monuments_palace.mts', 'monuments_changdeokgung.mts', 'monument_trees.mts', 'monuments_sungnyemun.mts', 'monuments_heunginjimun.mts', 'monuments_gates.mts']) {
    assert.ok(!/from\s+['"][^'"]*modes\//.test(readFileSync(new URL(`../web/city/${name}`, import.meta.url), 'utf8')), `${name} 가 modes 를 import`);
  }
  const src = readFileSync(new URL('../web/city/landmarks.mts', import.meta.url), 'utf8');
  const sig = src.slice(src.indexOf('renderMonuments('), src.indexOf('{', src.indexOf('renderMonuments(')));
  assert.ok(!/look|mode|theme/i.test(sig), `renderMonuments 입구 ${sig}`);
});
test('고정 규칙: 어떤 팩이든 기념물 자리 비우기가 붙는다', () => {
  for (const pack of [{ landmarkHide: [] }, { landmarkHide: undefined }, {}]) {
    const merged = withMonumentHides(pack);
    for (const hide of MONUMENT_HIDES) assert.ok(merged.landmarkHide.includes(hide));
  }
});
test('고정 규칙: 지도 건물 층 필터는 자리 비우기마다 감싸는 다각형을 갖는다(경복궁은 둘레 그대로)', () => {
  const filter = monumentBuildingFilter();
  assert.equal(filter[0], '!'); assert.equal(filter[1][0], 'within');
  const { coordinates } = filter[1][1];
  assert.equal(coordinates.length, MONUMENT_HIDES.length);
  for (const [ring] of coordinates) assert.deepEqual(ring[0], ring[ring.length - 1]);
  assert.equal(coordinates.filter(([ring]) => ring.length === 17).length, MONUMENT_HIDES.length - 2);   // 사각 열여섯 각형이 아닌 것 = 경복궁 · 창덕궁 둘레
});

// ── 경복궁 둘레 담장 · 궁 안 건물 ──
const palaceFinite = (id) => {
  const data = buildMonument(id); assert.ok(data.length > 0 && data.length % (STRIDE * 3) === 0, `${id} 길이`);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = 0;
  for (let i = 0; i < data.length; i += STRIDE) {
    for (let k = 0; k < STRIDE; k++) assert.ok(Number.isFinite(data[i + k]), `${id} 정점 ${i / STRIDE} 칸 ${k}`);
    assert.ok(Math.abs(Math.hypot(data[i + 3], data[i + 4], data[i + 5]) - 1) < 1e-3, `${id} 법선`);
    minX = Math.min(minX, data[i]); maxX = Math.max(maxX, data[i]); minY = Math.min(minY, data[i + 1]); maxY = Math.max(maxY, data[i + 1]); maxZ = Math.max(maxZ, data[i + 2]);
  }
  return { data, minX, maxX, minY, maxY, maxZ };
};
test('경복궁 담장: 둘레를 한 바퀴(동서 약 500 m · 남북 약 700 m) · 높이는 마루 4.8 m 이하', () => {
  const wall = palaceFinite('palace-wall');
  assert.ok(wall.maxX - wall.minX > 400 && wall.maxX - wall.minX < 650, `동서 ${wall.maxX - wall.minX}`);
  assert.ok(wall.maxY - wall.minY > 600 && wall.maxY - wall.minY < 900, `남북 ${wall.maxY - wall.minY}`);
  assert.ok(wall.maxZ < 5 && wall.maxZ > 4, `높이 ${wall.maxZ}`);
});
test('경복궁 궁 안 건물: 전용 모델 여덟 + 한옥 틀이 모두 유한하고 둘레 안 · 근정전이 가장 높은 지붕 축에 든다', async () => {
  const { PALACE_BUILDINGS } = await import('../web/city/monuments_gyeongbok_data.mts');
  for (const name of ['흥례문', '근정문', '근정전', '사정전', '강녕전', '교태전', '경회루', '향원정']) assert.ok(PALACE_BUILDINGS.some((b) => b.name === name), `${name} 자리가 지도 자료에 없다`);
  const halls = palaceFinite('palace-halls'), frames = palaceFinite('palace-frames');
  assert.ok(halls.maxZ > 15 && halls.maxZ < 40, `전각 높이 ${halls.maxZ}`);
  assert.ok(frames.maxZ < 14, `한옥 틀 높이 ${frames.maxZ}`);
  assert.ok(halls.data.length / STRIDE < 900000 && frames.data.length / STRIDE < 900000, '정점 수(휴대폰 메모리)');
});

// ── 궁 안 나무 ─────────────────────────────────────────────────────────────────────────────────────────────
// 자리 자료(0.1 m 정수, PALACE_AT 기준 동 · 북)를 그리는 쪽과 같은 좌표(life.mts toM — 메르카토르 미터)로 놓고 둘레 · 건물 · 길 · 연못 · 담장과 견준다
const { toM } = await import('../web/city/life.mts');
const AT = toM(PALACE_AT[0], PALACE_AT[1]);
const toLocal = ([lng, lat]) => { const [x, y] = toM(lng, lat); return [x - AT[0], -(y - AT[1])] };   // 동 · 북(+) — 나무 자료와 같은 방향
const contains = (poly, x, y) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside } return inside };
const segDist = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy, t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) };
const lineDist = (x, y, line) => Math.min(...line.slice(0, -1).map((pt, i) => segDist(x, y, pt, line[i + 1])));
const edgeDist = (x, y, poly) => lineDist(x, y, [...poly, poly[0]]);
const allTrees = () => Object.entries(PALACE_TREES).flatMap(([species, list]) => Array.from({ length: list.length / 2 }, (_, i) => ({ species, x: list[i * 2] / 10, y: list[i * 2 + 1] / 10 })));

test('궁 안 나무: 수종 넷(소나무 · 활엽 둘 · 감나무), 쌍이 맞고 유한하며 소나무 · 활엽이 수백 그루', () => {
  assert.deepEqual(Object.keys(PALACE_TREES).sort(), ['broad', 'persimmon', 'pine', 'wide']);
  for (const list of Object.values(PALACE_TREES)) { assert.equal(list.length % 2, 0); assert.ok(list.every(Number.isInteger)) }
  assert.ok(PALACE_TREES.pine.length / 2 > 100 && PALACE_TREES.broad.length / 2 + PALACE_TREES.wide.length / 2 > 300);
  assert.ok(PALACE_TREES.persimmon.length / 2 >= 1 && PALACE_TREES.persimmon.length / 2 <= 5);
});

test('궁 안 나무: 모두 경복궁 둘레 안이고 건물 자리 위에는 없다(그리는 쪽 좌표)', () => {
  const ring = palaceRing().map(toLocal);
  const footprints = PALACE_BUILDINGS.map(b => Array.from({ length: b.p.length / 2 }, (_, i) => toLocal([PALACE_ORIGIN[0] + b.p[i * 2] / 1e6, PALACE_ORIGIN[1] + b.p[i * 2 + 1] / 1e6])));
  for (const tree of allTrees()) {
    assert.ok(contains(ring, tree.x, tree.y), `둘레 밖 ${tree.species} ${tree.x},${tree.y}`);
    assert.ok(!footprints.some(foot => contains(foot, tree.x, tree.y)), `건물 위 ${tree.species} ${tree.x},${tree.y}`);
  }
});

test('궁 안 나무: 길 · 담장 위에 없고 연못 물 위에도 없다(경회루 당주 섬 소나무만 물 안 섬)', () => {
  const { paths, walls, ponds } = JSON.parse(readFileSync(new URL('./fixtures/palace_obstacles.json', import.meta.url), 'utf8'));
  const toLine = (list) => list.map(toLocal);
  const roads = paths.map(path => ({ half: path.half, line: toLine(path.p) })), fences = walls.map(toLine);
  const lakes = ponds.map(pond => ({ outer: toLine(pond.outer), inner: pond.inner.map(toLine) }));
  for (const tree of allTrees()) {
    const where = `${tree.species} ${tree.x},${tree.y}`;
    for (const road of roads) assert.ok(lineDist(tree.x, tree.y, road.line) > road.half, `길 위 ${where}`);
    for (const fence of fences) assert.ok(lineDist(tree.x, tree.y, fence) > 1, `담장 위 ${where}`);
    for (const lake of lakes) {
      if (!contains(lake.outer, tree.x, tree.y)) continue;
      assert.ok(lake.inner.some(island => contains(island, tree.x, tree.y)), `물 위 ${where}`);
      assert.equal(tree.species, 'pine', `섬 위에는 소나무만 ${where}`);
    }
  }
});

test('궁 안 나무: 경회지 안쪽 섬의 소나무가 있고 전용 나무 그리기는 모드 이름을 묻지 않는다', () => {
  const near = PALACE_TREES.pine.filter((_, i) => i % 2 === 0).some((x, i) => Math.hypot(x / 10 + 150, PALACE_TREES.pine[i * 2 + 1] / 10 - 69) < 6);
  assert.ok(near, '경회루 당주 섬 소나무');
  const source = readFileSync(new URL('../web/city/monument_trees.mts', import.meta.url), 'utf8');
  assert.ok(!/simcity|joseon|coaster|retro|terran|zerg|protoss|nation/i.test(source.replace(/\/\/.*$/gm, '')), '모드 이름 없음');
  const life = readFileSync(new URL('../web/city/life.mts', import.meta.url), 'utf8');
  assert.ok(life.includes('treeKeepOut') && life.includes('!keepOut?.(x, y)'), '도시 나무 비켜 가기');
});

// ── 창덕궁 ─────────────────────────────────────────────────────────────────────────────────────────────────
const cdgFinite = (id) => {
  const data = buildCdg(id); let maxZ = 0;
  assert.ok(data.length > 0 && data.length % STRIDE === 0, `${id} 정점 수`);
  for (let i = 0; i < data.length; i += STRIDE) {
    for (let k = 0; k < STRIDE; k++) assert.ok(Number.isFinite(data[i + k]), `${id} 유한 ${i}+${k}`);
    assert.ok(Math.abs(Math.hypot(data[i + 3], data[i + 4], data[i + 5]) - 1) < 1e-4, `${id} 법선 단위 길이`);
    maxZ = Math.max(maxZ, data[i + 2]);
  }
  return { data, maxZ };
};
test('창덕궁 구역: 지도 자료에 전각이 있고 둘레 안에 든다(돈화문 · 인정전 · 선정전 · 희정당 · 대조전 · 낙선재 · 후원 정자)', () => {
  for (const name of ['돈화문', '인정전', '선정전', '희정당', '대조전', '낙선재', '주합루', '부용정', '애련정', '연경당', '관람정', '존덕정', '청의정']) assert.ok(CDG_BUILDINGS.some((b) => b.name === name), `${name} 자리가 지도 자료에 없다`);
  const ring = cdgRing().map((pt) => toLocalAt(pt, CDG_AT));
  for (const b of CDG_BUILDINGS) {
    const cx = b.p.filter((_, i) => i % 2 === 0).reduce((sum, v) => sum + v, 0) / (b.p.length / 2), cy = b.p.filter((_, i) => i % 2 === 1).reduce((sum, v) => sum + v, 0) / (b.p.length / 2);
    const [x, y] = toLocalAt([CDG_ORIGIN[0] + cx / 1e6, CDG_ORIGIN[1] + cy / 1e6], CDG_AT);
    assert.ok(contains(ring, x, y), `둘레 밖 ${b.name || b.id}`);
  }
});
test('창덕궁 담장 · 전각 · 한옥 틀: 정점이 유한하고 법선이 단위 길이, 높이와 정점 수가 한도 안', () => {
  const wall = cdgFinite('cdg-wall'), halls = cdgFinite('cdg-halls'), frames = cdgFinite('cdg-frames');
  assert.ok(wall.maxZ > 4 && wall.maxZ < 5, `담장 높이 ${wall.maxZ}`);
  assert.ok(halls.maxZ > 12 && halls.maxZ < 40, `전각 높이 ${halls.maxZ}`);
  assert.ok(frames.maxZ < 14, `한옥 틀 높이 ${frames.maxZ}`);
  assert.ok(wall.data.length / STRIDE < 200000 && halls.data.length / STRIDE < 500000 && frames.data.length / STRIDE < 500000, '정점 수(휴대폰 메모리)');
});
test('창덕궁: 선정전은 청기와, 청의정은 초가(그 종류가 메시에 들어 있다) · 인정전 용마루 금빛 장식', () => {
  const kinds = new Set(); const halls = cdgFinite('cdg-halls').data;
  for (let i = 0; i < halls.length; i += STRIDE) kinds.add(halls[i + 6]);
  for (const kind of [20, 21, 22, 17]) assert.ok(kinds.has(kind), `종류 ${kind} 없음`);
});
test('창덕궁 구역은 화면이 닿을 때만: 경복궁만 보이면 창덕궁은 거짓 · 창덕궁만 보이면 경복궁은 거짓', () => {
  const box = (lng, lat) => { const x = (lng + 180) / 360, y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2; return [x - 1e-6, y - 1e-6, x + 1e-6, y + 1e-6] };
  assert.equal(monumentsInView(box(126.9770, 37.5760), 'changdeokgung'), false);
  assert.equal(monumentsInView(box(126.9770, 37.5760), 'gyeongbok'), true);
  assert.equal(monumentsInView(box(126.991, 37.5825), 'changdeokgung'), true);
  assert.equal(monumentsInView(box(126.991, 37.5825)), true);
  assert.equal(monumentsInView(box(127.1, 37.45)), false);
});
const toLocalAt = ([lng, lat], at) => { const [ox, oy] = toM(at[0], at[1]), [x, y] = toM(lng, lat); return [x - ox, -(y - oy)] };
const cdgTrees = () => Object.entries(CDG_TREES).flatMap(([species, list]) => Array.from({ length: list.length / 2 }, (_, i) => ({ species, x: list[i * 2] / 10, y: list[i * 2 + 1] / 10 })));
test('창덕궁 나무: 수종 셋 이상 · 쌍이 맞고 정수 · 수천 그루, 모두 둘레 안이고 건물 위에는 없다', () => {
  for (const list of Object.values(CDG_TREES)) { assert.equal(list.length % 2, 0); assert.ok(list.every(Number.isInteger)) }
  const trees = cdgTrees(); assert.ok(trees.length > 3000 && trees.length < 9000, `나무 수 ${trees.length}`);
  const ring = cdgRing().map((pt) => toLocalAt(pt, CDG_AT));
  const footprints = CDG_BUILDINGS.map(b => Array.from({ length: b.p.length / 2 }, (_, i) => toLocalAt([CDG_ORIGIN[0] + b.p[i * 2] / 1e6, CDG_ORIGIN[1] + b.p[i * 2 + 1] / 1e6], CDG_AT)));
  for (const tree of trees) {
    assert.ok(contains(ring, tree.x, tree.y), `둘레 밖 ${tree.species} ${tree.x},${tree.y}`);
    assert.ok(!footprints.some(foot => contains(foot, tree.x, tree.y)), `건물 위 ${tree.species} ${tree.x},${tree.y}`);
  }
});
test('창덕궁 나무: 길 · 담장 위에 없고 연못 물 위에도 없다', () => {
  const { paths, walls, ponds } = JSON.parse(readFileSync(new URL('./fixtures/changdeokgung_obstacles.json', import.meta.url), 'utf8'));
  const toLine = (list) => list.map((pt) => toLocalAt(pt, CDG_AT));
  const roads = paths.map(path => ({ half: path.half, line: toLine(path.p) })), fences = walls.map(toLine);
  const lakes = ponds.map(pond => ({ outer: toLine(pond.outer), inner: pond.inner.map(toLine) }));
  for (const tree of cdgTrees()) {
    const where = `${tree.species} ${tree.x},${tree.y}`;
    for (const road of roads) assert.ok(lineDist(tree.x, tree.y, road.line) > road.half, `길 위 ${where}`);
    for (const fence of fences) assert.ok(lineDist(tree.x, tree.y, fence) > 1, `담장 위 ${where}`);
    for (const lake of lakes) assert.ok(!contains(lake.outer, tree.x, tree.y) || lake.inner.some(island => contains(island, tree.x, tree.y)), `물 위 ${where}`);
  }
});

// 횃불 자리 확인용: 모델 메시에서 높이 0.25 m 넘는 면의 바닥 삼각형(동 · 북, PALACE_AT 기준 — 나무 · 횃불 자료와 같은 좌표)
function solidTriangles() {
  const tris = [];
  for (const monument of MONUMENTS.filter(each => each.zone === 'gyeongbok')) {
    const data = buildMonument(monument.id), [mx, my] = toM(monument.lngLat[0], monument.lngLat[1]), yaw = monument.yawDeg * Math.PI / 180, cos = Math.cos(yaw), sin = Math.sin(yaw);
    const at = (i) => [mx + data[i] * cos - data[i + 1] * sin - AT[0], -(my - (data[i] * sin + data[i + 1] * cos) - AT[1])];
    for (let i = 0; i < data.length; i += STRIDE * 3) if (Math.max(data[i + 2], data[i + STRIDE + 2], data[i + STRIDE * 2 + 2]) > .25) tris.push([at(i), at(i + STRIDE), at(i + STRIDE * 2)]);
  }
  return tris;
}
function nearTriangle(x, y, [a, b, c], margin) {
  if (x < Math.min(a[0], b[0], c[0]) - margin || x > Math.max(a[0], b[0], c[0]) + margin || y < Math.min(a[1], b[1], c[1]) - margin || y > Math.max(a[1], b[1], c[1]) + margin) return false;
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]), d1 = side(a, b), d2 = side(b, c), d3 = side(c, a);
  if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;   // 안쪽
  return Math.min(segDist(x, y, a, b), segDist(x, y, b, c), segDist(x, y, c, a)) < margin;
}

test('궁 안 횃불: 근정전 마당은 어도 양옆 11자 두 줄 · 마당 둘레 네모 · 앞 계단 양옆만 같은 간격으로 선다(흩어 놓지 않는다)', async () => {
  const { PALACE_TORCHES } = await import('../web/city/monuments_torches_data.mts');
  const all = Array.from({ length: PALACE_TORCHES.length / 2 }, (_, i) => ({ x: PALACE_TORCHES[i * 2] / 10, y: PALACE_TORCHES[i * 2 + 1] / 10 }));
  const yard = all.filter(torch => torch.x > -55 && torch.x < 50 && torch.y > -140 && torch.y < -14);
  const XL = -29.3, XR = 27.7, YF = -84.5, YB = -26.8, near = (a, b) => Math.abs(a - b) < .15;
  const rim = yard.filter(torch => near(torch.x, XL) || near(torch.x, XR) || near(torch.y, YB) || (near(torch.y, YF) && (torch.x < -20 || torch.x > 12)));
  const aisle = yard.filter(torch => torch.y < -84.4 - 0 && torch.y > -135 && !rim.includes(torch));
  const hall = PALACE_BUILDINGS.find(b => b.name === '근정전'), ring2 = Array.from({ length: 4 }, (_, i) => toLocal([PALACE_ORIGIN[0] + hall.p[i * 2] / 1e6, PALACE_ORIGIN[1] + hall.p[i * 2 + 1] / 1e6]));
  const hallX = ring2.reduce((sum, p) => sum + p[0], 0) / 4;
  const flank = yard.filter(torch => !rim.includes(torch) && !aisle.includes(torch));
  assert.equal(rim.length + aisle.length + flank.length, yard.length);
  assert.equal(flank.length, 2, '앞 계단 양옆 하나씩');
  assert.ok(Math.abs((flank[0].x + flank[1].x) / 2 - hallX) < 2.5 && Math.abs(flank[0].y - flank[1].y) < 1, `계단 양옆은 근정전 앞 가운데(계단) 기준 좌우 ${flank.map(p => `${p.x},${p.y}`)}`);
  assert.ok(Math.abs(flank[0].x - flank[1].x) > 10 && Math.abs(flank[0].x - flank[1].x) < 15, '계단 폭(8 m) 밖 양옆');
  assert.ok(flank.every(p => p.y < -70 && p.y > -80), '앞 계단 옆(월대 앞)');
  // 어도 두 줄: 같은 높이마다 쌍, 층 간격이 같고 두 줄 사이 폭이 일정(평행)
  const rows = [...new Set(aisle.map(p => p.y))].sort((a, b) => a - b);
  assert.ok(rows.length >= 4, `어도 줄 ${rows.length}`);
  for (const y of rows) assert.equal(aisle.filter(p => p.y === y).length, 2, `줄마다 좌우 하나씩 ${y}`);
  const gaps = rows.slice(1).map((y, i) => y - rows[i]);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < .25, `같은 간격 ${gaps}`);
  const widths = rows.map(y => { const row = aisle.filter(p => p.y === y).map(p => p.x).sort((a, b) => a - b); return row[1] - row[0] });
  assert.ok(Math.max(...widths) - Math.min(...widths) < .15, `두 줄 폭이 일정(11자) ${widths}`);
  assert.ok(Math.min(...widths) > 18 && Math.max(...widths) < 30, `어도 양옆 ${widths[0]}`);
  assert.ok(rows.at(-1) > YF - .2 && rows.at(-1) < YF + .2, '두 줄은 마당 네모 선의 앞 변에서 끝난다');
  // 둘레: 변마다 같은 간격(±0.15 m)
  for (const edge of [rim.filter(p => near(p.x, XR)).map(p => p.y), rim.filter(p => near(p.x, XL)).map(p => p.y), rim.filter(p => near(p.y, YB)).map(p => p.x)]) {
    const sorted = [...edge].sort((a, b) => a - b), steps = sorted.slice(1).map((v, i) => v - sorted[i]);
    assert.ok(sorted.length >= 4 && Math.max(...steps) - Math.min(...steps) < .3, `변 간격 ${steps}`);
  }
  assert.ok(rim.length >= 12, `마당 둘레 ${rim.length}`);
});

test('궁 안 횃불: 긴 길은 길 양옆에 쌍으로 서서 쌍의 가운데가 길 위에 놓인다(빈 땅에 흩지 않는다)', async () => {
  const { PALACE_TORCHES } = await import('../web/city/monuments_torches_data.mts');
  const all = Array.from({ length: PALACE_TORCHES.length / 2 }, (_, i) => ({ x: PALACE_TORCHES[i * 2] / 10, y: PALACE_TORCHES[i * 2 + 1] / 10 }));
  const { paths } = JSON.parse(readFileSync(new URL('./fixtures/palace_obstacles.json', import.meta.url), 'utf8'));
  const lines = paths.map(path => path.p.map(toLocal));
  const outside = all.filter(torch => !(torch.x > -55 && torch.x < 50 && torch.y > -140 && torch.y < -14));
  let paired = 0;
  for (const torch of outside) {
    const mates = outside.filter(other => other !== torch && Math.hypot(other.x - torch.x, other.y - torch.y) < 12);
    if (mates.some(other => lines.some(line => lineDist((other.x + torch.x) / 2, (other.y + torch.y) / 2, line) < .3))) paired++;
  }
  assert.ok(paired / outside.length > .9, `길 양옆 쌍 ${paired}/${outside.length}`);
});

// ── 길가 횃불 · 보이는 줌 ─────────────────────────────────────────────────────────────────────────────────────
test('궁 안 횃불: 둘레 안 · 건물 · 담장 · 연못 · 길 · 나무 위에 없고 수십 개가 길가에 선다', async () => {
  const { PALACE_TORCHES } = await import('../web/city/monuments_torches_data.mts');
  assert.equal(PALACE_TORCHES.length % 2, 0); assert.ok(PALACE_TORCHES.every(Number.isInteger));
  const torches = Array.from({ length: PALACE_TORCHES.length / 2 }, (_, i) => ({ x: PALACE_TORCHES[i * 2] / 10, y: PALACE_TORCHES[i * 2 + 1] / 10 }));
  assert.ok(torches.length > 50 && torches.length < 800, `횃불 수 ${torches.length}`);
  const ring = palaceRing().map(toLocal);
  const footprints = PALACE_BUILDINGS.map(b => Array.from({ length: b.p.length / 2 }, (_, i) => toLocal([PALACE_ORIGIN[0] + b.p[i * 2] / 1e6, PALACE_ORIGIN[1] + b.p[i * 2 + 1] / 1e6])));
  const { paths, walls, ponds } = JSON.parse(readFileSync(new URL('./fixtures/palace_obstacles.json', import.meta.url), 'utf8'));
  const roads = paths.map(path => ({ half: path.half, line: path.p.map(toLocal) })), fences = walls.map(line => line.map(toLocal)), lakes = ponds.map(pond => pond.outer.map(toLocal));
  const trees = allTrees();
  const solids = solidTriangles();   // 모델이 실제로 세운 면(기단 · 계단 · 몸 — 높이 0.25 m 넘는 것)의 바닥 사각
  let besideRoad = 0;
  for (const torch of torches) {
    const where = `${torch.x},${torch.y}`;
    assert.ok(contains(ring, torch.x, torch.y), `둘레 밖 ${where}`);
    assert.ok(!footprints.some(foot => contains(foot, torch.x, torch.y)), `건물 위 ${where}`);
    for (const fence of fences) assert.ok(lineDist(torch.x, torch.y, fence) > 1, `담장 위 ${where}`);
    for (const lake of lakes) assert.ok(!contains(lake, torch.x, torch.y), `물 위 ${where}`);
    const inYard = torch.x > -55 && torch.x < 50 && torch.y > -140 && torch.y < -14;   // 근정전 마당 — 둘레 윤곽 선(닫힌 길 · 넓은 보행 구역 선)은 길이 아니라 마당 가장자리
    for (const road of roads) {
      if (inYard && (road.half >= 3 || (road.line.length > 3 && Math.hypot(road.line[0][0] - road.line.at(-1)[0], road.line[0][1] - road.line.at(-1)[1]) < .01))) continue;
      assert.ok(lineDist(torch.x, torch.y, road.line) > road.half * .9, `길 위 ${where}`);
    }
    assert.ok(!trees.some(tree => Math.hypot(tree.x - torch.x, tree.y - torch.y) < 1.2), `나무 위 ${where}`);
    assert.ok(!solids.some(tri => nearTriangle(torch.x, torch.y, tri, 1)), `생성된 기단 · 계단 · 몸 1 m 안 ${where}`);
    if (roads.some(road => lineDist(torch.x, torch.y, road.line) < road.half + 2.2)) besideRoad++;
  }
  assert.ok(besideRoad / torches.length > .95, '횃불은 길가에 선다');
});

test('보이는 줌: 모델 · 담장 · 궁 안 건물 · 나무 · 횃불이 도시 건물과 같은 공용 셈(zoom_gate)으로 보이고 사라진다', async () => {
  const gate = await import('../web/city/zoom_gate.mts');
  const buildings = readFileSync(new URL('../web/city/buildings.mts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(buildings.includes('cityMinZoom(this.phone)') && buildings.includes('cityGrow(this.phone, zoom)') && buildings.includes('cityFarLimit(zoom)'), '도시 건물은 공용 셈을 쓴다');
  assert.ok(!/14\.5\s*:\s*14/.test(buildings), '도시 건물에 14 / 14.5 복사본 없음');
  assert.equal(gate.cityMinZoom(false), 14); assert.equal(gate.cityMinZoom(true), 14.5);
  // 서서히 자라기: 문턱 0 → 0.6 줌 뒤 1(데스크톱 14~14.6 · 폰 14.5~15.1)
  assert.equal(gate.cityGrow(false, 14), 0); assert.equal(gate.cityGrow(false, 13.9), 0); assert.ok(gate.cityGrow(false, 14.3) > 0 && gate.cityGrow(false, 14.3) < 1); assert.equal(gate.cityGrow(false, 14.6), 1);
  assert.equal(gate.cityGrow(true, 14.5), 0); assert.ok(gate.cityGrow(true, 14.8) > 0 && gate.cityGrow(true, 14.8) < 1); assert.equal(gate.cityGrow(true, 15.1), 1);
  // 폰의 먼 곳 줄이기: 가까우면 1, 끝 거리 밖이면 0
  const [from, to] = gate.cityFarLimit(15); assert.equal(gate.cityFarFade(from - 1, 15), 1); assert.equal(gate.cityFarFade(to + 1, 15), 0); assert.ok(gate.cityFarFade((from + to) / 2, 15) > 0);
  for (const monument of MONUMENTS) assert.ok(!('minZoom' in monument), `${monument.id}: 줌 기준은 하나(zoom_gate)`);
  const monuments = readFileSync(new URL('../web/city/monuments.mts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(monuments.includes('cityMinZoom(phone)') && monuments.includes('cityGrow(phone, zoom)') && monuments.includes('cityFarFade('), '문화유산도 같은 공용 셈');
  for (const file of ['monuments.mts', 'monument_trees.mts', 'monument_torches.mts', 'landmarks.mts']) {
    const code = readFileSync(new URL(`../web/city/${file}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/zoom\s*[<>]=?\s*1[4-9]/.test(code) && !/MIN_ZOOM\s*=/.test(code) && !/14\.5/.test(code), `${file}: 따로 정한 줌 기준 없음`);
  }
  assert.ok(monuments.includes('zoneReady'), '궁 메시가 다 준비된 뒤에만 나무 · 횃불');
  const torches = readFileSync(new URL('../web/city/monument_torches.mts', import.meta.url), 'utf8');
  assert.ok(torches.includes('if (!dark || !this.groves.length) return'), '횃불은 밤(다크)에만 그린다');
});

test('창호: 밤 등불은 창호(K.window)에만 — 회벽 · 합각 · 막힌 벽은 켜지 않는다', () => {
  const monuments = readFileSync(new URL('../web/city/monuments.mts', import.meta.url), 'utf8');
  assert.ok(monuments.includes('k == 20') && /else if \(k == 19\) col \+= warm \* c \* \.05/.test(monuments), '회벽은 아주 약한 반사광만');
  assert.ok(!/k == 19 && side/.test(monuments.split('if (u_night > .5)')[1] || ''), '밤 가지에 회벽 발광 없음');
  const data = buildMonument('palace-halls'); let windows = 0, plaster = 0;
  for (let i = 0; i < data.length; i += STRIDE) { const kind = data[i + 6]; if (kind === 20) windows++; if (kind === 19) plaster++ }
  assert.ok(windows > 100 && plaster > 0, `창호 ${windows} · 회벽 ${plaster}`);
});

test('창덕궁 횃불: 쌍으로 길 양쪽에 같은 간격으로 서고, 둘레 안 · 건물 · 담장 · 연못 · 나무 · 기단 위에 없다', async () => {
  const { CDG_TORCHES } = await import('../web/city/monuments_changdeokgung_torches_data.mts');
  assert.equal(CDG_TORCHES.length % 4, 0, '좌우 한 쌍씩'); assert.ok(CDG_TORCHES.every(Number.isInteger));
  const torches = Array.from({ length: CDG_TORCHES.length / 2 }, (_, i) => ({ x: CDG_TORCHES[i * 2] / 10, y: CDG_TORCHES[i * 2 + 1] / 10 }));
  assert.ok(torches.length >= 20 && torches.length < 400, `횃불 수 ${torches.length}`);
  const ring = cdgRing().map((pt) => toLocalAt(pt, CDG_AT));
  const footprints = CDG_BUILDINGS.map(b => Array.from({ length: b.p.length / 2 }, (_, i) => toLocalAt([CDG_ORIGIN[0] + b.p[i * 2] / 1e6, CDG_ORIGIN[1] + b.p[i * 2 + 1] / 1e6], CDG_AT)));
  const { paths, walls, ponds } = JSON.parse(readFileSync(new URL('./fixtures/changdeokgung_obstacles.json', import.meta.url), 'utf8'));
  const roads = paths.map(path => ({ half: path.half, line: path.p.map((pt) => toLocalAt(pt, CDG_AT)) })), fences = walls.map(line => line.map((pt) => toLocalAt(pt, CDG_AT))), lakes = ponds.map(pond => pond.outer.map((pt) => toLocalAt(pt, CDG_AT)));
  const trees = cdgTrees();
  for (let i = 0; i < torches.length; i += 2) {   // 쌍: 같은 길 위 한 점에서 양쪽 같은 거리(길 가운데 선이 두 횃불의 한가운데)
    const [left, right] = [torches[i], torches[i + 1]];
    const near = (each, torch) => { const gap = lineDist(torch.x, torch.y, each.line); return gap > each.half * .5 && gap < each.half + 1.6 };   // 꺾인 곳은 안쪽이 가까워진다
    const road = roads.find(each => Math.abs(Math.hypot(left.x - right.x, left.y - right.y) - 2 * (each.half + 1.4)) < .3 && lineDist((left.x + right.x) / 2, (left.y + right.y) / 2, each.line) < 1 && near(each, left) && near(each, right));
    assert.ok(road, `쌍이 길 양쪽 가장자리 밖에 같은 폭으로 서지 않는다 ${left.x},${left.y}`);
    assert.ok(lineDist((left.x + right.x) / 2, (left.y + right.y) / 2, road.line) < 1, `쌍의 한가운데가 길 가운데 선이 아니다 ${left.x},${left.y}`);
  }
  for (const torch of torches) {
    const where = `${torch.x},${torch.y}`;
    assert.ok(contains(ring, torch.x, torch.y), `둘레 밖 ${where}`);
    assert.ok(!footprints.some(foot => contains(foot, torch.x, torch.y)), `건물 위 ${where}`);
    for (const fence of fences) assert.ok(lineDist(torch.x, torch.y, fence) > 1, `담장 위 ${where}`);
    for (const lake of lakes) assert.ok(!contains(lake, torch.x, torch.y), `물 위 ${where}`);
    assert.ok(!trees.some(tree => Math.hypot(tree.x - torch.x, tree.y - torch.y) < 1.2), `나무 위 ${where}`);
  }
  // 실제 모델이 세운 기단 · 계단 · 벽 삼각형(높이 0.25 m 넘는 것) 위에도 없다 — 바닥 삼각형과 1 m 안 거리 검사
  const { MONUMENTS } = await import('../web/city/monuments_data.mts');
  const { buildMonument } = await import('../web/city/monuments_changdeokgung.mts');
  const at = toM(CDG_AT[0], CDG_AT[1]), solid = [];
  for (const monument of MONUMENTS.filter(each => each.zone === 'changdeokgung')) {
    const data = buildMonument(monument.id), [mx, my] = toM(monument.lngLat[0], monument.lngLat[1]);
    const world = (i) => [mx + data[i] - at[0], -(my - data[i + 1] - at[1])];
    for (let i = 0; i < data.length; i += 24) if (Math.max(data[i + 2], data[i + 10], data[i + 18]) > .25) solid.push([world(i), world(i + 8), world(i + 16)]);
  }
  assert.ok(solid.length > 1000, `모델 삼각형 ${solid.length}`);
  const pointSegment = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len)) : 0; return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t) };
  const inTriangle = (px, py, [a, b, c]) => { const sign = (p, q) => (px - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (py - q[1]); const d1 = sign(a, b), d2 = sign(b, c), d3 = sign(c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) };
  for (const torch of torches) {
    const hit = solid.find(tri => inTriangle(torch.x, torch.y, tri) || [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]].some(([a, b]) => pointSegment(torch.x, torch.y, a, b) < 1));
    assert.ok(!hit, `기단 · 계단 · 벽 삼각형 1 m 안 ${torch.x},${torch.y}`);
  }
  // 간격: 전각 앞 구간 하나 안에서는 길이를 반올림한 개수로 똑같이 나눈다(구간 길이 / round(길이 / 16) = 10.7 ~ 24 m). 같은 길의 이웃한 쌍이 10 m 보다 가까우면 뭉친 것이다
  const along = (line, x, y) => { let best = { gap: Infinity, s: 0 }, travelled = 0; for (let i = 0; i < line.length - 1; i++) { const a = line[i], b = line[i + 1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]), t = seg ? Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (seg * seg))) : 0, gap = Math.hypot(x - a[0] - (b[0] - a[0]) * t, y - a[1] - (b[1] - a[1]) * t); if (gap < best.gap) best = { gap, s: travelled + seg * t }; travelled += seg } return best.s };
  const byRoad = new Map();
  for (let i = 0; i < torches.length; i += 2) {
    const mid = [(torches[i].x + torches[i + 1].x) / 2, (torches[i].y + torches[i + 1].y) / 2], road = roads.find(each => lineDist(mid[0], mid[1], each.line) < 1 && Math.abs(Math.hypot(torches[i].x - torches[i + 1].x, torches[i].y - torches[i + 1].y) - 2 * (each.half + 1.4)) < .3);
    if (!byRoad.has(road)) byRoad.set(road, []); byRoad.get(road).push(along(road.line, mid[0], mid[1]));
  }
  let checked = 0;
  for (const list of byRoad.values()) { list.sort((a, b) => a - b); for (let i = 1; i < list.length; i++) { const gap = list[i] - list[i - 1]; assert.ok(gap >= 10, `쌍 간격 ${gap.toFixed(1)} m — 뭉쳤다`); checked++ } }
  assert.ok(checked >= 3, `간격 검사한 쌍 ${checked}`);
});

// 가짜 GL: 모든 메서드가 불투명 객체를 돌려주고, 만든 버퍼 수를 센다
const fakeGl = () => { const calls = { buffers: 0, vaos: 0, programs: 0, deletedBuffers: 0, deletedVaos: 0, deletedPrograms: 0 }; const gl = new Proxy({}, { get: (_, name) => name === 'createBuffer' ? () => { calls.buffers++; return {} } : name === 'createVertexArray' ? () => { calls.vaos++; return {} } : name === 'createProgram' ? () => { calls.programs++; return {} } : name === 'deleteBuffer' ? () => { calls.deletedBuffers++ } : name === 'deleteVertexArray' ? () => { calls.deletedVaos++ } : name === 'deleteProgram' ? () => { calls.deletedPrograms++ } : /^(getShaderParameter|getProgramParameter)$/.test(name) ? () => true : typeof name === 'string' && /^[A-Z_0-9]+$/.test(name) ? 0 : () => ({}) }); return { gl, calls } };
test('지연 로드 중 모드를 나가면(dispose) 늦게 온 구역 파일이 GPU 자원을 다시 만들지 않는다', async () => {
  const { Monuments } = await import('../web/city/monuments.mts');
  const { gl, calls } = fakeGl(), layer = new Monuments(); layer.init(gl);
  const item = layer.items.find(each => each.M.zone === 'changdeokgung');
  assert.equal(layer.mesh(item), null);   // 구역 파일 받기 시작
  layer.dispose(); const before = calls.buffers;
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(calls.buffers, before, 'dispose 뒤 버퍼를 만들지 않는다'); assert.equal(layer.mesh(item), null, 'dispose 뒤에는 메시를 짓지 않는다');
  assert.equal(layer.trees.groves.length, 0); assert.equal(layer.torches.groves.length, 0);
});
test('동상 구역: 만든 버퍼 · VAO · 프로그램을 dispose 가 모두 지운다(생성 · 삭제 개수 일치)', async () => {
  const { Monuments } = await import('../web/city/monuments.mts');
  const { gl, calls } = fakeGl(), layer = new Monuments(); layer.init(gl);
  const item = layer.items.find(each => each.M.id === 'sejong');
  layer.mesh(item); await new Promise(resolve => setTimeout(resolve, 1500));
  assert.ok(layer.mesh(item), '구역 파일이 온 뒤 메시를 짓는다');
  assert.ok(calls.buffers > 0 && calls.vaos > 0 && calls.programs > 0, `버퍼 ${calls.buffers} VAO ${calls.vaos}`);
  layer.dispose();
  assert.equal(calls.deletedBuffers, calls.buffers, '버퍼'); assert.equal(calls.deletedVaos, calls.vaos, 'VAO'); assert.equal(calls.deletedPrograms, calls.programs, '프로그램');
});
test('세종 자리 비우기: 실제 건물 윤곽 고정 자료 — 받침 조각은 도시 엔진 · 지도 층 모두 숨고, 경계에 걸친 이웃 · 큰 건물은 남는다', () => {
  const hide = MONUMENT_HIDES.find(each => each.lngLat[0] === 126.97691 && each.lngLat[1] === 37.57285), filter = monumentBuildingFilter(), ring = filter[1][1].coordinates[MONUMENT_HIDES.indexOf(hide)][0];
  const cosLat = Math.cos(hide.lngLat[1] * Math.PI / 180), toLngLat = ([east, north]) => [hide.lngLat[0] + east / (111320 * cosLat), hide.lngLat[1] + north / 110574];
  // 도시 엔진(mesh.mts landmarkPart)과 같은 판정: 윤곽 중심이 반경 안이고 가로 · 세로 중 큰 쪽이 반경 × 2.5 보다 작다
  const engineHides = (box) => { const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2; return Math.hypot(cx, cy) < hide.radiusM && Math.max(box[2] - box[0], box[3] - box[1]) < 2.5 * hide.radiusM };
  const inside = ([lng, lat]) => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) hit = !hit } return hit };
  const mapHides = (box) => [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].every(corner => inside(toLngLat(corner)));
  // [서, 남, 동, 북] 미터(숨김 중심 기준)
  const pieces = { '받침 조각 6 × 4': [-3, -4, 3, 0], '받침 앞 조각 3 × 3': [-1.5, -8, 1.5, -5] };
  const kept = { '경계에 걸친 이웃 18 × 10(중심 16 m)': [7, 11, 25, 21], '동쪽 이웃 12 × 12': [30, -6, 42, 6], '가까운 큰 광장 건물 40 × 30(중심 5 m)': [-15, -10, 25, 20], '북쪽 이웃 20 × 8': [-10, 30, 10, 38] };
  for (const [name, box] of Object.entries(pieces)) { assert.ok(engineHides(box), `엔진 ${name}`); assert.ok(mapHides(box), `지도 ${name}`) }
  for (const [name, box] of Object.entries(kept)) { assert.ok(!engineHides(box), `엔진이 숨김 ${name}`); assert.ok(!mapHides(box), `지도가 숨김 ${name}`) }
});
test('구역 모듈이 나무 · 횃불을 내놓는다: 창덕궁만 가도 경복궁 자료가 딸려 오지 않는다', () => {
  const strip = (file) => readFileSync(new URL(`../web/city/${file}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  for (const file of ['monuments_changdeokgung.mts', 'monuments_hanok.mts', 'monument_trees.mts', 'monument_torches.mts', 'monument_cells.mts']) assert.ok(!/monuments_gyeongbok|monuments_palace|monuments_trees_data|monuments_torches_data/.test(strip(file)), `${file}: 경복궁 자료를 import 하지 않는다`);
  assert.ok(/export const trees/.test(strip('monuments_gyeongbok.mts')) && /export const torches/.test(strip('monuments_gyeongbok.mts')), '경복궁 구역 모듈이 나무 · 횃불을 내놓는다');
});
test('공간 칸 나누기: 칸마다 먼 곳 줄이기 사각이 따로 있고 점 · 삼각형이 하나도 빠지지 않는다', async () => {
  const { splitPoints, splitTriangles, CELL_M } = await import('../web/city/monument_cells.mts');
  const near = [0, 0, 100, 100], far = [3000, 0, 3100, 100], cells = splitPoints([0, 0], [[...near, ...far]]);
  assert.ok(cells.length >= 2 && cells.reduce((sum, cell) => sum + cell.items[0].length, 0) === 8);
  assert.ok(cells.every(cell => cell.rect[1] - cell.rect[0] < CELL_M + 8), '칸 사각이 칸 크기 안');
  const data = new Float32Array(8 * 6); for (let tri = 0; tri < 2; tri++) for (let v = 0; v < 3; v++) { data[(tri * 3 + v) * 8] = tri * 1000 + v; data[(tri * 3 + v) * 8 + 1] = v }
  const pieces = splitTriangles(data, 8, index => [data[index], data[index + 1]]);
  assert.equal(pieces.length, 2); assert.equal(pieces.reduce((sum, piece) => sum + piece.items.length, 0), data.length);
});

// 두 도성문: OSM 외곽 · 홍예 관통 · 구역 지연 로드 · 밤 횃불.
const gateZones = {
  sungnyemun: await import('../web/city/monuments_sungnyemun.mts'),
  heunginjimun: await import('../web/city/monuments_heunginjimun.mts'),
};
const gateObstacles = JSON.parse(readFileSync(new URL('./fixtures/gates_obstacles.json', import.meta.url), 'utf8'));
function gateTriangles(name) {
  const placement = MONUMENTS.find(entry => entry.id === name);
  const angle = placement.yawDeg * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const data = gateZones[name].buildMonument(name), triangles = [];
  for (let offset = 0; offset < data.length; offset += STRIDE * 3) {
    if (Math.max(data[offset + 2], data[offset + 10], data[offset + 18]) <= .25) continue;
    triangles.push([0, 8, 16].map(delta => [data[offset + delta] * cosine - data[offset + delta + 1] * sine, data[offset + delta] * sine + data[offset + delta + 1] * cosine]));
  }
  return triangles;
}
test('숭례문 · 흥인지문: 정점 · 단위 법선 · 실물 색 재질 · 높이 · 휴대폰 메시 한도', () => {
  for (const [name, zone] of Object.entries(gateZones)) {
    const data = zone.buildMonument(name);
    assert.ok(data.byteLength < 1.5 * 1024 * 1024, `${name}: 메시 크기 ${data.byteLength}`);
    assert.equal(data.length % 24, 0);
    let maximumHeight = 0;
    const materials = new Set();
    for (let offset = 0; offset < data.length; offset += STRIDE) {
      for (let field = 0; field < STRIDE; field++) assert.ok(Number.isFinite(data[offset + field]), `${name} 정점 ${offset}`);
      assert.ok(Math.abs(Math.hypot(data[offset + 3], data[offset + 4], data[offset + 5]) - 1) < .001);
      maximumHeight = Math.max(maximumHeight, data[offset + 2]); materials.add(data[offset + 6]);
    }
    assert.ok(Math.abs(maximumHeight - zone.SHAPE.height) < .01);
    for (const material of [0, 2, 3, 5, 7, 9, 12, 15]) assert.ok(materials.has(material), `${name} 재질 ${material}`);
    assert.ok(!materials.has(20), '상층 판문을 발광하는 한지창으로 바꾸지 않는다');
    assert.equal(zone.buildMonument('없는 모델').length, 0);
  }
});
test('두 도성문 홍예는 중앙 통로가 뚫려 있고 정면 다섯 칸 · 측면 두 칸 기둥열', () => {
  for (const [name, zone] of Object.entries(gateZones)) {
    const data = zone.buildMonument(name), shape = zone.SHAPE;
    const columns = new Set();
    for (let offset = 0; offset < data.length; offset += STRIDE * 3) {
      const corners = [0, 8, 16].map(delta => [data[offset + delta], data[offset + delta + 1], data[offset + delta + 2]]);
      // x=0 · z=1에서 남북으로 보는 광선과 석축 면의 교차가 없어야 한다.
      const planar = corners.map(point => [point[0], point[2]]);
      const area = (planar[1][0] - planar[0][0]) * (planar[2][1] - planar[0][1]) - (planar[1][1] - planar[0][1]) * (planar[2][0] - planar[0][0]);
      if (Math.abs(area) > .00001 && data[offset + 6] === 0 && corners.every(point => point[1] > -13)) assert.ok(!nearTriangle(0, 1, planar, 0), `${name} 홍예 막힘`);
      if (data[offset + 6] === 2 && Math.abs(data[offset + 2] - shape.masonryHeight) < .001) columns.add(Math.round((data[offset] - .25 + shape.frameWidth / 2) / (shape.frameWidth / 5)));
    }
    assert.ok(columns.size >= 6, `${name}: 기둥 여섯 줄`);
    assert.equal(shape.verticalPlaque, name === 'sungnyemun');
  }
});
test('문루 기둥 발은 육축 윗면에 바로 닿고(떠 있지 않다) 육축 윤곽 안에 선다 · 여장은 네 면을 두른 회색 전돌', () => {
  for (const [name, zone] of Object.entries(gateZones)) {
    const data = zone.buildMonument(name), { masonryHeight, base } = zone.SHAPE, feet = [];
    const parapet = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let offset = 0; offset < data.length; offset += STRIDE * 3) {
      const kind = data[offset + 6], zs = [0, 8, 16].map(delta => data[offset + delta + 2]);
      if (kind === 2) {   // 주칠 = 기둥(문루에서 이 재질은 기둥뿐)
        const lowest = Math.min(...zs);
        if (lowest < masonryHeight + .5) { feet.push(lowest); for (const delta of [0, 8, 16]) assert.ok(contains(base, data[offset + delta], data[offset + delta + 1]), `${name} 기둥 발이 육축 밖`) }
      }
      if (kind === 6 && Math.min(...zs) >= masonryHeight - .001 && Math.max(...zs) <= masonryHeight + 1.2 + .001) {   // 여장(회색 전돌)
        for (const delta of [0, 8, 16]) { parapet.minX = Math.min(parapet.minX, data[offset + delta]); parapet.maxX = Math.max(parapet.maxX, data[offset + delta]); parapet.minY = Math.min(parapet.minY, data[offset + delta + 1]); parapet.maxY = Math.max(parapet.maxY, data[offset + delta + 1]) }
      }
    }
    assert.ok(feet.length > 50, `${name} 기둥 면 ${feet.length}`);
    for (const lowest of feet) assert.ok(Math.abs(lowest - masonryHeight) < .001, `${name} 기둥 발 ${lowest} ≠ 육축 윗면 ${masonryHeight}`);
    // 여장은 앞 · 뒤 · 양옆 네 면: 문루(22.5 × 7.7 m) 둘레를 모두 덮는다
    assert.ok(parapet.maxX - parapet.minX > zone.SHAPE.frameWidth && parapet.maxY - parapet.minY > zone.SHAPE.frameDepth, `${name} 여장이 네 면을 두르지 않음`);
    for (const [x, y] of [[parapet.minX, 0], [parapet.maxX, 0], [0, parapet.minY], [0, parapet.maxY]]) assert.ok(contains(base, x, y), `${name} 여장이 육축 밖`);
  }
});
test('도성문 현판: 폭을 s 에 싣고(셰이더가 그 폭으로 그린다) 글씨는 없다 — 검은 바탕 + 테두리', () => {
  const source = readFileSync(new URL('../web/city/monuments.mts', import.meta.url), 'utf8');
  assert.ok(source.includes('wd = floor(s / 2.)') && source.includes('wd > 0. ? 0.'), '셰이더가 현판 폭을 읽고 도성문에는 글씨를 안 그린다');
  for (const [name, zone] of Object.entries(gateZones)) {
    const data = zone.buildMonument(name), widths = new Set();
    for (let offset = 0; offset < data.length; offset += STRIDE) if (data[offset + 6] === 9 && data[offset + 7] >= 1) widths.add(Math.floor(data[offset + 7] / 2) / 10);
    assert.deepEqual([...widths], [zone.SHAPE.verticalPlaque ? .9 : 2.8], `${name} 현판 폭`);
  }
});
test('흥인지문 옹성: OSM 동쪽 반원 윤곽 · 두꺼운 벽 · 북쪽 입구가 남는다', () => {
  const { base, enclosure } = gateZones.heunginjimun.SHAPE;
  assert.ok(enclosure.length > 30);
  assert.ok(Math.min(...enclosure.map(point => point[1])) < -34);
  assert.ok(Math.max(...base.map(point => point[1])) > 8);
  assert.ok(!contains(enclosure, 16, -16), '북쪽 열린 출입구');
  assert.ok(contains(enclosure, -4, -32), '안팎 윤곽 사이 옹성 벽');
  assert.ok(!contains(enclosure, 0, -18), '옹성 안쪽 마당은 비운다');
  assert.equal(gateZones.sungnyemun.SHAPE.enclosure, undefined);
});
test('도성문 자리와 방향: OSM 원자료를 모델 좌표로 돌렸다 되돌려도 5 mm 안 · 숨김 영역이 외곽 전체를 덮는다', () => {
  for (const [name, zone] of Object.entries(gateZones)) {
    const placement = MONUMENTS.find(entry => entry.id === name);
    const obstacle = gateObstacles[name], angle = placement.yawDeg * Math.PI / 180;
    const [originEast, originSouth] = toM(...placement.lngLat);
    const outline = [...zone.SHAPE.base, ...(zone.SHAPE.enclosure ?? [])];
    const hide = MONUMENT_HIDES.find(entry => entry.lngLat[0] === placement.lngLat[0]);
    assert.equal(hide.minH, 0);
    for (const coordinate of obstacle.outline) {
      const [worldEast, worldSouth] = toM(...coordinate);
      const east = worldEast - originEast, north = originSouth - worldSouth;
      const localEast = east * Math.cos(angle) + north * Math.sin(angle);
      const localNorth = -east * Math.sin(angle) + north * Math.cos(angle);
      assert.ok(outline.some(point => Math.hypot(point[0] - localEast, point[1] - localNorth) < .005), `${name}: 외곽 누락 ${coordinate}`);
      assert.ok(Math.hypot(east, north) < hide.radiusM, `${name}: 숨김 영역 밖`);
    }
  }
});
test('도성문 횃불: 통로 축 양쪽 끝에 좌우 대칭 쌍 · 같은 간격 · 육축 · 옹성 · 건물 · 보행길 · 차로와 겹치지 않음', () => {
  for (const [name, zone] of Object.entries(gateZones)) {
    assert.ok(zone.torches.data.length >= 12 && zone.torches.data.length % 4 === 0);
    const placement = MONUMENTS.find(entry => entry.id === name), obstacle = gateObstacles[name], triangles = gateTriangles(name);
    const angle = placement.yawDeg * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
    const points = [];
    for (let index = 0; index < zone.torches.data.length; index += 2) points.push([zone.torches.data[index] / 10, zone.torches.data[index + 1] / 10]);
    assert.deepEqual(zone.torches.at, placement.lngLat);
    // 문 국소 좌표(x 폭 방향 · y 통로 방향)로 되돌려 좌우 대칭을 본다.
    const local = points.map(([east, north]) => [east * cosine + north * sine, -east * sine + north * cosine]);
    for (const [x, y] of local) assert.ok(local.some(([mx, my]) => Math.abs(mx + x) < .15 && Math.abs(my - y) < .15), `${name} 짝 없음 ${x.toFixed(1)},${y.toFixed(1)}`);
    const leftRows = local.filter(([x]) => x < 0).map(([, y]) => y).sort((first, second) => first - second);
    const ends = [leftRows.filter(y => y > 0), leftRows.filter(y => y < 0)];
    for (const rows of ends) for (let index = 1; index < rows.length; index++) assert.ok(Math.abs(rows[index] - rows[index - 1] - 8) < .15, `${name} 간격 ${rows}`);
    // 여유는 모두 1.6 m(생성된 육축 · 옹성 · OSM 건물 · 보행길 선). 차로는 가장자리에서 1 m(너비는 OSM 미기재 시 근사). 보행길(paths)은 폭 정보가 없어 선에서 1.6 m 이상
    // 흥인지문 서쪽 횃불 일부는 보행 광장(plazas) 위에 선다 — 광장은 막을 곳이 아니라 걷는 바닥이라 겹쳐도 된다(건물 · 차로 · 보행길만 피한다)
    for (const [east, north] of points) {
      assert.ok(!triangles.some(triangle => nearTriangle(east, north, triangle, 1.6)), `${name} 실제 메시 위 ${east},${north}`);
      for (const polygon of obstacle.buildings) assert.ok(!contains(polygon, east, north) && edgeDist(east, north, polygon) > 1.6, `${name} 건물 ${east},${north}`);
      for (const road of obstacle.roads) assert.ok(lineDist(east, north, road.p) > road.half + 1, `${name} 차로 위`);
      for (const path of obstacle.paths) assert.ok(lineDist(east, north, path) > 1.6, `${name} 보행길 위 ${east},${north}`);
    }
  }
});
test('도성문 숨김: 문 외곽 안 건물만 숨기고 바로 옆 건물은 도시 팩 · 기본 모드 필터 모두 남긴다 · 도시 나무는 문 둘레를 비운다', async () => {
  const { Monuments } = await import('../web/city/monuments.mts');
  const rings = monumentBuildingFilter()[1][1].coordinates;   // MONUMENT_HIDES 순서의 MultiPolygon 고리
  const layer = new Monuments();
  for (const [name, zone] of Object.entries(gateZones)) {
    const placement = MONUMENTS.find(entry => entry.id === name), hideIndex = MONUMENT_HIDES.findIndex(entry => entry.lngLat[0] === placement.lngLat[0]);
    const hide = MONUMENT_HIDES[hideIndex], [lng, lat] = placement.lngLat, ring = rings[hideIndex][0];
    let hidden = 0, kept = 0;
    for (const polygon of gateObstacles[name].buildings) {
      const xs = polygon.map(point => point[0]), ys = polygon.map(point => point[1]);
      const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const cityHides = Math.hypot(...center) < hide.radiusM && extent < 2.5 * hide.radiusM;   // 도시 엔진(mesh.mts landmarkPart)의 판정과 같다
      const lngLats = polygon.map(([east, north]) => [lng + east / (111320 * Math.cos(lat * Math.PI / 180)), lat + north / 110574]);
      const mapHides = lngLats.every(point => contains(ring, point[0], point[1]));   // MapLibre within: 건물 전체가 다각형 안
      assert.equal(mapHides, cityHides, `${name}: 도시 팩과 기본 모드 필터가 같은 건물을 숨겨야 한다 (${center.map(Math.round)})`);
      if (cityHides) { hidden++; assert.ok(Math.hypot(...center) < 25, `${name}: 숨긴 건물은 문 외곽 안`) } else kept++;
    }
    assert.ok(hidden >= 1 && hidden <= 2, `${name}: 문 자신의 조각만 숨김 ${hidden}`);
    assert.ok(kept >= 3, `${name}: 옆 건물 ${kept}채는 남는다`);
    // 도시 나무: 문 둘레 원 안은 비우고 그 밖은 심는다(문화유산 모드 treeKeepOut)
    const [gateX, gateY] = toM(lng, lat);
    assert.ok(layer.inPalace(gateX, gateY) && layer.inPalace(gateX + hide.radiusM - 1, gateY), `${name}: 문 둘레 나무 비우기`);
    assert.ok(!layer.inPalace(gateX + hide.radiusM + 5, gateY), `${name}: 둘레 밖은 심는다`);
  }
});
test('구역 화면 판정: 동대문만 보는 화면에서도 로드 · 부산에서는 로드하지 않는다', async () => {
  const { monumentsInView } = await import('../web/city/monuments_data.mts');
  const boundsAt = ([longitude, latitude]) => {
    const east = (longitude + 180) / 360, south = (1 - Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) / Math.PI) / 2;
    return [east - .000001, south - .000001, east + .000001, south + .000001];
  };
  for (const name of Object.keys(gateZones)) {
    const placement = MONUMENTS.find(entry => entry.id === name), bounds = boundsAt(placement.lngLat);
    assert.ok(monumentsInView(bounds) && monumentsInView(bounds, name));
    assert.ok(!monumentsInView(boundsAt([129.0756, 35.1796]), name));
  }
  assert.ok(!monumentsInView(boundsAt([129.0756, 35.1796])));
  const source = readFileSync(new URL('../web/city/monuments.mts', import.meta.url), 'utf8');
  for (const name of Object.keys(gateZones)) assert.ok(source.includes(`() => import('./monuments_${name}.mts')`));
  assert.ok(source.indexOf('if (bounds && !monumentsInView(bounds, item.M.zone)) continue') < source.indexOf('const m = this.mesh(item)'));
});

test('도성문 렌더링: 로드 중 · 실패 · 낮 · 줌 문턱에는 횃불 없음, 준비된 밤에만 그리며 GL 자원은 해제', async () => {
  const { Monuments } = await import('../web/city/monuments.mts');
  const calls = [], shaderSources = [];
  let resource = 0;
  const graphics = new Proxy({}, { get: (_, name) => {
    if (name === 'getShaderParameter' || name === 'getProgramParameter') return () => true;
    if (name === 'getUniformLocation') return (_program, uniform) => uniform;
    if (String(name).startsWith('create')) return () => ++resource;
    if (name === 'shaderSource') return (_shader, source) => shaderSources.push(source);
    return (...args) => { calls.push([name, ...args]); };
  } });
  const layer = new Monuments(); layer.init(graphics);
  const placement = MONUMENTS.find(entry => entry.id === 'heunginjimun');
  const centerEast = (placement.lngLat[0] + 180) / 360;
  const centerSouth = (1 - Math.log(Math.tan(Math.PI / 4 + placement.lngLat[1] * Math.PI / 360)) / Math.PI) / 2;
  const options = { light: [0, 0, 1], lit: [.6, .4], dark: true, zoom: 17, phone: false, center: placement.lngLat, bounds: [centerEast - .000001, centerSouth - .000001, centerEast + .000001, centerSouth + .000001] };
  const render = changes => { calls.length = 0; layer.render(graphics, new Float32Array(16), { ...options, ...changes }); };
  layer.zones.set('heunginjimun', new Promise(() => {})); render({});
  assert.ok(!calls.some(call => call[0] === 'drawArraysInstanced'));
  layer.zones.set('heunginjimun', 'fail'); render({});
  assert.ok(!calls.some(call => call[0] === 'drawArraysInstanced'));
  layer.zones.set('heunginjimun', gateZones.heunginjimun); layer.torches.addGrove('heunginjimun', gateZones.heunginjimun.torches.at, gateZones.heunginjimun.torches.data); render({ dark: false });
  assert.ok(calls.some(call => call[0] === 'drawArrays'));
  assert.ok(!calls.some(call => call[0] === 'drawArraysInstanced'));
  render({}); assert.ok(calls.filter(call => call[0] === 'drawArraysInstanced').length >= 2);
  assert.ok(calls.some(call => call[0] === 'uniform1i' && call[1] === 'u_openingsOnly' && call[2] === 1));
  render({ zoom: 14.3 }); assert.ok(calls.filter(call => call[0] === 'drawArraysInstanced').length >= 2);
  assert.ok(calls.some(call => call[0] === 'uniform1f' && call[1] === 'u_grow' && Math.abs(call[2] - .5) < .001));
  for (const changes of [{ zoom: 13.9 }, { zoom: 14.3, phone: true }]) { render(changes); assert.equal(calls.length, 0); }
  const vertexCount = layer.items.find(item => item.M.id === 'heunginjimun').mesh.chunks.reduce((sum, chunk) => sum + chunk.n, 0);
  layer.dispose(); assert.ok(calls.some(call => call[0] === 'deleteBuffer')); assert.ok(vertexCount > 0);
  assert.equal(layer.items.find(item => item.M.id === 'heunginjimun').mesh, null);
  const fragment = shaderSources.find(source => source.includes('u_openingsOnly'));
  assert.ok(fragment.includes('if (u_openingsOnly) col = c * lt * .42;'));
  assert.ok(fragment.includes('k == 7 && !u_openingsOnly') && fragment.includes('k == 10 && !u_openingsOnly'));
});
