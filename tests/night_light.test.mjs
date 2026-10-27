import test from 'node:test';
import assert from 'node:assert/strict';
import { cityLayers, applyCityStyle, NIGHT_GROUND_IDS } from '../web/city/style.mts';
import { createModeRegistry } from '../web/modes/index.mjs';

// 도시 모드 밤 빛(팩 night, 2026-10-11): 바닥 빛(번화가)은 다크 · 켬일 때만 보이고, 낮 · 꺼짐 · 도시 밖에서는 숨는다.
// 길을 따라 번지던 빛(city-night-roads*)은 뺐다 — 길 빛은 가로등 웅덩이 · 전구만(행님 2026-10-11: 이유 없이 밝아 이상하다)
const defs = await Promise.all(['basic', 'simcity', 'joseon', 'coaster'].map(n => import(`../web/modes/${n}/index.mjs`).then(m => m.default)));
const R = createModeRegistry(defs);
const fakeMap = () => {
  const layers = new Map(), vis = id => layers.get(id)?.layout?.visibility;
  const map = { getLayer: id => layers.get(id), addLayer: l => layers.set(l.id, structuredClone(l)), setLayoutProperty: (id, k, v) => { layers.get(id).layout = { ...layers.get(id).layout, [k]: v } }, setPaintProperty: (id, k, v) => { layers.get(id).paint = { ...layers.get(id).paint, [k]: v } } };
  for (const { layer } of cityLayers({ pack: R.settings('simcity').city.pack })) map.addLayer(layer);
  return { map, vis };
};

test('밤 바닥 빛: 처음엔 숨김, 다크 + 켬일 때만 보인다', () => {
  const { map, vis } = fakeMap(), pack = R.settings('simcity').city.pack;
  assert.equal(map.getLayer('city-night-roads'), undefined, '길 따라 번지는 빛은 없다');
  assert.equal(map.getLayer('city-night-roads-core'), undefined);
  const ids = NIGHT_GROUND_IDS.filter(id => map.getLayer(id)); assert.deepEqual(ids, ['city-night-downtown']);
  for (const id of ids) assert.equal(vis(id), 'none', `${id} 처음엔 숨김`);
  applyCityStyle(map, { on: true, theme: 'light', pack, groundLight: true });
  for (const id of ids) assert.equal(vis(id), 'none', `${id} 낮에는 숨김`);
  applyCityStyle(map, { on: true, theme: 'dark', pack, groundLight: false });
  for (const id of ids) assert.equal(vis(id), 'none', `${id} 꺼짐이면 숨김`);
  applyCityStyle(map, { on: true, theme: 'dark', pack, groundLight: true });
  for (const id of ids) assert.equal(vis(id), 'visible', `${id} 다크 + 켬이면 보임`);
  applyCityStyle(map, { on: false, theme: 'dark', pack, groundLight: true });
  for (const id of ids) assert.equal(vis(id), 'none', `${id} 도시 모드 밖이면 숨김`);
});

test('밤 빛 설정: 조선은 기본 위에 다른 것만(횃불 · 등잔), 블룸은 휴대폰에서 끔', () => {
  const S = R.settings('simcity').city.pack.night, J = R.settings('joseon').city.pack.night;
  assert.equal(S.bloom.phone, false);
  assert.ok(S.bloom.overlay.threshold > S.bloom.threshold, '열차 캔버스는 문턱이 더 높다(흰 열차 몸은 안 번지게)');
  assert.equal(J.lights.emissionMul, S.lights.emissionMul, '조선도 창 밝기는 기본에서 받는다');
  assert.equal(S.ground.roads, undefined, '길 빛은 가로등만'); assert.equal(J.ground.roads, undefined);
  assert.ok(J.ground.downtown.opacity < S.ground.downtown.opacity, '조선 저잣거리 빛은 더 옅다');
  assert.ok(S.lights.lampPool.lod[0] <= 14.5 && S.lights.lampPool.opacity > .22, '가로등 웅덩이 · 전구가 길 빛을 맡는다');
  assert.equal(R.settings('coaster').city.pack, R.settings('simcity').city.pack, '롤코는 심시티 팩 그대로');
});
