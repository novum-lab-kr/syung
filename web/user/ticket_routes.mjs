// web/user/ticket_routes.mts
var SLOW_LIMIT = {
	minutes: 10,
	share: .3
};
var FASTEST = "가장 빠른 길";
var rideSig = (plan) => plan.legs.filter((leg) => leg.type !== "walk").map((leg) => `${leg.line || leg.route}|${leg.from}|${leg.to}`).join(">");
var ahead = (left, right) => left.minutes !== right.minutes ? left.minutes < right.minutes : left.tag === FASTEST !== (right.tag === FASTEST) ? left.tag === FASTEST : left.transfers < right.transfers;
function usefulRoutes(plans) {
	const best = /* @__PURE__ */ new Map();
	for (const plan of plans) {
		const sig = rideSig(plan), kept = best.get(sig);
		if (!kept || ahead(plan, kept)) best.set(sig, plan);
	}
	const shapes = plans.filter((plan) => best.get(rideSig(plan)) === plan);
	if (shapes.length < 2) return shapes;
	const quickest = Math.min(...shapes.map((plan) => plan.minutes));
	const slowest = quickest + Math.max(SLOW_LIMIT.minutes, quickest * SLOW_LIMIT.share);
	return shapes.filter((plan) => plan.tag === FASTEST || plan.minutes <= slowest);
}
function quickestRoute(plans) {
	return usefulRoutes(plans).reduce((best, plan) => !best || ahead(plan, best) ? plan : best, null);
}
function nextRideDay(days, time, now) {
	const [hour, minute] = time.split(":").map(Number);
	for (let offset = 0; offset < 8; offset++) {
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute);
		const weekday = (day.getDay() + 6) % 7 + 1;
		if (day > now && (!days.length || days.includes(weekday))) return day;
	}
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute);
}
function routeAt(when) {
	const pad = (value) => String(value).padStart(2, "0");
	return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}
export { SLOW_LIMIT, nextRideDay, quickestRoute, rideSig, routeAt, usefulRoutes };
