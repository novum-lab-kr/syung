import { freezeSettings, mergeSettings, validateModeDefinitions, validateSettings } from "./merge.mjs";
// web/modes/index.mts
var COLOR = /^(#[0-9a-fA-F]{6}|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\))$/;
var HEX6 = /^#[0-9a-fA-F]{6}$/;
var COLOR_GROUP = /^(palette|sky|light|dark|colou?rs?)$/i;
function checkPack(pack, where) {
	const walk = (v, path, key, inLod, inColor) => {
		if (Array.isArray(v)) {
			if (inLod && !(v.length === 2 && v.every((x) => typeof x === "number") && v[0] <= v[1])) throw new Error(`${path}: lod 는 [시작, 끝] 두 개, 시작 ≤ 끝`);
			v.forEach((x, i) => walk(x, `${path}[${i}]`, key, inLod, inColor));
			return;
		}
		if (v && typeof v === "object") {
			for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, k, inLod || k === "lod", inColor || COLOR_GROUP.test(k));
			return;
		}
		if (typeof v === "string") {
			if ((inColor || v.startsWith("#") || /colou?r$/i.test(key)) && !HEX6.test(v)) throw new Error(`${path}: 색이 아님 (${v})`);
			return;
		}
		if (typeof v === "number") {
			if (v < 0) throw new Error(`${path}: 음수 (${v})`);
			if ((inLod || /zoom$/i.test(key)) && v > 24) throw new Error(`${path}: 줌 범위 밖 (${v})`);
		}
	};
	walk(pack, where, "", false, false);
}
var USER_PREFERENCES = Object.freeze({
	themeChoice: Object.freeze([
		"auto",
		"light",
		"dark"
	]),
	mapColor: Object.freeze(["calm", "color"])
});
function createModeRegistry(definitions, { root = "basic", maxDepth = 2, preferences = USER_PREFERENCES } = {}) {
	const defs = Object.freeze((Array.isArray(definitions) ? definitions : Object.values(definitions)).map((d) => d && typeof d === "object" ? Object.freeze({
		id: d.id,
		from: d.from,
		label: d.label,
		settings: d.settings
	}) : d));
	const byId = validateModeDefinitions(defs, {
		root,
		maxDepth
	});
	for (const d of defs) freezeSettings(d.settings || {});
	const parent = (id) => id === root ? null : byId.get(id).from ?? root;
	const chainOf = (id) => {
		const c = [];
		for (let p = id; p != null; p = parent(p)) c.unshift(p);
		return c;
	};
	const base = /* @__PURE__ */ new Map(), withUser = /* @__PURE__ */ new Map();
	const modeSettings = (id) => {
		let S = base.get(id);
		if (S) return S;
		const d = byId.get(id), up = parent(id);
		S = up == null ? d.settings || {} : mergeSettings(modeSettings(up), d.settings || {});
		freezeSettings(checkKnown(validateSettings(S, `${id}`), id));
		base.set(id, S);
		return S;
	};
	function checkKnown(S, id) {
		const plainGroup = (v) => v && typeof v === "object" && !Array.isArray(v);
		for (const [g, k] of [
			["map"],
			["map", "pixel"],
			["city"],
			["city", "life"],
			["park"],
			["track"],
			["trains"],
			["buses"],
			["me"],
			["sun"],
			["sky"]
		]) {
			const v = k ? S[g]?.[k] : S[g];
			if ((k ? S[g] && k in S[g] : g in S) && !plainGroup(v)) throw new Error(`${id}.${k ? g + "." + k : g}: 묶음(객체)이어야 — ${JSON.stringify(v)}`);
		}
		for (const k of Object.keys(preferences)) if (k in S && !preferences[k].includes(S[k])) throw new Error(`${id}.${k}: 허용되지 않는 값 ${S[k]}`);
		const colors = (v, path) => {
			if (typeof v === "string") {
				if (!COLOR.test(v)) throw new Error(`${path}: 색이 아님 (${v})`);
			} else if (typeof v === "number") {
				if (v < 0) throw new Error(`${path}: 음수 (${v})`);
			} else if (v && typeof v === "object") for (const k of Object.keys(v)) colors(v[k], Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`);
		};
		for (const k of [
			"themes",
			"colors",
			"park"
		]) if (S.map?.[k] != null) colors(S.map[k], `${id}.map.${k}`);
		const oneOf = (v, list, path) => {
			if (v !== void 0 && !list.includes(v)) throw new Error(`${path}: 허용되지 않는 값 ${v}`);
		};
		oneOf(S.map?.paletteKind, [
			"base",
			"city",
			"park-city"
		], `${id}.map.paletteKind`);
		oneOf(S.map?.exitLook, ["pillar", "jangseung"], `${id}.map.exitLook`);
		oneOf(S.sun?.light, ["map", "park"], `${id}.sun.light`);
		oneOf(S.track?.kind, [
			"ground",
			"viaduct",
			"coaster"
		], `${id}.track.kind`);
		oneOf(S.me?.look, [
			"sprout",
			"builder",
			"seonbi",
			"visitor",
			"scv",
			"drone",
			"probe"
		], `${id}.me.look`);
		oneOf(S.trains?.look, [
			"commuter",
			"fleet",
			"coaster88",
			"units"
		], `${id}.trains.look`);
		oneOf(S.city?.landmarks, ["tower", "wood-tower"], `${id}.city.landmarks`);
		oneOf(S.buses?.look, [
			"bus",
			"palanquin",
			"siegeTank",
			"ultralisk",
			"reaver"
		], `${id}.buses.look`);
		if (S.sky && !(Array.isArray(S.sky.units) && S.sky.units.every((v) => typeof v === "string"))) throw new Error(`${id}.sky.units: 유닛 모양 이름 목록이어야`);
		const LU = S.city?.life?.units;
		if (LU != null) {
			for (const k of ["people", "cars"]) if (!Array.isArray(LU[k]) || !LU[k].every((v) => typeof v === "string")) throw new Error(`${id}.city.life.units.${k}: 유닛 모양 이름 목록이어야`);
		}
		for (const k of ["lead", "rest"]) if (S.trains?.units && typeof S.trains.units[k] !== "string") throw new Error(`${id}.trains.units.${k}: 유닛 모양 이름이어야`);
		if (S.city && "heritage" in S.city && typeof S.city.heritage !== "boolean") throw new Error(`${id}.city.heritage: 참 · 거짓`);
		for (const k of ["cars", "crossings"]) if (S.city?.life && k in S.city.life && typeof S.city.life[k] !== "boolean") throw new Error(`${id}.city.life.${k}: 참 · 거짓`);
		oneOf(S.trains?.body, ["wide", "slim"], `${id}.trains.body`);
		oneOf(S.track?.platform, ["ribbon", "straight"], `${id}.track.platform`);
		if (S.city && "tone" in S.city) {
			const T = S.city.tone, M = S.city.pack?.modes, e = typeof T === "string" && M && Object.hasOwn(M, T) ? M[T] : null;
			if (!e || typeof e !== "object" || Array.isArray(e) || !("saturation" in e || "brightness" in e)) throw new Error(`${id}.city.tone: 팩 modes 에 없는 톤 ${T}`);
			if (S.city.lampPool == null && !(typeof e.lampPool === "number" && e.lampPool > 0)) throw new Error(`${id}.city.lampPool: null 이면 톤의 lampPool 이 0 보다 큰 수여야 — ${e.lampPool}`);
		}
		if (S.city && S.city.lampPool != null && !(typeof S.city.lampPool === "number" && S.city.lampPool > 0)) throw new Error(`${id}.city.lampPool: 0 보다 큰 수 또는 null — ${S.city.lampPool}`);
		if (S.trains && "predictStops" in S.trains && !(Number.isInteger(S.trains.predictStops) && S.trains.predictStops >= 1)) throw new Error(`${id}.trains.predictStops: 1 이상 정수`);
		for (const [g, k] of [
			["map", "verticalGradient"],
			["city", "groundTexture"],
			["city", "xray"],
			["trains", "timeWarp"]
		]) if (S[g] && k in S[g] && typeof S[g][k] !== "boolean") throw new Error(`${id}.${g}.${k}: 참 · 거짓`);
		if (S.sun && S.sun.lowHouseM != null && !(typeof S.sun.lowHouseM === "number" && S.sun.lowHouseM > 0)) throw new Error(`${id}.sun.lowHouseM: 0 보다 큰 수 또는 null`);
		if (S.city?.pack) checkPack(S.city.pack, `${id}.city.pack`);
		if (S.park?.style) checkPack(S.park.style, `${id}.park.style`);
		if (S.park && "towerM" in S.park && !(typeof S.park.towerM === "number" && S.park.towerM > 0)) throw new Error(`${id}.park.towerM: 0 보다 큰 수`);
		if (S.park && "landmarkRides" in S.park) {
			if (!Array.isArray(S.park.landmarkRides)) throw new Error(`${id}.park.landmarkRides: 목록`);
			S.park.landmarkRides.forEach((L, k) => {
				const at = `${id}.park.landmarkRides[${k}]`;
				oneOf(L?.kind, ["ferris"], `${at}.kind`);
				if (L?.kind === void 0) throw new Error(`${at}.kind: 필요`);
				if (!(Array.isArray(L.lngLat) && L.lngLat.length === 2 && L.lngLat[0] > 126 && L.lngLat[0] < 128 && L.lngLat[1] > 37 && L.lngLat[1] < 38)) throw new Error(`${at}.lngLat: 서울 둘레 [경도, 위도]`);
				if (!(typeof L.diameterM === "number" && L.diameterM > 0 && L.diameterM <= 400)) throw new Error(`${at}.diameterM: 0 ~ 400 m`);
				if ("yawDeg" in L && typeof L.yawDeg !== "number") throw new Error(`${at}.yawDeg: 수`);
			});
		}
		for (const g of ["city", "park"]) if (S[g] && "enabled" in S[g] && typeof S[g].enabled !== "boolean") throw new Error(`${id}.${g}.enabled: 참 · 거짓`);
		if (S.map && S.map.fov != null && !(typeof S.map.fov === "number" && S.map.fov >= 5 && S.map.fov <= 60)) throw new Error(`${id}.map.fov: 5 ~ 60 또는 null`);
		if (S.map?.pixel) {
			const X = S.map.pixel;
			for (const k of ["enabled", "outline"]) if (k in X && typeof X[k] !== "boolean") throw new Error(`${id}.map.pixel.${k}: 참 · 거짓`);
			if ("size" in X && !(typeof X.size === "number" && X.size >= 1 && X.size <= 8)) throw new Error(`${id}.map.pixel.size: 1 ~ 8`);
			oneOf(X.palette, ["none", "endesga32"], `${id}.map.pixel.palette`);
		}
		return S;
	}
	for (const id of byId.keys()) modeSettings(id);
	function normalizeUser(user) {
		if (user == null) return null;
		if (typeof user !== "object" || Array.isArray(user)) throw new Error("내 설정은 객체");
		const out = {};
		for (const k of Object.keys(user)) {
			const allowed = preferences[k];
			if (!allowed) throw new Error(`${k}: 내 설정으로 못 바꾸는 항목`);
			const d = Object.getOwnPropertyDescriptor(user, k);
			if (d.get || d.set) throw new Error(`${k}: getter · setter 는 못 씀`);
			const v = d.value;
			if (v === void 0) continue;
			if (!allowed.includes(v)) throw new Error(`${k}: 허용되지 않는 값 ${v}`);
			out[k] = v;
		}
		return Object.keys(out).length ? out : null;
	}
	function settings(name = root, user) {
		if (!byId.has(name)) throw new Error(`${name}: 없는 모드`);
		const S = modeSettings(name), u = normalizeUser(user);
		if (!u) return S;
		const key = `${name}|${Object.keys(preferences).map((k) => u[k] ?? "").join("|")}`;
		let R = withUser.get(key);
		if (!R) {
			R = freezeSettings(mergeSettings(S, u));
			withUser.set(key, R);
		}
		return R;
	}
	const list = () => defs.map((d) => ({
		id: d.id,
		from: parent(d.id),
		label: d.label ?? d.id
	}));
	function explain(name = root) {
		if (!byId.has(name)) throw new Error(`${name}: 없는 모드`);
		const chain = chainOf(name), sources = {};
		const mark = (v, path, id) => {
			if (v && typeof v === "object" && !Array.isArray(v)) {
				if (path) delete sources[path];
				for (const k of Object.keys(v)) mark(v[k], path ? `${path}.${k}` : k, id);
			} else if (path) {
				for (const k of Object.keys(sources)) if (k.startsWith(path + ".")) delete sources[k];
				sources[path] = id;
			}
		};
		for (const id of chain) mark(byId.get(id).settings || {}, "", id);
		return {
			id: name,
			chain,
			sources
		};
	}
	return {
		root,
		settings,
		list,
		explain,
		has: (id) => byId.has(id),
		chain: chainOf
	};
}
export { USER_PREFERENCES, createModeRegistry };
