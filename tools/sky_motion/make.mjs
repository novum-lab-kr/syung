// 메뉴 하늘 그림 날씨 · 달리는 지하철 움직임(Lottie JSON)을 만든다 → web/brand/sky-*.json
// 캔버스는 하늘 그림과 같은 320×110(1 단위 = 1 viewBox 단위 · 30fps). 하늘 그림 그림체(동글 · 얇은 테두리)와 같고,
// 색은 낮 팔레트로 만든다 — 밤은 web/map/sky_motion.mts 가 불러올 때 같은 장면의 색만 밤 팔레트로 바꾼다(아래 NIGHT 표와 맞춘다).
// 장면(받는 쪽이 날씨마다 고른다): 구름 둘(cloudy · overcast) / 떨어지는 것 일곱(drizzle · rain · heavyrain · snow · flurry · sleet · storm) / 지하철 하나.
// 구름은 맨 위, 떨어지는 것은 그 아래(구름 밑에서 시작), 지하철은 그 아래 — 겹치는 순서는 sky_motion.mts 가 정한다.
//   node tools/sky_motion/make.mjs
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const OUT = fileURLToPath(new URL('../../web/brand/', import.meta.url));
const FPS = 30, WIDTH = 320, HEIGHT = 110, GROUND = 87;   // 땅 · 선로 위(하늘 그림 base 84 + 선로 2)
const hex = code => [1, 3, 5].map(at => +(parseInt(code.slice(at, at + 2), 16) / 255).toFixed(4)).concat(1);

// 같은 번호는 늘 같은 값(다시 만들어도 같은 장면)
const rnd = (index, salt) => { const seed = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453; return seed - Math.floor(seed) };
const round = value => +value.toFixed(2);

// ---- 값 · 움직임 ----
const LIN = {o: {x: [0], y: [0]}, i: {x: [1], y: [1]}};
const SMOOTH_OUT = {o: {x: [0.2], y: [0.6]}, i: {x: [0.3], y: [1]}};
const SMOOTH_IN = {o: {x: [0.6], y: [0]}, i: {x: [0.9], y: [0.6]}};
const still = value => ({a: 0, k: value});
// [[장면, 값, 부드러움 | 'hold'], …] — 부드러움은 그 장면에서 다음 장면까지, hold 는 다음 장면까지 값을 붙잡는다(순간 이동)
function moving(frames) {
  const list = frames.map(([t, value]) => ({t, s: [value].flat().map(round)}));
  frames.forEach(([, , ease = LIN], index) => {
    if (index === frames.length - 1) return;
    if (ease === 'hold') list[index].h = 1; else Object.assign(list[index], ease);
  });
  return {a: 1, k: list};
}
const prop = value => (value && value.a !== undefined ? value : still(value));
const splitPosition = (xFrames, yFrames) => ({s: true, x: moving(xFrames), y: moving(yFrames)});
const transform = ({position = [0, 0], scale = [100, 100], rotation = 0, opacity = 100}) =>
  ({a: still([0, 0]), p: position.s ? position : prop(position), s: prop(scale), r: prop(rotation), o: prop(opacity)});

// ---- 모양 ----
const fill = color => ({ty: 'fl', c: still(color), o: still(100), r: 1});
const stroke = (color, width) => ({ty: 'st', c: still(color), o: still(100), w: still(width), lc: 2, lj: 2, ml: 4});
const rect = (center, size, radius) => ({ty: 'rc', d: 1, p: still(center), s: still(size), r: still(radius)});
const ellipse = (center, size) => ({ty: 'el', d: 1, p: still(center), s: still(size)});
const polyline = (points, closed = false) => ({ty: 'sh', ks: still({v: points, i: points.map(() => [0, 0]), o: points.map(() => [0, 0]), c: closed})});
// 물방울(하늘 그림 구름처럼 동글): 위가 뾰족, 아래가 둥글다 — 위 (0,-5) · 아래 (0,3.4)
// 빗줄기: 가늘고 긴 물방울(위가 뾰족, 아래가 둥글다) — 위 (0,-7) · 아래 (0,3.2). 낮 · 밤 · 이슬비 · 비 · 큰비 모두 같은 모양
const droplet = () => ({ty: 'sh', ks: still({v: [[0, -7], [0, 3.2]], o: [[1.5, 4.5], [-1.9, -2.2]], i: [[-1.5, 4.5], [1.9, -2.2]], c: true})});
const group = items => ({ty: 'gr', it: [...items, {ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0)}]});
// 테두리가 위에 오도록 [모양, 테두리, 채움] 순서(앞이 위)
const outlined = (shapes, fillColor, lineColor, width) => group([...shapes, stroke(lineColor, width), fill(fillColor)]);

