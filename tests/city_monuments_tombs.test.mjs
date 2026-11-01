// 왕릉 7곳(선정릉 · 정릉 · 의릉 · 헌인릉 · 태강릉) · 석촌동 고분군 · 풍납토성 · 몽촌토성 전용 모델:
// 메시 · 자리 · 횃불 · 나무 · 숨김 · 구역 화면 판정 · 팔레트 길이 · import 격리
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MONUMENTS, MONUMENT_HIDES, monumentsInView, monumentBuildingFilter, tombRings, SJN_AT, SJN_ORIGIN, JNG_AT, JNG_ORIGIN, UIR_AT, UIR_ORIGIN, HIN_AT, HIN_ORIGIN, TGN_AT, TGN_ORIGIN, SKC_AT, SKC_ORIGIN, PNP_AT, PNP_ORIGIN, MCN_AT, MCN_ORIGIN } from '../web/city/monuments_data.mts';
import * as seonjeong from '../web/city/monuments_seonjeong.mts';
import * as jeongneung from '../web/city/monuments_jeongneung.mts';
import * as uireung from '../web/city/monuments_uireung.mts';
import * as heonin from '../web/city/monuments_heonin.mts';
import * as taegang from '../web/city/monuments_taegang.mts';
import * as seokchon from '../web/city/monuments_seokchon.mts';
import * as pungnap from '../web/city/monuments_pungnap.mts';
import { PNP_LINES } from '../web/city/monuments_pungnap_data.mts';
import { MeshWriter } from '../web/city/monument_parts.mts';
import { frameOf } from '../web/city/monuments_hanok.mts';
import { pointsOf } from '../web/city/monuments_tomb_kit.mts';
import * as mongchon from '../web/city/monuments_mongchon.mts';
import { UIR_TOMBS } from '../web/city/monuments_uireung_data.mts';
import { SJN_TOMBS } from '../web/city/monuments_seonjeong_data.mts';
import { centroidOf } from '../web/city/monuments_tomb_kit.mts';
import { SJN_BUILDINGS } from '../web/city/monuments_seonjeong_data.mts';
import { JNG_BUILDINGS } from '../web/city/monuments_jeongneung_data.mts';
import { UIR_BUILDINGS } from '../web/city/monuments_uireung_data.mts';
import { HIN_BUILDINGS } from '../web/city/monuments_heonin_data.mts';
import { TGN_BUILDINGS } from '../web/city/monuments_taegang_data.mts';
import { COLORS, K } from '../web/city/monument_parts.mts';

const STRIDE = 8;
const EARTH = 40075016.685578488, ORG = [126.978, 37.5665];
const mercX = (lng) => lng / 360 + .5, mercY = (lat) => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
const toM = (lng, lat) => { const unit = 1 / (EARTH * Math.cos(ORG[1] * Math.PI / 180)); return [(mercX(lng) - mercX(ORG[0])) / unit, (mercY(lat) - mercY(ORG[1])) / unit] };
const toLocalAt = ([lng, lat], at) => { const [ox, oy] = toM(at[0], at[1]), [x, y] = toM(lng, lat); return [x - ox, -(y - oy)] };
const contains = (poly, x, y) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside } return inside };
const segDist = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len)) : 0; return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) };
const lineDist = (x, y, line) => Math.min(...line.slice(0, -1).map((pt, i) => segDist(x, y, pt, line[i + 1])));
const obstacles = JSON.parse(readFileSync(new URL('./fixtures/tombs_obstacles.json', import.meta.url), 'utf8'));

