import { __vitePreload } from "../_virtual/_vite/preload-helper.mjs";
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
// web/map/sky_motion.mts
var player = () => globalThis.lottie;
var NIGHT = {
	"#f4f8fc": "#6d76a8",
	"#aab5c3": "#4b5382",
	"#8fa6c4": "#8a93c8",
	"#d6ecff": "#5b78c8",
	"#2b62b0": "#bfdcff",
	"#6f7b8c": "#3a4170",
	"#8fb4dc": "#9aa6e0",
	"#9fd4ff": "#ffe08a",
	"#ffffff": "#ffffff",
	"#fffbe0": "#c8d2ff"
};
var hexOf = (rgb) => `#${rgb.slice(0, 3).map((part) => Math.round(part * 255).toString(16).padStart(2, "0")).join("")}`;
var rgbOf = (code) => [
	1,
	3,
	5
].map((at) => +(parseInt(code.slice(at, at + 2), 16) / 255).toFixed(4));
function nightColors(node) {
	if (Array.isArray(node)) {
		node.forEach(nightColors);
		return;
	}
	if (!node || typeof node !== "object") return;
	const item = node;
	if ((item.ty === "fl" || item.ty === "st") && item.c && typeof item.c === "object") {
		const color = item.c.k;
		if (Array.isArray(color) && color.length === 4 && typeof color[0] === "number") {
			const next = NIGHT[hexOf(color)];
			if (next) item.c.k = [...rgbOf(next), 1];
		}
	}
	Object.values(item).forEach(nightColors);
}
var cache = /* @__PURE__ */ new Map();
function loadScene(name) {
	let pending = cache.get(name);
	if (!pending) {
		pending = fetch(new URL((/* #__PURE__ */ Object.assign({
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
		}))[`../brand/sky-${name}.json`], import.meta.url)).then((response) => response.ok ? response.json() : null).catch(() => null);
		cache.set(name, pending);
	}
	return pending;
}
var slots = /* @__PURE__ */ new Map();
var hostBox = null;
var running = false;
var reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function slotOf(host, name) {
	let slot = slots.get(name);
	if (slot && slot.box.parentElement !== host) {
		slot.anim?.destroy();
		slot = void 0;
	}
	if (!slot) {
		const box = document.createElement("div");
		box.className = `sky-motion-${name}`;
		host.append(box);
		slot = {
			box,
			key: "",
			anim: null,
			token: 0
		};
		slots.set(name, slot);
	}
	return slot;
}
async function setSlot(host, name, scene, night, speed) {
	const slot = slotOf(host, name), key = scene ? `${scene}|${night ? "n" : "d"}` : "";
	if (slot.key === key) {
		slot.anim?.setSpeed(speed);
		return;
	}
	slot.key = key;
	const token = ++slot.token;
	slot.anim?.destroy();
	slot.anim = null;
	slot.box.replaceChildren();
	if (!scene) return;
	const [data] = await Promise.all([loadScene(scene), player() ? 0 : __vitePreload(() => import("../vendor/lottie/lottie_light.min.js"), [], import.meta.url)]);
	if (!data || !player() || token !== slot.token || !slot.box.isConnected) return;
	const copy = structuredClone(data);
	if (night) nightColors(copy);
	copy.layers.forEach((layer) => {
		if (layer.nm === "lamp") layer.hd = !night;
	});
	const still = reduced();
	const anim = slot.anim = player().loadAnimation({
		container: slot.box,
		renderer: "svg",
		loop: true,
		autoplay: false,
		animationData: copy,
		rendererSettings: { preserveAspectRatio: "xMidYMid slice" }
	});
	anim.setSpeed(speed);
	if (still) anim.goToAndStop(0, true);
	else if (running) anim.play();
	else anim.goToAndStop(0, true);
	host.classList.add("on");
}
async function showMotion(host, scene, night, wet) {
	hostBox = host;
	running = true;
	await Promise.all([
		setSlot(host, "train", "train", night, wet ? .7 : 1),
		setSlot(host, "fall", scene?.fall ?? null, night, 1),
		setSlot(host, "clouds", scene?.clouds ? `clouds-${scene.clouds}` : null, night, 1)
	]);
}
function pauseMotion() {
	running = false;
	slots.forEach((slot) => slot.anim?.pause());
}
function resumeMotion() {
	running = true;
	if (reduced()) return;
	slots.forEach((slot) => {
		if (slot.box.parentElement === hostBox) slot.anim?.play();
	});
}
export { pauseMotion, resumeMotion, showMotion };
