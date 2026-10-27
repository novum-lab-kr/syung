// web/map/layers.mts
function registerTransitLayers({ map, shapesReady, buildLineFeatures, buildStationFeatures, basicRouteCache, rebuildLabels, stationNames, STATION_WIDTH_STOPS, PHONE, signCollisionLayout, live }) {
	let labelsStale = false;
	map.addSource("routes", {
		type: "geojson",
		data: {
			type: "FeatureCollection",
			features: buildLineFeatures()
		}
	});
	shapesReady.then(() => {
		map.getSource("routes").setData({
			type: "FeatureCollection",
			features: buildLineFeatures()
		});
		map.getSource("stations").setData({
			type: "FeatureCollection",
			features: buildStationFeatures()
		});
		rebuildLabels();
		map.triggerRepaint();
	});
	map.on("zoom", () => {
		if (live.track.kind !== "ground") return;
		let changed = false;
		for (const [key, t] of basicRouteCache) {
			const [line, a, b] = key.split(":");
			if (t.zoom && t.zoom !== map.getZoom()) {
				changed = true;
				break;
			}
		}
		if (!changed) return;
		map.getSource("routes").setData({
			type: "FeatureCollection",
			features: buildLineFeatures()
		});
		map.getSource("stations").setData({
			type: "FeatureCollection",
			features: buildStationFeatures()
		});
		labelsStale = true;
	});
	map.on("zoomend", () => {
		if (labelsStale) {
			labelsStale = false;
			rebuildLabels();
		}
	});
	map.addLayer({
		id: "routes",
		type: "line",
		source: "routes",
		layout: {
			"line-cap": "round",
			"line-join": "round"
		},
		paint: {
			"line-color": ["get", "color"],
			"line-width": [
				"interpolate",
				["linear"],
				["zoom"],
				8,
				1.5,
				15,
				4
			],
			"line-offset": ["get", "offset"],
			"line-opacity": .9
		}
	});
	map.addSource("stations", {
		type: "geojson",
		data: {
			type: "FeatureCollection",
			features: buildStationFeatures()
		}
	});
	map.addLayer({
		id: "stations-casing",
		type: "line",
		source: "stations",
		layout: {
			"line-cap": "butt",
			"line-join": "miter"
		},
		paint: {
			"line-opacity": 0,
			"line-color": ["get", "color"],
			"line-offset": ["get", "offset"],
			"line-width": [
				"interpolate",
				["linear"],
				["zoom"],
				...STATION_WIDTH_STOPS.flat()
			]
		}
	});
	map.addLayer({
		id: "stations",
		type: "line",
		source: "stations",
		layout: {
			"line-cap": "butt",
			"line-join": "miter"
		},
		paint: {
			"line-opacity": 0,
			"line-color": ["get", "color"],
			"line-offset": ["get", "offset"],
			"line-width": [
				"interpolate",
				["linear"],
				["zoom"],
				...STATION_WIDTH_STOPS.map(([z, w]) => [z, Math.max(1, w - 4)]).flat()
			]
		}
	});
	map.addLayer(stationNames);
	map.addSource("station-labels", {
		type: "geojson",
		data: {
			type: "FeatureCollection",
			features: []
		}
	});
	{
		const R = 2;
		map.addImage("station-sign", {
			width: 64,
			height: 64,
			data: new Uint8Array(2048 * R * 4)
		}, {
			pixelRatio: R,
			stretchX: [[0, 64]],
			stretchY: [[0, 64]],
			content: [
				0,
				0,
				64,
				64
			]
		});
	}
	const SIGN_LAYOUT = {
		"text-font": ["Noto Sans Bold"],
		"text-size": [
			"interpolate",
			["linear"],
			["zoom"],
			13,
			10,
			16,
			12.5,
			18,
			14
		],
		"symbol-sort-key": ["get", "rank"],
		...signCollisionLayout()
	};
	const SIGN_PAINT = {
		"text-color": "#141414",
		"text-halo-color": "#ffffff",
		"text-halo-width": 0,
		"text-opacity": 0,
		"icon-opacity": 0
	};
	map.addLayer({
		id: "station-labels",
		type: "symbol",
		source: "station-labels",
		minzoom: PHONE ? 12.01 : 13.01,
		layout: {
			"text-field": ["get", "ph"],
			...SIGN_LAYOUT
		},
		paint: SIGN_PAINT
	});
}
function registerLocationLayers({ map, geolocate, live, dotMaxzoom = 24 }) {
	map.addSource("me", {
		type: "geojson",
		data: {
			type: "FeatureCollection",
			features: []
		}
	});
	const pa = {
		"circle-pitch-alignment": "map",
		"circle-pitch-scale": "map"
	};
	map.addLayer({
		id: "me-ring",
		type: "circle",
		source: "me",
		maxzoom: dotMaxzoom,
		paint: {
			...pa,
			"circle-radius": 14,
			"circle-color": "#ffffff",
			"circle-blur": .15
		}
	});
	map.addLayer({
		id: "me-dot",
		type: "circle",
		source: "me",
		maxzoom: dotMaxzoom,
		paint: {
			...pa,
			"circle-radius": 9,
			"circle-color": "#ffd400",
			"circle-stroke-color": "#141414",
			"circle-stroke-width": 2.5
		}
	});
	geolocate.on("geolocate", (e) => {
		const { longitude: x, latitude: y } = e.coords;
		live.myLocation = [x, y];
		map.getSource("me").setData({
			type: "Feature",
			geometry: {
				type: "Point",
				coordinates: [x, y]
			},
			properties: {}
		});
	});
}
function registerExitLayers({ map, exitsReady, exitFeatures, EXIT_MINZOOM }) {
	map.addSource("exits", {
		type: "geojson",
		data: {
			type: "FeatureCollection",
			features: []
		}
	});
	{
		const R = 2, S = 52, c = document.createElement("canvas");
		c.width = S;
		c.height = 56;
		const x = c.getContext("2d");
		x.beginPath();
		x.roundRect(R, R, 48, 48, 8);
		x.fillStyle = "#141414";
		x.fill();
		x.beginPath();
		x.roundRect(2.2 * R, 2.2 * R, S - 4.4 * R, S - 4.4 * R, 6);
		x.fillStyle = "#ffd400";
		x.fill();
		map.addImage("exit-sign", x.getImageData(0, 0, S, 56), {
			pixelRatio: R,
			stretchX: [[20, 32]],
			stretchY: [[20, 32]],
			content: [
				10,
				8,
				42,
				44
			]
		});
	}
	map.addLayer({
		id: "exit-refs",
		type: "symbol",
		source: "exits",
		minzoom: EXIT_MINZOOM,
		layout: {
			"text-field": ["get", "ref"],
			"text-font": ["Noto Sans Bold"],
			"text-size": [
				"interpolate",
				["linear"],
				["zoom"],
				16,
				10,
				18,
				12.5
			],
			"icon-image": "exit-sign",
			"icon-text-fit": "both",
			"icon-text-fit-padding": [
				2,
				3,
				2,
				3
			],
			"icon-allow-overlap": true,
			"text-allow-overlap": true
		},
		paint: {
			"text-color": "#141414",
			"text-opacity": 0,
			"icon-opacity": 0
		}
	});
	map.moveLayer("exit-refs", "station-labels");
	exitsReady.then(() => map.getSource("exits").setData({
		type: "FeatureCollection",
		features: exitFeatures()
	}));
}
function addBasemap({ map, sunShadows, PHONE, CITY_STYLE, addCityLayers, applyTheme }) {
	map.addSource("ofm", {
		type: "vector",
		url: "https://tiles.openfreemap.org/planet",
		attribution: "<a href=\"https://openmaptiles.org/\" target=\"_blank\" rel=\"noopener\">© OpenMapTiles</a> <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">© OpenStreetMap</a>"
	});
	const L = (o) => map.addLayer(o, "routes");
	L({
		id: "bm-landcover",
		type: "fill",
		source: "ofm",
		"source-layer": "landcover",
		filter: [
			"in",
			["get", "class"],
			["literal", ["wood", "grass"]]
		],
		paint: {
			"fill-color": "#e1eadf",
			"fill-opacity": .7
		}
	});
	L({
		id: "bm-park",
		type: "fill",
		source: "ofm",
		"source-layer": "park",
		paint: {
			"fill-color": "#dde8da",
			"fill-opacity": .8
		}
	});
	L({
		id: "bm-water",
		type: "fill",
		source: "ofm",
		"source-layer": "water",
		paint: { "fill-color": "#cfe0e8" }
	});
	L({
		id: "bm-bld",
		type: "fill",
		source: "ofm",
		"source-layer": "building",
		minzoom: 14,
		paint: {
			"fill-color": "#dfe4e6",
			"fill-opacity": [
				"interpolate",
				["linear"],
				["zoom"],
				14,
				0,
				15,
				.9
			]
		}
	});
	map.addLayer(sunShadows, "routes");
	map.addLayer({
		id: "bm-bld3d",
		type: "fill-extrusion",
		source: "ofm",
		"source-layer": "building",
		minzoom: PHONE ? 15 : 14,
		paint: {
			"fill-extrusion-color": "#d9dde0",
			"fill-extrusion-height": [
				"interpolate",
				["linear"],
				["zoom"],
				14,
				0,
				15,
				[
					"coalesce",
					["get", "render_height"],
					10
				]
			],
			"fill-extrusion-base": [
				"coalesce",
				["get", "render_min_height"],
				0
			],
			"fill-extrusion-opacity": .5
		}
	});
	L({
		id: "bm-road-minor",
		type: "line",
		source: "ofm",
		"source-layer": "transportation",
		minzoom: 14,
		filter: [
			"in",
			["get", "class"],
			["literal", ["tertiary", "minor"]]
		],
		paint: {
			"line-color": "#ffffff",
			"line-width": [
				"interpolate",
				["linear"],
				["zoom"],
				14,
				.6,
				17,
				3
			],
			"line-opacity": .8
		}
	});
	L({
		id: "bm-road-major",
		type: "line",
		source: "ofm",
		"source-layer": "transportation",
		filter: [
			"in",
			["get", "class"],
			["literal", [
				"motorway",
				"trunk",
				"primary",
				"secondary"
			]]
		],
		paint: {
			"line-color": "#ffffff",
			"line-width": [
				"interpolate",
				["linear"],
				["zoom"],
				10,
				.8,
				14,
				3,
				17,
				9
			]
		}
	});
	try {
		if (!map.getGlyphs?.()) map.setGlyphs("https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf");
	} catch {}
	const name = [
		"coalesce",
		["get", "name:ko"],
		["get", "name"]
	], font = ["Noto Sans Regular"], halo = {
		"text-halo-color": "rgba(255,255,255,.9)",
		"text-halo-width": 1.4
	};
	L({
		id: "bm-rail",
		type: "line",
		source: "ofm",
		"source-layer": "transportation",
		filter: [
			"==",
			["get", "class"],
			"rail"
		],
		minzoom: 12,
		paint: {
			"line-color": "#c3cbcf",
			"line-width": 1.2,
			"line-dasharray": [3, 2]
		}
	});
	const sym = (id, layer, filter, minzoom, layout, paint) => map.addLayer({
		id,
		type: "symbol",
		source: "ofm",
		"source-layer": layer,
		...filter ? { filter } : {},
		minzoom,
		layout: {
			"text-field": name,
			"text-font": font,
			...layout
		},
		paint: {
			...halo,
			...paint
		}
	}, "routes");
	sym("bm-label-water", "water_name", null, 11, {
		"text-size": 12,
		"text-letter-spacing": .1
	}, { "text-color": "#5d8aa3" });
	sym("bm-label-park", "park", null, 14, {
		"text-size": 11,
		"symbol-placement": "point"
	}, { "text-color": "#5f8a5a" });
	sym("bm-label-road", "transportation_name", [
		"in",
		["get", "class"],
		["literal", [
			"motorway",
			"trunk",
			"primary",
			"secondary",
			"tertiary"
		]]
	], 13, {
		"text-size": [
			"interpolate",
			["linear"],
			["zoom"],
			13,
			10,
			17,
			13
		],
		"symbol-placement": "line",
		"text-max-angle": 30
	}, { "text-color": "#7a8589" });
	sym("bm-label-poi", "poi", [
		"all",
		[
			"<=",
			["get", "rank"],
			8
		],
		[
			"in",
			["get", "class"],
			["literal", [
				"college",
				"school",
				"hospital",
				"park",
				"stadium",
				"castle",
				"monument",
				"museum",
				"townhall",
				"attraction"
			]]
		]
	], 15, {
		"text-size": 11,
		"text-anchor": "top",
		"text-offset": [0, .3]
	}, { "text-color": "#8a7f6d" });
	sym("bm-label-place", "place", [
		"in",
		["get", "class"],
		["literal", [
			"city",
			"town",
			"suburb",
			"quarter",
			"neighbourhood"
		]]
	], 10, {
		"text-size": [
			"match",
			["get", "class"],
			"suburb",
			14,
			"quarter",
			12,
			"neighbourhood",
			11,
			15
		],
		"text-letter-spacing": .05
	}, { "text-color": "#56656a" });
	addCityLayers(map, { pack: CITY_STYLE });
	applyTheme();
}
export { addBasemap, registerExitLayers, registerLocationLayers, registerTransitLayers };
