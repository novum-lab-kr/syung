import { PARK_DEFAULTS } from "../basic/park.mjs";
// web/modes/coaster/metrics.mts
var clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function zoomFade(zoom, range) {
	const t = clamp((zoom - range[0]) / (range[1] - range[0]), 0, 1);
	return t * t * (3 - 2 * t);
}
var metresPerPixel = (zoom, lat = 37.55) => 40075016.68557849 * Math.cos(lat * Math.PI / 180) / (512 * 2 ** zoom);
function trackMetrics(zoom, lat = 37.55, pack = PARK_DEFAULTS) {
	const mpp = metresPerPixel(zoom, lat), T = pack.track, S = pack.supports, real = clamp((zoom - 18) / 1.5, 0, 1), px = (m, range) => Math.max(clamp(m / mpp, ...range), m / mpp * real);
	return {
		mpp,
		rail: px(T.railDiameterM, T.railDiameterPx),
		spineWidth: px(T.spineWidthM, T.spineWidthPx),
		spineDepth: px(T.spineDepthM, T.spineDepthPx),
		girder: px(T.girderDepthM, T.girderDepthPx),
		tie: px(T.tieThicknessM, T.tieThicknessPx),
		post: px(S.diameterM, S.diameterPx)
	};
}
function ridePalette(dark = false, pack = PARK_DEFAULTS) {
	const P = pack.palette[dark ? "dark" : "light"];
	return [
		P.red,
		P.gold,
		P.cream,
		P.ivory,
		P.teal,
		P.tealShade,
		P.cream,
		P.teal,
		P.gold,
		P.red
	];
}
export { clamp, metresPerPixel, ridePalette, trackMetrics, zoomFade };
