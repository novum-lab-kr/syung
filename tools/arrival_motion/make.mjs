// 타고 가기 도착 표시 움직임(Lottie JSON)을 만든다 → web/brand/arrival-char-ride.json(도착 연기) · arrival-flag.json(길 끝 깃발 · 되풀이)
// 지도 속 도착 자리 마커 안에서 재생한다(30fps · 연기는 한 번 재생 후 끝 장면 정지 — web/lib/arrival_motion.mts).
// 색은 로그인 장면 값(LM) 고정('lm-' 층 — 다시 칠하지 않는다) · 색종이만 자리 표시 색(COLOR) — arrival_motion.mts 가 불러올 때 CSS 변수
// (--syung · --syung-deep · --syung-ink · --ink · --paper)의 지금 값으로 바꿔 칠한다. 아래 COLOR 표와 arrival_motion.mts 의 PAINT 표를 맞춘다.
// 글(「도착!」)은 장면에 넣지 않는다 — 글꼴이 들어가야 해서 HTML 로 위에 얹는다(ride_arrival.tsx).
//   node tools/arrival_motion/make.mjs
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const OUT = fileURLToPath(new URL('../../web/brand/', import.meta.url));
const FPS = 30;
const hex = code => [1, 3, 5].map(at => +(parseInt(code.slice(at, at + 2), 16) / 255).toFixed(4)).concat(1);
// 자리 표시 색(받는 쪽이 CSS 변수 값으로 바꾼다) — 서로 겹치지 않는 값
const COLOR = {syung: hex('#ffd400'), deep: hex('#e0a000'), syungInk: hex('#2a2000'), ink: hex('#111111'), paper: hex('#fefefe'), shadow: hex('#000000')};

// 같은 번호는 늘 같은 값(다시 만들어도 같은 장면)
const rnd = (index, salt) => { const seed = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453; return seed - Math.floor(seed) };
const round = value => +value.toFixed(2);

// ---- 값 · 움직임 ----
const LIN = {o: {x: [0], y: [0]}, i: {x: [1], y: [1]}};
const OUT_EASE = {o: {x: [0.2], y: [0.8]}, i: {x: [0.3], y: [1]}};
const IN_EASE = {o: {x: [0.5], y: [0]}, i: {x: [0.9], y: [0.5]}};
const still = value => ({a: 0, k: value});
// [[장면, 값, 부드러움], …] — 부드러움은 그 장면에서 다음 장면까지
function moving(frames) {
  const list = frames.map(([time, value]) => ({t: time, s: [value].flat().map(round)}));
  frames.forEach(([, , ease = LIN], index) => { if (index < frames.length - 1) Object.assign(list[index], ease); });
  return {a: 1, k: list};
}
const prop = value => (value && value.a !== undefined ? value : still(value));
const transform = ({anchor = [0, 0], position = [0, 0], scale = [100, 100], rotation = 0, opacity = 100}) =>
  ({a: still(anchor), p: prop(position), s: prop(scale), r: prop(rotation), o: prop(opacity)});

// ---- 모양 ----
const fill = (color, opacity = 100) => ({ty: 'fl', c: still(color), o: still(opacity), r: 1});
const stroke = (color, width) => ({ty: 'st', c: still(color), o: still(100), w: still(width), lc: 2, lj: 2, ml: 4});
const rect = (center, size, radius = 0) => ({ty: 'rc', d: 1, p: still(center), s: still(size), r: still(radius)});
const ellipse = (center, size) => ({ty: 'el', d: 1, p: still(center), s: still(size)});
const pathOf = (points, closed = true) => ({v: points.map(point => point.map(round)), i: points.map(() => [0, 0]), o: points.map(() => [0, 0]), c: closed});
const polygon = points => ({ty: 'sh', ks: still(pathOf(points))});
const group = items => ({ty: 'gr', it: [...items, {ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0)}]});

function scene(name, width, height, frames) {
  const layers = [];
  return {
    layer(nm, shapes, motion = {}, from = 0, to = frames) {   // 앞(위)에 그릴 것을 먼저 더한다
      layers.push({ddd: 0, ind: layers.length + 1, ty: 4, nm, sr: 1, ks: transform(motion), ao: 0, shapes, ip: from, op: to, st: 0, bm: 0});
    },
    done: () => ({v: '5.7.0', fr: FPS, ip: 0, op: frames, w: width, h: height, nm: name, ddd: 0, assets: [], layers}),
  };
}

