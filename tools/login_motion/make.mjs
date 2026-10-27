// 로그인 팝업 로고 움직임(Lottie JSON)을 만든다 → web/brand/login-motion.json
// 장면: 내 위치 캐릭터(새싹 볼빵 후디)가 뛰어와 로고 열차에 올라타고 열차가 덜컹 출발(2.0초 · 사용자 결정 2026-10-27 시안 3).
// 캔버스는 로고 칸이 아니라 팝업 위쪽 넓은 영역(800×170 px, 1 단위 = 1 px). 로고 칸 가운데 = 캔버스 (400, 135).
// 화면에서는 web/user/account.mjs 가 이 점을 실제 로고(.login-brand) 가운데에 맞춰 얹는다 — 휴대폰에서는 양옆이 화면 밖.
// 로고 모양은 web/brand/syung-light.svg(96 단위)를 47 px 로 줄인 것 + 아래 턱(.login-brand 의 box-shadow 0 4px 0 #e9e5cd).
// 마지막 장면 = 정지 로고만 남음(끝나면 화면이 정지 로고로 바꿔 낀다). 남의 애니메이션 · 그림을 쓰지 않는다.
// 테마 색이 필요한 것(바람 · 먼지)은 레이어 class(cl)로 두고 web/syung.css 가 색을 칠한다.
//   node tools/login_motion/make.mjs
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const OUT = fileURLToPath(new URL('../../web/brand/', import.meta.url));
const FPS = 60, WIDTH = 800, HEIGHT = 170;
const SLOT = [400, 135];   // 로고 칸 가운데
const hex = code => [1, 3, 5].map(at => parseInt(code.slice(at, at + 2), 16) / 255).concat(1);
const COLOR = {
  yellow: hex('#ffd400'), ink: hex('#141414'), ledge: hex('#e9e5cd'), spark: hex('#f5a524'),
  face: hex('#ffe5ba'), cheek: hex('#f4a9b5'), leaf: hex('#5bbf4a'), stem: hex('#368c3c'),
  theme: hex('#8a8676'),   // class 로 테마 색을 덮어쓰는 칸의 기본값(css 를 못 읽어도 보이게)
};

// ---- 값 · 움직임 ----
const EASE = {
  out: {o: {x: [0.18], y: [0.9]}, i: {x: [0.3], y: [1]}},
  inOut: {o: {x: [0.45], y: [0]}, i: {x: [0.55], y: [1]}},
  in: {o: {x: [0.55], y: [0]}, i: {x: [0.85], y: [0.5]}},
  lin: {o: {x: [0], y: [0]}, i: {x: [1], y: [1]}},
};
const still = value => ({a: 0, k: value});
// [[장면, 값, 부드러움], …] — 부드러움은 그 장면에서 다음 장면까지
function moving(frames) {
  const list = frames.map(([t, value]) => ({t, s: [value].flat()}));
  frames.forEach(([, , ease = 'inOut'], index) => { if (index < frames.length - 1) Object.assign(list[index], EASE[ease]); });
  return {a: 1, k: list};
}
const prop = value => (value && value.a !== undefined ? value : still(value));
const keyframes = ({anchor = [0, 0], position = [0, 0], scale = [100, 100], rotation = 0, opacity = 100}) =>
  ({a: prop(anchor), p: position.s ? position : prop(position), s: prop(scale), r: prop(rotation), o: prop(opacity)});
const splitPosition = (xFrames, yFrames) => ({s: true, x: moving(xFrames), y: moving(yFrames)});

// ---- 모양 ----
const fill = color => ({ty: 'fl', c: still(color), o: still(100), r: 1});
const stroke = (color, width) => ({ty: 'st', c: still(color), o: still(100), w: still(width), lc: 2, lj: 2, ml: 4});
const rect = (center, size, radius) => ({ty: 'rc', d: 1, p: still(center), s: still(size), r: still(radius)});
const ellipse = (center, size) => ({ty: 'el', d: 1, p: still(center), s: still(size)});
// 꺾은선(곡선 없음)
const polyline = (points, closed = false) => ({ty: 'sh', ks: still({v: points, i: points.map(() => [0, 0]), o: points.map(() => [0, 0]), c: closed})});
const trim = (start, end) => ({ty: 'tm', s: prop(start), e: prop(end), o: still(0), m: 1});
const star = (size) => {   // 네 갈래 반짝이(가운데 0,0)
  const tip = size, waist = size * 0.28;
  return polyline([[0, -tip], [waist, -waist], [tip, 0], [waist, waist], [0, tip], [-waist, waist], [-tip, 0], [-waist, -waist]], true);
};
function group(items, {position = [0, 0], anchor = [0, 0], scale = [100, 100], rotation = 0, opacity = 100} = {}) {
  return {ty: 'gr', it: [...items, {ty: 'tr', p: prop(position), a: prop(anchor), s: prop(scale), r: prop(rotation), o: prop(opacity), sk: still(0), sa: still(0)}]};
}

