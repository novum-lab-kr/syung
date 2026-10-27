var RIDE_VFOV = [55, 105];
var COCKPIT_NEAR_M = .1;
var RIDE_FAR_M = 4e4;
var EYE_Z = .72;
var LOOK_DOWN = 3 * Math.PI / 180;
function rideFov(w, h) {
	const v = 2 * Math.atan(Math.tan(90 * Math.PI / 360) * h / Math.max(1, w)) * 180 / Math.PI;
	return Math.max(RIDE_VFOV[0], Math.min(RIDE_VFOV[1], v));
}
function nearMatrix(M, nearPx) {
	const w = [
		M[3],
		M[7],
		M[11],
		M[15]
	], z = [
		M[2],
		M[6],
		M[10],
		M[14]
	];
	const A = -(z[0] * w[0] + z[1] * w[1] + z[2] * w[2]) / (w[0] * w[0] + w[1] * w[1] + w[2] * w[2]), far = (z[3] + A * w[3]) / (A + 1);
	const A2 = -(far + nearPx) / (far - nearPx), B2 = -2 * far * nearPx / (far - nearPx), out = Array.from(M);
	for (let c = 0; c < 4; c++) out[c * 4 + 2] = -A2 * w[c] + (c === 3 ? B2 : 0);
	return out;
}
var seatRows = (L, W) => Math.max(2, Math.min(4, Math.round(L / W * 1.3)));
var seatNumber = (row, side) => row * 2 + (side > 0 ? 1 : 0);
function seatIndex(seat, cars, rows) {
	const car = Math.max(1, Math.min(cars, seat.car | 0 || 1)), row = Math.max(1, Math.min(rows, seat.row | 0 || 1));
	return {
		j: cars - car,
		i: rows - row,
		side: seat.side > 0 ? 1 : -1
	};
}
function seatEye(fr, L, W, unit, rows, i, side) {
	const x = ((i + .5) / rows * L - .013 * W) * unit, y = side * .215 * W * unit, z = EYE_Z * W * unit;
	const F = [
		fr[3],
		fr[4],
		fr[5]
	], R = [
		fr[6],
		fr[7],
		fr[8]
	], U = [
		fr[9],
		fr[10],
		fr[11]
	];
	return {
		E: [
			0,
			1,
			2
		].map((c) => fr[c] + F[c] * x + R[c] * y + U[c] * z),
		F,
		R,
		U
	};
}
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var cross = (a, b) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];
var DEG = 180 / Math.PI;
function orientation(d, u) {
	const p = Math.acos(Math.max(-1, Math.min(1, -d[2])));
	let b = Math.hypot(d[0], d[1]) > 1e-6 ? Math.atan2(d[0], -d[1]) : p < Math.PI / 2 ? Math.atan2(u[0], -u[1]) : Math.atan2(-u[0], u[1]);
	const u0 = [
		Math.cos(p) * Math.sin(b),
		-Math.cos(p) * Math.cos(b),
		Math.sin(p)
	];
	const roll = Math.atan2(dot(cross(u0, u), d), dot(u0, u));
	return {
		bearing: b * DEG,
		pitch: p * DEG,
		roll: -roll * DEG
	};
}
function rideCamera(E, F, U, { ctcd, mpu, zoom = 18, lookDown = LOOK_DOWN }) {
	const c = Math.cos(lookDown), s = Math.sin(lookDown);
	const d = [
		0,
		1,
		2
	].map((k) => F[k] * c - U[k] * s), u = [
		0,
		1,
		2
	].map((k) => U[k] * c + F[k] * s);
	const D = ctcd / (512 * 2 ** zoom);
	const o = orientation(d, u);
	return {
		x: E[0] + d[0] * D,
		y: E[1] + d[1] * D,
		elevation: (E[2] + d[2] * D) / mpu,
		zoom,
		...o
	};
}
var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[c]);
function seatPickerHTML(cars, rows, sel) {
	let h = "";
	for (let car = 1; car <= cars; car++) {
		let seats = "";
		for (let row = 1; row <= rows; row++) for (const side of [-1, 1]) {
			const on = sel.car === car && sel.row === row && sel.side === side, name = `${car}칸 ${row}열 ${side < 0 ? "왼쪽" : "오른쪽"}`;
			seats += `<button type="button" class="seat${on ? " on" : ""}" data-car="${car}" data-row="${row}" data-side="${side}" aria-pressed="${on}" aria-label="${esc(name)}" title="${esc(name)}"></button>`;
		}
		h += `<div class="ride-car${car === 1 ? " lead" : ""}"><span class="n">${car === 1 ? "맨 앞" : car}</span><div class="seats" style="--rows:${rows}">${seats}</div></div>`;
	}
	return h;
}
var seatLabel = (sel) => `${sel.car}칸 ${sel.row}열 ${sel.side < 0 ? "왼쪽" : "오른쪽"}`;
export { COCKPIT_NEAR_M, EYE_Z, LOOK_DOWN, RIDE_FAR_M, RIDE_VFOV, nearMatrix, orientation, rideCamera, rideFov, seatEye, seatIndex, seatLabel, seatNumber, seatPickerHTML, seatRows };