const COLOR = {
  cloudLight: hex('#f4f8fc'), cloudGrey: hex('#aab5c3'), cloudLine: hex('#8fa6c4'),
  cloudStorm: hex('#6f7b8c'), dropFill: hex('#d6ecff'), dropLine: hex('#2b62b0'), snowLine: hex('#8fb4dc'), white: hex('#ffffff'),
  bolt: hex('#ffe66b'), flash: hex('#fffbe0'),
  body: hex('#ffffff'), outline: hex('#3a3f4a'), stripe: hex('#00a84d'), window: hex('#9fd4ff'), lamp: hex('#ffe08a'), wind: hex('#ffffff'),
};

// ---- 장면 만들기 ----
function scene(name, frames) {
  const layers = [];
  return {
    layer(nm, shapes, motion = {}) {   // 앞(위)에 그릴 것을 먼저 더한다
      layers.push({ddd: 0, ind: layers.length + 1, ty: 4, nm, sr: 1, ks: transform(motion), ao: 0, shapes, ip: 0, op: frames, st: 0, bm: 0});
    },
    done: () => ({v: '5.7.0', fr: FPS, ip: 0, op: frames, w: WIDTH, h: HEIGHT, nm: name, ddd: 0, assets: [], layers}),
  };
}

// ===== 구름: 그림의 구름(동그라미 셋 + 바닥)과 같은 모양 · 얇은 테두리, 천천히 흘러 한 바퀴 돌면 처음으로 =====
// 테두리 = 굵은 선을 먼저 깔고 같은 모양 채움을 위에 덮어 바깥 반쪽만 남긴다(구름 안쪽 겹친 선이 안 보인다)
const CLOUD_SHAPES = () => [ellipse([0, 0], [14, 14]), ellipse([9, -4], [18, 18]), ellipse([19, 0], [14, 14]), rect([9.5, 3.5], [19, 7], 3.5)];
function cloudsScene(name, {fillColor, count, minY, spanY, minScale, spanScale, seconds}) {
  const frames = seconds * FPS, make = scene(name, frames), travel = 420;   // 화면 밖에서 밖으로(-80 → 340)
  for (let index = 0; index < count; index++) {
    const startX = round(-60 + rnd(index, 1) * 340), y = round(minY + rnd(index, 2) * spanY), scale = round((minScale + rnd(index, 3) * spanScale) * 100);
    const end = 340, restart = -80, wrapAt = Math.round(frames * (end - startX) / travel);
    make.layer(`cloud${index}`, [
      group([...CLOUD_SHAPES(), fill(fillColor)]),
      group([...CLOUD_SHAPES(), stroke(COLOR.cloudLine, 2)]),
    ], {
      position: splitPosition(
        [[0, startX], [wrapAt, end, 'hold'], [wrapAt + 1, restart], [frames, startX]],
        [[0, y], [frames, y]],
      ),
      scale: [scale, scale],
    });
  }
  return make.done();
}

