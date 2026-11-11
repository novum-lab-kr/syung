import { serverUrl } from "../lib/server_url.mjs";
import { BOARD_GIVE_UP_MS, HURRY_SHARE, arrivalFits, arriveOutcome, arrivedEarly, boardNow, catchable, characterOf, doneParts, doneSub, holdOutcome, leftBehind, leftStation, legOverByTime, legPace, lostUnderground, measuredPace, metres, nearBoarding, nearestM, offFixes, onPath, onPathFrom, pickedArrived, pickedLeft, reached, rideAlerts, rideEndSpot, rideOver, rideSteps, rideStops, rideSub, rideTitle, shouldReroute, splitPath, stayedFixes, stopsLeft, stopsLeftByTime, transferS, waitText, waitTitle, walkLeftS, walkSub, walkTitle, withTrainFixes } from "../lib/ride-along.mjs";
// web/ui/ride_along.mts
var BUS_ARRIVALS_MS = 3e4;
var BUS_MISS_MS = 3e4;
var TICK_MS = 1e3;
var ARRIVALS_MS = 2e4;
var ARRIVALS_STALE_MS = ARRIVALS_MS * 3;
var FIX_FRESH_MS = 3e4;
var FOLLOW_ZOOM = 16;
var RIDE_ZOOM = 15;
var FOLLOW_EASE = .25;
function createRideAlong({ map, geolocate, planner, trainPose, trainLngLat, arrivalRank, byId, animFrame, drawRideCard, look, walked, ended, detour, reroute, otherFollow, exitsOf, busStopAt, bus, devLog = () => null, alerts = null, trainLeaves }) {
	const host = document.createElement("div");
	host.className = "rg-host";
	document.body.append(host);
	let ride = null, timer = 0, arrivalsTimer = 0, busTimer = 0;
	let fix = null, following = true, turnedOn = false, cam = null, camAt = 0, camKey = "";
	const step = () => ride ? ride.steps[ride.at] : null;
	const legAt = (index) => ride?.legs[index];
	const freshFix = () => fix && Date.now() - fix.t < FIX_FRESH_MS ? fix.spot : null;
	const endSpot = () => ride ? rideEndSpot(ride.legs, (id) => {
		const station = byId.get(id);
		return station ? [station.lon, station.lat] : null;
	}) : null;
	const planOf = (id) => id ? planner.plans.find((plan) => plan.id === id) ?? null : null;
	const trackOf = (plan) => ({
		seqIds: plan.seq.map((station) => station.id),
		cum: plan.cum,
		dist: trainPose(plan).dist
	});
	const pad = () => {
		const card = host.querySelector(".rg-talk");
		return {
			top: 0,
			bottom: card ? Math.max(0, innerHeight - card.getBoundingClientRect().top) : 0,
			left: 0,
			right: 0
		};
	};
	geolocate.on("geolocate", (event) => {
		if (ride) devLog()?.gps(event.coords);
		if (event.coords.accuracy > 100) return;
		fix = {
			spot: [event.coords.longitude, event.coords.latitude],
			t: Date.now()
		};
		if (!ride) return;
		offTrack(fix.spot);
		leftWithoutMe(fix.spot);
		followHeld(fix.spot);
		tick();
		const current = step();
		if (following && current && current.kind !== "done" && !(current.kind === "ride" && legAt(current.leg)?.type === "ride")) map.easeTo({
			center: [...fix.spot],
			zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
			padding: pad(),
			duration: 600
		});
	});
	const locate = () => {
		if (geolocate._watchState === "OFF") {
			turnedOn = true;
			geolocate.trigger();
		}
	};
	const unlocate = () => {
		if (!turnedOn) return;
		turnedOn = false;
		for (let tries = 0; tries < 3 && geolocate._watchState !== "OFF"; tries++) geolocate.trigger();
	};
	map.on("movestart", (event) => {
		if (ride && event.originalEvent && following) {
			following = false;
			draw();
		}
	});
	const followingTrain = () => {
		const current = step();
		return !!ride && following && current?.kind === "ride" && legAt(current.leg)?.type === "ride" && !!planOf(ride.train);
	};
	const yieldToOther = () => {
		if (!ride || !following || !otherFollow.active()) return false;
		following = false;
		draw();
		return true;
	};
	animFrame.push(() => {
		if (!ride || !following || yieldToOther()) return;
		if (!followingTrain() || map.isMoving()) return;
		const spot = trainLngLat(planOf(ride.train)), now = performance.now();
		if (!cam || now - camAt > 1e3) cam = {
			lng: spot.lng,
			lat: spot.lat
		};
		else {
			const share = 1 - Math.exp(-(now - camAt) / 1e3 / FOLLOW_EASE);
			cam = {
				lng: cam.lng + (spot.lng - cam.lng) * share,
				lat: cam.lat + (spot.lat - cam.lat) * share
			};
		}
		camAt = now;
		const key = `${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;
		if (key === camKey) return;
		camKey = key;
		map.jumpTo({
			center: cam,
			padding: pad()
		});
	});
	async function loadArrivals(index) {
		const leg = legAt(index);
		if (!ride || leg?.type !== "ride" || !leg.direction) return;
		const mine = ride;
		try {
			const answer = await (await fetch(serverUrl(`./api/live?arrivals=${encodeURIComponent(leg.from.replace(/\([^)]*\)/g, ""))}`), { cache: "no-store" })).json();
			if (ride !== mine || mine.steps[mine.at]?.kind !== "wait") return;
			const seqOf = (row) => row.trainNo ? planOf(`${leg.line}:${row.trainNo}`)?.seq.map((station) => station.id) ?? null : null;
			mine.arrivals = (answer.arrivals ?? []).filter((row) => arrivalFits(row, leg, seqOf(row), (id) => byId.get(id)?.name));
			mine.arrivalsFor = index;
			mine.arrivalsAt = Date.now();
			draw();
		} catch {}
	}
	const guessTrain = (index) => {
		const leg = legAt(index);
		return leg?.type === "ride" && leg.trainNo ? `${leg.line}:${leg.trainNo}` : null;
	};
	const arrivalSecs = () => ride?.arrivals?.filter((row) => !row.trainNo || !ride.missed.has(row.trainNo)).map((row) => ({
		row,
		s: arrivalRank(row)
	})).sort((first, second) => first.s - second.s) ?? null;
	const missedShown = () => !!ride?.arrivals?.some((row) => !!row.trainNo && ride.missed.has(row.trainNo));
	async function loadBusArrivals(index) {
		const leg = legAt(index), board = ride?.busBoard;
		if (!ride || leg?.type !== "bus" || !board?.arsId) return;
		const mine = ride, times = await bus.arrivals(board.arsId, board.routeId, board.routeName ?? null);
		const current = mine.steps[mine.at];
		if (ride !== mine || current?.kind !== "wait" || current.leg !== index || !times) return;
		mine.etas = times;
		mine.etasAt = Date.now();
		draw();
	}
	const busEtaSecs = (nowMs) => ride?.etas?.filter((at) => !ride.missedAt || at > ride.missedAt + BUS_MISS_MS).map((at) => Math.max(0, (at - nowMs) / 1e3)) ?? null;
	function walkFromS(index) {
		const leg = legAt(index), previous = legAt(index - 1);
		if (!ride || !leg) return 0;
		if (previous?.type === "ride" && leg.type === "ride") return transferS(previous, leg);
		if (previous?.type === "walk") return walkLeftS(ride.legs, index - 1, ride.leftM, measuredPace(ride.track) ?? legPace(ride.legs, index - 1));
		return leg.type === "ride" ? 90 : 0;
	}
	const waitWalkS = () => ride ? Math.max(0, ride.waitFrom.s - (Date.now() - ride.waitFrom.at) / 1e3) : 0;
	const startWait = (index, since = Date.now()) => {
		if (ride) ride.waitFrom = {
			s: walkFromS(index),
			at: since
		};
	};
	const startBusWait = (index) => {
		const leg = legAt(index);
		if (!ride || leg?.type !== "bus") return;
		Object.assign(ride, {
			busBoard: bus.board(leg),
			etas: null,
			etasAt: 0,
			car: null,
			missedAt: 0,
			ridden: null,
			busAt: 0
		});
		bus.watch(ride.busBoard?.routeId || null);
		loadBusArrivals(index);
	};
	function advance(waitSince) {
		if (!ride) return;
		const was = step(), boardedMs = ride.hold?.sinceMs ?? Date.now();
		if (was?.kind === "walk") walked(was.leg + 1, null);
		ride.at = Math.min(ride.steps.length - 1, ride.at + 1);
		ride.turn++;
		ride.nearSince = 0;
		ride.offFixes = 0;
		ride.detour = false;
		ride.zeroSince = 0;
		ride.picked = null;
		ride.pickedSaw = false;
		ride.due = null;
		ride.arrivalsAt = 0;
		ride.missed = /* @__PURE__ */ new Set();
		ride.stayed = 0;
		ride.backed = false;
		ride.hold = null;
		if (was?.kind === "ride") {
			ride.ridden = null;
			bus.ride(null, null, false);
			bus.watch(null);
		}
		const now = step();
		if (now.kind === "wait" && legAt(now.leg)?.type === "bus") startBusWait(now.leg);
		if (now.kind === "ride" && legAt(now.leg)?.type === "bus") ride.ridden = ride.car && ride.busBoard && bus.atStop(ride.car, ride.busBoard.stopId) ? ride.car : null;
		if (now.kind === "ride") ride.boardedMs = boardedMs;
		if (now.kind === "walk") {
			ride.track = [];
			ride.leftM = legAt(now.leg)?.metres ?? 0;
		}
		if (now.kind === "wait") startWait(now.leg, waitSince);
		if (now.kind === "wait" && legAt(now.leg)?.type === "ride") {
			ride.arrivals = null;
			ride.train = guessTrain(now.leg);
			loadArrivals(now.leg);
		}
		if (now.kind === "ride") {
			if (legAt(now.leg)?.type === "ride") {
				const plan = planOf(ride.train);
				if (plan && following) map.easeTo({
					center: [trainLngLat(plan).lng, trainLngLat(plan).lat],
					zoom: RIDE_ZOOM,
					padding: pad(),
					duration: 700
				});
			}
		}
		const spot = freshFix();
		if (following && spot && now.kind !== "ride" && now.kind !== "done") map.easeTo({
			center: [...spot],
			zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
			padding: pad(),
			duration: 600
		});
		if (now.kind === "done") {
			{
				const log = devLog();
				log?.judge("done", logInfo());
				log?.end("도착", logInfo());
			}
			clearInterval(timer);
			clearInterval(arrivalsTimer);
			clearInterval(busTimer);
			timer = arrivalsTimer = busTimer = 0;
			unlocate();
			const end = endSpot() ?? spot;
			if (end) map.easeTo({
				center: [...end],
				zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
				padding: pad(),
				duration: 800
			});
		}
		cam = null;
		draw();
	}
	function offTrack(spot) {
		const current = step(), leg = current?.kind === "walk" ? legAt(current.leg) : null;
		if (!ride || leg?.type !== "walk" || !leg.path || leg.path.length < 2) return;
		ride.offFixes = offFixes(ride.offFixes, onPath(spot, leg.path).off);
		if (!ride.offFixes) ride.detour = false;
		if (shouldReroute({
			offFixes: ride.offFixes,
			busy: ride.rerouting,
			nowMs: Date.now(),
			lastMs: ride.reroutedAt
		})) rerouteFrom(spot);
	}
	async function rerouteFrom(spot) {
		const mine = ride, at = mine.at, index = mine.steps[at].leg;
		mine.rerouting = true;
		const found = await reroute(spot, {
			arrives: mine.arrives,
			legs: mine.legs
		}, index).catch(() => null);
		mine.rerouting = false;
		mine.reroutedAt = Date.now();
		if (ride !== mine || mine.at !== at) return;
		if (!found || found.plan.legs.length !== mine.legs.length) {
			mine.detour = true;
			draw();
			return;
		}
		found.use();
		mine.turn++;
		const legs = found.plan.legs;
		Object.assign(mine, {
			legs,
			arrives: found.plan.arrives,
			steps: rideSteps(legs),
			nearSince: 0,
			offFixes: 0,
			detour: false,
			track: [],
			leftM: legs[index]?.metres ?? 0
		});
		cam = null;
		const now = freshFix();
		if (following && now) map.easeTo({
			center: [...now],
			zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
			padding: pad(),
			duration: 600
		});
		draw();
	}
	function leftWithoutMe(spot) {
		const current = step();
		if (!ride || current?.kind !== "ride") return;
		const leg = legAt(current.leg);
		if (leg?.type !== "ride") return;
		const plan = planOf(ride.train), { stationM, exitM } = boardingAway(spot, leg);
		ride.stayed = stayedFixes(ride.stayed, plan ? trackOf(plan) : null, leg.stations[1], nearBoarding({
			goalM: Infinity,
			stationM,
			exitM
		}));
		if (!leftBehind(ride.stayed)) return;
		const trainNo = ride.train.slice(leg.line.length + 1);
		ride.at--;
		ride.turn++;
		Object.assign(ride, {
			stayed: 0,
			backed: true,
			hold: null,
			nearSince: 0,
			zeroSince: 0,
			picked: null,
			pickedSaw: false,
			due: null,
			train: null,
			missed: /* @__PURE__ */ new Set([trainNo]),
			waitFrom: {
				s: 0,
				at: Date.now()
			}
		});
		loadArrivals(current.leg);
		cam = null;
		if (following) map.easeTo({
			center: [...spot],
			zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
			padding: pad(),
			duration: 600
		});
		draw();
	}
	function boardOrHold(leg, nowMs) {
		if (!ride) return;
		const plan = ride.picked && ride.picked === ride.train ? planOf(ride.train) : null;
		if (!plan || !byId.get(leg.stations[0])) {
			advance();
			return;
		}
		ride.hold = {
			id: plan.id,
			trainNo: plan.id.slice(leg.line.length + 1),
			sinceMs: nowMs,
			leftMs: 0,
			moved: 0
		};
		holdTick(leg, nowMs);
	}
	function heldTrack(leg, nowMs) {
		const hold = ride?.hold, plan = hold ? planOf(hold.id) : null;
		if (!hold || !plan) return null;
		const track = trackOf(plan);
		if (!hold.leftMs && leftStation(track, leg.stations[0])) hold.leftMs = nowMs;
		return {
			hold,
			plan,
			track
		};
	}
	function followHeld(spot) {
		const current = step(), leg = current?.kind === "wait" ? legAt(current.leg) : null;
		if (!ride?.hold || leg?.type !== "ride") return;
		const held = heldTrack(leg, Date.now()), { stationM, exitM } = boardingAway(spot, leg);
		if (!held?.hold.leftMs || stationM === null) return;
		const train = trainLngLat(held.plan);
		held.hold.moved = withTrainFixes(held.hold.moved, {
			stationM,
			exitM,
			trainM: metres(spot, [train.lng, train.lat])
		});
	}
	function holdTick(leg, nowMs) {
		if (!ride?.hold) return;
		const held = heldTrack(leg, nowMs), nextId = leg.stations[1];
		if (!held) {
			advance();
			return;
		}
		const { hold, track } = held;
		const outcome = holdOutcome({
			nowMs,
			sinceMs: hold.sinceMs,
			leftMs: hold.leftMs,
			lastFixMs: fix?.t ?? 0,
			moved: hold.moved,
			nextReached: nextId !== void 0 && (reached(track, nextId) || leftStation(track, nextId))
		});
		if (outcome === "board") {
			advance();
			return;
		}
		if (outcome === "missed") {
			ride.missed.add(hold.trainNo);
			Object.assign(ride, {
				hold: null,
				backed: true,
				picked: null,
				pickedSaw: false,
				due: null,
				zeroSince: 0,
				train: null
			});
		}
		draw();
	}
	function boardingAway(spot, next) {
		const stationId = next?.type === "ride" ? next.stations[0] : void 0, station = stationId === void 0 ? null : byId.get(stationId);
		if (stationId === void 0) return {
			stationM: null,
			exitM: null
		};
		return {
			stationM: station ? metres(spot, [station.lon, station.lat]) : null,
			exitM: nearestM(spot, exitsOf(stationId))
		};
	}
	function tick() {
		yieldToOther();
		const current = step();
		if (!ride || !current || current.kind === "done") return;
		const leg = legAt(current.leg), spot = freshFix(), nowMs = Date.now(), now = /* @__PURE__ */ new Date();
		if (current.kind === "walk") {
			const next = legAt(current.leg + 1), path = leg.type === "walk" ? leg.path ?? [] : [];
			if (!spot || path.length < 2) {
				if (fix && path.length >= 2) {
					const { stationM, exitM } = boardingAway(fix.spot, next);
					if (lostUnderground({
						nowMs,
						lastFixMs: fix.t,
						stationM,
						exitM
					})) {
						ride.leftM = 0;
						advance(fix.t);
						return;
					}
				}
				if (legOverByTime(ride.legs, current.leg, now, ride.arrives)) advance();
				else draw();
				return;
			}
			const where = onPath(spot, path);
			ride.leftM = Math.max(0, where.total - where.at);
			ride.track.push({
				t: nowMs,
				at: where.at
			});
			if (ride.track.length > 90) ride.track.shift();
			walked(current.leg, splitPath(path, where.at));
			const goalM = metres(spot, path[path.length - 1]), { stationM, exitM } = boardingAway(spot, next);
			if (nearBoarding({
				goalM,
				stationM,
				exitM
			})) {
				ride.nearSince ||= nowMs;
				if (nowMs - ride.nearSince >= 5e3) {
					ride.leftM = 0;
					advance();
					return;
				}
			} else ride.nearSince = 0;
			draw();
			return;
		}
		if (current.kind === "wait") {
			if (leg.type === "bus") {
				const board = ride.busBoard;
				if (board) {
					if (ride.car && bus.atStop(ride.car, board.stopId) !== true) ride.car = null;
					if (board.routeId) ride.car ??= bus.approach(board.routeId, board.stopId, ride.missed);
					const outcome = arriveOutcome(waitWalkS(), !!ride.car && bus.atStop(ride.car, board.stopId) === true);
					if (outcome === "board") {
						advance();
						return;
					}
					if (outcome === "missed" && ride.car) {
						ride.missed.add(ride.car);
						ride.car = null;
						ride.missedAt = nowMs;
						draw();
						return;
					}
				}
				const where = spot ? busAlong(spot, leg.path) : null;
				if (where ? where.off <= 60 && where.at > 100 : passedTime(leg.departs, now, 1)) {
					advance();
					return;
				}
				draw();
				return;
			}
			if (leg.type !== "ride") return;
			if (ride.hold) {
				holdTick(leg, nowMs);
				return;
			}
			const list = arrivalSecs(), walkS = waitWalkS(), fromId = leg.stations[0];
			const pickedPlan = ride.picked === ride.train ? planOf(ride.picked) : null;
			const pickedTrack = pickedPlan ? trackOf(pickedPlan) : null;
			if (pickedTrack?.seqIds.includes(fromId)) ride.pickedSaw = true;
			const trainLeft = pickedTrack ? pickedLeft(pickedTrack, fromId, ride.pickedSaw) : null;
			const listFresh = nowMs - ride.arrivalsAt < ARRIVALS_STALE_MS;
			const pickedDueS = listFresh && ride.due ? list?.find((item) => item.row.trainNo === ride.due.trainNo)?.s ?? null : null;
			const trainGone = !!ride.due && !!list && ride.due.atMs <= ride.arrivalsAt + ARRIVALS_MS && !list.some((item) => item.row.trainNo === ride.due.trainNo);
			const outcome = arriveOutcome(walkS, pickedIn(leg) || trainGone);
			if (outcome === "board") {
				boardOrHold(leg, nowMs);
				return;
			}
			if (outcome === "missed" && ride.due) {
				ride.missed.add(ride.due.trainNo);
				ride.picked = null;
				ride.pickedSaw = false;
				ride.due = null;
				ride.zeroSince = 0;
				ride.train = null;
				draw();
				return;
			}
			for (const trainNo of arrivedEarly((list ?? []).map((item) => item.row), walkS, leg.from)) ride.missed.add(trainNo);
			if (!ride.zeroSince && !trainGone) {
				const first = list?.find((item) => item.s >= walkS * HURRY_SHARE);
				if (first?.row.trainNo) {
					const id = `${leg.line}:${first.row.trainNo}`;
					if (id !== ride.picked) ride.pickedSaw = false;
					ride.train = ride.picked = id;
					ride.due = {
						trainNo: first.row.trainNo,
						atMs: nowMs + first.s * 1e3
					};
				}
				if (first && first.s <= 0) ride.zeroSince = nowMs;
			}
			const zeroPlan = ride.zeroSince ? planOf(ride.train) : null;
			if (boardNow({
				nowMs,
				zeroSinceMs: ride.zeroSince,
				trainLeft: trainLeft ?? (zeroPlan ? leftStation(trackOf(zeroPlan), fromId) : null),
				pickedDueS,
				trainGone,
				listLength: list?.length ?? 0,
				listFresh,
				departsPassed: walkS <= 0 && !ride.backed && passedTime(leg.departs, now, 1)
			})) {
				boardOrHold(leg, nowMs);
				return;
			}
			draw();
			return;
		}
		if (leg.type === "ride") {
			const plan = planOf(ride.train);
			const late = new Date(nowMs - BOARD_GIVE_UP_MS);
			if (rideOver(plan ? trackOf(plan) : null, leg.stations, legOverByTime(ride.legs, current.leg, now, ride.arrives), legOverByTime(ride.legs, current.leg, late, ride.arrives))) {
				advance();
				return;
			}
		} else if (leg.type === "bus") {
			bus.ride(ride.ridden, spot, true);
			const goal = leg.path[leg.path.length - 1];
			if (spot && goal && metres(spot, goal) <= 100) {
				ride.nearSince ||= nowMs;
				if (nowMs - ride.nearSince >= 5e3) {
					advance();
					return;
				}
			} else if (!spot && legOverByTime(ride.legs, current.leg, now, ride.arrives)) {
				advance();
				return;
			} else ride.nearSince = 0;
		}
		draw();
	}
	function busAlong(spot, path) {
		const where = onPathFrom(spot, path, ride.busAt);
		if (where.off <= 60) ride.busAt = where.at;
		return where;
	}
	const passedTime = (time, now, extraMin = 0) => {
		const [hours = 0, minutes = 0] = time.split(":").map(Number);
		return (now.getHours() * 60 + now.getMinutes() - hours * 60 - minutes - extraMin + 1440) % 1440 < 720;
	};
	function view() {
		const current = step();
		if (!ride || !current) return null;
		const character = characterOf(look()), base = {
			image: character.file,
			flip: character.flip,
			following,
			detour: false,
			say: null,
			goal: { at: endSpot() }
		};
		if (current.kind === "done") {
			const now = /* @__PURE__ */ new Date();
			return {
				...base,
				following: true,
				title: "슝 도착!",
				sub: doneSub(ride.toName, now, ride.startedMs),
				arrival: {
					...doneParts(ride.toName, now, ride.startedMs),
					at: endSpot()
				}
			};
		}
		const leg = legAt(current.leg);
		if (current.kind === "walk") {
			const pace = measuredPace(ride.track) ?? legPace(ride.legs, current.leg);
			return {
				...base,
				detour: ride.detour,
				title: walkTitle(ride.legs, current.leg, ride.toName),
				sub: walkSub(ride.legs, current.leg, ride.leftM, walkLeftS(ride.legs, current.leg, ride.leftM, pace))
			};
		}
		const transit = leg;
		if (current.kind === "wait") {
			if (transit.type === "bus") return {
				...base,
				title: waitTitle(transit),
				sub: waitText(ride.legs, current.leg, waitWalkS(), busEtaSecs(Date.now()), ride.turn, false, !!ride.missedAt).sub
			};
			const list = ride.arrivalsFor === current.leg ? arrivalSecs()?.map((item) => item.s) ?? null : null;
			const arrived = !!list && pickedIn(transit);
			return {
				...base,
				title: waitTitle(transit),
				...waitText(ride.legs, current.leg, waitWalkS(), list, ride.turn, arrived, missedShown())
			};
		}
		const { left, where } = rideProgress(transit);
		return {
			...base,
			title: rideTitle(transit),
			sub: rideSub(ride.legs, current.leg, left, where)
		};
	}
	function rideProgress(transit) {
		let left, where = null;
		if (!ride) return {
			left: transit.stops,
			where
		};
		if (transit.type === "ride") {
			const plan = planOf(ride.train), track = plan ? trackOf(plan) : null, stops = track ? rideStops(track, transit.stations) : null;
			const byStops = stops ? transit.stations.length - 1 - transit.stations.indexOf(stops.now) : null;
			left = (track && stopsLeft(track, transit.stations)) ?? byStops ?? stopsLeftByTime(transit, /* @__PURE__ */ new Date());
			const name = (id) => id == null ? null : byId.get(id)?.name ?? null, now = name(stops?.now ?? null);
			if (now) where = {
				now,
				next: name(stops?.next ?? null)
			};
		} else {
			const spot = freshFix(), along = spot ? busAlong(spot, transit.path) : null;
			left = along && along.total ? Math.max(1, Math.ceil(transit.stops * (1 - along.at / along.total))) : stopsLeftByTime(transit, /* @__PURE__ */ new Date());
			const at = spot ? busStopAt(transit, spot, along && along.total ? along.at / along.total : null) : null;
			if (at) where = {
				now: at.now ?? transit.from,
				next: at.next
			};
		}
		return {
			left,
			where
		};
	}
	function pushAlerts() {
		if (!alerts || !ride) return;
		const current = step(), nowMs = Date.now();
		if (!current || current.kind === "walk" || current.kind === "done") {
			alerts.update([], nowMs);
			return;
		}
		const leg = legAt(current.leg);
		let boardAtMs = null, leaveAtMs = null, left = null;
		if (current.kind === "wait") boardAtMs = boardAt(leg, nowMs);
		else {
			left = rideProgress(leg).left;
			const plan = leg.type === "ride" ? planOf(ride.train) : null, previous = leg.type === "ride" ? leg.stations.at(-2) : void 0;
			leaveAtMs = plan && previous !== void 0 && trainLeaves ? trainLeaves(plan, previous) : null;
		}
		alerts.update(rideAlerts({
			legs: ride.legs,
			index: current.leg,
			step: current.kind,
			nowMs,
			tries: ride.missed.size,
			boardAtMs,
			boardedMs: ride.boardedMs || null,
			leaveAtMs,
			stopsLeft: left
		}), nowMs);
	}
	function boardAt(leg, nowMs) {
		if (leg.type === "bus") return busBoardAt(nowMs);
		return ride?.due && ride.picked === ride.train ? ride.due.atMs : null;
	}
	function busBoardAt(nowMs) {
		const secs = busEtaSecs(nowMs), first = secs?.length ? catchable(secs, waitWalkS()).next[0] : void 0;
		return first === void 0 ? null : nowMs + first * 1e3;
	}
	function pickedIn(leg) {
		const due = ride?.due;
		if (!ride || !due || ride.picked !== ride.train) return false;
		const row = arrivalSecs()?.find((item) => item.row.trainNo === due.trainNo);
		const plan = planOf(ride.picked), listFresh = Date.now() - ride.arrivalsAt < ARRIVALS_STALE_MS;
		return pickedArrived({
			zeroSinceMs: ride.zeroSince,
			pickedDueS: listFresh && row ? row.s : null,
			track: plan ? trackOf(plan) : null,
			stationId: leg.stations[0]
		});
	}
	const actions = {
		close: () => {
			const arrived = step()?.kind === "done";
			stop();
			ended(arrived);
		},
		detour: () => {
			stop();
			detour();
		},
		answer: (value) => {
			devLog()?.answer(value, logInfo());
			draw();
		},
		follow: () => {
			otherFollow.stop();
			following = true;
			cam = null;
			camKey = "";
			draw();
			const current = step(), spot = freshFix();
			if (current?.kind === "ride" && legAt(current.leg)?.type === "ride") {
				const plan = planOf(ride.train);
				if (plan) {
					const at = trainLngLat(plan);
					map.easeTo({
						center: [at.lng, at.lat],
						zoom: Math.max(map.getZoom(), RIDE_ZOOM),
						padding: pad(),
						duration: 600
					});
				}
			} else if (spot) map.easeTo({
				center: [...spot],
				zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
				padding: pad(),
				duration: 600
			});
		}
	};
	function logInfo() {
		const current = step(), legs = ride?.legs ?? [];
		const index = current && current.kind !== "done" ? legs.findIndex((leg, at) => at >= current.leg && leg.type !== "walk") : -1;
		const leg = index >= 0 ? legs[index] : void 0;
		if (leg?.type === "bus") return {
			mode: "bus",
			routeId: ride?.busBoard?.routeId || null,
			routeName: leg.route,
			vehicle: ride?.ridden ?? ride?.car ?? null,
			station: leg.from
		};
		if (leg?.type === "ride") return {
			mode: "subway",
			line: leg.line,
			train: ride?.train?.split(":")[1] ?? leg.trainNo ?? null,
			station: leg.from
		};
		return { mode: "subway" };
	}
	function judgeState() {
		const current = step();
		if (!ride || !current) return "none";
		if (current.kind === "done") return "done";
		let detail = "";
		if (current.kind === "wait") detail = ride.hold ? ":hold" : ride.backed ? ":back" : ride.missed.size || ride.missedAt ? ":missed" : "";
		return `${current.kind}${detail}@${current.leg}`;
	}
	let painted = "";
	function draw() {
		pushAlerts();
		const log = ride ? devLog() : null;
		if (log?.recording) log.judge(judgeState(), logInfo());
		const next = view();
		if (next && log?.recording && step()?.kind !== "done") next.dev = { answered: log.answered };
		const key = JSON.stringify(next);
		if (key === painted) return;
		painted = key;
		drawRideCard(host, next, actions);
		document.body.classList.toggle("riding-along", !!next);
	}
	function begin(plan) {
		if (!ride) return;
		const legs = plan.legs;
		Object.assign(ride, {
			legs,
			arrives: plan.arrives,
			steps: rideSteps(legs),
			at: 0,
			nearSince: 0,
			offFixes: 0,
			detour: false,
			track: [],
			train: null,
			zeroSince: 0,
			arrivals: null,
			arrivalsFor: -1,
			picked: null,
			pickedSaw: false,
			due: null,
			arrivalsAt: 0,
			missed: /* @__PURE__ */ new Set(),
			stayed: 0,
			backed: false,
			hold: null,
			busBoard: null,
			etas: null,
			etasAt: 0,
			car: null,
			missedAt: 0,
			ridden: null,
			busAt: 0,
			boardedMs: 0,
			waitFrom: {
				s: 0,
				at: Date.now()
			},
			leftM: legs[0]?.metres ?? 0
		});
		const first = step();
		if (first.kind === "wait") startWait(first.leg);
		if (first.kind === "wait" && legs[first.leg]?.type === "ride") {
			ride.train = guessTrain(first.leg);
			loadArrivals(first.leg);
		}
		if (first.kind === "wait" && legs[first.leg]?.type === "bus") startBusWait(first.leg);
	}
	function start(plan, toName) {
		alerts?.ask();
		stop();
		ride = {
			legs: [],
			arrives: plan.arrives,
			toName,
			steps: [],
			at: 0,
			startedMs: Date.now(),
			turn: 0,
			nearSince: 0,
			offFixes: 0,
			rerouting: false,
			reroutedAt: 0,
			detour: false,
			track: [],
			train: null,
			zeroSince: 0,
			arrivals: null,
			arrivalsFor: -1,
			picked: null,
			pickedSaw: false,
			due: null,
			arrivalsAt: 0,
			missed: /* @__PURE__ */ new Set(),
			stayed: 0,
			backed: false,
			hold: null,
			busBoard: null,
			etas: null,
			etasAt: 0,
			car: null,
			missedAt: 0,
			ridden: null,
			busAt: 0,
			boardedMs: 0,
			waitFrom: {
				s: 0,
				at: Date.now()
			},
			leftM: 0
		};
		begin(plan);
		bus.routeOnly?.(true);
		const legs = ride.legs;
		following = true;
		cam = null;
		devLog()?.begin(logInfo());
		locate();
		draw();
		timer = setInterval(tick, TICK_MS);
		arrivalsTimer = setInterval(() => {
			const current = step();
			if (current?.kind === "wait") loadArrivals(current.leg);
		}, ARRIVALS_MS);
		busTimer = setInterval(() => {
			const current = step();
			if (current?.kind === "wait" && !document.hidden) loadBusArrivals(current.leg);
		}, BUS_ARRIVALS_MS);
		const walkPath = legs[0]?.type === "walk" ? legs[0].path : null, spot = freshFix() ?? walkPath?.[0];
		if (spot) map.easeTo({
			center: [...spot],
			zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
			padding: pad(),
			duration: 700
		});
	}
	function stop() {
		if (!ride) return;
		const log = devLog();
		if (log?.recording) log.end("그만둠", logInfo());
		clearInterval(timer);
		clearInterval(arrivalsTimer);
		clearInterval(busTimer);
		timer = arrivalsTimer = busTimer = 0;
		ride = null;
		painted = "";
		alerts?.clear();
		bus.ride(null, null, false);
		bus.watch(null);
		bus.routeOnly?.(false);
		walked(-1, null);
		unlocate();
		drawRideCard(host, null, actions);
		document.body.classList.remove("riding-along");
	}
	function tapTrain(plan) {
		const current = step();
		if (!ride || !current || current.kind === "walk" || current.kind === "done") return false;
		const leg = legAt(current.leg);
		if (leg?.type !== "ride" || !plan.id.startsWith(`${leg.line}:`)) return false;
		ride.train = plan.id;
		if (current.kind === "wait") advance();
		else {
			cam = null;
			draw();
		}
		return true;
	}
	const rideTrain = (plan) => !!ride && ride.train === plan.id;
	let lit = {
		legs: null,
		ids: /* @__PURE__ */ new Set()
	};
	const stationIds = () => {
		const legs = ride?.legs ?? null;
		if (lit.legs !== legs) lit = {
			legs,
			ids: new Set((legs ?? []).flatMap((leg) => leg.type === "ride" ? leg.stations.map(String) : []))
		};
		return lit.ids;
	};
	return {
		start,
		stop,
		tapTrain,
		rideTrain,
		get active() {
			return !!ride;
		},
		get followingTrain() {
			return followingTrain();
		},
		get stationIds() {
			return stationIds();
		}
	};
}
export { createRideAlong };
