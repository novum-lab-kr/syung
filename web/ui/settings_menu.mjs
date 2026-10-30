import { render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { DrawerHead } from "../components/drawer.mjs";
import { AccountRows, CityModes, DeviceSettings, MenuNav, SourceList, ThemePicker } from "../components/settings.mjs";
var state = {
	pressed: Object.fromEntries([
		"toggleSimcity",
		"toggleJoseon",
		"toggleStarcraft",
		"toggleRetro",
		"toggleNation",
		"toggleCoaster",
		"togglePrebuild",
		"toggleSaver"
	].map((id) => [id, false])),
	hidden: {
		starcraftRace: true,
		nationRow: true,
		coasterSpeed: true
	},
	speedNote: "실시간",
	icons: {
		coaster: "",
		speed: ""
	},
	themeNote: "",
	sky: {
		html: "",
		night: false
	}
};
var handlers = { switches: {} };
var Modes = () => /* @__PURE__ */ a(CityModes, {
	pressed: state.pressed,
	hidden: state.hidden,
	race: state.race,
	nation: state.nation,
	speed: state.speed,
	speedNote: state.speedNote,
	icons: state.icons,
	onSwitch: (id) => handlers.switches[id]?.(),
	onRace: (race) => handlers.race?.(race),
	onNation: (nation) => handlers.nation?.(nation),
	onSpeed: (speed) => handlers.speed?.(speed)
});
var Device = () => /* @__PURE__ */ a(DeviceSettings, {
	prebuild: state.pressed.togglePrebuild,
	saver: state.pressed.toggleSaver,
	onPrebuild: () => handlers.switches.togglePrebuild?.(),
	onSaver: () => handlers.switches.toggleSaver?.()
});
var Theme = () => /* @__PURE__ */ a(ThemePicker, {
	theme: state.theme,
	note: state.themeNote,
	sky: state.sky,
	onPick: (choice) => handlers.theme?.(choice)
});
var roots = [
	[document.querySelector("#menuRoot .theme-pick"), () => /* @__PURE__ */ a(Theme, {})],
	[document.getElementById("menuModes"), () => /* @__PURE__ */ a(Modes, {})],
	[document.getElementById("menuDevice"), () => /* @__PURE__ */ a(Device, {})]
];
function paint(patch) {
	state = {
		...state,
		...patch
	};
	for (const [root, view] of roots) if (root) K(view(), root);
}
var settingsMenu = {
	press(id, on) {
		paint({ pressed: {
			...state.pressed,
			[id]: on
		} });
	},
	hide(id, hidden) {
		paint({ hidden: {
			...state.hidden,
			[id]: hidden
		} });
	},
	race(want) {
		paint({ race: want });
	},
	nation(want) {
		paint({ nation: want });
	},
	speed(speed, note) {
		paint({
			speed,
			speedNote: note
		});
	},
	icons(coaster, speed) {
		paint({ icons: {
			coaster,
			speed
		} });
	},
	theme(choice) {
		paint({ theme: choice });
	},
	themeNote(note) {
		paint({ themeNote: note });
	},
	sky(html, night, label) {
		paint({ sky: {
			html,
			night,
			label
		} });
	},
	on(more) {
		Object.assign(handlers.switches, more.switches);
		if (more.race) handlers.race = more.race;
		if (more.nation) handlers.nation = more.nation;
		if (more.speed) handlers.speed = more.speed;
		if (more.theme) handlers.theme = more.theme;
	}
};
var once = [
	[document.querySelector("#settingsPanel .menu-head"), /* @__PURE__ */ a(DrawerHead, { title: "메뉴" })],
	[document.getElementById("accountItem"), /* @__PURE__ */ a(AccountRows, {})],
	[document.querySelector("#menuRoot .menu-nav"), /* @__PURE__ */ a(MenuNav, {})],
	[document.getElementById("menuSources"), /* @__PURE__ */ a(SourceList, {})]
];
for (const [root, view] of once) if (root) K(view, root);
paint({});
export { settingsMenu };
