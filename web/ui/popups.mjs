// web/ui/popups.mts
function createPopups({ map, maplibregl, planner, colors, esc, age, destLabel, trainPose, trackPoint, mercStop, TRAIN_MIN_PX, trainBodyPx, canRide, laneOffsetPx, cityViaduct, seatPickerHTML, seatLabel, rideRows, rider, openSheet, follow, sheetUI, sheetBody, followBtn, live }) {
	function trainState(plan) {
		let el = age(plan.t.receivedAt) + plan.lead, ph = plan.phases[plan.phases.length - 1];
		plan.phases.length - 1;
		for (let i = 0; i < plan.phases.length; i++) {
			const x = plan.phases[i];
			if (el < x.dur) {
				ph = x;
				break;
			}
			el -= x.dur;
		}
		if (ph.dur === Infinity) return `${ph.to.name}에서 대기 (예측 끝 · 다음 데이터 대기)`;
		const left = Math.max(0, ph.dur - el);
		if (ph.k0 === ph.k1) return `${ph.k0 === 0 ? ph.from.name : ph.to.name} 정차 중 · 출발까지 ${Math.round(left)}초`;
		const k = ph.k0 + (ph.k1 - ph.k0) * Math.min(1, el / ph.dur);
		return `${ph.from.name} → ${ph.to.name} 주행 중 · ${Math.round(k * 100)}% · 도착까지 ${Math.round(left)}초 (구간 ${Math.round(ph.k1 - ph.k0 ? ph.dur / (ph.k1 - ph.k0) : ph.dur)}초)`;
	}
	function riderState(plan) {
		if (trainPose(plan).moving === false && plan.hold != null) {
			const i = plan.cum.findIndex((c) => Math.abs(c - plan.hold) < 1e-9);
			if (i >= 0) return `${plan.seq[i].name}역에 정차 중`;
		}
		let el = age(plan.t.receivedAt) + plan.lead, ph = plan.phases[plan.phases.length - 1];
		for (const x of plan.phases) {
			if (el < x.dur) {
				ph = x;
				break;
			}
			el -= x.dur;
		}
		if (ph.dur === Infinity) return `${ph.to.name}역에 있어요`;
		const left = Math.max(0, ph.dur - el), when = left < 60 ? `${Math.round(left / 10) * 10}초` : `${Math.round(left / 60)}분`;
		if (ph.k0 === ph.k1) return `${ph.k0 === 0 ? ph.from.name : ph.to.name}역에 정차 중`;
		return left < 10 ? `${ph.from.name} → ${ph.to.name} · 곧 도착` : `${ph.from.name} → ${ph.to.name} · 약 ${when} 뒤 도착`;
	}
	function trainSheetHTML(plan) {
		const t = plan.t, c = colors[t.line];
		const badges = [t.express ? "<span class=\"b ex\">급행</span>" : "", t.last ? "<span class=\"b last\">막차</span>" : ""].join("");
		return `<div class="train-inspect" style="--c:${c}">
  <div class="tp-line"><span class="dot"></span>${esc(t.line)}<span class="no">${esc(t.trainNo)}</span>${badges}</div>
  <div class="tp-dest">${esc(destLabel(t) || "행선지 정보 없음")}</div>
  <div class="tp-now">${esc(riderState(plan))}</div>
  ${canRide() ? `<div class="sec">자리 고르고 타기 <span class="muted">· 위가 진행 방향</span></div><div class="ride-pick">${seatPickerHTML(plan.cars, rideRows(plan), rider.seat)}</div><button type="button" class="ride-go">${seatLabel(rider.seat)}에 타기</button>` : ""}
  <div class="sec">서울시 실시간 원본</div>
  <dl class="kv">${rawFeedHTML(t)}</dl></div>`;
	}
	function rawFeedHTML(t) {
		const a = Math.round(age(t.receivedAt)), kst = (v) => v ? new Date(v).toLocaleTimeString("ko-KR", {
			timeZone: "Asia/Seoul",
			hour12: false
		}) : "-", kv = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
		return `${kv("역", esc(t.station))}${kv("상태", esc(t.status))}${kv("방향", esc(t.direction))}${kv("행선지", esc(t.destination || "-"))}
  ${kv("기록 시각", `${esc(String(t.receivedAt || "-").slice(11))} <span class="muted">(${a}초 전)</span>`)}${kv("받은 시각", kst(live.feed.fetchedAt))}`;
	}
	function showTrainPopup(plan) {
		const token = openSheet(trainSheetHTML(plan));
		sheetUI.sheetTrain = plan.id;
		requestAnimationFrame(() => follow(plan.id));
		const timer = setInterval(() => {
			if (token !== sheetUI.sheetToken) return clearInterval(timer);
			const pl = planner.plans.find((p) => p.id === sheetUI.sheetTrain);
			if (!pl) return;
			const now = sheetBody.querySelector(".tp-now"), dest = sheetBody.querySelector(".tp-dest");
			if (now) now.textContent = riderState(pl);
			if (dest) dest.textContent = destLabel(pl.t) || "행선지 정보 없음";
			const raw = sheetBody.querySelector(".train-inspect .kv"), h = rawFeedHTML(pl.t);
			if (raw && raw.innerHTML !== h) raw.innerHTML = h;
		}, 1e3);
	}
	document.head.insertAdjacentHTML("beforeend", "<style>.train-inspect{min-width:190px}.train-inspect .tp-line{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--c)}.train-inspect .tp-line .dot{width:9px;height:9px;border-radius:50%;background:var(--c)}.train-inspect .tp-line .no{color:#7a8a90;font-weight:600;font-variant-numeric:tabular-nums}.train-inspect .b{font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;color:#fff;background:var(--c)}.train-inspect .b.last{background:#141414}.train-inspect .tp-dest{font-size:20px;font-weight:800;margin:4px 0 2px;letter-spacing:-.01em}.train-inspect .tp-now{font-size:12px;color:#6b7b80}.train-inspect details{margin-top:8px;font-size:12px}.train-inspect summary{cursor:pointer;color:#8a979b;font-weight:600}.train-inspect table{border-collapse:collapse;font-size:12px;margin-top:4px}.train-inspect th{text-align:left;color:#6b7b80;font-weight:600;padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top}.train-inspect td{padding:2px 0}.train-inspect .sec{padding-top:8px;font-weight:800;color:#172429;border-bottom:1px solid #dbe1e2}.train-inspect .muted{color:#8a979b}</style>");
	function pickTrain(point) {
		if (!live.trainsEnabled || !live.feed.on || live.subwayOff) return null;
		const unit = 1 / (512 * 2 ** map.getZoom());
		let best = null;
		for (const plan of planner.plans) {
			const pose = trainPose(plan);
			if (!live.trainShown(plan, pose.dist)) continue;
			const m = mercStop(plan.t.line, plan.seq[0]).meterInMercatorCoordinateUnits(), half = Math.max(plan.cars * plan.carMetres * m, TRAIN_MIN_PX * unit) / 2;
			const Z = map.getZoom(), lane = live.settings.track.kind !== "ground" ? cityViaduct.train(Z, trainBodyPx(Z)).lanePx : laneOffsetPx(Z, trainBodyPx(Z)), P = (d) => {
				const q = trackPoint(plan, d), o = (q.off + lane) * unit, X = q.x + q.r[0] * o, Y = q.y + q.r[1] * o;
				return live.settings.track.kind !== "ground" ? cityViaduct.screen(map, X, Y, q.h) : map.project(new maplibregl.MercatorCoordinate(X, Y, 0).toLngLat());
			};
			const A = P(pose.dist - half), B = P(pose.dist + half), dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((point.x - A.x) * dx + (point.y - A.y) * dy) / l2));
			const d = Math.hypot(point.x - (A.x + dx * u), point.y - (A.y + dy * u));
			if (d < 14 && (!best || d < best.d)) best = {
				plan,
				d
			};
		}
		return best && best.plan;
	}
	const liveNotice = document.createElement("div");
	liveNotice.className = "live-notice";
	liveNotice.hidden = true;
	liveNotice.setAttribute("role", "status");
	document.head.insertAdjacentHTML("beforeend", "<style>.live-notice{position:absolute;z-index:6;left:50%;top:12px;transform:translateX(-50%);max-width:calc(100% - 120px);padding:8px 12px;border-radius:8px;background:#fff6e0;color:#6b4a00;border:1px solid #f0cf7a;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.12)}html[data-theme=dark] .live-notice{background:#3a2f12;color:#f4dc9a;border-color:#6d5620}</style>");
	function updateLiveNotice(msg) {
		if (!msg && live.feed.fetchedAt && live.feed.on && Date.now() - new Date(live.feed.fetchedAt).getTime() > 18e4) msg = `실시간 정보가 ${new Date(live.feed.fetchedAt).toLocaleTimeString("ko-KR", {
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "Asia/Seoul"
		})} 이후 갱신되지 않았어요.`;
		liveNotice.textContent = msg || "";
		liveNotice.hidden = !msg || !live.feed.on;
	}
	setInterval(() => updateLiveNotice(liveNotice.hidden ? null : liveNotice.textContent), 3e4);
	function arrivalText(a) {
		if (a.eta > 0) {
			const left = Math.max(0, a.eta - age(a.receivedAt));
			return left < 60 ? "곧 도착" : `${Math.floor(left / 60)}분 후`;
		}
		return a.message.replace(/\[(\d+)\]번째 전역/, "$1번째 전역") || "-";
	}
	function arrivalRank(a) {
		if (a.eta > 0) return Math.max(0, a.eta - age(a.receivedAt));
		const m = a.message;
		if (/도착|진입/.test(m) && !/전역/.test(m)) return 0;
		const n = +(m.match(/\[(\d+)\]/) || [])[1];
		return n ? n * 120 : /전역/.test(m) ? 90 : 600;
	}
	function exitList(st) {
		const list = live.exits[st.id];
		if (!list || !list.length) return "";
		const seen = /* @__PURE__ */ new Set();
		return `<div class="exits">${list.filter((e) => !seen.has(e[2]) && seen.add(e[2])).map(([, , ref, wc]) => `<span class="exit" title="${esc(ref)}번 출구${wc === 1 ? " · 휠체어 가능" : ""}">${esc(ref)}${wc === 1 ? "<i>♿</i>" : ""}</span>`).join("")}</div>`;
	}
	async function showStationPopup(st, lngLat) {
		if (!st) return;
		sheetUI.following = null;
		sheetUI.sheetTrain = null;
		followBtn.hidden = true;
		const lineChips = st.lines.map((x) => `<span class="chip" style="--c:${colors[x.name] || "#52646a"}"><span class="dot"></span>${esc(x.name)}</span>`).join("");
		sheetUI.sheetStation = st;
		const journeyHere = "<div class=\"st-journey\"><button type=\"button\" data-end=\"from\">여기서 출발</button><button type=\"button\" data-end=\"to\">여기로 도착</button></div>";
		const head = (sub) => `<div class="tp-line">${lineChips}</div><div class="tp-dest">${esc(st.name)}</div><div class="tp-now">${sub}</div>${journeyHere}`;
		const html = (d) => {
			const groups = /* @__PURE__ */ new Map();
			for (const a of d.arrivals || []) {
				const k = `${a.line}|${a.direction}`;
				if (!groups.has(k)) groups.set(k, []);
				groups.get(k).push(a);
			}
			const lines = st.lines.map((x) => x.name);
			const cards = [...groups.keys()].sort((x, y) => lines.indexOf(x.split("|")[0]) - lines.indexOf(y.split("|")[0]) || x.localeCompare(y, "ko")).map((k) => {
				const [line, dir] = k.split("|"), list = groups.get(k).sort((a, b) => arrivalRank(a) - arrivalRank(b)).slice(0, 2);
				const toward = (list[0].heading.split("-")[1] || "").trim();
				return `<div class="arr" style="--c:${colors[line] || "#52646a"}"><div class="arr-h"><span class="dot"></span>${esc(line)} <span class="muted">${esc(dir)}${toward ? " · " + esc(toward) : ""}</span></div>
        ${list.map((a) => `<div class="arr-t"><b>${esc(arrivalText(a))}</b><span class="muted">${esc(a.destination)}행${a.express ? " · 급행" : ""}${a.last ? " · 막차" : ""}</span></div>`).join("")}</div>`;
			}).join("");
			const ex = exitList(st);
			return `<div class="train-inspect station-sheet">${head(`서울시 실시간 도착정보 · ${new Date(d.fetchedAt).toLocaleTimeString("ko-KR", {
				hour: "2-digit",
				minute: "2-digit",
				timeZone: "Asia/Seoul"
			})} 기준`)}
      <div class="sec">곧 오는 열차</div>${cards ? `<div class="arrs">${cards}</div>` : "<div class=\"muted empty\">지금 도착 예정 열차 정보가 없어요.</div>"}
      ${ex ? `<div class="sec">출구</div>${ex}` : ""}</div>`;
		};
		const failed = `<div class="train-inspect station-sheet">${head("도착 정보를 불러오지 못했어요. 잠시 후 다시 눌러 주세요.")}</div>`;
		const seq = ++stationSeq;
		let d = null, err = false;
		const settled = fetch(`./api/live?arrivals=${encodeURIComponent(st.name.replace(/\([^)]*\)/g, ""))}`, { cache: "no-store" }).then(async (r) => {
			const x = await r.json();
			if (!r.ok || !x.ok) throw Error();
			d = x;
		}, () => {
			err = true;
		});
		await Promise.race([settled, new Promise((r) => setTimeout(r, 700))]);
		if (seq !== stationSeq) return;
		const skeleton = `<div class="train-inspect station-sheet">${head("도착 정보 불러오는 중…")}<div class="sec">곧 오는 열차</div><div class="arrs st-sk" aria-hidden="true">${"<div class=\"arr\"><i></i><i></i><i></i></div>".repeat(Math.min(4, Math.max(2, st.lines.length * 2)))}</div></div>`;
		const token = openSheet(d ? html(d) : err ? failed : skeleton);
		const put = (h) => {
			if (token === sheetUI.sheetToken) sheetBody.innerHTML = h;
		};
		if (!d && !err) {
			await settled;
			put(d ? html(d) : failed);
		}
		if (d) {
			const timer = setInterval(() => {
				if (token !== sheetUI.sheetToken) return clearInterval(timer);
				put(html(d));
			}, 15e3);
		}
	}
	let stationSeq = 0;
	document.head.insertAdjacentHTML("beforeend", "<style>.station-pop table{border-collapse:collapse;font-size:12px;margin-top:6px;width:100%}.station-pop th{text-align:left;font-weight:700;padding:5px 10px 5px 0;vertical-align:top;white-space:nowrap}.station-pop td{padding:5px 0}.station-pop td div+div{margin-top:2px}.station-pop tr+tr th,.station-pop tr+tr td{border-top:1px solid rgba(120,140,150,.2)}.station-pop .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);margin-right:5px}.station-pop .muted{color:#7a8a90;font-weight:500}.station-pop .foot{margin-top:8px;font-size:11px}.station-pop .exits{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(120,140,150,.2)}.station-pop .exits .muted{margin-right:4px;font-size:12px}.station-pop .exit{min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ffd200;color:#1d1d1d;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:1px}.station-pop .exit i{font-style:normal;font-size:10px}</style>");
	return {
		trainState,
		riderState,
		trainSheetHTML,
		rawFeedHTML,
		showTrainPopup,
		pickTrain,
		liveNotice,
		updateLiveNotice,
		arrivalText,
		arrivalRank,
		exitList,
		showStationPopup
	};
}
export { createPopups };
