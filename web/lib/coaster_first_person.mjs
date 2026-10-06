// 롤코 1인칭: 고른 자리에 앉아 그 눈으로 열차를 타는 카메라와, 자리를 고르는 작은 배치도.
//
// 칸 틀(fr: 뒤 끝 바닥 가운데 base, F 앞, R 오른쪽, U 위 — 메르카토르)은 drawTrains 가 88열차를 그릴 때와 같은 것을 쓴다.
// 자리는 coaster_train.mjs seats() 의 배치 그대로: 줄 i(0 = 맨 뒤 줄), 좌우 s(-1 왼쪽 · +1 오른쪽), 자리 번호 k = i·2 + (s > 0).
// 카메라는 maplibre 의 center · zoom · elevation · bearing · pitch · roll 로 바꿔 jumpTo 한다. 줌은 RIDE_ZOOM 으로 고정해
// (열차 · 고가 · 롤코 선로가 실제 크기로 그려지는 줌), 눈에서 시선 방향으로 그 줌의 카메라 거리만큼 앞에 center 를 둔다.
// (maplibre 의 calculateCameraOptionsFromCameraLngLatAltRotation 은 수평 시선에서 거리를 1만 m 로 바꿔 줌이 12 대로 떨어진다)

export const RIDE_ZOOM = 18;      // 1인칭 동안의 줌(지도 최대 줌): 열차 몸 폭이 실제 4.6 m
export const RIDE_FOV = 60;       // 세로 시야각(°): 기본 36.87° 는 1인칭에 좁다
export const RIDE_NEAR_M = .15;   // 가까운 면(m): 내 칸 · 앞 칸이 잘리지 않게(기본은 화면 높이/50 px — 줌 18 에서 7 m)
export const RIDE_FAR_M = 4000;   // 먼 면(m): 깊이 정밀도(가까운 면이 0.15 m) — 받는 타일 수는 maplibre 가 시선 각도로 정해 이걸로 줄지 않는다(실측 94개 그대로)
export const EYE_Z = .72;         // 눈 높이(× 몸 폭 W): 통 테두리(.56) 위, 앞 사람 머리(.6) 너머로 — 앞 벽이 화면 아래 1/5 쯤
export const LOOK_DOWN = 3 * Math.PI / 180;   // 진행 방향보다 살짝 아래로 본다(앞 선로가 화면 가운데 조금 아래)

// 칸 하나의 줄 수: coaster_train.mjs draw() 와 같은 식
export const seatRows = (L, W) => Math.max(2, Math.min(4, Math.round(L / W * 1.3)));
// 자리 번호(라이더 해시 · 숨길 자리)
export const seatNumber = (row, side) => row * 2 + (side > 0 ? 1 : 0);

// 사람이 고르는 자리(칸 1 = 맨 앞 칸, 줄 1 = 칸의 맨 앞 줄, side -1 왼쪽 · +1 오른쪽) → 그리는 쪽 번호(j: 0 = 맨 뒤 칸, i: 0 = 맨 뒤 줄)
export function seatIndex(seat, cars, rows) {
  const car = Math.max(1, Math.min(cars, seat.car | 0 || 1)), row = Math.max(1, Math.min(rows, seat.row | 0 || 1));
  return { j: cars - car, i: rows - row, side: seat.side > 0 ? 1 : -1 };
}

// 칸 틀 위 눈의 자리(메르카토르): x 는 줄 가운데 조금 뒤(얼굴 자리), y 는 좌석 가운데, z 는 EYE_Z
export function seatEye(fr, L, W, unit, rows, i, side) {
  const x = ((i + .5) / rows * L - .013 * W) * unit, y = side * .215 * W * unit, z = EYE_Z * W * unit;
  const F = [fr[3], fr[4], fr[5]], R = [fr[6], fr[7], fr[8]], U = [fr[9], fr[10], fr[11]];
  return { E: [0, 1, 2].map(c => fr[c] + F[c] * x + R[c] * y + U[c] * z), F, R, U };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const DEG = 180 / Math.PI;

// 시선 d(앞) · 화면 위 u(둘 다 단위, 메르카토르 x 동 · y 남 · z 위)를 maplibre 의 bearing · pitch · roll(°)로.
// maplibre: pitch 0 = 똑바로 아래, 90 = 수평, 180 = 똑바로 위. roll 0 의 화면 위 u0 = (cos p sin b, −cos p cos b, sin p).
export function orientation(d, u) {
  const p = Math.acos(Math.max(-1, Math.min(1, -d[2])));
  let b = Math.hypot(d[0], d[1]) > 1e-6 ? Math.atan2(d[0], -d[1])
    : p < Math.PI / 2 ? Math.atan2(u[0], -u[1]) : Math.atan2(-u[0], u[1]);   // 똑바로 아래 · 위: 방위는 화면 위 쪽으로
  const u0 = [Math.cos(p) * Math.sin(b), -Math.cos(p) * Math.cos(b), Math.sin(p)];
  const roll = Math.atan2(dot(cross(u0, u), d), dot(u0, u));   // u0 에서 u 까지 d 를 축으로 돈 각
  return { bearing: b * DEG, pitch: p * DEG, roll: -roll * DEG };   // maplibre 의 roll 은 반대 방향(뷰 행렬 rotateZ(−roll))
}

// 눈 E(메르카토르) · 칸 틀(F, U)에서 jumpTo 값. ctcd: 카메라–center 거리(px, transform.cameraToCenterDistance),
// mpu: 1 m 의 메르카토르 길이(눈 위도), lookDown: 진행 방향보다 아래로 숙이는 각(rad).
export function rideCamera(E, F, U, { ctcd, mpu, zoom = RIDE_ZOOM, lookDown = LOOK_DOWN }) {
  const c = Math.cos(lookDown), s = Math.sin(lookDown);
  const d = [0, 1, 2].map(k => F[k] * c - U[k] * s), u = [0, 1, 2].map(k => U[k] * c + F[k] * s);
  const D = ctcd / (512 * 2 ** zoom);   // center 까지(메르카토르)
  const o = orientation(d, u);
  return { x: E[0] + d[0] * D, y: E[1] + d[1] * D, elevation: (E[2] + d[2] * D) / mpu, zoom, ...o };
}

// 자리 고르기 배치도: 칸마다 위가 앞(진행 방향)인 작은 칸, 줄마다 왼쪽 · 오른쪽 자리. 고른 자리는 sel.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function seatPickerHTML(cars, rows, sel) {
  let h = '';
  for (let car = 1; car <= cars; car++) {
    let seats = '';
    for (let row = 1; row <= rows; row++) for (const side of [-1, 1]) {
      const on = sel.car === car && sel.row === row && sel.side === side, name = `${car}칸 ${row}열 ${side < 0 ? '왼쪽' : '오른쪽'}`;
      seats += `<button type="button" class="seat${on ? ' on' : ''}" data-car="${car}" data-row="${row}" data-side="${side}" aria-pressed="${on}" aria-label="${esc(name)}" title="${esc(name)}"></button>`;
    }
    h += `<div class="ride-car${car === 1 ? ' lead' : ''}"><span class="n">${car === 1 ? '맨 앞' : car}</span><div class="seats" style="--rows:${rows}">${seats}</div></div>`;
  }
  return h;
}
export const seatLabel = sel => `${sel.car}칸 ${sel.row}열 ${sel.side < 0 ? '왼쪽' : '오른쪽'}`;
