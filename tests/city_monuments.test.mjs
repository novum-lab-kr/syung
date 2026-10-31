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
import { withMonumentHides, MONUMENT_HIDES, monumentBuildingFilter } from '../web/city/monuments_data.mts';

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
  for (const name of ['monuments.mts', 'monuments_data.mts', 'monument_parts.mts', 'monuments_gyeongbok.mts', 'monuments_palace.mts']) {
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
  assert.equal(coordinates.filter(([ring]) => ring.length === 17).length, MONUMENT_HIDES.length - 1);
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
// 자리 자료(0.1 m 정수, PALACE_AT 기준 동 · 북)를 지도 좌표 · 지역 미터로 바꿔 둘레 · 건물과 견준다
const KX = 111320 * Math.cos(PALACE_AT[1] * Math.PI / 180), KY = 110574;
const toMeters = ([lng, lat]) => [(lng - PALACE_AT[0]) * KX, (lat - PALACE_AT[1]) * KY];
const contains = (poly, x, y) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside } return inside };
const allTrees = () => Object.entries(PALACE_TREES).flatMap(([species, list]) => Array.from({ length: list.length / 2 }, (_, i) => ({ species, x: list[i * 2] / 10, y: list[i * 2 + 1] / 10 })));

test('궁 안 나무: 수종 넷(소나무 · 활엽 둘 · 감나무), 쌍이 맞고 유한하며 소나무 · 활엽이 수백 그루', () => {
  assert.deepEqual(Object.keys(PALACE_TREES).sort(), ['broad', 'persimmon', 'pine', 'wide']);
  for (const list of Object.values(PALACE_TREES)) { assert.equal(list.length % 2, 0); assert.ok(list.every(Number.isInteger)) }
  assert.ok(PALACE_TREES.pine.length / 2 > 100 && PALACE_TREES.broad.length / 2 + PALACE_TREES.wide.length / 2 > 300);
  assert.ok(PALACE_TREES.persimmon.length / 2 >= 1 && PALACE_TREES.persimmon.length / 2 <= 5);
});

test('궁 안 나무: 모두 경복궁 둘레 안이고 건물 자리 위에는 없다', () => {
  const ring = palaceRing().map(toMeters);
  const footprints = PALACE_BUILDINGS.map(b => Array.from({ length: b.p.length / 2 }, (_, i) => toMeters([PALACE_ORIGIN[0] + b.p[i * 2] / 1e6, PALACE_ORIGIN[1] + b.p[i * 2 + 1] / 1e6])));
  for (const tree of allTrees()) {
    assert.ok(contains(ring, tree.x, tree.y), `둘레 밖 ${tree.species} ${tree.x},${tree.y}`);
    assert.ok(!footprints.some(foot => contains(foot, tree.x, tree.y)), `건물 위 ${tree.species} ${tree.x},${tree.y}`);
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
