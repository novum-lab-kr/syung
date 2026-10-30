var appNoticeLift = (sheet, route) => Math.max(sheet ? sheet + 8 : 0, route);
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isNumber = (value) => typeof value === "number" && Number.isFinite(value);
var isId = (value) => typeof value === "string" && value.length > 0;
var isCount = (value) => isNumber(value) && Number.isInteger(value) && value >= 1;
var isSeat = (value) => isRecord(value) && isCount(value.car) && isCount(value.row) && (value.side === -1 || value.side === 1);
var COASTER_SPEEDS = [
	1,
	5,
	20
];
var isPosition = (value) => Array.isArray(value) && value.length >= 2 && isNumber(value[0]) && value[0] >= -180 && value[0] <= 180 && isNumber(value[1]) && value[1] >= -90 && value[1] <= 90;
var isPath = (value) => Array.isArray(value) && value.length >= 2 && value.every(isPosition);
function stationInfo(station) {
	return {
		id: station.id,
		name: station.name,
		lines: station.lines.map((line) => line.name),
		lat: station.lat,
		lon: station.lon
	};
}
function trainInfo(plan) {
	const train = plan.t;
	return {
		id: plan.id,
		line: String(train.line),
		trainNo: String(train.trainNo),
		station: String(train.station ?? ""),
		destination: String(train.destination ?? ""),
		direction: String(train.direction ?? ""),
		status: String(train.status ?? ""),
		express: !!train.express,
		last: !!train.last,
		receivedAt: train.receivedAt ?? null
	};
}
function legProblem(leg, index, facts) {
	if (!isRecord(leg)) return `plan.legs[${index}] 가 객체가 아니다`;
	const pathProblem = `plan.legs[${index}].path 는 [경도, 위도](경도 -180~180 · 위도 -90~90) 둘 이상`;
	if (leg.type === "walk" || leg.type === "bus") return isPath(leg.path) ? null : pathProblem;
	if (leg.type !== "ride") return `plan.legs[${index}].type 은 walk · ride · bus`;
	if (typeof leg.line !== "string" || !facts.hasLine(leg.line)) return `plan.legs[${index}].line 이 지도에 없는 노선`;
	if (leg.path !== void 0 && !isPath(leg.path)) return pathProblem;
	const stations = leg.stations;
	if (!Array.isArray(stations) || stations.length < 2) return `plan.legs[${index}].stations 는 역 id 둘 이상`;
	for (const id of stations) if (!isNumber(id) || !facts.hasStation(id)) return `plan.legs[${index}].stations 에 지도에 없는 역 id`;
	return null;
}
function parseAppMessage(raw, facts) {
	let data = raw;
	if (typeof raw === "string") try {
		data = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(data) || typeof data.type !== "string") return null;
	const type = data.type, bad = (message) => ({
		ok: false,
		code: "bad_field",
		message,
		request: type
	});
	switch (type) {
		case "showRoute": {
			const plan = data.plan;
			if (!isRecord(plan) || !Array.isArray(plan.legs) || !plan.legs.length) return bad("plan.legs 는 구간 하나 이상(/api/route 응답 plans[] 한 개 그대로)");
			for (const [index, leg] of plan.legs.entries()) {
				const problem = legProblem(leg, index, facts);
				if (problem) return bad(problem);
			}
			const padding = {}, pad = data.padding;
			if (pad !== void 0) {
				if (!isRecord(pad)) return bad("padding 은 { bottom, right }(화면 px)");
				for (const side of ["bottom", "right"]) {
					const value = pad[side];
					if (value === void 0) continue;
					if (!isNumber(value) || value < 0) return bad(`padding.${side} 는 0 이상의 수(화면 px)`);
					padding[side] = value;
				}
			}
			return {
				ok: true,
				command: {
					type,
					plan: {
						...plan,
						legs: plan.legs
					},
					padding
				}
			};
		}
		case "clearRoute": return {
			ok: true,
			command: { type }
		};
		case "focusStation":
			if (!isNumber(data.id) || !facts.hasStation(data.id)) return bad("id 는 지도에 있는 역 id(stationTap 의 station.id)");
			if (data.zoom !== void 0 && (!isNumber(data.zoom) || data.zoom < 7 || data.zoom > 20)) return bad("zoom 은 7~20");
			return {
				ok: true,
				command: {
					type,
					id: data.id,
					zoom: isNumber(data.zoom) ? data.zoom : null
				}
			};
		case "setMode":
			if (typeof data.mode !== "string" || !facts.hasMode(data.mode)) return bad("mode 는 ready 의 modes 중 하나");
			return {
				ok: true,
				command: {
					type,
					mode: data.mode
				}
			};
		case "setTheme":
			if (data.choice !== "auto" && data.choice !== "light" && data.choice !== "dark") return bad("choice 는 auto · light · dark");
			return {
				ok: true,
				command: {
					type,
					choice: data.choice
				}
			};
		case "setPadding":
			if (!isNumber(data.bottom) || data.bottom < 0) return bad("bottom 은 0 이상의 수(화면 px)");
			return {
				ok: true,
				command: {
					type,
					bottom: data.bottom
				}
			};
		case "watchTrain":
		case "followTrain":
			if (!isId(data.id)) return bad("id 는 trainTap 의 train.id");
			return {
				ok: true,
				command: {
					type,
					id: data.id
				}
			};
		case "followBus":
			if (!isId(data.id)) return bad("id 는 busTap 의 selection.id(kind bus)");
			return {
				ok: true,
				command: {
					type,
					id: data.id
				}
			};
		case "unwatchTrain":
		case "stopFollow":
		case "stopRide":
		case "closeBus":
		case "busRefresh": return {
			ok: true,
			command: { type }
		};
		case "startRide":
			if (!isId(data.id)) return bad("id 는 trainTap 의 train.id");
			if (!isSeat(data.seat)) return bad("seat 는 { car, row (1 이상 정수), side (-1 · 1) }");
			return {
				ok: true,
				command: {
					type,
					id: data.id,
					seat: {
						car: data.seat.car,
						row: data.seat.row,
						side: data.seat.side
					}
				}
			};
		case "setPref":
			if (data.key === "prebuild" || data.key === "saver") {
				if (typeof data.value !== "boolean") return bad(`${data.key} 의 value 는 참 · 거짓`);
				return {
					ok: true,
					command: {
						type,
						key: data.key,
						value: data.value
					}
				};
			}
			if (data.key === "speed") {
				if (!isNumber(data.value) || !COASTER_SPEEDS.includes(data.value)) return bad("speed 의 value 는 1 · 5 · 20");
				return {
					ok: true,
					command: {
						type,
						key: data.key,
						value: data.value
					}
				};
			}
			return bad("key 는 prebuild · saver · speed");
		case "skyOpen":
			if (typeof data.open !== "boolean") return bad("open 은 참 · 거짓");
			return {
				ok: true,
				command: {
					type,
					open: data.open
				}
			};
		case "busRoute":
			if (!isId(data.routeId)) return bad("routeId 는 busTap view 의 routeId");
			return {
				ok: true,
				command: {
					type,
					routeId: data.routeId
				}
			};
		case "busStopView":
			if (data.what !== "follow" && data.what !== "route" && data.what !== "stop") return bad("what 은 follow · route · stop");
			return {
				ok: true,
				command: {
					type,
					what: data.what
				}
			};
		default: return {
			ok: false,
			code: "unknown_type",
			message: `모르는 type: ${type}`,
			request: type
		};
	}
}
var defaultPost = (text) => {
	globalThis.window?.ReactNativeWebView?.postMessage(text);
};
function need(action, type) {
	if (!action) throw new Error(`이 지도는 ${type} 를 못 한다`);
	return action;
}
function run(actions, command) {
	switch (command.type) {
		case "showRoute":
			actions.showRoute(command.plan, command.padding);
			return;
		case "clearRoute":
			actions.clearRoute();
			return;
		case "focusStation":
			actions.focusStation(command.id, command.zoom);
			return;
		case "setMode":
			actions.setMode(command.mode);
			return;
		case "setTheme":
			need(actions.setTheme, command.type).call(actions, command.choice);
			return;
		case "setPadding":
			need(actions.setPadding, command.type).call(actions, command.bottom);
			return;
		case "watchTrain":
			need(actions.watchTrain, command.type).call(actions, command.id);
			return;
		case "followTrain":
			need(actions.followTrain, command.type).call(actions, command.id);
			return;
		case "followBus":
			need(actions.followBus, command.type).call(actions, command.id);
			return;
		case "unwatchTrain":
			need(actions.unwatchTrain, command.type).call(actions);
			return;
		case "stopFollow":
			need(actions.stopFollow, command.type).call(actions);
			return;
		case "stopRide":
			need(actions.stopRide, command.type).call(actions);
			return;
		case "closeBus":
			need(actions.closeBus, command.type).call(actions);
			return;
		case "busRefresh":
			need(actions.busRefresh, command.type).call(actions);
			return;
		case "startRide":
			need(actions.startRide, command.type).call(actions, command.id, command.seat);
			return;
		case "setPref":
			need(actions.setPref, command.type).call(actions, command.key, command.value);
			return;
		case "skyOpen":
			need(actions.skyOpen, command.type).call(actions, command.open);
			return;
		case "busRoute":
			need(actions.busRoute, command.type).call(actions, command.routeId);
			return;
		case "busStopView": need(actions.busStopView, command.type).call(actions, command.what);
	}
}
function createAppBridge({ facts, post = defaultPost, targets }) {
	let actions = null, busOpen = false;
	const send = (message) => {
		try {
			post(JSON.stringify(message));
		} catch (error) {
			console.error("app bridge: 보내기 실패", error);
		}
	};
	const lastSent = /* @__PURE__ */ new Map(), waiting = /* @__PURE__ */ new Map();
	function state(message) {
		if (!actions) {
			waiting.set(message.type, message);
			return;
		}
		const text = JSON.stringify(message);
		if (lastSent.get(message.type) === text) return;
		lastSent.set(message.type, text);
		try {
			post(text);
		} catch (error) {
			console.error("app bridge: 보내기 실패", error);
		}
	}
	let statusNext = null, statusAt = 0, statusTimer = null;
	function flushStatus() {
		statusTimer = null;
		if (!statusNext) return;
		statusAt = Date.now();
		state({
			type: "status",
			...statusNext
		});
		statusNext = null;
	}
	function receive(raw) {
		const parsed = parseAppMessage(raw, facts);
		if (!parsed) return;
		if (!parsed.ok) {
			send({
				type: "error",
				code: parsed.code,
				message: parsed.message,
				...parsed.request ? { request: parsed.request } : {}
			});
			return;
		}
		const command = parsed.command;
		if (!actions) {
			send({
				type: "error",
				code: "not_ready",
				message: "지도를 준비하는 중 — ready 를 받은 뒤 보낸다",
				request: command.type
			});
			return;
		}
		try {
			run(actions, command);
		} catch (error) {
			console.error("app bridge: 명령 실패", command.type, error);
			send({
				type: "error",
				code: "failed",
				message: String(error?.message ?? error),
				request: command.type
			});
		}
	}
	if (targets) for (const target of [targets.window, targets.document]) target.addEventListener("message", (event) => {
		if (event.target === target) receive(event.data);
	});
	return {
		receive,
		ready(nextActions, info) {
			actions = nextActions;
			send({
				type: "ready",
				version: 2,
				...info
			});
			lastSent.set("themeChanged", JSON.stringify({
				type: "themeChanged",
				...info.theme
			}));
			lastSent.set("prefsChanged", JSON.stringify({
				type: "prefsChanged",
				prefs: info.prefs
			}));
			for (const type of [
				"sky",
				"status",
				"followChanged",
				"rideChanged"
			]) {
				const message = waiting.get(type);
				if (message) state(message);
			}
			waiting.clear();
		},
		stationTap(station) {
			send({
				type: "stationTap",
				station: stationInfo(station)
			});
		},
		trainTap(plan) {
			send({
				type: "trainTap",
				train: trainInfo(plan)
			});
		},
		modeChanged(mode) {
			send({
				type: "modeChanged",
				mode
			});
		},
		themeChanged(theme) {
			state({
				type: "themeChanged",
				...theme
			});
		},
		prefsChanged(prefs) {
			state({
				type: "prefsChanged",
				prefs
			});
		},
		sky(sky) {
			state({
				type: "sky",
				...sky
			});
		},
		status(next) {
			statusNext = next;
			if (statusTimer) return;
			const wait = 250 - (Date.now() - statusAt);
			if (wait <= 0) flushStatus();
			else statusTimer = setTimeout(flushStatus, wait);
		},
		trainUpdate(update) {
			if (actions) send({
				type: "trainUpdate",
				...update
			});
		},
		trainGone(id) {
			if (actions) send({
				type: "trainGone",
				id
			});
		},
		followChanged(id) {
			state({
				type: "followChanged",
				id
			});
		},
		rideChanged(ride) {
			state({
				type: "rideChanged",
				...ride
			});
		},
		busTap(view, selection) {
			if (!actions) return;
			busOpen = true;
			const message = {
				type: "busTap",
				view,
				selection
			};
			lastSent.set("busUpdate", JSON.stringify({
				...message,
				type: "busUpdate"
			}));
			send(message);
		},
		busUpdate(view, selection) {
			if (busOpen) state({
				type: "busUpdate",
				view,
				selection
			});
		},
		busClosed() {
			if (!busOpen) return;
			busOpen = false;
			lastSent.delete("busUpdate");
			send({ type: "busClosed" });
		}
	};
}
export { COASTER_SPEEDS, appNoticeLift, createAppBridge, parseAppMessage, stationInfo, trainInfo };
