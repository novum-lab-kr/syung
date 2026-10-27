import { busMetresPerPixel } from "../bus/roads.mjs";
// web/lib/journey_map_style.mjs
var width = (casing, thin = false) => [
	"interpolate",
	["linear"],
	["zoom"],
	...[
		10,
		14,
		15,
		16,
		17,
		18,
		22
	].flatMap((z) => {
		const ride = thin ? 1.5 + Math.min(8, Math.max(0, z - 10)) * 3 / 8 : 3.5 + Math.min(6, Math.max(0, z - 10)) * 5.5 / 6;
		return [z, [
			"min",
			thin ? casing ? ride + 2.5 : ride : casing ? 6 + Math.min(6, Math.max(0, z - 10)) * 8 / 6 : ride,
			[
				"*",
				[
					"coalesce",
					["get", "laneWidth"],
					1e6
				],
				(casing ? .92 : .62) / busMetresPerPixel(z)
			]
		]];
	})
];
var journeyCasingPaint = ({ thin = false } = {}) => ({
	"line-color": "#ffffff",
	"line-width": width(true, thin)
});
var journeyRidePaint = ({ thin = false } = {}) => ({
	"line-color": ["get", "color"],
	"line-width": width(false, thin)
});
var journeyStopPaint = () => ({
	"circle-radius": 6,
	"circle-color": "#ffffff",
	"circle-stroke-color": ["get", "color"],
	"circle-stroke-width": 3
});
export { journeyCasingPaint, journeyRidePaint, journeyStopPaint };
