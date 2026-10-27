// web/trains/plan.mjs
function createTrainPlanner({ stations, stationByLine, key, normStatus, route, merc, realGeom, geom, trainPose, mercStop, catchup, catchupAt, predictStops, isRide, getTrains }) {
	function kstMs(v) {
		const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
		return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6]) : NaN;
	}
	function age(v) {
		const t = kstMs(v);
		return t === t ? Math.max(0, ((clock() === frameClock ? frameEpoch : Date.now()) - t) / 1e3) : 0;
	}
	let frameClock = -1e9, frameEpoch = 0;
	function clock() {
		const t = performance.now();
		return isRide() && t - frameClock < 250 ? frameClock : t;
	}
	let edgeTimes = {};
	let liveTiming = {
		lines: {},
		default: {
			pace: 1,
			zone: 62,
			approach: 40
		}
	};
	fetch("./live-timing.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).then((d) => {
		if (d && d.lines) {
			liveTiming = d;
			replacePlans(getTrains().map(planTrain).filter(Boolean));
		}
	}).catch(() => {});
	const RUSH = [[420, 570], [1050, 1200]];
	const rushNow = () => {
		const k = new Date(Date.now() + 324e5), d = k.getUTCDay(), m = k.getUTCHours() * 60 + k.getUTCMinutes();
		return d > 0 && d < 6 && RUSH.some(([a, b]) => m >= a && m < b);
	};
	const timingFor = (line) => {
		const tm = {
			...liveTiming.default,
			...liveTiming.lines[line]
		};
		if (tm.rushPace && rushNow()) tm.pace = tm.rushPace;
		return tm;
	};
	fetch("./edge_times.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : {}).then((d) => {
		edgeTimes = d.edges || {};
		d.dwell;
		plans = getTrains().map(planTrain).filter(Boolean);
	}).catch(() => {});
	function segmentSeconds(a, b, line) {
		const sched = line && edgeTimes[`${line}:${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`];
		if (sched) return sched;
		const A = merc(a), B = merc(b), chord = Math.hypot(B.x - A.x, B.y - A.y), track = line ? realGeom(line, a.id, b.id).total : chord, metres = Math.max(chord, track) / A.meterInMercatorCoordinateUnits();
		return Math.max(30, Math.min(180, metres / 12.4));
	}
	const EXPRESS_LINES = new Set(stations.flatMap((s) => s.express || []));
	const CONSIST = {
		"1호선": [10, 20],
		"2호선": [10, 20],
		"3호선": [10, 20],
		"4호선": [10, 20],
		"5호선": [8, 20],
		"6호선": [8, 20],
		"7호선": [8, 20],
		"8호선": [6, 18],
		"9호선": [6, 19.5],
		"GTX-A": [8, 23.5],
		"경강선": [4, 20],
		"경의중앙선": [8, 20],
		"경춘선": [8, 20],
		"공항철도": [6, 22],
		"김포골드라인": [2, 13],
		"서해선": [4, 20],
		"수인분당선": [6, 20],
		"신림선": [3, 13],
		"신분당선": [6, 19.5],
		"에버라인선": [1, 12],
		"우이신설선": [2, 13],
		"의정부선": [2, 13],
		"인천1호선": [8, 18],
		"인천2호선": [2, 18]
	};
	function planTrain(t) {
		const s = stationByLine.get(`${t.line}:${key(t.station)}`);
		if (!s) return null;
		const expressLine = t.express && EXPRESS_LINES.has(t.line), dest = stationByLine.get(`${t.line}:${key(t.destination)}`);
		const stops = (st) => !expressLine || (st.express || []).includes(t.line) || st === dest;
		const r = route(t, s), previous = r.previous, status = normStatus(t.status), phases = [];
		let upto = r.ahead.length - 1;
		for (let j = 1, n = 0; j < r.ahead.length; j++) if (stops(r.ahead[j]) && ++n === predictStops()) {
			upto = j;
			break;
		}
		const ahead = r.ahead.slice(0, Math.max(1, upto) + 1);
		const tm = timingFor(t.line), DWELL = Math.max(15, tm.zone - 20), STAND = Math.min(DWELL, Math.max(20, Math.min(tm.stand || 30, DWELL - 20))), BRAKE = DWELL - STAND;
		const period = rushNow() ? "rush" : "day", zoneAt = (st) => (t.express ? null : tm.waits?.[`${st.id}:${t.direction}:${period}`]) ?? tm.stops?.[st.id] ?? tm.zone;
		const more = (st) => zoneAt(st) - tm.zone, stand = (st) => Math.max(5, STAND + more(st));
		const paced = (from, to) => {
			const D = tm.runs?.[`${from.id}:${to.id}`];
			if (D != null) return Math.max(10, D + 15 + BRAKE);
			const R = segmentSeconds(from, to, t.line);
			return Math.max(.5 * R, tm.pace * (R + 30) - STAND);
		};
		const run = (from, to, k0 = 0, k1 = 1, dur = paced(from, to)) => {
			const a = k0 === 0 && stops(from), b = k1 === 1 && stops(to);
			phases.push({
				from,
				to,
				k0,
				k1,
				dur: dur * (a && b ? 1 : a || b ? .9 : .8),
				ease: a && b ? "both" : a ? "in" : b ? "out" : "none"
			});
		};
		const dwell = (at, i, dur = STAND) => {
			const nx = ahead[i + 1];
			phases.push(nx ? {
				from: at,
				to: nx,
				k0: 0,
				k1: 0,
				dur
			} : {
				from: previous && i === 0 ? previous : ahead[i - 1] || at,
				to: at,
				k0: 1,
				k1: 1,
				dur
			});
		};
		const brakes = previous && BRAKE > 0 && (status === "진입" || status === "도착");
		if (status === "진입" && previous) run(previous, s, .75, brakes ? .85 : 1, tm.approach);
		if (status === "전역출발" && previous) run(previous, s);
		if (brakes) phases.push({
			from: previous,
			to: s,
			k0: .85,
			k1: 1,
			dur: BRAKE,
			ease: "out"
		});
		const wait = t.departsAt ? (kstMs(t.departsAt) - kstMs(t.receivedAt)) / 1e3 : 0;
		if (status !== "출발" && (stops(s) || status === "도착")) dwell(s, 0, Math.max((brakes ? STAND : DWELL) + more(s), wait || 0));
		for (let i = 0; i < ahead.length - 1; i++) {
			run(ahead[i], ahead[i + 1]);
			if (i + 1 < ahead.length - 1 && stops(ahead[i + 1])) dwell(ahead[i + 1], i + 1, stand(ahead[i + 1]));
		}
		const last = ahead[ahead.length - 1], before = ahead.length > 1 ? ahead[ahead.length - 2] : previous;
		phases.push(before ? {
			from: before,
			to: last,
			k0: 1,
			k1: 1,
			dur: Infinity
		} : {
			from: last,
			to: last,
			k0: 0,
			k1: 0,
			dur: Infinity
		});
		const seq = previous ? [previous, ...r.ahead] : [...r.ahead], cum = [0];
		for (let i = 1; i < seq.length; i++) cum.push(cum[i - 1] + geom(t.line, seq[i - 1].id, seq[i].id).total);
		let [cars, carMetres] = CONSIST[t.line] || [8, 20];
		if (t.line === "2호선") {
			const where = `${t.station} ${t.destination}`;
			if (/신설동|용두|신답|용답|성수지선/.test(where)) cars = 4;
			else if (/까치산|신정네거리|양천구청|도림천|신도림지선/.test(where)) cars = 6;
		}
		return {
			t,
			id: `${t.line}:${t.trainNo}`,
			phases,
			seq,
			cum,
			cars,
			carMetres,
			lead: status === "출발" ? 15 : 0
		};
	}
	let plans = [];
	const GLIDE_MAX_M = 1e3, HOLD_MAX_M = 3e3, CREEP_MPS = 4;
	function replacePlans(next) {
		const old = new Map(plans.map((p) => [p.id, p]));
		for (const p of next) {
			const o = old.get(p.id);
			if (!o || o.seq.length < 2) continue;
			const d = trainPose(o).dist;
			let i = 0;
			while (i < o.seq.length - 2 && o.cum[i + 1] < d) i++;
			const a = o.seq[i].id, b = o.seq[i + 1].id, f = (d - o.cum[i]) / (o.cum[i + 1] - o.cum[i] || 1);
			let from;
			const j = p.seq.findIndex((s, k) => s.id === a && p.seq[k + 1]?.id === b);
			if (j >= 0) from = p.cum[j] + (p.cum[j + 1] - p.cum[j]) * f;
			else {
				const k = p.seq.findIndex((s) => s.id === b);
				if (k < 0) continue;
				from = Math.max(0, p.cum[k] - (1 - f) * (o.cum[i + 1] - o.cum[i]));
			}
			const to = trainPose(p).dist, m = mercStop(p.t.line, p.seq[0]).meterInMercatorCoordinateUnits();
			if (from > to) {
				if ((from - to) / m < HOLD_MAX_M) {
					const k = p.cum.findIndex((c) => c >= from - 1e-9), next = k >= 0 ? p.cum[k] : from;
					p.hold = next;
					if (next > from) p.creep = {
						from,
						at: clock(),
						ms: Math.max(2e3, (next - from) / m / CREEP_MPS * 1e3),
						linear: true
					};
				}
			} else if ((to - from) / m > 1 && (to - from) / m < GLIDE_MAX_M) {
				const v0 = o.glide ? catchupAt(o.glide.c, (clock() - o.glide.at) / 1e3).v : 0;
				p.glide = {
					c: catchup((to - from) / m, v0),
					at: clock()
				};
			}
		}
		plans = next;
	}
	return {
		planTrain,
		replacePlans,
		age,
		clock,
		get plans() {
			return plans;
		},
		get frameClock() {
			return frameClock;
		},
		rebuild() {
			plans = getTrains().map(planTrain).filter(Boolean);
		},
		clear() {
			plans = [];
		},
		setFrame(ts) {
			frameClock = ts;
			frameEpoch = Date.now() - (performance.now() - ts);
		}
	};
}
export { createTrainPlanner };
