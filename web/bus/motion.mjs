// web/bus/motion.mts
var M = 111320;
var clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
var validCoordinate = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85;
var intersects = (a, b) => !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
var contains = (box, p) => p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3];
function buildBusPath(coordinates) {
	if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(validCoordinate)) return null;
	const points = coordinates.filter((p, i) => !i || p[0] !== coordinates[i - 1][0] || p[1] !== coordinates[i - 1][1]);
	if (points.length < 2) return null;
	const origin = points[0], kx = M * Math.cos(origin[1] * Math.PI / 180);
	const xy = points.map((p) => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * M]);
	const distances = new Float64Array(points.length), bbox = [
		Infinity,
		Infinity,
		-Infinity,
		-Infinity
	];
	points.forEach((p, i) => {
		if (i) distances[i] = distances[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
		bbox[0] = Math.min(bbox[0], p[0]);
		bbox[1] = Math.min(bbox[1], p[1]);
		bbox[2] = Math.max(bbox[2], p[0]);
		bbox[3] = Math.max(bbox[3], p[1]);
	});
	return {
		points,
		xy,
		distances,
		total: distances[points.length - 1],
		origin,
		kx,
		bbox
	};
}
function busPointAt(path, distance, direction = 1) {
	const s = clamp(distance, 0, path.total);
	let lo = 0, hi = path.points.length - 1;
	while (hi - lo > 1) {
		const mid = lo + hi >> 1;
		if (path.distances[mid] <= s) lo = mid;
		else hi = mid;
	}
	const a = path.points[lo], b = path.points[hi], length = path.distances[hi] - path.distances[lo];
	const t = length ? (s - path.distances[lo]) / length : 0;
	const dx = (b[0] - a[0]) * path.kx * direction, dy = (b[1] - a[1]) * M * direction;
	return {
		coordinate: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
		heading: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360,
		distance: s
	};
}
function busPathSlice(path, from, to) {
	const a = clamp(from, 0, path.total), b = clamp(to, a, path.total), out = [busPointAt(path, a).coordinate];
	for (let i = 0; i < path.points.length; i++) if (path.distances[i] > a && path.distances[i] < b) out.push(path.points[i]);
	out.push(busPointAt(path, b).coordinate);
	return out;
}
function busPathPasses(path, coordinate, maxError = 250, rise = 20) {
	if (!path || !validCoordinate(coordinate)) return [];
	const x = (coordinate[0] - path.origin[0]) * path.kx, y = (coordinate[1] - path.origin[1]) * M, out = [];
	let best = null, peak = 0, falling = true;
	const visit = (error, distance) => {
		if (error > maxError) {
			if (best && falling) out.push(best);
			best = null;
			falling = true;
			return;
		}
		if (!best) {
			best = {
				distance,
				error
			};
			falling = true;
			return;
		}
		if (falling) {
			if (error < best.error) best = {
				distance,
				error
			};
			else if (error > best.error + rise) {
				out.push(best);
				falling = false;
				peak = error;
			}
		} else if (error > peak) peak = error;
		else if (error < peak - rise) {
			best = {
				distance,
				error
			};
			falling = true;
		}
	};
	for (let i = 1; i < path.xy.length; i++) {
		const start = path.distances[i - 1], end = path.distances[i], a = path.xy[i - 1], b = path.xy[i], dx = b[0] - a[0], dy = b[1] - a[1];
		if (i === 1) visit(Math.hypot(x - a[0], y - a[1]), start);
		const t = end > start ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (end - start) ** 2, 0, 1) : 0;
		if (t > 0 && t < 1) visit(Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t), start + (end - start) * t);
		visit(Math.hypot(x - b[0], y - b[1]), end);
	}
	if (best && falling) out.push(best);
	return out;
}
function snapBusToPath(path, coordinate, { hint = null, min = 0, max = path?.total, heading = null, maxError = 250 } = {}) {
	if (!path || !validCoordinate(coordinate)) return null;
	const x = (coordinate[0] - path.origin[0]) * path.kx, y = (coordinate[1] - path.origin[1]) * M;
	let best = null;
	for (let i = 1; i < path.xy.length; i++) {
		const start = path.distances[i - 1], end = path.distances[i];
		if (end < min || start > max || end === start) continue;
		const a = path.xy[i - 1], b = path.xy[i], dx = b[0] - a[0], dy = b[1] - a[1];
		const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (end - start) ** 2, clamp((min - start) / (end - start), 0, 1), clamp((max - start) / (end - start), 0, 1));
		const error = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t), distance = start + (end - start) * t;
		if (error > maxError) continue;
		const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
		const angle = Number.isFinite(heading) ? Math.abs((bearing - heading + 540) % 360 - 180) : 0;
		const score = error + (Number.isFinite(hint) ? Math.min(160, Math.abs(distance - hint) * .03) : 0) + angle * .3;
		if (!best || score < best.score) best = {
			distance,
			error,
			score,
			segment: i - 1,
			heading: bearing
		};
	}
	return best;
}
function busMotionDistance(motion, now) {
	if (!motion) return 0;
	const t = motion.duration > 0 ? clamp((now - motion.startedAt) / motion.duration, 0, 1) : 1;
	return motion.from + (motion.to - motion.from) * t;
}
function nextBusMotion(previous, distance, now, { interval = 15e3, reduced = false, stale = false, hold = false } = {}) {
	const from = previous ? busMotionDistance(previous, now) : distance;
	const duration = clamp(interval, 1e3, 9e4), delta = distance - from;
	if (hold && previous && !reduced && !stale && delta < 0 && delta >= -350) return {
		from,
		to: from,
		startedAt: now,
		duration: 0
	};
	const reset = !previous || reduced || stale || delta < -30 || Math.abs(delta) > Math.max(350, duration / 1e3 * 28);
	return {
		from: reset ? distance : from,
		to: distance,
		startedAt: now,
		duration: reset ? 0 : duration
	};
}
function busLeadDistance(history, distance, observed, at, stops = [], { window = 12e4, horizon = 9e4, cap = 400 } = {}) {
	const base = history?.find((h) => h.t < observed && observed - h.t <= window);
	if (!base || !Number.isFinite(observed) || !Number.isFinite(at)) return distance;
	const speed = Math.max(0, (distance - base.d) / (observed - base.t));
	let target = distance + Math.min(cap, speed * clamp(at - observed, 0, horizon));
	for (const s of stops) if (s > distance + 1) {
		target = Math.min(target, s);
		break;
	}
	return target;
}
var busKstHour = (ms) => new Date(ms + 324e5).getUTCHours();
function busPaceLead(pace, bin, distance, observed, at, { horizon = 9e4, cap = 800 } = {}) {
	if (!Array.isArray(pace) || !pace.length || !(bin > 0) || !Number.isFinite(distance) || !Number.isFinite(observed) || !Number.isFinite(at)) return null;
	let pos = distance, left = clamp(at - observed, 0, horizon);
	while (left > 0 && pos - distance < cap) {
		const k = Math.floor(pos / bin), p = pace[k];
		if (!(p > 0)) break;
		const need = ((k + 1) * bin - pos) * p;
		if (need >= left) {
			pos += left / p;
			break;
		}
		pos = (k + 1) * bin;
		left -= need;
	}
	return Math.min(pos, distance + cap);
}
function retimeBusMotion(motion, now, interval) {
	if (!motion || motion.duration <= 0) return motion;
	const left = motion.startedAt + motion.duration - now;
	if (left <= 0 || left >= interval) return motion;
	return {
		from: busMotionDistance(motion, now),
		to: motion.to,
		startedAt: now,
		duration: clamp(interval, 1e3, 9e4)
	};
}
export { buildBusPath, busKstHour, busLeadDistance, busMotionDistance, busPaceLead, busPathPasses, busPathSlice, busPointAt, contains, intersects, nextBusMotion, retimeBusMotion, snapBusToPath, validCoordinate };