// ===== 떨어지는 것: 한 번 떨어지는 시간(period)마다 처음으로 — 방울마다 시작 위치만 다르다 =====
// 한 물체의 위치 풀이: 시작 위상 phase(0~1)에서 출발해 땅에 닿으면 위로 순간 이동(hold)하고 계속 — 한 바퀴(frames)에 repeat 번 떨어진다
function fallPath(frames, repeat, phase, from, to, sway = 0) {
  const period = frames / repeat, xs = [], ys = [];
  const at = fraction => [round(from[0] + (to[0] - from[0]) * fraction), round(from[1] + (to[1] - from[1]) * fraction)];
  let time = 0, fraction = phase;
  xs.push([0, at(fraction)[0]]); ys.push([0, at(fraction)[1]]);
  for (let turn = 0; turn <= repeat; turn++) {
    const reach = time + period * (1 - fraction);
    if (reach >= frames - 0.5) { xs.push([frames, at(fraction + (frames - time) / period)[0]]); ys.push([frames, at(fraction + (frames - time) / period)[1]]); break; }
    const landX = round(to[0]), landY = round(to[1]), t = Math.round(reach);
    xs.push([t, landX, 'hold']); ys.push([t, landY, 'hold']);
    xs.push([t + 1, round(from[0])]); ys.push([t + 1, round(from[1])]);
    time = t + 1; fraction = 0;
  }
  return {xs, ys, sway};
}
function drops(make, {count, repeat, frames, scale, tilt, tag, splash}) {
  const slide = -tilt * 1.2;   // 비스듬히: 오른쪽 위에서 왼쪽 아래로
  for (let index = 0; index < count; index++) {
    const x = round(rnd(index, 11) * (WIDTH + 40)), top = round(24 + rnd(index, 12) * 6), phase = rnd(index, 13), landY = round(GROUND + rnd(index, 14) * 3);
    const path = fallPath(frames, repeat, phase, [x, top], [x + slide, landY]);
    make.layer(`${tag}${index}`, [outlined([droplet()], COLOR.dropFill, COLOR.dropLine, 1)], {position: splitPosition(path.xs, path.ys), scale: [scale * 100, scale * 100], rotation: tilt});
    if (splash && index < splash) {   // 땅 · 선로에 닿으면 작게 튄다: 닿는 순간 번쩍 퍼졌다 사라진다
      const hits = path.xs.filter(key => key[2] === 'hold').map(key => key[0]);
      const opacity = [[0, 0, 'hold']];
      hits.forEach(hit => { opacity.push([hit, 0, 'hold'], [hit + 1, 90], [hit + 5, 0, 'hold']); });
      const keys = [...new Map(opacity.map(key => [key[0], key])).values()].sort((left, right) => left[0] - right[0]);
      make.layer(`${tag}splash${index}`, [group([polyline([[-3.5, 0], [-1.5, -2.4], [0, -3], [1.5, -2.4], [3.5, 0]]), stroke(COLOR.dropLine, 1)])], {
        position: [round(x + slide), landY], opacity: moving(keys.map(([t, value], position) => [t, value, position === keys.length - 1 ? undefined : 'hold'])),
      });
    }
  }
}
function flakes(make, {count, repeat, frames, smallest, biggest, sway, tag}) {
  for (let index = 0; index < count; index++) {
    const x = round(rnd(index, 21) * WIDTH), size = round(smallest + rnd(index, 23) * (biggest - smallest)), top = round(24 + rnd(index, 22) * 6), phase = rnd(index, 24);
    const path = fallPath(frames, repeat, phase, [x, top], [x - 6, GROUND + 1 + rnd(index, 25) * 3]);
    // 흔들리며 내린다: 위치 x 에 사인 흔들림을 얹는 대신 몸통을 좌우로 흔든다(키프레임을 아끼려 위치는 직선)
    make.layer(`${tag}${index}`, [outlined([ellipse([0, 0], [size * 2, size * 2])], COLOR.white, COLOR.snowLine, 1)], {position: splitPosition(path.xs, path.ys)});
  }
}
function fallScene(name, build) {
  const {frames, fn} = build, make = scene(name, frames);
  fn(make, frames);
  return make.done();
}

// 낙뢰: 번쩍(전체 하얗게) + 번개 모양
function lightning(make, frames) {
  const bolt = polyline([[10, 0], [0, 14], [6, 14], [-2, 30], [14, 10], [8, 10], [16, 0]], true);
  const flashAt = [[0, 0, 'hold'], [Math.round(frames * 0.5), 0, 'hold'], [Math.round(frames * 0.5) + 1, 80], [Math.round(frames * 0.5) + 3, 10], [Math.round(frames * 0.5) + 5, 65], [Math.round(frames * 0.5) + 8, 0, 'hold'], [frames, 0]];
  make.layer('bolt', [group([bolt, stroke(COLOR.white, 1), fill(COLOR.bolt)])], {position: [196, 22], opacity: moving(flashAt)});
  make.layer('flash', [group([rect([WIDTH / 2, HEIGHT / 2], [WIDTH, HEIGHT], 0), fill(COLOR.flash)])], {opacity: moving(flashAt.map(([t, value, hold]) => [t, value * 0.8, hold]))});
}

