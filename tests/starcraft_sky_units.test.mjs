import test from 'node:test';
import assert from 'node:assert/strict';
import { SkyUnits } from '../web/modes/starcraft/sky_units.mjs';

test('스타크래프트 하늘: 화면 밖에서 나타나 화면 가운데 근처를 지나 밖으로 — 모양 이름이 없으면 안 나타난다', () => {
  let k = 0; const R = () => [.13, .71, .42, .9, .05, .66, .3][k++ % 7];
  const s = new SkyUnits({ random: R }), view = [.5, .4, .501, .401], mpm = 1e-8;
  s.spawn(0, { units: ['nope'] }, view, mpm); assert.equal(s.flights.length, 0);
  for (let i = 0; i < 20; i++) s.spawn(0, { units: ['wraith', 'carrier'] }, view, mpm);
  const cx = .5005, cy = .4005, half = Math.hypot(.001, .001) / 2;
  for (const f of s.flights) {
    assert.ok(Math.hypot(f.x - cx, f.y - cy) > half, '처음엔 화면 밖');
    const end = [f.x + f.fx * f.v * f.dur, f.y + f.fy * f.v * f.dur];
    assert.ok(Math.hypot(end[0] - cx, end[1] - cy) > half, '끝은 화면 밖');
    // 지나는 길에서 가운데까지 가장 가까운 거리: 화면 안
    const t = Math.max(0, (cx - f.x) * f.fx + (cy - f.y) * f.fy), near = Math.hypot(f.x + f.fx * t - cx, f.y + f.fy * t - cy);
    assert.ok(near < half, '화면을 지난다');
  }
});
