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

// 선의 from ~ to(m) 구간만: 양 끝은 그 거리의 점, 가운데는 원래 꼭짓점
export function busPathSlice(path, from, to) {
  const a = clamp(from, 0, path.total), b = clamp(to, a, path.total), out = [busPointAt(path, a).coordinate];
  for (let i = 0; i < path.points.length; i++) if (path.distances[i] > a && path.distances[i] < b) out.push(path.points[i]);
  out.push(busPointAt(path, b).coordinate);
  return out;
}

// 점이 선을 지나는 자리마다 가장 가까운 곳 하나씩(오가는 노선은 같은 정류장을 두 번 지난다): [{distance, error}]
// 선을 따라 점까지의 거리가 골짜기를 이룰 때마다 한 번 — 회차해 같은 길을 되돌아와도 회차점에서 rise m 넘게 멀어졌다 오면 둘로 센다.
export function busPathPasses(path, coordinate, maxError = 250, rise = 20) {
  if (!path || !validCoordinate(coordinate)) return [];
  const x = (coordinate[0] - path.origin[0]) * path.kx, y = (coordinate[1] - path.origin[1]) * M, out = [];
  let best = null, peak = 0, falling = true;
  const visit = (error, distance) => {
    if (error > maxError) { if (best && falling) out.push(best); best = null; falling = true; return; }
    if (!best) { best = {distance, error}; falling = true; return; }
    if (falling) {
      if (error < best.error) best = {distance, error};
      else if (error > best.error + rise) { out.push(best); falling = false; peak = error; }
    } else if (error > peak) peak = error;
    else if (error < peak - rise) { best = {distance, error}; falling = true; }
  };
  for (let i = 1; i < path.xy.length; i++) {
    const start = path.distances[i - 1], end = path.distances[i], a = path.xy[i - 1], b = path.xy[i], dx = b[0] - a[0], dy = b[1] - a[1];
    if (i === 1) visit(Math.hypot(x - a[0], y - a[1]), start);
    const t = end > start ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / ((end - start) ** 2), 0, 1) : 0;
    if (t > 0 && t < 1) visit(Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t), start + (end - start) * t);
    visit(Math.hypot(x - b[0], y - b[1]), end);
  }
  if (best && falling) out.push(best);
  return out;
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

// interval: 이 관측에 닿을 때까지(ms) — 화면은 그 노선의 다음 새 응답이 올 때로 준다(layer busRouteRefreshMs + 왕복). 원자료 시각 차로 주면
// 차례마다 15~45초로 들쭉날쭉해 받기 주기(30초)보다 짧은 차례엔 길 한가운데 서서 다음 응답을 기다렸다(2026-10-11).
// hold: 화면은 앞지른 자리(busLeadDistance)를 그리므로 새 목표가 그려진 자리보다 조금 뒤(350 m 안)면 뒤로 가지 않고 그 자리에 선다(신호 · 정류장에서 서듯이)
export function nextBusMotion(previous, distance, now, {interval = 15000, reduced = false, stale = false, hold = false} = {}) {
  const from = previous ? busMotionDistance(previous, now) : distance;
  const duration = clamp(interval, 1000, 90000), delta = distance - from;
  if (hold && previous && !reduced && !stale && delta < 0 && delta >= -350) return {from, to: from, startedAt: now, duration: 0};
  // One path contains its whole service order. A wrap/branch correction must not race backwards.
  const reset = !previous || reduced || stale || delta < -30 || Math.abs(delta) > Math.max(350, duration / 1000 * 28);
  return {from: reset ? distance : from, to: distance, startedAt: now, duration: reset ? 0 : duration};
}

// 화면이 이 자리에 닿을 때(at, ms) 버스가 있을 곳: 원자료 시각(observed) 뒤로 최근 2분 평균 속도만큼 앞지른다(2026-10-12 덕배: 3011 GPS 보다 많이 늦음).
// 원자료가 15~40초 늦고 화면은 다음 응답 때 닿게 움직여서 그대로 두면 약 50~70초 뒤를 그렸다. 다음 정류장은 넘지 않고(서는지 모른다) 400 m · 90초까지만.
// history: 같은 운행의 지난 관측 [{t, d}](오래된 것부터), stops: 노선 정류장 거리(오름차순)
export function busLeadDistance(history, distance, observed, at, stops = [], {window = 120000, horizon = 90000, cap = 400} = {}) {
  const base = history?.find(h => h.t < observed && observed - h.t <= window);
  if (!base || !Number.isFinite(observed) || !Number.isFinite(at)) return distance;
  const speed = Math.max(0, (distance - base.d) / (observed - base.t));
  let target = distance + Math.min(cap, speed * clamp(at - observed, 0, horizon));
  for (const s of stops) if (s > distance + 1) { target = Math.min(target, s); break; }
  return target;
}

// 새 관측이 없는 응답(그 차의 원자료가 안 바뀜 · 서버가 이번엔 못 받음): 가던 길은 이미 아는 목표까지만, 다음 새 응답 때 닿게 늦춘다.
// 당기지는 않고(일찍 닿아 서지 않게) 이미 닿았으면 그대로 — 목표 너머로 지어내지 않는다.
export function retimeBusMotion(motion, now, interval) {
  if (!motion || motion.duration <= 0) return motion;
  const left = motion.startedAt + motion.duration - now;
  if (left <= 0 || left >= interval) return motion;
  return {from: busMotionDistance(motion, now), to: motion.to, startedAt: now, duration: clamp(interval, 1000, 90000)};
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