// 구역마다: 모듈 · 기준점 · 숨김 면 개수 · 메시 이름 · 건물 자료(능역만)
const ZONES = {
  seonjeong: { id: 'sjn', module: seonjeong, at: SJN_AT, origin: SJN_ORIGIN, parts: ['wall', 'halls', 'frames'], buildings: SJN_BUILDINGS, hasTorches: true },
  jeongneung: { id: 'jng', module: jeongneung, at: JNG_AT, origin: JNG_ORIGIN, parts: ['wall', 'halls'], buildings: JNG_BUILDINGS, hasTorches: true },
  uireung: { id: 'uir', module: uireung, at: UIR_AT, origin: UIR_ORIGIN, parts: ['wall', 'halls', 'frames'], buildings: UIR_BUILDINGS, hasTorches: true },
  heonin: { id: 'hin', module: heonin, at: HIN_AT, origin: HIN_ORIGIN, parts: ['wall', 'halls', 'frames'], buildings: HIN_BUILDINGS, hasTorches: true },
  taegang: { id: 'tgn', module: taegang, at: TGN_AT, origin: TGN_ORIGIN, parts: ['wall', 'halls'], buildings: TGN_BUILDINGS, hasTorches: true },
  seokchon: { id: 'skc', module: seokchon, at: SKC_AT, origin: SKC_ORIGIN, parts: ['halls'], buildings: [], hasTorches: true },
  pungnap: { id: 'pnp', module: pungnap, at: PNP_AT, origin: PNP_ORIGIN, parts: ['wall'], buildings: [], hasTorches: false },
  mongchon: { id: 'mcn', module: mongchon, at: MCN_AT, origin: MCN_ORIGIN, parts: ['land', 'halls'], buildings: [], hasTorches: false },
};
const footprint = (zone, b) => Array.from({ length: b.p.length / 2 }, (_, i) => toLocalAt([zone.origin[0] + b.p[i * 2] / 1e6, zone.origin[1] + b.p[i * 2 + 1] / 1e6], zone.at));
const pairs = (list) => Array.from({ length: list.length / 2 }, (_, i) => ({ x: list[i * 2] / 10, y: list[i * 2 + 1] / 10 }));
const meshOf = (zone, part) => zone.module.buildMonument(`${zone.id}-${part}`);

