// Bus geometry in local metres. Pure functions: no MapLibre, DOM, clock or network.
const M = 111320;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const validCoordinate = p => Array.isArray(p) && p.length >= 2 &&
  Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85;
export const intersects = (a, b) => !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export const contains = (box, p) => p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3];

export function buildBusPath(coordinates) {
  // Do not join across broken coordinates: that would invent a road through a gap.
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(validCoordinate)) return null;
  const points = coordinates.filter((p, i) => !i || p[0] !== coordinates[i - 1][0] || p[1] !== coordinates[i - 1][1]);
  if (points.length < 2) return null;
  const origin = points[0], kx = M * Math.cos(origin[1] * Math.PI / 180);
  const xy = points.map(p => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * M]);
  const distances = new Float64Array(points.length), bbox = [Infinity, Infinity, -Infinity, -Infinity];
  points.forEach((p, i) => {
    if (i) distances[i] = distances[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    bbox[0] = Math.min(bbox[0], p[0]); bbox[1] = Math.min(bbox[1], p[1]);
    bbox[2] = Math.max(bbox[2], p[0]); bbox[3] = Math.max(bbox[3], p[1]);
  });
  return {points, xy, distances, total: distances[points.length - 1], origin, kx, bbox};
}

export function busPointAt(path, distance, direction = 1) {
  const s = clamp(distance, 0, path.total);
  let lo = 0, hi = path.points.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path.distances[mid] <= s) lo = mid; else hi = mid; }
  const a = path.points[lo], b = path.points[hi], length = path.distances[hi] - path.distances[lo];
  const t = length ? (s - path.distances[lo]) / length : 0;
  const dx = (b[0] - a[0]) * path.kx * direction, dy = (b[1] - a[1]) * M * direction;
  return {coordinate: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    heading: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360, distance: s};
}

export function snapBusToPath(path, coordinate, {hint = null, min = 0, max = path?.total, heading = null, maxError = 250} = {}) {
  if (!path || !validCoordinate(coordinate)) return null;
  const x = (coordinate[0] - path.origin[0]) * path.kx, y = (coordinate[1] - path.origin[1]) * M;
  let best = null;
  for (let i = 1; i < path.xy.length; i++) {
    const start = path.distances[i - 1], end = path.distances[i];
    if (end < min || start > max || end === start) continue;
    const a = path.xy[i - 1], b = path.xy[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / ((end - start) ** 2),
      clamp((min - start) / (end - start), 0, 1), clamp((max - start) / (end - start), 0, 1));
    const error = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t), distance = start + (end - start) * t;
    if (error > maxError) continue;
    const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const angle = Number.isFinite(heading) ? Math.abs(((bearing - heading + 540) % 360) - 180) : 0;
    // At a crossing/overlapping outbound and inbound path, prefer continuity and heading.
    const score = error + (Number.isFinite(hint) ? Math.min(160, Math.abs(distance - hint) * .03) : 0) + angle * .3;
    if (!best || score < best.score) best = {distance, error, score, segment: i - 1, heading: bearing};
  }
  return best;
}

export function busMotionDistance(motion, now) {
  if (!motion) return 0;
  const t = motion.duration > 0 ? clamp((now - motion.startedAt) / motion.duration, 0, 1) : 1;
  // Linear in travelled distance: bends stay on the route and stale feeds never extrapolate.
  return motion.from + (motion.to - motion.from) * t;
}

export function nextBusMotion(previous, distance, now, {interval = 15000, reduced = false, stale = false} = {}) {
  const from = previous ? busMotionDistance(previous, now) : distance;
  const duration = clamp(interval, 1000, 30000), delta = distance - from;
  // One path contains its whole service order. A wrap/branch correction must not race backwards.
  const reset = !previous || reduced || stale || delta < -30 || Math.abs(delta) > Math.max(350, duration / 1000 * 28);
  return {from: reset ? distance : from, to: distance, startedAt: now, duration: reset ? 0 : duration};
}

// Conservative fallback only. Matched roads use busRoadLane's actual profile.
// Zoom must never push a vehicle outside the carriageway.
export function busLaneMeters(zoom, latitude, roadWidth = 6) {
  return Math.min(3,Math.max(0,roadWidth/2-1.5));
}

export function offsetBusPath(path, metres) {
  const {points, xy, kx} = path;
  return points.map((p, i) => {
    const normal = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1; return [dy / len, -dx / len]; };
    const before = normal(xy[Math.max(0, i - 1)], xy[i === 0 ? 1 : i]);
    const after = normal(xy[i === xy.length - 1 ? i - 1 : i], xy[Math.min(xy.length - 1, i + 1)]);
    const sx = before[0] + after[0], sy = before[1] + after[1], length = Math.hypot(sx, sy);
    // Bound mitres at sharp corners; a U-turn uses the outgoing lane rather than a spike.
    const n = length > .1 ? [sx / length, sy / length] : after;
    const scale = metres / Math.max(.5, n[0] * after[0] + n[1] * after[1]);
    return [p[0] + n[0] * scale / kx, p[1] + n[1] * scale / M];
  });
}

export function offsetBusPointAt(path, distance, lane) {
  const s = clamp(distance, 0, path.total); let lo = 0, hi = path.points.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path.distances[mid] <= s) lo = mid; else hi = mid; }
  const a = lane[lo], b = lane[hi], t = (s - path.distances[lo]) / (path.distances[hi] - path.distances[lo] || 1);
  return {coordinate: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    heading: (Math.atan2((b[0] - a[0]) * path.kx, (b[1] - a[1]) * M) * 180 / Math.PI + 360) % 360, distance: s};
}
