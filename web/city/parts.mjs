// web/city/parts.mts
var parts = /* @__PURE__ */ new Map();
function registerCityPart(key, impl) {
	if (parts.has(key) && parts.get(key).impl !== impl) throw new Error(`도시 부품 ${key}: 이미 다른 것이 등록됨`);
	if (!parts.has(key)) parts.set(key, {
		impl,
		part: Object.freeze({ ...impl })
	});
}
function cityPart(key) {
	const p = parts.get(key);
	if (!p) throw new Error(`도시 부품 ${key} 없음 — 그 콘텐츠 모듈을 먼저 불러야 한다`);
	return p.part;
}
export { cityPart, registerCityPart };
