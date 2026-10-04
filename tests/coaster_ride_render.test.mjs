import test from 'node:test';
import assert from 'node:assert/strict';
import { RideLayer } from '../web/lib/park_rides.mjs';

const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-11, Math.abs(expected) * 1e-6), `${message}: ${actual} vs ${expected}`);

// Record the real renderer's uploads and attribute bindings without opening another browser.
function glRecorder() {
  let buffer, vao, program;
  const draws = [];
  const methods = {
    drawingBufferWidth: 1280, drawingBufferHeight: 800,
    createShader: type => ({ type }), shaderSource: (shader, source) => { shader.source = source; },
    getShaderParameter: () => true, createProgram: () => ({ shaders: [] }),
    attachShader: (p, shader) => p.shaders.push(shader), getProgramParameter: () => true,
    getUniformLocation: (_p, name) => name, useProgram: p => { program = p; },
    createBuffer: () => ({}), bindBuffer: (_target, value) => { buffer = value; },
    bufferData: (_target, value) => { buffer.data = typeof value === 'number' ? new Float32Array(value / 4) : new Float32Array(value); },
    bufferSubData: (_target, offset, source, start = 0, count = source.length - start) => { buffer.data.set(source.subarray(start, start + count), offset / 4); },
    createVertexArray: () => ({ attrs: new Map() }), bindVertexArray: value => { vao = value; },
    vertexAttribPointer: (loc, size, _type, _normalized, stride, offset) => { vao.attrs.set(loc, { size, stride, offset, buffer }); },
    drawArraysInstanced: (mode, _first, vertices, instances) => {
      const origin = vao.attrs.get(4), size = vao.attrs.get(5);
      draws.push({ mode, vertices, instances, origin, size, data: [...origin.buffer.data],
        vertex: program.shaders.find(shader => shader.type === 'VERTEX_SHADER').source });
    }
  };
  return { draws, gl: new Proxy(methods, { get: (target, key) => key in target ? target[key] : /^[A-Z_0-9]+$/.test(key) ? key : () => {} }) };
}

function scene(overrides = {}) {
  const layer = new RideLayer([[127.0276, 37.4979, 40, 180]], { deferPlacement: true });
  const site = { ...layer.candidates[0], ...overrides };
  layer.setSites([site]);
  const recording = glRecorder();
  layer.init(recording.gl);
  return { layer, site, ...recording, render: opts => layer.render(recording.gl, matrix, { now: 10000, zoom: 14, reducedMotion: true, ...opts }) };
}

test('elevated ride bodies, bulbs and neon share the same 19-float world origin', () => {
  const s = scene({ base_m: 42 });
  s.render({ night: true });
  assert.equal(s.draws.length, 3, 'exercise body, neon and bulb passes');
  for (const draw of s.draws) {
    assert.equal(draw.data.length, 19, 'altitude must have its own instance slot');
    assert.equal(draw.origin.size, 3);
    assert.equal(draw.origin.stride, 19 * 4);
    assert.equal(draw.size.offset, 3 * 4, 'scale attributes must follow the complete xyz origin');
    assert.match(draw.vertex, /layout\(location=4\)\s+in vec3 i_org/, 'each shader consumes the three-dimensional origin');
    close(draw.data[0], s.site.x - s.layer.O.x, 'origin x');
    close(draw.data[1], s.site.y - s.layer.O.y, 'origin y');
    close(draw.data[2], 42 * s.site.mu, 'altitude is in Mercator units and is not exaggerated');
    close(draw.data[6], s.site.mu, 'metre scale remains separate from altitude');
    close(draw.data[7], s.site.phase, 'animation phase remains stable after the layout change');
    assert.equal(draw.data[8], 0, 'reduced motion rate remains frozen');
    close(draw.data[18], s.site.hue, 'the final lighting attribute is uploaded');
  }
  assert.ok(s.draws.every(draw => draw.origin.buffer === s.draws[0].origin.buffer), 'all passes share one instance store');
  const previousStore = s.draws[0].origin.buffer;
  const moved = { ...s.site, lon: s.site.lon + .001, x: s.site.x + .001 / 360, base_m: 80 };
  s.layer.setSites([moved, s.site]);
  s.draws.length = 0;
  s.render({ night: true });
  for (const draw of s.draws) {
    assert.equal(draw.instances, 2, 'placement can replace sites after GL initialization');
    assert.equal(draw.data.length, 38, 'both updated instances have complete records');
    close(draw.data[0], moved.x - s.layer.O.x, 'render the selected moved coordinate');
    close(draw.data[2], 80 * moved.mu, 'first updated altitude');
    close(draw.data[21], 42 * s.site.mu, 'second record altitude');
    assert.notEqual(draw.origin.buffer, previousStore, 'retain alternate stores for in-flight GPU frames');
  }
});

test('site exaggeration limits apply to every pass without changing ordinary ground rides', () => {
  const limited = scene({ base_m: 30, maxExagH: 1.2, maxExagV: 1.1 });
  const ordinary = scene(), lotte = scene({ lotte: true });
  for (const [zoom, eh, ev, lh, lv] of [[13.5, 2.4, 1.35, 1.2, 1.1], [14.5, 1.6, 1.15, 1.2, 1.1], [16, 1, 1, 1, 1]]) {
    for (const [s, h, v] of [[limited, lh, lv], [ordinary, eh, ev], [lotte, 1, 1]]) {
      s.draws.length = 0;
      s.render({ zoom, night: true });
      for (const draw of s.draws) {
        close(draw.data[3], s.site.sxy * h, 'horizontal scale obeys this site and zoom');
        close(draw.data[4], s.site.sz * v, 'vertical scale obeys this site and zoom');
        close(draw.data[5], s.site.mastR * h, 'mast uses the same horizontal scale');
        close(draw.data[2], (s.site.base_m || 0) * s.site.mu, 'base altitude is independent of zoom');
      }
    }
  }
});

test('viewport culling includes the elevated base and uses the same capped ride dimensions', () => {
  const elevated = scene({ base_m: 100, top: 10, wide: 10, maxExagH: 1, maxExagV: 1 });
  const bounds = (site, distance) => [site.x + distance * site.mu, site.y - 10 * site.mu,
    site.x + (distance + 20) * site.mu, site.y + 10 * site.mu];
  elevated.render({ bounds: bounds(elevated.site, 80) });
  assert.equal(elevated.layer.stats.rides, 1, 'an elevated ride can project into view from beyond its ground-level margin');
  elevated.site.base_m = 0;
  elevated.render({ bounds: bounds(elevated.site, 80) });
  assert.equal(elevated.layer.stats.rides, 0, 'the same small ride at ground level is outside');
  const limited = scene({ top: 100, wide: 100, maxExagH: 1, maxExagV: 1 });
  limited.render({ bounds: bounds(limited.site, 250) });
  assert.equal(limited.layer.stats.rides, 0, 'do not retain the larger uncapped culling margin');
  delete limited.site.maxExagH; delete limited.site.maxExagV;
  limited.render({ bounds: bounds(limited.site, 250) });
  assert.equal(limited.layer.stats.rides, 1, 'legacy exaggeration retains its existing margin');
});
