import { serverUrl } from "../lib/server_url.mjs";
import { BOARD_GIVE_UP_MS, HURRY_SHARE, arrivalFits, boardNow, characterOf, doneSub, leftStation, legOverByTime, legPace, measuredPace, metres, onPath, pickedLeft, rideOver, rideSteps, rideSub, rideTitle, splitPath, stopsLeft, stopsLeftByTime, transferS, waitText, waitTitle, walkLeftS, walkSub, walkTitle } from "../lib/ride-along.mjs";
// web/ui/ride_along.mts
var TICK_MS = 1e3;
var ARRIVALS_MS = 2e4;
var ARRIVALS_STALE_MS = ARRIVALS_MS * 3;
var FIX_FRESH_MS = 3e4;
var FOLLOW_ZOOM = 16;
var RIDE_ZOOM = 15;
var FOLLOW_EASE = .25;
function createRideAlong({ map, geolocate, planner, trainPose, trainLngLat, arrivalRank, byId, animFrame, drawRideCard, look, walked, ended, detour }) {
	const host = document.createElement("div");
	host.className = "rg-host";
	document.body.append(host);
	let ride = null, timer = 0, arrivalsTimer = 0;
	let fix = null, following = true, turnedOn = false, cam = null, camAt = 0;
	const step = () => ride ? ride.steps[ride.at] : null;
	const legAt = (index) => ride?.legs[index];
	const freshFix = () => fix && Date.now() - fix.t < FIX_FRESH_MS ? fix.spot : null;
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
		if (event.coords.accuracy > 100) return;
		fix = {
			spot: [event.coords.longitude, event.coords.latitude],
			t: Date.now()
		};
		if (!ride) return;
		tick();
		const current = step();
		if (following && current && !(current.kind === "ride" && legAt(current.leg)?.type === "ride")) map.easeTo({
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
	animFrame.push(() => {
		const current = step();
		if (!ride || !following || current?.kind !== "ride" || legAt(current.leg)?.type !== "ride" || map.isMoving()) return;
		const plan = planOf(ride.train);
		if (!plan) return;
		const spot = trainLngLat(plan), now = performance.now();
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
	const arrivalSecs = () => ride?.arrivals?.map((row) => ({
		row,
		s: arrivalRank(row)
	})).sort((first, second) => first.s - second.s) ?? null;
	function walkFromS(index) {
		const leg = legAt(index), previous = legAt(index - 1);
		if (!ride || !leg) return 0;
		if (previous?.type === "ride" && leg.type === "ride") return transferS(previous, leg);
		if (previous?.type === "walk") return walkLeftS(ride.legs, index - 1, ride.leftM, measuredPace(ride.track) ?? legPace(ride.legs, index - 1));
		return leg.type === "ride" ? 90 : 0;
	}
	const waitWalkS = () => ride ? Math.max(0, ride.waitFrom.s - (Date.now() - ride.waitFrom.at) / 1e3) : 0;
	const startWait = (index) => {
		if (ride) ride.waitFrom = {
			s: walkFromS(index),
			at: Date.now()
		};
	};
	function advance() {
		if (!ride) return;
		const was = step();
		if (was?.kind === "walk") walked(was.leg + 1, null);
		ride.at = Math.min(ride.steps.length - 1, ride.at + 1);
		ride.turn++;
		ride.nearSince = 0;
		ride.offSince = 0;
		ride.detour = false;
		ride.zeroSince = 0;
		ride.picked = null;
		ride.pickedSaw = false;
		ride.due = null;
		ride.arrivalsAt = 0;
		const now = step();
		if (now.kind === "walk") {
			ride.track = [];
			ride.leftM = legAt(now.leg)?.metres ?? 0;
		}
		if (now.kind === "wait") startWait(now.leg);
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
		if (following && spot && now.kind !== "ride") map.easeTo({
			center: [...spot],
			zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
			padding: pad(),
			duration: 600
		});
		if (now.kind === "done") {
			clearInterval(timer);
			clearInterval(arrivalsTimer);
			timer = arrivalsTimer = 0;
			unlocate();
		}
		cam = null;
		draw();
	}
	function tick() {
		const current = step();
		if (!ride || !current || current.kind === "done") return;
		const leg = legAt(current.leg), spot = freshFix(), nowMs = Date.now(), now = /* @__PURE__ */ new Date();
		if (current.kind === "walk") {
			const next = legAt(current.leg + 1), path = leg.type === "walk" ? leg.path ?? [] : [];
			if (!spot || path.length < 2) {
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
			if (where.off > 60) {
				ride.offSince ||= nowMs;
				if (nowMs - ride.offSince >= 1e4) ride.detour = true;
			} else {
				ride.offSince = 0;
				ride.detour = false;
			}
			const goal = path[path.length - 1], station = next?.type === "ride" ? byId.get(next.stations[0]) : null;
			if (metres(spot, goal) <= 100 || station && metres(spot, [station.lon, station.lat]) <= 100) {
				ride.nearSince ||= nowMs;
				if (nowMs - ride.nearSince >= 5e3) {
					advance();
					return;
				}
			} else ride.nearSince = 0;
			draw();
			return;
		}
		if (current.kind === "wait") {
			if (leg.type === "bus") {
				const where = spot ? onPath(spot, leg.path) : null;
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
			const trainGone = !!ride.due && !!list && ride.due.atMs <= ride.arrivalsAt + ARRIVALS_MS && !list.some((item) => item.row.trainNo === ride.due.trainNo);
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
				trainGone,
				listLength: list?.length ?? 0,
				listFresh: nowMs - ride.arrivalsAt < ARRIVALS_STALE_MS,
				departsPassed: passedTime(leg.departs, now, 1)
			})) {
				advance();
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
		if (current.kind === "done") return {
			...base,
			following: true,
			title: "슝 도착!",
			sub: doneSub(ride.toName, /* @__PURE__ */ new Date(), ride.startedMs)
		};
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
			const list = transit.type === "ride" && ride.arrivalsFor === current.leg ? arrivalSecs()?.map((item) => item.s) ?? null : null;
			return {
				...base,
				title: waitTitle(transit),
				...waitText(ride.legs, current.leg, waitWalkS(), list, ride.turn)
			};
		}
		let left;
		if (transit.type === "ride") {
			const plan = planOf(ride.train);
			left = (plan && stopsLeft(trackOf(plan), transit.stations)) ?? stopsLeftByTime(transit, /* @__PURE__ */ new Date());
		} else {
			const spot = freshFix(), where = spot ? onPath(spot, transit.path) : null;
			left = where && where.total ? Math.max(1, Math.ceil(transit.stops * (1 - where.at / where.total))) : stopsLeftByTime(transit, /* @__PURE__ */ new Date());
		}
		return {
			...base,
			title: rideTitle(transit),
			sub: rideSub(ride.legs, current.leg, left)
		};
	}
	const actions = {
		close: () => {
			stop();
			ended();
		},
		detour: () => {
			stop();
			detour();
		},
		follow: () => {
			following = true;
			cam = null;
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
	let painted = "";
	function draw() {
		const next = view(), key = JSON.stringify(next);
		if (key === painted) return;
		painted = key;
		drawRideCard(host, next, actions);
		document.body.classList.toggle("riding-along", !!next);
	}
	function start(plan, toName) {
		stop();
		const legs = plan.legs;
		ride = {
			legs,
			arrives: plan.arrives,
			toName,
			steps: rideSteps(legs),
			at: 0,
			startedMs: Date.now(),
			turn: 0,
			nearSince: 0,
			offSince: 0,
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
			waitFrom: {
				s: 0,
				at: Date.now()
			},
			leftM: legs[0]?.metres ?? 0
		};
		const first = step();
		if (first.kind === "wait") startWait(first.leg);
		if (first.kind === "wait" && legs[first.leg]?.type === "ride") {
			ride.train = guessTrain(first.leg);
			loadArrivals(first.leg);
		}
		following = true;
		cam = null;
		locate();
		draw();
		timer = setInterval(tick, TICK_MS);
		arrivalsTimer = setInterval(() => {
			const current = step();
			if (current?.kind === "wait") loadArrivals(current.leg);
		}, ARRIVALS_MS);
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
		clearInterval(timer);
		clearInterval(arrivalsTimer);
		timer = arrivalsTimer = 0;
		ride = null;
		painted = "";
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
	return {
		start,
		stop,
		tapTrain,
		rideTrain,
		get active() {
			return !!ride;
		}
	};
}
export { createRideAlong };
