// web/city/zoom_gate.mts
var smoothstep = (from, to, x) => {
	const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
	return t * t * (3 - 2 * t);
};
var GROW_ZOOM_SPAN = .6;
var cityMinZoom = (phone) => phone ? 14.5 : 14;
var cityGrow = (phone, zoom) => smoothstep(cityMinZoom(phone), cityMinZoom(phone) + GROW_ZOOM_SPAN, zoom);
var cityFarLimit = (zoom) => {
	const end = Math.min(2600, 1200 * 2 ** ((zoom - 15) * .5));
	return [end * .7, end];
};
var cityFarFade = (distM, zoom) => {
	const [from, to] = cityFarLimit(zoom);
	return 1 - smoothstep(from, to, distM);
};
export { GROW_ZOOM_SPAN, cityFarFade, cityFarLimit, cityGrow, cityMinZoom, smoothstep };
