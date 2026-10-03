import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual runtime schedulers without loading a map or a second browser.
function scheduler() {
  const source = readFileSync(new URL('../web/maplibre_runtime.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const TRAIN_FPS='), end = source.indexOf('const map=new maplibregl.Map', start);
  const timers = new Map(), frames = []; let id = 0, moving = false, draws = 0, repaints = 0, animations = 0;
  const context = vm.createContext({ performance: { now: () => 100 },
    setTimeout: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
    clearTimeout: key => timers.delete(key), requestAnimationFrame: callback => frames.push(callback),
    map: { isMoving: () => moving, triggerRepaint: () => repaints++ },
    draw: () => draws++, animate: () => animations++ });
  vm.runInContext(source.slice(start, end) + '\ndrawTrains=draw;animFrame.push(animate);', context);
  return { run: code => vm.runInContext(code, context), timers, frames,
    moving: value => { moving = value; }, counts: () => ({ draws, repaints, animations }),
    tick() { const batch = [...timers.values()]; timers.clear(); batch.forEach(t => t.callback()); },
    frame() { frames.splice(0).forEach(callback => callback()); } };
}

test('map repaint scheduling runs animation and repaints without losing its timer state', () => {
  const s = scheduler();
  s.run('repaintSoon(30);repaintSoon(50);');
  assert.equal(s.timers.size, 1);
  assert.equal([...s.timers.values()][0].delay, 30);
  s.tick();
  assert.deepEqual(s.counts(), { draws: 0, repaints: 1, animations: 1 });
  s.run('repaintSoon(20)'); s.tick();
  assert.equal(s.counts().repaints, 2);
});

test('train timer waits for the map render while a pan is active', () => {
  const s = scheduler(); s.run('trainFrameSoon(33)'); s.tick();
  s.moving(true); s.frame(); assert.equal(s.counts().draws, 0);
  s.moving(false); s.run('trainFrameSoon(33)'); s.tick(); s.frame();
  assert.equal(s.counts().draws, 1);
});