for (const [name, zone] of Object.entries(ZONES)) {
  test(`${name}: 메시 정점이 모두 유한하고 법선이 단위 길이 · 재질 번호가 팔레트 안 · 정점 수가 휴대폰 한도 안`, () => {
    let total = 0;
    for (const part of zone.parts) {
      const data = meshOf(zone, part);
      assert.ok(data.length % STRIDE === 0 && data.length > 0, `${part} 정점 배열`);
      for (let i = 0; i < data.length; i += STRIDE) {
        for (let k = 0; k < STRIDE; k++) assert.ok(Number.isFinite(data[i + k]), `${part} 유한 ${i}+${k}`);
        assert.ok(Math.abs(Math.hypot(data[i + 3], data[i + 4], data[i + 5]) - 1) < 1e-4, `${part} 법선 단위 길이`);
        assert.ok(Number.isInteger(data[i + 6]) && data[i + 6] >= 0 && data[i + 6] < COLORS.length, `${part} 재질 ${data[i + 6]}`);
      }
      total += data.length / STRIDE;
    }
    assert.ok(total < 60000, `정점 수 ${total}`);
    assert.equal(zone.module.buildMonument('다른-이름').length, 0);
  });

  test(`${name}: MONUMENTS 에 구역 이름으로 등록되고 화면이 닿을 때만 받는다`, () => {
    const entries = MONUMENTS.filter(each => each.zone === name);
    assert.deepEqual(entries.map(each => each.id).sort(), zone.parts.map(part => `${zone.id}-${part}`).sort());
    const box = (lng, lat) => { const x = (lng + 180) / 360, y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2; return [x - 1e-6, y - 1e-6, x + 1e-6, y + 1e-6] };
    assert.equal(monumentsInView(box(...zone.at), name), true);
    assert.equal(monumentsInView(box(129.0, 35.1), name), false);
    assert.equal(monumentsInView(box(129.0, 35.1)), false);
  });

  test(`${name} 숨김: 기준점 둘레의 면이 있고 능역의 건물은 숨김 면 안에 든다(도시 팩 · 기본 모드 필터 모두)`, () => {
    const rings = monumentBuildingFilter()[1][1].coordinates;
    const hideRings = MONUMENT_HIDES.map((entry, index) => ({ entry, ring: rings[index][0] })).filter(({ entry }) => entry.area && Math.hypot(...toLocalAt(entry.lngLat, zone.at)) < 1);
    assert.ok(hideRings.length >= 1, '숨김 면');
    const hidden = (x, y) => hideRings.some(({ entry }) => contains(entry.area.map(pt => toLocalAt(pt, zone.at)), x, y));
    for (const b of zone.buildings) {
      if (b.p.length < 6) continue;
      const foot = footprint(zone, b), cx = foot.reduce((sum, pt) => sum + pt[0], 0) / foot.length, cy = foot.reduce((sum, pt) => sum + pt[1], 0) / foot.length;
      assert.ok(hidden(cx, cy), `${b.name || b.id}: 모델이 서는 자리인데 지도 건물이 남는다`);
    }
  });

  test(`${name} 횃불 · 나무: 정수 쌍 · 건물 위 · 담장 위에 없다`, async () => {
    const fx = obstacles[name];
    const feet = zone.buildings.filter(b => b.p.length >= 6).map(b => footprint(zone, b));
    const walls = fx.walls.map(wall => wall.map(pt => toLocalAt(pt, zone.at)));
    assert.ok(Math.abs(fx.at[0] - zone.at[0]) < 1e-9 && Math.abs(fx.at[1] - zone.at[1]) < 1e-9, '시험 자료의 기준점이 같다');
    if (!zone.hasTorches) { assert.equal(zone.module.torches, undefined); return }
    const { data } = zone.module.torches;
    assert.ok(data.length % 2 === 0 && data.every(Number.isInteger), '(x, y) 쌍 · 정수');
    assert.deepEqual(zone.module.torches.at, zone.at);
    const torches = pairs(data);
    assert.ok(torches.length >= 6, `횃불 수 ${torches.length}`);
    for (const torch of torches) {
      const where = `${torch.x},${torch.y}`;
      assert.ok(!feet.some(foot => contains(foot, torch.x, torch.y)), `건물 위 ${where}`);
      for (const wall of walls) assert.ok(lineDist(torch.x, torch.y, wall) > .8, `담장 위 ${where}`);
    }
    for (const kind of Object.values(zone.module.trees?.data ?? {})) {
      assert.ok(kind.length % 2 === 0 && kind.every(Number.isInteger));
      for (const tree of pairs(kind)) {
        assert.ok(!feet.some(foot => contains(foot, tree.x, tree.y)), `나무가 건물 위 ${tree.x},${tree.y}`);
        for (const path of fx.paths) assert.ok(lineDist(tree.x, tree.y, path.p.map(pt => toLocalAt(pt, zone.at))) > path.half, `나무가 길 위 ${tree.x},${tree.y}`);
      }
    }
  });
}

test('팔레트: 재질 번호(K)와 색 목록(COLORS)이 쇼더의 u_col 길이와 맞다', () => {
  const source = readFileSync(new URL('../web/city/monuments.mts', import.meta.url), 'utf8');
  const declared = Number(/uniform vec3 u_col\[(\d+)\]/.exec(source)?.[1]);
  assert.equal(declared, COLORS.length, 'u_col 길이 = COLORS 길이');
  assert.ok(K.grass < COLORS.length && K.rubble < COLORS.length);
  assert.ok(source.includes('k == 30') && source.includes('k == 31'), '잔디 · 막돌 분기');
  assert.equal(K.grass, 30); assert.equal(K.rubble, 31);
});

test('석촌동 고분군: 제3호분 3단 · 높이 4.5 m, 가장 큰 단 50 m 안팎 · 막돌 · 잔디 재질', () => {
  const mesh = meshOf(ZONES.seokchon, 'halls'), kinds = new Set();
  let maxZ = 0, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < mesh.length; i += STRIDE) { kinds.add(mesh[i + 6]); maxZ = Math.max(maxZ, mesh[i + 2]); if (mesh[i + 6] === K.rubble) { minX = Math.min(minX, mesh[i]); maxX = Math.max(maxX, mesh[i]) } }
  assert.ok(Math.abs(maxZ - 4.5) < .01, `최고 높이 ${maxZ}`);
  assert.ok(kinds.has(K.rubble), '막돌 재질');
  assert.ok(maxX - minX > 45 && maxX - minX < 120, `막돌 폭 ${maxX - minX}`);
});

