// web/user/dev_ride_log.mts
var RIDE_LOG_KEY = "syung-dev-ride-log";
var FLUSH_MS = 15e3;
var MOTION_MS = 5e3;
var GPS_GAP_MS = 4500;
var GPS_KEEP_MS = 15e3;
var MAX_QUEUE = 4e3;
var RIDE_URL = "./api/me/rides";
var CHANGE = {
	"X-Requested-With": "syung",
	"Content-Type": "application/json"
};
function batchSize(queue) {
	let size = 0, moves = 0;
	for (const event of queue) {
		if (size >= 500 || event.kind === "motion" && ++moves > 40) break;
		size++;
	}
	return size;
}
var dropAfter = (status) => status >= 200 && status < 300 || status === 400 || status === 413;
var closeCell = (cell) => [cell.slot, ...cell.sum.map((total, index) => cell.n[index] ? Math.round(total / cell.n[index] * 100) / 100 : null)];
function motionChunks(bins, base) {
	const chunks = [];
	for (let index = 0; index < bins.length; index += 140) chunks.push(bins.slice(index, index + 140).flatMap(([slot, ...values]) => [slot - base, ...values]));
	return chunks;
}
function motionValues(event) {
	const gravity = event.accelerationIncludingGravity ?? {}, linear = event.acceleration ?? {}, turn = event.rotationRate ?? {};
	return [
		gravity.x,
		gravity.y,
		gravity.z,
		linear.x,
		linear.y,
		linear.z,
		turn.alpha,
		turn.beta,
		turn.gamma
	];
}
function infoFields(info) {
	const fields = {};
	for (const key of [
		"line",
		"train",
		"routeId",
		"routeName",
		"vehicle",
		"station"
	]) {
		const value = info[key];
		if (value) fields[key] = value;
	}
	return fields;
}
function createRideLog(deps) {
	const load = () => {
		try {
			const raw = deps.storage?.getItem(RIDE_LOG_KEY);
			const list = raw ? JSON.parse(raw) : [];
			return Array.isArray(list) ? list : [];
		} catch {
			return [];
		}
	};
	let queue = load(), sending = false, stopped = false;
	const save = () => {
		try {
			deps.storage?.setItem(RIDE_LOG_KEY, JSON.stringify(queue));
		} catch {}
	};
	let ride = null, lastState = "", answered = null, gpsAt = 0;
	let lastFix = null;
	const motion = {
		bins: [],
		cur: null,
		off: null,
		turn: 0
	};
	let flushOff = null, motionOff = null;
	function push(kind, info, extra = {}) {
		if (!ride || stopped) return;
		const t = deps.now(), event = {
			kind,
			mode: info.mode,
			ride,
			t,
			...infoFields(info),
			...extra
		};
		if (kind !== "gps" && lastFix && t - lastFix.t < 15e3) Object.assign(event, {
			lat: lastFix.lat,
			lng: lastFix.lng,
			acc: lastFix.acc
		});
		queue.push(event);
		if (queue.length > 4e3) queue = queue.slice(queue.length - MAX_QUEUE);
		save();
	}
	async function flush() {
		if (sending || stopped || !queue.length || !deps.online()) return;
		sending = true;
		const batch = queue.slice(0, batchSize(queue));
		try {
			const reply = await deps.send(RIDE_URL, {
				method: "POST",
				credentials: "same-origin",
				headers: CHANGE,
				body: JSON.stringify({ events: batch })
			});
			if (reply.status === 401) {
				quit();
				deps.forbidden?.();
				return;
			}
			if (reply.status === 403) {
				quit();
				queue = [];
				save();
				deps.forbidden?.();
				return;
			}
			if (dropAfter(reply.status)) {
				queue = queue.slice(batch.length);
				save();
			}
		} catch {} finally {
			sending = false;
		}
		if (!ride && !queue.length) {
			flushOff?.();
			flushOff = null;
		}
	}
	const flushing = () => {
		flushOff ??= deps.every(() => {
			flush();
		}, FLUSH_MS);
	};
	let infoNow = { mode: "subway" };
	function closeBin() {
		if (motion.cur) motion.bins.push(closeCell(motion.cur));
		motion.cur = null;
	}
	function sendMotion(all = false) {
		if (all) closeBin();
		if (!ride || !motion.bins.length) return;
		for (const chunk of motionChunks(motion.bins, deps.now())) push("motion", infoNow, { m: chunk });
		motion.bins = [];
	}
	function onMotion(event) {
		const slot = Math.floor(deps.now() / 100) * 100, values = motionValues(event);
		if (!motion.cur || motion.cur.slot !== slot) {
			closeBin();
			motion.cur = {
				slot,
				sum: values.map(() => 0),
				n: values.map(() => 0)
			};
		}
		const cell = motion.cur;
		values.forEach((value, index) => {
			if (typeof value === "number" && Number.isFinite(value)) {
				cell.sum[index] += value;
				cell.n[index]++;
			}
		});
	}
	function startMotion() {
		const listen = deps.listenMotion;
		if (!listen) return;
		const turn = ++motion.turn;
		const on = () => {
			if (turn !== motion.turn || !ride) return;
			motion.off = listen(onMotion);
			motionOff = deps.every(() => sendMotion(), MOTION_MS);
		};
		if (!deps.askMotion) {
			on();
			return;
		}
		deps.askMotion().then((answer) => {
			if (answer === "granted") on();
		}, () => {});
	}
	function stopMotion() {
		motion.turn++;
		if (motion.off) {
			motion.off();
			motion.off = null;
			sendMotion(true);
		}
		motionOff?.();
		motionOff = null;
		motion.bins = [];
		motion.cur = null;
	}
	function quit() {
		stopMotion();
		flushOff?.();
		flushOff = null;
		ride = null;
		stopped = true;
	}
	if (queue.length) flushing();
	const log = {
		begin(info) {
			if (stopped) return;
			if (ride) log.end("다시 출발", infoNow);
			ride = `map-${deps.now()}`;
			lastState = "";
			answered = null;
			gpsAt = 0;
			infoNow = info;
			startMotion();
			push("start", info);
			flushing();
		},
		gps(coords) {
			if (!ride) return;
			const t = deps.now();
			lastFix = {
				t,
				lat: coords.latitude,
				lng: coords.longitude,
				acc: coords.accuracy
			};
			if (t - gpsAt < 4500) return;
			gpsAt = t;
			push("gps", infoNow, {
				lat: coords.latitude,
				lng: coords.longitude,
				acc: coords.accuracy,
				...typeof coords.speed === "number" && Number.isFinite(coords.speed) ? { speed: coords.speed } : {},
				...typeof coords.heading === "number" && Number.isFinite(coords.heading) ? { heading: coords.heading } : {}
			});
		},
		judge(state, info) {
			infoNow = info;
			if (!ride || state === lastState) return;
			lastState = state;
			push("judge", info, { state });
		},
		answer(value, info) {
			if (!ride) return;
			answered = value;
			push("answer", info, { answer: value });
			flush();
		},
		end(note, info) {
			if (!ride) return;
			stopMotion();
			push("end", info, { note });
			ride = null;
			lastFix = null;
			flush();
		},
		flush,
		close: quit,
		get recording() {
			return !!ride;
		},
		get answered() {
			return answered;
		}
	};
	return log;
}
function browserRideLog(forbidden) {
	let storage = null;
	try {
		storage = localStorage;
	} catch {}
	const hasMotion = typeof DeviceMotionEvent !== "undefined", ask = hasMotion ? DeviceMotionEvent.requestPermission : void 0;
	const log = createRideLog({
		storage,
		send: (url, init) => fetch(url, init),
		now: () => Date.now(),
		every: (run, ms) => {
			const timer = setInterval(run, ms);
			return () => clearInterval(timer);
		},
		online: () => navigator.onLine !== false,
		askMotion: typeof ask === "function" ? () => ask.call(DeviceMotionEvent) : null,
		listenMotion: hasMotion ? (on) => {
			const listener = (event) => on(event);
			addEventListener("devicemotion", listener);
			return () => removeEventListener("devicemotion", listener);
		} : null,
		forbidden
	});
	addEventListener("online", () => {
		log.flush();
	});
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") log.flush();
	});
	return log;
}
export { FLUSH_MS, GPS_GAP_MS, GPS_KEEP_MS, MAX_QUEUE, MOTION_MS, RIDE_LOG_KEY, batchSize, browserRideLog, closeCell, createRideLog, dropAfter, motionChunks, motionValues };