// 색종이 한 조각: 가운데에서 바깥으로 튀었다가 조금 떨어지며 사라진다(끝 장면에는 없다)
function confetti(make, {count, center, reach, start, life, shapes, colors, salt}) {
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + rnd(index, salt) * 0.5, distance = reach * (0.65 + rnd(index, salt + 1) * 0.45);
    const away = [center[0] + Math.cos(angle) * distance, center[1] + Math.sin(angle) * distance * 0.8];
    const late = start + Math.round(rnd(index, salt + 2) * 3), end = late + life, fall = 10 + rnd(index, salt + 3) * 14;
    const spin = (rnd(index, salt + 4) - 0.5) * 720, color = colors[index % colors.length];
    make.layer(`bit${index}`, [group([shapes(index), fill(color)])], {
      position: moving([[late, center, OUT_EASE], [late + Math.round(life * 0.45), away, IN_EASE], [end, [away[0], away[1] + fall]]]),
      rotation: moving([[late, 0], [end, spin]]),
      scale: moving([[late, [40, 40], OUT_EASE], [late + 6, [100, 100]], [end, [90, 90]]]),
      opacity: moving([[late, 100], [late + Math.round(life * 0.6), 100], [end, 0]]),
    }, late, end + 1);
  }
}

// 도착 자리(발밑) — 5차 캐릭터 장면 200×220 의 발밑(rideScene 이 캔버스를 왼쪽으로 100 늘려 FEET_R 로 쓴다)
const FEET = [100, 196];

// ===== 6차 char-c 「로고 열차 타고 도착」: 로그인 팝업 로고 움직임(tools/login_motion/make.mjs)을 거꾸로 =====
// 로고 속 까만 열차가 왼쪽에서 슈우웅 들어와 덜컹 멈춤 → 새싹이(kid)가 뛰어내려 도착 자리(발밑)에 착지 → 콩 한 번 · 짧은 색종이 → 열차는 다시 출발해 오른쪽 화면 밖으로. 끝 자세 = 새싹이 혼자.
// 모양 · 색은 login_motion 그대로 옮겨 적었다(새 그림 없음 — 같은 값: LM 색 · 로고 47px · kid 부품). login_motion 에서 바뀌면 여기도 맞춘다.
// 로그인 장면처럼 색은 고정값(라이트 · 다크 같음) — 이 층들은 이름이 'lm-' 로 시작해 arrival_motion.mts 가 다시 칠하지 않는다.
// 바람 선 · 먼지만 테마 색(class lm-wind · lm-dust → syung.css 가 var(--muted)). 색종이는 다른 안과 같이 자리 표시 색(CSS 변수로 칠함).
// 위치는 [x, y] 한 묶음만 쓴다(나눈 위치 s:true 금지 — NaN).
const LM = {yellow: hex('#ffd400'), ink: hex('#141414'), ledge: hex('#e9e5cd'), spark: hex('#f5a524'), face: hex('#ffe5ba'), cheek: hex('#f4a9b5'), leaf: hex('#5bbf4a'), stem: hex('#368c3c'), theme: hex('#8a8676')};
const lmGroup = (items, {position = [0, 0], anchor = [0, 0], scale = [100, 100], rotation = 0} = {}) =>
  ({ty: 'gr', it: [...items, {ty: 'tr', p: prop(position), a: prop(anchor), s: prop(scale), r: prop(rotation), o: still(100), sk: still(0), sa: still(0)}]});
