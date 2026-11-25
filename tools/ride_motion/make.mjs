// 타고 가는 동안 정보 화면의 「가고 있다」 풍경 움직임(Lottie JSON)을 만든다 → web/brand/ride-scenery.json
// 풍경만 그린다 — 가운데 슝 로고는 로그인 화면의 로고 움직임(web/brand/login-motion-loop.json)을 화면이 그대로 얹는다(lib/ride_info_motion.mts · 여기서 새로 그리지 않는다 · 2026-11-25 사용자).
// 우리는 오른쪽으로 간다(로고 앞머리 = 오른쪽) → 땅에 붙은 것(건물 · 나무 · 가로등 · 차선)은 왼쪽으로 흐른다 — 가까울수록 빠르다(건물 1 < 나무 2 < 차선 3).
// 차(승용차 · 택시 · 버스 · 트럭)는 늘 앞머리 쪽으로 달린다: 같은 쪽 차로는 오른쪽을 보고 우리를 앞질러 오른쪽으로, 마주 오는 차로는 왼쪽을 보고 차선보다 빨리 왼쪽으로.
// (시안 3 은 같은 쪽 차가 오른쪽을 본 채 땅과 같이 왼쪽으로 흘러 뒷걸음질로 보였다 · 걷는 사람 층은 뺐다 — 2026-11-25 사용자)
// 모든 것이 한 바퀴(LOOP 장면) 뒤 처음 자리로 돌아와 이음매 없이 되풀이된다. 색은 자리 표시 색(COLOR — 값마다 다른 색)으로 만들고 불러올 때
// web/lib/ride_info_motion.mts 가 낮(라이트) · 밤(다크) 색으로 칠한다 — 아래 COLOR 와 그 파일의 PAINT 를 맞춘다. 날씨(구름 · 비 · 눈)는 메뉴 하늘 장면(sky-*.json)을 그 위에 겹친다.
//   node tools/ride_motion/make.mjs
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const OUT = fileURLToPath(new URL('../../web/brand/ride-scenery.json', import.meta.url));
const FPS = 30, WIDTH = 400, HEIGHT = 300, LOOP = 360;   // 12초 한 바퀴
const LEFT = -90, RIGHT = WIDTH + 90, SPAN = RIGHT - LEFT;   // 화면 밖에서 밖으로(물건 하나가 한 바퀴 지나는 길이)
const GROUND = 222, ROAD_TOP = 222, ROAD_BOTTOM = 272;   // 그 아래(272~300)는 보도. 로고는 맨 앞 차로(바닥 y 268 · 화면이 얹는다)
const FAR_LANE = 238, MID_LANE = 254;   // 마주 오는 차로 · 같은 쪽 차로(바퀴 바닥 y)
const ROAD_LAPS = 3, FAR_LAPS = 5;   // 차선이 흐르는 빠르기(땅 — 한 바퀴에 지나는 횟수) · 마주 오는 차(땅보다 빠르다)
const hex = code => [1, 3, 5].map(at => +(parseInt(code.slice(at, at + 2), 16) / 255).toFixed(4)).concat(1);
const round = value => +value.toFixed(2);
// 같은 번호는 늘 같은 값(다시 만들어도 같은 장면)
const rnd = (index, salt) => { const seed = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453; return seed - Math.floor(seed); };

// 자리 표시 색(ride_info_motion.mts PAINT 가 낮 · 밤 색으로 바꾼다 — 이름 = 쓰임)
const CODE = {
  sky: '#010101', skyLow: '#010102', hill: '#010103', hillFar: '#010104', road: '#010105', dash: '#010106', walk: '#010107', curb: '#010108',
  wall0: '#020101', wall1: '#020102', wall2: '#020103', wall3: '#020104', wall4: '#020105', window: '#020106', glass: '#020107', roof0: '#020108', roof1: '#020109', door: '#02010a', awning: '#02010b',
  leaf0: '#030101', leaf1: '#030102', trunk: '#030103', pole: '#030104', bulb: '#030105',
  car0: '#040101', car1: '#040102', car2: '#040103', taxi: '#040104', bus0: '#040105', bus1: '#040106', truck: '#040107', box: '#040108', carGlass: '#040109', wheel: '#04010a', line: '#04010b',
};
const COLOR = Object.fromEntries(Object.entries(CODE).map(([name, code]) => [name, hex(code)]));

