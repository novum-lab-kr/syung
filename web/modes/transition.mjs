// web/modes/transition.mjs
var STARCRAFT = Object.freeze([
	"terran",
	"zerg",
	"protoss"
]);
var NATIONS = Object.freeze([
	"greece",
	"netherlands",
	"paris",
	"egypt"
]);
var CITY_FAMILY = Object.freeze([
	"simcity",
	"joseon",
	"retro",
	...STARCRAFT,
	...NATIONS
]);
function createModeController({ registry, prepare, commit, onRequest = () => {}, onFail = () => {}, clock, root = "basic" }) {
	let current = root, desired = root, seq = 0, speed = 1, warp = 0, warpAt = 0, S = registry.settings(root);
	function request(id, { speed: sp } = {}) {
		if (!registry.has(id)) throw new Error(`${id}: 없는 모드`);
		const my = ++seq;
		desired = id;
		onRequest(id, current);
		const go = () => {
			if (my !== seq) return false;
			commit(current, id, { speed: sp });
			current = id;
			S = registry.settings(id);
			desired = id;
			return true;
		};
		let ready;
		try {
			ready = prepare(id, current);
		} catch (e) {
			ready = Promise.reject(e);
		}
		if (ready === true) return go();
		return Promise.resolve(ready).then(go, (e) => {
			if (my === seq) {
				desired = current;
				onFail(current, e);
			}
			return false;
		}).catch((e) => {
			console.error("mode: switch failed", e);
			return false;
		});
	}
	function cancel() {
		seq++;
		desired = current;
		onRequest(current, current);
	}
	function enter(id) {
		if (!registry.has(id)) throw new Error(`${id}: 없는 모드`);
		current = id;
		S = registry.settings(id);
	}
	function setSpeed(s) {
		speed = s;
		if (speed === 1) {
			warp = 0;
			warpAt = 0;
		} else warpNow();
	}
	function warpNow() {
		const t = clock();
		if (t < warpAt) return warp;
		if (warpAt) warp += (t - warpAt) / 1e3 * (speed - 1);
		warpAt = t;
		return warp;
	}
	return {
		request,
		cancel,
		enter,
		setSpeed,
		warpNow,
		flags: Object.freeze({
			get simcity() {
				return CITY_FAMILY.includes(current);
			},
			get joseon() {
				return current === "joseon";
			},
			get starcraft() {
				return STARCRAFT.includes(current);
			},
			get coaster() {
				return current === "coaster";
			}
		}),
		get current() {
			return current;
		},
		get desired() {
			return desired;
		},
		get speed() {
			return speed;
		},
		get seq() {
			return seq;
		},
		settings: (user) => user == null ? S : registry.settings(current, user)
	};
}
export { CITY_FAMILY, NATIONS, STARCRAFT, createModeController };
