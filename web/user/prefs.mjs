import { USER_PREFERENCES } from "../modes/index.mjs";
// web/user/prefs.mjs
var PREF_KEYS = Object.freeze({
	themeChoice: "subway-theme",
	mapColor: "subway-map-color",
	prebuild: "subway-prebuild",
	saver: "subway-saver"
});
var DEVICE_PREFERENCES = Object.freeze({
	prebuild: Object.freeze(["on", "off"]),
	saver: Object.freeze(["on", "off"])
});
function createUserPrefs(opts = {}) {
	const allowed = opts.allowed || {
		...USER_PREFERENCES,
		...DEVICE_PREFERENCES
	};
	let storage = opts.storage;
	if (!("storage" in opts)) try {
		storage = globalThis.localStorage;
	} catch {
		storage = null;
	}
	const ok = (k, v) => !!allowed[k] && allowed[k].includes(v);
	const values = {};
	for (const k of Object.keys(PREF_KEYS)) {
		let v = null;
		try {
			v = storage?.getItem(PREF_KEYS[k]) ?? null;
		} catch {}
		values[k] = ok(k, v) ? v : null;
	}
	return {
		get: (k) => values[k] ?? null,
		set(k, v) {
			if (!ok(k, v)) throw new Error(`${k}: 허용되지 않는 내 설정 ${v}`);
			values[k] = v;
			try {
				storage?.setItem(PREF_KEYS[k], v);
			} catch {}
			return v;
		},
		all: () => Object.fromEntries(Object.entries(values).filter(([, v]) => v != null))
	};
}
export { DEVICE_PREFERENCES, PREF_KEYS, createUserPrefs };
