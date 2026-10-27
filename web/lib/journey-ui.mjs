// web/lib/journey-ui.mjs
var esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;"
})[c]);
var min = (s) => Math.max(1, Math.round(s / 60));
var hm = (t) => {
	const [h, m] = String(t).split(":").map(Number);
	return h * 60 + m;
};
var legSecs = (l) => l.type === "walk" ? l.seconds : Math.max(60, (hm(l.arrives) - hm(l.departs) + 1440) % 1440 * 60);
var legColorOf = (l, colors) => l.type === "bus" ? l.color : colors[l.line] || "#888";
var legName = (l) => l.type === "bus" ? l.route : l.line;
var legShort = (l) => l.type === "bus" ? l.route : l.line.replace(/호선$/, "").replace(/선$/, "");
var inkOn = (hex) => {
	const n = parseInt(String(hex).slice(1), 16);
	if (Number.isNaN(n)) return "#fff";
	const [r, g, b] = [
		n >> 16,
		n >> 8 & 255,
		n & 255
	].map((v) => {
		v /= 255;
		return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
	});
	const L = .2126 * r + .7152 * g + .0722 * b;
	return 1.05 / (L + .05) >= (L + .05) / .057 ? "#fff" : "#141414";
};
var BUS = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"currentColor\"><path d=\"M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2zm0 3v5h14V6zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z\"/></svg>";
var textW = (t) => [...String(t)].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 11.5 : 7), 0);
function routeTrack(p, colors, width = 330) {
	const segs = [];
	for (const l of p.legs) {
		if (l.type !== "walk" && l.wait > 30) segs.push({
			k: "wait",
			s: l.wait
		});
		segs.push({
			k: l.type === "walk" ? "walk" : "ride",
			s: legSecs(l),
			l
		});
	}
	const total = segs.reduce((a, g) => a + g.s, 0) || 1;
	return `<div class="jtrack" aria-hidden="true">${segs.map((g) => {
		const px = g.s / total * width;
		if (g.k === "walk") return `<i class="jseg walk" style="flex:${g.s} 1 0"></i>`;
		if (g.k === "wait") return `<i class="jseg wait" style="flex:${g.s} 1 0"></i>`;
		const c = legColorOf(g.l, colors), full = legName(g.l), short = legShort(g.l), need = textW(short) + 12;
		const label = px >= textW(full) + 14 ? full : short;
		return `<i class="jseg ride${g.l.type === "bus" ? " bus" : ""}" style="flex:${g.s} 1 0;min-width:${need}px;--c:${c};--t:${inkOn(c)}">${g.l.type === "bus" && px >= textW(full) + 34 ? BUS : ""}${esc(label)}</i>`;
	}).join("")}</div>`;
}
function initJourney({ openSheet, closeSheet, map, colors, myLocation, button, showRoute, clearRoute }) {
	const picked = {
		from: null,
		to: null
	};
	let last = null;
	let inSheet = false;
	let goSeq = 0;
	const bar = document.createElement("div");
	bar.className = "jbar";
	bar.hidden = true;
	bar.innerHTML = "<button type=\"button\" class=\"jbar-open\" aria-label=\"경로 결과 다시 보기\"></button><button type=\"button\" class=\"jbar-x\" aria-label=\"경로 지우기\" title=\"경로 지우기\"><svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"><path d=\"M6 6l12 12M18 6 6 18\"/></svg></button>";
	document.body.append(bar);
	bar.querySelector(".jbar-open").onclick = () => open();
	bar.querySelector(".jbar-x").onclick = () => {
		last = null;
		bar.hidden = true;
		clearRoute?.();
	};
	const PIN = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3.2\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3\"/><circle cx=\"12\" cy=\"12\" r=\"7.5\"/></svg>";
	const SWAP = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4\"/></svg>";
	function form() {
		const here = myLocation();
		return `<div class="journey">
  <h3>길찾기</h3>
  <button type="button" class="jsum" id="jSum" hidden></button>
  <div class="jcard">
    <div class="jf jrow"><i class="jdot from" aria-hidden="true"></i>
      <input id="jFrom" type="text" autocomplete="off" aria-label="출발지" placeholder="어디서 출발할까요?" value="${here ? "내 위치" : ""}">
      ${here ? `<button type="button" class="jf-here" id="jHere" aria-label="내 위치에서 출발" title="내 위치">${PIN}</button>` : ""}</div>
    <div class="jf jrow"><i class="jdot to" aria-hidden="true"></i>
      <input id="jTo" type="text" autocomplete="off" aria-label="도착지" placeholder="어디로 갈까요?"></div>
    <button type="button" class="jswap" id="jSwap" aria-label="출발지와 도착지 바꾸기" title="바꾸기">${SWAP}</button>
  </div>
  <ul class="jf-list" id="jFromList" aria-label="출발지 찾기 결과" hidden></ul>
  <ul class="jf-list" id="jToList" aria-label="도착지 찾기 결과" hidden></ul>
  <div class="jopts jwhen">
    <button type="button" class="jw-row" id="jWhenRow" aria-expanded="false" aria-controls="jWhenPanel">${CLOCK}<span id="jWhenText">지금 출발</span>${CHEV}</button>
    <div class="jw-panel" id="jWhenPanel" hidden>
      <div class="jw-head"><b>출발 시각</b><button type="button" class="jw-now" id="jWhenNow">지금으로</button></div>
      <div class="segmented jw-day" role="group" aria-label="날짜"><button type="button" data-d="0" aria-pressed="true">오늘</button><button type="button" data-d="1" aria-pressed="false">내일</button></div>
      <div class="jw-clock" aria-live="polite">
        <div class="jw-col"><button type="button" class="jw-step" data-u="h" data-s="1" aria-label="1시간 늦게">${UP}</button><output id="jWhenH">00</output><button type="button" class="jw-step" data-u="h" data-s="-1" aria-label="1시간 이르게">${DOWN}</button></div>
        <span class="jw-colon" aria-hidden="true">:</span>
        <div class="jw-col"><button type="button" class="jw-step" data-u="m" data-s="1" aria-label="1분 늦게">${UP}</button><output id="jWhenM">00</output><button type="button" class="jw-step" data-u="m" data-s="-1" aria-label="1분 이르게">${DOWN}</button></div>
      </div>
      <button type="button" class="jw-go" id="jWhenGo">이 시간에 출발</button>
    </div>
  </div>
  <div class="jf-status" id="jStatus" role="status" aria-live="polite"></div>
  <div id="jResult"></div>
</div>`;
	}
	const pad = (n) => String(n).padStart(2, "0");
	let when = { k: "now" }, draft = null;
	const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	const isTomorrow = (d) => d.toDateString() !== (/* @__PURE__ */ new Date()).toDateString();
	const soonest = () => {
		const d = /* @__PURE__ */ new Date();
		d.setSeconds(0, 0);
		d.setMinutes(d.getMinutes() + 1);
		return d;
	};
	const nextTen = () => {
		const d = soonest();
		d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10);
		return d;
	};
	const latest = () => {
		const d = /* @__PURE__ */ new Date();
		d.setDate(d.getDate() + 1);
		d.setHours(23, 50, 0, 0);
		return d;
	};
	const clamp = (d) => new Date(Math.min(latest(), Math.max(soonest(), d)));
	function whenValue() {
		return when.k === "at" ? local(when.d) : "";
	}
	function whenLabel() {
		return when.k === "at" ? `${isTomorrow(when.d) ? "내일" : "오늘"} ${hhmm(when.d)} 출발` : "지금 출발";
	}
	function whenSet(w) {
		when = w;
		const row = document.getElementById("jWhenRow");
		document.getElementById("jWhenText").textContent = whenLabel();
		row.classList.toggle("set", w.k === "at");
	}
	function stepped(d, u, n) {
		const x = new Date(d);
		if (u === "h") x.setTime(+x + n * 36e5);
		else x.setMinutes((x.getMinutes() + n + 60) % 60);
		return clamp(x);
	}
	function drawDraft() {
		document.getElementById("jWhenH").textContent = pad(draft.getHours());
		document.getElementById("jWhenM").textContent = pad(draft.getMinutes());
		const t = isTomorrow(draft);
		document.querySelectorAll(".jw-day button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.d === "1" === t)));
		document.querySelectorAll(".jw-step").forEach((b) => {
			b.disabled = +stepped(draft, b.dataset.u, +b.dataset.s) === +draft;
		});
	}
	function whenOpen(on) {
		const panel = document.getElementById("jWhenPanel"), row = document.getElementById("jWhenRow");
		panel.hidden = !on;
		row.setAttribute("aria-expanded", String(on));
		if (on) {
			draft = clamp(when.k === "at" ? new Date(when.d) : nextTen());
			drawDraft();
			requestAnimationFrame(() => panel.scrollIntoView({
				block: "nearest",
				behavior: "smooth"
			}));
		}
	}
	function bindPlace(which) {
		const input = document.getElementById(which === "from" ? "jFrom" : "jTo");
		const list = document.getElementById(which === "from" ? "jFromList" : "jToList");
		let timer = 0, seq = 0;
		input.addEventListener("input", () => {
			picked[which] = null;
			clearTimeout(timer);
			const q = input.value.trim();
			if (q.length < 2) {
				list.hidden = true;
				return;
			}
			timer = setTimeout(async () => {
				const my = ++seq, c = map.getCenter();
				try {
					const d = await (await fetch(`./api/place?q=${encodeURIComponent(q)}&near=${c.lat.toFixed(5)},${c.lng.toFixed(5)}`)).json();
					if (my !== seq) return;
					list.replaceChildren();
					if (!d.ok) {
						list.innerHTML = `<li class="jf-empty">${esc(d.error || "검색하지 못했어요")}</li>`;
						list.hidden = false;
						return;
					}
					if (!d.places.length) {
						list.innerHTML = "<li class=\"jf-empty\">찾는 곳이 없어요</li>";
						list.hidden = false;
						return;
					}
					for (const p of d.places) {
						const li = document.createElement("li"), b = document.createElement("button");
						b.type = "button";
						b.innerHTML = `<b>${esc(p.name)}</b><small>${esc(p.address)}</small>`;
						b.onclick = () => {
							picked[which] = p;
							input.value = p.name;
							list.hidden = true;
							next(which);
						};
						li.append(b);
						list.append(li);
					}
					list.hidden = false;
				} catch {
					if (my === seq) {
						list.innerHTML = "<li class=\"jf-empty\">검색하지 못했어요</li>";
						list.hidden = false;
					}
				}
			}, 300);
		});
	}
	const fromOf = () => picked.from || (document.getElementById("jFrom").value.trim() === "내 위치" && myLocation() ? {
		lat: myLocation()[1],
		lng: myLocation()[0]
	} : null);
	function next(which) {
		if (fromOf() && picked.to) {
			go();
			return;
		}
		const empty = !fromOf() ? "jFrom" : "jTo";
		if (which) document.getElementById(empty).focus({ preventScroll: true });
	}
	function fold(on) {
		const j = document.querySelector(".journey");
		if (!j) return;
		j.classList.toggle("done", on);
		const sum = document.getElementById("jSum");
		sum.hidden = !on;
		if (on) {
			const t = whenLabel();
			sum.innerHTML = `<span class="jsum-trip"><span class="jsum-end"><i class="jdot from"></i><b>${esc(document.getElementById("jFrom").value)}</b></span><span class="jsum-end"><i class="jdot to"></i><b>${esc(document.getElementById("jTo").value)}</b></span></span><span class="jsum-side"><span class="jsum-when">${esc(t)}</span><span class="jsum-edit">${EDIT}수정</span></span>`;
			sum.setAttribute("aria-label", `${document.getElementById("jFrom").value}에서 ${document.getElementById("jTo").value}까지, ${t}. 눌러서 바꾸기`);
		}
	}
	const legColor = (l) => legColorOf(l, colors);
	const track = (p, width = 330) => routeTrack(p, colors, width);
	const dur = (m) => m >= 60 ? `${Math.floor(m / 60)}<small>시간</small> ${m % 60}<small>분</small>` : `${m}<small>분</small>`;
	const WALK = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"currentColor\"><circle cx=\"13\" cy=\"4\" r=\"2\"/><path d=\"M10.2 7.6 7 9.4V13h2v-2.4l1.3-.7-1.6 8.1H11l1-4.3 2 2V21h2v-6.2l-2.1-2.1.6-3.1c1 1.3 2.5 2.1 4.2 2.2v-2c-1.4-.1-2.5-.9-3.1-2l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.6.1-.9.2z\"/></svg>";
	const CHEV = "<svg class=\"jw-chev\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 6 6 6-6 6\"/></svg>";
	const UP = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m6 15 6-6 6 6\"/></svg>";
	const DOWN = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m6 9 6 6 6-6\"/></svg>";
	const CLOCK = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/></svg>";
	const EDIT = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 20h4L19 9l-4-4L4 16z\"/><path d=\"m13.5 6.5 4 4\"/></svg>";
	function steps(p) {
		const station = (l, n) => l.type === "bus" ? n : `${n}역`;
		const items = [{
			n: "start",
			name: last?.from || "출발",
			t: p.leaveBy,
			c: "var(--syung)"
		}];
		for (const l of p.legs) {
			if (l.type === "walk") {
				items.push({
					e: "walk",
					l
				});
				continue;
			}
			items.push({
				n: "board",
				name: station(l, l.from),
				t: l.departs,
				c: legColor(l)
			}, {
				e: "ride",
				l
			}, {
				n: "alight",
				name: station(l, l.to),
				t: l.arrives,
				c: legColor(l)
			});
		}
		items.push({
			n: "end",
			name: last?.to || "도착",
			t: p.arrives,
			c: "var(--ink)"
		});
		const rows = [];
		for (let k = 0; k < items.length; k++) {
			const a = items[k], b = items[k + 1];
			if (a.n && b?.n) {
				rows.push({
					n: "change",
					name: a.name === b.name ? a.name : `${a.name} → ${b.name}`,
					t: a.t,
					t2: b.t,
					c: b.c
				});
				k++;
			} else rows.push(a);
		}
		return `<ol class="jsteps">${rows.map((r) => {
			if (r.n) return `<li class="js node ${r.n}" style="--c:${r.c}"><span class="js-t">${esc(r.t)}</span><span class="js-dot"></span><div class="js-b"><b>${esc(r.name)}</b>${r.n === "change" ? `<small>갈아타기${r.t2 && r.t2 !== r.t ? ` · ${esc(r.t2)} 출발` : ""}</small>` : ""}</div></li>`;
			const l = r.l;
			if (r.e === "walk") return `<li class="js walk"><span class="js-t"></span><span class="js-rail"></span><div class="js-b"><small>${WALK}걷기 ${min(l.seconds)}분 · ${Math.round(l.metres / 10) * 10}m${l.exit ? ` · ${esc(l.exit)}번 출구` : ""}</small></div></li>`;
			const c = legColor(l), toward = l.type === "bus" ? `${esc(l.toward)} 방면` : l.destination ? `${esc(l.destination)}행` : esc(l.direction || "");
			const note = l.type === "bus" ? l.alts?.length ? `같은 길 ${l.alts.map(esc).join(" · ")}` : "시간표 기준" : l.realtime ? `<span class="js-live">실시간 · 지금 ${esc(l.trainNow)}</span>` : "배차 간격 기준";
			return `<li class="js ride" style="--c:${c};--t:${inkOn(c)}"><span class="js-t"></span><span class="js-rail"></span><div class="js-b">
        <p><span class="js-chip">${l.type === "bus" ? BUS : ""}${esc(legName(l))}</span>${toward}</p>
        <small>${l.stops}${l.type === "bus" ? "정류장" : "정거장"}${l.wait > 60 ? ` · ${min(l.wait)}분 기다림` : ""} · ${note}</small></div></li>`;
		}).join("")}</ol>`;
	}
	function planHTML(p, i) {
		const live = p.legs.some((l) => l.realtime);
		return `<article class="jp" data-i="${i}" tabindex="0" role="button" aria-label="${esc(p.tag || "경로")} ${p.minutes}분, ${esc(p.arrives)} 도착, 지도에서 보기">
  <div class="jp-top"><strong class="jp-min">${dur(p.minutes)}</strong><span class="jp-arr">${esc(p.arrives)} 도착</span>${p.tag ? `<span class="jp-tag">${esc(p.tag)}</span>` : ""}</div>
  ${track(p)}
  <p class="jp-meta">${esc(p.leaveBy)} 출발 · 환승 ${p.transfers}번 · 걷기 ${p.walkMinutes}분${live ? "<span class=\"jp-live\">실시간</span>" : ""}</p>
  ${steps(p)}
</article>`;
	}
	const KINDS = [
		["all", "전체"],
		["subway", "지하철"],
		["bus", "버스"],
		["mixed", "지하철+버스"]
	];
	function render(d, sel) {
		const out = document.getElementById("jResult");
		const count = (k) => d.plans.filter((p) => k === "all" || p.kind === k).length;
		const kinds = KINDS.filter(([k]) => k !== "all" && count(k));
		if (kinds.length < 2) last.tab = "all";
		out.innerHTML = (kinds.length < 2 ? "" : `<div class="segmented jkinds" role="group" aria-label="경로 종류">${KINDS.filter(([k]) => k === "all" || count(k)).map(([k, name]) => `<button type="button" data-k="${k}" aria-pressed="${(last.tab || "all") === k}">${name}<b>${count(k)}</b></button>`).join("")}</div>`) + `<div class="jplans">${d.plans.map(planHTML).join("")}</div><p class="jp-note">경로를 누르면 지도에 보여요. 창을 닫아도 경로는 남아 있어요. 첫 열차는 실시간 위치로, 이후 열차는 배차 간격으로, 버스는 시간표로 계산한 예상 시간이에요.</p>`;
		const cards = [...out.querySelectorAll(".jp")];
		const filter = (k) => {
			last.tab = k;
			out.querySelectorAll(".jkinds button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
			cards.forEach((c, i) => {
				c.hidden = !(k === "all" || d.plans[i].kind === k);
			});
			if (cards[last.sel]?.hidden) {
				const i = cards.findIndex((c) => !c.hidden);
				if (i >= 0) pick(i);
			}
		};
		out.querySelectorAll(".jkinds button").forEach((b) => b.addEventListener("click", () => filter(b.dataset.k)));
		const pick = (i) => {
			last.sel = i;
			cards.forEach((c, j) => {
				c.classList.toggle("on", j === i);
				c.setAttribute("aria-expanded", String(j === i));
			});
			showRoute?.(d.plans[i]);
		};
		cards.forEach((c, i) => {
			c.addEventListener("click", () => {
				if (last.sel === i && c.classList.contains("on")) closeSheet?.();
				else pick(i);
			});
			c.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					c.click();
				}
			});
		});
		pick(sel);
		filter(last.tab || "all");
	}
	const LOADING = `<div class="jload" aria-hidden="true">${[
		0,
		1,
		2
	].map((i) => `<div class="jsk"><i class="jsk-min"></i><div class="jsk-track">${i === 0 ? "<span class=\"jsk-run\"><i></i></span>" : ""}</div><i class="jsk-meta"></i></div>`).join("")}</div>`;
	function failed(out, msg) {
		const status = document.getElementById("jStatus");
		if (status) {
			status.textContent = `경로를 찾지 못했어요. ${msg}`;
			status.classList.add("sr");
		}
		out.innerHTML = `<div class="jerr"><b>경로를 찾지 못했어요</b><p>${esc(msg)}</p><button type="button" class="jerr-retry">다시 찾기</button></div>`;
		out.querySelector(".jerr-retry").addEventListener("click", () => go());
	}
	async function go() {
		const status = document.getElementById("jStatus"), out = document.getElementById("jResult");
		const from = fromOf(), to = picked.to, my = ++goSeq;
		const trip = {
			from: document.getElementById("jFrom").value,
			to: document.getElementById("jTo").value,
			picked: { ...picked }
		};
		if (!from) {
			status.textContent = "출발지를 목록에서 골라 주세요.";
			return;
		}
		if (!to) {
			status.textContent = "도착지를 목록에서 골라 주세요.";
			return;
		}
		const at = whenValue();
		status.classList.remove("sr");
		status.textContent = "경로를 찾고 있어요";
		out.innerHTML = LOADING;
		fold(false);
		document.activeElement?.blur?.();
		try {
			const d = await (await fetch(`./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${at ? `&at=${encodeURIComponent(at)}` : ""}`)).json();
			if (my !== goSeq || !out.isConnected) return;
			if (!d.ok) {
				failed(out, d.error || "출발지나 도착지를 바꿔 보세요.");
				return;
			}
			status.textContent = "";
			last = {
				d,
				sel: 0,
				from: trip.from,
				to: trip.to,
				at,
				when: { ...when },
				picked: trip.picked
			};
			render(d, 0);
			dispatchEvent(new CustomEvent("syung:route"));
			fold(true);
			const sh = out.closest(".sheet-body");
			if (sh) sh.scrollTop = 0;
		} catch {
			if (my === goSeq && out.isConnected) failed(out, "연결이 불안정해요. 잠시 뒤 다시 찾아 주세요.");
		}
	}
	function open(fresh = false) {
		bar.hidden = true;
		openSheet(form());
		inSheet = true;
		bindPlace("from");
		bindPlace("to");
		if (!last) when = { k: "now" };
		whenSet(when);
		document.getElementById("jWhenRow").addEventListener("click", () => whenOpen(document.getElementById("jWhenPanel").hidden));
		document.getElementById("jWhenNow").addEventListener("click", () => {
			whenSet({ k: "now" });
			whenOpen(false);
			next();
		});
		document.getElementById("jWhenGo").addEventListener("click", () => {
			whenSet({
				k: "at",
				d: new Date(draft)
			});
			whenOpen(false);
			next();
		});
		document.querySelectorAll(".jw-day button").forEach((b) => b.addEventListener("click", () => {
			const d = new Date(draft), today = /* @__PURE__ */ new Date();
			d.setFullYear(today.getFullYear(), today.getMonth(), today.getDate() + +b.dataset.d);
			draft = clamp(d);
			drawDraft();
		}));
		document.querySelectorAll(".jw-step").forEach((b) => {
			const step = () => {
				draft = stepped(draft, b.dataset.u, +b.dataset.s);
				drawDraft();
			};
			let hold = 0, rep = 0;
			const stop = () => {
				clearTimeout(hold);
				clearTimeout(rep);
				hold = rep = 0;
			};
			b.addEventListener("pointerdown", (e) => {
				if (e.button) return;
				step();
				const t0 = performance.now();
				const tick = () => {
					if (b.disabled) return stop();
					step();
					const held = performance.now() - t0;
					rep = setTimeout(tick, held > 2200 ? 35 : held > 1200 ? 60 : 110);
				};
				hold = setTimeout(tick, 400);
			});
			for (const ev of [
				"pointerup",
				"pointerleave",
				"pointercancel"
			]) b.addEventListener(ev, stop);
			b.addEventListener("click", (e) => {
				if (e.detail === 0) step();
			});
			b.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
			b.addEventListener("contextmenu", (e) => e.preventDefault());
		});
		document.getElementById("jSum").addEventListener("click", () => {
			fold(false);
			document.getElementById("jTo").focus({ preventScroll: true });
		});
		document.getElementById("jSwap").addEventListener("click", () => {
			const f = document.getElementById("jFrom"), t = document.getElementById("jTo"), fp = fromOf();
			[f.value, t.value] = [t.value, f.value];
			[picked.from, picked.to] = [picked.to, fp && !picked.from ? {
				...fp,
				name: "내 위치"
			} : picked.from];
			next();
		});
		document.getElementById("jHere")?.addEventListener("click", () => {
			picked.from = null;
			document.getElementById("jFrom").value = "내 위치";
			next("from");
		});
		if (last) {
			document.getElementById("jFrom").value = last.from;
			document.getElementById("jTo").value = last.to;
			whenSet(last.when ? {
				...last.when,
				d: last.when.d && new Date(last.when.d)
			} : { k: "now" });
			Object.assign(picked, last.picked);
			render(last.d, last.sel);
			fold(true);
		} else if (!fresh) document.getElementById("jTo").focus({ preventScroll: true });
	}
	function openWith(end, place) {
		last = null;
		picked.from = picked.to = null;
		clearRoute?.();
		open(true);
		const other = end === "from" ? "to" : "from";
		picked[end] = place;
		document.getElementById(end === "from" ? "jFrom" : "jTo").value = place.name;
		const o = document.getElementById(other === "from" ? "jFrom" : "jTo");
		if (other === "from" && o.value === "내 위치") {
			go();
			return;
		}
		o.value = "";
		o.focus({ preventScroll: true });
	}
	function sheetClosed() {
		const was = inSheet;
		inSheet = false;
		if (!last || !was) return false;
		const p = last.d.plans[last.sel];
		bar.querySelector(".jbar-open").innerHTML = `<span class="jbar-top"><b>${dur(p.minutes)}</b><span>${esc(p.arrives)} 도착</span></span>${track(p, 240)}`;
		bar.hidden = false;
		return true;
	}
	function sheetReplaced() {
		if (inSheet) {
			inSheet = false;
			if (last) sheetClosed();
		}
	}
	button.addEventListener("click", () => open());
	return {
		open,
		openWith,
		sheetClosed,
		sheetReplaced
	};
}
export { initJourney, routeTrack };