const line = points => ({ty: 'sh', ks: still(pathOf(points, false))});
const LM_UNIT = 47 / 96, lmAt = value => +(value * LM_UNIT).toFixed(3);
const LM_BODY = [lmAt(9), 0], LM_EYE = [lmAt(18), 0];
// kid 부품(발밑 가운데 = 0,0 · 키 약 53) — login_motion kidSprout · kidFace · kidBody · kidLeg 그대로
const kidParts = legs => [
  lmGroup([rect([0, -3.5], [2.2, 6], 1), fill(LM.stem)], {position: [0, -44]}),
  lmGroup([ellipse([0, 0], [9, 4.6]), fill(LM.leaf)], {position: [-4.2, -48.5], rotation: -25}),
  lmGroup([ellipse([0, 0], [9, 4.6]), fill(LM.leaf)], {position: [4.2, -48.5], rotation: 25}),
  lmGroup([rect([-4.5, -30], [3, 5], 1), fill(LM.ink)]),
  lmGroup([rect([4.5, -30], [3, 5], 1), fill(LM.ink)]),
  lmGroup([ellipse([-7, -25.5], [4.4, 2.8]), fill(LM.cheek)]),
  lmGroup([ellipse([7, -25.5], [4.4, 2.8]), fill(LM.cheek)]),
  lmGroup([rect([0, -29], [19, 13], 2.5), fill(LM.face)]),
  lmGroup([rect([0, -29], [22.5, 16.5], 3.5), fill(LM.ink)]),
  lmGroup([rect([0, -30], [31, 27], 8), fill(LM.yellow)]),
  lmGroup([rect([0, -12], [22, 14], 5), fill(LM.yellow)]),
  ...[-5, 5].map((x, index) => lmGroup([rect([0, 0], [5, 9], 2.2), fill(LM.ink)], {position: [x, -6], anchor: [0, -4], rotation: legs[index]})),
];
// login_motion star(네 모 반짝이)
const sparkStar = size => polygon([[0, -size], [size * 0.28, -size * 0.28], [size, 0], [size * 0.28, size * 0.28], [0, size], [-size * 0.28, size * 0.28], [-size, 0], [-size * 0.28, -size * 0.28]]);
function rideScene() {
  // 열차 = 로고 속 까만 열차(logo-body)만(노란 로고 상자 · 받침 · 속도선은 뺌 — 사용자 요청 2026-11-08) · 220% 로 키워 새싹이 옆에 선다(약 45×30)
  // 캔버스 600×250(발밑 (200,196) — 받는 쪽 .rac-ride 가 넓다 · 10차에 왼쪽으로 100 늘려 열차가 멀리서 들어온다): 오른쪽으로 400px 남겨 열차가 화면 밖까지 달려 나간다(390 폭 휴대폰은 발밑에서 195px 이 화면 끝)
  // 10차: 깃발(GoalFlag — 깃대는 발밑 오른쪽 24px · 밑동 = 발밑 높이)과 안 겹치게 열차 길을 발밑보다 26px 아래로(열차 위 끝이 깃대 밑동 그림자보다 아래) ·
  // 멈추는 자리는 발밑 왼쪽 아래 → 새싹이는 오른쪽 위로 포물선을 그려 깃발 바로 왼쪽(발밑)에 착지 · 열차는 깃발 밑으로 지나 오른쪽 밖으로
  const FEET_R = [FEET[0] + 100, FEET[1]];   // 이 장면의 발밑(캔버스를 왼쪽으로 100 늘림)
  const frames = 74, K = 220, TRAIN = [180, 222], STOP = 18, LAND = 42, DEP = 48, GONE = DEP + 20;
  const make = scene('arrival-char-ride', 600, 250, frames);
  // 색종이(맨 위) — 착지에 발 둘레에서 짧게 터진다 · 끝 장면 전에 다 사라짐
  confetti(make, {count: 12, center: [190, 160], reach: 38, start: LAND, life: 17, salt: 31,
    shapes: index => (index % 3 ? rect([0, 0], [4, 8], 1) : ellipse([0, 0], [5, 5])), colors: [COLOR.syung, COLOR.deep, COLOR.ink, COLOR.paper]});
  const layers = make.done().layers, base = {ddd: 0, sr: 1, ao: 0, ip: 0, op: frames, st: 0, bm: 0};
  const add = (nm, shapes, motion = {}, {parent, cl, from = 0, to = frames} = {}) => {
    const ind = layers.length + 1;
    layers.push({...base, ind, nm, ty: shapes ? 4 : 3, ks: transform(motion), ...(shapes ? {shapes} : {}), ...(parent ? {parent} : {}), ...(cl ? {cl} : {}), ip: from, op: to});
    return ind;
  };
  // 반짝이 둘(login_motion sparkle) — 착지하며 머리 옆에서
  [[[172, 140], 6, LAND], [[214, 128], 5, LAND + 3]].forEach(([at, size, start], index) => add(`lm-spark${index}`, [lmGroup([sparkStar(size), fill(LM.spark)])], {
    position: still(at), scale: moving([[start, [0, 0], OUT_EASE], [start + 5, [115, 115]], [start + 14, [0, 0]]]), rotation: moving([[start, 0], [start + 14, 60]]),
  }, {from: start, to: start + 15}));
  // kid: 열차 지붕에서 작게(25% · 투명) 튀어나와 오른쪽 위로 포물선 → 발밑(깃발 바로 왼쪽)에 착지(눌림) → 콩 한 번 → 반듯이 섬. 로그인에서 들어가던 것(25% · 투명 · 기울기)을 거꾸로
  const kidFrom = [TRAIN[0], TRAIN[1] - 12], jump = STOP + 10;
  add('lm-kid', kidParts([
    moving([[0, 0], [jump, 0], [jump + 6, 24], [LAND, 0], [LAND + 8, 0], [LAND + 11, 16], [LAND + 15, 0]]),
    moving([[0, 0], [jump, 0], [jump + 6, -24], [LAND, 0], [LAND + 8, 0], [LAND + 11, -16], [LAND + 15, 0]]),
  ]), {
    position: moving([[0, kidFrom], [jump, kidFrom, OUT_EASE], [jump + 7, [192, 136], IN_EASE], [LAND, FEET_R], [LAND + 8, FEET_R, OUT_EASE], [LAND + 12, [200, 182], IN_EASE], [LAND + 16, FEET_R]]),
    scale: moving([[0, [25, 25]], [jump, [25, 25], OUT_EASE], [jump + 7, [100, 100]], [LAND, [100, 100], OUT_EASE], [LAND + 3, [118, 84]], [LAND + 6, [95, 106]], [LAND + 8, [100, 100]], [LAND + 15, [100, 100], OUT_EASE], [LAND + 17, [108, 92]], [LAND + 20, [100, 100]]]),
    rotation: moving([[0, -18], [jump, -18, OUT_EASE], [jump + 7, -8], [LAND, 0]]),
    opacity: moving([[0, 0], [jump, 0], [jump + 2, 100]]),
  });
  // 열차: 왼쪽에서 미끄러져 들어와 덜컹 멈춤(로그인 출발 덜컹 114·87 → 95·105, 5° → −1.5° 를 거꾸로) → 새싹이가 내린 뒤 뒤로 움찔했다가 출발 덜컹 → 오른쪽으로 빨라지며 화면 밖으로
  const sized = (sx = 100, sy = 100) => [K * sx / 100, K * sy / 100];
  const holder = add('lm-train', null, {
    anchor: LM_BODY,
    position: moving([[0, [10, TRAIN[1]], OUT_EASE], [STOP, [TRAIN[0] + 7, TRAIN[1]]], [STOP + 5, [TRAIN[0] - 2, TRAIN[1]]], [STOP + 10, TRAIN], [DEP, TRAIN, OUT_EASE], [DEP + 5, [TRAIN[0] - 5, TRAIN[1]], IN_EASE], [GONE, [580, TRAIN[1]]]]),
    rotation: moving([[0, -3], [STOP - 2, -3], [STOP, 6], [STOP + 5, -1.5], [STOP + 10, 0], [DEP, 0], [DEP + 5, 3], [DEP + 9, -4], [GONE, -4]]),
    scale: moving([[0, sized()], [STOP - 1, sized()], [STOP + 1, sized(114, 87)], [STOP + 6, sized(95, 105)], [STOP + 10, sized()], [DEP, sized(), OUT_EASE], [DEP + 5, sized(92, 108)], [DEP + 8, sized(114, 87)], [DEP + 12, sized()]]),
    opacity: moving([[0, 0], [5, 100], [GONE - 5, 100], [GONE, 0]]),
  });
  // 달리는 동안 덜컹(로그인 되풀이 구간 값 — 위아래 ±0.7 · 기울기 ±1.3°)
  const bob = dy => [LM_BODY[0], LM_BODY[1] + dy];
  const body = add('lm-train-body', [lmGroup([rect(LM_BODY, [lmAt(42), lmAt(28)], lmAt(14)), fill(LM.ink)])], {
    anchor: LM_BODY,
    position: moving([[0, bob(0)], [4, bob(-0.7)], [8, bob(0)], [12, bob(-0.6)], [STOP, bob(0)], [DEP + 8, bob(0)], [DEP + 12, bob(-0.7)], [DEP + 16, bob(0)], [GONE, bob(-0.6)]]),
    rotation: moving([[0, 0], [4, 1.3], [8, 0], [12, -1.1], [STOP, 0], [DEP + 8, 0], [DEP + 12, 1.3], [DEP + 16, 0], [GONE, -1.1]]),
  }, {parent: holder, cl: 'lm-train-body'});   // 다크에서는 몸통 노랑 · 눈 먹색(로고 상자 노랑 + 열차 먹색의 반대 짝 — syung.css)
  // 눈(앞 창)은 body 위 — 멈춘 뒤 한 번 깜빡
  layers.splice(layers.length - 1, 0, {...base, ind: layers.length + 1, nm: 'lm-train-eye', cl: 'lm-train-eye', ty: 4, parent: body, shapes: [lmGroup([ellipse(LM_EYE, [lmAt(10), lmAt(10)]), fill(LM.yellow)])],
    ks: transform({anchor: LM_EYE, position: LM_EYE, scale: moving([[0, [100, 100]], [STOP + 12, [100, 100]], [STOP + 14, [100, 10]], [STOP + 16, [100, 100]]])})});
  // 11차 새싹이 탄 표시: 지붕 뒤쪽에 잎(새싹)만 빼꼼 — login_motion 이 로고를 탄 뒤 달리는 구간(162~)의 모습 그대로
  // (sproutAtBase 모양 · 색 · PLAN 70% · 뒤쪽 x 1.5 · 줄기 밑 = 지붕 ROOF 0.3 아래 · 바람에 −3° ~ −10° 살랑 · body 의 자식이라 덜컹을 같이 탄다 · body 뒤에 그려 줄기 밑이 지붕에 박힌다).
  // 멈출 때는 앞으로 한 번 쏠렸다 돌아오고, 새싹이가 튀어나오는 순간(jump) 같이 빠져 빈 열차가 떠난다
  const ROOF = -lmAt(28) / 2;
  add('lm-train-sprout', [
    lmGroup([rect([0, -3], [2.2, 6], 1), fill(LM.stem)]),
    lmGroup([ellipse([0, 0], [9, 4.6]), fill(LM.leaf)], {position: [-4.2, -4], rotation: -25}),
    lmGroup([ellipse([0, 0], [9, 4.6]), fill(LM.leaf)], {position: [4.2, -4], rotation: 25}),
  ], {
    anchor: [0, 0], position: still([1.5, ROOF + 0.3]), scale: still([70, 70]),
    rotation: moving([[0, -4], [8, -10], [STOP - 1, -3], [STOP + 2, 4], [STOP + 6, -7], [STOP + 10, -4], [jump - 1, -5]]),
  }, {parent: body, to: jump});   // 새싹이 보이기 시작하는 장면(jump)부터는 없음 — 둘이 같이 보이지 않게
  // 먼지(멈출 때 · 출발할 때 뒤 바퀴 쪽) · 바람 선(들어온 자리 · 떠난 자리에 남았다 사라짐) — 테마 색
  const wheel = TRAIN[1] + 13;   // 뒤 바퀴 높이(열차 아래 끝 근처)
  const dust = [[[TRAIN[0] - 22, wheel], [-24, -4], 8, STOP - 1], [[TRAIN[0] - 14, wheel + 2], [-34, 0], 6, STOP + 1], [[TRAIN[0] - 24, wheel], [-30, -4], 8, DEP + 6], [[TRAIN[0] - 16, wheel + 2], [-40, 0], 6, DEP + 8]];
  dust.forEach(([spot, [dx, dy], size, start], index) => add(`lm-dust${index}`, [lmGroup([ellipse([0, 0], [size, size]), fill(LM.theme)])], {
    position: moving([[start, spot, OUT_EASE], [start + 15, [spot[0] + dx, spot[1] + dy]]]),
    scale: moving([[start, [30, 30], OUT_EASE], [start + 15, [130, 130]]]),
    opacity: moving([[start, 70], [start + 6, 70, IN_EASE], [start + 15, 0]]),
  }, {cl: 'lm-dust', from: start, to: start + 16}));
  const trimOf = (start, end) => ({ty: 'tm', s: start, e: end, o: still(0), m: 1});
  [TRAIN[1] - 9, TRAIN[1] + 7].forEach((y, index) => add(`lm-wind-in${index}`, [lmGroup([line([[10, y], [TRAIN[0] - 28, y]]), trimOf(moving([[0, 0], [4, 0, OUT_EASE], [STOP + 8, 100]]), moving([[0, 0, OUT_EASE], [STOP - 4, 100]])), stroke(LM.theme, 2.5)])], {opacity: still(70)}, {cl: 'lm-wind', to: STOP + 9}));
  [TRAIN[1] - 9, TRAIN[1] + 7].forEach((y, index) => add(`lm-wind-out${index}`, [lmGroup([line([[TRAIN[0] - 20, y], [570, y]]), trimOf(moving([[DEP + 6, 0], [DEP + 12, 0, IN_EASE], [GONE + 5, 100]]), moving([[DEP + 6, 0, IN_EASE], [GONE, 100]])), stroke(LM.theme, 2.5)])], {opacity: still(70)}, {cl: 'lm-wind', from: DEP + 6, to: GONE + 6}));
  // 그림자(맨 아래) — kid 는 높이에 따라 작아짐 · 열차는 같이 움직이고 떠나면 사라짐
  add('shadow-kid', [group([ellipse([0, 0], [26, 7]), fill(COLOR.shadow, 24)])], {position: still(FEET_R),
    scale: moving([[0, [0, 0]], [jump + 2, [0, 0]], [jump + 7, [45, 45]], [LAND, [110, 110]], [LAND + 8, [100, 100]], [LAND + 12, [70, 70]], [LAND + 16, [100, 100]]])});
  const shadowY = TRAIN[1] + 16;
  add('shadow-train', [group([ellipse([0, 0], [48, 8]), fill(COLOR.shadow, 24)])], {
    position: moving([[0, [10, shadowY], OUT_EASE], [STOP, [TRAIN[0] + 7, shadowY]], [STOP + 10, [TRAIN[0], shadowY]], [DEP, [TRAIN[0], shadowY], OUT_EASE], [DEP + 5, [TRAIN[0] - 5, shadowY], IN_EASE], [GONE, [580, shadowY]]]),
    opacity: moving([[0, 0], [5, 100], [GONE - 5, 100], [GONE, 0]]),
  });
  // ind 를 차례대로 다시(눈을 끼워 넣어 어긋남) — parent 는 바뀐 번호로
  const renumber = new Map(layers.map((layer, index) => [layer.ind, index + 1]));
  layers.forEach((layer, index) => { layer.ind = index + 1; if (layer.parent) layer.parent = renumber.get(layer.parent); });
  return {...make.done(), layers};
}

