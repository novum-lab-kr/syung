// web/lib/station_signs.mjs
var SIGN_FONT = "\"Noto Sans KR\",\"Apple SD Gothic Neo\",\"Malgun Gothic\",sans-serif";
var SIGN = {
	gap: 14,
	padX: .5,
	padY: 4 / 14,
	rim: 1.75,
	dot: 8,
	dotGap: 3,
	dotRise: 2,
	dotRim: 1,
	bob: 2,
	bobPeriod: 3200
};
var THEMES = {
	light: {
		fill: "#ffffff",
		dotRim: "#ffffff",
		shadow: "rgba(0,0,0,.28)"
	},
	dark: {
		fill: "#ffffff",
		dotRim: "#172229",
		shadow: "rgba(0,0,0,.45)"
	}
};
function signTextSize(zoom) {
	return interpolateSize(zoom, [
		[13, 10],
		[16, 12.5],
		[18, 14]
	]);
}
function interpolateSize(zoom, S) {
	if (zoom <= S[0][0]) return S[0][1];
	for (let i = 1; i < S.length; i++) if (zoom <= S[i][0]) {
		const [z0, s0] = S[i - 1], [z1, s1] = S[i];
		return s0 + (s1 - s0) * (zoom - z0) / (z1 - z0);
	}
	return S[S.length - 1][1];
}
function perspectiveRatio(centerW, anchorW) {
	return Math.min(4, Math.max(0, .5 + .5 * centerW / anchorW));
}
function sortLines(names) {
	const num = (n) => {
		const m = String(n).match(/^(\d+)호선$/);
		return m ? +m[1] : Infinity;
	};
	return names.map((n, i) => [n, i]).sort((a, b) => num(a[0]) - num(b[0]) || a[1] - b[1]).map(([n]) => n);
}
function whiteContrast(hex) {
	const linear = (i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
	};
	return 1.05 / (.2126 * linear(1) + .7152 * linear(3) + .0722 * linear(5) + .05);
}
function routeTextColor(hex) {
	const color = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#52646a";
	if (whiteContrast(color) >= 4.5) return color;
	const rgb = [
		1,
		3,
		5
	].map((i) => parseInt(color.slice(i, i + 2), 16));
	const shade = (factor) => "#" + rgb.map((c) => Math.floor(c * factor).toString(16).padStart(2, "0")).join("");
	let low = 0, high = 1;
	for (let i = 0; i < 24; i++) {
		const mid = (low + high) / 2;
		if (whiteContrast(shade(mid)) >= 4.5) low = mid;
		else high = mid;
	}
	return shade(low);
}
function dotLayout(count, scale = 1) {
	const diameter = (SIGN.dot + SIGN.dotRim) * scale;
	const step = (SIGN.dot + SIGN.dotRim + SIGN.dotGap) * scale;
	return {
		width: count ? diameter + (count - 1) * step : 0,
		centers: Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step)
	};
}
function signDimensions(nameWidth, size, count, scale = 1) {
	const height = size * scale + 2 * SIGN.padY * size * scale;
	const width = Math.max(height, nameWidth + 2 * SIGN.padX * size * scale);
	const dots = dotLayout(count, scale);
	return {
		width,
		height,
		dots,
		boundsWidth: Math.max(width + SIGN.rim * scale, dots.width),
		above: count ? (SIGN.dot + SIGN.dotRim + SIGN.dotRise + SIGN.rim / 2) * scale : 0
	};
}
function borderSegments(x, width, count, rim, dpr = 1) {
	const left = x - width / 2;
	const edges = Array.from({ length: count + 1 }, (_, i) => i === 0 ? left - rim / 2 : i === count ? left + width + rim / 2 : Math.round((left + width * i / count) * dpr) / dpr);
	return Array.from({ length: count }, (_, i) => ({
		left: edges[i],
		right: edges[i + 1]
	}));
}
function stationLabelName(name) {
	const original = String(name ?? "").trim();
	let text = original;
	while (/\([^()]*\)/.test(text)) text = text.replace(/\([^()]*\)/g, "");
	return text.replace(/\s+/g, " ").trim() || original;
}
function placeholderText(lines, name) {
	name = stationLabelName(name);
	const extra = Math.max(0, dotLayout(lines.length).width - Array.from(name).length * 10 - 2 * SIGN.padX * 10);
	const pad = " ".repeat(Math.ceil(extra / 10));
	return pad + name + pad;
}
function signCollisionLayout() {
	const offset = (size) => [0, -(SIGN.gap + SIGN.padY * size) / size];
	const padding = (size) => [
		SIGN.padY * size + SIGN.rim / 2 + SIGN.dot + SIGN.dotRim + SIGN.dotRise + SIGN.bob,
		SIGN.padX * size + SIGN.rim / 2,
		SIGN.padY * size + SIGN.rim / 2 + SIGN.gap + SIGN.bob,
		SIGN.padX * size + SIGN.rim / 2
	];
	return {
		"text-anchor": "bottom",
		"text-max-width": 100,
		"text-offset": [
			"interpolate",
			["linear"],
			["zoom"],
			13,
			["literal", offset(10)],
			16,
			["literal", offset(12.5)],
			18,
			["literal", offset(14)]
		],
		"text-padding": SIGN.bob,
		"icon-image": "station-sign",
		"icon-text-fit": "both",
		"icon-text-fit-padding": [
			"interpolate",
			["linear"],
			["zoom"],
			13,
			["literal", padding(10)],
			16,
			["literal", padding(12.5)],
			18,
			["literal", padding(14)]
		]
	};
}
function signRows(p) {
	const names = String(p.ln || "").split("|").filter(Boolean), cols = String(p.lc || "").split("|");
	return {
		dots: names.map((_, i) => ({ color: cols[i] || "#52646a" })),
		name: stationLabelName(p.text)
	};
}
function bubblePath(ctx, x, top, w, h) {
	ctx.beginPath();
	ctx.roundRect(x - w / 2, top, w, h, h / 2);
}
function drawStationSigns(ctx, signs, { dpr = 1, dark = false, alpha = 1, now = 0, still = false } = {}) {
	const T = THEMES[dark ? "dark" : "light"];
	ctx.save();
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.globalAlpha = alpha;
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	for (const { x, y, scale: s, size, rows, phase = 0 } of signs) {
		const S = size * s, name = stationLabelName(rows.name);
		ctx.font = `700 ${S}px ${SIGN_FONT}`;
		const metrics = ctx.measureText(name), box = signDimensions(metrics.width, size, rows.dots.length, s);
		const lift = still ? 0 : Math.sin(now / SIGN.bobPeriod * Math.PI * 2 + phase) * SIGN.bob * s;
		const top = y - SIGN.gap * s - box.height - lift;
		const k = 1 - lift / (SIGN.gap * s) * .25;
		ctx.fillStyle = T.shadow;
		ctx.globalAlpha = alpha * k;
		ctx.beginPath();
		ctx.ellipse(x, y, Math.min(box.width * .32, 18 * s) * k, 3.2 * s * k, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = alpha;
		ctx.fillStyle = T.fill;
		bubblePath(ctx, x, top, box.width, box.height);
		ctx.fill();
		const color = rows.dots.length === 1 ? rows.dots[0].color : "#141414";
		ctx.lineWidth = SIGN.rim * s;
		if (rows.dots.length > 1) borderSegments(x, box.width, rows.dots.length, ctx.lineWidth, dpr).forEach(({ left, right }, i) => {
			ctx.save();
			ctx.beginPath();
			ctx.rect(left, top - SIGN.rim * s, right - left, box.height + 2 * SIGN.rim * s);
			ctx.clip();
			ctx.strokeStyle = rows.dots[i].color;
			bubblePath(ctx, x, top, box.width, box.height);
			ctx.stroke();
			ctx.restore();
		});
		else {
			ctx.strokeStyle = color;
			ctx.stroke();
		}
		const ascent = metrics.actualBoundingBoxAscent ?? S * .8, descent = metrics.actualBoundingBoxDescent ?? S * .2;
		ctx.fillStyle = routeTextColor(color);
		ctx.fillText(name, x, top + box.height / 2 + (ascent - descent) / 2);
		const dotY = top - (SIGN.rim / 2 + SIGN.dotRise) * s - (SIGN.dot + SIGN.dotRim) * s / 2;
		rows.dots.forEach((dot, i) => {
			ctx.fillStyle = dot.color;
			ctx.strokeStyle = T.dotRim;
			ctx.lineWidth = SIGN.dotRim * s;
			ctx.beginPath();
			ctx.arc(x + box.dots.centers[i], dotY, SIGN.dot * s / 2, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		});
	}
	ctx.restore();
}
function signAnchor(platforms) {
	const paths = platforms.map((path) => path.filter((p) => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite))).filter((path) => path.length);
	if (!paths.length) return null;
	const points = paths.flat();
	const origin = points.reduce((sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length], [0, 0]);
	const meters = 6371008.8 * Math.PI / 180, longitude = meters * Math.cos(origin[1] * Math.PI / 180);
	const local = paths.map((path) => path.map((p) => [(p[0] - origin[0]) * longitude, (p[1] - origin[1]) * meters]));
	const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
	const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
	const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
	const length = (a) => Math.hypot(...a);
	const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	const mean = (ps) => ps.reduce((sum, p) => [sum[0] + p[0] / ps.length, sum[1] + p[1] / ps.length], [0, 0]);
	const project = (p, a, b) => {
		const v = sub(b, a), norm = dot(v, v);
		return mix(a, b, norm ? Math.max(0, Math.min(1, dot(sub(p, a), v) / norm)) : 0);
	};
	const segments = (path) => path.length === 1 ? [[path[0], path[0]]] : path.slice(1).map((p, i) => [path[i], p]);
	const midpoint = (path) => {
		const parts = segments(path), lengths = parts.map(([a, b]) => length(sub(b, a)));
		let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
		for (let i = 0; i < parts.length; i++) {
			if (remaining <= lengths[i]) return mix(...parts[i], lengths[i] ? remaining / lengths[i] : 0);
			remaining -= lengths[i];
		}
		return path[0];
	};
	const intersections = [], overlaps = [], nearest = [];
	const nearby = 40, epsilon = 1e-7;
	for (let i = 0; i < local.length; i++) for (let j = i + 1; j < local.length; j++) {
		let closest = null;
		for (const [a, b] of segments(local[i])) for (const [c, d] of segments(local[j])) {
			const u = sub(b, a), v = sub(d, c), lu = length(u), lv = length(v), determinant = cross(u, v);
			if (Math.abs(determinant) > epsilon * lu * lv) {
				const t = cross(sub(c, a), v) / determinant, q = cross(sub(c, a), u) / determinant;
				if (t >= -1e-7 && t <= 1.0000001 && q >= -1e-7 && q <= 1.0000001) {
					const p = mix(a, b, Math.max(0, Math.min(1, t)));
					if (!intersections.some((other) => length(sub(p, other)) < .01)) intersections.push(p);
				}
			}
			if (lu > epsilon && lv > epsilon && Math.abs(determinant) / (lu * lv) < .02) {
				const tc = dot(sub(c, a), u) / (lu * lu), td = dot(sub(d, a), u) / (lu * lu);
				const lo = Math.max(0, Math.min(tc, td)), hi = Math.min(1, Math.max(tc, td));
				if (hi > lo) {
					const start = mix(a, b, lo), end = mix(a, b, hi);
					if (length(sub(start, project(start, c, d))) <= nearby && length(sub(end, project(end, c, d))) <= nearby) {
						const p = mix(start, end, .5);
						overlaps.push({
							point: mix(p, project(p, c, d), .5),
							weight: (hi - lo) * lu
						});
					}
				}
			}
			for (const [p, q] of [
				[a, project(a, c, d)],
				[b, project(b, c, d)],
				[project(c, a, b), c],
				[project(d, a, b), d]
			]) {
				const distance = length(sub(p, q));
				if (!closest || distance < closest.distance) closest = {
					point: mix(p, q, .5),
					distance
				};
			}
		}
		if (closest && closest.distance <= nearby) nearest.push(closest.point);
	}
	const extendedIntersections = [];
	if (!intersections.length && local.length > 1) {
		const extendedSegments = (path) => {
			const parts = segments(path).map((coords) => ({
				coords,
				extended: false
			}));
			for (const points of [path, [...path].reverse()]) {
				const end = points[0], next = points.find((p) => length(sub(p, end)) > epsilon);
				if (!next) continue;
				const direction = sub(end, next), distance = length(direction);
				parts.push({
					coords: [end, [end[0] + direction[0] * 300 / distance, end[1] + direction[1] * 300 / distance]],
					extended: true
				});
			}
			return parts;
		};
		const extended = local.map(extendedSegments), minAngle = Math.sin(20 * Math.PI / 180);
		for (let i = 0; i < extended.length; i++) for (let j = i + 1; j < extended.length; j++) for (const first of extended[i]) for (const second of extended[j]) {
			if (!first.extended && !second.extended) continue;
			const [a, b] = first.coords, [c, d] = second.coords;
			const u = sub(b, a), v = sub(d, c), product = length(u) * length(v), determinant = cross(u, v);
			if (!product || Math.abs(determinant) / product < minAngle) continue;
			const t = cross(sub(c, a), v) / determinant, q = cross(sub(c, a), u) / determinant;
			if (t < -1e-7 || t > 1.0000001 || q < -1e-7 || q > 1.0000001) continue;
			const p = mix(a, b, Math.max(0, Math.min(1, t)));
			if (!extendedIntersections.some((other) => length(sub(p, other)) < .01)) extendedIntersections.push(p);
		}
	}
	let anchor;
	if (intersections.length) anchor = mean(intersections);
	else if (extendedIntersections.length) anchor = mean(extendedIntersections);
	else if (overlaps.length) {
		const total = overlaps.reduce((sum, p) => sum + p.weight, 0);
		anchor = overlaps.reduce((sum, p) => [sum[0] + p.point[0] * p.weight / total, sum[1] + p.point[1] * p.weight / total], [0, 0]);
	} else anchor = nearest.length ? mean(nearest) : mean(local.map(midpoint));
	return [origin[0] + anchor[0] / longitude, origin[1] + anchor[1] / meters];
}
export { SIGN, SIGN_FONT, borderSegments, dotLayout, drawStationSigns, perspectiveRatio, placeholderText, routeTextColor, signAnchor, signCollisionLayout, signDimensions, signRows, signTextSize, sortLines, stationLabelName, whiteContrast };
