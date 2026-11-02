import { __vitePreload } from "../_virtual/_vite/preload-helper.mjs";
// web/lib/where_motion.mts
var player = () => globalThis.lottie;
var isYellow = (color) => Array.isArray(color) && color.slice(0, 3).map((part) => Math.round(Number(part) * 255)).join() === "255,212,0";
function paintYellow(node, rgb) {
	if (Array.isArray(node)) {
		node.forEach((child) => paintYellow(child, rgb));
		return;
	}
	if (!node || typeof node !== "object") return;
	const item = node, color = item.c;
	if (item.ty === "fl" && color && isYellow(color.k)) color.k = [...rgb, 1];
	Object.values(item).forEach((child) => paintYellow(child, rgb));
}
function panelScene(data, yellow) {
	const copy = structuredClone(data), hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(yellow.trim());
	if (hex) paintYellow(copy.layers, hex.slice(1).map((part) => parseInt(part, 16) / 255));
	copy.layers.forEach((layer) => {
		if (layer.nm === "logo-ledge") layer.hd = true;
	});
	return copy;
}
function playRange(data) {
	const loop = data.markers?.find((marker) => marker.cm === "loop");
	return loop ? [[0, data.op], [loop.tm, loop.tm + loop.dr]] : [[0, data.op]];
}
var scene = null;
function loadScene() {
	scene ??= fetch(new URL(new URL("../assets/login-motion-loop-CIdLbdRM.json", import.meta.url).href, "" + import.meta.url)).then((response) => {
		if (!response.ok) throw new Error(`login-motion ${response.status}`);
		return response.json();
	}).catch(() => {
		scene = null;
		return null;
	});
	return scene;
}
function startWhereMotion(host) {
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
	let alive = true, visible = false, requested = false, begun = false, anim = null, range = [];
	const resume = () => {
		if (!anim) return;
		if (begun) anim.play();
		else {
			begun = true;
			anim.playSegments(range, true);
		}
	};
	async function load() {
		try {
			const [data] = await Promise.all([loadScene(), player() ? 0 : __vitePreload(() => import("../vendor/lottie/lottie_light.min.js"), [], import.meta.url)]);
			const api = player();
			if (!alive || !data || !api) return;
			range = playRange(data);
			const made = anim = api.loadAnimation({
				container: host,
				renderer: "svg",
				loop: true,
				autoplay: false,
				animationData: panelScene(data, getComputedStyle(host).getPropertyValue("--syung"))
			});
			made.addEventListener("DOMLoaded", () => {
				if (anim === made) host.classList.add("on");
			});
			if (visible) resume();
		} catch {}
	}
	const watcher = new IntersectionObserver((entries) => {
		visible = entries.at(-1)?.isIntersecting ?? false;
		if (visible && !requested) {
			requested = true;
			load();
		}
		if (visible) resume();
		else anim?.pause();
	});
	watcher.observe(host);
	return () => {
		alive = false;
		watcher.disconnect();
		anim?.destroy();
		anim = null;
		host.classList.remove("on");
	};
}
export { panelScene, playRange, startWhereMotion };
