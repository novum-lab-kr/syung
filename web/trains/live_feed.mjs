import { serverUrl } from "../lib/server_url.mjs";
function createLiveFeed({ map, stations, liveState, getSelected, getSheetTrain, hasPlans, age, updateLiveNotice, onTrains, onClear, journeyLines = () => null }) {
	let trains = [], request = 0, on = false, failures = 0, key = "", at = 0, fetchedAt = null;
	function liveLines() {
		const journey = journeyLines();
		if (journey) {
			on = true;
			return journey;
		}
		on = map.getZoom() >= 13 || on && map.getZoom() >= 12.5;
		if (!on) return [];
		const selected = getSelected();
		if (selected !== "all") return [selected];
		const b = map.getBounds(), n = {};
		for (const s of stations) if (b.contains([s.lon, s.lat])) for (const x of s.lines) n[x.name] = (n[x.name] || 0) + 1;
		const c = map.getCenter();
		const w = Math.max((b.getEast() - b.getWest()) * .75, .019), h = Math.max((b.getNorth() - b.getSouth()) * .75, .0135);
		for (const s of stations) if (Math.abs(s.lon - c.lng) < w && Math.abs(s.lat - c.lat) < h) for (const x of s.lines) n[x.name] ??= .5;
		return Object.keys(n).sort((x, y) => n[y] - n[x]).slice(0, 24);
	}
	async function refresh(force = false) {
		const lines = liveLines();
		if (!lines.length) {
			request++;
			key = "";
			if (hasPlans()) {
				trains = [];
				onClear();
			}
			liveState.parentElement.dataset.state = "idle";
			liveState.textContent = !on ? "줌 13 이상에서 실시간 열차를 표시합니다" : "이 화면에는 운행 노선이 없습니다";
			return;
		}
		const sheetTrain = getSheetTrain(), focus = sheetTrain ? sheetTrain.split(":")[0] : "";
		const k = lines.join(",") + (focus ? "|" + focus : "");
		if (!force && k === key && Date.now() - at < 3e4) return;
		const mine = ++request;
		key = k;
		at = Date.now();
		if (!hasPlans()) liveState.parentElement.dataset.state = "loading";
		liveState.textContent = `${lines.join(" · ")} 열차 위치 확인 중`;
		try {
			const r = await fetch(serverUrl(`./api/live?lines=${encodeURIComponent(lines.join(","))}${focus ? `&focus=${encodeURIComponent(focus)}` : ""}`), { cache: "no-store" }), d = await r.json();
			if (mine !== request) return;
			if (!r.ok || !d.ok) throw Error(d.error || r.status);
			const all = d.trains || [];
			trains = all.filter((t) => age(t.receivedAt) <= 600);
			const stale = all.length - trains.length;
			fetchedAt = d.fetchedAt;
			failures = 0;
			updateLiveNotice(d.quotaExhausted ? "오늘 실시간 조회 한도를 다 썼어요. 내일 첫차 무렵부터 다시 보여요." : d.warnings && d.warnings.length ? "실시간 정보 일부가 지연되고 있어요. 이전 자료로 표시 중이에요." : null);
			const placed = onTrains(trains), unplaced = trains.length - placed, shown = d.lines || lines;
			liveState.parentElement.dataset.state = "ok";
			liveState.textContent = `추정 위치 ${placed}대${unplaced ? ` (역 미확인 ${unplaced})` : ""}${stale ? ` (오래된 기록 ${stale} 제외)` : ""} · ${shown.join(" · ")} · ${new Date(d.fetchedAt).toLocaleTimeString("ko-KR", {
				hour: "2-digit",
				minute: "2-digit",
				timeZone: "Asia/Seoul"
			})}`;
			map.triggerRepaint();
		} catch {
			if (mine === request) {
				key = "";
				failures++;
				liveState.parentElement.dataset.state = "error";
				liveState.textContent = "실시간 위치 연결 실패 · 잠시 후 재시도";
				if (failures >= 2 || !hasPlans()) updateLiveNotice("실시간 열차 정보에 연결하지 못했어요. 20초마다 다시 시도해요.");
			}
		}
	}
	function reset() {
		request++;
		trains = [];
		key = "";
	}
	function start() {
		setInterval(() => {
			if (!document.hidden && (getSheetTrain() || Date.now() - at >= 19e3)) refresh(true);
		}, 1e4);
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) refresh(true);
		});
		let moveTimer = 0;
		map.on("moveend", () => {
			clearTimeout(moveTimer);
			moveTimer = setTimeout(() => refresh(), 600);
		});
	}
	return {
		refresh,
		reset,
		start,
		get trains() {
			return trains;
		},
		get on() {
			return on;
		},
		get fetchedAt() {
			return fetchedAt;
		}
	};
}
export { createLiveFeed };
