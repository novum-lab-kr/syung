import { __vitePreload } from "../_virtual/_vite/preload-helper.mjs";
// web/map/theme.mts
function createMapTheme({ map, $, menu, seoulSun, cityPalette, applyCityStyle, applyGroundTexture, syncCity, updateSun, focusRoute, journeyMap, rider, prefs, live }) {
	const mixHex = (a, b, t) => "#" + [
		1,
		3,
		5
	].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
	const cur = {
		get mapColor() {
			return live.settings.mapColor;
		},
		get themeChoice() {
			return prefs.get("themeChoice") ?? live.settings.themeChoice;
		}
	};
	const mapPalette = (t = effectiveTheme()) => {
		const S = live.settings, P = {
			...S.map.themes[t],
			...cur.mapColor === "color" ? S.map.colors[t] : {}
		};
		if (S.map.paletteKind !== "park-city") return S.map.paletteKind === "city" ? {
			...P,
			...cityPalette(t, {
				pack: S.city.pack,
				tone: S.city.tone
			})
		} : P;
		const K = S.map.park[t], m = cur.mapColor === "color" ? 0 : .15, Q = {
			...P,
			...K,
			bld3dOpacity: 1
		};
		for (const k of [
			"bg",
			"park",
			"land",
			"water",
			"bld"
		]) Q[k] = mixHex(K[k], K.bg, m);
		const id = ["abs", [
			"to-number",
			["id"],
			0
		]];
		Q.bld3d = [
			"match",
			[
				"%",
				["floor", [
					"/",
					[
						"*",
						[
							"%",
							id,
							9973
						],
						[
							"%",
							id,
							9967
						]
					],
					7
				]],
				6
			],
			...K.blocks.slice(0, 5).flatMap((v, i) => [i, v]),
			K.blocks[5]
		];
		return {
			...Q,
			...cityPalette(t, {
				pack: S.city.pack,
				tone: S.city.tone,
				ride: !!rider.ride
			})
		};
	};
	function effectiveTheme() {
		if (cur.themeChoice !== "auto") return cur.themeChoice;
		const now = /* @__PURE__ */ new Date(), { rise, set } = seoulSun(now);
		return now >= rise && now < set ? "light" : "dark";
	}
	function applyTheme() {
		queueMicrotask(() => {
			if (map.getLayer?.("journey-veil")) focusRoute(!!journeyMap.routeBounds);
		});
		const t = effectiveTheme(), P = mapPalette(), S = live.settings;
		live.busLayer?.setTheme(t);
		document.documentElement.dataset.theme = t;
		for (const l of document.querySelectorAll("link[data-theme-icon]")) l.href = `./brand/favicon-${t}.svg`;
		document.querySelector("meta[name=theme-color]")?.setAttribute("content", t === "dark" ? "#1b1c1f" : "#ffd400");
		const bi = document.querySelector(".brand-icon");
		if (bi) bi.src = `./brand/syung-${t === "dark" ? "light" : "dark"}.svg`;
		menu.theme(cur.themeChoice);
		if (cur.themeChoice === "auto") {
			const now = /* @__PURE__ */ new Date(), { rise, set } = seoulSun(now), nextRise = now >= set ? seoulSun(new Date(now.getTime() + 864e5)).rise : rise;
			menu.themeNote(t === "dark" ? {
				lead: "지금은 ",
				bold: "다크",
				tail: ` · ${hm(nextRise)} 해 뜨면 라이트로`
			} : {
				lead: "지금은 ",
				bold: "라이트",
				tail: ` · ${hm(set)} 해 지면 다크로`
			});
		} else menu.themeNote("자동은 해 뜨면 라이트, 해 지면 다크예요");
		drawSky();
		if (!live.ready) return;
		const set = (id, prop, v) => {
			if (map.getLayer(id)) map.setPaintProperty(id, prop, v);
		};
		set("background", "background-color", P.bg);
		map.triggerRepaint();
		set("bm-water", "fill-color", P.water);
		set("bm-park", "fill-color", P.park);
		set("bm-landcover", "fill-color", P.land);
		set("bm-bld", "fill-color", P.bld);
		set("bm-bld3d", "fill-extrusion-color", P.bld3d);
		set("bm-bld3d", "fill-extrusion-opacity", S.city.enabled ? 0 : P.bld3dOpacity);
		if (map.getLayer("bm-bld3d")) map.setPaintProperty("bm-bld3d", "fill-extrusion-vertical-gradient", S.map.verticalGradient);
		set("bm-road-minor", "line-color", P.roadMinor);
		set("bm-road-major", "line-color", P.roadMajor);
		set("bm-rail", "line-color", P.rail);
		for (const [id, c] of [
			["bm-label-place", P.text],
			["bm-label-road", P.road],
			["bm-label-water", P.waterText],
			["bm-label-park", P.parkText],
			["bm-label-poi", P.poi]
		]) {
			set(id, "text-color", c);
			set(id, "text-halo-color", P.halo);
		}
		set("station-labels", "text-color", P.stationText);
		set("station-labels", "text-halo-color", P.halo);
		applyCityStyle(map, {
			on: S.city.enabled,
			theme: t,
			tone: S.city.tone,
			mapOn: true,
			pack: S.city.pack,
			ride: !!rider.ride
		});
		applyGroundTexture(map, {
			on: S.city.groundTexture,
			theme: t,
			pack: S.city.pack
		});
		syncCity();
	}
	document.head.insertAdjacentHTML("beforeend", `<style>
html[data-theme=dark]{--board:#0f171b;--paper:#152026;--ink:#e2ebee;--secondary:#a2b3b8;--muted:#8799a0;--rule:#28383f;--navy:#0a171d;--control:#1b2930;--selected:#213d48;color-scheme:dark}
html[data-theme=dark] .map{background-color:#10181c!important;background-image:linear-gradient(rgba(160,200,210,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(160,200,210,.05) 1px,transparent 1px)!important}
html[data-theme=dark] .map-status,html[data-theme=dark] .legend{background:rgba(21,32,38,.94);border-color:rgba(160,190,200,.18);color:var(--secondary)}
html[data-theme=dark] .map-toggle,html[data-theme=dark] .train-toggle,html[data-theme=dark] .webgl-zoom{background:#152026;color:var(--ink);border-color:#3a4b52}
html[data-theme=dark] .map-toggle[aria-pressed=true],html[data-theme=dark] .train-toggle[aria-pressed=true]{background:#2b6f8f;border-color:#2b6f8f;color:#fff}
html[data-theme=dark] .search input,html[data-theme=dark] .line-select{background:var(--control);color:var(--ink);border-color:#3a4b52}
html[data-theme=dark] .maplibregl-ctrl-group{background:#152026}html[data-theme=dark] .maplibregl-ctrl-group button+button{border-top-color:#2b3a40}
html[data-theme=dark] .maplibregl-ctrl-group button .maplibregl-ctrl-icon{filter:invert(1) hue-rotate(180deg)}
html[data-theme=dark] .maplibregl-popup-content{background:#152026;color:var(--ink)}html[data-theme=dark] .maplibregl-popup-tip{border-top-color:#152026;border-bottom-color:#152026}
html[data-theme=dark] .train-inspect .sec{color:var(--ink);border-bottom-color:#2b3a40}
.theme-toggle{top:206px}
.sun-temp{position:absolute;right:12px;top:7px;font-family:var(--round);font-size:17px;line-height:1;color:#2b3a55;text-shadow:0 1px 0 rgba(255,255,255,.7)}
.sun-path.is-night .sun-temp{color:#fff;text-shadow:0 1px 2px rgba(0,0,12,.55)}
.sun-temp,.sun-times{z-index:9}
.sky-motion{position:absolute;inset:0;pointer-events:none}.sky-motion>div{position:absolute;inset:0}
.sun-path{isolation:isolate}.sun-path .sky-back{z-index:0}.sky-motion-clouds{z-index:1}.sun-path .sky-sun{z-index:2}.sun-path .sky-front{z-index:3}.sky-motion-train{z-index:4}.sky-motion-fall{z-index:5}
.sun-path:has(.sky-motion.on) .sky-still-train{display:none}   /* Lottie 지하철이 뜨면 정지 그림 지하철은 숨긴다(받기 실패하면 정지 그림이 남는다) */
#lineSelect{display:none}
.map-status{display:none}   /* title/description box over the map: removed */   /* line filter: the list of line buttons below is enough */
</style>`);
	menu.on({ theme: (choice) => {
		prefs.set("themeChoice", choice);
		applyTheme();
	} });
	setInterval(() => {
		if (cur.themeChoice === "auto") applyTheme();
		else drawSky();
		updateSun();
	}, 3e5);
	const hm = (d) => d.toLocaleTimeString("ko-KR", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Asia/Seoul"
	});
	let wxMod = null, motionMod = null, weather = null, menuOpen = false;
	let lastArt = null, lastNight = false;
	async function openSky() {
		menuOpen = true;
		syncMotion();
		wxMod ??= await __vitePreload(() => import("./sky_weather.mjs"), [], import.meta.url);
		const next = await wxMod.fetchWeather(live.myLocation ?? null);
		if (JSON.stringify(next) !== JSON.stringify(weather)) {
			weather = next;
			drawSky();
		}
	}
	function closeSky() {
		menuOpen = false;
		applyPlay();
	}
	let inView = false, watched = null, viewWatch = null;
	function applyPlay() {
		if (!motionMod) return;
		if (menuOpen && inView && !document.hidden) motionMod.resumeMotion();
		else motionMod.pauseMotion();
	}
	function watchView(el) {
		if (watched === el) return;
		if (!watched) document.addEventListener("visibilitychange", applyPlay);
		viewWatch?.disconnect();
		watched = el;
		inView = false;
		if (typeof IntersectionObserver === "undefined") {
			inView = true;
			return;
		}
		viewWatch = new IntersectionObserver((entries) => {
			inView = entries[entries.length - 1]?.isIntersecting ?? false;
			applyPlay();
		});
		viewWatch.observe(el);
	}
	async function syncMotion() {
		if (!menuOpen) return;
		const host = document.getElementById("skyMotion");
		if (!host) return;
		motionMod ??= await __vitePreload(() => import("./sky_motion.mjs"), [], import.meta.url);
		watchView(host.parentElement ?? host);
		await motionMod.showMotion(host, lastArt?.scene ?? null, lastNight, !!lastArt?.wet);
		applyPlay();
	}
	function drawSky() {
		let now = /* @__PURE__ */ new Date();
		const { rise, set } = seoulSun(now), forced = wxMod?.devNight() ?? null;
		if (forced !== null) now = forced ? /* @__PURE__ */ new Date(+set + 144e5) : /* @__PURE__ */ new Date(+rise + (+set - +rise) / 2);
		const night = !(now >= rise && now < set), art = weather && wxMod ? wxMod.weatherArt(weather, night) : null;
		lastArt = art;
		lastNight = night;
		menu.sky(sunPathHTML(now, rise, set, art), night, art?.label);
		syncMotion();
	}
	function sunPathHTML(now, rise, set, art = null) {
		const W = 320, H = 110, left = 30, right = 290, base = 84, arcBase = 62, top = -22, dayLen = +set - +rise, day = now >= rise && now < set, nightLen = 864e5 - dayLen;
		const clamp = (v) => Math.min(1, Math.max(0, v));
		const night = clamp(now >= set ? (+now - +set) / nightLen : 1 - (+rise - +now) / nightLen), t = day ? clamp((+now - +rise) / dayLen) : 1 - night, u = 1 - t;
		const x = u * u * left + 2 * u * t * (W / 2) + t * t * right, y = u * u * arcBase + 2 * u * t * top + t * t * arcBase, f = (n) => n.toFixed(1);
		const C = day ? {
			sky: ["#7cc8ff", "#d8f0ff"],
			hill: "#9fd39a",
			hill2: "#7cbf86",
			city: "#8fb3d9",
			city2: "#a9c6e6",
			win: "#d8ecff",
			ground: "#f3e2a9",
			rail: "#c9a85a",
			path: "#ffffff"
		} : {
			sky: ["#1b2346", "#3b3f78"],
			hill: "#2b3466",
			hill2: "#232b57",
			city: "#1f2750",
			city2: "#283163",
			win: "#ffe08a",
			ground: "#171c38",
			rail: "#4b5487",
			path: "#c8d2ff"
		};
		const cloud = (cx, cy, k) => `<g fill="#fff" opacity=".92" transform="translate(${cx} ${cy}) scale(${k})"><circle cx="0" cy="0" r="7"/><circle cx="9" cy="-4" r="9"/><circle cx="19" cy="0" r="7"/><rect x="0" y="0" width="19" height="7" rx="3.5"/></g>`;
		const star = (sx, sy, k) => `<path transform="translate(${sx} ${sy}) scale(${k})" d="M0-4Q.6-.6 4 0Q.6 .6 0 4Q-.6 .6-4 0Q-.6-.6 0-4z" fill="#fff6c9"/>`;
		const deco = day ? cloud(24, 22, .9) + cloud(236, 16, .75) + cloud(92, 40, .55) : [
			[
				22,
				16,
				1
			],
			[
				70,
				34,
				.7
			],
			[
				118,
				12,
				.9
			],
			[
				200,
				22,
				.7
			],
			[
				262,
				12,
				1.1
			],
			[
				300,
				36,
				.7
			],
			[
				160,
				46,
				.6
			],
			[
				48,
				52,
				.5
			]
		].map(([a, b2, k]) => star(a, b2, k)).join("");
		const hills = `<path d="M0 ${base}L0 60Q30 40 62 56Q92 34 128 58Q150 50 170 ${base}Z" fill="${C.hill2}"/><path d="M150 ${base}Q200 44 248 60Q280 46 320 58L320 ${base}Z" fill="${C.hill}"/>`;
		const box = (bx, bw, bh, c) => `<rect x="${bx}" y="${base - bh}" width="${bw}" height="${bh}" rx="2" fill="${c}"/>`;
		const wins = (bx, bw, bh) => {
			let w = "";
			for (let wy = base - bh + 4; wy < 80; wy += 6) for (let wx = bx + 3; wx < bx + bw - 3; wx += 5) w += `<rect x="${wx}" y="${wy}" width="2" height="2.6" rx=".6" fill="${C.win}" opacity="${day ? .7 : (wx * 7 + wy * 3) % 5 ? 1 : .25}"/>`;
			return w;
		};
		const blocks = [
			[
				96,
				14,
				18,
				C.city2
			],
			[
				112,
				10,
				26,
				C.city
			],
			[
				124,
				16,
				16,
				C.city2
			],
			[
				186,
				12,
				22,
				C.city
			],
			[
				200,
				16,
				14,
				C.city2
			],
			[
				218,
				10,
				30,
				C.city
			],
			[
				230,
				14,
				18,
				C.city2
			]
		];
		const city = blocks.map(([bx, bw, bh, c]) => box(bx, bw, bh, c) + wins(bx, bw, bh)).join("") + `<path d="M146 ${base}L146 70Q160 60 174 70L174 ${base}Z" fill="${C.hill}"/><rect x="158.6" y="40" width="2.8" height="24" fill="${C.city}"/><rect x="155" y="44" width="10" height="5" rx="2.5" fill="${C.city}"/><circle cx="160" cy="38" r="1.6" fill="${day ? "#ff7a7a" : "#ff9a9a"}"/><path d="M262 ${base}L265 32L267 28L269 32L272 ${base}Z" fill="${C.city}"/>`;
		const sad = (art?.cover ?? "clear") === "hidden" && !!art?.wet;
		const face = (fx, fy, sleepy) => sleepy ? `<path d="M${f(fx - 5)} ${f(fy - 1)}q2 2 4 0M${f(fx + 1)} ${f(fy - 1)}q2 2 4 0" fill="none" stroke="#7a6a3a" stroke-width="1.3" stroke-linecap="round"/><path d="M${f(fx - 1.5)} ${f(fy + 4)}q1.5 ${sad ? -1 : 1} 3 0" fill="none" stroke="#7a6a3a" stroke-width="1.2" stroke-linecap="round"/>` : `<circle cx="${f(fx - 3.6)}" cy="${f(fy - 1.5)}" r="1.3" fill="#5a3a00"/><circle cx="${f(fx + 3.6)}" cy="${f(fy - 1.5)}" r="1.3" fill="#5a3a00"/><path d="M${f(fx - 3)} ${f(fy + (sad ? 3.4 : 2.2))}q3 ${sad ? -2.6 : 3} 6 0" fill="none" stroke="#5a3a00" stroke-width="1.4" stroke-linecap="round"/>`;
		const cheeks = (cx, cy) => `<circle cx="${f(cx - 6.5)}" cy="${f(cy + 2)}" r="2" fill="#ff8a8a" opacity=".6"/><circle cx="${f(cx + 6.5)}" cy="${f(cy + 2)}" r="2" fill="#ff8a8a" opacity=".6"/>`;
		const rays = [
			0,
			45,
			90,
			135,
			180,
			225,
			270,
			315
		].map((deg) => {
			const r1 = 13.5, r2 = 17.5, rad = deg * Math.PI / 180;
			return `M${f(x + Math.cos(rad) * r1)} ${f(y + Math.sin(rad) * r1)}L${f(x + Math.cos(rad) * r2)} ${f(y + Math.sin(rad) * r2)}`;
		}).join("");
		const body = day ? `<circle cx="${f(x)}" cy="${f(y)}" r="20" fill="#fff8d6" opacity=".55"/><path d="${rays}" stroke="#ffb21a" stroke-width="2.6" stroke-linecap="round"/><circle cx="${f(x)}" cy="${f(y)}" r="11" fill="#ffc21a" stroke="#f39a00" stroke-width="1.6"/>${face(x, y, false)}${cheeks(x, y)}` : `<circle cx="${f(x)}" cy="${f(y)}" r="17" fill="#fff4c7" opacity=".18"/><circle cx="${f(x)}" cy="${f(y)}" r="11" fill="#fff4c7" stroke="#e9d68f" stroke-width="1.4"/><circle cx="${f(x + 4)}" cy="${f(y - 5)}" r="1.8" fill="#eadfae"/><circle cx="${f(x - 5)}" cy="${f(y + 5)}" r="1.3" fill="#eadfae"/>${face(x, y, true)}${cheeks(x, y)}<text x="${f(x + 12)}" y="${f(y - 9)}" font-size="8" font-weight="700" fill="#c8d2ff">z</text><text x="${f(x + 17)}" y="${f(y - 15)}" font-size="6" font-weight="700" fill="#c8d2ff">z</text>`;
		const roofs = blocks.map(([bx, bw, bh]) => [
			bx,
			bw,
			base - bh
		]);
		const tx = 118, ty = 73;
		const car = (cx, front) => `<rect x="${cx}" y="${ty}" width="34" height="13" rx="${front ? 6 : 3}" fill="#ffffff" stroke="#3a3f4a" stroke-width="1"/><rect x="${cx}" y="81" width="34" height="2.4" fill="#00a84d"/>${[
			4,
			12,
			20
		].map((o) => `<rect x="${cx + o}" y="75.4" width="6" height="4.4" rx="1.4" fill="${day ? "#9fd4ff" : "#ffe08a"}"/>`).join("")}`;
		const train = car(tx, false) + car(154, true) + `<rect x="181" y="75.4" width="5" height="4.4" rx="1.6" fill="${day ? "#9fd4ff" : "#ffe08a"}"/><circle cx="182" cy="82" r="1.1" fill="#3a3f4a"/>` + (day ? "" : `<path d="M188 79L214 74L214 86Z" fill="#ffe08a" opacity=".28"/>`) + `<circle cx="124" cy="86.5" r="2" fill="#3a3f4a"/><circle cx="146" cy="86.5" r="2" fill="#3a3f4a"/><circle cx="160" cy="86.5" r="2" fill="#3a3f4a"/><circle cx="182" cy="86.5" r="2" fill="#3a3f4a"/><path d="M112 78h-8M113 82h-12" stroke="${C.path}" stroke-opacity=".8" stroke-width="1.6" stroke-linecap="round"/>`;
		const open = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"`;
		return `${open} class="sky-back"><defs><linearGradient id="sunPathSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky[0]}"/><stop offset="1" stop-color="${C.sky[1]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sunPathSky)"/>${deco}<path d="M${left} ${arcBase}Q${W / 2} ${top} ${right} ${arcBase}" fill="none" stroke="${C.path}" stroke-opacity=".75" stroke-width="1.8" stroke-dasharray="3 4" stroke-linecap="round"/>${art?.back ?? ""}</svg>${open} class="sky-sun">${body}${art?.over(x, y) ?? ""}</svg>${open} class="sky-front">${hills}${city}<rect y="${base}" width="${W}" height="26" fill="${C.ground}"/><rect y="86" width="${W}" height="2" fill="${C.rail}"/><g class="sky-still-train">${train}</g>${art?.pile(roofs, base) ?? ""}</svg>` + (art?.temp ? `<div class="sun-temp">${art.temp}</div>` : "") + `<div class="sun-times"><span>${hm(rise)} 해 뜸</span><span>해 짐 ${hm(set)}</span></div>`;
	}
	return {
		effectiveTheme,
		mapPalette,
		applyTheme,
		openSky,
		closeSky,
		get themeChoice() {
			return cur.themeChoice;
		},
		get mapColor() {
			return cur.mapColor;
		}
	};
}
export { createMapTheme };
