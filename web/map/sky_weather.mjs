// web/map/sky_weather.mts
var W = 320;
var H = 110;
var SEOUL = [37.5665, 126.978];
var CACHE_MS = 6e5;
var SKY_NAME = {
	clear: "맑음",
	cloudy: "구름 많음",
	overcast: "흐림"
};
var PRECIP_NAME = {
	none: "",
	rain: "비",
	rain_snow: "진눈깨비",
	snow: "눈",
	drizzle: "빗방울",
	sleet_drizzle: "진눈깨비",
	flurry: "눈날림"
};
var f = (value) => value.toFixed(1);
function weatherLabel(w) {
	const parts = [PRECIP_NAME[w.precip] || SKY_NAME[w.sky]];
	if (w.lightning) parts.unshift("낙뢰");
	if (w.tempC !== null) parts.push(`${Math.round(w.tempC)}도`);
	return parts.join(" ");
}
function sceneFor(w) {
	const sky = w.precip !== "none" || w.lightning ? "overcast" : w.sky;
	const clouds = sky === "clear" ? null : sky;
	if (w.lightning) return {
		clouds: "storm",
		fall: "storm"
	};
	if (w.precip === "rain" && w.rainMm >= 10) return {
		clouds: "storm",
		fall: "heavyrain"
	};
	if (w.precip === "rain") return {
		clouds,
		fall: "rain"
	};
	if (w.precip === "drizzle") return {
		clouds,
		fall: "drizzle"
	};
	if (w.precip === "snow") return {
		clouds,
		fall: "snow"
	};
	if (w.precip === "flurry") return {
		clouds,
		fall: "flurry"
	};
	if (w.precip === "rain_snow" || w.precip === "sleet_drizzle") return {
		clouds,
		fall: "sleet"
	};
	return {
		clouds,
		fall: null
	};
}
var OUTLINE = (night) => night ? "#8a93c8" : "#8fa6c4";
function cloudParts(fill, night, opacity) {
	return `<g fill="${fill}" stroke="${OUTLINE(night)}" stroke-width="1" opacity="${opacity}"><circle cx="0" cy="0" r="7"/><circle cx="9" cy="-4" r="9"/><circle cx="19" cy="0" r="7"/><rect x="0" y="0" width="19" height="7" rx="3.5"/></g><g fill="${fill}" opacity="${opacity}"><rect x="0" y="-.5" width="19" height="7.5" rx="3.5"/></g>`;
}
function sunCover(cover, night, wet, dark) {
	return (x, y) => {
		if (cover === "clear") return "";
		const place = (dx, dy, scale, fill, opacity) => `<g transform="translate(${f(x + dx)} ${f(y + dy)}) scale(${scale})">${cloudParts(fill, night, opacity)}</g>`;
		if (cover === "half") return place(-3, 14, .9, night ? "#6d76a8" : "#f4f8fc", .95);
		const fill = night ? dark ? "#3a4170" : "#4b5382" : dark ? "#6f7b8c" : wet ? "#8e99a8" : "#aab5c3";
		return place(-26, 15, 1.1, fill, .98) + place(8, 16, 1.1, fill, .98) + place(-13, 19, 1.35, fill, .98);
	};
}
function pileOfSnow(roofs, ground, night, amount) {
	const stroke = night ? "#9aa6e0" : "#8fb4dc";
	const caps = roofs.map(([x, width, top]) => `<rect x="${x - 1}" y="${top - 2.5 * amount}" width="${width + 2}" height="${3 * amount}" rx="1.5"/>`).join("");
	let bumps = `M0 ${ground}`;
	for (let at = 0; at < W; at += 20) bumps += `q10 ${-3 * amount} 20 0`;
	return `<g fill="#ffffff" stroke="${stroke}" stroke-width=".8">${caps}<path d="${bumps}L${W} ${ground + 2}L0 ${ground + 2}Z"/></g>`;
}
function weatherArt(w, night) {
	const wet = w.precip !== "none";
	const scene = sceneFor(w);
	const snowy = w.precip === "snow" || w.precip === "rain_snow" || w.precip === "flurry" || w.precip === "sleet_drizzle";
	const amount = w.precip === "snow" ? 1.3 : w.precip === "rain_snow" ? .8 : .6;
	const cover = scene.clouds === null ? "clear" : scene.clouds === "cloudy" ? "half" : "hidden";
	const stormy = scene.clouds === "storm", heavy = scene.clouds === "overcast" || stormy;
	const veilColor = night ? "#0e1230" : stormy ? "#3b4656" : heavy ? wet ? "#5d6877" : "#6f7b8a" : "#9aa7b5";
	const veilOpacity = night ? stormy ? .5 : heavy ? wet ? .36 : .3 : .14 : stormy ? .68 : heavy ? wet ? .55 : .48 : .16;
	return {
		cover,
		wet,
		scene,
		over: sunCover(cover, night, wet, stormy),
		pile: (roofs, ground) => snowy ? pileOfSnow(roofs, ground, night, amount) : "",
		back: scene.clouds === null ? "" : `<rect width="${W}" height="${H}" fill="${veilColor}" opacity="${veilOpacity}"/>`,
		temp: w.tempC === null ? "" : `${Math.round(w.tempC)}°`,
		label: weatherLabel(w)
	};
}
var DEV_HOSTS = /* @__PURE__ */ new Set([
	"localhost",
	"127.0.0.1",
	"[::1]"
]);
var DEV_KINDS = {
	clear: {},
	cloudy: { sky: "cloudy" },
	overcast: { sky: "overcast" },
	rain: {
		sky: "overcast",
		precip: "rain",
		rainMm: 3
	},
	heavyrain: {
		sky: "overcast",
		precip: "rain",
		rainMm: 12
	},
	drizzle: {
		sky: "overcast",
		precip: "drizzle",
		rainMm: .3
	},
	snow: {
		sky: "overcast",
		precip: "snow"
	},
	flurry: {
		sky: "cloudy",
		precip: "flurry"
	},
	sleet: {
		sky: "overcast",
		precip: "rain_snow",
		rainMm: 1
	},
	sleetdrizzle: {
		sky: "overcast",
		precip: "sleet_drizzle",
		rainMm: .3
	},
	storm: {
		sky: "overcast",
		precip: "rain",
		rainMm: 12,
		lightning: true
	}
};
function devParams() {
	if (typeof location === "undefined" || !DEV_HOSTS.has(location.hostname)) return null;
	return new URLSearchParams(location.search);
}
function devWeather() {
	const params = devParams(), kind = params?.get("weather");
	if (!params || !kind || !(kind in DEV_KINDS)) return null;
	const temp = params.get("temp"), mm = params.get("mm"), wind = params.get("wind");
	const base = {
		tempC: temp === null ? 12 : Number(temp),
		sky: "clear",
		precip: "none",
		rainMm: 0,
		windMs: wind === null ? 2 : Number(wind),
		lightning: false,
		...DEV_KINDS[kind]
	};
	return mm === null ? base : {
		...base,
		rainMm: Number(mm)
	};
}
function devNight() {
	const value = devParams()?.get("night");
	return value === "1" ? true : value === "0" ? false : null;
}
function readReply(reply) {
	if (!reply.ok) return null;
	const sky = reply.sky === "cloudy" || reply.sky === "overcast" ? reply.sky : "clear";
	const precip = reply.precip && reply.precip in PRECIP_NAME ? reply.precip : "none";
	return {
		tempC: typeof reply.tempC === "number" ? reply.tempC : null,
		sky,
		precip,
		rainMm: reply.rainMm ?? 0,
		windMs: reply.windMs ?? 0,
		lightning: !!reply.lightning
	};
}
var cache = null;
async function fetchWeather(here) {
	const dev = devWeather();
	if (dev) return dev;
	const [lat, lng] = here ? [here[1], here[0]] : SEOUL;
	const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
	if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.weather;
	let weather = null;
	try {
		const response = await fetch(`./api/weather?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`, { cache: "no-store" });
		if (response.ok) weather = readReply(await response.json());
	} catch {}
	cache = {
		key,
		at: Date.now(),
		weather
	};
	return weather;
}
export { devNight, devWeather, fetchWeather, sceneFor, weatherArt, weatherLabel };
