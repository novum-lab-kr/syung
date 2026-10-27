// web/lib/platform_route.mts
function offsetCoords(coords, offset, zoom) {
	if (!offset) return coords;
	const merc = (p) => [(p[0] + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + p[1] * Math.PI / 360)) / Math.PI) / 2];
	const ll = (p) => [p[0] * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * p[1]))) * 180 / Math.PI];
	let at = (_i) => offset;
	if (typeof offset === "function") {
		const cum = [0];
		for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + metres(coords[i - 1], coords[i]));
		const fn = offset;
		at = (i) => fn(cum[i], cum.at(-1));
	}
	const pts = coords.map(merc), scale = 1 / (512 * 2 ** zoom);
	return pts.map((p, i) => {
		let a = i, b = i;
		while (a > 0 && Math.hypot(pts[a][0] - p[0], pts[a][1] - p[1]) < 1e-12) a--;
		while (b < pts.length - 1 && Math.hypot(pts[b][0] - p[0], pts[b][1] - p[1]) < 1e-12) b++;
		const dx = pts[b][0] - pts[a][0], dy = pts[b][1] - pts[a][1], d = Math.hypot(dx, dy) || 1, unit = at(i) * scale;
		return ll([p[0] - dy / d * unit, p[1] + dx / d * unit]);
	});
}
var metres = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 111320;
function trackStart(coords, dist) {
	const out = [coords[0]];
	let left = dist;
	for (let i = 1; i < coords.length && left > 0; i++) {
		const d = metres(coords[i - 1], coords[i]);
		if (d >= left) {
			const t = left / d;
			out.push(coords[i - 1].map((v, j) => v + (coords[i][j] - v) * t));
			left = 0;
		} else {
			out.push(coords[i]);
			left -= d;
		}
	}
	return out;
}
function extendStart(coords, dist) {
	const a = coords[0], b = coords.find((p) => metres(a, p) > .1);
	if (!b) return a;
	const t = dist / metres(a, b);
	return a.map((v, i) => v - (b[i] - v) * t);
}
function closestPlatformPoint(point, points) {
	let best = null;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy) || 0)), x = a.x + dx * t, y = a.y + dy * t, d = Math.hypot(point.x - x, point.y - y);
		if (!best || d < best.distance) best = {
			x,
			y,
			distance: d
		};
	}
	return best;
}
export { closestPlatformPoint, extendStart, metres, offsetCoords, trackStart };
