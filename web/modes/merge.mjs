// web/modes/merge.mts
var BAD_KEYS = /* @__PURE__ */ new Set([
	"__proto__",
	"constructor",
	"prototype"
]);
var isPlain = (v) => {
	if (!v || typeof v !== "object" || Array.isArray(v)) return false;
	const p = Object.getPrototypeOf(v);
	return p === Object.prototype || p === null;
};
function validateSettings(S, where = "settings") {
	const seen = /* @__PURE__ */ new Set(), up = /* @__PURE__ */ new Set();
	const walk = (v, path) => {
		if (v === null || typeof v === "string" || typeof v === "boolean") return;
		if (typeof v === "number") {
			if (!Number.isFinite(v)) throw new Error(`${path}: 유한한 수가 아님 (${v})`);
			return;
		}
		if (typeof v !== "object") throw new Error(`${path}: 데이터가 아님 (${typeof v})`);
		if (!Array.isArray(v) && !isPlain(v)) throw new Error(`${path}: 평범한 객체가 아님 (${v.constructor?.name || "?"})`);
		if (up.has(v)) throw new Error(`${path}: 순환 참조`);
		if (seen.has(v)) return;
		seen.add(v);
		up.add(v);
		for (const k of Reflect.ownKeys(v)) {
			if (typeof k === "symbol") throw new Error(`${path}: 기호 키`);
			if (BAD_KEYS.has(k)) throw new Error(`${path}.${k}: 쓸 수 없는 키`);
			const d = Object.getOwnPropertyDescriptor(v, k);
			if (Array.isArray(v) && k === "length") continue;
			if (d.get || d.set) throw new Error(`${path}.${k}: getter · setter 는 설정에 못 넣음`);
			if (!d.enumerable) throw new Error(`${path}.${k}: 숨은(열거 안 되는) 속성`);
			walk(d.value, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`);
		}
		up.delete(v);
	};
	walk(S, where);
	return S;
}
function mergeSettings(base, delta) {
	if (delta === void 0) return base;
	if (!isPlain(delta) || !isPlain(base)) return delta;
	let out = null;
	for (const k of Object.keys(delta)) {
		if (BAD_KEYS.has(k)) throw new Error(`${k}: 쓸 수 없는 키`);
		const v = delta[k];
		if (v === void 0) continue;
		const prev = base[k];
		const next = isPlain(v) && isPlain(prev) ? mergeSettings(prev, v) : v;
		if (next === prev && k in base) continue;
		(out ??= { ...base })[k] = next;
	}
	return out || base;
}
var deepFrozen = /* @__PURE__ */ new WeakSet();
function freezeSettings(S) {
	if (!S || typeof S !== "object" || deepFrozen.has(S)) return S;
	deepFrozen.add(S);
	Object.freeze(S);
	for (const k of Object.keys(S)) freezeSettings(S[k]);
	return S;
}
function validateModeDefinitions(defs, { root = "basic", maxDepth = 2 } = {}) {
	const byId = /* @__PURE__ */ new Map();
	for (const d of defs) {
		if (!d || typeof d.id !== "string" || !d.id) throw new Error("모드 정의에 id 가 없음");
		if (byId.has(d.id)) throw new Error(`${d.id}: 모드 id 중복`);
		if (d.id === root && d.from != null) throw new Error(`${root}: 기본 모드는 부모가 없음`);
		if (d.settings !== void 0 && !isPlain(d.settings)) throw new Error(`${d.id}: settings 는 평범한 객체`);
		validateSettings(d.settings || {}, `${d.id}.settings`);
		byId.set(d.id, d);
	}
	if (!byId.has(root)) throw new Error(`${root}: 기본 모드가 없음`);
	const parent = (d) => d.id === root ? null : d.from ?? root;
	for (const d of defs) {
		const chain = [d.id];
		for (let p = parent(d); p != null; p = parent(byId.get(p))) {
			if (!byId.has(p)) throw new Error(`${d.id}: 없는 부모 모드 ${p}`);
			if (chain.includes(p)) throw new Error(`${d.id}: 상속 순환 ${[...chain, p].join(" → ")}`);
			chain.push(p);
		}
		if (chain.length - 1 > maxDepth) throw new Error(`${d.id}: 상속이 너무 깊음 (${chain.reverse().join(" → ")})`);
	}
	return byId;
}
export { freezeSettings, mergeSettings, validateModeDefinitions, validateSettings };
