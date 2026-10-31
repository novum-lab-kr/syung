// web/city/monuments_data.mts
var GATE_DECK_Z = 1.1;
var GATE_BASE_D = 13.3;
var PALACE_AT = [126.977, 37.579];
var PALACE_ORIGIN = [126.97, 37.57];
var PALACE_RING = [
	4036,
	8690,
	4073,
	8376,
	4111,
	8054,
	4234,
	7300,
	4301,
	6962,
	4387,
	6427,
	4445,
	6097,
	4446,
	6088,
	4592,
	6006,
	4698,
	6005,
	4742,
	6004,
	5139,
	5984,
	5448,
	5972,
	6197,
	5941,
	6640,
	5931,
	6639,
	5880,
	6638,
	5872,
	6733,
	5870,
	6829,
	5869,
	6927,
	5866,
	6990,
	5865,
	6990,
	5871,
	6991,
	5908,
	7019,
	5907,
	7935,
	5925,
	8173,
	5930,
	8339,
	5940,
	8601,
	5976,
	8861,
	6008,
	9126,
	6295,
	9318,
	6458,
	9317,
	6507,
	9316,
	6564,
	9296,
	6563,
	9296,
	6580,
	9266,
	6579,
	9269,
	6753,
	9295,
	6753,
	9295,
	6770,
	9328,
	6771,
	9354,
	7936,
	9348,
	8071,
	9357,
	8200,
	9411,
	9013,
	9425,
	9497,
	9329,
	9500,
	9327,
	9566,
	9325,
	9620,
	9325,
	9631,
	9323,
	9686,
	9443,
	9692,
	9462,
	9986,
	9689,
	9980,
	10017,
	11036,
	10049,
	12170,
	9968,
	12615,
	9780,
	12941,
	9298,
	13289,
	7413,
	13565,
	6716,
	13667,
	6446,
	13651,
	6127,
	13632,
	5609,
	13552,
	5432,
	13523,
	4511,
	13350,
	4119,
	13277,
	3945,
	13226,
	3936,
	13e3,
	3755,
	12912,
	3755,
	12743,
	3786,
	11975,
	3822,
	11071,
	3834,
	10761,
	3910,
	9816,
	4015,
	8900,
	4022,
	8830,
	3998,
	8829,
	4007,
	8801,
	4013,
	8778,
	4014,
	8758,
	4015,
	8738,
	4015,
	8714,
	4013,
	8686,
	4036,
	8690
];
var palaceRing = () => {
	const ring = [];
	for (let i = 0; i < PALACE_RING.length; i += 2) ring.push([PALACE_ORIGIN[0] + PALACE_RING[i] / 1e6, PALACE_ORIGIN[1] + PALACE_RING[i + 1] / 1e6]);
	return ring;
};
var MONUMENTS = [
	{
		id: "gwanghwamun",
		zone: "gyeongbok",
		lngLat: [126.976817, 37.575928],
		yawDeg: -1.3
	},
	{
		id: "palace-wall",
		zone: "gyeongbok",
		lngLat: PALACE_AT,
		yawDeg: 0
	},
	{
		id: "palace-halls",
		zone: "gyeongbok",
		lngLat: PALACE_AT,
		yawDeg: 0
	},
	{
		id: "palace-frames",
		zone: "gyeongbok",
		lngLat: PALACE_AT,
		yawDeg: 0
	}
];
var MONUMENT_HIDES = [{
	lngLat: [126.976817, 37.575928],
	radiusM: 22,
	minH: 0
}, {
	lngLat: PALACE_AT,
	radiusM: 900,
	minH: 0,
	area: palaceRing()
}];
var REGION = {
	lngLat: [126.977, 37.5745],
	radiusM: 1500
};
function monumentsInView(bounds) {
	const [lng, lat] = REGION.lngLat, x = (lng + 180) / 360, y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2, r = REGION.radiusM / (40075016.686 * Math.cos(lat * Math.PI / 180));
	return bounds[0] - r <= x && x <= bounds[2] + r && bounds[1] - r <= y && y <= bounds[3] + r;
}
var withHides = /* @__PURE__ */ new WeakMap();
function withMonumentHides(pack) {
	let out = withHides.get(pack);
	if (!out) {
		out = {
			...pack,
			landmarkHide: [...pack.landmarkHide || [], ...MONUMENT_HIDES]
		};
		withHides.set(pack, out);
	}
	return out;
}
function monumentBuildingFilter() {
	return ["!", ["within", {
		type: "MultiPolygon",
		coordinates: MONUMENT_HIDES.map(({ lngLat: [lng, lat], radiusM, area }) => {
			if (area) return [[...area, area[0]]];
			const ring = [], r = radiusM * 1.5;
			for (let i = 0; i < 16; i++) {
				const a = i / 16 * Math.PI * 2;
				ring.push([lng + Math.cos(a) * r / (111320 * Math.cos(lat * Math.PI / 180)), lat + Math.sin(a) * r / 110574]);
			}
			ring.push(ring[0]);
			return [ring];
		})
	}]];
}
export { GATE_BASE_D, GATE_DECK_Z, MONUMENTS, MONUMENT_HIDES, PALACE_AT, PALACE_ORIGIN, PALACE_RING, monumentBuildingFilter, monumentsInView, palaceRing, withMonumentHides };
