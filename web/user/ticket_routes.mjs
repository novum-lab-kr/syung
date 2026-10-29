// web/user/ticket_routes.mts
var FASTEST = "가장 빠른 길";
var rideSig = (plan) => plan.legs.filter((leg) => leg.type !== "walk").map((leg) => `${leg.line || leg.route}|${leg.from}|${leg.to}`).join(">");
var ahead = (left, right) => left.minutes !== right.minutes ? left.minutes < right.minutes : left.tag === FASTEST !== (right.tag === FASTEST) ? left.tag === FASTEST : left.transfers < right.transfers;
function usefulRoutes(plans) {
	const best = /* @__PURE__ */ new Map();
	for (const plan of plans) {
		const sig = rideSig(plan), kept = best.get(sig);
		if (!kept || ahead(plan, kept)) best.set(sig, plan);
	}
	return plans.filter((plan) => best.get(rideSig(plan)) === plan);
}
function quickestRoute(plans) {
	return usefulRoutes(plans).reduce((best, plan) => !best || ahead(plan, best) ? plan : best, null);
}
var ROUTE_KINDS = [
	["all", "전체"],
	["subway", "지하철만"],
	["bus", "버스만"]
];
var fits = (plan, kind) => kind === "all" || plan.kind === kind;
function routeOrder(plans, kind) {
	return plans.flatMap((plan, index) => fits(plan, kind) ? [index] : []);
}
function routeFilterView(plans, kind) {
	const order = routeOrder(plans, kind);
	const name = ROUTE_KINDS.find(([each]) => each === kind)[1];
	return {
		kinds: ROUTE_KINDS.map(([each, label]) => ({
			kind: each,
			name: label,
			count: plans.filter((plan) => fits(plan, each)).length,
			pressed: each === kind
		})),
		order,
		empty: order.length ? "" : `${name} 타는 경로가 없어요`
	};
}
function chosenAfter(plans, order, saved) {
	const sig = saved ? rideSig(saved) : null;
	return (sig === null ? void 0 : order.find((index) => rideSig(plans[index]) === sig)) ?? order[0] ?? -1;
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
function routeUrl(from, to, at, via) {
	return `./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&at=${encodeURIComponent(at)}${via ? `&via=${via.lat},${via.lng}` : ""}`;
}
export { ROUTE_KINDS, chosenAfter, nextRideDay, quickestRoute, rideSig, routeAt, routeFilterView, routeOrder, routeUrl, usefulRoutes };
