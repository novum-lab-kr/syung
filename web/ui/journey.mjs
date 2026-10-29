// web/ui/journey.mts
function createJourneyMap({ map, maplibregl, colors, byId, cityCoords, stopPos, cityViaduct, sheetPad, journeyCasingPaint, journeyRidePaint, journeyStopPaint, live }) {
	function rideCoords(line, ids) {
		const out = [];
		for (let i = 1; i < ids.length; i++) {
			const a = ids[i - 1], b = ids[i];
			let c = cityCoords(line, Math.min(a, b), Math.max(a, b));
			if (a > b) c = c.slice().reverse();
			out.push(...out.length ? c.slice(1) : c);
		}
		return out;
	}
	function showRoute(plan, busSelection = false, refit = true) {
		displayedRoute = {
			plan,
			busSelection
		};
		busRouteFocus = busSelection;
		if (!busSelection) {
			setSubwayOff(false);
			live.busLayer?.setJourney(plan.legs);
		}
		const feats = [], pts = [];
		plan.legs.forEach((l, i) => {
			if (l.type === "walk") feats.push({
				type: "Feature",
				properties: { kind: "walk" },
				geometry: {
					type: "LineString",
					coordinates: l.path
				}
			});
			else if (l.type === "bus") {} else {
				const c = rideCoords(l.line, l.stations);
				feats.push({
					type: "Feature",
					properties: {
						kind: "ride",
						color: colors[l.line] || "#888"
					},
					geometry: {
						type: "LineString",
						coordinates: c
					}
				});
				const s0 = byId.get(l.stations[0]), s1 = byId.get(l.stations[l.stations.length - 1]);
				for (const s of [s0, s1]) if (s) pts.push({
					type: "Feature",
					properties: {
						kind: "stop",
						color: colors[l.line] || "#888"
					},
					geometry: {
						type: "Point",
						coordinates: stopPos(l.line, s)
					}
				});
				const prev = plan.legs[i - 1], next = plan.legs[i + 1];
				if (prev && prev.type === "walk" && prev.path && s0) feats.push({
					type: "Feature",
					properties: { kind: "inside" },
					geometry: {
						type: "LineString",
						coordinates: [prev.path[prev.path.length - 1], stopPos(l.line, s0)]
					}
				});
				if (next && next.type === "walk" && next.path && s1) feats.push({
					type: "Feature",
					properties: { kind: "inside" },
					geometry: {
						type: "LineString",
						coordinates: [stopPos(l.line, s1), next.path[0]]
					}
				});
			}
		});
		const first = plan.legs[0], last = plan.legs[plan.legs.length - 1];
		if (first.path && !busSelection) pts.push({
			type: "Feature",
			properties: { kind: "start" },
			geometry: {
				type: "Point",
				coordinates: first.path[0]
			}
		});
		if (last.path && !busSelection) pts.push({
			type: "Feature",
			properties: { kind: "end" },
			geometry: {
				type: "Point",
				coordinates: last.path[last.path.length - 1]
			}
		});
		const data = {
			type: "FeatureCollection",
			features: [...feats, ...pts]
		};
		if (!map.getSource("journey")) {
			map.addSource("journey-veil", {
				type: "geojson",
				data: {
					type: "Feature",
					geometry: {
						type: "Polygon",
						coordinates: [[
							[-180, -85],
							[180, -85],
							[180, 85],
							[-180, 85],
							[-180, -85]
						]]
					}
				}
			});
			map.addLayer({
				id: "journey-veil",
				type: "fill",
				source: "journey-veil",
				paint: {
					"fill-color": veilColor(),
					"fill-opacity": .45,
					"fill-opacity-transition": { duration: 300 }
				}
			}, map.getLayer("bm-label-water") ? "bm-label-water" : void 0);
			map.addSource("journey", {
				type: "geojson",
				data
			});
			map.addLayer({
				id: "journey-casing",
				type: "line",
				source: "journey",
				filter: [
					"==",
					["get", "kind"],
					"ride"
				],
				layout: {
					"line-cap": "round",
					"line-join": "round"
				},
				paint: journeyCasingPaint()
			});
			map.addLayer({
				id: "journey-ride",
				type: "line",
				source: "journey",
				filter: [
					"==",
					["get", "kind"],
					"ride"
				],
				layout: {
					"line-cap": "round",
					"line-join": "round"
				},
				paint: journeyRidePaint()
			});
			map.addLayer({
				id: "journey-walk",
				type: "line",
				source: "journey",
				filter: [
					"==",
					["get", "kind"],
					"walk"
				],
				layout: {
					"line-cap": "round",
					"line-join": "round"
				},
				paint: {
					"line-color": walkColor(),
					"line-width": [
						"interpolate",
						["linear"],
						["zoom"],
						10,
						3,
						16,
						6
					],
					"line-dasharray": [.1, 1.8]
				}
			});
			map.addLayer({
				id: "journey-inside",
				type: "line",
				source: "journey",
				filter: [
					"==",
					["get", "kind"],
					"inside"
				],
				layout: { "line-cap": "round" },
				paint: {
					"line-color": walkColor(),
					"line-opacity": .45,
					"line-width": [
						"interpolate",
						["linear"],
						["zoom"],
						10,
						2,
						16,
						4
					],
					"line-dasharray": [.1, 2.2]
				}
			});
			map.addLayer({
				id: "journey-stop",
				type: "circle",
				source: "journey",
				filter: [
					"==",
					["get", "kind"],
					"stop"
				],
				paint: journeyStopPaint()
			});
			map.addLayer({
				id: "journey-ends",
				type: "circle",
				source: "journey",
				filter: [
					"in",
					["get", "kind"],
					["literal", ["start", "end"]]
				],
				paint: {
					"circle-radius": 8,
					"circle-color": [
						"match",
						["get", "kind"],
						"start",
						"#ffd400",
						"#141414"
					],
					"circle-stroke-color": [
						"match",
						["get", "kind"],
						"start",
						"#141414",
						"#ffd400"
					],
					"circle-stroke-width": 3
				}
			});
		} else map.getSource("journey").setData(data);
		live.busLayer?.raiseRoute();
		focusRoute(true);
		const all = data.features.flatMap((f) => f.geometry.type === "Point" ? [f.geometry.coordinates] : f.geometry.coordinates);
		all.push(...plan.legs.filter((l) => l.type === "bus").flatMap((l) => l.path));
		routeBounds = all.length ? all.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(all[0], all[0])) : null;
		if (refit) fitRoute(sheetPad() + 30);
	}
	let displayedRoute = null;
	let routeBounds = null, busRouteFocus = false;
	function fitRoute(bottom, right = 40) {
		if (!routeBounds) return;
		const p = map.getPadding?.() || {}, less = (v, k) => Math.max(0, v - (p[k] || 0));
		map.fitBounds(routeBounds, {
			padding: {
				top: less(90, "top"),
				bottom: less(bottom, "bottom"),
				left: less(40, "left"),
				right: less(right, "right")
			},
			maxZoom: 16,
			pitch: 0,
			duration: 800
		});
	}
	function clearRoute() {
		displayedRoute = null;
		live.busLayer?.clearSelection({ journey: true });
		routeBounds = null;
		if (map.getSource("journey")) map.getSource("journey").setData({
			type: "FeatureCollection",
			features: []
		});
		focusRoute(false);
	}
	const veilColor = () => document.documentElement.dataset.theme === "dark" ? "#0b0c0e" : "#fbfaf4";
	const walkColor = () => document.documentElement.dataset.theme === "dark" ? "#f1efe6" : "#141414";
	let routeFocus = false;
	let subwayOff = false;
	function setSubwayOff(on) {
		if (subwayOff === on) return;
		subwayOff = on;
		for (const id of [
			"routes",
			"stations-casing",
			"stations",
			"station-names",
			"station-labels",
			"exit-refs"
		]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "none" : "visible");
		live.stationAlpha = on ? 0 : routeFocus ? .35 : 1;
		map.triggerRepaint();
	}
	const setRouteOpacity = () => {
		if (map.getLayer("routes")) map.setPaintProperty("routes", "line-opacity", live.settings.track.kind !== "ground" ? cityViaduct.routeOpacity(routeFocus) : routeFocus ? .25 : .9);
		if (map.getLayer("journey-ride")) {
			const o = live.settings.track.kind !== "ground" ? cityViaduct.deckFade() : 1;
			for (const id of ["journey-casing", "journey-ride"]) map.setPaintProperty(id, "line-opacity", o);
			for (const k of ["circle-opacity", "circle-stroke-opacity"]) map.setPaintProperty("journey-stop", k, o);
		}
	};
	let ridesOf = null, ridesList = null;
	const rides = () => {
		if (ridesOf !== displayedRoute) {
			ridesOf = displayedRoute;
			ridesList = displayedRoute && !displayedRoute.busSelection ? displayedRoute.plan.legs.filter((l) => l.type === "ride").map((l) => ({
				...l,
				pairs: ridePairs(l.stations || [])
			})) : null;
		}
		return ridesList;
	};
	const ridePairs = (ids) => {
		const m = /* @__PURE__ */ new Map();
		for (let k = 1; k < ids.length; k++) {
			const b = String(ids[k]);
			if (!m.has(b)) m.set(b, /* @__PURE__ */ new Set());
			m.get(b).add(String(ids[k - 1]));
		}
		return m;
	};
	const passes = (seq, pairs) => {
		const seen = /* @__PURE__ */ new Set();
		for (const s of seq) {
			const id = String(s.id), from = pairs.get(id);
			if (from) {
				for (const a of from) if (seen.has(a)) return true;
			}
			seen.add(id);
		}
		return false;
	};
	const ahead = (p, dist) => {
		let i = 0;
		while (i < p.seq.length - 1 && p.cum[i + 1] < dist) i++;
		return p.seq.slice(i);
	};
	const isJourneyTrain = (p, l) => !!l.trainNo && p.id === `${l.line}:${l.trainNo}`;
	function trainShown(p, dist) {
		const R = rides();
		return !R || R.some((l) => l.line === p.t.line && (isJourneyTrain(p, l) || passes(ahead(p, dist), l.pairs)));
	}
	function journeyTrain(p) {
		return !!rides()?.some((l) => isJourneyTrain(p, l));
	}
	function journeyRides() {
		return rides();
	}
	function rideLines() {
		const L = [...new Set((rides() || []).map((l) => l.line))];
		return L.length ? L : null;
	}
	function focusRoute(on) {
		if (map.getLayer("journey-veil")) {
			map.setLayoutProperty("journey-veil", "visibility", on ? "visible" : "none");
			map.setPaintProperty("journey-veil", "fill-color", veilColor());
			map.setPaintProperty("journey-walk", "line-color", walkColor());
			if (map.getLayer("journey-inside")) map.setPaintProperty("journey-inside", "line-color", walkColor());
		}
		routeFocus = on;
		setRouteOpacity();
		live.stationAlpha = subwayOff ? 0 : on ? .35 : 1;
		map.triggerRepaint();
		if (on) {
			for (const id of ["me-ring", "me-dot"]) if (map.getLayer(id)) map.moveLayer(id);
		}
	}
	return {
		rideCoords,
		showRoute,
		fitRoute,
		clearRoute,
		setSubwayOff,
		setRouteOpacity,
		focusRoute,
		trainShown,
		journeyTrain,
		rideLines,
		journeyRides,
		get displayedRoute() {
			return displayedRoute;
		},
		set displayedRoute(v) {
			displayedRoute = v;
		},
		get routeBounds() {
			return routeBounds;
		},
		set routeBounds(v) {
			routeBounds = v;
		},
		get busRouteFocus() {
			return busRouteFocus;
		},
		set busRouteFocus(v) {
			busRouteFocus = v;
		},
		get routeFocus() {
			return routeFocus;
		},
		set routeFocus(v) {
			routeFocus = v;
		},
		get subwayOff() {
			return subwayOff;
		},
		set subwayOff(v) {
			subwayOff = v;
		}
	};
}
export { createJourneyMap };
