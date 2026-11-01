// 한양도성 북쪽 문(숙정문 · 창의문) + 성곽 선 + 북촌 한옥마을 전용 모델 시험.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as data from '../web/city/monuments_data.mts';
import { MONUMENTS, MONUMENT_HIDES, GATE_YARDS, monumentsInView } from '../web/city/monuments_data.mts';
import { COLORS } from '../web/city/monument_parts.mts';

const STRIDE = 8;
const SITES = {
  sukjeongmun: { ids: ['sj-gate', 'sj-wall'], at: data.SJM_AT },
  changuimun: { ids: ['cu-gate', 'cu-wall'], at: data.CUM_AT },
  bukchon: { ids: ['bc-halls', 'bc-frames'], at: data.BC_AT },
};
const mods = {};
for (const name of Object.keys(SITES)) mods[name] = await import(`../web/city/monuments_${name}.mts`);
const box = ([lng, lat]) => { const x = (lng + 180) / 360, y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2; return [x - 1e-6, y - 1e-6, x + 1e-6, y + 1e-6] };

test('세 구역 메시: 유한 · 법선 단위 · 재질 번호 · 휴대폰 한도 · 없는 모델은 빈 메시', () => {
  for (const [name, site] of Object.entries(SITES)) {
    for (const id of site.ids) {
      const mesh = mods[name].buildMonument(id);
      assert.ok(mesh.length > 0 && mesh.length % (STRIDE * 3) === 0, `${id} 정점 수`);
      assert.ok(mesh.byteLength < 1.5 * 1024 * 1024, `${id} 메시 ${mesh.byteLength} B`);
      for (let i = 0; i < mesh.length; i += STRIDE) {
        for (let field = 0; field < STRIDE; field++) assert.ok(Number.isFinite(mesh[i + field]), `${id} 유한`);
        assert.ok(Math.abs(Math.hypot(mesh[i + 3], mesh[i + 4], mesh[i + 5]) - 1) < 1e-3, `${id} 법선`);
        assert.ok(Number.isInteger(mesh[i + 6]) && mesh[i + 6] >= 0 && mesh[i + 6] < COLORS.length, `${id} 재질`);
      }
    }
    assert.equal(mods[name].buildMonument('없는 모델').length, 0);
  }
});
test('세 구역 등록: id · 구역이 구역 파일과 같고, 자기 자리가 보일 때만 켜진다(기본 · 나라는 같은 전용 모델이라 제외 없음)', () => {
  for (const [name, site] of Object.entries(SITES)) {
    assert.deepEqual(MONUMENTS.filter(entry => entry.zone === name).map(entry => entry.id), site.ids);
    assert.equal(monumentsInView(box(site.at), name), true);
    for (const other of Object.keys(SITES).filter(each => each !== name)) {
      const far = Math.hypot((SITES[other].at[0] - site.at[0]) * 88000, (SITES[other].at[1] - site.at[1]) * 111000);
      if (far > 1800) assert.equal(monumentsInView(box(site.at), other), false, `${name} 자리에서 ${other} 켜짐`);
    }
  }
  assert.equal(monumentsInView(box([126.9770, 37.5745]), 'bukchon'), false, '경복궁 앞에서 북촌이 켜지면 안 된다');
  for (const id of ['sj-gate', 'cu-gate']) assert.equal(MONUMENTS.find(entry => entry.id === id).openingsOnly, true);
});
test('문 둘레 지도 건물 비우기: 문 외곽을 덮는 정확한 원 · 북촌은 둘레 다각형', () => {
  for (const [at, name] of [[data.SJM_AT, 'sukjeongmun'], [data.CUM_AT, 'changuimun']]) {
    const yard = GATE_YARDS.find(each => each.lngLat === at);
    assert.ok(yard && yard.exact, `${name} 원`);
    const far = Math.max(...mods[name].SHAPE.base.map(([x, y]) => Math.hypot(x, y)));
    assert.ok(yard.radiusM >= far && yard.radiusM < far + 3, `${name} 원 반경 ${yard.radiusM} · 외곽 ${far}`);
    assert.ok(MONUMENT_HIDES.includes(yard));
  }
  assert.ok(MONUMENT_HIDES.some(each => each.area && each.lngLat === data.BC_AT));
});
test('성문 모델: 단층 3칸 · 횃불 네 개는 통로 축 좌우 대칭이고 육축 앞뒤 면 밖에 선다', () => {
  for (const [name, yawDeg] of [['sukjeongmun', data.SJM_YAW], ['changuimun', data.CUM_YAW]]) {
    const { SHAPE, torches } = mods[name];
    assert.equal(SHAPE.tiers, 1); assert.equal(SHAPE.bays, 3);
    assert.equal(torches.data.length, 8);
    const angle = yawDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const halfDepth = Math.max(...SHAPE.base.map(([, y]) => Math.abs(y)));
    const local = [];
    for (let i = 0; i < 8; i += 2) { const east = torches.data[i] / 10, north = torches.data[i + 1] / 10; local.push([east * cos + north * sin, -east * sin + north * cos]) }
    for (const [x, y] of local) {
      assert.ok(Math.abs(y) > halfDepth + .5, `${name} 횃불이 육축 안 ${y}`);
      assert.ok(local.some(([ox, oy]) => Math.abs(ox + x) < .3 && Math.abs(oy - y) < .3), `${name} 좌우 짝 없음`);
    }
  }
});
test('성곽 선은 성문 육축 · 홍예 자리를 가로지르지 않는다(통로가 막히지 않는다)', () => {
  for (const [name, id, yawDeg] of [['sukjeongmun', 'sj-wall', data.SJM_YAW], ['changuimun', 'cu-wall', data.CUM_YAW]]) {
    const { SHAPE, buildMonument } = mods[name];
    const mesh = buildMonument(id);
    assert.ok(mesh.length > 0);
    const angle = yawDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const halfY = Math.max(...SHAPE.base.map(([, y]) => Math.abs(y)));
    for (let i = 0; i < mesh.length; i += STRIDE) {
      if (mesh[i + 2] < .5) continue;   // 높이 있는 벽 면만
      const east = mesh[i], north = mesh[i + 1];
      const x = east * cos + north * sin, y = -east * sin + north * cos;
      assert.ok(!(Math.abs(x) < SHAPE.archWidth / 2 + .3 && Math.abs(y) < halfY), `${id} 성곽이 홍예 통로(${x.toFixed(1)}, ${y.toFixed(1)})를 막음`);
    }
  }
});
