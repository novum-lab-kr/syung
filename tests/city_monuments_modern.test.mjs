// 근현대 문화유산 여섯 곳(탑골공원 · 명동성당 · 문화역서울 284 · 서대문형무소 · 조계사 · 봉은사) 전용 모델 시험.
// 메시 · 자리 · 숨김 목록 · 나무 · 재질 규칙 · 구역 분리. (경복궁 · 종묘 쪽 시험은 city_monuments.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as data from '../web/city/monuments_data.mts';
import { MONUMENTS, MONUMENT_HIDES, monumentsInView, monumentBuildingFilter } from '../web/city/monuments_data.mts';
import { K, COLORS } from '../web/city/monument_parts.mts';
import { toM } from '../web/city/life.mts';

const STRIDE = 8;
const SITES = {
  wongaksa: { P: 'WG', ids: ['wg-wall', 'wg-halls', 'wg-frames'], ring: data.wgRing, at: data.WG_AT, origin: data.WG_ORIGIN, buildings: 'WG_BUILDINGS' },
  myeongdong: { P: 'MD', ids: ['md-halls', 'md-frames'], ring: data.mdRing, at: data.MD_AT, origin: data.MD_ORIGIN, buildings: 'MD_BUILDINGS' },
  seoul284: { P: 'S2', ids: ['s2-halls'], ring: data.s2Ring, at: data.S2_AT, origin: data.S2_ORIGIN, buildings: 'S2_BUILDINGS' },
  seodaemun: { P: 'SD', ids: ['sd-wall', 'sd-halls', 'sd-frames'], ring: data.sdRing, at: data.SD_AT, origin: data.SD_ORIGIN, buildings: 'SD_BUILDINGS', walls: 'SD_WALLS', trees: 'SD_TREES' },
  jogyesa: { P: 'JG', ids: ['jg-halls', 'jg-frames'], ring: data.jgRing, at: data.JG_AT, origin: data.JG_ORIGIN, buildings: 'JG_BUILDINGS', trees: 'JG_TREES' },
  bongeunsa: { P: 'BE', ids: ['be-wall', 'be-halls', 'be-frames'], ring: data.beRing, at: data.BE_AT, origin: data.BE_ORIGIN, buildings: 'BE_BUILDINGS', walls: 'BE_WALLS', trees: 'BE_TREES' },
};
const mods = {}, datas = {}, treeDatas = {};
for (const [name, site] of Object.entries(SITES)) {
  mods[name] = await import(`../web/city/monuments_${name}.mts`);
  datas[name] = await import(`../web/city/monuments_${name}_data.mts`);
  if (site.trees) treeDatas[name] = await import(`../web/city/monuments_${name}_trees_data.mts`);
}
const neighbours = JSON.parse(readFileSync(new URL('./fixtures/modern_heritage_neighbours.json', import.meta.url), 'utf8'));

const localAt = ([lng, lat], at) => { const [ox, oy] = toM(at[0], at[1]), [x, y] = toM(lng, lat); return [x - ox, -(y - oy)] };
const contains = (poly, x, y) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside } return inside };
const segDist = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy, t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) };
const lineDist = (x, y, line) => Math.min(...line.slice(0, -1).map((pt, i) => segDist(x, y, pt, line[i + 1])));
const footprints = (name) => { const site = SITES[name]; return datas[name][site.buildings].map(b => Array.from({ length: b.p.length / 2 }, (_, i) => localAt([site.origin[0] + b.p[i * 2] / 1e6, site.origin[1] + b.p[i * 2 + 1] / 1e6], site.at))) };
const mercatorBox = (lng, lat) => { const x = (lng + 180) / 360, y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2; return [x - 1e-6, y - 1e-6, x + 1e-6, y + 1e-6] };
const kindsOf = (mesh) => { const kinds = new Set(); for (let i = 0; i < mesh.length; i += STRIDE) kinds.add(mesh[i + 6]); return kinds };
const topOf = (mesh) => { let top = 0; for (let i = 0; i < mesh.length; i += STRIDE) top = Math.max(top, mesh[i + 2]); return top };

