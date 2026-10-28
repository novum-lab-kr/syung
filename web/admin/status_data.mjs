// web/admin/status_data.mts
var clock = (iso) => iso ? iso.slice(11, 16) : "–";
function duration(seconds) {
	const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
	if (days) return `${days}일 ${hours}시간`;
	return hours ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}
function level(share) {
	if (share >= .9) return "bad";
	return share >= .7 ? "mid" : "";
}
function callLine(call) {
	const share = call.used == null || !call.limit ? 0 : Math.min(1, call.used / call.limit);
	return {
		label: call.label,
		count: call.used == null ? `? / ${call.limit.toLocaleString("ko-KR")}` : `${call.used.toLocaleString("ko-KR")} / ${call.limit.toLocaleString("ko-KR")}`,
		width: `${(share * 100).toFixed(1)}%`,
		level: level(share),
		sub: call.used == null ? "장부를 읽지 못했어요" : `${Math.round(share * 100)}% 사용 · 기준일 ${call.day || "아직 호출 없음"}`
	};
}
var cacheRow = (item) => [
	item.label,
	item.entries.toLocaleString("ko-KR"),
	item.ageSeconds == null ? "–" : `${item.ageSeconds}초`
];
export { cacheRow, callLine, clock, duration, level };
