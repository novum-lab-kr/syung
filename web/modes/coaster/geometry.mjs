// web/modes/coaster/geometry.mjs
function createCoasterGeometry({ maplibregl, paths, byId, cityViaduct, edgeGeom, geom, cityGeom, withCum, metresBetween, smooth, onFresh }) {
	function coasterPath(line, a, b) {
		const lo = Math.min(a, b), hi = Math.max(a, b), T = towerCourse(line, lo, hi);
		if (!T) return cityGeom(line, lo, hi);
		const id = `c:${line}:${lo}:${hi}`;
		let g = edgeGeom.get(id);
		if (g) return g;
		g = towerPath(T, cityGeom(line, lo, hi));
		edgeGeom.set(id, g);
		return g;
	}
	const corrRank = () => corrRanks ??= new Map(Object.keys(paths).sort((a, b) => a.localeCompare(b, "ko")).map((l, i) => [l, i]));
	let corrRanks = null;
	const COASTER_LOW = 18, COASTER_FLAT = 110, COASTER_RISE = 160;
	const hash = (a, b, c = 0) => {
		let x = Math.imul(a ^ 2654435769, 2246822507) ^ Math.imul(b + 1799596469, 3266489909) ^ Math.imul(c + 668265263, 374761393);
		x ^= x >>> 15;
		x = Math.imul(x, 739982445);
		x ^= x >>> 12;
		return (x >>> 0) / 4294967296;
	};
	const rolled = (r, F, roll) => {
		const d = r[0] * F[0] + r[1] * F[1];
		let R = [
			r[0] - d * F[0],
			r[1] - d * F[1],
			-d * F[2]
		];
		const l = Math.hypot(...R) || 1;
		R = R.map((c) => c / l);
		const U = [
			F[1] * R[2] - F[2] * R[1],
			F[2] * R[0] - F[0] * R[2],
			F[0] * R[1] - F[1] * R[0]
		];
		if (!roll) return [R, U];
		const c = Math.cos(roll), s = Math.sin(roll);
		return [[
			c * R[0] - s * U[0],
			c * R[1] - s * U[1],
			c * R[2] - s * U[2]
		], [
			c * U[0] + s * R[0],
			c * U[1] + s * R[1],
			c * U[2] + s * R[2]
		]];
	};
	const INV_GAP = 2500, INV_LOOP = .3, INV_CORK = .25;
	let invMap = null;
	function inversion(lo, hi) {
		if (!invMap) {
			invMap = /* @__PURE__ */ new Map();
			for (const chunks of Object.values(paths)) for (const ids of chunks) {
				let since = INV_GAP;
				for (let i = 1; i < ids.length; i++) {
					const a = Math.min(ids[i - 1], ids[i]), b = Math.max(ids[i - 1], ids[i]), k = a + ":" + b, A = byId.get(a), B = byId.get(b);
					if (!A || !B) continue;
					const L = metresBetween([A.lon, A.lat], [B.lon, B.lat]);
					if (!invMap.has(k)) {
						let pick = "";
						if (since + L / 2 >= INV_GAP && !towerEdge(a, b)) pick = hash(a, b, 1) < INV_LOOP ? "loop" : hash(a, b, 3) < INV_CORK ? "cork" : "";
						invMap.set(k, pick);
					}
					since = invMap.get(k) ? L / 2 : since + L;
				}
			}
		}
		return invMap.get(lo + ":" + hi) || "";
	}
	const LOOP_DR = 80 / 38, LOOP_MIN = 800;
	const loopD = (L, lo, hi, line) => {
		if (L < LOOP_MIN || inversion(lo, hi) !== "loop") return 0;
		const D = (45 + 55 * hash(lo, hi, 2)) * LOOP_DR;
		return L >= D * 4 && !crossedNear(line, lo, hi, L / 2 - D / 2 - 40, L / 2 + D / 2 + 40) ? D : 0;
	};
	const corkOf = (L, lo, hi, line) => {
		if (L < 700 || inversion(lo, hi) !== "cork") return null;
		const T = hash(lo, hi, 4) < .3 ? 2 : 1, D = (200 + 50 * hash(lo, hi, 5)) * T, end = 270, LD = loopD(L, lo, hi, line);
		const ok = (c) => c - D / 2 >= end && c + D / 2 <= L - end && (!LD || Math.abs(c - L / 2) >= LD / 2 + D / 2 + 30) && !crossedNear(line, lo, hi, c - D / 2 - 40, c + D / 2 + 40);
		const want = LD ? (hash(lo, hi, 6) < .5 ? .27 : .73) * L : (.35 + .3 * hash(lo, hi, 6)) * L;
		for (const c of [
			want,
			L - want,
			.25 * L,
			.75 * L,
			.5 * L
		]) if (ok(c)) return [
			c - D / 2,
			D,
			T
		];
		return null;
	};
	const CORK_HEART = .34;
	const corkTheta = (u, T) => {
		const e = .15, f = u < e ? u * u / (2 * e) : u > .85 ? .85 - (1 - u) * (1 - u) / (2 * e) : u - e / 2;
		return 2 * Math.PI * T * f / .85;
	};
	function hillsAt(lo, hi, L, k) {
		const d = Math.min(k, 1 - k) * L, env = smooth(Math.max(0, Math.min(1, (d - COASTER_FLAT) / COASTER_RISE)));
		if (!env) return 0;
		const m = 2 * Math.max(1, Math.round(L / 750)) + 1, x = k * m, j = Math.min(m - 1, Math.floor(x));
		const knot = (i) => {
			if (i <= 0 || i >= m) return i <= 0 ? 0 : 1;
			return (i + (hash(lo, hi, 10 + i) - .5) * .6) / m;
		}, hk = (i) => {
			const r = hash(lo, hi, 40 + i);
			return i % 2 ? COASTER_LOW + 92 * r * r * .35 : COASTER_LOW + 92 * (.25 + .75 * r);
		};
		let a = j;
		while (a > 0 && knot(a) > k) a--;
		while (a < m - 1 && knot(a + 1) <= k) a++;
		const u = (k - knot(a)) / (knot(a + 1) - knot(a) || 1);
		return env * (hk(a) + (hk(a + 1) - hk(a)) * smooth(Math.max(0, Math.min(1, u))));
	}
	const TOWER_COURSES = [{
		line: "8호선",
		lo: 24,
		hi: 465,
		at: [127.102659, 37.512537],
		tower: 68,
		R: 150,
		turns: 5,
		top: 440,
		off: 800
	}];
	const towerCourse = (line, lo, hi) => TOWER_COURSES.find((c) => c.line === line && c.lo === lo && c.hi === hi);
	const towerEdge = (lo, hi) => TOWER_COURSES.some((c) => c.lo === lo && c.hi === hi);
	function towerPath(C, g0) {
		const mu = g0.pts[0].meterInMercatorCoordinateUnits(), T = maplibregl.MercatorCoordinate.fromLngLat(C.at), R = C.R * mu, ds = 2 * mu;
		const at = (s) => {
			let i = 1;
			while (i < g0.pts.length - 1 && g0.cum[i] < s) i++;
			const P = g0.pts[i - 1], Q = g0.pts[i], l = g0.cum[i] - g0.cum[i - 1] || 1, u = Math.max(0, Math.min(1, (s - g0.cum[i - 1]) / l));
			return {
				x: P.x + (Q.x - P.x) * u,
				y: P.y + (Q.y - P.y) * u,
				fx: (Q.x - P.x) / l,
				fy: (Q.y - P.y) / l,
				i
			};
		};
		const sA = 120 * mu, sB = Math.min(C.off * mu, g0.total - 410 * mu), A = at(sA), B = at(sB), pts = [];
		for (let i = 0; i < A.i; i++) pts.push({
			x: g0.pts[i].x,
			y: g0.pts[i].y
		});
		pts.push({
			x: A.x,
			y: A.y
		});
		const sg = Math.sign((A.x - T.x) * A.fy - (A.y - T.y) * A.fx) || 1;
		let x = A.x, y = A.y, hd = Math.atan2(A.fy, A.fx);
		const turn = ds / (35 * mu);
		for (let k = 0; k < 3e3; k++) {
			const ex = x - T.x, ey = y - T.y, r = Math.hypot(ex, ey), e = [ex / r, ey / r], tau = [-sg * e[1], sg * e[0]], w = 2 * (R - r) / R;
			let d = Math.atan2(tau[1] + w * e[1], tau[0] + w * e[0]) - hd;
			d = Math.atan2(Math.sin(d), Math.cos(d));
			if (Math.abs(r - R) < .5 * mu && Math.abs(Math.atan2(Math.sin(Math.atan2(tau[1], tau[0]) - hd), Math.cos(Math.atan2(tau[1], tau[0]) - hd))) < .03) break;
			hd += Math.max(-turn, Math.min(turn, d));
			x += Math.cos(hd) * ds;
			y += Math.sin(hd) * ds;
			pts.push({
				x,
				y
			});
		}
		const r0 = pts.length - 1;
		let f0 = Math.atan2(y - T.y, x - T.x);
		let fx = f0, best = -2;
		for (let k = 0; k < 360; k++) {
			const f = f0 + sg * k / 360 * 2 * Math.PI, P = [T.x + R * Math.cos(f), T.y + R * Math.sin(f)], t = [-sg * Math.sin(f), sg * Math.cos(f)], v = [B.x - P[0], B.y - P[1]], l = Math.hypot(...v);
			const sc = (t[0] * v[0] + t[1] * v[1]) / l;
			if (sc > best) {
				best = sc;
				fx = f;
			}
		}
		const sweep = 2 * Math.PI * C.turns + Math.abs(fx - f0), m = Math.ceil(sweep * R / ds);
		for (let k = 1; k <= m; k++) {
			const f = f0 + sg * sweep * k / m;
			pts.push({
				x: T.x + R * Math.cos(f),
				y: T.y + R * Math.sin(f)
			});
		}
		const r1 = pts.length - 1, P = pts[r1], tx = -sg * Math.sin(f0 + sg * sweep), ty = sg * Math.cos(f0 + sg * sweep), D = Math.hypot(B.x - P.x, B.y - P.y), hl = .4 * D, nb = Math.ceil(1.6 * D / ds);
		const c1 = [P.x + tx * hl, P.y + ty * hl], c2 = [B.x - B.fx * hl, B.y - B.fy * hl];
		for (let k = 1; k <= nb; k++) {
			const u = k / nb, v = 1 - u;
			pts.push({
				x: v * v * v * P.x + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * B.x,
				y: v * v * v * P.y + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * B.y
			});
		}
		const b = pts.length - 1;
		for (let i = B.i; i < g0.pts.length; i++) pts.push({
			x: g0.pts[i].x,
			y: g0.pts[i].y
		});
		for (const q of pts) q.meterInMercatorCoordinateUnits = () => mu;
		const g = withCum(pts), aI = A.i;
		g.spiral = {
			a: g.cum[aI],
			r0: g.cum[r0],
			r1: g.cum[r1],
			b: g.cum[b],
			T,
			tower: C.tower,
			top: C.top
		};
		return g;
	}
	let coasterBld = null, coasterBldLoad = null;
	function loadCoasterBuildings() {
		return coasterBldLoad ??= Promise.all([fetch("./coaster_buildings.bin", { cache: "no-cache" }).then((r) => r.ok ? r.arrayBuffer() : null), fetch("./coaster_towers.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : [])]).then(([buf, towers]) => {
			const B = {
				blocks: /* @__PURE__ */ new Map(),
				towers: towers || []
			};
			if (buf && new TextDecoder().decode(new Uint8Array(buf, 0, 4)) === "CBLD") {
				const v = new DataView(buf);
				Object.assign(B, {
					x0: v.getFloat64(8, true),
					y0: v.getFloat64(16, true),
					C: v.getFloat64(24, true),
					W: v.getUint32(32, true)
				});
				const n = v.getUint32(40, true);
				for (let i = 0; i < n; i++) {
					const c = v.getUint32(44 + 4 * i, true), h = v.getUint16(44 + 4 * n + 2 * i, true), ix = c % B.W, iy = (c - ix) / B.W, key = (iy >> 5) * 65536 + (ix >> 5);
					let blk = B.blocks.get(key);
					if (!blk) B.blocks.set(key, blk = /* @__PURE__ */ new Uint16Array(1024));
					blk[(iy & 31) * 32 + (ix & 31)] = h;
				}
			}
			coasterBld = B;
		}).catch(() => {
			coasterBld = {
				blocks: /* @__PURE__ */ new Map(),
				towers: []
			};
		});
	}
	function buildingNear(x, y) {
		const B = coasterBld;
		if (!B?.W) return 0;
		const cx = Math.floor((x - B.x0) / B.C), cy = Math.floor((y - B.y0) / B.C);
		let h = 0;
		for (let iy = cy - 1; iy <= cy + 1; iy++) for (let ix = cx - 1; ix <= cx + 1; ix++) {
			if (ix < 0 || iy < 0) continue;
			const blk = B.blocks.get((iy >> 5) * 65536 + (ix >> 5));
			if (blk) {
				const v = blk[(iy & 31) * 32 + (ix & 31)];
				if (v > h) h = v;
			}
		}
		return h;
	}
	const COASTER_GRADE = .7, COASTER_DROP = 2.2, COASTER_CLEAR = 8;
	const RISE_MIN = 600, RISE_SHARE = .35, RISE_EPS = .4;
	const riseEdge = (line, lo, hi, L) => !!towerCourse(line, lo, hi) || L >= RISE_MIN && (hash(lo, hi, 20) < RISE_SHARE || !!inversion(lo, hi));
	const CROSS_NEAR = 35;
	let crossIdx = null;
	function crossings() {
		if (crossIdx) return crossIdx;
		crossIdx = /* @__PURE__ */ new Map();
		const R = corrRank(), cells = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set(), all = [];
		let cell = 0;
		for (const [line, chunks] of Object.entries(paths)) for (const ids of chunks) for (let i = 1; i < ids.length; i++) {
			const lo = Math.min(ids[i - 1], ids[i]), hi = Math.max(ids[i - 1], ids[i]), k = `${line}:${lo}:${hi}`;
			if (seen.has(k) || !byId.has(lo) || !byId.has(hi) || towerCourse(line, lo, hi)) continue;
			seen.add(k);
			const g = coasterPath(line, lo, hi), mu = g.pts[0].meterInMercatorCoordinateUnits();
			cell ||= 70 * mu;
			const e = {
				line,
				lo,
				hi,
				k,
				r: R.get(line) ?? 0,
				mu
			};
			let j = 1;
			for (let s = 0; s <= g.total; s += 10 * mu) {
				while (j < g.pts.length - 1 && g.cum[j] < s) j++;
				const A = g.pts[j - 1], B = g.pts[j], l = Math.hypot(B.x - A.x, B.y - A.y) || 1, u = Math.max(0, Math.min(1, (s - g.cum[j - 1]) / (g.cum[j] - g.cum[j - 1] || 1)));
				const q = {
					e,
					s,
					x: A.x + (B.x - A.x) * u,
					y: A.y + (B.y - A.y) * u,
					fx: (B.x - A.x) / l,
					fy: (B.y - A.y) / l
				}, c = Math.floor(q.x / cell) + "," + Math.floor(q.y / cell);
				if (!cells.has(c)) cells.set(c, []);
				cells.get(c).push(q);
				all.push(q);
			}
		}
		const best = /* @__PURE__ */ new Map();
		for (const q of all) {
			const ix = Math.floor(q.x / cell), iy = Math.floor(q.y / cell);
			for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const o of cells.get(ix + dx + "," + (iy + dy)) || []) {
				if (o.e.line === q.e.line || o.e.r > q.e.r || o.e.r === q.e.r && o.e.k > q.e.k) continue;
				if (Math.abs(q.fx * o.fx + q.fy * o.fy) > .9) continue;
				const d = Math.hypot(q.x - o.x, q.y - o.y);
				if (d > cell / 2) continue;
				const key = q.e.k + "|" + o.e.k + "|" + Math.round(o.s / (cell * 1.5));
				const b = best.get(key);
				if (!b || d < b.d) best.set(key, {
					d,
					q,
					o
				});
			}
		}
		const add = (k, m) => {
			if (!crossIdx.has(k)) crossIdx.set(k, []);
			crossIdx.get(k).push(m);
		};
		for (const { q, o } of best.values()) {
			add(q.e.k, q.s / q.e.mu);
			add(o.e.k, o.s / o.e.mu);
		}
		return crossIdx;
	}
	const crossedNear = (line, lo, hi, a, b) => !!line && (crossings().get(`${line}:${lo}:${hi}`) || []).some((m) => m >= a && m <= b);
	let coasterLevels = -1;
	const riseCache = /* @__PURE__ */ new Map();
	function coasterFresh() {
		cityViaduct.levelsOf();
		const v = cityViaduct.levelsVersion;
		if (v === coasterLevels) return;
		coasterLevels = v;
		for (const k of [...edgeGeom.keys()]) if (k.startsWith("h:")) edgeGeom.delete(k);
		riseCache.clear();
		onFresh();
	}
	const SWAY_BEND = [.15, 100], SWAY_WAVE = [.07, 35], SWAY_WAVE_M = 450, SWAY_UP = 20, SWAY_EASE = 120;
	function swayOf(line, lo, hi, L) {
		let ls = 0;
		for (const ch of line) ls = Math.imul(ls, 31) + ch.charCodeAt(0) | 0;
		const r = (i) => hash(lo ^ ls, hi, 100 + i);
		const amp = Math.min(SWAY_BEND[0] * L, SWAY_BEND[1]) * (r(0) < .25 ? .25 : .5 + .5 * r(1)), o1 = (r(2) * 2 - 1) * amp, o2 = (r(3) < .5 ? -1 : 1) * (.3 + .7 * r(4)) * amp * (r(5) < .5 ? 1 : -Math.sign(o1) || 1);
		const sway = Math.min(SWAY_WAVE[0] * L, SWAY_WAVE[1]) * r(6), waves = Math.max(1, Math.min(1 + (r(7) * 3 | 0), Math.floor(L / SWAY_WAVE_M))), ph = r(8) * 6.283;
		return (m) => {
			const u = Math.max(0, Math.min(1, m / L)), v = 1 - u;
			return 3 * v * v * u * o1 + 3 * v * u * u * o2 + sway * Math.sin(2 * Math.PI * waves * u + ph) * Math.sin(Math.PI * u);
		};
	}
	function coasterProfile(line, lo, hi) {
		coasterFresh();
		const id = `h:${line}:${lo}:${hi}`;
		let P = edgeGeom.get(id);
		if (P) return P;
		const g = geom(line, lo, hi), mu = g.pts[0].meterInMercatorCoordinateUnits(), L = g.total / mu, n = Math.max(2, Math.ceil(L / 10)), st = L / n, base = new Float32Array(n + 1), ex = new Float32Array(n + 1), rise = riseEdge(line, lo, hi, L);
		for (let i = 0; i <= n; i++) base[i] = cityViaduct.heightAt(line, lo, hi, i / n);
		const SW = rise && !g.spiral ? swayOf(line, lo, hi, L) : null;
		let sw = null;
		if (rise) {
			const need = new Float32Array(n + 1), h = new Float32Array(n + 1);
			let j = 1;
			for (let i = 0; i <= n; i++) {
				const s = g.total * i / n;
				while (j < g.pts.length - 1 && g.cum[j] < s) j++;
				const A = g.pts[j - 1], B = g.pts[j], u = Math.max(0, Math.min(1, (s - g.cum[j - 1]) / (g.cum[j] - g.cum[j - 1] || 1)));
				const X = A.x + (B.x - A.x) * u, Y = A.y + (B.y - A.y) * u, S = g.spiral, sl = Math.hypot(B.x - A.x, B.y - A.y) || 1, sw = SW ? SW(i * st) * mu : 0, bx = -(B.y - A.y) / sl * sw, by = (B.x - A.x) / sl * sw;
				const b = S && Math.hypot(X - S.T.x, Y - S.T.y) < (S.tower + 40) * mu ? 0 : Math.max(buildingNear(X, Y), SW ? buildingNear(X + bx, Y + by) : 0, SW ? buildingNear(X + bx / 2, Y + by / 2) : 0);
				need[i] = b ? Math.max(0, b + COASTER_CLEAR - base[i]) : 0;
				h[i] = hillsAt(lo, hi, L, i / n);
			}
			const ceil = new Float32Array(n + 1).fill(Infinity);
			for (const m of crossings().get(`${line}:${lo}:${hi}`) || []) {
				const a = Math.max(0, Math.floor((m - CROSS_NEAR) / st)), b = Math.min(n, Math.ceil((m + CROSS_NEAR) / st));
				for (let i = a; i <= b; i++) {
					ceil[i] = 0;
					need[i] = 0;
				}
			}
			const G = COASTER_GRADE * st, W = Math.max(1, Math.round(30 / st)), env = need.slice();
			for (let i = 1; i <= n; i++) env[i] = Math.max(env[i], env[i - 1] - G);
			for (let i = n - 1; i >= 0; i--) env[i] = Math.max(env[i], env[i + 1] - G);
			{
				const c = env.slice();
				for (let i = 0; i <= n; i++) {
					let m = 0;
					for (let j = Math.max(0, i - 3 * W); j <= Math.min(n, i + 3 * W); j++) m = Math.max(m, c[j]);
					env[i] = m;
				}
			}
			for (let pass = 0; pass < 3; pass++) {
				const c = env.slice(), at = (i) => c[Math.max(0, Math.min(n, i))];
				let sum = 0;
				for (let i = -W; i <= W; i++) sum += at(i);
				for (let i = 0; i <= n; i++) {
					if (i) sum += at(i + W) - at(i - W - 1);
					env[i] = sum / (2 * W + 1);
				}
			}
			for (let i = 1; i <= n; i++) h[i] = Math.max(h[i], h[i - 1] - G);
			for (let i = n - 1; i >= 0; i--) h[i] = Math.max(h[i], h[i + 1] - G);
			for (let pass = 0; pass < 2; pass++) {
				const c = h.slice(), at = (i) => c[Math.max(0, Math.min(n, i))];
				let sum = 0;
				for (let i = -W; i <= W; i++) sum += at(i);
				for (let i = 0; i <= n; i++) {
					if (i) sum += at(i + W) - at(i - W - 1);
					h[i] = sum / (2 * W + 1);
				}
			}
			const K = 12, smax = (a, b) => (a + b + Math.hypot(a - b, K)) / 2, smin = (a, b) => (a + b - Math.hypot(a - b, K)) / 2, sminK = (a, b, k) => (a + b - Math.hypot(a - b, k)) / 2;
			for (let i = 0; i <= n; i++) {
				const x = Math.min(i, n - i) * st - COASTER_FLAT, cap = (G, R) => x <= 0 ? 0 : x < R ? G * x * x / (2 * R) : G * (x - R / 2);
				ex[i] = Math.max(0, sminK(smax(smin(h[i], cap(COASTER_GRADE, 60)), env[i]), cap(COASTER_DROP, 80), 30));
			}
			if (ceil.some(Number.isFinite)) {
				for (let i = 1; i <= n; i++) ceil[i] = Math.min(ceil[i], ceil[i - 1] + G);
				for (let i = n - 1; i >= 0; i--) ceil[i] = Math.min(ceil[i], ceil[i + 1] + G);
				for (let i = 0; i <= n; i++) if (Number.isFinite(ceil[i])) ex[i] = Math.max(0, Math.min(ex[i], smin(ex[i], ceil[i])));
			}
			const S = g.spiral;
			if (S) {
				const E = (u) => {
					u = Math.max(0, Math.min(1, u));
					return u * u * u * (10 - 15 * u + 6 * u * u);
				}, h0 = 30, end = g.total - COASTER_FLAT * mu;
				for (let i = 0; i <= n; i++) {
					const s = g.total * i / n;
					let v = s <= S.r0 ? h0 * E((s - COASTER_FLAT * mu) / (S.r0 - COASTER_FLAT * mu)) : s <= S.r1 ? h0 + (S.top - h0) * (s - S.r0) / (S.r1 - S.r0) : S.top * (1 - E((s - S.r1) / (end - S.r1)));
					ex[i] = Math.max(v, s > S.r1 ? need[i] : 0);
				}
			}
			if (SW) {
				sw = new Float32Array(n + 1);
				for (let i = 0; i <= n; i++) sw[i] = smooth(Math.max(0, Math.min(1, ex[i] / SWAY_UP)));
				const k = Math.max(1, Math.round(SWAY_EASE / 2 / st));
				{
					const c = sw.slice();
					for (let i = 0; i <= n; i++) {
						let m = 1;
						for (let j = Math.max(0, i - k); j <= Math.min(n, i + k); j++) m = Math.min(m, c[j]);
						sw[i] = m;
					}
				}
				for (let pass = 0; pass < 2; pass++) {
					const c = sw.slice(), at = (i) => c[Math.max(0, Math.min(n, i))];
					let sum = 0;
					for (let i = -k; i <= k; i++) sum += at(i);
					for (let i = 0; i <= n; i++) {
						if (i) sum += at(i + k) - at(i - k - 1);
						sw[i] = sum / (2 * k + 1);
					}
				}
				sw[0] = sw[n] = 0;
			}
		}
		const h = new Float32Array(n + 1);
		for (let i = 0; i <= n; i++) h[i] = base[i] + ex[i];
		P = {
			h,
			ex,
			n,
			st,
			mu,
			rise,
			sw,
			SW
		};
		edgeGeom.set(id, P);
		return P;
	}
	function coasterAt(line, lo, hi, s) {
		const g = geom(line, lo, hi), mu = g.pts[0].meterInMercatorCoordinateUnits(), L = g.total / mu, k = g.total ? s / g.total : 0;
		const P = coasterProfile(line, lo, hi), x = Math.max(0, Math.min(P.n, k * P.n)), i = Math.min(P.n - 1, Math.floor(x));
		let sg = s, h = (P.h[i] + (P.h[i + 1] - P.h[i]) * (x - i)) * mu, up = (P.ex[i] + (P.ex[i + 1] - P.ex[i]) * (x - i)) * mu;
		if (!P.rise) return [
			s,
			h,
			0,
			0,
			0
		];
		const LD = loopD(L, lo, hi, line);
		if (LD) {
			const D = LD * mu, s0 = g.total / 2 - D / 2, u = (s - s0) / D;
			if (u > 0 && u < 1) {
				const t = 2 * Math.PI * u, r = D / LOOP_DR, dh = r * (1 - Math.cos(t));
				sg = s0 + D * u + r * Math.sin(t);
				h += dh;
				up += dh;
			}
		}
		const C = corkOf(L, lo, hi, line);
		let lat = 0, roll = 0;
		if (C) {
			const u = (s / mu - C[0]) / C[1];
			if (u > 0 && u < 1) roll = corkTheta(u, C[2]);
		}
		if (P.sw) {
			const latAt = (m) => {
				const y = Math.max(0, Math.min(P.n, m / L * P.n)), j = Math.min(P.n - 1, Math.floor(y));
				return P.SW(m) * (P.sw[j] + (P.sw[j + 1] - P.sw[j]) * (y - j));
			};
			const across = (a, D, m) => {
				const u = (m - a) / D, A = latAt(a), B = latAt(a + D), dA = (A - latAt(a - 1)) * D, dB = (latAt(a + D + 1) - B) * D, u2 = u * u, u3 = u2 * u;
				return (2 * u3 - 3 * u2 + 1) * A + (u3 - 2 * u2 + u) * dA + (-2 * u3 + 3 * u2) * B + (u3 - u2) * dB;
			};
			const m = s / mu;
			lat = (LD && Math.abs(m - L / 2) < LD / 2 ? across(L / 2 - LD / 2, LD, m) : C && m > C[0] && m < C[0] + C[1] ? across(C[0], C[1], m) : latAt(m)) * mu;
		}
		return [
			sg,
			h,
			lat,
			roll,
			up
		];
	}
	const coasterGaps = (line, lo, hi) => {
		const P = coasterProfile(line, lo, hi), L = P.n * P.st;
		return coasterRises(line, lo, hi).map(([a, b]) => [a / L, b / L]);
	};
	function coasterRises(line, lo, hi) {
		coasterFresh();
		const id = `${line}:${lo}:${hi}`;
		let R = riseCache.get(id);
		if (R) return R;
		R = [];
		const P = coasterProfile(line, lo, hi), L = P.n * P.st;
		if (P.rise) {
			let a = -1;
			for (let i = 0; i <= P.n; i++) {
				const up = P.ex[i] > RISE_EPS;
				if (up && a < 0) a = i;
				if (a >= 0 && (!up || i === P.n)) {
					R.push([Math.max(0, a - 1) * P.st, Math.min(P.n, i) * P.st]);
					a = -1;
				}
			}
			const LD = loopD(L, lo, hi, line), C = corkOf(L, lo, hi, line);
			if (LD) R.push([L / 2 - LD / 2, L / 2 + LD / 2]);
			if (C) R.push([C[0], C[0] + C[1]]);
			R.sort((p, q) => p[0] - q[0]);
			const M = [];
			for (const r of R) {
				const t = M[M.length - 1];
				if (t && r[0] <= t[1]) t[1] = Math.max(t[1], r[1]);
				else M.push([...r]);
			}
			R = M;
		}
		riseCache.set(id, R);
		return R;
	}
	function reset() {
		riseCache.clear();
		coasterLevels = -1;
		crossIdx = null;
	}
	return {
		coasterPath,
		rolled,
		CORK_HEART,
		coasterProfile,
		coasterAt,
		coasterGaps,
		coasterRises,
		inversion,
		loopD,
		corkOf,
		loadCoasterBuildings,
		reset,
		get bld() {
			return coasterBld;
		}
	};
}
export { createCoasterGeometry };