test('여섯 구역 메시: 정점이 유한하고 법선이 단위 길이 · 삼각형 단위 · 휴대폰 메시 한도 · 없는 모델은 빈 메시', () => {
  for (const [name, site] of Object.entries(SITES)) {
    for (const id of site.ids) {
      const mesh = mods[name].buildMonument(id);
      assert.ok(mesh.length > 0 && mesh.length % (STRIDE * 3) === 0, `${id} 정점 수`);
      assert.ok(mesh.byteLength < 1.5 * 1024 * 1024, `${id} 메시 ${mesh.byteLength} B`);
      for (let i = 0; i < mesh.length; i += STRIDE) {
        for (let field = 0; field < STRIDE; field++) assert.ok(Number.isFinite(mesh[i + field]), `${id} 유한 ${i}+${field}`);
        assert.ok(Math.abs(Math.hypot(mesh[i + 3], mesh[i + 4], mesh[i + 5]) - 1) < 1e-3, `${id} 법선`);
        assert.ok(mesh[i + 6] >= 0 && mesh[i + 6] < COLORS.length && Number.isInteger(mesh[i + 6]), `${id} 재질 번호`);
      }
    }
    assert.equal(mods[name].buildMonument('없는 모델').length, 0);
  }
});
test('여섯 구역 등록: MONUMENTS 의 구역 · id 가 구역 파일이 짓는 것과 같고, 구역은 자기 자리가 보일 때만 켜진다', () => {
  for (const [name, site] of Object.entries(SITES)) {
    assert.deepEqual(MONUMENTS.filter(entry => entry.zone === name).map(entry => entry.id), site.ids, `${name} 등록 id`);
    const box = mercatorBox(...site.at);
    assert.equal(monumentsInView(box, name), true, `${name} 자기 자리`);
    for (const other of Object.keys(SITES).filter(each => each !== name)) {
      const far = Math.hypot((SITES[other].at[0] - site.at[0]) * 88000, (SITES[other].at[1] - site.at[1]) * 111000);
      if (far > 2200) assert.equal(monumentsInView(box, other), false, `${name} 자리에서 ${other} 켜짐`);
    }
  }
  assert.equal(monumentsInView(mercatorBox(127.2, 37.45), 'bongeunsa'), false);
  const source = readFileSync(new URL('../web/city/monuments.mts', import.meta.url), 'utf8');
  for (const name of Object.keys(SITES)) assert.ok(source.includes(`import('./monuments_${name}.mts')`), `${name} 지연 로드 줄`);
  for (const site of Object.values(SITES)) assert.ok(source.includes(`${site.P.toLowerCase()}Ring()`), `${site.P} 도시 나무 비우기 둘레`);
});
test('지도 건물 자료: 둘레 안의 건물은 모두 그려지고(이름이 있든 없든) 둘레 안에 든다', () => {
  for (const [name, site] of Object.entries(SITES)) {
    const ring = site.ring().map(pt => localAt(pt, site.at)), list = datas[name][site.buildings];
    assert.ok(list.length > 0, `${name} 건물 없음`);
    for (const foot of footprints(name)) {
      const cx = foot.reduce((sum, pt) => sum + pt[0], 0) / foot.length, cy = foot.reduce((sum, pt) => sum + pt[1], 0) / foot.length;
      assert.ok(contains(ring, cx, cy), `${name} 둘레 밖 건물`);
    }
  }
  assert.ok(datas.wongaksa.WG_BUILDINGS.some(b => b.id === 320791143 && b.name === '서울원각사지십층석탑'), '십층석탑(보호각) 자리');
  assert.ok(datas.myeongdong.MD_BUILDINGS.some(b => b.id === 210335697) && datas.myeongdong.MD_BUILDINGS.some(b => b.id === 1139745172 && b.h === 47), '명동 본당 · 47 m 종탑 자리');
  for (const need of ['중앙사', '9옥사', '10옥사', '11옥사', '12옥사', '여옥사', '사형장', '격벽장', '서대문형무소 역사관']) assert.ok(datas.seodaemun.SD_BUILDINGS.some(b => b.name === need), `서대문 ${need}`);
  for (const need of ['대웅전', '일주문']) assert.ok(datas.jogyesa.JG_BUILDINGS.some(b => b.name === need), `조계사 ${need}`);
  for (const need of ['봉은사 판전', '봉은사 대웅전']) assert.ok(datas.bongeunsa.BE_BUILDINGS.some(b => b.name === need), need);
});
test('옛 건물 숨김: 여섯 곳 모두 둘레 다각형이 걸려 있고, 둘레 바로 밖 이웃 건물 수백 채는 하나도 숨지 않는다', () => {
  const filter = monumentBuildingFilter(), rings = filter[1][1].coordinates;
  assert.equal(rings.length, MONUMENT_HIDES.length);
  let checked = 0;
  for (const [name, site] of Object.entries(SITES)) {
    const hide = MONUMENT_HIDES.find(each => each.area && each.lngLat[0] === site.at[0] && each.lngLat[1] === site.at[1]);
    assert.ok(hide && hide.minH === 0, `${name} 숨김 구역`);
    const ring = hide.area.map(pt => localAt(pt, site.at));
    assert.ok(ring.every(([x, y]) => Math.hypot(x, y) <= hide.radiusM), `${name} 둘레가 반경 ${hide.radiusM} m 를 넘는다`);
    assert.ok(neighbours[name].length > 10, `${name} 이웃 자료`);
    for (const [lng, lat] of neighbours[name]) { assert.ok(!contains(ring, ...localAt([lng, lat], site.at)), `${name} 이웃 건물이 숨김 둘레 안 ${lng},${lat}`); checked++ }
    assert.equal(hide.area.length, site.ring().length);
  }
  assert.ok(checked > 600);
});
test('나무: 정수 쌍이고 둘레 안 · 건물 위 · 담 위에 없다 · 구역 파일이 내놓는 것은 자료와 같다 · 횃불은 없다(근거 자료 없음)', () => {
  for (const [name, site] of Object.entries(SITES)) {
    assert.equal(mods[name].torches, undefined, `${name} 횃불`);
    if (!site.trees) { assert.equal(mods[name].trees, undefined, `${name} 나무는 자료가 없다`); continue }
    assert.equal(mods[name].trees.at, site.at);
    const treeData = treeDatas[name][site.trees], ring = site.ring().map(pt => localAt(pt, site.at)), foots = footprints(name);
    assert.equal(mods[name].trees.data, treeData);
    const walls = (datas[name][site.walls] || []).map(wall => Array.from({ length: wall.p.length / 2 }, (_, i) => localAt([site.origin[0] + wall.p[i * 2] / 1e6, site.origin[1] + wall.p[i * 2 + 1] / 1e6], site.at)));
    let count = 0;
    for (const list of Object.values(treeData)) {
      assert.equal(list.length % 2, 0); assert.ok(list.every(Number.isInteger));
      for (let i = 0; i < list.length; i += 2) {
        const x = list[i] / 10, y = list[i + 1] / 10, where = `${name} ${x},${y}`; count++;
        assert.ok(contains(ring, x, y), `둘레 밖 ${where}`);
        assert.ok(!foots.some(foot => contains(foot, x, y)), `건물 위 ${where}`);
        for (const wall of walls) assert.ok(lineDist(x, y, wall) > .8, `담 위 ${where}`);
      }
    }
    assert.ok(count > 0 && count < 2000, `${name} 나무 수 ${count}`);
  }
  assert.ok(datasOnlyPine(treeDatas.jogyesa.JG_TREES) === 1, '조계사 백송 한 그루');
});
const datasOnlyPine = (trees) => trees.pine.length / 2;

