// web/city/landmarks_data.mjs
var LANDMARKS = [{
	id: "lotte",
	name: "롯데월드타워",
	lngLat: [127.102655, 37.51254],
	hide: {
		radiusM: 48,
		minH: 140
	},
	seamDeg: 158,
	profile: [
		[
			0,
			45,
			.89
		],
		[
			147,
			43,
			.9
		],
		[
			183,
			41,
			.92
		],
		[
			290,
			32,
			.97
		],
		[
			392,
			22,
			1
		],
		[
			440,
			18.5,
			1
		],
		[
			500,
			15,
			1
		],
		[
			555,
			13,
			1
		]
	],
	roundness: 1.3,
	seam: {
		widthM: 2.6,
		depthM: 1.3
	},
	crown: {
		splitM: 465,
		gapTopM: 12,
		latticeFromM: 450
	},
	height: 555
}];
var STUPAS = [{
	id: "namsan-stupa",
	kind: "seokga",
	lngLat: [126.988216, 37.551259],
	height: 240,
	widthMul: .65,
	looks: ["wood-tower"],
	yawDeg: 0
}, {
	id: "wongaksa",
	kind: "wongaksa",
	lngLat: [126.9883, 37.57123],
	height: 12,
	looks: ["wood-tower"],
	minPx: 30,
	yawDeg: 0
}];
var mercX = (lng) => (lng + 180) / 360;
var mercY = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2;
var landmarkMerc = (L) => [mercX(L.lngLat[0]), mercY(L.lngLat[1])];
export { LANDMARKS, STUPAS, landmarkMerc };
