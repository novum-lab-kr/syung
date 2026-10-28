// web/modes/coaster/index.mts
var coaster_default = {
	id: "coaster",
	from: "simcity",
	label: "롤러코스터",
	settings: {
		map: {
			paletteKind: "park-city",
			verticalGradient: false
		},
		city: {
			xray: false,
			tone: "coaster",
			lampPool: null
		},
		track: { kind: "coaster" },
		trains: {
			look: "coaster88",
			predictStops: 99,
			timeWarp: true
		},
		park: {
			enabled: true,
			landmarkRides: [{
				kind: "ferris",
				lngLat: [126.8853, 37.5682],
				diameterM: 180,
				yawDeg: 20
			}]
		},
		me: { look: "visitor" },
		sun: { light: "park" }
	}
};
export { coaster_default as default };
