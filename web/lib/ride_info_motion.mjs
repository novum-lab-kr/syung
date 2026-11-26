import { __vitePreload } from "../_virtual/_vite/preload-helper.mjs";
import { panelScene, playRange } from "./where_motion.mjs";
import arrival_char_ride_default from "../brand/arrival-char-ride.json_url.mjs";
import login_motion_loop_default from "../brand/login-motion-loop.json_url.mjs";
import login_motion_default from "../brand/login-motion.json_url.mjs";
import ride_scenery_default from "../brand/ride-scenery.json_url.mjs";
import sky_clouds_cloudy_default from "../brand/sky-clouds-cloudy.json_url.mjs";
import sky_clouds_overcast_default from "../brand/sky-clouds-overcast.json_url.mjs";
import sky_clouds_storm_default from "../brand/sky-clouds-storm.json_url.mjs";
import sky_drizzle_default from "../brand/sky-drizzle.json_url.mjs";
import sky_flurry_default from "../brand/sky-flurry.json_url.mjs";
import sky_heavyrain_default from "../brand/sky-heavyrain.json_url.mjs";
import sky_rain_default from "../brand/sky-rain.json_url.mjs";
import sky_sleet_default from "../brand/sky-sleet.json_url.mjs";
import sky_snow_default from "../brand/sky-snow.json_url.mjs";
import sky_storm_default from "../brand/sky-storm.json_url.mjs";
import sky_train_default from "../brand/sky-train.json_url.mjs";
import { fetchWeather, sceneFor, weatherArt, weatherTalk } from "../map/sky_weather.mjs";
import { nightColors } from "../map/sky_motion.mjs";
// web/lib/ride_info_motion.mts
var player = () => globalThis.lottie;
var FPS = 20;
var PAINT = {
	"#010101": ["#8fd0ff", "#1b2346"],
	"#010102": ["#d8f0ff", "#3b3f78"],
	"#010103": ["#9fd39a", "#2b3466"],
	"#010104": ["#bfe3b4", "#343d74"],
	"#010105": ["#7d8796", "#20264a"],
	"#010106": ["#ffffff", "#c8d2ff"],
	"#010107": ["#f3e2a9", "#2c3260"],
	"#010108": ["#d9c27c", "#4b5487"],
	"#020101": ["#ffb38a", "#7a5a9a"],
	"#020102": ["#8fb3d9", "#3a4a8c"],
	"#020103": ["#ffe9a8", "#56609c"],
	"#020104": ["#a9dcc6", "#2f6a80"],
	"#020105": ["#f6a5a5", "#8a4f84"],
	"#020106": ["#ffffff", "#ffe08a"],
	"#020107": ["#d8ecff", "#ffe08a"],
	"#020108": ["#f2695c", "#d0607a"],
	"#020109": ["#5d7fa8", "#8a93c8"],
	"#02010a": ["#8a5a3c", "#2a2f5a"],
	"#02010b": ["#ffd400", "#e3c54f"],
	"#030101": ["#6fc27c", "#2f7a6a"],
	"#030102": ["#8fd68a", "#3d8a5e"],
	"#030103": ["#a07a4a", "#4b5487"],
	"#030104": ["#6f7b8c", "#6d76a8"],
	"#030105": ["#fff2b0", "#ffe08a"],
	"#040101": ["#f2695c", "#e0655a"],
	"#040102": ["#5aa2e8", "#5a8fe0"],
	"#040103": ["#ffffff", "#e8ecff"],
	"#040104": ["#ff9f1c", "#f09a2a"],
	"#040105": ["#3fbf7f", "#3aa873"],
	"#040106": ["#3d7edb", "#4a80d8"],
	"#040107": ["#2bb3a3", "#2aa093"],
	"#040108": ["#fff7e0", "#d8dcf5"],
	"#040109": ["#d8ecff", "#ffe08a"],
	"#04010a": ["#2a2f3a", "#0e1230"],
	"#04010b": ["#2a2f3a", "#0e1230"]
};
var hexOf = (rgb) => `#${rgb.slice(0, 3).map((part) => Math.round(part * 255).toString(16).padStart(2, "0")).join("")}`;
var rgbOf = (code) => [
	1,
	3,
	5
].map((at) => +(parseInt(code.slice(at, at + 2), 16) / 255).toFixed(4));
function paint(node, night) {
	if (Array.isArray(node)) {
		node.forEach((child) => paint(child, night));
		return;
	}
	if (!node || typeof node !== "object") return;
	const item = node, color = item.c;
	if ((item.ty === "fl" || item.ty === "st") && color && Array.isArray(color.k) && typeof color.k[0] === "number") {
		const next = PAINT[hexOf(color.k)];
		if (next) color.k = [...rgbOf(next[night ? 1 : 0]), 1];
	}
	Object.values(item).forEach((child) => paint(child, night));
}
var skySay = async (at) => {
	const weather = await fetchWeather(at);
	return weather ? weatherTalk(weather) : null;
};
var cache = /* @__PURE__ */ new Map();
function loadScene(name) {
	let pending = cache.get(name);
	if (!pending) {
		pending = fetch(new URL((/* #__PURE__ */ Object.assign({
			"../brand/arrival-char-ride.json": arrival_char_ride_default,
			"../brand/login-motion-loop.json": login_motion_loop_default,
			"../brand/login-motion.json": login_motion_default,
			"../brand/ride-scenery.json": ride_scenery_default,
			"../brand/sky-clouds-cloudy.json": sky_clouds_cloudy_default,
			"../brand/sky-clouds-overcast.json": sky_clouds_overcast_default,
			"../brand/sky-clouds-storm.json": sky_clouds_storm_default,
			"../brand/sky-drizzle.json": sky_drizzle_default,
			"../brand/sky-flurry.json": sky_flurry_default,
			"../brand/sky-heavyrain.json": sky_heavyrain_default,
			"../brand/sky-rain.json": sky_rain_default,
			"../brand/sky-sleet.json": sky_sleet_default,
			"../brand/sky-snow.json": sky_snow_default,
			"../brand/sky-storm.json": sky_storm_default,
			"../brand/sky-train.json": sky_train_default
		}))[`../brand/${name}.json`], import.meta.url)).then((response) => response.ok ? response.json() : null).catch(() => null);
		cache.set(name, pending);
		pending.then((data) => {
			if (!data) cache.delete(name);
		});
	}
	return pending;
}
var frameAt = (elapsedMs, sceneFps, frames) => frames > 0 ? elapsedMs / 1e3 * sceneFps % frames : 0;
function rangeFrameAt(elapsedMs, sceneFps, range) {
	let frame = elapsedMs / 1e3 * sceneFps;
	for (const [from, to] of range.slice(0, -1)) {
		if (frame < to - from) return from + frame;
		frame -= to - from;
	}
	const [from, to] = range.at(-1) ?? [0, 0];
	return from + frameAt(frame / sceneFps * 1e3, sceneFps, to - from);
}
var LOGO_BODY = /* @__PURE__ */ new Set([
	"logo-body",
	"logo-line1",
	"logo-line2",
	"logo-line3"
]);
var INK = [
	.0784,
	.0784,
	.0784
];
function recolor(node, rgb) {
	if (Array.isArray(node)) {
		node.forEach((child) => recolor(child, rgb));
		return;
	}
	if (!node || typeof node !== "object") return;
	const item = node, color = item.c;
	if ((item.ty === "fl" || item.ty === "st") && color && Array.isArray(color.k)) color.k = [...rgb, 1];
	Object.values(item).forEach((child) => recolor(child, rgb));
}
function logoScene(data, yellow, night) {
	const copy = panelScene(data, yellow), code = /^#[\da-f]{6}$/i.exec(yellow.trim())?.[0] ?? "#ffd400";
	copy.layers.forEach((layer) => {
		if (layer.nm === "logo-tile") layer.hd = true;
		if (!night) return;
		if (LOGO_BODY.has(String(layer.nm))) recolor(layer.shapes, rgbOf(code));
		if (layer.nm === "logo-eye") recolor(layer.shapes, INK);
	});
	return copy;
}
function startRideMotion(host, here = null) {
	const still = matchMedia("(prefers-reduced-motion: reduce)").matches, night = document.documentElement.dataset.theme === "dark";
	const playing = [];
	let alive = true, timer = 0, elapsed = 0, last = 0;
	const step = () => {
		const now = performance.now();
		elapsed += now - last;
		last = now;
		for (const item of playing) item.anim.goToAndStop(item.frameOf(elapsed - item.since), true);
	};
	const run = () => {
		if (!playing.length || timer || still || document.hidden) return;
		last = performance.now();
		step();
		timer = setInterval(step, 1e3 / FPS);
	};
	const pause = () => {
		clearInterval(timer);
		timer = 0;
	};
	const onVisible = () => {
		if (document.hidden) pause();
		else run();
	};
	document.addEventListener("visibilitychange", onVisible);
	const slot = (name) => {
		const box = document.createElement("div");
		box.className = `rg-scene-${name}`;
		host.append(box);
		return box;
	};
	const add = (box, data, fit, frameOf = (elapsedMs) => frameAt(elapsedMs, data.fr, data.op)) => {
		const api = player();
		if (!api) return null;
		const anim = api.loadAnimation({
			container: box,
			renderer: "svg",
			loop: false,
			autoplay: false,
			animationData: data,
			rendererSettings: { preserveAspectRatio: fit }
		});
		anim.goToAndStop(frameOf(0), true);
		playing.push({
			anim,
			fps: data.fr,
			frameOf,
			since: elapsed
		});
		return anim;
	};
	const boxes = {
		land: slot("land"),
		veil: slot("veil"),
		fall: slot("fall"),
		clouds: slot("clouds"),
		logo: slot("logo")
	};
	boxes.logo.classList.add("login-motion");
	const logo = async () => {
		const data = await loadScene("login-motion-loop");
		if (!alive || !data) return;
		const range = playRange(data).slice(-1), copy = logoScene(data, getComputedStyle(host).getPropertyValue("--syung"), night);
		add(boxes.logo, copy, "xMidYMid meet", (elapsedMs) => still ? range.at(-1)?.[0] ?? 0 : rangeFrameAt(elapsedMs, data.fr, range));
		run();
	};
	(async () => {
		try {
			const [data] = await Promise.all([loadScene("ride-scenery"), player() ? 0 : __vitePreload(() => import("../vendor/lottie/lottie_light.min.js"), [], import.meta.url)]);
			if (!alive || !data) return;
			const copy = structuredClone(data);
			paint(copy.layers, night);
			add(boxes.land, copy, "xMidYMax slice")?.addEventListener("DOMLoaded", () => {
				if (alive) host.classList.add("on");
			});
			run();
			logo();
			const weather = await fetchWeather(here);
			if (!alive || !weather) return;
			const scene = sceneFor(weather), names = [[boxes.fall, scene.fall], [boxes.clouds, scene.clouds ? `clouds-${scene.clouds}` : null]];
			boxes.veil.innerHTML = `<svg viewBox="0 0 320 110" preserveAspectRatio="none" aria-hidden="true">${weatherArt(weather, night).back}</svg>`;
			await Promise.all(names.map(async ([box, name]) => {
				const sky = name ? await loadScene(`sky-${name}`) : null;
				if (!alive || !sky) return;
				const skyCopy = structuredClone(sky);
				if (night) nightColors(skyCopy);
				add(box, skyCopy, "xMidYMin slice");
			}));
			run();
		} catch {}
	})();
	return () => {
		alive = false;
		pause();
		document.removeEventListener("visibilitychange", onVisible);
		playing.forEach((item) => item.anim.destroy());
		playing.length = 0;
		host.replaceChildren();
		host.classList.remove("on");
	};
}
export { frameAt, logoScene, rangeFrameAt, skySay, startRideMotion };
