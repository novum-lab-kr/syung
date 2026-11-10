var NEAR_HOLD_MS = 5e3;
var REROUTE_GAP_MS = 1e4;
var HURRY_SHARE = .8;
var WALK_SPEED = 1.2;
var SPEED_RANGE = [.5, 2.5];
var M_PER_DEG = 111320;
function metres(from, to) {
	const across = (to[0] - from[0]) * Math.cos((from[1] + to[1]) / 2 * Math.PI / 180), up = to[1] - from[1];
	return Math.hypot(across, up) * M_PER_DEG;
}
function onPath(point, path, within) {
	if (path.length < 2) return {
		off: path[0] ? metres(point, path[0]) : 0,
		at: 0,
		total: 0
	};
	const cos = Math.cos(point[1] * Math.PI / 180), flat = (spot) => [spot[0] * cos * M_PER_DEG, spot[1] * M_PER_DEG], here = flat(point);
	const min = within?.min ?? -Infinity, max = within?.max ?? Infinity;
	let best = Infinity, bestAt = 0, walked = 0;
	for (let index = 1; index < path.length; index++) {
		const start = flat(path[index - 1]), end = flat(path[index]), dx = end[0] - start[0], dy = end[1] - start[1], span = Math.hypot(dx, dy);
		if (walked + span >= min && walked <= max) {
			const low = span ? Math.max(0, (min - walked) / span) : 0, high = span ? Math.min(1, (max - walked) / span) : 0;
			const share = span ? Math.max(low, Math.min(high, ((here[0] - start[0]) * dx + (here[1] - start[1]) * dy) / (span * span))) : 0;
			const gap = Math.hypot(here[0] - start[0] - dx * share, here[1] - start[1] - dy * share);
			if (gap < best) {
				best = gap;
				bestAt = walked + span * share;
			}
		}
		walked += span;
	}
	return {
		off: best,
		at: bestAt,
		total: walked
	};
}
function onPathFrom(point, path, from) {
	const near = onPath(point, path, {
		min: from - 30,
		max: from + 300
	});
	return near.off <= 60 ? near : onPath(point, path);
}
function splitPath(path, at) {
	let walked = 0;
	for (let index = 1; index < path.length; index++) {
		const start = path[index - 1], end = path[index], span = metres(start, end);
		if (walked + span >= at) {
			const share = span ? (at - walked) / span : 0, cut = [start[0] + (end[0] - start[0]) * share, start[1] + (end[1] - start[1]) * share];
			return {
				done: [...path.slice(0, index), cut],
				rest: [cut, ...path.slice(index)]
			};
		}
		walked += span;
	}
	return {
		done: [...path],
		rest: path.length ? [path[path.length - 1]] : []
	};
}
var offFixes = (count, offM) => offM > 20 ? count + 1 : 0;
var shouldReroute = ({ offFixes: count, busy, nowMs, lastMs }) => count >= 3 && !busy && (!lastMs || nowMs - lastMs >= 1e4);
var WALK_AGAIN_MAX_S = 7200;
function walkEnd(legs, index) {
	const leg = legs[index], next = legs[index + 1];
	if (leg?.type !== "walk") return null;
	if (!next) return { goal: true };
	if (next.type === "ride") return next.stations[0] === void 0 ? null : { station: next.stations[0] };
	const end = next.type === "bus" ? next.path[0] : leg.path?.[leg.path.length - 1];
	return end ? { to: end } : null;
}
function walkQuery(spot, end, goal) {
	const from = `walk=1&from=${spot[1]},${spot[0]}`;
	if ("station" in end) return `${from}&station=${end.station}`;
	const [lng, lat] = "to" in end ? end.to : [goal.lng, goal.lat];
	return `${from}&to=${lat},${lng}`;
}
var isSpot = (value) => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
function freshWalk(answer) {
	if (!answer || typeof answer !== "object" || answer.ok !== true) return null;
	const leg = answer.leg;
	if (!leg || typeof leg !== "object") return null;
	const { type, seconds, metres, path, exit, label, to } = leg;
	if (type !== "walk" || typeof seconds !== "number" || !(seconds >= 0 && seconds <= 7200) || typeof metres !== "number" || !Number.isFinite(metres)) return null;
	if (!Array.isArray(path) || path.length < 2 || !path.every(isSpot)) return null;
	return {
		seconds,
		metres,
		path: path.map(([lng, lat]) => [lng, lat]),
		exit: typeof exit === "string" ? exit : "",
		label: typeof label === "string" ? label : "",
		to: typeof to === "string" ? to : null
	};
}
function spliceWalk(plan, index, fresh, end, now) {
	const legs = [...plan.legs], old = legs[index], previous = legs[index - 1];
	const station = "station" in end, transfer = !!previous && previous.type !== "walk";
	legs[index] = {
		...old,
		seconds: fresh.seconds,
		metres: fresh.metres,
		path: fresh.path,
		...station ? {
			exit: fresh.exit,
			...fresh.to ? { to: fresh.to } : {}
		} : {},
		...station && !transfer && fresh.label ? { label: fresh.label } : {}
	};
	const walkMinutes = Math.round(legs.reduce((sum, leg) => sum + (leg.type === "walk" ? leg.seconds : 0), 0) / 60);
	if (index < legs.length - 1) return {
		...plan,
		legs,
		walkMinutes
	};
	const pad = (value) => String(value).padStart(2, "0"), at = /* @__PURE__ */ new Date(+now + fresh.seconds * 1e3);
	const arrives = `${pad(at.getHours())}:${pad(at.getMinutes())}`, shift = (hm(arrives) - hm(plan.arrives) + 720 + 1440) % 1440 - 720;
	return {
		...plan,
		legs,
		walkMinutes,
		arrives,
		minutes: Math.max(0, plan.minutes + shift)
	};
}
var TALK = {
	miss: ["포탈 열면 가능한데… 그럴 거면 집으로 여시죠"],
	hurry: ["지금 출발하면 전설, 망설이면 다음 열차"],
	tight: ["경보 선수 모드 ON", "엘리베이터 말고 에스컬레이터 각"],
	fit: ["열차랑 약속 잡은 사람처럼 걷는 중"],
	easy: ["열차가 아직 출근 준비 중이에요"],
	free: ["편의점 들렀다 가도 돼요", "이 정도면 열차가 우릴 기다려야죠"]
};
function talkKind(arrivalS, walkS) {
	if (arrivalS < walkS * .8) return "miss";
	if (arrivalS < walkS) return "hurry";
	const spare = arrivalS - walkS;
	if (spare < 120) return "tight";
	if (spare < 300) return "fit";
	if (spare < 600) return "easy";
	return "free";
}
var talkLine = (kind, turn) => {
	const lines = TALK[kind];
	return lines[Math.abs(turn) % lines.length];
};
function catchable(arrivalsS, walkS) {
	const sorted = [...arrivalsS].sort((first, second) => first - second), next = sorted.filter((arrival) => arrival >= walkS * HURRY_SHARE);
	return {
		missed: next.length < sorted.length,
		next
	};
}
var hm = (time) => {
	const [hours = 0, minutes = 0] = String(time).split(":").map(Number);
	return hours * 60 + minutes;
};
function legPace(legs, index) {
	const leg = legs[index];
	if (leg?.type !== "walk" || !leg.metres) return WALK_SPEED;
	const access = (legs[index - 1]?.type === "ride" ? 90 : 0) + (legs[index + 1]?.type === "ride" ? 90 : 0);
	const pace = leg.metres / Math.max(1, leg.seconds - access);
	return pace >= SPEED_RANGE[0] && pace <= SPEED_RANGE[1] ? pace : WALK_SPEED;
}
function measuredPace(track) {
	const latest = track[track.length - 1];
	if (!latest) return null;
	const earlier = [...track].reverse().find((item) => latest.t - item.t >= 15e3);
	if (!earlier || latest.at - earlier.at < 10) return null;
	return Math.max(SPEED_RANGE[0], Math.min(SPEED_RANGE[1], (latest.at - earlier.at) / ((latest.t - earlier.t) / 1e3)));
}
var walkLeftS = (legs, index, leftM, pace) => leftM / pace + (legs[index + 1]?.type === "ride" ? 90 : 0);
function transferS(previous, next) {
	const ready = hm(next.departs) * 60 - next.wait, arrived = hm(previous.arrives) * 60;
	return Math.max(60, (ready - arrived + 86400) % 86400) + 60;
}
function rideSteps(legs) {
	const steps = [];
	legs.forEach((leg, index) => {
		if (leg.type === "walk") steps.push({
			kind: "walk",
			leg: index
		});
		else steps.push({
			kind: "wait",
			leg: index
		}, {
			kind: "ride",
			leg: index
		});
	});
	steps.push({ kind: "done" });
	return steps;
}
var CHARACTER = {
	sprout: {
		file: "sprout-left.webp",
		flip: false
	},
	builder: {
		file: "builder-right.webp",
		flip: true
	},
	seonbi: {
		file: "seonbi-right.webp",
		flip: true
	},
	visitor: {
		file: "visitor-left.webp",
		flip: false
	}
};
var characterOf = (look) => CHARACTER[look ?? ""] ?? CHARACTER.sprout;
var minutes = (seconds) => Math.max(1, Math.round(seconds / 60));
var roundM = (value) => Math.max(10, Math.round(value / 10) * 10);
var placeOf = (leg, name) => leg.type === "bus" ? `${name} 정류장` : `${name}역`;
var stepNo = (legs, index) => `${index + 1}/${legs.length}`;
function walkTitle(legs, index, toName) {
	const leg = legs[index], next = legs[index + 1];
	if (!next) return `${toName}까지 걸어요`;
	if (next.type === "walk") return leg?.type === "walk" && leg.label ? `${leg.label} 걸어요` : "다음 곳까지 걸어요";
	if (index === 0 && leg?.type === "walk" && leg.label) return `${leg.label} 걸어요`;
	return `${placeOf(next, next.from)}까지 걸어요`;
}
var walkSub = (legs, index, leftM, leftS) => `${stepNo(legs, index)} · ${roundM(leftM)}m · ${minutes(leftS)}분`;
function waitTitle(leg) {
	return leg.type === "bus" ? `${leg.route} ${leg.toward} 방면 타는 곳으로` : `${leg.line} ${leg.to} 방면 타는 곳으로`;
}
function waitText(legs, index, walkS, arrivalsS, turn, arrived = false, gone = false) {
	const previous = legs[index - 1], parts = [];
	if (previous && previous.type !== "walk") parts.push(stepNo(legs, index - 1));
	parts.push(walkS > 0 ? `걸어서 ${minutes(walkS)}분` : `${legs[index]?.type === "bus" ? "정류장" : "승강장"} 도착`);
	if (!arrivalsS?.length) return {
		say: gone ? talkLine("miss", turn) : null,
		sub: parts.join(" · ")
	};
	const caught = catchable(arrivalsS, walkS), missed = caught.missed || gone, [first, second] = caught.next;
	const leg = legs[index], noun = leg?.type === "bus" ? `${leg.route}번` : "열차";
	if (first !== void 0) parts.push(firstTrainText(first, missed, arrived, noun));
	if (second !== void 0) parts.push(missed && !arrived ? `그다음 ${minutes(second)}분 뒤` : `다음 ${minutes(second)}분 뒤`);
	return {
		say: talkLine(missed || first === void 0 ? "miss" : talkKind(first, walkS), turn),
		sub: parts.join(" · ")
	};
}
function firstTrainText(firstS, missed, arrived, noun) {
	if (arrived) return `${noun} 도착 · 지금 타세요`;
	return missed ? `다음 ${noun} ${minutes(firstS)}분 뒤` : `${noun} ${minutes(firstS)}분 뒤`;
}
var rideTitle = (leg) => `${leg.to}에서 내려요`;
function rideSub(legs, index, stopsLeft, where = null) {
	const leg = legs[index], head = where ? `${stepNo(legs, index)} · 지금 ${where.now}` : stepNo(legs, index);
	if (stopsLeft <= 1) return `${head} · 다음 ${leg.type === "bus" ? "정류장" : "역"}에서 내려요`;
	return `${head}${where?.next ? ` · 다음 ${where.next}` : ""} · ${stopsLeft}정거장 · ${leg.arrives}`;
}
function doneParts(toName, now, startedMs) {
	const pad = (value) => String(value).padStart(2, "0");
	return {
		to: toName,
		time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
		took: minutes((+now - startedMs) / 1e3)
	};
}
function rideEndSpot(legs, stationSpot) {
	for (let index = legs.length - 1; index >= 0; index--) {
		const leg = legs[index];
		if (leg.type === "ride") {
			const id = leg.stations.at(-1), spot = id === void 0 ? null : stationSpot(id);
			if (spot) return spot;
			continue;
		}
		const end = leg.path?.at(-1);
		if (end) return end;
	}
	return null;
}
function doneSub(toName, now, startedMs) {
	const { to, time, took } = doneParts(toName, now, startedMs);
	return `${to} · ${time} · ${took}분 걸렸어요`;
}
var gapAt = (cum, index) => Math.abs((cum[index + 1] ?? cum[index]) - (cum[index - 1] ?? cum[index])) / 2 || 1;
function reached({ seqIds, cum, dist }, stationId) {
	const index = seqIds.indexOf(stationId);
	return index >= 0 && dist >= cum[index] - gapAt(cum, index) * .03;
}
function leftStation({ seqIds, cum, dist }, stationId) {
	const index = seqIds.indexOf(stationId);
	if (index < 0) return seqIds.length > 0 && dist >= (cum[0] ?? 0);
	return dist > cum[index] + gapAt(cum, index) * .1;
}
function rideStops(track, stations) {
	const first = stations.findIndex((id) => track.seqIds.includes(id));
	if (first < 0) return null;
	let now = first > 0 ? stations[first - 1] : null;
	for (const id of stations.slice(first)) {
		if (!track.seqIds.includes(id) || !reached(track, id)) return now == null ? null : {
			now,
			next: id
		};
		now = id;
	}
	return now == null ? null : {
		now,
		next: null
	};
}
function stopsLeft({ seqIds, cum, dist }, stations) {
	const goal = seqIds.indexOf(stations[stations.length - 1]);
	if (goal < 0) return null;
	let count = 0;
	for (let index = 0; index <= goal; index++) if (cum[index] > dist + gapAt(cum, index) * .03) count++;
	return count;
}
function stopsLeftByTime(leg, now) {
	const start = hm(leg.departs), span = (hm(leg.arrives) - start + 1440) % 1440 || 1, since = (now.getHours() * 60 + now.getMinutes() - start + 1440) % 1440;
	const gone = since < 720 ? since : 0;
	return Math.max(1, Math.ceil(leg.stops * (1 - Math.min(1, gone / span))));
}
function legOverByTime(legs, index, now, planArrives) {
	const leg = legs[index], next = legs[index + 1], nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
	const passed = (time, less = 0) => {
		const at = hm(time) - less;
		return (nowMin - at + 1440) % 1440 < 720;
	};
	if (!leg) return true;
	if (leg.type !== "walk") return passed(leg.arrives);
	if (!next) return passed(planArrives);
	if (next.type === "walk") return false;
	return passed(next.departs, next.wait / 60);
}
var BOARD_FALLBACK_MS = 45e3;
var BOARD_GIVE_UP_MS = 18e4;
var pickedLeft = (track, stationId, seen) => (seen || track.seqIds.includes(stationId)) && leftStation(track, stationId);
var pickedArrived = ({ zeroSinceMs, pickedDueS, track, stationId }) => !!zeroSinceMs || pickedDueS !== null && pickedDueS <= 0 || !!track && reached(track, stationId) && !leftStation(track, stationId);
var LOST_FIX_MS = 3e4;
var lostUnderground = ({ nowMs, lastFixMs, stationM, exitM = null }) => !!lastFixMs && nowMs - lastFixMs > 3e4 && (stationM !== null && stationM <= 150 || atExit(exitM));
var atExit = (exitM) => exitM !== null && exitM <= 50;
var nearestM = (spot, points) => points.reduce((best, point) => {
	const away = metres(spot, point);
	return best === null || away < best ? away : best;
}, null);
var nearBoarding = ({ goalM, stationM, exitM }) => goalM <= 100 || stationM !== null && stationM <= 100 || atExit(exitM);
function arriveOutcome(walkS, arrived) {
	if (!arrived) return null;
	return walkS <= 0 ? "board" : "missed";
}
function arrivedEarly(rows, walkS, station) {
	if (walkS <= 0) return [];
	const name = station.replace(/\([^)]*\)/g, "").trim();
	return rows.flatMap((row) => row.trainNo && (row.message === `${name} 도착` || row.message === `${name} 진입`) ? [row.trainNo] : []);
}
function stayedFixes(count, track, nextId, atBoarding) {
	if (!track || nextId === void 0 || !atBoarding) return 0;
	return reached(track, nextId) || leftStation(track, nextId) ? count + 1 : 0;
}
var leftBehind = (count) => count >= 3;
function withTrainFixes(count, { stationM, exitM, trainM }) {
	return !nearBoarding({
		goalM: Infinity,
		stationM,
		exitM
	}) && trainM < stationM ? count + 1 : 0;
}
function holdOutcome({ nowMs, sinceMs, leftMs, lastFixMs, moved, nextReached }) {
	if (!leftMs) return nowMs - sinceMs >= 18e4 ? "board" : null;
	if (moved >= 3 || nowMs - Math.max(lastFixMs, leftMs) > 3e4) return "board";
	return nextReached && lastFixMs >= leftMs && !moved ? "missed" : null;
}
function boardNow({ nowMs, zeroSinceMs, trainLeft, pickedDueS, trainGone, listLength, listFresh, departsPassed }) {
	if (trainLeft && !(pickedDueS !== null && pickedDueS > 60) || trainGone) return true;
	if (zeroSinceMs && (trainLeft !== null ? nowMs - zeroSinceMs >= 18e4 : nowMs - zeroSinceMs >= 45e3)) return true;
	return (!listLength || !listFresh) && departsPassed;
}
function rideOver(track, stations, timeOver, longOver) {
	const toId = stations[stations.length - 1];
	if (!track || toId === void 0) return timeOver;
	if (track.seqIds.includes(toId)) return reached(track, toId);
	return track.seqIds.some((id) => stations.includes(id)) ? longOver : timeOver;
}
var bareName = (name) => name.replace(/\(.*?\)/g, "").trim().replace(/역$/, "");
function arrivalFits(row, leg, trainSeq, nameOf) {
	if (row.line !== leg.line || row.direction !== leg.direction) return false;
	const toId = leg.stations[leg.stations.length - 1], onLeg = new Set(leg.stations);
	if (trainSeq && toId !== void 0) {
		const start = trainSeq.findIndex((id) => onLeg.has(id) && id !== toId);
		let offRun = 0;
		if (start >= 0) for (const id of trainSeq.slice(start)) {
			if (id === toId) break;
			if (onLeg.has(id)) offRun = 0;
			else if (++offRun > 4) return false;
		}
	}
	if (!row.destination) return true;
	const destination = bareName(row.destination);
	return !leg.stations.slice(0, -1).some((id) => {
		const name = nameOf(id);
		return !!name && bareName(name) === destination;
	});
}
export { BOARD_FALLBACK_MS, BOARD_GIVE_UP_MS, HURRY_SHARE, LOST_FIX_MS, NEAR_HOLD_MS, REROUTE_GAP_MS, WALK_AGAIN_MAX_S, arrivalFits, arriveOutcome, arrivedEarly, boardNow, catchable, characterOf, doneParts, doneSub, freshWalk, holdOutcome, leftBehind, leftStation, legOverByTime, legPace, lostUnderground, measuredPace, metres, nearBoarding, nearestM, offFixes, onPath, onPathFrom, pickedArrived, pickedLeft, reached, rideEndSpot, rideOver, rideSteps, rideStops, rideSub, rideTitle, shouldReroute, spliceWalk, splitPath, stayedFixes, stopsLeft, stopsLeftByTime, talkKind, talkLine, transferS, waitText, waitTitle, walkEnd, walkLeftS, walkQuery, walkSub, walkTitle, withTrainFixes };
