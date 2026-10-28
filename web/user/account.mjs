import { routeTrack } from "../lib/journey-ui.mjs";
import { __vitePreload } from "../_virtual/_vite/preload-helper.mjs";
import { accountView, avatarLook, nameLength } from "./account_view.mjs";
// web/user/account.mts
var $ = (id) => document.getElementById(id);
var CHANGE = { "X-Requested-With": "syung" };
var DAYS = [
	"월",
	"화",
	"수",
	"목",
	"금",
	"토",
	"일"
];
var LOGIN_ERRORS = {
	denied: "로그인을 취소했어요.",
	provider: "로그인 서비스가 답하지 않아요. 잠시 뒤 다시 해 주세요.",
	limit: "시도가 너무 많아요. 10분 뒤 다시 해 주세요."
};
var PROVIDERS = {
	kakao: ["카카오로 계속하기", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7S17 4 12 4z\" fill=\"#191919\"/></svg>"],
	google: ["구글로 계속하기", "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path fill=\"#EA4335\" d=\"M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z\"/><path fill=\"#4285F4\" d=\"M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.89 46.98 24.55Z\"/><path fill=\"#FBBC05\" d=\"M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z\"/><path fill=\"#34A853\" d=\"M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z\"/></svg>"],
	apple: ["Apple로 계속하기", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M17.05 12.54c.03 3.27 2.87 4.36 2.9 4.38-.02.08-.45 1.55-1.49 3.07-.9 1.31-1.83 2.62-3.3 2.65-1.44.03-1.91-.86-3.56-.86-1.64 0-2.16.83-3.53.89-1.42.05-2.5-1.42-3.41-2.73C2.8 17.26 1.39 12.36 3.3 9.05a5.3 5.3 0 0 1 4.49-2.72c1.4-.03 2.72.94 3.56.94.83 0 2.4-1.16 4.04-.99.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.3 4.15ZM14.35 4.5c.76-.92 1.28-2.2 1.14-3.48-1.1.04-2.44.74-3.23 1.66-.7.81-1.32 2.11-1.15 3.35 1.23.1 2.48-.63 3.24-1.53Z\"/></svg>"]
};
var LOGO = "<svg viewBox=\"0 0 100 60\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.1\" stroke-dasharray=\".3 2.3\" stroke-linecap=\"round\"><rect x=\"36\" y=\"11\" width=\"56\" height=\"38\" rx=\"19\"/><rect x=\"40.5\" y=\"15.5\" width=\"47\" height=\"29\" rx=\"14.5\"/><circle cx=\"74\" cy=\"30\" r=\"7.5\"/><circle cx=\"74\" cy=\"30\" r=\"3.5\"/><rect x=\"15\" y=\"16\" width=\"17\" height=\"7\" rx=\"3.5\"/><rect x=\"8\" y=\"26.5\" width=\"24\" height=\"7\" rx=\"3.5\"/><rect x=\"15\" y=\"37\" width=\"17\" height=\"7\" rx=\"3.5\"/></g></svg>";
var PHOTO_SIDE = 256;
var PHOTO_MAX = 153600;
function paintAvatar(el, avatar) {
	const { photo, image } = avatarLook(avatar);
	el.classList.toggle("photo", photo);
	el.classList.toggle("face", !photo);
	el.style.backgroundImage = image;
}
var toBlob = (canvas, type, quality) => new Promise((done) => canvas.toBlob(done, type, quality));
async function shrinkPhoto(file) {
	const image = await createImageBitmap(file, { imageOrientation: "from-image" });
	const side = Math.min(image.width, image.height);
	let source = image, sx = (image.width - side) / 2, sy = (image.height - side) / 2, from = side;
	if (side > PHOTO_SIDE * 4) {
		const step = document.createElement("canvas");
		step.width = step.height = PHOTO_SIDE * 4;
		const stepContext = step.getContext("2d");
		stepContext.imageSmoothingQuality = "high";
		stepContext.drawImage(image, sx, sy, side, side, 0, 0, step.width, step.height);
		source = step;
		sx = 0;
		sy = 0;
		from = step.width;
	}
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = PHOTO_SIDE;
	const context = canvas.getContext("2d");
	context.fillStyle = "#fff";
	context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);
	context.imageSmoothingQuality = "high";
	context.drawImage(source, sx, sy, from, from, 0, 0, PHOTO_SIDE, PHOTO_SIDE);
	image.close?.();
	for (const quality of [
		.86,
		.72,
		.55
	]) {
		let blob = await toBlob(canvas, "image/webp", quality);
		if (blob?.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
		if (blob?.type === "image/jpeg") {
			const { stripJpegMeta } = await __vitePreload(async () => {
				const { stripJpegMeta } = await import("./photo_meta.mjs");
				return { stripJpegMeta };
			}, [], import.meta.url);
			blob = new Blob([stripJpegMeta(new Uint8Array(await blob.arrayBuffer()))], { type: "image/jpeg" });
		}
		if (blob && blob.size <= PHOTO_MAX && (blob.type === "image/webp" || blob.type === "image/jpeg")) return blob;
	}
	throw new Error("too big");
}
var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[c]);
var todayDay = () => ((/* @__PURE__ */ new Date()).getDay() + 6) % 7 + 1;
var daysText = (days) => days.length ? days.map((d) => DAYS[d - 1]).join(" ") : "없음";
var shortName = (name) => name.length >= 7 ? `${name.slice(0, 3)}‥${name.slice(-2)}` : name;
var stationOnly = (name) => name.replace(/^(.+역)\s+\S*선$/, "$1");
async function getJson(url) {
	const r = await fetch(url, {
		cache: "no-store",
		credentials: "same-origin"
	});
	return {
		status: r.status,
		body: r.headers.get("content-type")?.includes("json") ? await r.json() : null
	};
}
async function send(method, url, body) {
	const r = await fetch(url, {
		method,
		credentials: "same-origin",
		headers: body ? {
			...CHANGE,
			"Content-Type": "application/json"
		} : CHANGE,
		body: body ? JSON.stringify(body) : void 0
	});
	return {
		status: r.status,
		ok: r.ok,
		body: r.headers.get("content-type")?.includes("json") ? await r.json().catch(() => null) : null
	};
}
function frontHTML(t) {
	const name = t.name || "승차권";
	const serial = `${t.id ? String(t.id).padStart(4, "0") : "----"} ${t.days.map((d) => DAYS[d - 1]).join("")} ${(t.depart || "").replace(":", "")}`;
	const today = t.id && t.days.includes(todayDay());
	return `<div class="tk-face tk-front"><div class="tk-logos"><div class="tk-logo-row">${LOGO.repeat(5)}</div></div><div class="tk-top"><b>${esc(name)}</b><b>${esc(t.depart || "--:--")}</b></div><div class="tk-strip">${`<span><img src="./brand/syung-light.svg" alt="">${esc(t.name ? `${name}권` : name)}</span>`.repeat(7)}</div><div class="tk-serial">${esc(serial)}</div>${today ? "<span class=\"tk-today\">오늘</span>" : ""}` + (t.id ? "<button class=\"tk-flip\" type=\"button\" aria-label=\"뒤집기\">↻</button>" : "") + "</div>";
}
function ticketEl(t) {
	const el = document.createElement("div");
	el.className = "ticket";
	el.innerHTML = `<div class="ticket-in">${frontHTML(t)}<div class="tk-face tk-back"><p class="tk-chain wait"><span>${esc(shortName(t.from.name))}</span><em>→</em><span>${esc(shortName(t.to.name))}</span></p><p class="tk-time"><span>출발 시각</span><b>${esc(t.depart)}</b></p><div class="tk-mag"></div><div class="tk-foot"><span>타는 날 ${esc(daysText(t.days))}</span><button class="tk-edit" type="button">고치기 ›</button></div></div></div>`;
	return el;
}
function chainHTML(t, legs) {
	const rides = legs.filter((l) => l.type !== "walk");
	const names = [
		stationOnly(t.from.name),
		...rides.slice(0, -1).map((l) => l.to),
		stationOnly(t.to.name)
	];
	const tag = rides.length > 1 ? `환승 ${rides.length - 1}` : rides.length ? "바로" : "걸어서";
	return names.map((n) => `<span title="${esc(n)}">${esc(shortName(n))}</span>`).join("<em>→</em>") + `<small>${tag}</small>`;
}
var chains = /* @__PURE__ */ new Map();
async function fillChain(t, p) {
	if (t.route) {
		p.innerHTML = chainHTML(t, t.route.legs);
		p.classList.remove("wait");
		return;
	}
	const key = `${t.id}|${t.from.lat},${t.from.lng}|${t.to.lat},${t.to.lng}|${t.depart}`;
	if (chains.has(key)) {
		p.innerHTML = chains.get(key);
		p.classList.remove("wait");
		return;
	}
	const now = /* @__PURE__ */ new Date(), pad = (n) => String(n).padStart(2, "0");
	const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${t.depart}`;
	let html;
	try {
		const { status, body } = await getJson(`./api/route?from=${t.from.lat},${t.from.lng}&to=${t.to.lat},${t.to.lng}&at=${encodeURIComponent(at)}`);
		const plan = status === 200 && body?.ok ? body.plans?.[0] : null;
		if (!plan) throw new Error("no plan");
		html = chainHTML(t, plan.legs);
		chains.set(key, html);
	} catch {
		html = `<span>${esc(shortName(t.from.name))}</span><em>→</em><span>${esc(shortName(t.to.name))}</span><small>길을 찾지 못했어요</small>`;
	}
	p.innerHTML = html;
	p.classList.remove("wait");
}
function placeSearch(input, found, onPick) {
	let timer = 0, seq = 0;
	input.addEventListener("input", () => {
		onPick(null);
		clearTimeout(timer);
		const q = input.value.trim();
		if (q.length < 2) {
			found.hidden = true;
			return;
		}
		timer = setTimeout(async () => {
			const my = ++seq;
			const row = (text) => {
				const li = document.createElement("li");
				li.className = "empty";
				li.textContent = text;
				return li;
			};
			try {
				const { body } = await getJson(`./api/place?q=${encodeURIComponent(q)}`);
				if (my !== seq) return;
				if (!body?.ok) found.replaceChildren(row("검색하지 못했어요"));
				else if (!body.places.length) found.replaceChildren(row("찾는 곳이 없어요"));
				else found.replaceChildren(...body.places.map((p) => {
					const li = document.createElement("li"), b = document.createElement("button"), name = document.createElement("b"), addr = document.createElement("small");
					b.type = "button";
					name.textContent = p.name;
					addr.textContent = p.address;
					b.append(name, addr);
					b.onclick = () => {
						input.value = p.name;
						found.hidden = true;
						onPick({
							name: p.name,
							lat: p.lat,
							lng: p.lng
						});
					};
					li.append(b);
					return li;
				}));
				found.hidden = false;
			} catch {
				if (my === seq) {
					found.replaceChildren(row("검색하지 못했어요"));
					found.hidden = false;
				}
			}
		}, 300);
	});
}
async function initAccount({ colors = {} } = {}) {
	const item = $("accountItem"), sheet = $("loginSheet");
	if (!item || !sheet) return;
	let answer = null;
	try {
		answer = await getJson("./api/auth/providers");
	} catch {
		return;
	}
	const providers = answer.status === 200 ? answer.body?.providers || [] : [];
	if (!providers.length) return;
	const say = (id, text) => {
		$(id).textContent = text || "";
	};
	let toastTimer = 0;
	const toastBox = $("accountToast");
	function hideToast(card) {
		card.classList.remove("show");
		setTimeout(() => {
			if (toastBox.firstChild === card && !card.classList.contains("show")) toastBox.replaceChildren();
		}, 200);
	}
	function toast(text, error = false) {
		const card = document.createElement("div");
		card.className = error ? "acct-toast is-error" : "acct-toast";
		card.innerHTML = `<span class="tt-speed" aria-hidden="true"><i></i><i></i></span><span>${esc(text)}</span>`;
		card.onclick = () => {
			clearTimeout(toastTimer);
			hideToast(card);
		};
		toastBox.replaceChildren(card);
		card.offsetWidth;
		card.classList.add("show");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => hideToast(card), error ? 3600 : 2400);
	}
	let me = null, tickets = [], editing = null;
	$("accountProviders").replaceChildren(...providers.filter((p) => PROVIDERS[p]).map((p) => {
		const a = document.createElement("a");
		a.className = `social ${p}`;
		a.href = `./api/auth/${p}/start`;
		a.innerHTML = `${PROVIDERS[p][1]}<span>${PROVIDERS[p][0]}</span>`;
		return a;
	}));
	const sheetOpen = () => !sheet.hidden;
	let motionData = null;
	const MOTION = {
		width: 800,
		height: 170,
		slotX: 400,
		slotY: 135,
		wait: 220
	};
	let motionAnim = null, motionTurn = 0, motionTimer = 0;
	function stopLogoMotion() {
		motionTurn++;
		clearTimeout(motionTimer);
		motionAnim?.destroy();
		motionAnim = null;
		sheet.querySelector(".login-motion")?.remove();
		sheet.querySelector(".login-brand").style.visibility = "";
	}
	async function playLogoMotion() {
		stopLogoMotion();
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const turn = motionTurn, openedAt = performance.now();
		try {
			if (!globalThis.lottie) await __vitePreload(() => import("../vendor/lottie/lottie_light.min.js"), [], import.meta.url);
			if (!motionData) {
				const res = await fetch(new URL(new URL("../assets/login-motion-CWTYoLkL.json", import.meta.url).href, "" + import.meta.url));
				if (!res.ok) return;
				motionData = await res.json();
			}
		} catch {
			return;
		}
		if (turn !== motionTurn || !globalThis.lottie || !sheet.classList.contains("open")) return;
		const logo = sheet.querySelector(".login-brand"), box = document.createElement("div");
		box.className = "login-motion";
		box.setAttribute("aria-hidden", "true");
		box.style.left = `${logo.offsetLeft + logo.offsetWidth / 2 - MOTION.slotX}px`;
		box.style.top = `${logo.offsetTop + logo.offsetHeight / 2 - MOTION.slotY}px`;
		logo.after(box);
		const anim = motionAnim = globalThis.lottie.loadAnimation({
			container: box,
			renderer: "svg",
			loop: false,
			autoplay: false,
			animationData: structuredClone(motionData)
		});
		anim.goToAndStop(0, true);
		logo.style.visibility = "hidden";
		anim.addEventListener("complete", () => {
			if (motionAnim === anim) stopLogoMotion();
		});
		motionTimer = setTimeout(() => {
			if (motionAnim === anim) anim.play();
		}, Math.max(0, MOTION.wait - (performance.now() - openedAt)));
	}
	function openSheet(message, error = false) {
		const note = $("loginMsg");
		if (message) note.innerHTML = `<span class="acct-toast show${error ? " is-error" : ""}"><span class="tt-speed" aria-hidden="true"><i></i><i></i></span><span>${esc(message)}</span></span>`;
		else note.replaceChildren();
		if ($("settingsPanel")?.classList.contains("open")) $("settingsClose").click();
		sheet.hidden = false;
		sheet.offsetWidth;
		sheet.classList.add("open");
		sheet.querySelector(".social")?.focus({ preventScroll: true });
		playLogoMotion();
	}
	function closeSheet() {
		stopLogoMotion();
		sheet.classList.remove("open");
		setTimeout(() => {
			if (!sheet.classList.contains("open")) sheet.hidden = true;
		}, 260);
		$("settingsButton")?.focus({ preventScroll: true });
	}
	$("loginOpen").onclick = () => openSheet("");
	sheet.querySelector(".login-scrim").onclick = closeSheet;
	window.addEventListener("keydown", (e) => {
		if (!sheetOpen()) return;
		if (e.key === "Escape") {
			e.stopImmediatePropagation();
			closeSheet();
			return;
		}
		if (e.key !== "Tab") return;
		const items = [...sheet.querySelectorAll("a[href],button")].filter((el) => el.offsetParent);
		if (!items.length) return;
		const first = items[0], last = items[items.length - 1];
		const inside = sheet.contains(document.activeElement);
		if (e.shiftKey && (!inside || document.activeElement === first)) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && (!inside || document.activeElement === last)) {
			e.preventDefault();
			first.focus();
		}
	}, true);
	function show() {
		item.hidden = false;
		$("loginOpen").hidden = !!me;
		$("accountRow").hidden = !me;
		$("ticketsRow").hidden = !me;
		if (!me) {
			closeName();
			closePick();
			accountView.set({
				statsShown: false,
				safeShown: false
			});
			accountSeq++;
			return;
		}
		paintAvatar($("accountAvatar"), me.avatar);
		$("accountItemName").textContent = me.name;
		accountView.set({
			me,
			marked: true
		});
	}
	function openPick() {
		closeName();
		accountView.set({
			facesLoaded: true,
			pickOpen: true
		});
		document.querySelector("#avatarChoices [aria-pressed=true]")?.focus({ preventScroll: true });
	}
	function closePick() {
		accountView.set({ pickOpen: false });
	}
	let saving = false;
	function busy(on) {
		saving = on;
		accountView.set({ saving: on });
	}
	async function saveProfile(request, done) {
		if (saving) return;
		busy(true);
		try {
			const r = await request();
			if (r.status === 401) {
				me = null;
				show();
				toast("로그인이 끝났어요. 다시 로그인해 주세요.", true);
				return;
			}
			if (!r.ok) {
				toast(r.body?.error?.message || "바꾸지 못했어요. 잠시 뒤 다시 해 주세요.", true);
				return;
			}
			me = r.body;
			show();
			toast(done);
			return true;
		} catch {
			toast("바꾸지 못했어요. 연결을 확인해 주세요.", true);
		} finally {
			busy(false);
		}
	}
	function pickCharacter(id) {
		if (id === (me?.avatar?.type === "character" ? me.avatar.id : me?.avatar ? "photo" : "sprout")) return;
		saveProfile(() => id === "sprout" ? send("DELETE", "./api/me/avatar") : send("PUT", "./api/me/avatar", { character: id }), "프로필을 바꿨어요");
	}
	async function photoChosen(file) {
		if (!file) return;
		let blob;
		try {
			blob = await shrinkPhoto(file);
		} catch {
			toast("이 사진은 열 수 없어요. 다른 사진을 골라 주세요.", true);
			return;
		}
		saveProfile(async () => {
			const r = await fetch("./api/me/avatar", {
				method: "PUT",
				credentials: "same-origin",
				headers: {
					...CHANGE,
					"Content-Type": blob.type
				},
				body: blob
			});
			return {
				status: r.status,
				ok: r.ok,
				body: r.headers.get("content-type")?.includes("json") ? await r.json().catch(() => null) : null
			};
		}, "프로필 사진을 바꿨어요");
	}
	function openName() {
		closePick();
		accountView.set({
			nameValue: me?.name || "",
			nameOpen: true
		});
		$("nameInput").focus({ preventScroll: true });
		$("nameInput").select();
	}
	function closeName() {
		accountView.set({ nameOpen: false });
	}
	async function submitName() {
		const name = accountView.state.nameValue.trim(), count = nameLength(name);
		if (count < 1 || count > 12) {
			toast(`닉네임은 1~12자예요`, true);
			$("nameInput").focus();
			return;
		}
		if (name === me?.name) {
			closeName();
			return;
		}
		accountView.set({ nameSaving: true });
		try {
			if (await saveProfile(() => send("PUT", "./api/me/profile", { name }), "닉네임을 바꿨어요")) {
				closeName();
				$("nameEdit").focus({ preventScroll: true });
			}
		} finally {
			accountView.set({ nameSaving: false });
		}
	}
	function renderTickets() {
		$("ticketList").replaceChildren(...tickets.map((t) => {
			const el = ticketEl(t);
			el.onclick = (e) => {
				if (e.target.closest(".tk-edit")) {
					e.stopPropagation();
					openTicket(t);
					return;
				}
				el.classList.toggle("flipped");
				if (el.classList.contains("flipped")) {
					fillChain(t, el.querySelector(".tk-chain"));
					countUse("ticket");
				}
			};
			return el;
		}));
	}
	async function loadTickets() {
		try {
			const r = await getJson("./api/me/tickets");
			if (r.status === 200) {
				tickets = r.body.tickets;
				renderTickets();
			}
		} catch {}
	}
	$("menuBack").addEventListener("click", (e) => {
		if (!$("menuPlace").hidden || !$("menuRoute").hidden) {
			e.stopImmediatePropagation();
			backToForm();
		} else if (!$("menuTicket").hidden) {
			e.stopImmediatePropagation();
			$("ticketsRow").click();
		}
	}, true);
	const form = {
		from: null,
		to: null,
		route: null
	};
	let lastField = null;
	function backToForm() {
		$("ticketOpen").click();
		lastField?.focus({ preventScroll: true });
	}
	const dayBox = $("ticketDays");
	dayBox.replaceChildren(...DAYS.map((label, index) => {
		const b = document.createElement("button");
		b.type = "button";
		b.textContent = label;
		b.dataset.day = String(index + 1);
		b.setAttribute("aria-pressed", "false");
		b.onclick = () => {
			b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
			daysChanged();
		};
		return b;
	}));
	const pickedDays = () => [...dayBox.children].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => +b.dataset.day);
	function daysChanged() {
		const now = pickedDays().join(",");
		for (const b of $("ticketQuick").children) b.setAttribute("aria-pressed", String(b.dataset.quick === now));
		preview();
	}
	for (const b of $("ticketQuick").children) b.onclick = () => {
		const days = b.dataset.quick.split(",");
		for (const day of dayBox.children) day.setAttribute("aria-pressed", String(days.includes(day.dataset.day)));
		daysChanged();
	};
	function preview() {
		$("ticketPreview").innerHTML = `<div class="ticket"><div class="ticket-in">${frontHTML({
			id: editing?.id,
			name: $("ticketName").value.trim(),
			depart: $("ticketTime").value,
			days: pickedDays()
		})}</div></div>`;
	}
	$("ticketName").addEventListener("input", () => {
		$("ticketNameCount").textContent = `${[...$("ticketName").value].length}/12`;
		preview();
	});
	function showPlaces() {
		for (const [id, place, empty] of [[
			"ticketFrom",
			form.from,
			"출발지 고르기"
		], [
			"ticketTo",
			form.to,
			"도착지 고르기"
		]]) {
			const b = $(id).querySelector("b");
			b.textContent = place?.name || empty;
			b.classList.toggle("ph", !place);
		}
	}
	function showTime() {
		const [h, m] = ($("ticketTime").value || "08:00").split(":").map(Number);
		$("ticketTimeText").innerHTML = `<em>${h < 12 ? "오전" : "오후"}</em> ${h % 12 || 12}:${String(m).padStart(2, "0")}`;
	}
	function showRoute() {
		const r = form.route, b = $("ticketRoute");
		b.classList.toggle("empty", !r);
		b.innerHTML = r ? `${routeTrack(r, colors, 270)}<span class="pk"><b>${r.minutes}분</b> · ${esc(r.arrives)} 도착 · 환승 ${r.transfers}</span><u>바꾸기</u>` : `<span class="pk">경로 고르기</span><svg class="tf-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`;
		$("ticketSave").disabled = !r;
	}
	function routeGone() {
		if (form.route) toast("출발 · 도착 · 시각이 바뀌어서 경로를 다시 골라 주세요", true);
		form.route = null;
		showRoute();
	}
	let placeFor = "from";
	function openPlace(which) {
		placeFor = which;
		lastField = $(which === "from" ? "ticketFrom" : "ticketTo");
		$("menuPlace").setAttribute("aria-label", which === "from" ? "출발지 고르기" : "도착지 고르기");
		$("placeDot").classList.toggle("to", which === "to");
		$("placeQuery").value = "";
		$("placeList").hidden = true;
		$("placeList").replaceChildren();
		$("placeOpen").click();
		$("placeQuery").focus({ preventScroll: true });
	}
	$("ticketFrom").onclick = () => openPlace("from");
	$("ticketTo").onclick = () => openPlace("to");
	placeSearch($("placeQuery"), $("placeList"), (place) => {
		if (!place) return;
		const before = form[placeFor];
		form[placeFor] = place;
		if (!before || before.lat !== place.lat || before.lng !== place.lng) routeGone();
		showPlaces();
		backToForm();
	});
	const ROW = 40;
	const wheelBox = $("ticketTimePick");
	const wheels = Object.fromEntries([...wheelBox.querySelectorAll(".tw-col")].map((el) => [el.dataset.part, {
		el,
		values: [],
		label: String
	}]));
	const pad2 = (n) => String(n).padStart(2, "0");
	let timeAtOpen = "";
	const wheelIndex = (w) => Math.max(0, Math.min(w.values.length - 1, Math.round(w.el.scrollTop / ROW)));
	function markWheel(w) {
		const at = wheelIndex(w);
		[...w.el.children].forEach((b, index) => {
			b.className = index === at ? "on" : Math.abs(index - at) === 1 ? "near" : "";
		});
		w.el.setAttribute("aria-valuetext", w.label(w.values[at]));
	}
	function setWheel(part, values, label, current) {
		const w = wheels[part];
		w.values = values;
		w.label = label;
		w.el.replaceChildren(...values.map((value, index) => {
			const b = document.createElement("button");
			b.type = "button";
			b.tabIndex = -1;
			b.textContent = label(value);
			b.onclick = () => w.el.scrollTo({
				top: index * ROW,
				behavior: "smooth"
			});
			return b;
		}));
		w.el.scrollTop = Math.max(0, values.indexOf(current)) * ROW;
		markWheel(w);
	}
	function wheelTime() {
		const value = (part) => wheels[part].values[wheelIndex(wheels[part])];
		return `${pad2(value("ampm") * 12 + value("hour") % 12)}:${pad2(value("minute"))}`;
	}
	for (const w of Object.values(wheels)) {
		let frame = 0;
		w.el.addEventListener("scroll", () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				markWheel(w);
				$("ticketTime").value = wheelTime();
				showTime();
				preview();
			});
		}, { passive: true });
		w.el.addEventListener("keydown", (e) => {
			if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
			e.preventDefault();
			w.el.scrollTo({
				top: (wheelIndex(w) + (e.key === "ArrowDown" ? 1 : -1)) * ROW,
				behavior: "smooth"
			});
		});
	}
	function openWheel() {
		const [h, m] = $("ticketTime").value.split(":").map(Number);
		timeAtOpen = $("ticketTime").value;
		wheelBox.hidden = false;
		$("ticketTimeBtn").setAttribute("aria-expanded", "true");
		const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
		if (!minutes.includes(m)) {
			minutes.push(m);
			minutes.sort((left, right) => left - right);
		}
		setWheel("ampm", [0, 1], (value) => value ? "오후" : "오전", h < 12 ? 0 : 1);
		setWheel("hour", Array.from({ length: 12 }, (_, index) => index + 1), String, h % 12 || 12);
		setWheel("minute", minutes, pad2, m);
		wheels.hour.el.focus({ preventScroll: true });
	}
	function closeWheel(changed = true) {
		if (wheelBox.hidden) return;
		wheelBox.hidden = true;
		$("ticketTimeBtn").setAttribute("aria-expanded", "false");
		if (changed && $("ticketTime").value !== timeAtOpen) routeGone();
	}
	$("ticketTimeBtn").onclick = () => {
		if (wheelBox.hidden) openWheel();
		else closeWheel();
	};
	$("ticketTimeDone").onclick = () => {
		closeWheel();
		$("ticketTimeBtn").focus({ preventScroll: true });
	};
	function nextRide() {
		const days = pickedDays(), [h, m] = $("ticketTime").value.split(":").map(Number), now = /* @__PURE__ */ new Date();
		for (let ahead = 0; ahead < 8; ahead++) {
			const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, h, m);
			const weekday = (day.getDay() + 6) % 7 + 1;
			if (day > now && (!days.length || days.includes(weekday))) return day;
		}
		return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m);
	}
	const slimLeg = (l) => l.type === "walk" ? {
		type: "walk",
		seconds: Math.max(0, Math.round(l.seconds || 0))
	} : {
		type: l.type,
		...l.type === "bus" ? {
			route: l.route,
			color: l.color
		} : { line: l.line },
		from: l.from,
		to: l.to,
		departs: l.departs,
		arrives: l.arrives,
		wait: Math.max(0, Math.round(l.wait || 0))
	};
	const slimRoute = (p) => ({
		tag: p.tag || "",
		minutes: p.minutes,
		leaveBy: p.leaveBy,
		arrives: p.arrives,
		transfers: p.transfers,
		walkMinutes: p.walkMinutes,
		legs: p.legs.map(slimLeg)
	});
	const rideSig = (p) => p.legs.filter((l) => l.type !== "walk").map((l) => `${l.line || l.route}|${l.from}|${l.to}`).join(">");
	let plans = [], chosen = -1, routeSeq = 0;
	function drawPlans() {
		$("routeList").replaceChildren(...plans.map((p, index) => {
			const b = document.createElement("button");
			b.type = "button";
			b.className = "rt-plan";
			b.setAttribute("role", "radio");
			b.setAttribute("aria-checked", String(index === chosen));
			b.setAttribute("aria-label", `${p.tag || "경로"} ${p.minutes}분, ${p.arrives} 도착, 환승 ${p.transfers}번`);
			b.innerHTML = `<i class="rt-radio" aria-hidden="true"></i><span class="rt-b"><span class="jp-top"><strong class="jp-min">${p.minutes}<small>분</small></strong><span class="jp-arr">${esc(p.arrives)} 도착</span>${p.tag ? `<span class="jp-tag">${esc(p.tag)}</span>` : ""}</span>${routeTrack(p, colors, 250)}<span class="jp-meta">${esc(p.leaveBy)} 출발 · 환승 ${p.transfers}번 · 걷기 ${p.walkMinutes}분</span></span>`;
			b.onclick = () => {
				chosen = index;
				for (const [other, el] of [...$("routeList").children].entries()) el.setAttribute("aria-checked", String(other === chosen));
			};
			return b;
		}));
		$("routePick").hidden = !plans.length;
	}
	async function openRoute() {
		lastField = $("ticketRoute");
		if (!form.from || !form.to) {
			toast("출발지 · 도착지를 먼저 골라 주세요", true);
			$(form.from ? "ticketTo" : "ticketFrom").focus();
			return;
		}
		const when = nextRide(), pad = (n) => String(n).padStart(2, "0");
		$("routeTrip").textContent = `${form.from.name} → ${form.to.name}`;
		$("routeWhen").textContent = `${when.getMonth() + 1}월 ${when.getDate()}일(${DAYS[(when.getDay() + 6) % 7]}) ${$("ticketTimeText").textContent} 출발 기준`;
		plans = [];
		chosen = -1;
		drawPlans();
		say("routeMsg", "경로를 찾는 중…");
		$("routeOpen").click();
		const my = ++routeSeq;
		const at = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
		try {
			const { status, body } = await getJson(`./api/route?from=${form.from.lat},${form.from.lng}&to=${form.to.lat},${form.to.lng}&at=${encodeURIComponent(at)}`);
			if (my !== routeSeq) return;
			if (status !== 200 || !body?.ok || !body.plans?.length) {
				say("routeMsg", body?.error || "경로를 찾지 못했어요.");
				return;
			}
			plans = body.plans;
			const mine = form.route ? plans.findIndex((p) => rideSig(p) === rideSig(form.route)) : -1;
			const fastest = plans.findIndex((p) => p.tag === "가장 빠른 길");
			chosen = mine >= 0 ? mine : Math.max(0, fastest);
			say("routeMsg", "");
			drawPlans();
			$("routeList").children[chosen]?.focus({ preventScroll: true });
		} catch {
			if (my === routeSeq) say("routeMsg", "경로를 찾지 못했어요. 연결을 확인해 주세요.");
		}
	}
	$("ticketRoute").onclick = openRoute;
	$("routePick").onclick = () => {
		if (!plans[chosen]) return;
		form.route = slimRoute(plans[chosen]);
		showRoute();
		backToForm();
	};
	let deleteArmed = false;
	function openTicket(t) {
		editing = t || null;
		deleteArmed = false;
		lastField = null;
		$("menuTicket").setAttribute("aria-label", t ? "승차권 고치기" : "승차권 발권");
		$("ticketName").value = t?.name || "";
		$("ticketNameCount").textContent = `${[...$("ticketName").value].length}/12`;
		closeWheel(false);
		$("ticketTime").value = t?.depart || "08:00";
		form.from = t?.from || null;
		form.to = t?.to || null;
		form.route = t?.route || null;
		for (const b of dayBox.children) b.setAttribute("aria-pressed", String(t ? t.days.includes(+b.dataset.day) : false));
		$("ticketDelete").hidden = !t;
		$("ticketDelete").textContent = "이 승차권 지우기";
		showPlaces();
		showTime();
		showRoute();
		daysChanged();
		$("ticketOpen").click();
	}
	$("ticketNew").onclick = () => openTicket(null);
	$("ticketForm").onsubmit = async (e) => {
		e.preventDefault();
		closeWheel();
		if (!form.route) return;
		const body = {
			name: $("ticketName").value.trim(),
			from: form.from,
			to: form.to,
			depart: $("ticketTime").value,
			days: pickedDays(),
			route: form.route
		};
		if (!body.from || !body.to) {
			toast("출발지 · 도착지를 골라 주세요", true);
			$(body.from ? "ticketTo" : "ticketFrom").focus();
			return;
		}
		if (!body.route) {
			toast("경로를 골라 주세요", true);
			$("ticketRoute").focus();
			return;
		}
		if (!body.name) {
			toast("승차권 이름을 넣어 주세요", true);
			$("ticketName").focus();
			return;
		}
		const save = $("ticketSave");
		save.disabled = true;
		save.textContent = "발권하는 중…";
		try {
			const r = editing ? await send("PUT", `./api/me/tickets/${editing.id}`, body) : await send("POST", "./api/me/tickets", body);
			if (r.status === 401) {
				me = null;
				show();
				toast("로그인이 끝났어요. 다시 로그인해 주세요.", true);
				return;
			}
			if (!r.ok) {
				toast(r.body?.error?.message || "발권하지 못했어요.", true);
				return;
			}
			const fixed = !!editing;
			await loadTickets();
			$("ticketsRow").click();
			toast(fixed ? "승차권을 고쳤어요" : "발권했어요");
		} catch {
			toast("발권하지 못했어요. 연결을 확인해 주세요.", true);
		} finally {
			save.textContent = "발권하기";
			showRoute();
		}
	};
	$("ticketDelete").onclick = async () => {
		if (!editing) return;
		if (!deleteArmed) {
			deleteArmed = true;
			$("ticketDelete").textContent = "한 번 더 누르면 지워요";
			return;
		}
		try {
			const r = await send("DELETE", `./api/me/tickets/${editing.id}`);
			if (!r.ok && r.status !== 404) {
				toast("지우지 못했어요.", true);
				return;
			}
			await loadTickets();
			$("ticketsRow").click();
			toast("승차권을 지웠어요");
		} catch {
			toast("지우지 못했어요. 연결을 확인해 주세요.", true);
		}
	};
	function countUse(kind) {
		if (!me) return;
		send("POST", "./api/me/usage", { kind }).catch(() => {});
	}
	addEventListener("syung:route", () => countUse("route"));
	let accountSeq = 0;
	async function loadAccountPage() {
		if (!me) return;
		const my = ++accountSeq;
		let stats, sessions;
		try {
			[stats, sessions] = await Promise.all([getJson("./api/me/stats"), getJson("./api/me/sessions")]);
		} catch {
			return;
		}
		if (my !== accountSeq || !me) return;
		if (stats.status === 401 || sessions.status === 401) {
			me = null;
			show();
			return;
		}
		const view = accountView.state;
		if (stats.status === 200) accountView.set({
			stats: stats.body,
			statsTurn: view.statsTurn + 1,
			statsShown: true
		});
		if (sessions.status === 200) accountView.set({
			sessions: sessions.body.sessions,
			safeTurn: view.safeTurn + 1,
			safeShown: true
		});
	}
	$("accountRow").addEventListener("click", loadAccountPage);
	const outBusy = (id, on) => accountView.set({ outBusy: on ? [...accountView.state.outBusy, id] : accountView.state.outBusy.filter((other) => other !== id) });
	async function logoutDevice(id) {
		outBusy(id, true);
		try {
			const r = await send("DELETE", `./api/me/sessions/${encodeURIComponent(id)}`);
			if (r.status === 401) {
				me = null;
				show();
				toast("로그인이 끝났어요. 다시 로그인해 주세요.", true);
				return;
			}
			if (!r.ok && r.status !== 404) {
				toast("로그아웃하지 못했어요.", true);
				return;
			}
			toast("그 기기에서 로그아웃했어요");
			loadAccountPage();
		} catch {
			toast("로그아웃하지 못했어요. 연결을 확인해 주세요.", true);
		} finally {
			outBusy(id, false);
		}
	}
	async function logoutOthers() {
		try {
			const r = await send("DELETE", "./api/me/sessions?others=1");
			if (r.status === 401) {
				me = null;
				show();
				toast("로그인이 끝났어요. 다시 로그인해 주세요.", true);
				return;
			}
			if (!r.ok) {
				toast("로그아웃하지 못했어요.", true);
				return;
			}
			toast(`다른 기기 ${r.body?.removed ?? 0}대에서 로그아웃했어요`);
			loadAccountPage();
		} catch {
			toast("로그아웃하지 못했어요. 연결을 확인해 주세요.", true);
		}
	}
	async function exportData() {
		try {
			const r = await getJson("./api/me/export");
			if (r.status === 401) {
				me = null;
				show();
				toast("로그인이 끝났어요. 다시 로그인해 주세요.", true);
				return;
			}
			if (r.status !== 200) {
				toast("내려받지 못했어요. 잠시 뒤 다시 해 주세요.", true);
				return;
			}
			const now = /* @__PURE__ */ new Date(), pad = (n) => String(n).padStart(2, "0");
			const a = document.createElement("a");
			a.href = URL.createObjectURL(new Blob([JSON.stringify(r.body, null, 2)], { type: "application/json" }));
			a.download = `syung-my-data-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
			document.body.append(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
			toast("내 데이터를 내려받았어요");
		} catch {
			toast("내려받지 못했어요. 연결을 확인해 주세요.", true);
		}
	}
	async function logout() {
		try {
			await send("POST", "./api/auth/logout");
		} catch {}
		me = null;
		tickets = [];
		show();
		$("menuBack").click();
		toast("로그아웃했어요");
	}
	async function deleteMe() {
		try {
			const r = await send("DELETE", "./api/me");
			if (!r.ok && r.status !== 401) {
				toast("탈퇴하지 못했어요. 잠시 뒤 다시 해 주세요.", true);
				return;
			}
			me = null;
			tickets = [];
			accountView.set({ confirmOpen: false });
			show();
			$("menuBack").click();
			toast("탈퇴했어요");
		} catch {
			toast("탈퇴하지 못했어요. 연결을 확인해 주세요.", true);
		}
	}
	accountView.on({
		avatarBig: () => {
			if (accountView.state.pickOpen) closePick();
			else openPick();
		},
		pickPhoto: () => {
			if (!saving) $("photoFile").click();
		},
		photoFile: photoChosen,
		pickCharacter,
		nameEdit: () => {
			if (accountView.state.nameOpen) closeName();
			else openName();
		},
		nameCancel: () => {
			closeName();
			$("nameEdit").focus({ preventScroll: true });
		},
		nameSubmit: submitName,
		logoutDevice,
		logoutOthers,
		exportData,
		logout,
		deleteAsk: () => {
			accountView.set({ confirmOpen: true });
			$("accountConfirmYes").focus({ preventScroll: true });
		},
		deleteNo: () => accountView.set({ confirmOpen: false }),
		deleteYes: deleteMe
	});
	me = answer.body.me || null;
	show();
	if (me) {
		countUse("open");
		await loadTickets();
	}
	const back = /(?:^#|&)login=(\w+)/.exec(location.hash);
	if (back) {
		history.replaceState(null, "", location.pathname + location.search);
		const succeeded = back[1] === "ok" || back[1] === "new";
		if (!me) openSheet(LOGIN_ERRORS[back[1]] || "로그인하지 못했어요. 잠시 뒤 다시 해 주세요.", back[1] !== "denied");
		else if (!succeeded) $("settingsButton")?.click();
	}
}
export { initAccount };