// ---- 값 · 움직임 ----
const LIN = {o: {x: [0], y: [0]}, i: {x: [1], y: [1]}};
const still = value => ({a: 0, k: value});
// [[장면, 값, 'hold'?], …] — hold 는 다음 장면까지 값을 붙잡는다(순간 이동)
function moving(frames) {
  const list = frames.map(([time, value]) => ({t: round(time), s: [value].flat().map(round)}));
  frames.forEach(([, , ease], index) => {
    if (index === frames.length - 1) return;
    if (ease === 'hold') list[index].h = 1; else Object.assign(list[index], LIN);
  });
  return {a: 1, k: list};
}
const transform = ({x = 0, y = 0, opacity = 100}) =>
  ({a: still([0, 0]), p: {s: true, x: typeof x === 'number' ? still(x) : x, y: typeof y === 'number' ? still(y) : y}, s: still([100, 100]), r: still(0), o: typeof opacity === 'number' ? still(opacity) : opacity});

// 왼쪽으로 흘러가다 LEFT 에 닿으면 RIGHT 로 순간 이동 — 한 바퀴에 laps 번 지난다(laps 가 클수록 빠르다 · 정수라 이음매가 없다).
// laps 가 음수면 오른쪽으로(RIGHT 에 닿으면 LEFT 로) — 왼쪽으로 가는 길을 좌우로 뒤집은 것
function drift(startX, laps) {
  const mirror = value => (laps < 0 ? LEFT + RIGHT - value : value);
  const speed = Math.abs(laps) * SPAN / LOOP, keys = [[0, mirror(startX)]];
  let time = 0, x = mirror(startX);
  while (time < LOOP) {
    const wrapAt = time + (x - LEFT) / speed;
    if (wrapAt >= LOOP) { keys.push([LOOP, x - (LOOP - time) * speed]); break; }
    keys.push([wrapAt, LEFT, 'hold'], [wrapAt + 0.01, RIGHT]);
    time = wrapAt + 0.01; x = RIGHT;
  }
  return moving(keys.map(([at, value, ease]) => [at, mirror(value), ease]));
}
// ---- 모양 ----
const fill = color => ({ty: 'fl', c: still(color), o: still(100), r: 1});
const stroke = (color, width) => ({ty: 'st', c: still(color), o: still(100), w: still(width), lc: 2, lj: 2, ml: 4});
const rect = (center, size, radius = 0) => ({ty: 'rc', d: 1, p: still(center), s: still(size), r: still(radius)});
const ellipse = (center, size) => ({ty: 'el', d: 1, p: still(center), s: still(size)});
const path = points => ({ty: 'sh', ks: still({v: points, i: points.map(() => [0, 0]), o: points.map(() => [0, 0]), c: true})});
const line = points => ({ty: 'sh', ks: still({v: points, i: points.map(() => [0, 0]), o: points.map(() => [0, 0]), c: false})});
const group = items => ({ty: 'gr', it: [...items, {ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0)}]});

const layers = [];
const layer = (nm, shapes, motion = {}) => layers.push({ddd: 0, ind: layers.length + 1, ty: 4, nm, sr: 1, ks: transform(motion), ao: 0, shapes, ip: 0, op: LOOP, st: 0, bm: 0});

// ===== 앞(위)에 그릴 것부터 =====
// ---- 차(바퀴 바닥 = 0 · side 1 은 오른쪽을 · -1 은 왼쪽을 본다) ----
const wheels = (spots, size) => group([...spots.map(spot => ellipse([spot, -size / 2], [size, size])), fill(COLOR.wheel)]);
const outline = () => stroke(COLOR.line, 1.3);
const VEHICLES = {
  // 승용차 · 택시(지붕 표시등): 낮은 몸통 + 둥근 지붕
  sedan: (side, paint) => [wheels([-13, 13], 9),
    group([rect([side * 2, -17], [20, 8], 3), fill(COLOR.carGlass)]),
    group([rect([side * 2, -15], [25, 13], 6), rect([0, -8.5], [44, 11], 5), outline(), fill(paint)])],
  taxi: (side) => [wheels([-13, 13], 9),
    group([rect([side * 2, -24.5], [9, 4], 1.5), outline(), fill(COLOR.bulb)]),
    group([rect([side * 2, -17], [20, 8], 3), fill(COLOR.carGlass)]),
    group([rect([side * 2, -15], [25, 13], 6), rect([0, -8.5], [44, 11], 5), outline(), fill(COLOR.taxi)])],
  // 버스: 긴 상자 + 창 줄 + 문
  bus: (side, paint) => [wheels([-24, 24], 10),
    group([...[-27, -14, -1, 12].map(spot => rect([side * spot, -21], [10, 9], 2)), rect([side * 28, -19], [9, 13], 2), fill(COLOR.carGlass)]),
    group([rect([0, -8], [78, 2.4]), fill(COLOR.window)]),
    group([rect([0, -17], [78, 28], 6), outline(), fill(paint)])],
  // 트럭: 짐칸 상자 + 운전석
  truck: (side) => [wheels([-18, 20], 10),
    group([rect([side * 25, -17], [9, 8], 2), fill(COLOR.carGlass)]),
    group([rect([side * 24, -13], [18, 20], 5), outline(), fill(COLOR.truck)]),
    group([rect([side * -8, -16.5], [44, 27], 3), outline(), fill(COLOR.box)])],
};
const vehicle = (nm, kind, paint, startX, laps, y, side, scale = 1) => {
  const shapes = VEHICLES[kind](side, paint);
  shapes.forEach(part => { part.it.at(-1).s = still([scale * 100, scale * 100]); });
  layer(nm, shapes, {x: drift(startX, laps), y});
};
// 같은 쪽 차로: 오른쪽을 보고 우리를 앞질러 오른쪽으로 천천히(우리보다 조금 빠르다) — 같은 빠르기 · 고른 간격이라 서로 겹치지 않는다
const NEAR = [['near-bus', 'bus', COLOR.bus0], ['near-car', 'sedan', COLOR.car1], ['near-truck', 'truck', null]];
NEAR.forEach(([nm, kind, paint], index) => vehicle(nm, kind, paint, LEFT + 40 + index * SPAN / NEAR.length, -1, MID_LANE, 1));
// 마주 오는 차로: 왼쪽을 보고 왼쪽으로 — 차선(ROAD_LAPS)보다 빨라야 앞으로 달려 보인다(느리면 뒷걸음질) · 조금 작게(멀다)
const FAR = [['far-taxi', 'taxi', null], ['far-car0', 'sedan', COLOR.car0], ['far-bus', 'bus', COLOR.bus1], ['far-car1', 'sedan', COLOR.car2]];
FAR.forEach(([nm, kind, paint], index) => vehicle(nm, kind, paint, LEFT + (index + rnd(index, 6) * 0.35) * SPAN / FAR.length, FAR_LAPS, FAR_LANE, -1, 0.86));