// ---- 장면 만들기 ----
function scene(name, frames) {
  const layers = [];
  let next = 1;
  const base = {ddd: 0, sr: 1, ao: 0, ip: 0, op: frames, st: 0, bm: 0};
  const api = {
    // 위에 그릴 것을 먼저 더한다(앞이 위)
    shapes(nm, items, motion = {}, {parent, cl} = {}) {
      const layer = {...base, ind: next++, ty: 4, nm, ks: keyframes(motion), shapes: items};
      if (parent) layer.parent = parent;
      if (cl) layer.cl = cl;
      layers.push(layer);
      return layer.ind;
    },
    empty(nm, motion = {}, {parent} = {}) {   // 묶어 움직이는 빈 레이어
      const layer = {...base, ind: next++, ty: 3, nm, ks: keyframes(motion)};
      if (parent) layer.parent = parent;
      layers.push(layer);
      return layer.ind;
    },
    done: () => ({v: '5.7.0', fr: FPS, ip: 0, op: frames, w: WIDTH, h: HEIGHT, nm: name, ddd: 0, assets: [], layers}),
  };
  return api;
}

// 슝 로고(47 px). 묶음 빈 레이어(기준점 = 로고 가운데)를 돌려준다. 부품 움직임: lines · body · eye
const UNIT = 47 / 96;
const at = value => +(value * UNIT).toFixed(3);
function logo(make, motion, {lines = {}, body = {}, eye = {}} = {}) {
  const holder = make.empty('logo', motion);
  const bodyCenter = [at(57 - 48), 0], eyeCenter = [at(66 - 48), 0];
  // 열차 · 눈 · 속도선 · 판 · 턱 순서로 더하고(앞이 위) 끝에 eyeOnTop() 이 눈을 열차 앞으로 옮긴다
  const bodyLayer = make.shapes('logo-body', [group([rect(bodyCenter, [at(42), at(28)], at(14)), fill(COLOR.ink)])],
    {anchor: bodyCenter, position: bodyCenter, ...body}, {parent: holder});
  make.shapes('logo-eye', [group([ellipse(eyeCenter, [at(10), at(10)]), fill(COLOR.yellow)])],
    {anchor: eyeCenter, position: eyeCenter, ...eye}, {parent: bodyLayer});
  [[16, 38, 30], [12, 48, 30], [16, 58, 30]].forEach(([from, y, to], index) => {
    const end = [at(to - 48), at(y - 48)];
    make.shapes(`logo-line${index + 1}`, [group([polyline([[at(from - 48), at(y - 48)], end]), stroke(COLOR.ink, at(6))])],
      {anchor: end, position: end, ...(lines[index] || lines.all || {})}, {parent: holder});
  });
  make.shapes('logo-tile', [group([rect([0, 0], [47, 47], 15), fill(COLOR.yellow)])], {}, {parent: holder});
  make.shapes('logo-ledge', [group([rect([0, 4], [47, 47], 15), fill(COLOR.ledge)])], {}, {parent: holder});
  return holder;
}
// 레이어 배열에서 눈을 열차 앞으로 옮긴다(위 logo() 는 열차 → 눈 순서로 더했다)
function eyeOnTop(data) {
  const layers = data.layers;
  for (let index = 0; index < layers.length - 1; index++) {
    if (layers[index].nm === 'logo-body' && layers[index + 1].nm === 'logo-eye') [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
  }
  return data;
}

// 바람 자국: 왼쪽에서 오른쪽으로 긋는 긴 선(끝이 열차를 따라가고 꼬리가 뒤따라 사라진다)
function windStreak(make, nm, y, fromX, toX, width, {head, tail, opacity}) {
  make.shapes(nm, [group([polyline([[fromX, y], [toX, y]]), trim(tail, head), stroke(COLOR.theme, width)])], {opacity}, {cl: 'lm-wind'});
}
// 먼지 한 점: (x, y) 에서 (dx, dy) 로 퍼지며 커졌다 사라진다
function dustPuff(make, nm, [x, y], [dx, dy], size, start) {
  make.shapes(nm, [group([ellipse([0, 0], [size, size]), fill(COLOR.theme)])], {
    position: moving([[start, [x, y], 'out'], [start + 30, [x + dx, y + dy]]]),
    scale: moving([[0, [0, 0], 'lin'], [start, [30, 30], 'out'], [start + 30, [130, 130]]]),
    opacity: moving([[0, 0, 'lin'], [start, 0, 'lin'], [start + 2, 70, 'lin'], [start + 12, 70, 'in'], [start + 30, 0]]),
  }, {cl: 'lm-dust'});
}
function sparkle(make, nm, [x, y], size, start) {
  make.shapes(nm, [group([star(size), fill(COLOR.spark)])], {
    position: [x, y],
    scale: moving([[0, [0, 0], 'lin'], [start, [0, 0], 'out'], [start + 9, [115, 115], 'inOut'], [start + 22, [0, 0]]]),
    rotation: moving([[start, 0, 'out'], [start + 22, 60]]),
  });
}

// ===== 새싹이 타고 출발: 내 위치 캐릭터(새싹 볼빵 후디)가 뛰어와 로고 열차에 쏙 올라타고, 열차가 덜컹 출발 =====
function ride() {
  const make = scene('syung-ride', 120);
  // 출발할 때 뒤로 날리는 바람
  windStreak(make, 'go1', 126, 250, 372, 2.5, {head: moving([[74, 0, 'out'], [84, 100]]), tail: moving([[74, 0, 'lin'], [80, 0, 'inOut'], [104, 100]]), opacity: 70});
  windStreak(make, 'go2', 144, 230, 372, 2.5, {head: moving([[76, 0, 'out'], [86, 100]]), tail: moving([[76, 0, 'lin'], [82, 0, 'inOut'], [106, 100]]), opacity: 70});
  // 캐릭터(발밑 가운데 = 0,0 · 키 약 50 px). 달리기: 몸이 통통 · 다리가 번갈아
  const run = [];
  for (let frame = 0; frame <= 40; frame += 5) run.push([frame, frame % 10 ? 153 : 158, 'inOut']);
  const legSwing = sign => moving([...Array.from({length: 9}, (_, step) => [step * 5, (step % 2 ? -1 : 1) * sign * 32, 'inOut']), [46, 0]]);
  make.shapes('kid', [
    group([rect([0, -3.5], [2.2, 6], 1), fill(COLOR.stem)], {position: [0, -44]}),
    group([ellipse([0, 0], [9, 4.6]), fill(COLOR.leaf)], {position: [-4.2, -48.5], rotation: -25}),
    group([ellipse([0, 0], [9, 4.6]), fill(COLOR.leaf)], {position: [4.2, -48.5], rotation: 25}),
    group([rect([-4.5, -30], [3, 5], 1), fill(COLOR.ink)]),
    group([rect([4.5, -30], [3, 5], 1), fill(COLOR.ink)]),
    group([ellipse([-7, -25.5], [4.4, 2.8]), fill(COLOR.cheek)]),
    group([ellipse([7, -25.5], [4.4, 2.8]), fill(COLOR.cheek)]),
    group([rect([0, -29], [19, 13], 2.5), fill(COLOR.face)]),
    group([rect([0, -29], [22.5, 16.5], 3.5), fill(COLOR.ink)]),
    group([rect([0, -30], [31, 27], 8), fill(COLOR.yellow)]),
    group([rect([0, -12], [22, 14], 5), fill(COLOR.yellow)]),
    group([rect([0, 0], [5, 9], 2.2), fill(COLOR.ink)], {position: [-5, -6], anchor: [0, -4], rotation: legSwing(1)}),
    group([rect([0, 0], [5, 9], 2.2), fill(COLOR.ink)], {position: [5, -6], anchor: [0, -4], rotation: legSwing(-1)}),
  ], {
    position: splitPosition(
      [[0, 140, 'lin'], [40, 334, 'inOut'], [58, 398]],
      [...run.slice(0, -1), [40, 158, 'out'], [50, 96, 'in'], [58, 128]],
    ),
    rotation: moving([[0, 6, 'lin'], [40, 6, 'out'], [50, -10, 'in'], [58, -20]]),
    scale: moving([[0, [100, 100], 'lin'], [50, [100, 100], 'in'], [58, [25, 25]]]),
    opacity: moving([[0, 100, 'lin'], [55, 100, 'lin'], [58, 0]]),
  });
  // 로고 열차: 처음부터 제자리. 캐릭터가 타면 통 눌렸다가, 눈 깜빡, 덜컹 출발했다 제자리
  logo(make, {
    position: moving([[0, SLOT, 'lin'], [74, SLOT, 'in'], [82, [411, 135], 'inOut'], [96, [398, 135], 'inOut'], [104, SLOT]]),
    scale: moving([[0, [100, 100], 'lin'], [57, [100, 100], 'out'], [61, [114, 87], 'inOut'], [68, [95, 105], 'inOut'], [74, [100, 100]]]),
    rotation: moving([[0, 0, 'lin'], [74, 0, 'in'], [82, 5, 'inOut'], [96, -1.5, 'inOut'], [104, 0]]),
  }, {
    lines: {all: {scale: moving([[0, [100, 100], 'lin'], [74, [100, 100], 'out'], [82, [240, 100], 'inOut'], [104, [100, 100]]])}},
    eye: {scale: moving([[0, [100, 100], 'lin'], [62, [100, 100], 'inOut'], [66, [100, 10], 'inOut'], [70, [100, 100]]])},
  });
  dustPuff(make, 'dust1', [378, 157], [-30, -5], 8, 76);
  dustPuff(make, 'dust2', [372, 159], [-42, 0], 6, 78);
  sparkle(make, 'spark1', [432, 108], 7, 60);
  return eyeOnTop(make.done());
}

const data = ride();
const text = JSON.stringify(data);
writeFileSync(`${OUT}login-motion.json`, text);
console.log(`web/brand/login-motion.json ${text.length} B · ${(data.op / FPS).toFixed(2)} 초 · 레이어 ${data.layers.length}`);