test('풍납토성: 성벽 단면 높이가 RAMPART.height 이고 숨김 띠가 단면 아래 폭보다 넓다', () => {
  const mesh = meshOf(ZONES.pungnap, 'wall');
  let maxZ = 0; for (let i = 0; i < mesh.length; i += STRIDE) maxZ = Math.max(maxZ, mesh[i + 2]);
  assert.ok(Math.abs(maxZ - pungnap.RAMPART.height) < .01, `성벽 높이 ${maxZ}`);
  assert.ok(pungnap.RAMPART.halfBase > pungnap.RAMPART.halfCrest && pungnap.RAMPART.halfBase >= 15);
});

test('풍납토성: 점 둘뿐인 긴 도막도 도막마다 성벽 면적이 길이에 걸맞게 나온다(가운데 단면이 있다)', () => {
  const frame = frameOf(PNP_AT, PNP_ORIGIN);
  assert.ok(PNP_LINES.some((flat) => flat.length === 4), '점 2개 도막이 자료에 있다');
  for (const flat of PNP_LINES) {
    const line = pointsOf(flat, PNP_ORIGIN, frame), w = new MeshWriter();
    pungnap.rampart(w, line);
    let length = 0; for (let i = 1; i < line.length; i++) length += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    let area = 0;
    for (let i = 0; i < w.data.length; i += STRIDE * 3) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = [w.data[i], w.data[i + 1], w.data[i + 2], w.data[i + STRIDE], w.data[i + STRIDE + 1], w.data[i + STRIDE + 2], w.data[i + 2 * STRIDE], w.data[i + 2 * STRIDE + 1], w.data[i + 2 * STRIDE + 2]];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    // 단면 둘레 약 38 m(사면 둘 + 마루) · 양끝 TAPER 25 m 가 땅으로 잦아들어도 길이 × 20 m 는 넘는다
    assert.ok(area > Math.max(0, length - 2 * pungnap.TAPER) * 20, `도막 ${Math.round(length)} m: 면적 ${Math.round(area)}`);
    if (length > 100) assert.ok(area > length * 12, `긴 도막 ${Math.round(length)} m 면적 ${Math.round(area)} 가 너무 작다`);
  }
});

test('선정릉: 봉분이 셋 — 성종 · 정현왕후 · 중종(OSM historic=tomb 369687345 · 369687346 · 369687342)', () => {
  assert.deepEqual(SJN_TOMBS.map((tomb) => tomb.id).sort(), [369687342, 369687345, 369687346]);
});

test('의릉: 경종릉이 선의왕후릉보다 위 — 호석 바닥 높이 6.5 m · 3 m, 잔디 언덕이 봉분 뒤로 더 오른다', () => {
  const frame = frameOf(UIR_AT, UIR_ORIGIN), halls = meshOf(ZONES.uireung, 'halls');
  const base = (id) => {
    const [cx, cy] = centroidOf(pointsOf(UIR_TOMBS.find((tomb) => tomb.id === id).p, UIR_ORIGIN, frame));
    let low = Infinity; for (let i = 0; i < halls.length; i += STRIDE) if (halls[i + 6] === K.granite && Math.hypot(halls[i] - cx, halls[i + 1] - cy) < 12) low = Math.min(low, halls[i + 2]);
    return low;
  };
  assert.ok(Math.abs(base(480559564) - 6.5) < .01 && Math.abs(base(480559565) - 3) < .01, `경종 ${base(480559564)} · 선의왕후 ${base(480559565)}`);
  const lawn = meshOf(ZONES.uireung, 'wall'); let top = 0; for (let i = 0; i < lawn.length; i += STRIDE) if (lawn[i + 6] === K.grass) top = Math.max(top, lawn[i + 2]);
  assert.ok(top > 6.5 + 1, `언덕 꼭대기 ${top}`);
});

