import { alertsChanged, dueAlerts } from "../lib/ride-along.mjs";
// web/ui/ride_alerts.mts
function createRideAlerts(deliver, ask = () => {}) {
	let sent = /* @__PURE__ */ new Map(), fired = /* @__PURE__ */ new Set();
	return {
		update(list, nowMs) {
			const next = dueAlerts(list, sent, fired, nowMs);
			if (!alertsChanged(next, sent)) return;
			sent = new Map(next.map((alert) => [alert.id, {
				at: alert.at,
				text: `${alert.title}\n${alert.body}`
			}]));
			deliver(next);
		},
		clear() {
			fired = /* @__PURE__ */ new Set();
			if (!sent.size) return;
			sent = /* @__PURE__ */ new Map();
			deliver([]);
		},
		ask
	};
}
var notificationApi = () => globalThis.Notification ?? null;
function browserAlerts(api) {
	const timers = /* @__PURE__ */ new Map();
	const show = (alert) => {
		if (api.permission !== "granted") return;
		try {
			new api(alert.title, {
				...alert.body ? { body: alert.body } : {},
				tag: alert.id
			});
		} catch {}
	};
	return (list) => {
		const now = Date.now(), keep = new Set(list.map((alert) => alert.id));
		for (const [id, { timer, alert }] of timers) {
			clearTimeout(timer);
			if (!keep.has(id) && alert.at <= now) show(alert);
		}
		timers.clear();
		if (api.permission !== "granted") return;
		for (const alert of list) timers.set(alert.id, {
			alert,
			timer: setTimeout(() => {
				timers.delete(alert.id);
				show(alert);
			}, Math.max(0, alert.at - now))
		});
	};
}
function rideAlertSink(app) {
	if (app) return createRideAlerts(app);
	const api = notificationApi();
	if (!api) return null;
	return createRideAlerts(browserAlerts(api), () => {
		if (api.permission === "default") try {
			Promise.resolve(api.requestPermission()).catch(() => {});
		} catch {}
	});
}
export { browserAlerts, createRideAlerts, rideAlertSink };
