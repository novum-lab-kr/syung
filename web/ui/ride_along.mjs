import { serverUrl } from "../lib/server_url.mjs";
import { BOARD_GIVE_UP_MS, HURRY_SHARE, arrivalFits, arriveOutcome, arrivedEarly, boardNow, boardedPick, catchable, characterOf, doneParts, doneSub, gotOff, leftBehind, leftStation, legOverByTime, legPace, lostUnderground, measuredPace, metres, nearBoarding, nearestM, offFixes, offTrainFixes, onPath, onPathFrom, pickedArrived, pickedLeft, reached, rideAhead, rideAlerts, rideEndSpot, rideFixView, rideList, rideOver, rideShare, rideSteps, rideStops, rideSub, rideTalk, rideTitle, rideTrainSpots, shouldReroute, splitPath, stayedFixes, stopsLeft, stopsLeftByTime, transferS, waitText, waitTitle, walkLeftS, walkSub, walkTitle } from "../lib/ride-along.mjs";
// web/ui/ride_along.mts
var BUS_ARRIVALS_MS = 3e4;
var BUS_MISS_MS = 3e4;
var TICK_MS = 1e3;
var ARRIVALS_MS = 2e4;
var ARRIVALS_STALE_MS = ARRIVALS_MS * 3;
var FIX_FRESH_MS = 3e4;
var HIDDEN_TICK_MS = 5e3;
var FOLLOW_ZOOM = 16;
var RIDE_ZOOM = 15;
var FOLLOW_EASE = .25;
var EDGE_SHARE = .2;
function createRideAlong({ map, geolocate, planner, trainPose, trainLngLat, arrivalRank, byId, animFrame, drawRideCard, look, walked, ended, detour, reroute, otherFollow, exitsOf, busStopAt, bus, devLog = () => null, alerts = null, trainLeaves, gpsLowPower = () => {}, quietLabels = () => {}, infoScreen = () => {}, busStops = () => null, lineColor = () => void 0 }) {
	const host = document.createElement("div");
	host.className = "rg-host";
	document.body.append(host);
	let ride = null, timer = 0, arrivalsTimer = 0, busTimer = 0;
	let fix = null, following = true, turnedOn = false, cam = null, camAt = 0, camKey = "";
	const step = () => ride ? ride.steps[ride.at] : null;
	const legAt = (index) => ride?.legs[index];
	const freshFix = () => fix && Date.now() - fix.t < FIX_FRESH_MS ? fix.spot : null;
	let alight = {
		key: "",
		sawLeg: false,
		offFixes: 0,
		fewest: Infinity
	};
	const alightOf = () => {
		const key = ride ? `${ride.startedMs}:${ride.at}:${ride.train ?? ""}` : "";
		if (alight.key !== key) alight = {
			key,
			sawLeg: false,
			offFixes: 0,
			fewest: Infinity
		};
		return alight;
	};
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
	const lineTracks = (leg) => planner.plans.filter((plan) => plan.id.startsWith(`${leg.line}:`)).map((plan) => ({
		id: plan.id,
		track: trackOf(plan)
	}));
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
		const spot = [event.coords.longitude, event.coords.latitude], nowMs = Date.now();
		const repeat = !!fix && fix.spot[0] === spot[0] && fix.spot[1] === spot[1];
		fix = {
			spot,
			t: nowMs,
			newAt: repeat ? fix.newAt : nowMs
		};
		if (!ride) return;
		offTrack(fix.spot);
		if (!repeat) leftWithoutMe(fix.spot);
		if (!repeat) offTrain(fix.spot);
		tick();
		const current = step();
		if (following && current && current.kind !== "done" && !(current.kind === "ride" && legAt(current.leg)?.type === "ride") && !infoOn && nearEdge(fix.spot)) map.easeTo({
			center: [...fix.spot],
			zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
			padding: pad(),
			duration: 600
		});
	});
	function nearEdge(spot) {
		if (map.getZoom() < FOLLOW_ZOOM) return true;
		const { x, y } = map.project([spot[0], spot[1]]), box = map.getContainer(), width = box.clientWidth, height = box.clientHeight - pad().bottom;
		return x < width * EDGE_SHARE || x > width * (1 - EDGE_SHARE) || y < height * EDGE_SHARE || y > height * (1 - EDGE_SHARE);
	}
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
		return !!ride && following && !infoOn && !ride.choosing && current?.kind === "ride" && legAt(current.leg)?.type === "ride" && !!planOf(ride.train);
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
		labelMode();
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
		const was = step(), boardedMs = Date.now();
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
		ride.settled = false;
		ride.undo = null;
		ride.choosing = false;
		if (was?.kind === "ride") {
			ride.ridden = null;
			bus.ride(null, null, false);
			bus.watch(null);
		}
		const now = step();
		if (now.kind === "wait" && legAt(now.leg)?.type === "bus") startBusWait(now.leg);
		if (now.kind === "ride" && legAt(now.leg)?.type === "bus") ride.ridden = ride.car && ride.busBoard && bus.atStop(ride.car, ride.busBoard.stopId) ? ride.car : null;
		if (now.kind === "ride") ride.boardedMs = boardedMs;
		if (now.kind === "ride") {
			following = true;
			camKey = "";
		}
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
			stopTimers();
			unlocate();
			doneTimer = setTimeout(() => actions.close(), DONE_CLOSE_MS);
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
		const plan = planOf(ride.train), { stationM, exitM } = boardingAway(spot, leg), atBoarding = nearBoarding({
			goalM: Infinity,
			stationM,
			exitM
		});
		if (stationM !== null && !atBoarding) ride.settled = true;
		ride.stayed = stayedFixes(ride.stayed, plan ? trackOf(plan) : null, leg.stations[1], atBoarding);
		if (!leftBehind(ride.stayed)) return;
		backToWait(leg, current.leg, true);
	}
	const trainAway = (spot, train) => metres(spot, [train.lng, train.lat]);
	function offTrain(spot) {
		const current = step();
		if (!ride || current?.kind !== "ride") return;
		const leg = legAt(current.leg);
		if (leg?.type !== "ride") return;
		const toId = leg.stations[leg.stations.length - 1], station = toId === void 0 ? null : byId.get(toId), plan = planOf(ride.train);
		const state = alightOf();
		state.offFixes = offTrainFixes(state.offFixes, {
			stationM: station ? metres(spot, [station.lon, station.lat]) : null,
			exitM: toId === void 0 ? null : nearestM(spot, exitsOf(toId)),
			trainM: plan ? trainAway(spot, trainLngLat(plan)) : null
		});
	}
	function backToWait(leg, index, guessed) {
		if (!ride) return;
		const train = ride.train, trainNo = train ? train.slice(leg.line.length + 1) : null;
		ride.at--;
		ride.turn++;
		Object.assign(ride, {
			stayed: 0,
			backed: true,
			nearSince: 0,
			zeroSince: 0,
			picked: null,
			pickedSaw: false,
			due: null,
			train: null,
			missed: new Set(trainNo ? [trainNo] : []),
			waitFrom: {
				s: 0,
				at: Date.now()
			},
			settled: false,
			undo: guessed ? train : null,
			choosing: false
		});
		loadArrivals(index);
		cam = null;
		const spot = freshFix();
		if (following && spot) map.easeTo({
			center: [...spot],
			zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
			padding: pad(),
			duration: 600
		});
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
					ride.leftM = Math.min(ride.leftM, goalM, exitM ?? Infinity);
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
			const list = arrivalSecs(), walkS = waitWalkS(), fromId = leg.stations[0];
			const pickedPlan = ride.picked === ride.train ? planOf(ride.picked) : null;
			const pickedTrack = pickedPlan ? trackOf(pickedPlan) : null;
			if (pickedTrack?.seqIds.includes(fromId)) ride.pickedSaw = true;
			const trainLeft = pickedTrack ? pickedLeft(pickedTrack, fromId, ride.pickedSaw) : null;
			const listFresh = nowMs - ride.arrivalsAt < ARRIVALS_STALE_MS;
			const pickedDueS = listFresh && ride.due ? list?.find((item) => item.row.trainNo === ride.due.trainNo)?.s ?? null : null;
			const trainGone = !!ride.due && !!list && ride.due.atMs <= ride.arrivalsAt + ARRIVALS_MS && !list.some((item) => item.row.trainNo === ride.due.trainNo);
			const outcome = arriveOutcome(walkS, pickedIn(leg) || trainGone, 60);
			if (outcome === "board") {
				advance();
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
				advance();
				return;
			}
			draw();
			return;
		}
		if (leg.type === "ride") {
			const plan = planOf(ride.train), track = plan ? trackOf(plan) : null, state = alightOf();
			const late = new Date(nowMs - BOARD_GIVE_UP_MS);
			if (track?.seqIds.some((id) => leg.stations.includes(id))) state.sawLeg = true;
			if (gotOff(state.offFixes) || rideOver(track, leg.stations, legOverByTime(ride.legs, current.leg, now, ride.arrives), legOverByTime(ride.legs, current.leg, late, ride.arrives), state.sawLeg)) {
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
			say: null
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
				sub: walkSub(ride.leftM, walkLeftS(ride.legs, current.leg, ride.leftM, pace))
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
			const asked = rideFixView({
				step: "wait",
				undo: !!ride.undo,
				choosing: ride.choosing
			});
			const said = waitText(ride.legs, current.leg, waitWalkS(), list, ride.turn, arrived, missedShown());
			const card = {
				...base,
				title: asked.title ?? waitTitle(transit),
				say: asked.say ?? said.say,
				sub: said.sub,
				fix: asked.fix
			};
			const previous = legAt(current.leg - 1);
			const stops = previous?.type === "ride" ? rideList(ride.legs, current.leg - 1, {
				now: previous.to,
				next: null
			}, stopNames, legColor) : null;
			if (!stops || ride.choosing) return card;
			const rows = stops.rows.map((row, order) => order === stops.at && row.kind === "stop" ? {
				...row,
				off: false
			} : row);
			return {
				...card,
				info: {
					here: weatherSpot(),
					talk: null,
					list: {
						...stops,
						rows
					}
				}
			};
		}
		const { left, where } = rideProgress(transit);
		const trains = transit.type === "ride" ? {
			mine: ride.train,
			bus: false,
			others: rideTrainSpots(lineTracks(transit), transit.stations, ride.train).map((spot) => ({
				...spot,
				name: trainName(transit, spot.id)
			}))
		} : {
			mine: null,
			bus: true,
			others: []
		};
		const list = where && !ride.choosing ? rideList(ride.legs, current.leg, where, stopNames, legColor, trains) : null;
		const asked = transit.type === "ride" ? rideFixView({
			step: "ride",
			undo: false,
			choosing: ride.choosing,
			listed: !!list
		}) : null;
		const card = {
			...base,
			title: asked?.title ?? rideTitle(transit),
			sub: rideSub(ride.legs, current.leg, left, where),
			...asked ? { fix: asked.fix } : {}
		};
		if (!list) return card;
		const skyAt = alightSpot(transit);
		return {
			...card,
			info: {
				here: weatherSpot(),
				talk: rideTalk(ride.legs, current.leg, left),
				list,
				...skyAt ? { sky: {
					name: transit.to,
					at: skyAt
				} } : {}
			}
		};
	}
	const trainName = (leg, id) => {
		const dest = planOf(id)?.t?.destination;
		return dest ? `${leg.line} ${dest}행` : leg.line;
	};
	function stopNames(leg) {
		if (leg.type === "bus") return busStops(leg);
		const names = leg.stations.map((id) => byId.get(id)?.name);
		return names.every((name) => !!name) ? names : null;
	}
	const legColor = (leg) => (leg.type === "bus" ? leg.color : lineColor(leg.line)) ?? "#888";
	function alightSpot(transit) {
		if (transit.type === "bus") {
			const end = transit.path.at(-1);
			return end ? [end[0], end[1]] : null;
		}
		const last = transit.stations.at(-1), station = last === void 0 ? void 0 : byId.get(last);
		return station ? [station.lon, station.lat] : null;
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
			const state = alightOf();
			left = state.fewest = Math.min(state.fewest, left);
			const name = (id) => id == null ? null : byId.get(id)?.name ?? null, now = name(stops?.now ?? null);
			if (now) where = {
				now,
				next: name(stops?.next ?? null),
				ahead: !!track && !!stops && rideAhead(track, stops.now, stops.next),
				share: track && stops ? rideShare(track, stops.now, stops.next) : 0
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
	function fixRide(act) {
		const current = step(), leg = current && current.kind !== "walk" && current.kind !== "done" ? legAt(current.leg) : void 0;
		if (!ride || !current || leg?.type !== "ride") return;
		if (act === "other" || act === "stay") {
			ride.choosing = act === "other";
			cam = null;
			const spot = freshFix(), station = byId.get(leg.stations[0]), center = spot ?? (station ? [station.lon, station.lat] : null);
			if (ride.choosing && center) map.easeTo({
				center: [...center],
				zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
				padding: pad(),
				duration: 600
			});
			draw();
			return;
		}
		if (current.kind === "ride") {
			if (act === "missed") backToWait(leg, current.leg, false);
			return;
		}
		if (act === "undo" && ride.undo) {
			ride.missed.delete(ride.undo.slice(leg.line.length + 1));
			ride.train = ride.undo;
		} else if (act === "boarded") ride.train = boardedPick(lineTracks(leg), leg.stations) ?? ride.train;
		advance();
	}
	const actions = {
		close: () => {
			const arrived = step()?.kind === "done";
			stop();
			ended(arrived);
		},
		played: () => {
			if (!doneTimer || step()?.kind !== "done") return;
			clearTimeout(doneTimer);
			doneTimer = setTimeout(() => actions.close(), PLAYED_CLOSE_MS);
		},
		detour: () => {
			stop();
			detour();
		},
		answer: (value) => {
			devLog()?.answer(value, logInfo());
			draw();
		},
		fix: (act) => fixRide(act),
		pick: (id) => {
			tapTrain({ id });
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
		if (current.kind === "wait") detail = ride.backed ? ":back" : ride.missed.size || ride.missedAt ? ":missed" : "";
		return `${current.kind}${detail}@${current.leg}`;
	}
	let lowGps = false;
	function gpsMode() {
		const current = step(), leg = current?.kind === "ride" ? legAt(current.leg) : void 0;
		let want = false;
		if (ride && leg?.type === "ride") {
			const plan = planOf(ride.train), track = plan ? trackOf(plan) : null, nextId = leg.stations[1];
			const passedNext = !track || nextId === void 0 || reached(track, nextId) || leftStation(track, nextId);
			want = ride.settled || passedNext && !freshFix();
		}
		if (want === lowGps) return;
		lowGps = want;
		gpsLowPower(want);
	}
	let labelsQuiet = false;
	function labelMode() {
		const want = followingTrain();
		if (want === labelsQuiet) return;
		labelsQuiet = want;
		quietLabels(want);
	}
	let infoOn = false;
	function setInfo(on) {
		if (on === infoOn) return;
		infoOn = on;
		if (!on) cam = null;
		infoScreen(on);
		labelMode();
	}
	const weatherSpot = () => fix ? [Math.round(fix.spot[0] * 10) / 10, Math.round(fix.spot[1] * 10) / 10] : null;
	let painted = "";
	function draw() {
		const next = view();
		setInfo(!!next?.info);
		gpsMode();
		labelMode();
		pushAlerts();
		const log = ride ? devLog() : null;
		if (log?.recording) log.judge(judgeState(), logInfo());
		const kind = step()?.kind;
		if (next && log?.recording && log.developer && (kind === "wait" || kind === "ride")) next.dev = { answered: log.answered };
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
			busBoard: null,
			etas: null,
			etasAt: 0,
			car: null,
			missedAt: 0,
			ridden: null,
			busAt: 0,
			boardedMs: 0,
			settled: false,
			undo: null,
			choosing: false,
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
	let slowTick = false;
	function startTimers() {
		slowTick = false;
		timer = setInterval(tick, TICK_MS);
		arrivalsTimer = setInterval(() => {
			const current = step();
			if (current?.kind === "wait") loadArrivals(current.leg);
		}, ARRIVALS_MS);
		busTimer = setInterval(() => {
			const current = step();
			if (current?.kind === "wait") loadBusArrivals(current.leg);
		}, BUS_ARRIVALS_MS);
	}
	const DONE_CLOSE_MS = 15e3;
	const PLAYED_CLOSE_MS = 5e3;
	let doneTimer = 0;
	function stopTimers() {
		clearInterval(timer);
		clearInterval(arrivalsTimer);
		clearInterval(busTimer);
		timer = arrivalsTimer = busTimer = 0;
		slowTick = false;
	}
	document.addEventListener("visibilitychange", () => {
		if (!ride || step()?.kind === "done") return;
		if (document.hidden) {
			stopTimers();
			timer = setInterval(tick, HIDDEN_TICK_MS);
			slowTick = true;
			return;
		}
		if (timer && !slowTick) return;
		stopTimers();
		startTimers();
		tick();
		const current = step();
		if (current?.kind === "wait" && legAt(current.leg)?.type === "ride") loadArrivals(current.leg);
		if (current?.kind === "wait" && legAt(current.leg)?.type === "bus") loadBusArrivals(current.leg);
	});
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
			busBoard: null,
			etas: null,
			etasAt: 0,
			car: null,
			missedAt: 0,
			ridden: null,
			busAt: 0,
			boardedMs: 0,
			settled: false,
			undo: null,
			choosing: false,
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
		startTimers();
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
		stopTimers();
		clearTimeout(doneTimer);
		doneTimer = 0;
		ride = null;
		painted = "";
		setInfo(false);
		gpsMode();
		labelMode();
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
		ride.choosing = false;
		if (current.kind === "wait") {
			advance();
			return true;
		}
		following = true;
		cam = null;
		camKey = "";
		const chosen = planOf(plan.id);
		if (chosen) {
			const at = trainLngLat(chosen);
			map.easeTo({
				center: [at.lng, at.lat],
				zoom: Math.max(map.getZoom(), RIDE_ZOOM),
				padding: pad(),
				duration: 600
			});
		}
		draw();
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
	const devPlay = () => {
		const current = step();
		return ride && current ? {
			legs: ride.legs,
			step: current,
			train: ride.train
		} : null;
	};
	return {
		start,
		stop,
		tapTrain,
		rideTrain,
		devPlay,
		get active() {
			return !!ride;
		},
		get followingTrain() {
			return followingTrain();
		},
		get infoScreen() {
			return infoOn;
		},
		get stationIds() {
			return stationIds();
		}
	};
}
export { createRideAlong };
