// web/ui/sheet.mts
function createBottomSheet({ map, maplibregl, planner, trackPoint, trainPose, laneOffsetPx, animFrame, FOLLOW_FPS, fitRoute, live }) {
	const sheet = document.createElement("section");
	sheet.className = "sheet";
	sheet.hidden = true;
	sheet.setAttribute("aria-label", "상세 정보");
	sheet.innerHTML = "<button type=\"button\" class=\"sheet-grab\" aria-label=\"닫기\" title=\"끌어내리거나 눌러서 닫기\"></button><button type=\"button\" class=\"sheet-close\" aria-label=\"닫기\">✕</button><div class=\"sheet-body\"></div><button type=\"button\" class=\"sheet-follow\" hidden>이 열차 따라가기</button>";
	const sheetBody = sheet.querySelector(".sheet-body"), followBtn = sheet.querySelector(".sheet-follow");
	let sheetToken = 0, sheetTrain = null, following = null, easing = false;
	let followBus = null, busMiss = 0;
	function openSheet(html, source = "subway") {
		tuck(false);
		if (source !== "bus") live.busLayer?.clearSelection();
		sheetBody.innerHTML = html;
		sheet.hidden = false;
		sheet.style.transform = "";
		sheet.style.transition = "";
		requestAnimationFrame(() => sheet.classList.add("open"));
		return ++sheetToken;
	}
	function closeSheet() {
		live.busLayer?.clearSelection();
		if (sheet.hidden) return;
		if (sheet.contains(document.activeElement)) document.activeElement.blur();
		sheet.classList.remove("open");
		sheetToken++;
		sheetTrain = null;
		following = null;
		followBus = null;
		followBtn.hidden = true;
		if (live.routeBounds && live.journey.sheetClosed()) fitRoute(110);
		else map.easeTo({
			padding: {
				top: 0,
				bottom: 0,
				left: 0,
				right: 0
			},
			duration: 300
		});
		setTimeout(() => {
			if (!sheet.classList.contains("open")) {
				sheet.hidden = true;
				sheet.style.setProperty("--kb", "0px");
				sheet.classList.remove("kb");
			}
		}, 340);
	}
	function sheetBusy() {
		const b = live.busLayer;
		return !sheet.hidden && !!(following || followBus || b?.selection?.kind === "bus" || b?.followView?.() || sheetBody.querySelector(".journey"));
	}
	sheet.querySelector(".sheet-close").onclick = closeSheet;
	{
		const grab = sheet.querySelector(".sheet-grab");
		let y0 = 0, t0 = 0, dy = 0, drag = false, moved = false;
		grab.addEventListener("pointerdown", (e) => {
			if (e.button) return;
			drag = true;
			moved = false;
			y0 = e.clientY;
			t0 = performance.now();
			dy = 0;
			grab.setPointerCapture(e.pointerId);
			sheet.style.transition = "none";
		});
		grab.addEventListener("pointermove", (e) => {
			if (!drag) return;
			dy = Math.max(0, e.clientY - y0);
			if (dy > 4) moved = true;
			sheet.style.transform = `translateY(${dy}px)`;
		});
		const end = () => {
			if (!drag) return;
			drag = false;
			sheet.style.transition = "";
			const fast = dy / Math.max(1, performance.now() - t0) > .6;
			if (moved && (dy > Math.min(120, sheet.offsetHeight * .3) || fast && dy > 24)) {
				sheet.style.transform = "translateY(calc(105% + var(--kb,0px)))";
				closeSheet();
			} else sheet.style.transform = "";
		};
		grab.addEventListener("pointerup", end);
		grab.addEventListener("pointercancel", end);
		grab.addEventListener("click", (e) => {
			if (moved) {
				e.preventDefault();
				moved = false;
				return;
			}
			closeSheet();
		});
	}
	if (window.visualViewport) {
		const vv = visualViewport;
		let dropTimer = 0;
		const fitKeyboard = () => {
			const H = document.documentElement.clientHeight || innerHeight;
			const kb = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(H - vv.height - vv.offsetTop));
			if (!sheet.classList.contains("open")) return;
			const now = parseInt(sheet.style.getPropertyValue("--kb")) || 0, put = (v) => {
				sheet.style.setProperty("--kb", v + "px");
				sheet.classList.toggle("kb", v > 40);
			};
			if (kb >= now) {
				clearTimeout(dropTimer);
				dropTimer = 0;
				if (kb !== now) put(kb);
			} else if (!dropTimer) dropTimer = setTimeout(() => {
				dropTimer = 0;
				const H2 = document.documentElement.clientHeight || innerHeight;
				const k2 = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(H2 - vv.height - vv.offsetTop));
				if (k2 < (parseInt(sheet.style.getPropertyValue("--kb")) || 0)) put(k2);
			}, 250);
			if (scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
				scrollTo(0, 0);
				document.body.scrollTop = 0;
			}
		};
		let until = 0;
		const settle = () => {
			fitKeyboard();
			if (performance.now() < until) requestAnimationFrame(settle);
		};
		const watch = () => {
			const run = performance.now() >= until;
			until = performance.now() + 1100;
			if (run) requestAnimationFrame(settle);
		};
		vv.addEventListener("resize", watch);
		vv.addEventListener("scroll", watch);
		for (const ev of [
			"focusin",
			"focusout",
			"pointerup"
		]) sheet.addEventListener(ev, (e) => {
			if (ev !== "pointerup" || e.target.closest("input,select,textarea")) watch();
		});
		addEventListener("scroll", () => {
			if (sheet.classList.contains("kb")) fitKeyboard();
		}, { passive: true });
		let tx = 0, ty = 0;
		sheet.addEventListener("touchstart", (e) => {
			const t = e.touches[0];
			tx = t.clientX;
			ty = t.clientY;
		}, { passive: true });
		sheet.addEventListener("touchend", (e) => {
			const f = e.target.closest?.("input[type=text],input[type=search],input:not([type])");
			const t = e.changedTouches[0];
			if (!f || document.activeElement === f || Math.hypot(t.clientX - tx, t.clientY - ty) > 10) return;
			e.preventDefault();
			f.focus({ preventScroll: true });
			const n = f.value.length;
			try {
				f.setSelectionRange(n, n);
			} catch {}
			watch();
		}, { passive: false });
		if (location.hash.includes("kbdebug")) {
			const o = document.createElement("pre");
			o.style.cssText = "position:fixed;z-index:99;left:4px;top:4px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.78);color:#ffd400;border-radius:8px;pointer-events:none;white-space:pre";
			document.body.append(o);
			const log = [];
			const snap = () => `H ${document.documentElement.clientHeight} iH ${innerHeight}\nvv ${Math.round(vv.height)} top ${Math.round(vv.offsetTop)} s ${vv.scale.toFixed(2)}\nscrollY ${Math.round(scrollY)} kb ${sheet.style.getPropertyValue("--kb") || "-"}\nfocus ${document.activeElement?.id || document.activeElement?.tagName}`;
			const tick = () => {
				o.textContent = snap() + "\n" + log.slice(-6).join("\n");
				requestAnimationFrame(tick);
			};
			tick();
			for (const ev of ["resize", "scroll"]) vv.addEventListener(ev, () => log.push(`${(performance.now() / 1e3).toFixed(2)} vv.${ev} ${Math.round(vv.height)}/${Math.round(vv.offsetTop)}`));
			addEventListener("scroll", () => log.push(`${(performance.now() / 1e3).toFixed(2)} win.scroll ${Math.round(scrollY)}`), { passive: true });
			document.addEventListener("focusin", (e) => log.push(`${(performance.now() / 1e3).toFixed(2)} focus ${e.target.id || e.target.tagName}`));
		}
	}
	addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			if (live.rider.ride) live.stopRide(true);
			else closeSheet();
		}
	});
	const sheetPad = () => {
		if (sheet.classList.contains("tucked")) {
			const p = map.getContainer().querySelector(".bfu-panel");
			return p ? p.offsetHeight + 24 : 0;
		}
		return sheet.hidden ? 0 : Math.min(sheet.offsetHeight, map.getContainer().clientHeight * .75);
	};
	function tuck(on) {
		sheet.classList.toggle("tucked", !!on);
		sheet.inert = !!on;
	}
	function trainLngLat(plan) {
		const z = map.getZoom(), unit = 1 / (512 * 2 ** z), q = trackPoint(plan, trainPose(plan).dist), o = (q.off + laneOffsetPx(z)) * unit;
		return new maplibregl.MercatorCoordinate(q.x + q.r[0] * o, q.y + q.r[1] * o, 0).toLngLat();
	}
	function follow(id) {
		following = id;
		followBus = null;
		followBtn.hidden = true;
		followBtn.textContent = "이 열차 따라가기";
		const plan = planner.plans.find((p) => p.id === id);
		if (!plan) return;
		easing = true;
		cam = null;
		map.once("moveend", () => {
			easing = false;
			map.triggerRepaint();
		});
		map.easeTo({
			center: trainLngLat(plan),
			zoom: Math.max(map.getZoom(), 16),
			padding: {
				top: 0,
				bottom: sheetPad(),
				left: 0,
				right: 0
			},
			duration: 700
		});
	}
	const busFollowChanged = () => live.busLayer?.followChanged?.();
	function followBusStart(id, { zoom = 16 } = {}) {
		following = null;
		followBus = id;
		busMiss = 0;
		followBtn.hidden = true;
		const c = live.busLayer?.vehiclePosition(id);
		if (!c) {
			followBus = null;
			busFollowChanged();
			return;
		}
		busFollowChanged();
		easing = true;
		cam = null;
		map.once("moveend", () => {
			easing = false;
			followSoon();
		});
		map.easeTo({
			center: c,
			zoom: Math.max(map.getZoom(), zoom),
			padding: {
				top: 0,
				bottom: sheetPad(),
				left: 0,
				right: 0
			},
			duration: 700
		});
	}
	followBtn.onclick = () => {
		if (sheetTrain) follow(sheetTrain);
		else if (live.busLayer?.selection?.kind === "bus") followBusStart(live.busLayer.selection.id);
	};
	let sheetStation = null;
	sheetBody.addEventListener("click", (e) => {
		const b = e.target.closest(".st-journey [data-end]");
		if (!b || !sheetStation) return;
		const st = sheetStation;
		live.journey.openWith(b.dataset.end, {
			name: /역$/.test(st.name) ? st.name : st.name + "역",
			lat: st.lat,
			lng: st.lon
		});
	});
	const FOLLOW_EASE = .25;
	let followAt = "", followRaf = 0, followLast = 0, cam = null, camAt = 0;
	function followSoon() {
		if (!followRaf) followRaf = requestAnimationFrame(followLoop);
	}
	const touching = /* @__PURE__ */ new Set();
	map.getCanvasContainer().addEventListener("pointerdown", (e) => touching.add(e.pointerId));
	for (const t of ["pointerup", "pointercancel"]) addEventListener(t, (e) => touching.delete(e.pointerId), true);
	addEventListener("blur", () => touching.clear());
	const handsOn = () => {
		if (!(touching.size > 0 || map.isMoving())) return false;
		const m = map.getCenter();
		cam = {
			lng: m.lng,
			lat: m.lat
		};
		camAt = performance.now();
		followAt = "";
		return true;
	};
	function followLoop(ts) {
		followRaf = 0;
		if (!(following || live.rider.ride || followBus) || easing) return;
		if (!live.rider.ride && ts - followLast < Math.max(1e3 / FOLLOW_FPS, live.frameMs || 0) - 4) {
			followSoon();
			return;
		}
		followLast = ts;
		if (live.rider.ride) planner.setFrame(ts);
		for (const f of animFrame) f();
		map.triggerRepaint();
		if (followBus) followSoon();
	}
	animFrame.push(() => {
		const sel = following && !easing && !handsOn() && sheetTrain && planner.plans.find((p) => p.id === sheetTrain);
		if (!sel) return;
		const c = trainLngLat(sel), now = performance.now();
		if (!cam || now - camAt > 1e3) cam = {
			lng: c.lng,
			lat: c.lat
		};
		else {
			const a = 1 - Math.exp(-(now - camAt) / 1e3 / FOLLOW_EASE);
			cam = {
				lng: cam.lng + (c.lng - cam.lng) * a,
				lat: cam.lat + (c.lat - cam.lat) * a
			};
		}
		camAt = now;
		const k = `${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;
		if (k === followAt) return;
		followAt = k;
		map.jumpTo({
			center: cam,
			padding: {
				top: 0,
				bottom: sheetPad(),
				left: 0,
				right: 0
			}
		});
	});
	animFrame.push(() => {
		if (!followBus || easing || handsOn()) return;
		const b = live.busLayer;
		if (!(b?.selection?.kind === "bus" && b.selection.id === followBus || b?.stopFollow === followBus)) {
			followBus = null;
			busFollowChanged();
			return;
		}
		const p = b.vehiclePosition(followBus), now = performance.now();
		if (!p) {
			if (!busMiss) busMiss = now;
			else if (now - busMiss > 1e4) {
				followBus = null;
				busFollowChanged();
			}
			return;
		}
		busMiss = 0;
		if (!cam || now - camAt > 1e3) cam = {
			lng: p[0],
			lat: p[1]
		};
		else {
			const a = 1 - Math.exp(-(now - camAt) / 1e3 / FOLLOW_EASE);
			cam = {
				lng: cam.lng + (p[0] - cam.lng) * a,
				lat: cam.lat + (p[1] - cam.lat) * a
			};
		}
		camAt = now;
		const k = `${cam.lng.toFixed(7)},${cam.lat.toFixed(7)}`;
		if (k === followAt) return;
		followAt = k;
		map.jumpTo({
			center: cam,
			padding: {
				top: 0,
				bottom: sheetPad(),
				left: 0,
				right: 0
			}
		});
	});
	map.on("dragstart", () => {
		if (following) {
			following = null;
			followBtn.hidden = !sheetTrain;
		}
		if (followBus) {
			followBus = null;
			followBtn.textContent = "이 버스 따라가기";
			followBtn.hidden = live.busLayer?.selection?.kind !== "bus";
			busFollowChanged();
		}
	});
	return {
		sheet,
		sheetBody,
		followBtn,
		openSheet,
		closeSheet,
		sheetBusy,
		sheetPad,
		tuck,
		trainLngLat,
		follow,
		followBusStart,
		followSoon,
		get sheetTrain() {
			return sheetTrain;
		},
		set sheetTrain(v) {
			sheetTrain = v;
		},
		get following() {
			return following;
		},
		set following(v) {
			following = v;
		},
		get easing() {
			return easing;
		},
		set easing(v) {
			easing = v;
		},
		get followBus() {
			return followBus;
		},
		set followBus(v) {
			followBus = v;
		},
		get sheetStation() {
			return sheetStation;
		},
		set sheetStation(v) {
			sheetStation = v;
		},
		get sheetToken() {
			return sheetToken;
		}
	};
}
export { createBottomSheet };
