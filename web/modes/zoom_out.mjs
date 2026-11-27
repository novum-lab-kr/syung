// web/modes/zoom_out.mts
var made = /* @__PURE__ */ new WeakMap();
function zoomOutSettings(S, base) {
	const own = S, root = base;
	if (!own.city.zoomOutBasic) return S;
	let out = made.get(S);
	if (out) return out;
	const trains = own.trains.body === root.trains.body ? own.trains : Object.freeze({
		...own.trains,
		body: root.trains.body ?? null
	});
	out = Object.freeze({
		...S,
		track: root.track,
		trains
	});
	made.set(S, out);
	return out;
}
export { zoomOutSettings };
