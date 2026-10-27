import test from 'node:test';
import assert from 'node:assert/strict';
import { nearMatrix, orientation, rideCamera, seatEye, seatIndex, seatRows, seatNumber, seatPickerHTML, RIDE_ZOOM } from '../web/modes/coaster/first_person.mts';

// maplibre 6 의 뷰 회전(_calcMatrices): scale(1,−1,1) · rotateZ(−roll) · rotateX(pitch) · rotateZ(−bearing) — 세계(x 동 · y 남 · z 위)를 눈 좌표로
const rz = (v, a) => [Math.cos(a) * v[0] - Math.sin(a) * v[1], Math.sin(a) * v[0] + Math.cos(a) * v[1], v[2]];
const rx = (v, a) => [v[0], Math.cos(a) * v[1] - Math.sin(a) * v[2], Math.sin(a) * v[1] + Math.cos(a) * v[2]];
const R = Math.PI / 180;
const toEye = (v, o) => { const w = rz(rx(rz(v, -o.bearing * R), o.pitch * R), -o.roll * R); return [w[0], -w[1], w[2]] };
const near = (a, b, eps = 1e-9) => a.every((x, i) => Math.abs(x - b[i]) < eps);
const unit = v => { const l = Math.hypot(...v); return v.map(c => c / l) };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test('시선은 화면 안쪽(−z), 칸의 위는 화면 위(+y): 오르막 · 기울기 · 루프 꼭대기 · 똑바로 아래', () => {
  const cases = [
    [[0, -1, 0], [0, 0, 1]],                                       // 북쪽으로 수평
    [unit([1, -1, .4]), null],                                     // 북동쪽 오르막
    [unit([.3, .8, -.5]), null],                                   // 남쪽 내리막
    [[1, 0, 0], unit([0, .5, .866])],                              // 동쪽, 오른쪽으로 30° 기욺(코르크스크루)
    [[-1, 0, 0], [0, 0, -1]],                                      // 루프 꼭대기: 뒤집혀 서쪽
    [unit([0, .2, 1]), null],                                      // 루프 오르막: 거의 똑바로 위
    [[0, 0, -1], [0, -1, 0]],                                      // 똑바로 아래로 떨어짐
  ];
  for (let [d, u] of cases) {
    if (!u) { const side = unit(cross(d, [0, 0, 1])); u = unit(cross(side, d)) }   // 기울지 않은 위
    const o = orientation(d, u);
    assert.ok(o.pitch >= 0 && o.pitch <= 180, `pitch ${o.pitch}`);
    assert.ok(near(toEye(d, o), [0, 0, -1], 1e-9), `d ${d} → ${toEye(d, o)}`);
    assert.ok(near(toEye(u, o), [0, 1, 0], 1e-9), `u ${u} → ${toEye(u, o)}`);
  }
});

test('center 는 시선 방향으로 줌 18 의 카메라 거리만큼 앞, 고도는 그 점의 높이(m)', () => {
  const mpu = 1 / 31700000, E = [.85, .38, 30 * mpu], ctcd = 693;
  const c = rideCamera(E, [0, -1, 0], [0, 0, 1], { ctcd, mpu, lookDown: 0 });
  const D = ctcd / (512 * 2 ** RIDE_ZOOM);
  assert.equal(c.zoom, RIDE_ZOOM); assert.ok(Math.abs(c.x - .85) < 1e-15); assert.ok(Math.abs(c.y - (.38 - D)) < 1e-15);
  assert.ok(Math.abs(c.elevation - 30) < 1e-9); assert.ok(Math.abs(c.pitch - 90) < 1e-9 && Math.abs(c.roll) < 1e-9);
  const down = rideCamera(E, [0, -1, 0], [0, 0, 1], { ctcd, mpu });
  assert.ok(down.pitch < 90 && down.elevation < 30, '조금 숙여 본다');
});

test('자리: 칸 1 · 줄 1 은 맨 앞 칸 맨 앞 줄, 눈은 그 줄 좌석 위', () => {
  assert.equal(seatRows(20, 4.6), 4); assert.equal(seatRows(7.4, 4.6), 2);
  assert.deepEqual(seatIndex({ car: 1, row: 1, side: -1 }, 8, 4), { j: 7, i: 3, side: -1 });
  assert.deepEqual(seatIndex({ car: 8, row: 4, side: 1 }, 8, 4), { j: 0, i: 0, side: 1 });
  assert.deepEqual(seatIndex({ car: 99, row: 0, side: 1 }, 8, 4), { j: 0, i: 3, side: 1 }, '범위 밖은 끝으로');
  assert.equal(seatNumber(3, 1), 7);
  const fr = [1, 2, 3, 0, -1, 0, 1, 0, 0, 0, 0, 1], { E } = seatEye(fr, 20, 4.6, 1, 4, 3, -1);
  assert.ok(Math.abs(E[0] - (1 - .215 * 4.6)) < 1e-9, '왼쪽 자리는 R 의 반대쪽');
  assert.ok(E[1] < 2 - 17 && E[1] > 2 - 18, '맨 앞 줄은 칸 앞쪽(북쪽)');
  assert.ok(E[2] > 3 + .56 * 4.6, '눈은 통 테두리 위');
});

test('배치도: 칸 × 줄 × 좌우 버튼, 고른 자리 하나만 눌림', () => {
  const h = seatPickerHTML(3, 4, { car: 2, row: 1, side: 1 });
  assert.equal(h.match(/class="seat( on)?"/g).length, 3 * 4 * 2);
  assert.equal(h.match(/aria-pressed="true"/g).length, 1);
  assert.match(h, /data-car="2" data-row="1" data-side="1" aria-pressed="true"/);
});

test('nearMatrix: 같은 카메라 · 먼 면은 그대로, 가까운 면만 바꾼다', () => {
  // 원근 투영(n 5, f 900) · 임의의 뷰(돌리고 옮김), 열 우선
  const persp = (n, f) => { const t = 1 / Math.tan(.6); return [t, 0, 0, 0, 0, t * 1.3, 0, 0, 0, 0, -(f + n) / (f - n), -1, 0, 0, -2 * f * n / (f - n), 0] };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o };
  const a = .7, b = -.4, view = mul([Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, Math.cos(b), Math.sin(b), 0, 0, -Math.sin(b), Math.cos(b), 0, 30, -20, -400, 1]);
  const got = nearMatrix(mul(persp(5, 900), view), .2), want = mul(persp(.2, 900), view);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(got[i] - want[i]) < 1e-9 * Math.max(1, Math.abs(want[i])), `${i}: ${got[i]} ≠ ${want[i]}`);
});
