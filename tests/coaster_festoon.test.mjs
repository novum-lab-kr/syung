import test from 'node:test';
import assert from 'node:assert/strict';
import { festoonBulbs as fb, keepAt, survivors, FESTOON } from '../web/modes/coaster/festoon.mjs';
const festoonBulbs = (...a) => fb(...a).data;

// a fake decoded building layer: square footprints (tile units, extent 4096) with ids and heights
const layer = (bs, E = 4096) => ({ extent: E, length: bs.length, feature: i => { const b = bs[i]; return { id: b.noId ? undefined : b.id, type: 3, properties: { render_height: b.h, render_min_height: b.min || 0, ...(b.hide ? { hide_3d: true } : {}) },
  loadGeometry: () => [[{ x: b.x, y: b.y }, { x: b.x + b.s, y: b.y }, { x: b.x + b.s, y: b.y + b.s }, { x: b.x, y: b.y + b.s }, { x: b.x, y: b.y }]] } } });
const tile = { x: 13970, y: 6347 };
const many = n => Array.from({ length: n }, (_, i) => ({ id: 1000 + i, h: 30, x: 40 + (i % 60) * 60, y: 40 + Math.floor(i / 60) * 60, s: 40 }));

test('buildings are chosen by where they stand, not by feature id or order (OFM merges same-height buildings into one feature)', () => {
  const bs = many(300), ids = d => { const s = new Set(); for (let i = 0; i < d.length; i += 7) s.add(d[i + 3].toFixed(6)); return s };
  const a = ids(festoonBulbs(layer(bs), tile)), b = ids(festoonBulbs(layer([...bs].reverse().map(x => ({ ...x, noId: true }))), tile));
  assert.deepEqual([...a].sort(), [...b].sort());
  // one merged feature (same id) still lights only some of its buildings
  const merged = { extent: 4096, length: 1, feature: () => ({ id: 5, type: 3, properties: { render_height: 30 }, loadGeometry: () => bs.map(b => [{ x: b.x, y: b.y }, { x: b.x + b.s, y: b.y }, { x: b.x + b.s, y: b.y + b.s }, { x: b.x, y: b.y + b.s }, { x: b.x, y: b.y }]) }) };
  const lit = ids(festoonBulbs(merged, tile)).size / bs.length;
  assert.ok(lit > .15 && lit < .45, `merged feature share ${lit}`);
});

test('bulbs in the tile buffer belong to the neighbouring tile', () => {
  const edge = Array.from({ length: 200 }, (_, i) => ({ id: i, h: 30, x: -30, y: 20 + i * 20, s: 60 }));   // half outside x<0
  const d = festoonBulbs(layer(edge), tile), x0 = (tile.x / 2 ** 14) - (126.978 / 360 + .5);
  for (let i = 0; i < d.length; i += 7) assert.ok(d[i] >= x0 - 1e-12, 'no bulb west of the tile edge');
});

test('the screen cap counts what the stride actually keeps, vertical strings included', () => {
  const T = { roofs: [[.1, 10], [.5, 7], [.9, 3]], verts: [[.2, 9]] };
  assert.equal(survivors(T, 1, 0, 1), 20);
  assert.equal(survivors(T, .6, 0, 2), 5 + 4);
  assert.equal(survivors(T, .6, 1, 4), 3 + 2 + 3);
  assert.equal(survivors(T, 0, 0, 1), 0);
});

test('roof bulbs go on about a third of the 20 m+ buildings, the same ones every time, none below 20 m or hidden', () => {
  const bs = many(600), a = festoonBulbs(layer(bs), tile), b = festoonBulbs(layer([...bs].reverse()), tile);
  const ids = d => { const s = new Set(); for (let i = 0; i < d.length; i += 7) s.add(d[i + 3].toFixed(6)); return s };
  const lit = ids(a).size / bs.length;
  assert.ok(lit > FESTOON.share - .07 && lit < FESTOON.share + .07, `share ${lit}`);
  assert.deepEqual([...ids(a)].sort(), [...ids(b)].sort(), 'chosen by id, not by order');
  assert.equal(festoonBulbs(layer(bs.map(x => ({ ...x, h: 15 }))), tile).length, 0);
  assert.equal(festoonBulbs(layer(bs.map(x => ({ ...x, hide: true }))), tile).length, 0);
});

test('a roof string sits just above the roof, one colour a building, and is capped', () => {
  const d = festoonBulbs(layer(many(400)), tile), n = 2 ** 14, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.y + .5) / n))), mu = 1 / (40075016.685578488 * Math.cos(lat));
  const col = new Map(), per = new Map();
  for (let i = 0; i < d.length; i += 7) {
    if (d[i + 5] >= 4) continue;
    assert.ok(Math.abs(d[i + 2] / mu - (30 + FESTOON.aboveM)) < .01);
    const k = d[i + 3].toFixed(6); if (col.has(k)) assert.equal(col.get(k), d[i + 5]); col.set(k, d[i + 5]); per.set(k, (per.get(k) || 0) + 1);
  }
  assert.ok(Math.max(...per.values()) <= FESTOON.roofMax);
  const huge = festoonBulbs(layer([{ id: 7, h: 30, x: 0, y: 0, s: 4000 }].map(b => ({ ...b, id: [...Array(50).keys()].find(i => festoonBulbs(layer([{ ...b, id: i }]), tile).length) }))), tile);
  assert.ok(huge.length / 7 <= FESTOON.roofMax);
});

test('tall towers chosen for vertical strings get two corners, bottom to top, and only some towers', () => {
  const towers = Array.from({ length: 400 }, (_, i) => ({ id: 50000 + i, h: 150, x: 40 + (i % 60) * 60, y: 40 + Math.floor(i / 60) * 60, s: 40 }));
  const d = festoonBulbs(layer(towers), tile), vt = new Map();
  for (let i = 0; i < d.length; i += 7) if (d[i + 5] >= 4) { const k = d[i + 3].toFixed(6); vt.set(k, (vt.get(k) || new Set()).add(d[i].toFixed(9) + ',' + d[i + 1].toFixed(9))) }
  const share = vt.size / towers.length;
  assert.ok(share > .08 && share < .22, `tower share ${share}`);
  for (const c of vt.values()) assert.equal(c.size, 2, 'two corners');
});

test('the landmark tower keeps its own model: no bulbs on the parts it hides', () => {
  // 롯데월드타워 자리(z14 타일 안 좌표)
  const lon = 127.102655, lat = 37.51254, n = 2 ** 14, X = (lon + 180) / 360 * n, Y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * n;
  const t = { x: Math.floor(X), y: Math.floor(Y) }, px = (X - t.x) * 4096, py = (Y - t.y) * 4096;
  const parts = Array.from({ length: 40 }, (_, i) => ({ id: 9000 + i, h: 300, x: px - 10 - i % 3, y: py - 10, s: 20 + i % 3 }));
  assert.equal(festoonBulbs(layer(parts), t).length, 0);
  assert.ok(festoonBulbs(layer(parts.map(p => ({ ...p, x: p.x + 400 }))), t).length > 0, 'the same parts elsewhere are lit');
});

test('the lit share grows with zoom and is off below z14', () => {
  assert.equal(keepAt(13.9), 0);
  assert.ok(Math.abs(keepAt(14) - 1 / 3) < 1e-9); assert.ok(Math.abs(keepAt(15.5) - .8333) < 1e-3); assert.equal(keepAt(17), 1);
});
