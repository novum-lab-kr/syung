import test from 'node:test';
import assert from 'node:assert/strict';
import { LifeUnits } from '../web/modes/starcraft/life_units.mjs';

// GL 없이: 그리기 직전까지(유닛 고르기 · 방향)만 — init · 그리기는 빈 것으로
class Probe extends LifeUnits { init() { this.lists ??= new Map(); this.p = 1; this.attr = {}; this.uni = {} } mesh() { return { va: null, n: 0 } } }
const gl = new Proxy({}, { get: () => () => {} });
const picked = (L) => [...L.lists].flatMap(([k, l]) => Array.from({ length: l.n }, (_, i) => ({ k, yaw: l.inst[i * 8 + 2] })));
const units = { people: ['marine', 'firebat', 'medic'], cars: ['vulture', 'goliath'] };

test('스타크래프트 도시 생활: 차는 달리는 동안 같은 유닛(자리가 바뀌어도), 사람은 걷는 쪽을 본다', () => {
  const L = new Probe(), car = { seed: .8 }, pose = (x, y) => new Float32Array([x, y, 0, 0, .5, .5, .5, 1, 0, 0]);
  const first = (x, y) => { L.draw(gl, null, 1, { cars: pose(x, y), carsN: 1, carList: [car], units }); return picked(L)[0].k };
  const k0 = first(0, 0); for (let s = 1; s < 50; s++) assert.equal(first(s * 3.7, s * 1.3), k0, '달리는 중 모양이 바뀜');
  // 사람: 4 · 5 는 길의 정방향(1, 0), 11 은 걷는 쪽 −1 → 서쪽(π)을 본다
  const P = new Float32Array(14); P[3] = 1; P[4] = 1; P[5] = 0; P[7] = 1; P[11] = -1;
  L.draw(gl, null, 1, { people: P, peopleN: 1, units }); const yaw = picked(L)[0].yaw;
  assert.ok(Math.abs(Math.abs(yaw) - Math.PI) < 1e-5, `거꾸로 걷는 쪽: yaw ${yaw}`);
  P[11] = 1; L.draw(gl, null, 1, { people: P, peopleN: 1, units }); assert.ok(Math.abs(picked(L)[0].yaw) < 1e-5);
});

test('스타크래프트: 버스 유닛은 차 자리 유닛 목록에 없다(같은 모양이 버스 · 차로 겹치지 않게)', async () => {
  const modes = (await import('../web/modes/starcraft/index.mts')).default;
  for (const m of modes) assert.ok(!m.settings.city.life.units.cars.includes(m.settings.buses.look), `${m.id}: 버스 ${m.settings.buses.look} 가 차에도 있음`);
});