test('탑골공원: 십층석탑은 12 m 안팎(위키 12 m)이고 보호각은 살만 그려 탑을 가린다 — 불투명 유리 · 창 불빛 재질이 없다', () => {
  const halls = mods.wongaksa.buildMonument('wg-halls'), kinds = kindsOf(halls);
  const site = SITES.wongaksa, foot = footprints('wongaksa')[datas.wongaksa.WG_BUILDINGS.findIndex(b => b.id === 320791143)];
  const cx = foot.reduce((sum, pt) => sum + pt[0], 0) / foot.length, cy = foot.reduce((sum, pt) => sum + pt[1], 0) / foot.length;
  let stoneTop = 0;
  for (let i = 0; i < halls.length; i += STRIDE) if (halls[i + 6] === K.stone && Math.hypot(halls[i] - cx, halls[i + 1] - cy) < 6.5) stoneTop = Math.max(stoneTop, halls[i + 2]);
  assert.ok(stoneTop > 11 && stoneTop < 13.5, `탑 높이 ${stoneTop}`);
  assert.ok(kinds.has(K.shield), '보호각 살');
  for (const kind of [K.glass, K.pane, K.window, K.tunnel]) assert.ok(!kinds.has(kind), `보호각 · 탑에 재질 ${kind}`);
  assert.ok(site.at && topOf(halls) < 17);
});
test('명동성당: 종탑 꼭대기 47 m(OSM) · 붉은 벽돌 · 슬레이트 · 뾰족 창 유리, 한지 창이나 문 안 불빛은 없다', () => {
  const halls = mods.myeongdong.buildMonument('md-halls'), kinds = kindsOf(halls);
  assert.ok(Math.abs(topOf(halls) - 47) < .6, `종탑 높이 ${topOf(halls)}`);
  for (const kind of [K.redBrick, K.slate, K.pane, K.stone]) assert.ok(kinds.has(kind), `재질 ${kind}`);
  for (const kind of [K.window, K.tunnel, K.glass]) assert.ok(!kinds.has(kind), `재질 ${kind}`);
});
test('문화역서울 284: 붉은 벽돌 · 흰 돌 띠 · 둥근 창 · 녹청 돔(밤에도 불빛 재질 아님)', () => {
  const halls = mods.seoul284.buildMonument('s2-halls'), kinds = kindsOf(halls);
  for (const kind of [K.redBrick, K.stone, K.pane, K.copper, K.slate]) assert.ok(kinds.has(kind), `재질 ${kind}`);
  for (const kind of [K.window, K.tunnel]) assert.ok(!kinds.has(kind));
  assert.ok(topOf(halls) > 20 && topOf(halls) < 28, `돔 꼭대기 ${topOf(halls)}`);
});
test('서대문형무소: 옥사는 붉은 벽돌 · 창은 불빛 없는 어두운 띠 · 사형장은 목재 · 한지 · 문 안 불빛이 없다 · 둘레는 벽돌 담 4 m', () => {
  const halls = mods.seodaemun.buildMonument('sd-halls'), kinds = kindsOf(halls);
  for (const kind of [K.redBrick, K.band, K.timber, K.slate]) assert.ok(kinds.has(kind), `재질 ${kind}`);
  for (const kind of [K.window, K.tunnel, K.pane, K.glass]) assert.ok(!kinds.has(kind), `재질 ${kind}`);
  const wall = mods.seodaemun.buildMonument('sd-wall');
  assert.ok(Math.abs(topOf(wall) - 4) < .01 && kindsOf(wall).has(K.redBrick) && kindsOf(wall).has(K.band));
});
test('조계사 · 봉은사: 한옥 전각은 기와 · 단청 · 기둥 재질이 있고, 서양식 재질(벽돌 · 슬레이트 · 유리)이 섞이지 않는다', () => {
  for (const [name, id] of [['jogyesa', 'jg-halls'], ['bongeunsa', 'be-halls']]) {
    const kinds = kindsOf(mods[name].buildMonument(id));
    for (const kind of [K.giwa, K.red, K.dancheong, K.granite]) assert.ok(kinds.has(kind), `${id} 재질 ${kind}`);
    for (const kind of [K.redBrick, K.slate, K.glass, K.greyBrick]) assert.ok(!kinds.has(kind), `${id} 서양식 재질 ${kind}`);
  }
  assert.ok(topOf(mods.jogyesa.buildMonument('jg-halls')) > 12 && topOf(mods.bongeunsa.buildMonument('be-halls')) > 9);
});
// 정점 중 조건에 맞는 것의 [x, y, z, 법선 z] 를 모은다
const vertsOf = (mesh, kind) => { const out = []; for (let i = 0; i < mesh.length; i += STRIDE) if (mesh[i + 6] === kind) out.push([mesh[i], mesh[i + 1], mesh[i + 2], mesh[i + 5]]); return out };
test('문화역서울 284: 지붕이 평평한 한 장이 아니다 — 기울어진 슬레이트 면 · 양 끝 전각이 더 높다 · 동쪽 현관에 아치 창 셋', () => {
  const halls = mods.seoul284.buildMonument('s2-halls');
  const slate = vertsOf(halls, K.slate), sloped = slate.filter(v => v[3] > .2 && v[3] < .95);
  assert.ok(sloped.length > 60, `기울어진 슬레이트 정점 ${sloped.length}`);
  const topEnds = Math.max(...slate.filter(v => Math.abs(v[1]) > 55).map(v => v[2])), topMiddle = Math.max(...slate.filter(v => Math.abs(v[1]) < 30 && v[0] < 0).map(v => v[2]));
  assert.ok(topEnds > topMiddle + 2 && topEnds > 19, `끝 전각 ${topEnds} 몸통 ${topMiddle}`);
  const porticoPanes = vertsOf(halls, K.pane).filter(v => v[0] > 13.5 && v[2] < 11);
  assert.ok(porticoPanes.length >= 3 * 3 * 2, `현관 아치 창 정점 ${porticoPanes.length}`);   // 아치 셋 · 칸마다 틀과 유리 · 정점이 여럿
});
test('조계사: 대웅전 문은 검은 면이 아니고 연한 목재색 · 십층 사리탑(앞마당 · 약 11 m) · 회화나무 한 그루가 탑 · 건물 · 백송과 겹치지 않는다', () => {
  const halls = mods.jogyesa.buildMonument('jg-halls'), kinds = kindsOf(halls);
  assert.ok(!kinds.has(K.tunnel) && kinds.has(K.timber), '문 재질');
  const pagodaAt = [-26, -45];
  const near = (v) => Math.hypot(v[0] - pagodaAt[0], v[1] - pagodaAt[1]) < 3.6;
  const stone = [K.granite, K.stone, K.gilt].flatMap(kind => vertsOf(halls, kind)).filter(near), top = Math.max(...stone.map(v => v[2]));
  assert.ok(top > 10.5 && top < 12, `탑 높이 ${top}`);
  const caps = new Set(vertsOf(halls, K.stone).filter(near).map(v => Math.round(v[2] * 100)));
  assert.ok(caps.size >= 12, `지붕돌 높이 층 ${caps.size}`);   // 기단 둘 + 열 층의 위 · 아래 높이가 서로 다르다
  const { JG_TREES } = treeDatas.jogyesa;
  assert.equal(JG_TREES.wide.length, 0, '회화나무는 전용 모델 — 공용 나무를 쓰지 않는다');
  const treeAt = [-7, -48], onTree = (v) => Math.hypot(v[0] - treeAt[0], v[1] - treeAt[1]) < 12;
  const crown = vertsOf(halls, K.grass).filter(onTree), trunk = vertsOf(halls, K.timber).filter(v => Math.hypot(v[0] - treeAt[0], v[1] - treeAt[1]) < 1.2);
  const crownTop = Math.max(...crown.map(v => v[2])), crownSpread = Math.max(...crown.map(v => Math.hypot(v[0] - treeAt[0], v[1] - treeAt[1])));
  assert.ok(crownTop > 23.5 && crownTop < 24.5, `회화나무 높이 ${crownTop}`);   // 출처: 높이 24 m
  assert.ok(crownSpread > 9 && crownSpread < 14, `수관 반지름 ${crownSpread}`);
  assert.ok(Math.max(...trunk.map(v => Math.hypot(v[0] - treeAt[0], v[1] - treeAt[1]))) > .9, '굵은 줄기(둘레 4 m ≈ 지름 1.3 m)');
  assert.ok(Math.hypot(treeAt[0] - pagodaAt[0], treeAt[1] - pagodaAt[1]) > crownSpread + 4, '나무가 탑과 겹침');
  const [pineX, pineY] = [JG_TREES.pine[0] / 10, JG_TREES.pine[1] / 10];
  assert.ok(Math.hypot(treeAt[0] - pineX, treeAt[1] - pineY) > crownSpread + 3, '나무가 백송과 겹침');
  for (const foot of footprints('jogyesa')) {
    assert.ok(!contains(foot, pagodaAt[0], pagodaAt[1]) && !contains(foot, treeAt[0], treeAt[1]));
    assert.ok(!crown.some(v => v[2] < 12 && contains(foot, v[0], v[1])), '수관 아래쪽이 건물 안');
  }
});
test('봉은사: 미륵대불 — 높이 23 m(위키) · 밝은 돌 입상과 머리 위 보개 · 건물 · 나무 위에 서지 않는다 · 얼굴 · 조각 재질 없음', () => {
  const halls = mods.bongeunsa.buildMonument('be-halls');
  const buddhaAt = [-15, 140], near = (v) => Math.hypot(v[0] - buddhaAt[0], v[1] - buddhaAt[1]) < 6;
  const figure = vertsOf(halls, K.trim).filter(near), base = vertsOf(halls, K.stone).filter(near);
  assert.ok(figure.length > 200 && base.length > 100, `입상 정점 ${figure.length} · 받침 · 보개 ${base.length}`);
  const top = Math.max(...base.map(v => v[2]));
  assert.ok(Math.abs(top - 23) < .1, `대불 높이 ${top}`);
  const canopy = base.filter(v => v[2] > 21), head = Math.max(...figure.map(v => v[2]));
  assert.ok(canopy.length > 20 && head > 19.5 && head < 21 && Math.max(...canopy.map(v => Math.hypot(v[0] - buddhaAt[0], v[1] - buddhaAt[1]))) > 3.5, `보개 · 머리 ${head}`);
  assert.ok(!footprints('bongeunsa').some(foot => contains(foot, buddhaAt[0], buddhaAt[1])), '대불이 건물 위');
  const ring = SITES.bongeunsa.ring().map(pt => localAt(pt, SITES.bongeunsa.at));
  assert.ok(contains(ring, buddhaAt[0], buddhaAt[1]), '대불이 둘레 밖');
  const { BE_TREES } = treeDatas.bongeunsa;
  for (const list of Object.values(BE_TREES)) for (let i = 0; i < list.length; i += 2) assert.ok(Math.hypot(list[i] / 10 - buddhaAt[0], list[i + 1] / 10 - buddhaAt[1]) >= 7.5, `대불 둘레 나무 ${list[i]},${list[i + 1]}`);
  for (const kind of [K.pane, K.window, K.tunnel, K.glass]) assert.ok(!vertsOf(halls, kind).some(near), `대불에 재질 ${kind}`);
});
test('고정 규칙: 여섯 구역 파일과 근현대 부품은 모드 · 다른 구역 · 경복궁 자료를 import 하지 않는다', () => {
  const files = [...Object.keys(SITES).map(name => `monuments_${name}.mts`), 'monument_modern.mts'];
  const allowed = /^\.\/(monument_parts|monument_modern|monuments_hanok|monuments_western_modern|monuments_data|life|monuments_(wongaksa|myeongdong|seoul284|seodaemun|jogyesa|bongeunsa)(_trees)?_data)\.mts$/;
  for (const file of files) {
    const source = readFileSync(new URL(`../web/city/${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/from '([^']+)'/g)) assert.ok(allowed.test(match[1]), `${file} 이 ${match[1]} 를 부른다`);
    assert.ok(!/modes\/|transition|settings\(/.test(source.replace(/\/\/.*$/gm, '')), `${file} 모드 이름 사용`);
    for (const other of Object.keys(SITES)) if (file !== `monuments_${other}.mts` && file.startsWith('monuments_')) assert.ok(!source.includes(`monuments_${other}`), `${file} 이 다른 구역 ${other} 를 부른다`);
  }
});

test('묶음 4 · 5 재질 번호와 색이 합친 뒤에도 그대로', () => {
  const expected = { grass: [30, '#7A9250'], rubble: [31, '#A8A08E'], greyBrick: [32, '#8F8D88'], copper: [33, '#3F7A63'], shield: [34, '#9DB8BF'] };
  for (const [name, [kind, color]] of Object.entries(expected)) { assert.equal(K[name], kind, `K.${name}`); assert.equal(COLORS[kind], color, `COLORS[${kind}]`) }
  assert.equal(new Set(Object.values(K)).size, Object.keys(K).length, 'K 번호 겹침 없음');
});
