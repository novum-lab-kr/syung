// web/map/overlay.mts
function createTrainOverlay({ map, maplibregl, signTextSize, rider, perspectiveRatio, signRows, drawStationSigns, effectiveTheme, REDUCED, TRAIN_FPS, TrainLayer, BuildingDepth, cityOn, cityXrayTargets, mapPalette, coasterGeo, coasterTrack, geom, edgeOffset, coasterBodyPx, trainBodyPx, cityViaduct, CORK_HEART, PHONE, trainFrameSoon, CityLife, CITY_STYLE, cityPack, $, sunPosition, NightLayer, journeyMap, exitPillars, RIDE_ZOOM, nearMatrix, COCKPIT_NEAR_M, AvatarRenderer, avatarScale, AVATAR_MINZOOM, live }) {
	const c = document.createElement("canvas");
	c.className = "train-overlay";
	map.getCanvas().after(c);
	c.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
	const gl = c.getContext("webgl2", {
		alpha: true,
		premultipliedAlpha: true,
		antialias: true
	});
	const sc = document.createElement("canvas");
	sc.className = "station-signs";
	c.after(sc);
	sc.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
	const SIGN_PR = Math.min(globalThis.devicePixelRatio || 1, PHONE ? 2 : 3);
	const sctx = sc.getContext("2d");
	let signFeatures = [], signAt = 0, signMatrix = null, signTimer = 0, signShown = false, signQM = null;
	const showSigns = (on) => {
		if (on !== signShown) {
			signShown = on;
			sc.style.visibility = on ? "" : "hidden";
		}
	};
	const drawSigns = (M) => {
		const m = map.getCanvas(), W = m.clientWidth, H = m.clientHeight;
		signMatrix = M;
		live.frameStats.signs++;
		const SW = Math.round(W * SIGN_PR), SH = Math.round(H * SIGN_PR);
		if (sc.width !== SW || sc.height !== SH) {
			sc.width = SW;
			sc.height = SH;
		}
		sc.style.width = m.style.width;
		sc.style.height = m.style.height;
		sctx.clearRect(0, 0, sc.width, sc.height);
		const now = performance.now();
		const moved = !signQM || signQM.length !== M.length || signQM.some((v, i) => v !== M[i]);
		if (now - signAt > (moved ? 150 : 1e3)) {
			signAt = now;
			signQM = Array.from(M);
			live.frameStats.signQueries++;
			signFeatures = map.getLayer("station-labels") ? map.queryRenderedFeatures({ layers: ["station-labels"] }) : [];
		}
		if (!signFeatures.length) {
			showSigns(false);
			return;
		}
		const clip = (x, y) => [
			M[0] * x + M[4] * y + M[12],
			M[1] * x + M[5] * y + M[13],
			M[3] * x + M[7] * y + M[15]
		];
		const O = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()), cw = clip(O.x, O.y)[2], size = signTextSize(map.getZoom()), seen = /* @__PURE__ */ new Set(), items = [];
		for (const f of signFeatures) {
			const [lng, lat] = f.geometry.coordinates, k = `${lng},${lat}`;
			if (seen.has(k)) continue;
			seen.add(k);
			const q = maplibregl.MercatorCoordinate.fromLngLat([lng, lat]), [x, y, w] = clip(q.x, q.y);
			if (!(w > 0)) continue;
			const sx = (x / w * .5 + .5) * W, sy = (.5 - y / w * .5) * H;
			if (rider.ride && !(sy >= 0 && sy <= H)) continue;
			items.push({
				x: sx,
				y: sy,
				scale: perspectiveRatio(cw, w),
				size,
				rows: signRows(f.properties),
				phase: (lng * 977 + lat * 613) % (Math.PI * 2)
			});
		}
		items.sort((a, b) => a.y - b.y);
		showSigns(items.length > 0);
		drawStationSigns(sctx, items, {
			dpr: SW / Math.max(1, W),
			dark: effectiveTheme() === "dark",
			alpha: live.stationAlpha,
			now,
			still: REDUCED.matches
		});
		if (!REDUCED.matches && !signTimer && !document.hidden) signTimer = setTimeout(() => {
			signTimer = 0;
			if (!map.isMoving() && signMatrix && !(live.trainFrameDue - performance.now() < Math.max(40, live.frameMs))) drawSigns(signMatrix);
		}, live.frameMs);
	};
	map.on("idle", () => {
		signAt = 0;
		if (signMatrix) drawSigns(signMatrix);
	});
	const layer = new TrainLayer();
	layer.onAdd(map, gl);
	const walls = new BuildingDepth(gl);
	let lifeUnits = null;
	const lifeUnitsFor = (gl, S) => {
		if (S.city.life.units && live.LifeUnits) return lifeUnits ??= new live.LifeUnits();
		if (lifeUnits) {
			lifeUnits.dispose(gl);
			lifeUnits = null;
		}
		return null;
	};
	let avatar = null, rides = null, night = null, festoon = null, cityLife = null, ridePlacement = null, bloom = null, pixels = null;
	live.drawTrains = () => {
		live.frameStats.trains++;
		const S = live.settings, K = S.track.kind, park = S.park.enabled;
		const m = map.getCanvas();
		if (c.width !== m.width || c.height !== m.height) {
			c.width = m.width;
			c.height = m.height;
		}
		c.style.width = m.style.width;
		c.style.height = m.style.height;
		gl.viewport(0, 0, c.width, c.height);
		gl.clearColor(0, 0, 0, 0);
		gl.depthMask(true);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		const pd = map.painter.transform.getProjectionDataForCustomLayer(true);
		if (cityOn() && live.cityBuildings) live.cityBuildings.setXray(S.city.xray ? cityXrayTargets() : null);
		const drawn = cityOn() && live.cityBuildings ? live.cityBuildings.drawDepth(gl, pd.mainMatrix) : walls.draw(pd.mainMatrix), behind = drawn && !cityOn() ? 1 - mapPalette().bld3dOpacity : 0;
		if (park && live.kitReady && coasterGeo.bld?.towers?.length) {
			if (!rides) {
				rides = new live.RideLayer(coasterGeo.bld.towers, {
					deferPlacement: true,
					landmarks: S.park.landmarkRides
				});
				rides.init(gl, maplibregl);
				if (window.__subwayWebGL) window.__subwayWebGL.rides = rides;
				if (ridePlacement) rides.setSites(ridePlacement.sites);
				else ridePlacement = new live.CoasterRidePlacement(rides.candidates.filter((c) => !c.lotte && c.height_m >= S.park.towerM), {
					map,
					minH: live.cityBuildings.P.minH,
					missingH: live.cityBuildings.P.missingH,
					getTracks: (bounds) => live.sampleRideTracks(coasterTrack, bounds, {
						geometry: (e) => geom(e.line, e.lo, e.hi),
						offset: (e) => edgeOffset(e.line, e.lo, e.hi),
						bodyPx: coasterBodyPx(14),
						lanePx: cityViaduct.train(14, coasterBodyPx(14)).lanePx,
						heart: CORK_HEART
					}),
					onChange: (sites) => {
						rides?.setSites(sites);
						map.triggerRepaint();
					}
				});
				window.__subwayWebGL.ridePlacement = ridePlacement;
			}
			const b = map.getBounds(), A = maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()), B = maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
			if (coasterTrack.edges) ridePlacement.update([
				A.x,
				B.y,
				B.x,
				A.y
			]);
			rides.render(gl, pd.mainMatrix, {
				now: performance.now(),
				dark: effectiveTheme() === "dark",
				night: effectiveTheme() === "dark",
				pixelRatio: c.width / Math.max(1, m.clientWidth),
				zoom: map.getZoom(),
				phone: PHONE,
				reducedMotion: REDUCED.matches,
				bounds: [
					A.x,
					B.y,
					B.x,
					A.y
				]
			});
			if (rides.animating()) trainFrameSoon(1e3 / TRAIN_FPS);
		} else if (!park && rides) {
			rides.dispose(gl);
			rides = null;
			if (window.__subwayWebGL) delete window.__subwayWebGL.rides;
		}
		if (S.city.enabled) {
			if (!cityLife) {
				cityLife = new CityLife({
					pack: CITY_STYLE,
					exits: () => Object.values(exitPillars.d.getExits()).flat(),
					deck: (x, y, r) => cityViaduct.deckProbe(x, y, r)
				});
				cityLife.init(gl, maplibregl, map);
				window.__subwayWebGL.cityLife = cityLife;
			}
			const b = map.getBounds(), A = maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()), B = maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
			cityLife.render(gl, pd.mainMatrix, {
				peopleDeck: S.city.heritage ? live.cityLandmarks?.mon?.deck ?? null : null,
				treeKeepOut: S.city.heritage ? live.cityLandmarks?.mon?.inPalace ?? null : null,
				look: cityPack(),
				night: live.night,
				now: performance.now(),
				zoom: map.getZoom(),
				bearing: map.getBearing(),
				dark: effectiveTheme() === "dark",
				tone: S.city.tone,
				lampPool: S.city.lampPool,
				cars: S.city.life.cars,
				crossings: S.city.life.crossings,
				people: true,
				units: S.city.life.units,
				lifeUnits: lifeUnitsFor(gl, S),
				phone: PHONE,
				reducedMotion: REDUCED.matches,
				pixelRatio: c.width / Math.max(1, m.clientWidth),
				bounds: [
					A.x,
					B.y,
					B.x,
					A.y
				],
				mapOn: true,
				moving: map.isMoving(),
				sun: sunPosition()
			});
			if (cityLife.animating()) trainFrameSoon(1e3 / TRAIN_FPS);
		}
		if (live.busLayer) live.busLayer.look = S.buses.look;
		live.busLayer?.render(gl, pd.mainMatrix, behind);
		if (K !== "ground") {
			const b = map.getBounds(), A = maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()), B = maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast()), zoom = map.getZoom();
			cityViaduct.setPack(cityPack());
			if (cityViaduct.render(gl, pd.mainMatrix, {
				now: performance.now(),
				zoom,
				dark: effectiveTheme() === "dark",
				phone: PHONE,
				bounds: [
					A.x,
					B.y,
					B.x,
					A.y
				],
				sun: sunPosition(),
				life: cityLife,
				selected: live.selected,
				moving: map.isMoving(),
				bodyPx: trainBodyPx(zoom),
				journey: journeyMap.journeyRides()
			})) trainFrameSoon(50);
			live.cityLandmarks?.render(gl, pd.mainMatrix, {
				zoom,
				dark: effectiveTheme() === "dark",
				look: S.city.landmarks,
				sun: sunPosition(),
				phone: PHONE
			});
		}
		coasterTrack.render(gl, pd.mainMatrix, behind);
		layer.render(gl, {
			defaultProjectionData: pd,
			walls: drawn || !!rides && park,
			occlude: behind
		});
		{
			const me = live.me.at(), zoom = map.getZoom();
			if (me && zoom >= AVATAR_MINZOOM && !rider.ride) {
				const q = maplibregl.MercatorCoordinate.fromLngLat(me.lngLat), O = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()), b = map.getBearing() * Math.PI / 180;
				if (!avatar) avatar = new AvatarRenderer();
				avatar.render(gl, pd.mainMatrix, {
					look: S.me.look,
					world: [q.x, q.y],
					origin: [O.x, O.y],
					yaw: me.yaw ?? Math.atan2(Math.cos(b), -Math.sin(b)),
					scale: avatarScale(zoom),
					unit: 1 / (512 * 2 ** zoom),
					walk: REDUCED.matches ? 0 : me.walk,
					phase: me.phase,
					dark: effectiveTheme() === "dark",
					occlude: Math.max(behind, .35)
				});
				if (me.animating) trainFrameSoon(1e3 / TRAIN_FPS);
			}
		}
		if (park && effectiveTheme() === "dark" && coasterTrack.edges) {
			if (!night) {
				night = new NightLayer();
				night.init(gl);
			}
			{
				const bp = coasterTrack.bulbs();
				if (night.trackSrc !== bp) {
					night.setTrackBulbs(bp, coasterTrack.bulbRgb);
					night.trackSrc = bp;
				}
			}
			const b = map.getBounds(), A = maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()), B = maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
			night.render(gl, pd.mainMatrix, {
				now: performance.now(),
				zoom: map.getZoom(),
				phone: PHONE,
				reducedMotion: REDUCED.matches,
				bounds: [
					A.x,
					B.y,
					B.x,
					A.y
				],
				pixelRatio: c.width / Math.max(1, m.clientWidth)
			});
			if (live.kitReady) {
				if (!festoon) {
					festoon = new live.FestoonLayer();
					festoon.init(gl);
					if (window.__subwayWebGL) window.__subwayWebGL.festoon = festoon;
				}
				festoon.update(map);
				festoon.pump(map, () => map.triggerRepaint());
				festoon.render(gl, pd.mainMatrix, {
					now: performance.now(),
					zoom: map.getZoom(),
					phone: PHONE,
					reducedMotion: REDUCED.matches,
					bounds: [
						A.x,
						B.y,
						B.x,
						A.y
					],
					pixelRatio: c.width / Math.max(1, m.clientWidth)
				});
			}
			if (night.animating() || festoon?.animating() && !REDUCED.matches) trainFrameSoon(1e3 / TRAIN_FPS);
		} else if (night || festoon) {
			night?.dispose(gl);
			night = null;
			festoon?.dispose(gl);
			festoon = null;
			if (window.__subwayWebGL) delete window.__subwayWebGL.festoon;
		}
		if (S.city.xray && live.cityBuildings) live.cityBuildings.drawGlass(gl, pd.mainMatrix);
		{
			const n = live.night;
			if (n.bloom && live.NightBloom) {
				if (!bloom) {
					bloom = new live.NightBloom();
					bloom.init(gl);
				}
				const B = {
					...n.N.bloom,
					...n.N.bloom.overlay,
					...live.bloomTune
				};
				bloom.render(gl, {
					strength: B.strength,
					threshold: B.threshold,
					knee: B.knee,
					levels: B.levels,
					tint: B.tint ? [
						1,
						3,
						5
					].map((i) => parseInt(B.tint.slice(i, i + 2), 16) / 255) : [
						1,
						1,
						1
					]
				});
			} else if (bloom) {
				bloom.dispose(gl);
				bloom = null;
			}
		}
		if (!journeyMap.subwayOff) exitPillars.render(gl, pd.mainMatrix, m.clientWidth, m.clientHeight, c.width / Math.max(1, m.clientWidth), cityOn() && drawn, cityOn() && cityLife ? (id, lon, lat) => cityViaduct.hasStair(id, lon, lat) ? null : cityLife.exitSpot(lon, lat) : null);
		if (rider.ride && park && layer.c88ride?.n) {
			const ppm = 512 * 2 ** RIDE_ZOOM * maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()).meterInMercatorCoordinateUnits();
			gl.depthMask(true);
			gl.clear(gl.DEPTH_BUFFER_BIT);
			layer.c88ride.draw(gl, nearMatrix(pd.mainMatrix, COCKPIT_NEAR_M * ppm), layer.ox, layer.oy, {
				...layer.c88o,
				part: "body",
				occlude: 0
			});
		}
		{
			const X = S.map.pixel;
			if (X.enabled && X.palette !== "none" && live.PixelPalette) {
				if (!pixels) {
					pixels = new live.PixelPalette();
					pixels.init(gl);
				}
				pixels.render(gl, {
					palette: X.palette,
					outline: X.outline,
					alpha: true
				});
			} else if (pixels) {
				pixels.dispose(gl);
				pixels = null;
			}
		}
		if (S.city.heritage && live.cityLandmarks) {
			const b = map.getBounds(), A = maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()), B = maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast());
			live.cityLandmarks.renderMonuments(gl, pd.mainMatrix, {
				zoom: map.getZoom(),
				dark: effectiveTheme() === "dark",
				sun: sunPosition(),
				bounds: [
					A.x,
					B.y,
					B.x,
					A.y
				],
				phone: PHONE,
				center: [map.getCenter().lng, map.getCenter().lat]
			});
		} else if (live.cityLandmarks?.mon || live.cityLandmarks?.monp) live.cityLandmarks.releaseMonuments();
		drawSigns(pd.mainMatrix);
	};
	map.on("render", () => {
		live.frameStats.mapRenders++;
		live.drawTrains();
	});
	let wallTimer = 0;
	const wallsSoon = () => {
		clearTimeout(wallTimer);
		wallTimer = setTimeout(() => {
			if (map.isMoving()) return;
			walls.rebuild();
			requestAnimationFrame(live.drawTrains);
		}, 250);
	};
	live.wallsNow = () => {
		walls.rebuild();
		requestAnimationFrame(live.drawTrains);
	};
	map.on("moveend", wallsSoon);
	map.on("sourcedata", (e) => {
		if (e.sourceId === "ofm" && e.isSourceLoaded) wallsSoon();
	});
}
export { createTrainOverlay };