// 차선(점선 두 줄) — 줄 하나가 층 하나: 점선 한 칸(DASH_GAP)만큼 흐르고 처음 자리로 돌아오기를 되풀이한다(같은 그림이라 이음매가 없다)
const DASH_GAP = 45, DASH_TURNS = Math.round(ROAD_LAPS * SPAN / DASH_GAP);   // 한 바퀴에 지나가는 점선 칸 수(정수)
[(FAR_LANE + MID_LANE) / 2 - 2, MID_LANE + 4].forEach((y, index) => {
  const dashes = [], keys = [];
  for (let x = -DASH_GAP; x < WIDTH + DASH_GAP * 2; x += DASH_GAP) dashes.push(rect([x, 0], [18, 2.2], 1.1));
  for (let turn = 0; turn < DASH_TURNS; turn++) keys.push([turn * LOOP / DASH_TURNS + (turn ? 0.01 : 0), 0], [(turn + 1) * LOOP / DASH_TURNS, -DASH_GAP, 'hold']);
  layer(`dashes${index}`, [group([...dashes, fill(COLOR.dash)])], {x: moving(keys), y});
});
// 도로 · 보도 바닥
layer('curb', [group([rect([WIDTH / 2, ROAD_BOTTOM + 1.5], [WIDTH + 20, 3]), fill(COLOR.curb)])]);
layer('road', [group([rect([WIDTH / 2, (ROAD_TOP + ROAD_BOTTOM) / 2], [WIDTH + 20, ROAD_BOTTOM - ROAD_TOP]), fill(COLOR.road)])]);
layer('sidewalk', [group([rect([WIDTH / 2, (ROAD_BOTTOM + HEIGHT) / 2 + 1], [WIDTH + 20, HEIGHT - ROAD_BOTTOM + 2]), fill(COLOR.walk)])]);

// 나무(둥근 · 뾰족) · 가로등(가운데 겹)
for (let index = 0; index < 8; index++) {
  const kind = index % 4, startX = LEFT + index * SPAN / 8, leaf = index % 2 ? COLOR.leaf1 : COLOR.leaf0;
  const tall = round(22 + rnd(index, 8) * 10);
  let shapes;
  if (kind === 2) shapes = [group([ellipse([10, -42], [8, 5]), fill(COLOR.bulb)]), group([line([[0, 0], [0, -43], [9, -43]]), stroke(COLOR.pole, 2.4)])];
  else if (kind === 3) shapes = [group([path([[0, -tall - 26], [11, -8], [-11, -8]]), fill(leaf)]), group([line([[0, 0], [0, -10]]), stroke(COLOR.trunk, 3)])];
  else shapes = [group([ellipse([0, -tall - 2], [tall, tall + 2]), fill(leaf)]), group([line([[0, 0], [0, -14]]), stroke(COLOR.trunk, 3)])];
  layer(`${kind === 2 ? 'lamp' : 'tree'}${index}`, shapes, {x: drift(startX, 2), y: GROUND});
}

