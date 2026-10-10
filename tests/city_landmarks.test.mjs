import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTower } from '../web/city/landmarks.mjs';
import { LANDMARKS } from '../web/city/landmarks_data.mjs';

const L = LANDMARKS.find(l => l.id === 'lotte');
const verts = d => { const out = []; for (let i = 0; i < d.length; i += 9) out.push([d[i], d[i + 1], d[i + 2], d[i + 7]]); return out };

test('롯데월드타워: 555 m, 위로 갈수록 가늘고, 꼭대기는 솔기 선에서 두 갈래', () => {
  for (const look of ['tower', 'wood-tower']) {
    const V = verts(buildTower(L, { look }));
    assert.ok(V.every(v => v.every(Number.isFinite)), 'no NaN');
    assert.equal(Math.max(...V.map(v => v[2])), 555);
    const widthAt = h => Math.max(...V.filter(v => Math.abs(v[2] - h) < 4 && v[3] === 0).map(v => Math.hypot(v[0], v[1])));
    assert.ok(widthAt(0) > 40 && widthAt(300) < widthAt(150) && widthAt(500) < widthAt(300), 'tapers');
    const top = V.filter(v => v[2] > 554 && v[3] === 2);   // 윗면: 솔기 선(v = 0) 양쪽으로 떨어져 있다
    assert.ok(top.every(v => Math.abs(v[1]) >= L.crown.gapTopM / 2 - 1e-3), 'a gap along the seam');
    assert.ok(top.some(v => v[1] > 0) && top.some(v => v[1] < 0), 'two ears');
  }
});