test('왕릉 공통: 잔디 언덕은 3~15 m 높이이고, 정자각 · 비각 바닥(0)을 묻지 않는다', () => {
  for (const name of ['seonjeong', 'jeongneung', 'uireung', 'heonin', 'taegang']) {
    const zone = ZONES[name], frame = frameOf(zone.at, zone.origin), wall = meshOf(zone, 'wall');
    let top = 0; for (let i = 0; i < wall.length; i += STRIDE) if (wall[i + 6] === K.grass) top = Math.max(top, wall[i + 2]);
    assert.ok(top > 3 && top < 15, `${name} 언덕 높이 ${top}`);
    for (const each of zone.buildings.filter((item) => /정자각|비각/.test(item.name))) {
      const [cx, cy] = centroidOf(pointsOf(each.p, zone.origin, frame));
      for (let i = 0; i < wall.length; i += STRIDE) if (wall[i + 6] === K.grass && Math.hypot(wall[i] - cx, wall[i + 1] - cy) < 4) assert.ok(wall[i + 2] < .3, `${name} ${each.name} 바닥을 언덕이 덮는다`);
    }
  }
});

test('몽촌토성: 서 · 남서 · 북서 · 남동 큰 언덕(잔디) — 높이 6~7 m, 움집터 둘레 40 m 는 평지', () => {
  const land = meshOf(ZONES.mongchon, 'land'); let top = 0, near = 0;
  for (let i = 0; i < land.length; i += STRIDE) { assert.equal(land[i + 6], K.grass); top = Math.max(top, land[i + 2]); if (Math.hypot(land[i], land[i + 1]) < 40) near = Math.max(near, land[i + 2]) }
  assert.ok(top > 5.5 && top < 7.5, `언덕 높이 ${top}`);
  assert.ok(near < .5, `움집터 둘레 높이 ${near}`);
});

test('몽촌토성: 움막 둘 — 뾰족 지붕 높이 4.2 m, 문 틈이 빛난다(터널 재질)', () => {
  const mesh = meshOf(ZONES.mongchon, 'halls');
  let maxZ = 0, door = 0; for (let i = 0; i < mesh.length; i += STRIDE) { maxZ = Math.max(maxZ, mesh[i + 2]); if (mesh[i + 6] === K.tunnel) door++ }
  assert.ok(Math.abs(maxZ - 4.2) < .05, `움집 높이 ${maxZ}`);
  assert.ok(door >= 8, `문 정점 ${door}`);
});

test('능 봉분: 선정릉 · 헌인릉은 정자각 · 봉분 · 곡장이 있다(잔디 · 화강석 · 기와)', () => {
  for (const zone of [ZONES.seonjeong, ZONES.heonin]) {
    const kinds = new Set(), mesh = meshOf(zone, 'halls');
    let tall = 0; for (let i = 0; i < mesh.length; i += STRIDE) { kinds.add(mesh[i + 6]); if (mesh[i + 2] > 5) tall++ }
    assert.ok(kinds.has(K.grass), '봉분 잔디'); assert.ok(kinds.has(0), '호석 화강석'); assert.ok(tall > 50, `정자각 지붕 ${tall}`);
  }
});

test('tombRings: 구역마다 숨김 면을 합쳐 낸다 · 모두 닫힌 점 3개 이상', () => {
  const rings = tombRings();
  assert.ok(rings.length >= 8);
  for (const ring of rings) assert.ok(ring.length >= 3 && ring.every(pt => Number.isFinite(pt[0]) && Number.isFinite(pt[1])));
});

test('import 격리: 능 · 토성 구역 모듈은 첫 화면 모듈(자료 · 본체)이 정적으로 부르지 않는다', () => {
  const data = readFileSync(new URL('../web/city/monuments_data.mts', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../web/city/monuments.mts', import.meta.url), 'utf8');
  for (const zone of Object.keys(ZONES)) {
    assert.ok(!new RegExp(`^import .*monuments_${zone}`, 'm').test(data), `${zone}: 자료가 정적 import`);
    assert.ok(!new RegExp(`^import .*monuments_${zone}`, 'm').test(engine), `${zone}: 엔진이 정적 import`);
    assert.ok(engine.includes(`import('./monuments_${zone}.mts')`), `${zone}: 지연 import`);
  }
  assert.ok(!/^import .*monuments_tomb_kit/m.test(engine) && !/^import .*monuments_tomb_kit/m.test(data));
});
