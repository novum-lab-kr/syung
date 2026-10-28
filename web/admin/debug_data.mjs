// web/admin/debug_data.mts
var fmt = (time) => new Date(time).toLocaleTimeString("ko-KR", {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false
});
function elapsed(ms) {
	const seconds = Math.floor(ms / 1e3);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function lineGraph(edgeKeys) {
	const neighbors = /* @__PURE__ */ new Map(), lines = /* @__PURE__ */ new Set();
	for (const key of edgeKeys) {
		const [line = "", from = "", to = ""] = key.split(":");
		lines.add(line);
		for (const [here, there] of [[from, to], [to, from]]) {
			const near = `${line}:${here}`;
			if (!neighbors.has(near)) neighbors.set(near, []);
			if (!neighbors.get(near).includes(+there)) neighbors.get(near).push(+there);
		}
	}
	return {
		neighbors,
		lines: [...lines].sort((left, right) => (parseInt(left) || 99) - (parseInt(right) || 99) || left.localeCompare(right, "ko"))
	};
}
var lineStations = (stations, neighbors, line) => [...stations.values()].filter((station) => neighbors.has(`${line}:${station.id}`)).sort((left, right) => left.name.localeCompare(right.name, "ko"));
function nearest(list, lat, lng) {
	const far = (station) => (station.lat - lat) ** 2 + ((station.lon - lng) * Math.cos(lat * Math.PI / 180)) ** 2;
	return [...list].sort((left, right) => far(left) - far(right))[0];
}
function batchSize(queue) {
	let size = 0, moves = 0;
	for (const event of queue) {
		if (size >= 500 || event.kind === "motion" && ++moves > 40) break;
		size++;
	}
	return size;
}
var closeCell = (cell) => [cell.slot, ...cell.sum.map((total, index) => cell.n[index] ? Math.round(total / cell.n[index] * 100) / 100 : null)];
function motionChunks(bins, base) {
	const chunks = [];
	for (let index = 0; index < bins.length; index += 140) chunks.push(bins.slice(index, index + 140).flatMap(([slot, ...values]) => [slot - base, ...values]));
	return chunks;
}
function ridingView(ride, stations, neighbors, nextPick) {
	if (ride.mode === "subway") {
		const path = ride.path, at = path.at(-1), here = stations.get(at);
		const options = (neighbors.get(`${ride.line}:${at}`) || []).filter((id) => id !== path.at(-2));
		const pick = nextPick != null && options.includes(nextPick) ? nextPick : options[0] ?? null;
		const next = pick == null ? void 0 : stations.get(pick);
		return {
			nextPick: pick,
			what: `${ride.line}${ride.train ? ` · ${ride.train}열차` : ""}`,
			where: ride.moving ? `→ ${next?.name || "?"}` : here?.name || "?",
			phase: ride.moving ? `${here?.name || ""} 출발함 · 역에 서면 누르세요` : "역에 서 있음 · 문 닫고 출발하면 누르세요",
			nextsHidden: !ride.moving || options.length < 2,
			nexts: options.map((id) => ({
				id,
				name: stations.get(id)?.name,
				pressed: id === pick
			})),
			act: ride.moving ? `${next?.name || "다음 역"} 도착` : "출발"
		};
	}
	return {
		nextPick,
		what: `${ride.routeName}번${ride.vehicle ? ` · ${ride.vehicle}` : ""}`,
		where: ride.moving ? "달리는 중" : "정류장에 섬",
		phase: `정류장 ${ride.stops || 0}곳 · GPS 는 5초마다 저절로`,
		nextsHidden: true,
		nexts: [],
		act: ride.moving ? "정류장 도착" : "출발"
	};
}
var busLabel = (route) => `${route.name}${route.start ? ` · ${route.start}→${route.end}` : ""}`;
function compareRows(ride) {
	const used = /* @__PURE__ */ new Set(), rows = [], sensor = ride.sensor || [];
	const sec = (value) => `${value > 0 ? "+" : ""}${value}초`;
	let stop = 0;
	for (const tap of ride.taps || []) {
		let best = null;
		sensor.forEach((event, index) => {
			if (!used.has(index) && event.kind === tap.kind && Math.abs(event.t - tap.t) <= 9e4 && (best == null || Math.abs(event.t - tap.t) < Math.abs(sensor[best].t - tap.t))) best = index;
		});
		if (best != null) used.add(best);
		if (tap.kind === "arrive") stop++;
		let where = tap.station || "";
		if (!tap.station && ride.mode === "bus") where = tap.kind === "depart" && !stop ? "처음" : `정류장 ${stop}`;
		rows.push({
			t: tap.t,
			where,
			kind: tap.kind,
			tap: tap.t,
			sensor: best != null ? sensor[best].t : null
		});
	}
	sensor.forEach((event, index) => {
		if (!used.has(index)) rows.push({
			t: event.t,
			where: "(센서만)",
			kind: event.kind,
			tap: null,
			sensor: event.t
		});
	});
	rows.sort((left, right) => left.t - right.t);
	const missing = ride.series ? "못 잡음" : "—";
	return rows.map((row) => [
		row.where,
		row.kind === "arrive" ? "도착" : "출발",
		row.tap ? fmt(row.tap) : "—",
		row.sensor ? fmt(row.sensor) : missing,
		row.tap && row.sensor ? sec(Math.round((row.sensor - row.tap) / 1e3)) : ""
	]);
}
var dayLabel = (day, days) => `${Number(day.slice(4, 6))}월 ${Number(day.slice(6))}일${day === days[0] ? " (오늘)" : ""}`;
var rideTitle = (ride) => `${ride.mode === "bus" ? "버스" : "지하철"} ${ride.line || ""}`;
var rideLine = (ride) => `${fmt(ride.from)}~${fmt(ride.to)} · 도착 ${ride.stops}번 · GPS ${ride.gps}점${ride.series ? " · 센서 있음" : ""}`;
var shotLine = (shot) => `${new Date(shot.at).toLocaleString("ko-KR")} · ${shot.type} · ${Math.round(shot.bytes / 1024)}KB`;
export { batchSize, busLabel, closeCell, compareRows, dayLabel, elapsed, fmt, lineGraph, lineStations, motionChunks, nearest, rideLine, rideTitle, ridingView, shotLine };