// ---- 건물(먼 겹 · 천천히): 아파트 · 빌딩 · 상가 · 집 — 바닥 가운데 = 0 ----
const WALLS = [COLOR.wall0, COLOR.wall1, COLOR.wall2, COLOR.wall3, COLOR.wall4];
const BUILDINGS = {
  // 아파트: 넓고 높다 · 창이 줄줄이 · 옥상 물탱크
  apartment: (index, wall) => {
    const width = 52, height = round(96 + rnd(index, 5) * 34), windows = [];
    for (let row = 0; row < Math.floor((height - 14) / 13); row++) for (let col = 0; col < 4; col++) windows.push(rect([-width / 2 + 9 + col * 11.4, -height + 12 + row * 13], [7, 6], 1));
    return {width, shapes: [group([...windows, fill(COLOR.window)]), group([rect([10, -height - 4], [14, 9], 2), fill(COLOR.roof1)]), group([rect([0, -height / 2], [width, height], 3), fill(wall)])]};
  },
  // 빌딩: 좁고 아주 높다 · 유리 띠 · 안테나
  tower: (index, wall) => {
    const width = 36, height = round(128 + rnd(index, 5) * 34), bands = [];
    for (let row = 0; row < Math.floor((height - 10) / 11); row++) bands.push(rect([0, -height + 10 + row * 11], [width - 10, 5], 1.5));
    return {width, shapes: [group([...bands, fill(COLOR.glass)]), group([line([[0, -height], [0, -height - 14]]), stroke(COLOR.roof1, 2)]), group([rect([0, -height / 2], [width, height], 5), fill(wall)])]};
  },
  // 상가: 낮고 넓다 · 차양 · 큰 창 · 문
  shop: (index, wall) => {
    const width = round(54 + rnd(index, 4) * 14), height = round(40 + rnd(index, 5) * 12);
    return {width, shapes: [
      group([rect([0, -height + 13], [width + 6, 9], 3), fill(index % 2 ? COLOR.awning : COLOR.roof0)]),
      group([rect([width / 2 - 11, -9], [10, 18], 1.5), fill(COLOR.door)]),
      group([rect([-8, -12], [width - 32, 13], 2), fill(COLOR.window)]),
      group([rect([0, -height / 2], [width, height], 3), fill(wall)])]};
  },
  // 집: 세모 지붕 · 창 하나 · 문
  house: (index, wall) => {
    const width = 38, height = 28;
    return {width, shapes: [
      group([path([[0, -height - 18], [width / 2 + 5, -height + 1], [-width / 2 - 5, -height + 1]]), fill(index % 2 ? COLOR.roof1 : COLOR.roof0)]),
      group([rect([8, -8], [8, 16], 1.5), fill(COLOR.door)]),
      group([rect([-8, -15], [9, 9], 1.5), fill(COLOR.window)]),
      group([rect([0, -height / 2], [width, height], 2), fill(wall)])]};
  },
};
const ROW = ['apartment', 'shop', 'tower', 'house', 'apartment', 'tower', 'shop', 'house', 'tower', 'shop', 'apartment', 'house'];
let cursor = LEFT;
const placed = ROW.map((kind, index) => { const made = BUILDINGS[kind](index, WALLS[(index * 3) % WALLS.length]); const at = cursor + made.width / 2; cursor += made.width + 6; return {kind, at, ...made}; });
const stretch = SPAN / (cursor - LEFT);   // 한 바퀴 길이에 고르게 펴 넣는다
placed.forEach(({kind, at, shapes}, index) => layer(`${kind}${index}`, shapes, {x: drift(LEFT + (at - LEFT) * stretch, 1), y: GROUND}));

// 먼 언덕 · 하늘(제자리)
layer('hills', [group([ellipse([80, GROUND + 4], [260, 120]), ellipse([330, GROUND + 6], [240, 96]), fill(COLOR.hill)]), group([ellipse([200, GROUND + 6], [300, 150]), fill(COLOR.hillFar)])]);
layer('sky-low', [group([rect([WIDTH / 2, GROUND - 45], [WIDTH + 20, 90]), fill(COLOR.skyLow)])]);
layer('sky', [group([rect([WIDTH / 2, HEIGHT / 2], [WIDTH + 20, HEIGHT]), fill(COLOR.sky)])]);

const data = {v: '5.7.0', fr: FPS, ip: 0, op: LOOP, w: WIDTH, h: HEIGHT, nm: 'ride-scenery', ddd: 0, assets: [], layers};
const text = JSON.stringify(data);
writeFileSync(OUT, text);
console.log(`web/brand/ride-scenery.json ${text.length} B · ${(LOOP / FPS).toFixed(1)} 초 · 레이어 ${layers.length}`);
