var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isNumber = (value) => typeof value === "number" && Number.isFinite(value);
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
function createAppBridge({ facts, post = defaultPost, targets }) {
	let actions = null;
	const send = (message) => {
		try {
			post(JSON.stringify(message));
		} catch (error) {
			console.error("app bridge: 보내기 실패", error);
		}
	};
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
			if (command.type === "showRoute") actions.showRoute(command.plan, command.padding);
			else if (command.type === "clearRoute") actions.clearRoute();
			else if (command.type === "focusStation") actions.focusStation(command.id, command.zoom);
			else actions.setMode(command.mode);
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
		ready(nextActions, mode, modes) {
			actions = nextActions;
			send({
				type: "ready",
				version: 1,
				mode,
				modes
			});
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
		}
	};
}
export { createAppBridge, parseAppMessage, stationInfo, trainInfo };