// ===== 달리는 지하철: 왼쪽에서 들어와 가운데서 쉬었다가 오른쪽으로 나간다(한 바퀴 14초 · 처음 2초는 가운데에서 쉼 = 첫 프레임이 지금 그림) =====
function trainScene() {
  const frames = 14 * FPS, make = scene('sky-train', frames), tx = 118, ty = 73;   // 하늘 그림의 지하철 자리(base 84 - 11)
  const car = (cx, front) => [
    ...[4, 12, 20].map(offset => group([rect([cx + offset + 3, ty + 4.6], [6, 4.4], 1.4), fill(COLOR.window)])),
    group([rect([cx + 17, ty + 9.2], [34, 2.4], 0), fill(COLOR.stripe)]),
    outlined([rect([cx + 17, ty + 6.5], [34, 13], front ? 6 : 3)], COLOR.body, COLOR.outline, 1),
  ];
  const wheels = [6, 28, 42, 64].map(offset => group([ellipse([tx + offset, ty + 13.5], [4, 4]), fill(COLOR.outline)]));
  // 밤에만 켜지는 전조등 빛(낮엔 sky_motion.mts 가 숨긴다 — 레이어 이름 lamp)
  const lamp = group([polyline([[tx + 70, ty + 6], [tx + 96, ty + 1], [tx + 96, ty + 13]], true), {ty: 'fl', c: still(COLOR.lamp), o: still(28), r: 1}]);
  const wind = [[5, 8], [9, 12]].map(([y, length]) => group([polyline([[tx - 6, ty + y], [tx - 6 - length, ty + y]]), {ty: 'st', c: still(COLOR.wind), o: still(80), w: still(1.6), lc: 2, lj: 2, ml: 4}]));
  // 들어올 때 · 나갈 때 + 덜컹(몸통이 살짝 위아래)
  const x = [[0, 0], [60, 0, SMOOTH_IN], [205, 380, 'hold'], [206, -260], [frames, 0, SMOOTH_OUT]];
  const y = [[0, 0]];
  for (let at = 70; at < 205; at += 4) y.push([at, (Math.round(at / 4) % 2) ? -0.7 : 0]);
  y.push([205, 0, 'hold'], [206, 0]);
  for (let at = 210; at < frames - 40; at += 4) y.push([at, (Math.round(at / 4) % 2) ? -0.7 : 0]);
  y.push([frames - 40, 0], [frames, 0]);
  make.layer('train', [...wheels, group([polyline([[tx + 64, ty + 9], [tx + 64.01, ty + 9]]), stroke(COLOR.outline, 2)]), group([rect([tx + 65.5, ty + 4.6], [5, 4.4], 1.6), fill(COLOR.window)]), ...car(tx + 36, true), ...car(tx, false), ...wind], {position: splitPosition(x, y)});
  make.layer('lamp', [lamp], {position: splitPosition(x, y.map(([t, value, ease]) => [t, value, ease]))});
  return make.done();
}

const SCENES = {
  'sky-train': trainScene(),
  'sky-clouds-cloudy': cloudsScene('sky-clouds-cloudy', {fillColor: COLOR.cloudLight, count: 9, minY: 6, spanY: 40, minScale: 1.0, spanScale: 0.8, seconds: 28}),
  'sky-clouds-storm': cloudsScene('sky-clouds-storm', {fillColor: COLOR.cloudStorm, count: 8, minY: 0, spanY: 26, minScale: 1.15, spanScale: 0.6, seconds: 36}),
  'sky-clouds-overcast': cloudsScene('sky-clouds-overcast', {fillColor: COLOR.cloudGrey, count: 8, minY: 2, spanY: 26, minScale: 1.15, spanScale: 0.6, seconds: 36}),
  'sky-drizzle': fallScene('sky-drizzle', {frames: 40, fn: (make, frames) => drops(make, {count: 16, repeat: 1, frames, scale: 0.8, tilt: 12, tag: 'drop', splash: 6})}),
  'sky-rain': fallScene('sky-rain', {frames: 24, fn: (make, frames) => drops(make, {count: 36, repeat: 1, frames, scale: 0.8, tilt: 12, tag: 'drop', splash: 14})}),
  'sky-heavyrain': fallScene('sky-heavyrain', {frames: 15, fn: (make, frames) => drops(make, {count: 72, repeat: 1, frames, scale: 0.8, tilt: 12, tag: 'drop', splash: 28})}),
  'sky-snow': fallScene('sky-snow', {frames: 150, fn: (make, frames) => flakes(make, {count: 26, repeat: 1, frames, smallest: 1.3, biggest: 3.4, sway: 6, tag: 'flake'})}),
  'sky-flurry': fallScene('sky-flurry', {frames: 110, fn: (make, frames) => flakes(make, {count: 12, repeat: 1, frames, smallest: 1.1, biggest: 2.2, sway: 4, tag: 'flake'})}),
  'sky-sleet': fallScene('sky-sleet', {frames: 120, fn: (make, frames) => {
    drops(make, {count: 12, repeat: 4, frames, scale: 0.8, tilt: 12, tag: 'drop', splash: 4});
    flakes(make, {count: 12, repeat: 1, frames, smallest: 1.3, biggest: 3, sway: 5, tag: 'flake'});
  }}),
  'sky-storm': fallScene('sky-storm', {frames: 210, fn: (make, frames) => {
    lightning(make, frames);
    drops(make, {count: 40, repeat: 7, frames, scale: 0.8, tilt: 12, tag: 'drop', splash: 14});
  }}),
};

for (const [name, data] of Object.entries(SCENES)) {
  const text = JSON.stringify(data);
  writeFileSync(`${OUT}${name}.json`, text);
  console.log(`web/brand/${name}.json ${text.length} B · ${(data.op / FPS).toFixed(1)} 초 · 레이어 ${data.layers.length}`);
}
