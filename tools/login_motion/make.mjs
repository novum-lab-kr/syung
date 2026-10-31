// 로그인 팝업 로고 움직임(Lottie JSON)을 만든다 → web/brand/login-motion-loop.json
//   node tools/login_motion/make.mjs
// 장면(60 fps · 222 프레임 · 3.70초 · 캔버스 800×170 · 로고 칸 가운데 (400,135) · 로고 47px): 새싹 캐릭터(kid)가 달려와 로고 열차에 올라타고(0~58)
// 글자 조각 ㅅ · ㅠ · ㅇ · ~ 가 날아가며(58~88) 열차가 덜컹 출발(74~104) → 지붕 뒤에서 잎과 얼굴이 같이 뿅 올라와(106~118) 눈까지 살짝 보이고
// 멈췄다(118~148 · 0.5초) 쑥 내려가 잎만 남고(148~162) → 달리는 구간(162~222 · 1초 · 열차 덜컹 · 속도선 · 잎 살랑)을 되풀이한다.
// 되풀이 구간은 JSON markers 의 'loop'(tm 162 · dr 60) — web/user/account.mts 가 읽어 0~222 한 번 뒤 162~222 만 되풀이한다(222 의 그림 = 162 의 그림).
// 로고 속 까만 열차 = logo-body(로고 기준 가운데 (4.4, 0) · 20.6×13.7 · 지붕 y −6.854). 글자 모양은 Jua 글꼴(OFL · Jua-OFL.txt)의 윤곽을 jua_glyphs.json 에 뽑아 둔 것.
// 플레이어는 lottie-web light(svg) — 쓰는 기능: 부모 레이어 · 알파 트랙 매트(td/tt) · 모양 레이어뿐(표현식 · 효과 없음).
// 색 class: lm-wind(바람 선) · lm-dust(먼지) · lm-word(글자) — syung.css 가 테마 색으로 칠한다
import {writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const OUT = fileURLToPath(new URL('../../web/brand/', import.meta.url));
const HERE = fileURLToPath(new URL('./', import.meta.url));
const FPS = 60, WIDTH = 800, HEIGHT = 170;
// 달리는 구간: start 에서 시작해 end(= start + 60 · 1초) 직전까지 재생하고 start 로 돌아간다. end 의 값 = start 의 값(이음새 없음)
// appear: 지붕 뒤에서 올라오기 시작 · peekFrom~peekTo: 얼굴이 멈춰 보이는 구간(30프레임 · 0.5초 — 사용자 결정 2026-10-31) · sinkTo: 다 내려간 때 · start~end: 되풀이(얼굴이 다 내려간 다음에 시작)
export const LOOP = {appear: 106, start: 162, period: 60, peekFrom: 118, peekTo: 148, sinkTo: 158};
LOOP.end = LOOP.start + LOOP.period;
const FRAMES = LOOP.end;
const SLOT = [400, 135];
const hex = code => [1, 3, 5].map(at => parseInt(code.slice(at, at + 2), 16) / 255).concat(1);
const COLOR = {
  yellow: hex('#ffd400'), ink: hex('#141414'), ledge: hex('#e9e5cd'), spark: hex('#f5a524'),
  face: hex('#ffe5ba'), cheek: hex('#f4a9b5'), leaf: hex('#5bbf4a'), stem: hex('#368c3c'),
  theme: hex('#8a8676'),
};

// ---- 값 · 움직임 ----
const EASE = {
  out: {o: {x: [0.18], y: [0.9]}, i: {x: [0.3], y: [1]}},
  inOut: {o: {x: [0.45], y: [0]}, i: {x: [0.55], y: [1]}},
  in: {o: {x: [0.55], y: [0]}, i: {x: [0.85], y: [0.5]}},
  lin: {o: {x: [0], y: [0]}, i: {x: [1], y: [1]}},
  soft: {o: {x: [0.3], y: [0]}, i: {x: [0.2], y: [1]}},
};
const still = value => ({a: 0, k: value});
function moving(frames) {
  const list = frames.map(([t, value]) => ({t, s: [value].flat()}));
  frames.forEach(([, , ease = 'inOut'], index) => { if (index < frames.length - 1) Object.assign(list[index], EASE[ease]); });
  return {a: 1, k: list};
}
const prop = value => (value && value.a !== undefined ? value : still(value));
const keyframes = ({anchor = [0, 0], position = [0, 0], scale = [100, 100], rotation = 0, opacity = 100}) =>
  ({a: prop(anchor), p: position.s ? position : prop(position), s: prop(scale), r: prop(rotation), o: prop(opacity)});
const splitPosition = (xFrames, yFrames) => ({s: true, x: moving(xFrames), y: moving(yFrames)});
// 되풀이 구간: samples = [[구간 안 프레임, 값, ease?] …] (0 과 period 의 값이 같아야 한다) → LOOP.start 기준 절대 프레임. before = 구간 앞에 둘 키프레임
function cycle(samples, before = []) {
  const first = samples[0], last = samples[samples.length - 1];
  if (first[0] !== 0 || last[0] !== LOOP.period || JSON.stringify(first[1]) !== JSON.stringify(last[1])) throw new Error('되풀이 구간은 0 과 period 에서 같은 값으로 시작 · 끝나야 한다');
  return moving([...before, ...samples.map(([t, value, ease = 'inOut']) => [LOOP.start + t, value, ease])]);
}
// 구간 전에는 가만히(값 v0) 있다가 start 부터 되풀이 — before 를 자동으로 채운다(0 · start 에서 첫 값)
const idleThen = samples => cycle(samples, [[0, samples[0][1], 'lin']]);

// ---- 모양 ----
const fill = color => ({ty: 'fl', c: still(color), o: still(100), r: 1});
const stroke = (color, width) => ({ty: 'st', c: still(color), o: still(100), w: still(width), lc: 2, lj: 2, ml: 4});
const rect = (center, size, radius) => ({ty: 'rc', d: 1, p: still(center), s: still(size), r: still(radius)});
const ellipse = (center, size) => ({ty: 'el', d: 1, p: still(center), s: still(size)});
const polyline = (points, closed = false) => ({ty: 'sh', ks: still({v: points, i: points.map(() => [0, 0]), o: points.map(() => [0, 0]), c: closed})});
const trim = (start, end) => ({ty: 'tm', s: prop(start), e: prop(end), o: still(0), m: 1});
const star = (size) => {
  const tip = size, waist = size * 0.28;
  return polyline([[0, -tip], [waist, -waist], [tip, 0], [waist, waist], [0, tip], [-waist, waist], [-tip, 0], [-waist, -waist]], true);
};
function group(items, {position = [0, 0], anchor = [0, 0], scale = [100, 100], rotation = 0, opacity = 100} = {}) {
  return {ty: 'gr', it: [...items, {ty: 'tr', p: prop(position), a: prop(anchor), s: prop(scale), r: prop(rotation), o: prop(opacity), sk: still(0), sa: still(0)}]};
}

// ---- 장면 ----
function scene(name, frames) {
  const layers = [];
  let next = 1;
  const base = {ddd: 0, sr: 1, ao: 0, ip: 0, op: frames, st: 0, bm: 0};
  return {
    shapes(nm, items, motion = {}, {parent, cl, td, tt} = {}) {
      const layer = {...base, ind: next++, ty: 4, nm, ks: keyframes(motion), shapes: items};
      if (parent) layer.parent = parent;
      if (cl) layer.cl = cl;
      if (td) layer.td = td;   // 트랙 매트(이 레이어는 그려지지 않고 바로 다음 레이어를 가린다)
      if (tt) layer.tt = tt;   // 1 = 알파 매트를 받는 레이어
      layers.push(layer);
      return layer.ind;
    },
    empty(nm, motion = {}, {parent} = {}) {
      const layer = {...base, ind: next++, ty: 3, nm, ks: keyframes(motion)};
      if (parent) layer.parent = parent;
      layers.push(layer);
      return layer.ind;
    },
    done: () => ({v: '5.7.0', fr: FPS, ip: 0, op: frames, w: WIDTH, h: HEIGHT, nm: name, ddd: 0, assets: [], layers}),
  };
}
function eyeOnTop(data) {
  const layers = data.layers;
  for (let index = 0; index < layers.length - 1; index++) {
    if (layers[index].nm === 'logo-body' && layers[index + 1].nm === 'logo-eye') [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
  }
  return data;
}

// 슝 로고(47 px) — 묶음 빈 레이어 ind 와 열차(body) 레이어 ind 를 돌려준다
const UNIT = 47 / 96;
const at = value => +(value * UNIT).toFixed(3);
const LINE_GEOM = [[16, 38, 30], [12, 48, 30], [16, 58, 30]];   // 속도선 [시작 x, y, 끝 x](96 기준)
export const LINE_MAX = [];   // 되풀이에서 가장 길 때(생성하면 채워짐 · 경계 확인용)
const BODY_CENTER = [at(57 - 48), 0], EYE_CENTER = [at(66 - 48), 0], ROOF = -at(14);   // 열차 지붕 y(로고 기준) = −6.854
function logo(make, motion, {lines = {}, body = {}, eye = {}, parent} = {}) {
  const holder = make.empty('logo', motion, {parent});
  const bodyLayer = make.shapes('logo-body', [group([rect(BODY_CENTER, [at(42), at(28)], at(14)), fill(COLOR.ink)])],
    {anchor: BODY_CENTER, position: BODY_CENTER, ...body}, {parent: holder});
  make.shapes('logo-eye', [group([ellipse(EYE_CENTER, [at(10), at(10)]), fill(COLOR.yellow)])],
    {anchor: EYE_CENTER, position: EYE_CENTER, ...eye}, {parent: bodyLayer});
  LINE_GEOM.forEach(([from, y, to], index) => {
    const end = [at(to - 48), at(y - 48)];
    make.shapes(`logo-line${index + 1}`, [group([polyline([[at(from - 48), at(y - 48)], end]), stroke(COLOR.ink, at(6))])],
      {anchor: end, position: end, ...(lines[index] || lines.all || {})}, {parent: holder});
  });
  make.shapes('logo-tile', [group([rect([0, 0], [47, 47], 15), fill(COLOR.yellow)])], {}, {parent: holder});
  make.shapes('logo-ledge', [group([rect([0, 4], [47, 47], 15), fill(COLOR.ledge)])], {}, {parent: holder});
  return {holder, bodyLayer};
}
function windStreak(make, nm, y, fromX, toX, width, {head, tail, opacity}) {
  make.shapes(nm, [group([polyline([[fromX, y], [toX, y]]), trim(tail, head), stroke(COLOR.theme, width)])], {opacity}, {cl: 'lm-wind'});
}
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

// ===== 글자 조각(확정분 그대로) =====
// Jua 글꼴 윤곽(jua_glyphs.json · 1000 em · opentype.js getPath 의 M/L/Q/Z 명령 · y 아래가 +)
const GLYPHS = JSON.parse(readFileSync(`${HERE}jua_glyphs.json`, 'utf8')).glyphs;
const EM = 46, GS = EM / 1000, TEXT_X = 431, BASELINE = 153;   // 글자 크기 46px · 자리(캔버스 기준)
// 글자의 닫힌 윤곽들(2차 곡선은 6 조각 직선으로) — pen: x 밀기(1000 em 기준)
function contoursOf(char, pen = 0) {
  const list = [];
  let cur = null, last = [0, 0];
  for (const [type, ...value] of GLYPHS[char].commands) {
    if (type === 'M') { cur = [[value[0] + pen, value[1]]]; list.push(cur); last = cur[0]; }
    else if (type === 'L') { last = [value[0] + pen, value[1]]; cur.push(last); }
    else if (type === 'Q') {
      const [x1, y1, x, y] = [value[0] + pen, value[1], value[2] + pen, value[3]];
      for (let step = 1; step <= 6; step++) {
        const u = step / 6, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        cur.push([a * last[0] + b * x1 + c * x, a * last[1] + b * y1 + c * y]);
      }
      last = [x, y];
    }
  }
  return list;
}
function clipY(poly, test, cut) {
  const out = [];
  poly.forEach((point, index) => {
    const next = poly[(index + 1) % poly.length];
    const inA = test(point[1]), inB = test(next[1]);
    if (inA) out.push(point);
    if (inA !== inB) { const u = (cut - point[1]) / (next[1] - point[1]); out.push([point[0] + u * (next[0] - point[0]), cut]); }
  });
  return out;
}
const bounds = polys => { const xs = polys.flat().map(p => p[0]), ys = polys.flat().map(p => p[1]); return {x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys)}; };
const centerOf = polys => { const box = bounds(polys); return [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2]; };
function wordShapes(polys, center) {
  const items = polys.map(poly => polyline(poly.map(([x, y]) => [+((x - center[0]) * GS).toFixed(2), +((y - center[1]) * GS).toFixed(2)]), true));
  return [group([...items, fill(COLOR.ink)])];
}
const toCanvas = center => [+(TEXT_X + center[0] * GS).toFixed(2), +(BASELINE + center[1] * GS).toFixed(2)];
const CUT = -215;
function pieces(pen) {
  const [ring, top, hollow, gap] = contoursOf('슝', pen);
  return [
    {name: 'ㅅ', polys: [top]},
    {name: 'ㅠ', polys: [clipY(ring, y => y <= CUT + 6, CUT + 6), gap]},
    {name: 'ㅇ', polys: [clipY(ring, y => y >= CUT - 6, CUT - 6), hollow]},
  ];
}
function wordLeave(make) {
  const START = {0: 58, 1: 62, 2: 66, 3: 70}, SPAN = 18, DIST = 50, STRETCH = [118, 84];
  const penTilde = GLYPHS['슝'].advance;   // '~' 는 '슝' 바로 뒤
  const parts = [...pieces(0).map(piece => piece.polys), contoursOf('~', penTilde)];
  parts.forEach((polys, index) => {
    const center = centerOf(polys), pos = toCanvas(center), t0 = START[index];
    make.shapes(index === 3 ? 'word-tilde' : `word-${index}`, wordShapes(polys, center), {
      position: splitPosition(
        [[t0, 408, 'lin'], [t0 + 6, pos[0], 'lin'], [t0 + SPAN, pos[0] + DIST]],
        [[t0, pos[1] + 2, 'out'], [t0 + 5, pos[1] - 14, 'inOut'], [t0 + 12, pos[1] - 5, 'lin'], [t0 + SPAN, pos[1] - 9]],
      ),
      scale: moving([[t0, [30, 30], 'out'], [t0 + 5, [118, 88], 'inOut'], [t0 + 9, [100, 112], 'inOut'], [t0 + 12, [106, 98], 'lin'], [t0 + SPAN, STRETCH]]),
      rotation: moving([[t0, -25, 'out'], [t0 + 6, 8, 'inOut'], [t0 + 12, 0]]),
      opacity: moving([[0, 0, 'lin'], [t0 - 1, 0, 'lin'], [t0, 100, 'lin'], [t0 + 9, 100, 'in'], [t0 + SPAN, 0]]),
    }, {cl: 'lm-word'});
  });
}

// ===== 캐릭터 kid 부품(발밑 가운데 = 0,0 · 키 약 50). 머리는 새싹 / 얼굴로 나눠 탄 뒤 새싹만 따로 흔들 수 있게 =====
const kidSprout = () => [
  group([rect([0, -3.5], [2.2, 6], 1), fill(COLOR.stem)], {position: [0, -44]}),
  group([ellipse([0, 0], [9, 4.6]), fill(COLOR.leaf)], {position: [-4.2, -48.5], rotation: -25}),
  group([ellipse([0, 0], [9, 4.6]), fill(COLOR.leaf)], {position: [4.2, -48.5], rotation: 25}),
];
// 얼굴(눈 · 볼 · 살색 · 먹 틀 · 노란 후드) — 지붕 위로 살짝 보일 때도 이 그림 그대로(먹선 · 후드 윤곽을 더하지 않는다 · 사용자 결정 2026-10-31)
const kidFace = () => [
  group([rect([-4.5, -30], [3, 5], 1), fill(COLOR.ink)]),
  group([rect([4.5, -30], [3, 5], 1), fill(COLOR.ink)]),
  group([ellipse([-7, -25.5], [4.4, 2.8]), fill(COLOR.cheek)]),
  group([ellipse([7, -25.5], [4.4, 2.8]), fill(COLOR.cheek)]),
  group([rect([0, -29], [19, 13], 2.5), fill(COLOR.face)]),
  group([rect([0, -29], [22.5, 16.5], 3.5), fill(COLOR.ink)]),
  group([rect([0, -30], [31, 27], 8), fill(COLOR.yellow)]),
];
const kidHead = () => [...kidSprout(), ...kidFace()];
const kidBody = () => [group([rect([0, -12], [22, 14], 5), fill(COLOR.yellow)])];
const kidLeg = (x, rotation = 0) => group([rect([0, 0], [5, 9], 2.2), fill(COLOR.ink)], {position: [x, -6], anchor: [0, -4], rotation});

// ===== 잎 크기(원래 캐릭터 새싹 대비 %) · 지붕 위 자리(사용자 결정 2026-10-31 — 70% · 뒤쪽) =====
// 새싹 치수(원래 크기 · 줄기 밑 = 0,0): 줄기 2.2×6(0 ~ −6) · 잎 둘 9×4.6 at (±4.2, −4) ±25° → 잎 꼭대기 −6.82 · 잎 아래 −1.18 · 양옆 ±8.4(폭 16.8). 열차 body = 가운데 (4.4,0) · 20.6×13.7 · 알약(반지름 6.85 · 곧은 구간 x 0.95~7.85) · 지붕 −6.854 · 앞 창 (8.8,0) 지름 4.9 · 타일 위 −23.5
// x: 줄기 밑(로고 기준) — 가운데 = 알약 가운데 4.4 · 뒤쪽 = 1.5(곧은 지붕 구간의 뒤끝 0.95 안 · 70% 잎 폭 11.8 이 알약 뒤끝 −5.9 밖으로 안 나감). 줄기 밑은 지붕 0.3 아래에 박혀 열차가 덜컹여도 틈이 없다(새싹은 body 의 자식이라 같이 움직인다)
// 새싹은 지붕 위라 앞 창(지붕 아래)을 가릴 일이 없고, 꼭대기는 지붕 −6.9k 라 타일 위(−23.5)까지 16.65px 여유
const PLAN = {scale: 70, x: 1.5, desc: '70% · 뒤쪽'};
const SPROUT = {top: 6.82, half: 8.4, sink: 0.3};   // 원래 크기 치수(꼭대기 · 반폭) · 지붕에 박히는 깊이
// 줄기 밑 y(로고 기준)
const baseFor = () => ROOF + SPROUT.sink;
// 잎 꼭대기 y(로고 기준) — 타일 위(−23.5) 안쪽이어야 한다(살짝 넘치는 때 POP.over · 1.2k 까지 쳐서)
const sproutTopFor = plan => baseFor() - 1.2 * plan.scale / 100 - SPROUT.top * plan.scale / 100 * POP.over;
// 뽈록: 숨은 자리(잎 꼭대기가 지붕 0.2 아래 · POP.from 크기) → 조금 넘침(1.2k 위 · POP.over) → 제자리(100%)
const POP = {from: 0.6, over: 1.08};
// 숨은 줄기 밑 y(로고 기준): 잎 꼭대기가 지붕 0.2 아래. 잎이 가장 넓은 높이(꼭대기에서 2.82k 아래)에서 알약 둥근 끝 안에 들어야 한다(검사 — 알약은 그 높이에서 x 0.95−r ~ 7.85+r · r = √(6.85² − y²))
const hiddenBaseFor = ({scale, x}) => {
  const k = scale / 100 * POP.from;
  const base = ROOF + 0.2 + SPROUT.top * k;
  if (base > 6.85 - 0.2) throw new Error(`숨은 자리에서 줄기 밑이 열차 바닥 밖: ${base.toFixed(2)}`);
  const wideY = ROOF + 0.2 + 2.82 * k, r = Math.sqrt(6.85 * 6.85 - wideY * wideY);
  const left = x - SPROUT.half * k, right = x + SPROUT.half * k;
  if (left < 0.95 - r + 0.2 || right > 7.85 + r - 0.2) throw new Error(`숨은 자리에서 잎이 알약 밖: ${left.toFixed(2)} ~ ${right.toFixed(2)} (허용 ${(0.95 - r).toFixed(2)} ~ ${(7.85 + r).toFixed(2)})`);
  return base;
};

// 머리 치수(원래 크기 · 발밑 = 0,0): 후드 31×27 at −30(−43.5 ~ −16.5) · 먹 틀 22.5×16.5 at −29(−37.25 ~ −20.75) · 눈 3×5 at (±4.5, −30)(아래 −27.5) · 볼 at (±7, −25.5) 4.4×2.8 · 새싹 줄기 밑 −44.5
const HEAD = {sproutBase: -44.5, eyeBottom: -27.5, frameTop: -37.25, cut: -26.5, peekScale: 0.6};
// 얼굴 보이는 자리: 지붕이 kid 좌표 cut(−26.5) 를 자른다 — 눈 아래 1(0.6px) 위로 보이고 볼(−26.9 위)은 거의 안 보임. 머리 · 새싹은 같은 배율(peekScale — 얼굴이 보일 때는 잎 꼭대기가 타일 위 안에 들도록 60%, 잎만 남으면 70%)
const peekBaseFor = () => ROOF - HEAD.cut * HEAD.peekScale + HEAD.sproutBase * HEAD.peekScale;   // 줄기 밑 y(로고 기준) = 지붕 + (cut − 44.5)k
// 얼굴 탄 열차: 머리(원래 kid 얼굴 부품 그대로 · 먹선 없음) 레이어가 body 에 매달려 있고 새싹은 머리의 자식(줄기 밑 = kid −44.5). 머리는 트랙 매트(rider-mask · 지붕 위만 보임)로 지붕 아래가 잘리고, 새싹은 매트 없이 그대로.
//   106~118 뿅(숨은 자리 42% → 62% 살짝 넘침 → 60% 제자리 · 눈까지 보임) → 118~148 멈춤(0.5초 · 새싹만 살랑) → 148~158 쑥 내려감(60 → 74% 눌림 → 162 에 70% · 줄기 밑 지붕 0.3 아래) → 162~222 되풀이
function rider(make, plan, bodyLayer) {
  const s = plan.scale, k = s / 100, base = baseFor(), hiddenBase = hiddenBaseFor(plan), peekBase = peekBaseFor();
  if (sproutTopFor(plan) < -23.5 + 0.5) throw new Error(`잎 꼭대기가 타일 위 밖: ${sproutTopFor(plan).toFixed(2)}`);
  // 얼굴 자리에서 잎 꼭대기(살짝 넘칠 때: 62% · 0.4 위) · 먹 틀 윗변이 타일 위(−23.5) 안인지
  const peekTop = peekBase - 0.4 - SPROUT.top * (HEAD.peekScale + 0.02), frameTop = peekBase + (HEAD.frameTop - HEAD.sproutBase) * HEAD.peekScale;   // y 는 아래가 +
  if (peekTop < -23.5 + 0.5) throw new Error(`얼굴 자리에서 잎 꼭대기가 타일 위 밖: ${peekTop.toFixed(2)}`);
  if (frameTop < -23.5 + 0.5) throw new Error(`얼굴 자리에서 먹 틀이 타일 위 밖: ${frameTop.toFixed(2)}`);
  const t0 = LOOP.appear, t1 = LOOP.peekFrom, t2 = LOOP.peekTo, t3 = LOOP.sinkTo;
  const pct = ratio => [ratio * 100, ratio * 100];
  // 머리: 숨은 자리(42% · 잎 꼭대기 지붕 0.2 아래 · 알약 안) → 뿅 62%(0.4 위) → 60% 얼굴 자리 → 멈춤 → 쑥 내려가 74% 눌림 → 70% 제자리
  const headY = [[0, hiddenBase, 'lin'], [t0, hiddenBase, 'out'], [t0 + 7, peekBase - 0.4, 'inOut'], [t1, peekBase, 'lin'], [t2, peekBase, 'in'], [t3, base + 0.8, 'out'], [LOOP.start, base, 'lin'], [FRAMES, base]];
  const headScale = moving([[0, pct(k * POP.from), 'lin'], [t0, pct(k * POP.from), 'out'], [t0 + 7, pct(HEAD.peekScale + 0.02), 'inOut'], [t1, pct(HEAD.peekScale), 'lin'], [t2, pct(HEAD.peekScale), 'in'], [t3, pct(k * 1.06), 'out'], [LOOP.start, pct(k), 'lin'], [FRAMES, pct(k)]]);
  // 머리 기울기(줄기 밑을 축으로): 올라올 때 뒤로 −5° 젖혀졌다 1° 로 바로 서고, 내려갈 때 −3°
  const headRot = moving([[0, 0, 'lin'], [t0, 0, 'out'], [t0 + 7, -5, 'inOut'], [t1, 1, 'inOut'], [t1 + 8, 0, 'lin'], [t2, 0, 'in'], [t3, -3, 'lin'], [FRAMES, -3]]);
  // 지붕 위에 아무것도 없어지면(먹 틀 윗변이 지붕 아래로 간 뒤) 머리는 꺼 둔다 — 매트의 뒷받침. 자식(새싹)은 부모 투명도를 물려받지 않는다
  const headOpacity = moving([[0, 0, 'lin'], [t0 - 1, 0, 'lin'], [t0, 100, 'lin'], [t3 - 2, 100, 'lin'], [t3 + 1, 0]]);
  // 트랙 매트: 지붕 위(y < ROOF · body 기준) 만 보이게 — 바로 다음 레이어(머리)에 걸린다. body 의 자식이라 덜컹 · 기울기를 같이 탄다
  make.shapes('rider-mask', [group([rect([BODY_CENTER[0], ROOF - 20], [90, 40], 0), fill(COLOR.ink)])], {}, {parent: bodyLayer, td: 1});
  const headLayer = make.shapes('rider-head', kidFace(), {
    anchor: [0, HEAD.sproutBase], position: splitPosition([[0, plan.x, 'lin'], [FRAMES, plan.x]], headY), scale: headScale, rotation: headRot, opacity: headOpacity,
  }, {parent: bodyLayer, tt: 1});
  // 새싹(머리의 자식 · 줄기 밑 = kid −44.5 · 배율은 머리를 따라감): 줄기 밑을 축으로 — 올라올 때 뒤(왼쪽)로 −14° 젖혀졌다 바로 서고, 멈춘 동안 살짝(−4 ~ −7°), 내려갈 때 −9°, 달리는 구간엔 바람에 −3° ~ −10° 로 잔잔히 살랑
  make.shapes('rider-sprout', sproutAtBase(), {
    anchor: [0, 0], position: [0, HEAD.sproutBase],
    rotation: cycle([[0, -4], [16, -10], [34, -3], [50, -8], [60, -4]], [[0, 0, 'lin'], [t0, 0, 'out'], [t0 + 7, -14, 'inOut'], [t1, -4, 'inOut'], [t1 + 14, -7, 'inOut'], [t2, -4, 'in'], [t2 + 6, -9, 'inOut']]),
  }, {parent: headLayer});
}
// 새싹 부품 — 줄기 밑을 (0,0) 으로 옮긴 것(kidSprout 과 같은 그림 · 모양과 색 그대로)
const sproutAtBase = () => [
  group([rect([0, -3], [2.2, 6], 1), fill(COLOR.stem)]),
  group([ellipse([0, 0], [9, 4.6]), fill(COLOR.leaf)], {position: [-4.2, -4], rotation: -25}),
  group([ellipse([0, 0], [9, 4.6]), fill(COLOR.leaf)], {position: [4.2, -4], rotation: 25}),
];
// 머리 · 새싹 레이어를 logo-tile 바로 앞(= 타일 위 · body · 눈 · 속도선 아래)으로(names 차례 그대로)
function behindBody(data, names) {
  const picked = data.layers.filter(layer => names.includes(layer.nm)), rest = data.layers.filter(layer => !names.includes(layer.nm));
  const tileAt = rest.findIndex(layer => layer.nm === 'logo-tile');
  data.layers = [...rest.slice(0, tileAt), ...picked, ...rest.slice(tileAt)];
  return data;
}

function ride(name, plan) {
  const make = scene(name, FRAMES);
  // ---- 앞부분(확정분 그대로) ----
  windStreak(make, 'go1', 126, 250, 372, 2.5, {head: moving([[74, 0, 'out'], [84, 100]]), tail: moving([[74, 0, 'lin'], [80, 0, 'inOut'], [104, 100]]), opacity: 70});
  windStreak(make, 'go2', 144, 230, 372, 2.5, {head: moving([[76, 0, 'out'], [86, 100]]), tail: moving([[76, 0, 'lin'], [82, 0, 'inOut'], [106, 100]]), opacity: 70});
  const run = [];
  for (let frame = 0; frame <= 40; frame += 5) run.push([frame, frame % 10 ? 153 : 158, 'inOut']);
  const legSwing = sign => moving([...Array.from({length: 9}, (_, step) => [step * 5, (step % 2 ? -1 : 1) * sign * 32, 'inOut']), [46, 0]]);
  make.shapes('kid', [...kidHead(), ...kidBody(), kidLeg(-5, legSwing(1)), kidLeg(5, legSwing(-1))], {
    position: splitPosition(
      [[0, 140, 'lin'], [40, 334, 'inOut'], [58, 398]],
      [...run.slice(0, -1), [40, 158, 'out'], [50, 96, 'in'], [58, 128]],
    ),
    rotation: moving([[0, 6, 'lin'], [40, 6, 'out'], [50, -10, 'in'], [58, -20]]),
    scale: moving([[0, [100, 100], 'lin'], [50, [100, 100], 'in'], [58, [25, 25]]]),
    opacity: moving([[0, 100, 'lin'], [55, 100, 'lin'], [58, 0]]),
  });

  // 로고(타일)는 덜컹 출발(74~104) 뒤 제자리에 가만히. 달리는 느낌은 타일 안의 열차 · 속도선이 낸다(타일이 흔들리면 카드가 불안해 보인다)
  const posFrames = [[0, SLOT, 'lin'], [74, SLOT, 'in'], [82, [411, 135], 'inOut'], [96, [398, 135], 'inOut'], [104, SLOT]];
  const rotFrames = [[0, 0, 'lin'], [74, 0, 'in'], [82, 5, 'inOut'], [96, -1.5, 'inOut'], [104, 0]];
  // ---- 달리는 구간(되풀이) ----
  // 열차 몸: 위아래 ±0.7 · 기울기 ±1.3° 로 두 번 덜컹(1초에 2번) — 로고 기준 좌표 · 머리 · 눈이 같이 간다
  const bob = dy => [BODY_CENTER[0], BODY_CENTER[1] + dy];
  const bodyMotion = {
    position: cycle([[0, bob(0)], [15, bob(-0.7)], [30, bob(0)], [45, bob(-0.6)], [60, bob(0)]], [[0, BODY_CENTER, 'lin']]),
    rotation: cycle([[0, 0], [15, 1.3], [30, 0], [45, -1.1], [60, 0]], [[0, 0, 'lin']]),
  };
  // 속도선 셋: 길이가 서로 다른 박자로 늘고 줄며 "흐름"(오른쁜 끝 고정 · 왼쪽으로 뻗음). 앞부분의 출발 늘임(74~104)은 그대로
  const lineBase = [[0, [100, 100], 'lin'], [74, [100, 100], 'out'], [82, [240, 100], 'inOut'], [104, [100, 100], 'inOut']];
  const linePulse = samples => cycle(samples.map(([t, sx]) => [t, [sx, 100]]), lineBase);
  // 버그 수정(loop 의 가운데 줄 175%): 가운데 줄은 시작점이 더 왼쪽(−17.6)이라 175% 면 둥근 끝까지 타일(−23.5) 밖. 선은 x 만 늘리므로(scale [sx,100]) 둥근 끝(선 폭 반 1.47)도 같이 늘어난다 — 가장 긴 때를 둥근 끝 포함 타일 안쪽 ≥ 1px 로 묶는다(LINE_MAX 가 계산해 검사 · linecheck.mjs 가 렌더로 다시 잰다)
  const LINE_PULSE = [[[0, 100], [20, 160], [40, 115], [60, 100]], [[0, 100], [12, 115], [34, 130], [60, 100]], [[0, 100], [26, 160], [46, 110], [60, 100]]];
  LINE_PULSE.forEach((samples, index) => {
    const [from, , to] = LINE_GEOM[index], length = at(to - 48) - at(from - 48), capHalf = at(6) / 2;
    const max = Math.max(...samples.map(([, sx]) => sx)), left = at(to - 48) - (length + capHalf) * max / 100;
    if (left < -23.5 + 1) throw new Error(`속도선 ${index + 1} 이 타일 밖: 왼쪽 끝 ${left.toFixed(2)}`);
    LINE_MAX[index] = {max, left: +left.toFixed(2), margin: +(left + 23.5).toFixed(2)};
  });
  const lines = Object.fromEntries(LINE_PULSE.map((samples, index) => [index, {scale: linePulse(samples)}]));
  const eyeScale = [[0, [100, 100], 'lin'], [62, [100, 100], 'inOut'], [66, [100, 10], 'inOut'], [70, [100, 100]]];
  const eye = {scale: moving(eyeScale)};   // 앞 창 깜빡(62~70)
  const {bodyLayer} = logo(make, {position: moving(posFrames), rotation: moving(rotFrames),
    scale: moving([[0, [100, 100], 'lin'], [57, [100, 100], 'out'], [61, [114, 87], 'inOut'], [68, [95, 105], 'inOut'], [74, [100, 100]]]),
  }, {lines, eye, body: bodyMotion});
  dustPuff(make, 'dust1', [378, 157], [-30, -5], 8, 76);
  dustPuff(make, 'dust2', [372, 159], [-42, 0], 6, 78);
  sparkle(make, 'spark1', [432, 108], 7, 60);
  rider(make, plan, bodyLayer);
  wordLeave(make);
  return behindBody(eyeOnTop(make.done()), ['rider-sprout', 'rider-mask', 'rider-head']);   // 매트는 머리 바로 앞에 있어야 한다
}

const FILE = 'login-motion-loop.json';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plan = PLAN, data = ride('syung-ride', plan);
  data.markers = [{tm: LOOP.start, cm: 'loop', dr: LOOP.period}];   // 되풀이 구간(플레이어 쪽이 읽는다)
  const text = JSON.stringify(data);
  writeFileSync(`${OUT}${FILE}`, text);
  const pk = HEAD.peekScale, peekBase = peekBaseFor();
  console.log(`web/brand/${FILE} ${text.length} B · ${(data.op / FPS).toFixed(2)} 초 · 레이어 ${data.layers.length} · 되풀이 ${LOOP.start}~${LOOP.end} (${plan.desc}) · 줄기 밑 y ${baseFor().toFixed(2)} 숨은 줄기 밑 y ${hiddenBaseFor(plan).toFixed(2)} 잎 꼭대기 y(넘칠 때) ${sproutTopFor(plan).toFixed(2)} · 잎 폭 ${(16.8 * plan.scale / 100).toFixed(1)}px(열차 20.6)`);
  console.log(`얼굴 자리(${LOOP.peekFrom}~${LOOP.peekTo} · ${pk * 100}%): 줄기 밑 y ${peekBase.toFixed(2)} · 잎 꼭대기 ${(peekBase - SPROUT.top * pk).toFixed(2)}(살짝 넘칠 때 ${(peekBase - 0.4 - SPROUT.top * (pk + 0.02)).toFixed(2)}) · 먹 틀 윗변 ${(peekBase + (HEAD.frameTop - HEAD.sproutBase) * pk).toFixed(2)} · 눈 아래 ${(peekBase + (HEAD.eyeBottom - HEAD.sproutBase) * pk).toFixed(2)}(지붕 ${ROOF.toFixed(2)}) · 먹 틀 폭 ${(22.5 * pk).toFixed(1)}px · 눈 ${(3 * pk).toFixed(1)}×${(5 * pk).toFixed(1)}px`);
  console.log('속도선 가장 길 때(둥근 끝 포함 왼쪽 끝 · 타일 안쪽 여유):', JSON.stringify(LINE_MAX));
}
