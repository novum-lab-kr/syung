import { appMapMode } from "./server_url.mjs";
// web/lib/analytics.mts
var MEASUREMENT_ID = "G-PV1KC7LCL6";
var MAP_HOST = "map.syung.novum-lab.com";
var LOGIN_METHODS = /* @__PURE__ */ new Set([
	"kakao",
	"google",
	"apple"
]);
function analyticsAllowed(hostname, app) {
	return !app && hostname === MAP_HOST;
}
function detailOf(event) {
	return event.detail;
}
function startAnalytics(page = window, app = appMapMode()) {
	if (!analyticsAllowed(page.location.hostname, app)) return false;
	try {
		const layer = page.dataLayer ??= [];
		const gtag = function(..._args) {
			layer.push(arguments);
		};
		gtag("js", /* @__PURE__ */ new Date());
		gtag("config", MEASUREMENT_ID, {
			page_location: page.location.origin + page.location.pathname,
			allow_google_signals: false,
			allow_ad_personalization_signals: false
		});
		page.addEventListener("syung:route", () => gtag("event", "route_search"));
		page.addEventListener("syung:mode", (event) => {
			const mode = detailOf(event);
			if (typeof mode === "string") gtag("event", "mode_change", { mode });
		});
		page.addEventListener("syung:login", (event) => {
			const method = detailOf(event);
			if (typeof method === "string" && LOGIN_METHODS.has(method)) gtag("event", "login", { method });
		});
		const load = () => {
			const loader = page.document.createElement("script");
			loader.async = true;
			loader.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
			page.document.head.appendChild(loader);
		};
		page.addEventListener("load", () => {
			if (page.requestIdleCallback) page.requestIdleCallback(load, { timeout: 4e3 });
			else page.setTimeout(load, 1500);
		}, { once: true });
		return true;
	} catch {
		return false;
	}
}
export { analyticsAllowed, startAnalytics };
