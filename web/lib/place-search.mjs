// web/lib/place-search.mts
var STATION_LIMIT = 8;
var FALLBACK_LINE_COLOR = "#52646a";
var SAME_STATION_METRES = 500;
var METRES_PER_DEGREE = 111320;
var RAD = Math.PI / 180;
var stationQuery = (query) => query.trim().replace(/역$/, "");
function findStations(stations, query, colors) {
	const wanted = stationQuery(query);
	if (!wanted) return [];
	const rank = (station) => {
		if (station.name === wanted) return 0;
		return station.name.startsWith(wanted) ? 1 : 2;
	};
	return stations.filter((station) => station.name.includes(wanted)).sort((one, other) => rank(one) - rank(other) || one.name.length - other.name.length).slice(0, STATION_LIMIT).map((station) => ({
		name: station.name,
		lat: station.lat,
		lng: station.lon,
		lines: station.lines.map((line) => ({
			name: line.name,
			color: colors[line.name] || FALLBACK_LINE_COLOR
		})),
		...station.id === void 0 ? {} : { stationId: station.id }
	}));
}
function metresBetween(one, other) {
	const shrink = Math.cos((one.lat + other.lat) / 2 * RAD);
	return Math.hypot((one.lng - other.lng) * METRES_PER_DEGREE * shrink, (one.lat - other.lat) * METRES_PER_DEGREE);
}
var RAILWAY_NAMES = /* @__PURE__ */ new Set([
	"공항철도",
	"KTX",
	"SRT",
	"ITX",
	"ITX-새마을",
	"ITX-마음",
	"ITX-청춘",
	"GTX-A",
	"경부선",
	"경의선",
	"분당선",
	"수인선",
	"중앙선"
]);
function isLineName(word, station) {
	return RAILWAY_NAMES.has(word.toUpperCase()) || !!station.lines?.some((line) => line.name === word);
}
function isStationItself(place, station) {
	if (!place.name.startsWith(station.name)) return false;
	const rest = place.name.slice(station.name.length).replace(/^역/, "").trim();
	if (rest && !rest.split(/\s+/).every((word) => isLineName(word, station))) return false;
	return metresBetween(place, station) <= SAME_STATION_METRES;
}
var squeezed = (text) => text.replace(/\s+/g, "");
function mergeHits(stationHits, places, { query = "", here = null } = {}) {
	const wanted = squeezed(query), named = (place) => wanted && squeezed(place.name).includes(wanted) ? 0 : 1;
	const others = places.filter((place) => !stationHits.some((station) => isStationItself(place, station))).sort((one, other) => named(one) - named(other));
	return [...stationHits, ...others.map(({ name, address, lat, lng }) => ({
		name,
		lat,
		lng,
		...address ? { address } : {},
		...here ? { metres: metresBetween(here, {
			lat,
			lng
		}) } : {}
	}))];
}
function distanceText(metres) {
	const rounded = Math.round(metres / 10) * 10;
	return rounded < 1e3 ? `${rounded}m` : `${(metres / 1e3).toFixed(1)}km`;
}
var SAME_SPOT_METRES = 30;
var sameSpot = (one, other) => metresBetween(one, other) <= SAME_SPOT_METRES;
var inkOn = (hex) => {
	const value = parseInt(String(hex).slice(1), 16);
	if (Number.isNaN(value)) return "#fff";
	const [red, green, blue] = [
		value >> 16,
		value >> 8 & 255,
		value & 255
	].map((channel) => {
		const unit = channel / 255;
		return unit <= .03928 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4;
	});
	const light = .2126 * red + .7152 * green + .0722 * blue;
	if (1.05 / (light + .05) >= 4.5) return "#fff";
	return (light + .05) / .057 >= 4.5 ? "#141414" : "#000";
};
var endName = (hit) => hit.lines && !/역$/.test(hit.name) ? `${hit.name}역` : hit.name;
var clockText = (total) => `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
function nearestFive(time) {
	const [hours = 0, minutes = 0] = time.split(":").map(Number);
	return clockText(Math.round((hours * 60 + minutes) / 5) * 5);
}
function ticketTime(leaveBy, now, tomorrow) {
	const nearest = nearestFive(leaveBy);
	if (tomorrow) return nearest;
	const [hours = 0, minutes = 0] = leaveBy.split(":").map(Number);
	const rounded = Math.round((hours * 60 + minutes) / 5) * 5, nowTotal = now.getHours() * 60 + now.getMinutes();
	return rounded <= nowTotal ? clockText(Math.floor(nowTotal / 5) * 5 + 5) : nearest;
}
function swappedEnds(names, picked, start, hereName) {
	return {
		names: {
			from: names.to,
			to: names.from
		},
		picked: {
			from: names.to === hereName ? null : picked.to,
			to: start ? {
				...start,
				name: names.from
			} : null
		}
	};
}
export { distanceText, endName, findStations, inkOn, mergeHits, metresBetween, nearestFive, sameSpot, stationQuery, swappedEnds, ticketTime };