// ===== 길 끝 깃발(노란 삼각 페넌트 · 11차 확정 — 타고 가는 동안 길 끝 자리에 미리 꽂혀 펄럭인다 · 되풀이) =====
// 지도 표시 크기: 캔버스 48×64 = 화면 px 그대로(줄이지 않는다) · 깃대 밑(땅) = (6,60) · 깃대 + 둥근 머리 약 44px.
// 천은 여러 점 경로로 그리고 매 장면 모양 자체를 바꾼다(기울이기 X): 물결이 깃대에서 끝으로 흘러가고(깃대 쪽은 고정 · 끝일수록 크게),
// 물결이 꺾여 내려가는 쪽에 같은 색 계열 그늘 한 단계. 색은 로그인 장면 값(LM) 고정('lm-' 층 — 테마로 다시 칠하지 않는다).
// 선: 천 테두리 2 · 깃대 · 머리 1.75(로그인 바람 선 2.5 · 지도 역 이름표 테두리 1.75 사이) · 둥근 끝 · 둥근 이음
const FLAG = {frames: 60, step: 2, pole: [6, 60], top: 22, amp: 2.2, waves: 0.85, length: 26, height: 17};
const TAU = Math.PI * 2;
// 천의 한 점(u: 깃대 0 → 끝 1) 물결 높이 — t: 0~1 한 바퀴
const flagWave = (u, t) => FLAG.amp * Math.pow(Math.max(0, u), 1.1) * Math.sin(TAU * (u * FLAG.waves - t));
// 매끈한 닫힌 경로: 꺾이는 점(corner)은 날카롭게, 나머지는 이웃 점으로 접선(캣멀-롬)
function smoothPath(points, corners, closed = true) {
  const count = points.length, tangents = points.map((point, index) => {
    if (corners.has(index)) return [0, 0];
    const prev = points[(index - 1 + count) % count], next = points[(index + 1) % count];
    return [(next[0] - prev[0]) / 6, (next[1] - prev[1]) / 6];
  });
  return {v: points.map(point => point.map(round)), i: tangents.map(([x, y]) => [round(-x), round(-y)]), o: tangents.map(([x, y]) => [round(x), round(y)]), c: closed};
}
const shapeKeys = paths => ({ty: 'sh', ks: {a: 1, k: paths.map(([time, path], index) => ({t: time, s: [path], ...(index < paths.length - 1 ? {o: {x: 0, y: 0}, i: {x: 1, y: 1}} : {})}))}});
// 천 모양(뾰족 끝): at(u,v) = 물결 전 자리(u: 깃대 0 → 끝 1 · v: 위 0 → 아래 1) · samples: 위 가장자리를 짚을 u 들(끝은 1 — 위아래가 만나 꺾인다)
function clothOutline(at, t, samples) {
  const points = [], corners = new Set(), push = (u, v, corner) => { const [x, y] = at(u, v); if (corner) corners.add(points.length); points.push([x, y + flagWave(u, t)]); };
  samples.forEach((u, index) => push(u, 0, index === 0 || u === 1));
  [...samples].reverse().forEach(u => { if (u === 1) return; push(u, 1, u === 0); });
  return smoothPath(points, corners);
}
// 그늘 띠: 물결이 꺾여 내려가는 쪽(위상 0.25~0.75) — 천 안의 u 구간 [from,to] 를 위 · 아래 가장자리로 감싼다(구간이 비면 한 점으로 접힌다)
function foldBand(at, from, to, t, count = 6) {
  const [start, end] = [Math.min(1, Math.max(0, from)), Math.min(1, Math.max(0, to))], points = [];
  for (let index = 0; index <= count; index++) { const u = start + (end - start) * index / count, [x, y] = at(u, 0); points.push([x, y + flagWave(u, t)]); }
  for (let index = count; index >= 0; index--) { const u = start + (end - start) * index / count, [x, y] = at(u, 1); points.push([x, y + flagWave(u, t)]); }
  return smoothPath(points, new Set([0, count, count + 1, 2 * count + 1]));
}
function flagScene() {
  const {frames, step, pole: [poleX, base], top, length, height} = FLAG, make = scene('arrival-flag', 48, 64, frames);
  const cloth = LM.yellow, fold = hex('#e6c62f');   // 슝 노랑 · 그늘은 브랜드 그림자 노랑(--shadow-edge-brand)
  const middle = top + height / 2, samples = Array.from({length: 11}, (_, index) => index / 10);
  const at = (u, v) => [poleX + u * length, middle + (v - 0.5) * height * (1 - u)];   // 삼각: 끝으로 갈수록 좁아진다
  const times = Array.from({length: frames / step + 1}, (_, index) => index * step);
  const keys = draw => shapeKeys(times.map(time => [time, draw(time / frames)]));
  const band = shift => keys(t => foldBand(at, (t + shift + 0.25) / FLAG.waves, (t + shift + 0.75) / FLAG.waves, t));
  // 깃대 + 둥근 머리(맨 위 — 천이 붙는 자리를 덮는다)
  make.layer('lm-flag-pole', [
    group([ellipse([poleX, top - 3], [7, 7]), stroke(LM.ink, 1.75), fill(LM.yellow)]),
    group([rect([poleX, (top - 1 + base) / 2], [3.5, base - top + 1], 1.75), stroke(LM.ink, 1.75), fill(LM.ledge)]),
  ]);
  const outline = group([keys(t => clothOutline(at, t, samples)), stroke(LM.ink, 2)]);
  make.layer('lm-flag-cloth', [outline, group([band(-1), fill(fold)]), group([band(0), fill(fold)]), group([keys(t => clothOutline(at, t, samples)), fill(cloth)])]);
  make.layer('lm-flag-shadow', [group([ellipse([0, 0], [11, 3.4]), fill(COLOR.shadow, 30)])], {position: still([poleX, base])});
  return make.done();
}

for (const [name, data] of [['arrival-flag', flagScene()], ['arrival-char-ride', rideScene()]]) {
  writeFileSync(`${OUT}${name}.json`, JSON.stringify(data));
  console.log(`${name}.json  ${data.layers.length}층 · ${data.op}장면 · ${JSON.stringify(data).length}B`);
}
