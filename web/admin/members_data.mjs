// web/admin/members_data.mts
var PROVIDERS = {
	kakao: "카카오",
	google: "구글",
	apple: "Apple"
};
var ACTIONS = {
	places: "장소 보기",
	logout: "강제 로그아웃",
	delete: "탈퇴 처리",
	avatar: "사진 내리기",
	avatar_view: "사진 보기",
	name: "닉네임 초기화"
};
var CHARACTERS = {
	sprout: "새싹 볼빵 후디",
	builder: "꼬마 건설 반장",
	seonbi: "갓 쓴 꼬마 선비",
	visitor: "두근두근 나들이",
	scv: "테란 SCV",
	drone: "저그 드론",
	probe: "프로토스 프로브"
};
var WITHDRAW_REASONS = {
	self: "본인 탈퇴",
	kakao_unlink: "카카오 연결 해제",
	admin: "관리자 탈퇴 처리"
};
var DAYS = [
	"",
	"월",
	"화",
	"수",
	"목",
	"금",
	"토",
	"일"
];
var provider = (name) => name && PROVIDERS[name] || name || "–";
var actionName = (action) => ACTIONS[action] || action;
var withdrawName = (reason) => WITHDRAW_REASONS[reason] || reason;
function avatarText(avatar) {
	if (avatar?.type === "photo") return "올린 사진";
	if (avatar?.type === "character") return `캐릭터 · ${avatar.id && CHARACTERS[avatar.id] || avatar.id}`;
	return "기본 캐릭터";
}
var when = (seconds, withTime = true) => seconds == null ? "–" : new Intl.DateTimeFormat("ko-KR", {
	timeZone: "Asia/Seoul",
	year: "2-digit",
	month: "2-digit",
	day: "2-digit",
	...withTime ? {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false
	} : {}
}).format(/* @__PURE__ */ new Date(seconds * 1e3));
var dayText = (days) => days.map((day) => DAYS[day]).join(" ") || "–";
function chartBars(daily) {
	const width = 600, most = Math.max(1, ...daily.map((day) => day.count));
	const step = width / daily.length;
	return daily.map((day, index) => {
		const tall = 136 * day.count / most, x = index * step + 2, y = 158 - tall, last = index === daily.length - 1;
		return {
			x: x.toFixed(1),
			y: y.toFixed(1),
			width: (step - 4).toFixed(1),
			height: Math.max(day.count ? 2 : 0, tall).toFixed(1),
			title: `${day.day} ${day.count}명`,
			value: day.count ? {
				x: (x + (step - 4) / 2).toFixed(1),
				y: (y - 5).toFixed(1),
				text: day.count
			} : null,
			label: (daily.length - 1 - index) % 7 === 0 ? {
				x: (last ? x + step - 4 : x + (step - 4) / 2).toFixed(1),
				y: 175,
				anchor: last ? "end" : "middle",
				text: day.day.slice(5).replace("-", ".")
			} : null
		};
	});
}
function kindLines(items, name, empty) {
	return items.length ? items.map((item) => ({
		name: name(item),
		count: item.count
	})) : [{
		name: empty,
		count: 0
	}];
}
function pageInfo(body, page) {
	const last = Math.max(1, Math.ceil(body.total / body.pageSize));
	return {
		text: `${body.total.toLocaleString("ko-KR")}명 · ${page} / ${last}쪽`,
		prev: page > 1,
		next: page < last
	};
}
function facts(member) {
	return [
		["회원번호", member.id],
		["닉네임", member.name],
		["가입", when(member.createdAt)],
		["로그인 방법", member.identities.map((item) => provider(item.provider)).join(" · ") || "–"],
		["최근 로그인", when(member.lastLogin)],
		["로그인 중인 기기", `${member.sessions}대`],
		["승차권", `${member.tickets}장`],
		["프로필", avatarText(member.avatar)]
	];
}
var ticketRow = (ticket) => [
	ticket.name,
	ticket.depart,
	dayText(ticket.days),
	ticket.hasRoute ? "있음" : "없음",
	when(ticket.createdAt, false)
];
var placeRow = (place) => [
	place.name,
	`${place.from.name} (${place.from.lat}, ${place.from.lng})`,
	`${place.to.name} (${place.to.lat}, ${place.to.lng})`
];
var logLine = (item) => [
	`${when(item.at)} · `,
	actionName(item.action),
	item.reason ? ` · ${item.reason}` : ""
];
export { actionName, avatarText, chartBars, dayText, facts, kindLines, logLine, pageInfo, placeRow, provider, ticketRow, when, withdrawName };
