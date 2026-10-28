import { __exportAll } from "../../_virtual/_rolldown/runtime.mjs";
// web/map/avatars/scv.mts
var scv_exports = /* @__PURE__ */ __exportAll({
	build: () => build,
	name: () => name,
	rig: () => rig
});
var name = "테란 SCV";
var rig = {
	hip: .3,
	shoulder: .66
};
function build({ box, quad }) {
	const blue = "#477fc3", steel = "#9baeba", dark = "#435569";
	box(-.24, -.25, .32, .22, .25, .78, blue);
	box(-.2, -.21, .77, .19, .21, .89, steel);
	box(-.22, -.27, .33, .24, .27, .42, steel);
	box(.22, -.205, .48, .242, .205, .77, dark);
	box(.242, -.175, .51, .254, .175, .745, "#65c5df");
	box(.254, -.078, .565, .263, .078, .68, "#eac29b");
	box(.263, -.09, .67, .275, .09, .715, "#d4e0e5");
	box(.264, -.054, .629, .272, .054, .65, "#34485b");
	box(.255, -.18, .49, .28, .18, .53, steel);
	box(.255, -.018, .52, .27, .018, .75, blue);
	box(-.37, -.21, .43, -.24, .21, .75, dark);
	for (const s of [-1, 1]) {
		const y = s * .145;
		box(-.4, y - .065, .47, -.35, y + .065, .69, steel);
		box(-.412, y - .045, .49, -.4, y + .045, .59, "#e6a869");
		box(-.18, y - .05, .86, -.07, y + .05, .99, dark);
		box(-.195, y - .063, .965, -.055, y + .063, 1, steel);
		box(-.176, y - .043, 1, -.074, y + .043, 1.008, "#34485b");
		const part = s > 0 ? "legL" : "legR";
		box(-.14, y - .07, .13, .11, y + .07, .34, dark, part);
		box(-.11, y - .085, .13, .16, y + .085, .25, blue, part);
		box(-.17, y - .1, 0, .26, y + .1, .13, steel, part);
	}
	box(-.13, .25, .54, .13, .38, .74, steel, "armL");
	box(-.06, .28, .37, .15, .41, .57, blue, "armL");
	box(.12, .28, .34, .26, .42, .44, dark, "armL");
	box(.23, .27, .33, .43, .315, .41, steel, "armL");
	box(.23, .385, .33, .43, .43, .41, steel, "armL");
	box(.39, .3, .33, .44, .34, .4, steel, "armL");
	box(.39, .36, .33, .44, .4, .4, steel, "armL");
	box(-.13, -.38, .54, .13, -.25, .74, steel, "armR");
	box(-.06, -.41, .36, .16, -.28, .57, blue, "armR");
	box(.13, -.43, .36, .3, -.27, .49, dark, "armR");
	box(.29, -.4, .38, .41, -.3, .47, steel, "armR");
	box(.4, -.385, .395, .49, -.315, .455, "#cbd8df", "armR");
	box(.49, -.367, .41, .57, -.333, .44, "#8ee7ef", "armR");
}
export { build, name, rig, scv_exports };
