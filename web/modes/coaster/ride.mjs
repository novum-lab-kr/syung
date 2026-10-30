import { PARK_DEFAULTS } from "../basic/park.mjs";
import { RIDE_FAR_M, rideCamera, rideFov, seatEye, seatIndex, seatLabel, seatNumber, seatRows } from "./first_person.mjs";
// web/modes/coaster/ride.mts
function createCoasterRide({ map, maplibregl, RIDE_PX = 0, planner, colors, cityViaduct, sheetBody, closeSheet, showTrainPopup, applyTheme, effectiveTheme, coasterBodyPx, TRAIN_MIN_PX, mercStop, trainPose, trackPoint, blendShift, toRide, fromRide, coasterCarFrame, coasterRailFrames, riderState, trainLngLat, stopFollowing, isCoaster, getSheetTrain, getSleeperM, onRide }) {
	let ride = null, rideSeat = {
		car: 1,
		row: 1,
		side: -1
	};
	const riding = (plan) => ride && ride.id === plan.id ? ride.snap : null;
	const rideRows = (plan) => {
		const unit = 1 / (512 * 2 ** 18), body = coasterBodyPx(18), m = mercStop(plan.t.line, plan.seq[0]).meterInMercatorCoordinateUnits(), n = plan.cars;
		return seatRows(Math.max(n * plan.carMetres * m, TRAIN_MIN_PX * unit, n * body * 1.6 * unit) / n / unit - 1.4, body);
	};
	const rideBar = document.createElement("div");
	rideBar.className = "ride-bar";
	rideBar.hidden = true;
	rideBar.setAttribute("role", "status");
	rideBar.innerHTML = "<span class=\"dot\"></span><span class=\"txt\"></span><button type=\"button\" class=\"ride-off\">내리기</button>";
	rideBar.querySelector(".ride-off").onclick = () => stopRide(true);
	sheetBody.addEventListener("click", (e) => {
		const b = e.target.closest(".ride-pick .seat");
		if (b) {
			rideSeat = {
				car: +b.dataset.car,
				row: +b.dataset.row,
				side: +b.dataset.side
			};
			for (const x of sheetBody.querySelectorAll(".ride-pick .seat")) {
				const on = x === b;
				x.classList.toggle("on", on);
				x.setAttribute("aria-pressed", String(on));
			}
			const go = sheetBody.querySelector(".ride-go");
			if (go) go.textContent = `${seatLabel(rideSeat)}에 타기`;
			return;
		}
		if (e.target.closest(".ride-go") && getSheetTrain()) startRide(getSheetTrain());
	});
	function rideBarText(plan) {
		rideBar.style.setProperty("--c", colors[plan.t.line] || "#52646a");
		const text = rideBar.querySelector(".txt").textContent = `${plan.t.line} ${seatLabel(ride.seat)} · ${riderState(plan)}`;
		onRide?.({
			riding: true,
			id: ride.id,
			text
		});
	}
	function startRide(id) {
		const plan = planner.plans.find((p) => p.id === id);
		if (!plan || !isCoaster() || ride) return;
		const back = {
			center: map.getCenter(),
			zoom: map.getZoom(),
			bearing: map.getBearing(),
			elevation: map.getCenterElevation(),
			maxPitch: map.getMaxPitch(),
			fov: map.getVerticalFieldOfView(),
			clamp: map.getCenterClampedToGround()
		};
		closeSheet();
		map.stop();
		stopFollowing();
		ride = {
			id,
			seat: { ...rideSeat },
			snap: null,
			seen: performance.now(),
			back
		};
		back.px = map.getPixelRatio();
		if (RIDE_PX && RIDE_PX < back.px) map.setPixelRatio(RIDE_PX);
		map.setMaxPitch(180);
		map.setCenterClampedToGround(false);
		map.setVerticalFieldOfView(rideFov(map.getContainer().clientWidth, map.getContainer().clientHeight));
		const S = PARK_DEFAULTS.sky[effectiveTheme() === "dark" ? "dark" : "light"];
		back.sky = map.getSky();
		map.setSky({
			"sky-color": S.sky,
			"horizon-color": S.horizon,
			"fog-color": S.horizon,
			"sky-horizon-blend": .45,
			"horizon-fog-blend": .7,
			"fog-ground-blend": .9,
			"atmosphere-blend": 0
		});
		map.getContainer().style.setProperty("--ride-ground", S.ground);
		rideBarText(plan);
		rideBar.hidden = false;
		document.body.classList.add("riding");
		applyTheme();
		ride.timer = setInterval(() => {
			const pl = ride && planner.plans.find((p) => p.id === ride.id);
			if (pl) rideBarText(pl);
		}, 1e3);
		rideFrame();
		map.triggerRepaint();
	}
	function stopRide(reopen) {
		if (!ride) return;
		const r = ride;
		ride = null;
		clearInterval(r.timer);
		rideBar.hidden = true;
		onRide?.({
			riding: false,
			id: null,
			text: ""
		});
		document.body.classList.remove("riding");
		applyTheme();
		map._camera.transform.clearNearFarZOverride();
		map.setVerticalFieldOfView(r.back.fov);
		map.setSky(r.back.sky);
		if (map.getPixelRatio() !== r.back.px) map.setPixelRatio(r.back.px);
		const plan = planner.plans.find((p) => p.id === r.id);
		map.jumpTo({
			center: plan ? trainLngLat(plan) : r.back.center,
			zoom: r.back.zoom,
			bearing: r.back.bearing,
			pitch: r.back.pitch,
			roll: 0,
			elevation: r.back.elevation
		});
		map.setMaxPitch(r.back.maxPitch);
		map.setCenterClampedToGround(r.back.clamp);
		if (reopen && plan && isCoaster()) showTrainPopup(plan);
		map.triggerRepaint();
	}
	function rideFrame() {
		if (!ride) return;
		const plan = planner.plans.find((p) => p.id === ride.id), now = performance.now();
		if (!plan) {
			if (now - ride.seen > 5e3) stopRide(false);
			return;
		}
		ride.seen = now;
		const unit = 1 / (512 * 2 ** 18), bodyPx = coasterBodyPx(18), lanePx = cityViaduct.train(18, bodyPx).lanePx, n = plan.cars;
		const pose = trainPose(plan), shift = blendShift(plan, trackPoint(plan, pose.dist)), m = mercStop(plan.t.line, plan.seq[0]).meterInMercatorCoordinateUnits();
		const total = Math.max(n * plan.carMetres * m, TRAIN_MIN_PX * unit, n * bodyPx * 1.6 * unit), car = total / n, tail = toRide(plan, pose.dist) - total / 2;
		const P = (d) => {
			const q = trackPoint(plan, fromRide(plan, d));
			if (shift) {
				q.x += shift[0];
				q.y += shift[1];
			}
			return q;
		};
		const { j } = seatIndex(ride.seat, n, 4), c = coasterCarFrame(P, tail, car, j, n, unit, bodyPx, lanePx, 1.4 * unit);
		if (!c) return;
		const rows = seatRows(c.L, bodyPx), { i, side } = seatIndex(ride.seat, n, rows);
		ride.snap = {
			pose,
			shift,
			j,
			k: seatNumber(i, side)
		};
		const { E, F, U } = seatEye(c.fr, c.L, bodyPx, unit, rows, i, side), mpu = new maplibregl.MercatorCoordinate(E[0], E[1]).meterInMercatorCoordinateUnits();
		const RT = PARK_DEFAULTS.rideTrack, step = getSleeperM() * m, d0 = Math.floor((tail - RT.behindM * m) / step) * step;
		if (!ride.rail || ride.rail.plan !== plan || shift || Math.abs(d0 - ride.rail.d0) > RT.rebuildM * m) ride.rail = {
			plan,
			d0,
			frames: [lanePx, -lanePx].flatMap((l) => coasterRailFrames(P, d0, tail + total + RT.aheadM * m, step, unit, bodyPx, l, tail + total, m)),
			mpu: m,
			dirty: true
		};
		ride.eye = E;
		const box = map.getContainer(), fov = rideFov(box.clientWidth, box.clientHeight);
		if (Math.abs(map.getVerticalFieldOfView() - fov) > .01) map.setVerticalFieldOfView(fov);
		const cam = ride.cam = rideCamera(E, F, U, {
			ctcd: .5 / Math.tan(fov * Math.PI / 360) * box.clientHeight,
			mpu
		});
		map.jumpTo({
			center: new maplibregl.MercatorCoordinate(cam.x, cam.y).toLngLat(),
			zoom: cam.zoom,
			elevation: cam.elevation,
			bearing: cam.bearing,
			pitch: cam.pitch,
			roll: cam.roll,
			padding: {
				top: 0,
				bottom: 0,
				left: 0,
				right: 0
			}
		});
		const ppm = 512 * 2 ** 18 * mpu;
		map._camera.transform.overrideNearFarZ(2 * ppm, RIDE_FAR_M * ppm);
	}
	return {
		riding,
		rideRows,
		startRide,
		stopRide,
		rideFrame,
		rideBar,
		get ride() {
			return ride;
		},
		get seat() {
			return rideSeat;
		},
		set seat(v) {
			rideSeat = v;
		}
	};
}
export { createCoasterRide };
