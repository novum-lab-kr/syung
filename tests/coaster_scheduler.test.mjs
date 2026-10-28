import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Exercise the actual runtime schedulers without loading a map or a second browser.
function scheduler() {
  const source = stripTypeScriptTypes(readFileSync(new URL('../web/maplibre_runtime.mts', import.meta.url), 'utf8'));   // 본체의 타입을 걷어 낸 JS(vm 은 JS 만)
  const start = source.indexOf('const TRAIN_FPS='), end = source.indexOf('\nconst map', start);
  const timers = new Map(), frames = []; let id = 0, moving = false, draws = 0, repaints = 0, animations = 0;
  const doc = { hidden: false, listeners: {}, addEventListener(t, f) { (this.listeners[t] ||= []).push(f) } };   // 탭 숨김(visibilitychange)
  const context = vm.createContext({ performance: { now: () => 100 },
    setTimeout: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
    clearTimeout: key => timers.delete(key), requestAnimationFrame: callback => frames.push(callback),
    map: { isMoving: () => moving, triggerRepaint: () => repaints++ }, document: doc,
    draw: () => draws++, animate: () => animations++ });
  vm.runInContext(source.slice(start, end) + '\ndrawTrains=draw;animFrame.push(animate);', context);
  return { run: code => vm.runInContext(code, context), timers, frames, doc,
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

test('숨긴 탭에서는 열차 층 프레임을 예약하지 않고, 다시 보이면 한 번 깨운다(발열 · 배터리)', () => {
  const s = scheduler();
  s.doc.hidden = true; s.run('trainFrameSoon(33)'); assert.equal(s.timers.size, 0, '숨김: 예약 없음');
  s.doc.hidden = false; s.doc.listeners.visibilitychange.forEach(f => f()); assert.equal(s.timers.size, 1, '다시 보임: 깨움');
  s.tick(); s.frame(); assert.equal(s.counts().draws, 1);
});
