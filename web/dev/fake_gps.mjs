import { metres } from "../lib/ride-along.mjs";
// web/dev/fake_gps.mts
function alongPath(path, distanceM) {
	let left = Math.max(0, distanceM);
	for (let index = 1; index < path.length; index++) {
		const from = path[index - 1], to = path[index], length = metres(from, to);
		if (left <= length && length > 0) {
			const share = left / length;
			return {
				spot: [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share],
				end: false
			};
		}
		left -= length;
	}
	return {
		spot: path[path.length - 1] ?? [0, 0],
		end: true
	};
}
var WALK_MPS = 1.3;
var BUS_MPS = 8;
var TICK_MS = 1e3;
var WOBBLE_DEG = 3e-6;
var SPEEDS = [
	1,
	3,
	10
];
function installFakeGps() {
	const real = navigator.geolocation;
	if (!real) return null;
	const watches = /* @__PURE__ */ new Map();
	let nextId = 1, on = false, spot = null, accuracy = 10, frozen = null, cut = false;
	const position = (at) => {
		const coords = {
			latitude: at[1],
			longitude: at[0],
			accuracy,
			altitude: null,
			altitudeAccuracy: null,
			heading: null,
			speed: null
		};
		const timestamp = Date.now();
		return {
			coords: {
				...coords,
				toJSON: () => coords
			},
			timestamp,
			toJSON: () => ({
				coords,
				timestamp
			})
		};
	};
	const failure = (message) => ({
		code: 2,
		message,
		PERMISSION_DENIED: 1,
		POSITION_UNAVAILABLE: 2,
		TIMEOUT: 3
	});
	const sending = () => cut ? null : frozen ?? spot;
	let wobble = 1;
	const emit = () => {
		const at = sending();
		if (!on || !at) return;
		wobble = -wobble;
		const sent = frozen ? at : [at[0], at[1] + wobble * WOBBLE_DEG];
		for (const watch of watches.values()) watch.ok(position(sent));
		console.log(`[가짜 GPS] ${sent[1].toFixed(6)}, ${sent[0].toFixed(6)} ±${accuracy}m${frozen ? " (지하: 같은 좌표)" : ""}`);
	};
	Object.defineProperty(navigator, "geolocation", {
		value: {
			getCurrentPosition(ok, fail, options) {
				if (!on) {
					real.getCurrentPosition(ok, fail, options);
					return;
				}
				setTimeout(() => {
					const at = sending();
					if (at) ok(position(at));
					else fail?.(failure("가짜 GPS: 위치 없음"));
				}, 0);
			},
			watchPosition(ok, fail, options) {
				const id = nextId++;
				watches.set(id, {
					ok,
					fail,
					options,
					realId: on ? null : real.watchPosition(ok, fail, options)
				});
				if (on) setTimeout(() => {
					if (cut) fail?.(failure("가짜 GPS: 위치 끊김"));
					else emit();
				}, 0);
				return id;
			},
			clearWatch(id) {
				const watch = watches.get(id);
				if (watch?.realId != null) real.clearWatch(watch.realId);
				watches.delete(id);
			}
		},
		configurable: true
	});
	const setOn = (value) => {
		if (value === on) return;
		on = value;
		for (const watch of watches.values()) {
			if (on && watch.realId != null) {
				real.clearWatch(watch.realId);
				watch.realId = null;
			}
			if (!on && watch.realId == null) watch.realId = real.watchPosition(watch.ok, watch.fail, watch.options);
		}
	};
	return { mount(deps) {
		let playing = false, speed = 1, legIndex = -1, walkedM = 0, aboard = false, note = "";
		let legPath = null;
		const playTick = () => {
			const ride = deps.ride();
			if (!ride) {
				note = "타고 가기가 꺼져 있어요";
				return;
			}
			const { step, legs, train, held } = ride, leg = step.kind === "done" ? void 0 : legs[step.leg];
			if (step.kind === "done" || !leg) {
				note = "도착";
				playing = false;
				return;
			}
			if (step.leg !== legIndex) {
				legIndex = step.leg;
				walkedM = 0;
				aboard = false;
				legPath = null;
			}
			if (step.kind === "walk" || leg.type === "bus" && step.kind === "ride") {
				legPath ??= pathOf(leg, legs[step.leg + 1]);
				const path = legPath;
				if (!path) {
					note = "걷는 길을 몰라요 — 지도를 눌러 옮겨 주세요";
					return;
				}
				walkedM += (leg.type === "bus" ? BUS_MPS : WALK_MPS) * speed * TICK_MS / 1e3;
				const where = alongPath(path, walkedM);
				spot = where.spot;
				note = `${leg.type === "bus" ? "버스" : "걷기"} ${step.leg + 1}/${legs.length} · ${Math.round(walkedM)}m${where.end ? " (끝)" : ""}`;
				return;
			}
			if (leg.type === "bus") {
				spot = leg.path[0] ?? spot;
				note = "버스 기다리는 중";
				return;
			}
			if (leg.type !== "ride") return;
			const board = deps.stationAt(leg.stations[0]), trainSpot = train ? deps.trainAt(train) : null;
			if (step.kind === "wait") {
				if (trainSpot && held) aboard = true;
				if (trainSpot && aboard) {
					spot = trainSpot;
					note = `열차 ${train} 따라가는 중(기다리기)`;
				} else {
					spot = board ?? spot;
					note = `${leg.from}역에서 기다리는 중${train ? ` · 열차 ${train}` : ""}`;
				}
				return;
			}
			if (trainSpot) {
				spot = trainSpot;
				note = `열차 ${train} 타고 가는 중`;
			} else note = "탄 열차가 지도에 없어요";
		};
		const pathOf = (leg, next) => {
			if (leg.type !== "walk") return leg.type === "bus" && leg.path.length >= 2 ? [...leg.path] : null;
			if (leg.path && leg.path.length >= 2) return [...leg.path];
			const target = next?.type === "ride" ? deps.stationAt(next.stations[0]) : next?.type === "bus" ? next.path[0] ?? null : null;
			return spot && target ? [spot, target] : null;
		};
		setInterval(() => {
			if (on && playing) playTick();
			emit();
			paint();
		}, TICK_MS);
		const box = document.createElement("div");
		box.className = "dev-fake-gps";
		box.innerHTML = `<style>
.dev-fake-gps{position:fixed;left:8px;top:76px;z-index:9999;background:#fff;border:1px solid #888;border-radius:8px;padding:6px 8px;font:12px/1.5 sans-serif;color:#222;box-shadow:0 2px 8px #0003;max-width:250px}
.dev-fake-gps label{display:block}.dev-fake-gps button{font:inherit;margin:2px 2px 2px 0}.dev-fake-gps b{cursor:pointer}
.dev-fake-gps .on{background:#222;color:#fff}.dev-fake-gps input[type=number]{width:52px}.dev-fake-gps .note{color:#555;word-break:keep-all}
</style><b data-act="fold">가짜 GPS ▾</b><div data-part="body">
<label><input type="checkbox" data-act="on"> 가짜 위치 켜기</label>
<label>정확도 <input type="number" min="1" max="2000" value="10" data-act="accuracy"> m</label>
<button type="button" data-act="pick">① 지도 눌러 옮기기</button><br>
<button type="button" data-act="play">② 경로 따라 재생</button><select data-act="speed">${SPEEDS.map((value) => `<option value="${value}">×${value}</option>`).join("")}</select>
<label><input type="checkbox" data-act="under"> ③ 지하(같은 좌표 되풀이)</label>
<label><input type="checkbox" data-act="cut"> ④ 위치 끊김(오류 보내기)</label>
<div class="note" data-part="note"></div></div>`;
		document.body.append(box);
		const part = (selector) => box.querySelector(selector);
		const onBox = part("[data-act=on]"), underBox = part("[data-act=under]"), cutBox = part("[data-act=cut]");
		const pickBtn = part("[data-act=pick]"), playBtn = part("[data-act=play]"), noteEl = part("[data-part=note]");
		let picking = false;
		const enable = () => {
			if (!on) {
				setOn(true);
				if (!spot) {
					const center = deps.map.getCenter();
					spot = [center.lng, center.lat];
				}
			}
			deps.locate();
		};
		function paint() {
			onBox.checked = on;
			pickBtn.classList.toggle("on", picking);
			playBtn.classList.toggle("on", playing);
			playBtn.textContent = playing ? "② 재생 멈춤" : "② 경로 따라 재생";
			const at = sending();
			noteEl.textContent = !on ? "꺼짐 — 진짜 GPS" : [
				at ? `${at[1].toFixed(5)}, ${at[0].toFixed(5)} · ±${accuracy}m` : cut ? "끊김 — 보내지 않음" : "위치 없음",
				frozen ? "지하: 같은 좌표" : "",
				playing ? note : ""
			].filter(Boolean).join(" · ");
		}
		onBox.addEventListener("change", () => {
			if (onBox.checked) enable();
			else {
				setOn(false);
				playing = false;
			}
			paint();
		});
		part("[data-act=accuracy]").addEventListener("change", (event) => {
			const value = +event.target.value;
			if (value > 0) accuracy = value;
			paint();
		});
		part("[data-act=speed]").addEventListener("change", (event) => {
			speed = +event.target.value || 1;
		});
		part("[data-act=fold]").addEventListener("click", () => {
			const body = part("[data-part=body]");
			body.hidden = !body.hidden;
		});
		pickBtn.addEventListener("click", () => {
			picking = !picking;
			paint();
		});
		playBtn.addEventListener("click", () => {
			playing = !playing;
			if (playing) {
				enable();
				legIndex = -1;
				note = "";
				playTick();
				emit();
			}
			paint();
		});
		underBox.addEventListener("change", () => {
			frozen = underBox.checked ? sending() ?? spot : null;
			paint();
		});
		cutBox.addEventListener("change", () => {
			cut = cutBox.checked;
			if (cut && on) for (const watch of watches.values()) watch.fail?.(failure("가짜 GPS: 위치 끊김"));
			paint();
		});
		const canvas = deps.map.getCanvasContainer();
		window.addEventListener("click", (event) => {
			if (!picking || !(event.target instanceof Node) || !canvas.contains(event.target)) return;
			event.stopPropagation();
			event.preventDefault();
			const rect = canvas.getBoundingClientRect(), at = deps.map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
			enable();
			spot = [at.lng, at.lat];
			picking = false;
			playing = false;
			console.log(`[가짜 GPS] 지도 누름 → ${at.lat.toFixed(6)}, ${at.lng.toFixed(6)}`);
			if (frozen) frozen = spot;
			emit();
			paint();
		}, true);
		paint();
	} };
}
export { alongPath, installFakeGps };
