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
import { PALACE_TREES } from '../web/city/monuments_trees_data.mts';
import { PALACE_BUILDINGS } from '../web/city/monuments_gyeongbok_data.mts';
import { PALACE_AT, PALACE_ORIGIN, palaceRing } from '../web/city/monuments_data.mts';
import { withMonumentHides, MONUMENT_HIDES, monumentBuildingFilter, monumentsInView, MONUMENTS, CDG_AT, CDG_ORIGIN, cdgRing } from '../web/city/monuments_data.mts';
import { CDG_BUILDINGS } from '../web/city/monuments_changdeokgung_data.mts';
import { CDG_TREES } from '../web/city/monuments_changdeokgung_trees_data.mts';
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
test('세종대왕 동상: 받침 2.7 m + 동상 6.2 m = 약 8.9 m', () => {
  assert.ok(Math.abs(heightOf('sejong') - 8.9) < .6, `높이 ${heightOf('sejong')}`);
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
  for (const name of ['monuments.mts', 'monuments_data.mts', 'monument_parts.mts', 'monuments_gyeongbok.mts', 'monuments_palace.mts', 'monuments_changdeokgung.mts', 'monument_trees.mts']) {
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
const fakeGl = () => { const calls = { buffers: 0 }; const gl = new Proxy({}, { get: (_, name) => name === 'createBuffer' ? () => { calls.buffers++; return {} } : /^(getShaderParameter|getProgramParameter)$/.test(name) ? () => true : typeof name === 'string' && /^[A-Z_0-9]+$/.test(name) ? 0 : () => ({}) }); return { gl, calls } };
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
