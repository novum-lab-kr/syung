import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

// 모드 코드(loadModeKit)가 다시 정적으로 부르는 모듈은 MODE_KIT_DEPS 에 있어야 함께 바로 요청된다(차례 대기 없음)
const WEB = new URL('../web/', import.meta.url).pathname;
const imports = f => [...readFileSync(path.join(WEB, f), 'utf8').matchAll(/^\s*import\s[^'"]*?['"](\.[^'"]+)['"]/gm)]
  .map(m => path.normalize(path.join(path.dirname(f), m[1])));

test('모드 코드가 부르는 첫 화면 밖 모듈은 모두 MODE_KIT_DEPS 로 미리 요청해요', () => {
  const src = readFileSync(path.join(WEB, 'maplibre_runtime.mjs'), 'utf8');
  const kit = [...src.match(/kitLoad\?\?=Promise\.all\(\[([^\]]+)\]/)[1].matchAll(/import\('\.\/(lib\/[^']+)'\)/g)].map(m => m[1]);
  const deps = JSON.parse(src.match(/const MODE_KIT_DEPS=(\[[^\]]*\])/)[1].replace(/'/g, '"')).map(n => `${n}.mjs`);
  const first = new Set();
  (function walk(f) { if (first.has(f)) return; first.add(f); imports(f).forEach(walk) })('maplibre_runtime.mjs');
  const need = new Set();
  (function walk(fs) { for (const f of fs) for (const g of imports(f)) if (!first.has(g) && !kit.includes(g) && !need.has(g)) { need.add(g); walk([g]) } })(kit);
  assert.deepEqual([...need].sort(), [...deps].sort());
});
