// web/lib/sun.mjs
function seoulSun(date = /* @__PURE__ */ new Date()) {
	const KST = 324e5, noon = Math.floor((date.getTime() + KST) / 864e5) * 864e5 - KST + 432e5;
	const rad = Math.PI / 180, lat = 37.5665, lon = 126.978, J = noon / 864e5 + 2440587.5;
	const Js = Math.round(J - 2451545 + 8e-4) - lon / 360, M = (357.5291 + .98560028 * Js) % 360;
	const L = (M + (1.9148 * Math.sin(M * rad) + .02 * Math.sin(2 * M * rad) + 3e-4 * Math.sin(3 * M * rad)) + 282.9372) % 360, Jt = 2451545 + Js + .0053 * Math.sin(M * rad) - .0069 * Math.sin(2 * L * rad), d = Math.asin(Math.sin(L * rad) * Math.sin(23.44 * rad));
	const w = Math.acos((Math.sin(-.833 * rad) - Math.sin(lat * rad) * Math.sin(d)) / (Math.cos(lat * rad) * Math.cos(d))) / rad;
	const toDate = (j) => /* @__PURE__ */ new Date((j - 2440587.5) * 864e5);
	return {
		rise: toDate(Jt - w / 360),
		set: toDate(Jt + w / 360)
	};
}
function sunPosition(date = /* @__PURE__ */ new Date()) {
	const rad = Math.PI / 180, lat = 37.5665 * rad, lon = 126.978, d = date.getTime() / 864e5 - 10957.5;
	const g = (357.529 + .98560028 * d) * rad, L = (280.459 + .98564736 * d + 1.915 * Math.sin(g) + .02 * Math.sin(2 * g)) * rad, e = (23.439 - 36e-8 * d) * rad;
	const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
	const H = ((18.697374558 + 24.06570982441908 * d) % 24 * 15 + lon) * rad - ra;
	const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
	const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
	return {
		elevation: el / rad,
		azimuth: (az / rad + 360) % 360
	};
}
export { seoulSun, sunPosition };
