// web/modes/starcraft/building_models.mjs
var A = (slot) => ({
	look: "accent",
	slot
});
var G = (slot) => ({
	look: "glow",
	slot
});
var D = { look: "roof" };
var fit = (minArea, maxAspect, weight) => ({
	minArea,
	maxArea: Infinity,
	maxAspect,
	tall: false,
	weight
});
var rect = (x, y, hx, hy) => [
	[x - hx, y - hy],
	[x + hx, y - hy],
	[x + hx, y + hy],
	[x - hx, y + hy]
];
var ngon = (M, x, y, r, n = 8) => Array.from({ length: n }, (_, i) => [x + Math.cos(i * Math.PI * 2 / n) * r / M.aspect, y + Math.sin(i * Math.PI * 2 / n) * r]);
function box(M, x, y, hx, hy, z, h, slot = 0) {
	M.box(x, y, hx, hy, z, z + h, A(slot));
}
function bevel(M, x, y, hx, hy, z, h, slot = 0) {
	M.loft(rect(x, y, hx, hy), z, rect(x, y, hx * .77, hy * .77), z + h, {
		...A(slot),
		top: true
	});
}
function drum(M, x, y, r, z, h, slot = 0, r1 = r, n = 8) {
	M.frustum(x, y, r, r1, z, z + h, {
		n,
		...A(slot)
	});
}
function dome(M, x, y, r, z, h, slot = 0, light = false) {
	M.dome(x, y, r, z, h, {
		n: 8,
		rings: 3,
		...light ? G(slot) : A(slot)
	});
}
function sphere(M, x, y, r, z, h, slot = 0, light = true) {
	M.frustum(x, y, r * .32, r, z, z + h * .4, {
		n: 8,
		...light ? G(slot) : A(slot)
	});
	dome(M, x, y, r, z + h * .4, h * .6, slot, light);
}
function crystal(M, x, y, r, z, h, slot = 0) {
	M.frustum(x, y, r * .02, r, z, z + h * .43, {
		n: 6,
		...G(slot)
	});
	M.frustum(x, y, r, 0, z + h * .43, z + h, {
		n: 6,
		...G(slot)
	});
}
function bone(M, a, b, c, r = .09, slot = 1) {
	const p = ngon(M, a[0], a[1], r, 6), q = ngon(M, b[0], b[1], r * .55, 6), tip = q.map(() => [c[0], c[1]]);
	M.loft(p, a[2], q, b[2], {
		...A(slot),
		top: false
	});
	M.loft(q, b[2], tip, c[2], {
		...A(slot),
		top: false
	});
}
function strut(M, a, b, w = .055, slot = 1) {
	const lo = a[2] <= b[2] ? a : b, hi = a[2] <= b[2] ? b : a;
	M.loft(rect(lo[0], lo[1], w, w), lo[2], rect(hi[0], hi[1], w * .8, w * .8), Math.max(lo[2] + .02, hi[2]), {
		...A(slot),
		top: true
	});
}
function ring(M, x, y, r, z, width = .09, slot = 1, n = 8) {
	const a = ngon(M, x, y, r, n), b = ngon(M, x, y, r - width, n);
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n, p = [
			b[i],
			a[i],
			a[j],
			b[j]
		];
		M.loft(p, z, p, z + .045, {
			...A(slot),
			top: true
		});
	}
}
function slit(M, x, y, hx, hy, z, h = .08, slot = 1) {
	M.box(x, y, hx, hy, z, z + h, G(slot));
}
function grille(M, x, y, z, count = 4) {
	for (let i = 0; i < count; i++) M.box(x + (i - (count - 1) / 2) * .085, y, .018, .13, z, z + .035, D);
}
function legs(M) {
	for (const x of [-.57, .57]) for (const y of [-.57, .57]) {
		bevel(M, x, y, .16, .14, 0, .12, 1);
		strut(M, [
			x,
			y,
			.12
		], [
			x * .77,
			y * .77,
			.43
		], .075, 0);
	}
}
function tendrils(M, count = 6) {
	for (let i = 0; i < count; i++) {
		const a = i * Math.PI * 2 / count, x = Math.cos(a), y = Math.sin(a);
		M.loft(ngon(M, x * .48, y * .48, .13, 6), .04, ngon(M, x * .7, y * .7, .055, 6), .14, {
			...A(2),
			top: true
		});
	}
}
function maw(M, x, y, z, w = .23) {
	M.box(x, y, w, .035, z, z + .2, D);
	for (const s of [-1, 1]) bone(M, [
		x + s * w,
		y,
		.09 + z
	], [
		x + s * w * .85,
		y - .035,
		z + .27
	], [
		x + s * w * .48,
		y - .02,
		z + .37
	], .065);
}
var BUILDING_MODELS = {
	terran: [
		{
			id: "commandCenter",
			name: "커맨드 센터",
			fit: {
				...fit(220, 2.2, 3),
				big: true
			},
			build(M) {
				legs(M);
				drum(M, 0, 0, .85, .32, .25, 0, .66);
				drum(M, 0, 0, .66, .57, .44, 1);
				drum(M, 0, 0, .73, 1.01, .16, 0, .5);
				bevel(M, -.1, .07, .25, .25, 1.17, .25, 2);
				box(M, -.1, .07, .22, .22, 1.42, .16, 1);
				slit(M, -.1, -.155, .18, .018, 1.45, .07);
				box(M, -.1, .07, .11, .11, 1.58, .035, 0);
				drum(M, .31, .28, .13, 1.04, .3, 2);
				ring(M, .31, .28, .15, 1.34, .045, 1, 6);
				for (const x of [
					-.44,
					0,
					.44
				]) {
					bevel(M, x, -.56, .13, .14, .42, .28, 0);
					slit(M, x, -.71, .08, .02, .48, .06, 0);
				}
				grille(M, -.12, .15, 1.625, 3);
			}
		},
		{
			id: "barracks",
			name: "배럭",
			fit: {
				...fit(90, 3.8, 3),
				big: true
			},
			build(M) {
				legs(M);
				box(M, 0, 0, .72, .59, .33, .26, 2);
				for (const s of [-1, 1]) {
					box(M, s * .43, .07, .22, .51, .59, .49, 0);
					bevel(M, s * .43, .07, .24, .54, 1.08, .2, 1);
					box(M, s * .43, .39, .17, .17, 1.28, .21, 2);
					M.box(s * .43, .39, .11, .11, 1.49, 1.51, D);
					slit(M, s * .43, -.45, .17, .02, .79, .07, 0);
				}
				M.box(0, -.59, .23, .03, .4, .82, D);
				box(M, 0, -.65, .3, .1, .32, .08, 1);
				slit(M, 0, -.635, .19, .015, .82, .05);
				grille(M, 0, .25, .6, 4);
			}
		},
		{
			id: "supplyDepot",
			name: "서플라이 디팟",
			fit: {
				...fit(30, 3.8, 5),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .85, .73, 0, .16, 2);
				box(M, -.21, -.15, .48, .38, .16, .39, 0);
				bevel(M, -.21, -.15, .51, .41, .55, .16, 1);
				slit(M, -.23, -.57, .35, .02, .28, .15, 2);
				drum(M, -.18, .28, .34, .2, .48, 1);
				ring(M, -.18, .28, .32, .68, .075, 2, 8);
				drum(M, -.18, .28, .19, .68, .035, 2);
				for (const y of [
					-.4,
					0,
					.4
				]) {
					drum(M, .51, y, .17, .13, .27, 0);
					dome(M, .51, y, .17, .4, .14, 1);
					slit(M, .65, y, .025, .065, .26, .06, 0);
				}
				grille(M, -.22, -.12, .72, 4);
				box(M, -.61, .38, .07, .09, .3, .15, 2);
			}
		},
		{
			id: "factory",
			name: "팩토리",
			fit: {
				...fit(150, 4, 3),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .86, .73, 0, .17, 2);
				box(M, -.13, 0, .65, .58, .17, .58, 0);
				for (const x of [
					-.53,
					-.1,
					.33
				]) {
					M.loft(rect(x, 0, .19, .62), .75, rect(x, .09, .16, .4), 1.18, {
						...A(1),
						top: true
					});
					M.box(x, -.51, .12, .018, .73, 1.03, D);
					box(M, x, -.62, .16, .1, .17, .14, 1);
					slit(M, x, -.73, .1, .018, .24, .06, 0);
				}
				box(M, .68, .1, .16, .38, .17, .64, 2);
				slit(M, .845, .09, .018, .25, .55, .06, 0);
				for (const y of [-.11, .21]) drum(M, .63, y, .08, .81, .33, 1);
				grille(M, -.1, .12, 1.19, 4);
				box(M, -.55, .36, .09, .08, 1.16, .28, 2);
			}
		},
		{
			id: "starport",
			name: "스타포트",
			fit: {
				...fit(160, 3, 2),
				big: true
			},
			build(M) {
				legs(M);
				box(M, 0, 0, .58, .49, .3, .24, 0);
				drum(M, 0, .05, .75, .54, .12, 1);
				ring(M, 0, .05, .73, .66, .11, 2, 8);
				drum(M, 0, .05, .57, .65, .035, 2);
				for (const x of [-.4, .4]) {
					box(M, x, -.58, .1, .27, .3, .09, 1);
					slit(M, x, -.81, .07, .02, .39, .04, 0);
					strut(M, [
						x,
						.46,
						.57
					], [
						x,
						.62,
						1.03
					], .025, 2);
					slit(M, x, .62, .03, .03, 1.03, .05);
				}
				for (const x of [-.16, .16]) slit(M, x, .05, .025, .19, .69, .025);
				slit(M, 0, .05, .16, .025, .69, .025);
			}
		},
		{
			id: "engineeringBay",
			name: "엔지니어링 베이",
			fit: {
				...fit(100, 3.4, 2),
				big: true
			},
			build(M) {
				legs(M);
				bevel(M, 0, 0, .7, .63, .28, .32, 0);
				box(M, -.12, .07, .49, .42, .6, .28, 1);
				for (const x of [-.35, .11]) {
					drum(M, x, .07, .18, .88, .07, 2);
					ring(M, x, .07, .17, .95, .045, 1, 6);
				}
				for (const s of [-1, 1]) {
					drum(M, s * .62, -.1, .14, .36, .35, 2);
					dome(M, s * .62, -.1, .14, .71, .14, 0);
					slit(M, s * .62, -.25, .06, .02, .49, .07, 0);
				}
				M.box(0, -.6, .2, .025, .39, .62, D);
			}
		},
		{
			id: "bunker",
			name: "벙커",
			fit: {
				...fit(30, 2.6, 3),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .86, 0, .15, 2, .73);
				drum(M, 0, 0, .73, .15, .29, 0, .62);
				dome(M, 0, 0, .61, .44, .37, 1);
				for (let i = 0; i < 4; i++) {
					const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
					const px = x * .66, py = y * .66;
					M.box(px, py, .075, .075, .3, .39, D);
					bevel(M, x * .64, y * .64, x ? .22 : .29, x ? .29 : .22, .025, .12, 1);
					slit(M, x * .76, y * .76, .03, .03, .17, .04, 0);
				}
				grille(M, 0, 0, .79, 3);
				box(M, 0, .18, .08, .08, .74, .13, 2);
			}
		},
		{
			id: "missileTurret",
			name: "미사일 터렛",
			fit: {
				...fit(30, 2.6, 2),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .63, .61, 0, .15, 1);
				drum(M, 0, 0, .36, .15, .2, 2);
				box(M, 0, 0, .14, .16, .35, .51, 0);
				drum(M, 0, 0, .29, .86, .1, 1);
				for (const s of [-1, 1]) {
					box(M, s * .26, 0, .18, .36, .96, .26, 0);
					bevel(M, s * .26, 0, .2, .38, 1.22, .1, 1);
					for (const x of [-.07, .07]) for (const z of [1.02, 1.14]) M.box(s * .26 + x, -.37, .04, .02, z, z + .045, D);
					slit(M, s * .26, .34, .12, .02, 1.04, .04, 0);
				}
				strut(M, [
					0,
					.17,
					.89
				], [
					0,
					.4,
					1.42
				], .03, 2);
				box(M, 0, .41, .17, .025, 1.36, .16, 1);
			}
		},
		{
			id: "academy",
			name: "아카데미",
			fit: {
				...fit(70, 3.4, 2),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .77, .71, 0, .15, 2);
				drum(M, -.37, -.18, .27, .15, .43, 0);
				ring(M, -.37, -.18, .28, .58, .075, 1, 8);
				drum(M, -.37, -.18, .18, .57, .035, 2);
				drum(M, .34, .2, .31, .15, .65, 0);
				ring(M, .34, .2, .3, .8, .075, 1, 6);
				drum(M, .34, .2, .2, .79, .035, 2);
				M.loft(rect(.03, -.19, .27, .28), .28, rect(.07, -.05, .23, .17), .69, {
					...A(1),
					top: true
				});
				slit(M, .03, -.48, .2, .02, .4, .13);
				for (const x of [
					-.39,
					-.17,
					.05
				]) {
					drum(M, x, .38, .08, .15, .9, 2, .065, 6);
					dome(M, x, .38, .065, 1.05, .09, 1);
				}
				for (const x of [
					-.48,
					-.21,
					.06,
					.33
				]) bevel(M, x, -.56, .08, .16, .02, .21, 1);
				box(M, -.1, -.39, .29, .055, .19, .08, 0);
				box(M, .3, .18, .11, .12, .84, .05, 1);
			}
		},
		{
			id: "refinery",
			name: "리파이너리",
			fit: {
				...fit(30, 2.8, 2),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .77, .72, 0, .14, 0);
				drum(M, 0, 0, .35, .14, .65, 2);
				drum(M, 0, 0, .25, .79, .39, 2);
				ring(M, 0, 0, .28, 1.18, .065, 1, 8);
				for (const x of [-.48, .48]) for (const y of [-.4, .4]) {
					drum(M, x, y, .18, .1, .45, 1);
					dome(M, x, y, .18, .55, .19, 1);
					strut(M, [
						x,
						y,
						.65
					], [
						x * .4,
						y * .4,
						.91
					], .055, 1);
					slit(M, x, y - .18, .07, .02, .24, .06, 0);
				}
				box(M, 0, -.58, .23, .14, .12, .3, 0);
				grille(M, 0, -.58, .43, 3);
			}
		},
		{
			id: "armory",
			name: "무기고",
			fit: {
				...fit(70, 3.2, 2),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .76, .69, 0, .14, 2);
				drum(M, 0, 0, .4, .14, .25, 0);
				ring(M, 0, 0, .36, .39, .08, 1, 6);
				for (const s of [-1, 1]) {
					box(M, s * .48, 0, .24, .1, .17, .14, 1);
					bevel(M, s * .69, 0, .1, .2, .04, .21, 0);
					drum(M, s * .52, .37, .07, .13, .83, 2, .05, 6);
					slit(M, s * .52, .37, .025, .025, .97, .06, 0);
				}
				drum(M, 0, .43, .1, .12, .91, 0, .07, 6);
				box(M, 0, -.47, .23, .19, .13, .29, 0);
				grille(M, 0, -.47, .43, 4);
				slit(M, 0, -.67, .15, .02, .24, .06);
				for (const x of [-.24, .24]) box(M, x, -.29, .07, .1, .08, .14, 2);
			}
		},
		{
			id: "comsatStation",
			name: "컴샛 스테이션",
			fit: {
				...fit(30, 3, 2),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .71, .64, 0, .13, 2);
				box(M, 0, .1, .47, .38, .13, .24, 0);
				drum(M, 0, .12, .17, .37, .25, 1, .12, 6);
				drum(M, 0, .12, .2, .62, .16, 2, .54);
				ring(M, 0, .12, .54, .78, .09, 1, 8);
				drum(M, 0, .12, .44, .77, .035, 2);
				strut(M, [
					0,
					.12,
					.8
				], [
					0,
					.12,
					1.1
				], .025, 1);
				slit(M, 0, .12, .04, .04, 1.1, .06);
				box(M, -.48, -.27, .18, .21, .13, .31, 0);
				grille(M, -.48, -.27, .45, 3);
				for (const x of [
					-.26,
					.08,
					.4
				]) slit(M, x, -.3, .07, .02, .23, .06, 0);
			}
		},
		{
			id: "machineShop",
			name: "머신샵",
			fit: {
				...fit(30, 3.8, 3),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .81, .66, 0, .13, 2);
				drum(M, .16, -.12, .49, .13, .2, 0);
				ring(M, .16, -.12, .46, .33, .085, 1, 8);
				drum(M, .16, -.12, .31, .32, .03, 2);
				box(M, -.43, .19, .23, .34, .13, .27, 0);
				for (const x of [-.54, -.32]) {
					drum(M, x, .37, .075, .4, .39, 1, .06, 6);
					drum(M, x, .37, .09, .79, .055, 2, .09, 6);
				}
				for (const x of [
					-.35,
					0,
					.35
				]) bevel(M, x, -.5, .12, .12, .13, .1, 1);
				grille(M, -.43, .1, .41, 3);
				slit(M, .12, -.58, .18, .02, .22, .06, 0);
				box(M, .52, .27, .16, .16, .13, .21, 2);
			}
		},
		{
			id: "controlTower",
			name: "컨트롤 타워",
			fit: {
				...fit(30, 3, 2),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .7, .65, 0, .14, 2);
				drum(M, -.15, -.06, .39, .14, .48, 0);
				drum(M, -.15, -.06, .43, .62, .12, 1);
				for (const x of [
					-.4,
					-.15,
					.1
				]) slit(M, x, -.42, .065, .02, .48, .08);
				for (const y of [-.18, .15]) {
					strut(M, [
						.44,
						y,
						.14
					], [
						.44,
						y,
						1.22
					], .035, 2);
					slit(M, .44, y, .035, .035, 1.22, .07, 0);
				}
				for (const z of [
					.38,
					.64,
					.9,
					1.15
				]) box(M, .44, -.015, .065, .2, z, .04, 1);
				box(M, -.16, -.06, .19, .15, .74, .16, 2);
				grille(M, -.16, -.06, .91, 3);
				box(M, .39, -.43, .19, .12, .13, .14, 0);
				slit(M, .39, -.56, .11, .015, .2, .04, 0);
			}
		},
		{
			id: "scienceFacility",
			name: "사이언스 퍼실리티",
			fit: {
				...fit(130, 2.8, 2),
				big: true
			},
			build(M) {
				legs(M);
				drum(M, 0, 0, .58, .3, .36, 0, .49);
				drum(M, 0, 0, .45, .66, .27, 1);
				drum(M, 0, 0, .5, .93, .11, 1, .47);
				dome(M, 0, 0, .43, 1.04, .16, 1);
				M.box(0, 0, .025, .31, 1.19, 1.23, D);
				for (const x of [-.46, .46]) for (const y of [-.39, .39]) {
					drum(M, x, y, .14, .35, .33, 0);
					dome(M, x, y, .14, .68, .12, 1);
					slit(M, x, y - .14, .045, .02, .43, .1, 2);
				}
				box(M, 0, -.57, .22, .12, .29, .18, 2);
				grille(M, 0, -.57, .48, 3);
			}
		},
		{
			id: "nuclearSilo",
			name: "뉴클리어 사일로",
			fit: {
				...fit(50, 3, 1),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .77, .71, 0, .13, 2);
				drum(M, .17, .08, .47, .13, .4, 0);
				ring(M, .17, .08, .45, .53, .085, 2, 8);
				dome(M, .17, .08, .36, .54, .13, 1);
				M.box(.17, .08, .02, .31, .665, .7, D);
				for (const y of [-.37, .28]) {
					drum(M, -.44, y, .19, .13, .28, 0);
					dome(M, -.44, y, .19, .41, .12, 1);
				}
				drum(M, -.49, .3, .055, .54, .52, 2, .035, 6);
				slit(M, -.49, .3, .035, .035, 1.06, .06, 0);
				grille(M, 0, -.47, .27, 4);
				for (const x of [
					-.15,
					.15,
					.45
				]) slit(M, x, -.39, .05, .025, .22, .055, 0);
			}
		},
		{
			id: "physicsLab",
			name: "피직스 랩",
			fit: {
				...fit(45, 3.8, 1),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .78, .69, 0, .14, 2);
				box(M, -.12, 0, .48, .43, .14, .23, 0);
				M.loft(ngon(M, -.18, -.14, .38, 8), .37, ngon(M, -.18, .03, .33, 8), .85, {
					...A(1),
					top: true
				});
				ring(M, -.18, .03, .32, .85, .07, 2, 8);
				drum(M, -.18, .03, .21, .85, .035, 1);
				for (const x of [.27, .53]) {
					box(M, x, .12, .095, .44, .23, .21, 0);
					bevel(M, x, .12, .11, .46, .44, .16, 1);
					slit(M, x, -.34, .06, .02, .33, .05, 0);
				}
				box(M, -.18, -.52, .2, .13, .13, .13, 2);
				grille(M, -.18, -.52, .27, 3);
				slit(M, -.56, .1, .02, .09, .31, .08);
			}
		},
		{
			id: "covertOps",
			name: "코버트 옵스",
			fit: {
				...fit(45, 3.8, 1),
				small: true
			},
			build(M) {
				bevel(M, 0, 0, .79, .69, 0, .12, 2);
				box(M, 0, .05, .61, .43, .12, .25, 0);
				for (const x of [-.24, .24]) {
					M.loft(rect(x, .03, .19, .5), .37, rect(x, .16, .14, .31), .71, {
						...A(1),
						top: true
					});
					M.box(x, -.39, .11, .025, .25, .51, D);
					grille(M, x, .13, .72, 3);
				}
				drum(M, -.54, .37, .12, .24, .43, 2, .09, 6);
				drum(M, -.54, .37, .1, .67, .12, 1, .24, 6);
				ring(M, -.54, .37, .24, .79, .06, 2, 6);
				for (const x of [
					-.44,
					0,
					.44
				]) slit(M, x, -.48, .065, .02, .21, .05, 0);
				box(M, .57, .4, .11, .12, .13, .16, 0);
			}
		}
	],
	zerg: [
		{
			id: "hatchery",
			name: "해처리",
			fit: {
				...fit(180, 2.8, 4),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .76, .03, .62, 0);
				dome(M, 0, .29, .34, .5, .51, 2);
				maw(M, 0, -.63, .18, .27);
				for (const s of [-1, 1]) for (const x of [-.45, .45]) bone(M, [
					x,
					s * .44,
					.2
				], [
					x * .8,
					s * .38,
					.65
				], [
					x * .57,
					s * .23,
					.97
				], .11);
				dome(M, 0, .29, .19, 1.01, .15, 0);
				slit(M, 0, -.67, .14, .018, .24, .1, 1);
			}
		},
		{
			id: "lair",
			name: "레어",
			fit: {
				...fit(220, 2.6, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .76, .04, .64, 0);
				drum(M, 0, .2, .29, .52, .42, 2, .24);
				dome(M, 0, .2, .3, .94, .25, 0);
				maw(M, 0, -.64, .19, .28);
				for (const s of [-1, 1]) for (const x of [-.43, .43]) bone(M, [
					x,
					s * .47,
					.25
				], [
					x * 1.28,
					s * .57,
					1.11
				], [
					x * 1.1,
					s * .47,
					1.68
				], .13);
				for (const s of [-1, 1]) dome(M, s * .47, -.32, .18, .27, .2, 2);
			}
		},
		{
			id: "spawningPool",
			name: "스포닝 풀",
			fit: {
				...fit(50, 3.8, 3),
				big: true
			},
			build(M) {
				tendrils(M, 5);
				drum(M, -.13, -.02, .67, .02, .12, 2);
				drum(M, .46, .22, .3, .02, .14, 0);
				M.frustum(-.13, -.02, .56, .56, .14, .17, {
					n: 8,
					...G(0)
				});
				M.frustum(.46, .22, .22, .22, .16, .18, {
					n: 8,
					...G(2)
				});
				ring(M, -.13, -.02, .65, .16, .09, 2, 8);
				for (const s of [-1, 1]) bone(M, [
					s * .52,
					-.3,
					.14
				], [
					s * .64,
					-.24,
					.31
				], [
					s * .65,
					-.1,
					.43
				], .06);
				for (const x of [
					-.29,
					.08,
					.34
				]) dome(M, x, -.12, .065, .18, .065, 0, true);
			}
		},
		{
			id: "evolutionChamber",
			name: "에볼루션 챔버",
			fit: {
				...fit(40, 4, 3),
				big: true
			},
			build(M) {
				tendrils(M, 5);
				dome(M, -.16, .02, .48, .04, .61, 2);
				dome(M, .43, -.27, .27, .04, .44, 0);
				for (const s of [-1, 1]) {
					bone(M, [
						-.23,
						s * .25,
						.36
					], [
						-.39,
						s * .4,
						.91
					], [
						-.28,
						s * .47,
						1.26
					], .13, 2);
					bone(M, [
						.06,
						s * .22,
						.36
					], [
						.18,
						s * .32,
						.77
					], [
						.3,
						s * .36,
						1.06
					], .1, 2);
				}
				for (const x of [
					.26,
					.43,
					.6
				]) dome(M, x, -.3, .09, .37, .12, 0);
				maw(M, -.13, -.38, .13, .17);
			}
		},
		{
			id: "hydraliskDen",
			name: "히드라리스크 덴",
			fit: {
				...fit(60, 4, 3),
				big: true
			},
			build(M) {
				tendrils(M, 5);
				for (const s of [-1, 1]) {
					dome(M, s * .31, .06, .39, .08, .69, 0);
					for (let i = 0; i < 3; i++) bone(M, [
						s * .52,
						-.31 + i * .28,
						.35
					], [
						s * .58,
						-.24 + i * .28,
						.85
					], [
						s * .42,
						-.18 + i * .28,
						1.22 - i * .08
					], .085);
				}
				maw(M, 0, -.38, .17, .22);
				dome(M, 0, .4, .27, .24, .45, 2);
				dome(M, .26, -.5, .18, .05, .21, 0);
				slit(M, 0, -.42, .1, .018, .25, .07, 1);
			}
		},
		{
			id: "creepColony",
			name: "크립 콜로니",
			fit: {
				...fit(30, 3, 5),
				small: true
			},
			build(M) {
				tendrils(M, 6);
				dome(M, 0, 0, .52, .03, .47, 2);
				dome(M, 0, 0, .31, .46, .46, 0);
				for (let i = 0; i < 4; i++) {
					const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
					bone(M, [
						x * .4,
						y * .4,
						.2
					], [
						x * .59,
						y * .59,
						.49
					], [
						x * .66,
						y * .66,
						.64
					], .065);
				}
				for (const s of [-1, 1]) dome(M, s * .16, -.23, .095, .53, .14, 0);
			}
		},
		{
			id: "sunkenColony",
			name: "성큰 콜로니",
			fit: {
				...fit(30, 3, 3),
				small: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .55, .03, .4, 2);
				drum(M, 0, 0, .2, .4, .41, 0, .14, 6);
				bone(M, [
					0,
					0,
					.81
				], [
					.12,
					-.02,
					1.08
				], [
					.06,
					-.16,
					1.32
				], .14, 2);
				for (const s of [-1, 1]) for (const y of [-.32, .32]) bone(M, [
					s * .37,
					y,
					.14
				], [
					s * .56,
					y,
					.35
				], [
					s * .66,
					y - .06,
					.58
				], .09);
				for (const s of [-1, 1]) dome(M, s * .25, -.36, .09, .27, .12, 0);
			}
		},
		{
			id: "sporeColony",
			name: "스포어 콜로니",
			fit: {
				...fit(30, 3, 3),
				small: true
			},
			build(M) {
				tendrils(M);
				drum(M, 0, 0, .39, .05, .48, 2, .23);
				drum(M, 0, 0, .23, .53, .45, 0, .34);
				ring(M, 0, 0, .36, .98, .11, 2, 8);
				M.frustum(0, 0, .23, .23, .97, 1, {
					n: 8,
					...G(0)
				});
				for (const s of [-1, 1]) bone(M, [
					s * .3,
					0,
					.62
				], [
					s * .46,
					.02,
					.93
				], [
					s * .4,
					-.04,
					1.22
				], .08);
				dome(M, 0, .27, .16, .75, .24, 0);
			}
		},
		{
			id: "extractor",
			name: "익스트랙터",
			fit: {
				...fit(30, 2.8, 2),
				small: true
			},
			build(M) {
				tendrils(M, 5);
				dome(M, 0, .04, .56, .04, .54, 2);
				for (const s of [-1, 1]) {
					drum(M, s * .48, .07, .24, .05, .52, 2, .19);
					dome(M, s * .48, .07, .2, .57, .29, 0, true);
					bone(M, [
						s * .63,
						.08,
						.36
					], [
						s * .63,
						.13,
						1.1
					], [
						s * .42,
						.12,
						1.5
					], .13);
					bone(M, [
						s * .3,
						.34,
						.38
					], [
						s * .35,
						.4,
						1.07
					], [
						s * .16,
						.32,
						1.57
					], .1);
				}
				dome(M, 0, -.35, .24, .19, .51, 0);
				for (let i = 0; i < 4; i++) box(M, 0, -.57, .14, .025, .24 + i * .09, .035, 1);
			}
		},
		{
			id: "spire",
			name: "스파이어",
			fit: {
				...fit(40, 2.8, 2),
				big: true
			},
			build(M) {
				tendrils(M, 5);
				for (let i = 0; i < 6; i++) {
					const a = i * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
					strut(M, [
						x * .49,
						y * .49,
						.12
					], [
						x * .19,
						y * .19,
						1.24
					], .04, 2);
					box(M, x * .19, y * .19, .035, .035, 1.24, .12, 0);
				}
				drum(M, 0, 0, .24, 1.2, .18, 2, .54);
				dome(M, 0, 0, .54, 1.38, .32, 0);
				ring(M, 0, 0, .49, 1.39, .075, 2, 6);
				dome(M, 0, 0, .15, 1.69, .1, 2);
			}
		},
		{
			id: "hive",
			name: "하이브",
			fit: {
				...fit(230, 2.6, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .77, .04, .65, 0);
				drum(M, 0, .17, .33, .57, .42, 2, .27);
				dome(M, 0, .17, .32, .99, .29, 0);
				for (let i = 0; i < 6; i++) {
					const a = i * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
					bone(M, [
						x * .51,
						y * .51,
						.24
					], [
						x * .64,
						y * .64,
						1.28
					], [
						x * .54,
						y * .54,
						1.94
					], .12);
				}
				maw(M, 0, -.64, .2, .29);
				dome(M, 0, -.19, .25, .54, .21, 2);
				slit(M, 0, -.68, .11, .02, .29, .09, 1);
			}
		},
		{
			id: "queensNest",
			name: "퀸즈 네스트",
			fit: {
				...fit(90, 3, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, 0, .53, .1, .77, 0);
				dome(M, 0, .02, .32, .79, .29, 2);
				ring(M, 0, .02, .21, 1.04, .07, 2, 6);
				for (let i = 0; i < 6; i++) {
					const a = i * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
					bone(M, [
						x * .36,
						y * .36,
						.24
					], [
						x * .54,
						y * .54,
						.58
					], [
						x * .55,
						y * .55,
						.88
					], .07, 2);
				}
				maw(M, 0, -.45, .2, .19);
				for (const s of [-1, 1]) slit(M, s * .19, -.41, .035, .02, .56, .09, 1);
			}
		},
		{
			id: "ultraliskCavern",
			name: "울트라리스크 캐번",
			fit: {
				...fit(140, 3.5, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				dome(M, 0, .2, .64, .05, .83, 2);
				dome(M, 0, .35, .4, .73, .31, 0);
				for (const s of [-1, 1]) {
					dome(M, s * .42, -.15, .27, .08, .56, 0);
					bone(M, [
						s * .38,
						-.44,
						.13
					], [
						s * .4,
						-.49,
						.64
					], [
						s * .22,
						-.49,
						.86
					], .12);
				}
				M.box(0, -.48, .27, .035, .13, .66, D);
				for (let i = 0; i < 4; i++) {
					const y = -.02 + i * .14;
					strut(M, [
						-.48,
						y,
						.28
					], [
						-.17,
						y,
						.83
					], .035, 1);
					strut(M, [
						.48,
						y,
						.28
					], [
						.17,
						y,
						.83
					], .035, 1);
				}
				dome(M, 0, .35, .12, 1.02, .1, 0);
			}
		},
		{
			id: "defilerMound",
			name: "디파일러 마운드",
			fit: {
				...fit(65, 4, 2),
				big: true
			},
			build(M) {
				tendrils(M, 4);
				for (const x of [
					-.42,
					0,
					.42
				]) dome(M, x, 0, .28, .03, .39, 2);
				for (let i = 0; i < 5; i++) bone(M, [
					-.45 + i * .21,
					.04,
					.33
				], [
					-.43 + i * .21,
					.1,
					.66
				], [
					-.49 + i * .21,
					.08,
					.87
				], .07, 2);
				for (const s of [-1, 1]) {
					ring(M, s * .39, s * .38, .2, .17, .065, 0, 6);
					maw(M, s * .57, -.16, .12, .12);
				}
			}
		},
		{
			id: "nydusCanal",
			name: "나이더스 커널",
			fit: {
				...fit(30, 2.8, 2),
				small: true
			},
			build(M) {
				tendrils(M);
				drum(M, 0, 0, .37, .05, .38, 2, .25);
				drum(M, 0, 0, .25, .43, .36, 0, .34);
				ring(M, 0, 0, .36, .79, .11, 0, 8);
				M.frustum(0, 0, .22, .22, .78, .8, {
					n: 8,
					look: "roof"
				});
				for (const s of [-1, 1]) bone(M, [
					s * .28,
					0,
					.63
				], [
					s * .4,
					.02,
					1.04
				], [
					s * .28,
					.12,
					1.19
				], .08);
				dome(M, 0, .31, .18, .47, .28, 0);
				slit(M, 0, -.31, .07, .02, .46, .09, 1);
			}
		},
		{
			id: "greaterSpire",
			name: "그레이터 스파이어",
			fit: {
				...fit(110, 2.8, 2),
				big: true
			},
			build(M) {
				tendrils(M);
				for (let i = 0; i < 4; i++) {
					const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
					strut(M, [
						x * .48,
						y * .48,
						.12
					], [
						x * .17,
						y * .17,
						.91
					], .07, 2);
					dome(M, x * .31, y * .31, .19, .87, .52, 0);
					bone(M, [
						x * .39,
						y * .39,
						1.12
					], [
						x * .43,
						y * .43,
						1.55
					], [
						x * .27,
						y * .27,
						1.76
					], .07, 2);
				}
				drum(M, 0, 0, .23, .84, .59, 2, .34);
				ring(M, 0, 0, .35, 1.43, .08, 0, 8);
				dome(M, 0, 0, .18, 1.45, .18, 2);
			}
		}
	],
	protoss: [
		{
			id: "nexus",
			name: "넥서스",
			fit: {
				...fit(200, 2.2, 4),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .82, .82, 0, .14, 2);
				M.loft(rect(0, 0, .7, .7), .14, rect(0, 0, .18, .18), .95, {
					...A(0),
					top: true
				});
				for (const x of [-.63, .63]) for (const y of [-.63, .63]) {
					bevel(M, x, y, .13, .13, .08, .15, 1);
					bone(M, [
						x,
						y,
						.23
					], [
						x * .93,
						y * .93,
						.83
					], [
						x * .91,
						y * .91,
						1.19
					], .065, 1);
				}
				for (let i = 0; i < 5; i++) {
					const t = (i - 2) * .135;
					strut(M, [
						t,
						-.67,
						.18
					], [
						t * .3,
						-.23,
						.87
					], .018, 1);
					strut(M, [
						.67,
						t,
						.18
					], [
						.23,
						t * .3,
						.87
					], .018, 1);
				}
				sphere(M, 0, 0, .13, .95, .25, 0);
				for (const s of [-1, 1]) bevel(M, 0, s * .74, .21, .16, .05, .15, 1);
			}
		},
		{
			id: "gateway",
			name: "게이트웨이",
			fit: {
				...fit(70, 3.8, 3),
				big: true
			},
			build(M) {
				for (const s of [-1, 1]) {
					bevel(M, s * .4, 0, .26, .67, 0, .17, 2);
					M.loft(rect(s * .43, 0, .19, .35), .17, rect(s * .2, .06, .14, .23), 1.16, {
						...A(0),
						top: true
					});
					M.loft(rect(s * .2, .06, .14, .23), 1.16, rect(s * .06, .1, .055, .11), 1.55, {
						...A(1),
						top: true
					});
					bevel(M, s * .58, .5, .21, .27, .1, .14, 1);
					strut(M, [
						s * .52,
						-.4,
						.2
					], [
						s * .21,
						-.19,
						1.12
					], .035, 2);
					slit(M, s * .49, -.36, .035, .035, .28, .12, 0);
				}
				M.box(0, .08, .035, .06, .21, 1.23, D);
				crystal(M, 0, -.15, .12, .88, .52, 0);
				for (const s of [-1, 1]) {
					box(M, s * .09, -.28, .035, .17, .12, .11, 1);
					slit(M, s * .09, -.28, .02, .12, .235, .035, 1);
				}
				bevel(M, 0, .65, .27, .19, .03, .18, 0);
				strut(M, [
					0,
					.65,
					.2
				], [
					0,
					.25,
					.44
				], .04, 1);
			}
		},
		{
			id: "pylon",
			name: "파일런",
			fit: {
				...fit(30, 2.8, 5),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .43, 0, .11, 2, .35, 6);
				crystal(M, 0, 0, .38, .35, 1.62, 0);
				for (let i = 0; i < 3; i++) {
					const a = i * Math.PI * 2 / 3, x = Math.cos(a), y = Math.sin(a);
					bevel(M, x * .4, y * .4, .11, .11, .02, .13, 1);
					bone(M, [
						x * .43,
						y * .43,
						.12
					], [
						x * .46,
						y * .46,
						.72
					], [
						x * .29,
						y * .29,
						1.01
					], .085, 0);
					slit(M, x * .41, y * .41, .035, .035, .29, .09, 1);
					strut(M, [
						x * .27,
						y * .27,
						.13
					], [
						x * .36,
						y * .36,
						.3
					], .035, 2);
				}
				ring(M, 0, 0, .32, .16, .065, 1, 6);
			}
		},
		{
			id: "forge",
			name: "포지",
			fit: {
				...fit(50, 3.8, 3),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .79, .68, 0, .15, 2);
				drum(M, .25, .26, .33, .15, .34, 0, .29);
				dome(M, .25, .26, .3, .49, .38, 1);
				sphere(M, .25, .26, .1, .85, .12, 0);
				dome(M, .34, -.42, .24, .12, .3, 1);
				sphere(M, .34, -.42, .1, .41, .1, 0);
				bevel(M, -.4, -.14, .3, .29, .1, .36, 0);
				drum(M, -.6, -.23, .15, .25, .26, 2, .12, 6);
				for (const x of [-.3, -.08]) {
					drum(M, x, .18, .07, .2, .65, 1, .055, 6);
					bone(M, [
						x,
						.18,
						.85
					], [
						x,
						.18,
						1.02
					], [
						x - .025,
						.18,
						1.16
					], .055, 1);
				}
				for (let i = 0; i < 4; i++) strut(M, [
					-.32 + i * .14,
					-.4,
					.15
				], [
					-.23 + i * .14,
					-.1,
					.57
				], .022, 1);
				box(M, .12, 0, .19, .07, .2, .09, 2);
			}
		},
		{
			id: "cyberneticsCore",
			name: "사이버네틱스 코어",
			fit: {
				...fit(70, 2.6, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .62, .03, .21, 2, .54);
				drum(M, 0, .12, .38, .24, .45, 0, .34);
				ring(M, 0, .12, .4, .69, .08, 1, 8);
				M.frustum(0, .12, .29, .29, .69, .73, {
					n: 8,
					...G(1)
				});
				for (let i = 0; i < 4; i++) {
					const a = Math.PI + (i + 1) * Math.PI / 5, x = Math.cos(a) * .54, y = Math.sin(a) * .54;
					drum(M, x, y, .15, .1, .21, 1, .11, 6);
					sphere(M, x, y, .14, .31, .27, 0);
				}
				for (const x of [
					-.3,
					0,
					.3
				]) bone(M, [
					x,
					.48,
					.22
				], [
					x,
					.53,
					.67
				], [
					x,
					.43,
					.99
				], .075, 1);
			}
		},
		{
			id: "photonCannon",
			name: "포톤 캐논",
			fit: {
				...fit(30, 2.8, 3),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .53, .02, .14, 2, .46);
				ring(M, 0, 0, .47, .16, .08, 1, 8);
				drum(M, 0, 0, .24, .17, .21, 0, .19, 6);
				sphere(M, 0, 0, .13, .38, .2, 0);
				for (const s of [-1, 1]) bone(M, [
					s * .14,
					0,
					.3
				], [
					s * .12,
					0,
					.65
				], [
					s * .075,
					0,
					.82
				], .045, 1);
				for (let i = 0; i < 4; i++) {
					const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
					bevel(M, x * .55, y * .55, .12, .12, .02, .12, 0);
					slit(M, x * .55, y * .55, .065, .065, .145, .035, 1);
				}
			}
		},
		{
			id: "stargate",
			name: "스타게이트",
			fit: {
				...fit(130, 4, 2),
				big: true
			},
			build(M) {
				for (const s of [-1, 1]) {
					const low = [
						[-.8, s * .22],
						[.48, s * .2],
						[.83, s * .52],
						[.48, s * .76],
						[-.54, s * .63]
					];
					const p = s > 0 ? low : [...low].reverse();
					const high = p.map(([x, y]) => [x * .84, y * .9]);
					M.loft(p, .11, high, .39, {
						...A(0),
						top: true
					});
					for (let i = 0; i < 4; i++) slit(M, -.55 + i * .2, s * .38, .065, .075, .395, .035, 1);
					M.loft(rect(.38, s * .53, .25, .15), .39, rect(.22, s * .49, .12, .1), 1.02, {
						...A(1),
						top: true
					});
					for (let i = 0; i < 3; i++) strut(M, [
						.29 + i * .1,
						s * .67,
						.43
					], [
						.16 + i * .05,
						s * .58,
						.83
					], .025, 2);
					bone(M, [
						-.62,
						s * .36,
						.25
					], [
						-.78,
						s * .44,
						.52
					], [
						-.6,
						s * .46,
						.69
					], .06, 1);
				}
				box(M, .54, 0, .12, .24, .08, .18, 2);
				sphere(M, .54, 0, .1, .26, .16, 0);
			}
		},
		{
			id: "assimilator",
			name: "어시밀레이터",
			fit: {
				...fit(30, 2.8, 2),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .63, .02, .19, 2, .55);
				dome(M, 0, .02, .53, .21, .7, 0);
				sphere(M, 0, -.3, .32, .21, .47, 0);
				for (const x of [-.34, .34]) {
					drum(M, x, .36, .12, .05, .75, 1, .1, 6);
					drum(M, x, .36, .13, .8, .13, 2, .11, 6);
				}
				drum(M, .46, -.3, .13, .08, .59, 1, .1, 6);
				drum(M, .46, -.3, .14, .67, .12, 2, .12, 6);
				for (let i = 0; i < 5; i++) {
					const y = -.2 + i * .15;
					strut(M, [
						-.41,
						y,
						.24
					], [
						-.18,
						y,
						.82
					], .028, 1);
					strut(M, [
						.41,
						y,
						.24
					], [
						.18,
						y,
						.82
					], .028, 1);
				}
				slit(M, 0, -.59, .12, .02, .28, .06, 1);
			}
		},
		{
			id: "citadelOfAdun",
			name: "시타델 오브 아둔",
			fit: {
				...fit(100, 3.8, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .49, .03, .18, 2, .37);
				dome(M, 0, 0, .39, .21, .69, 0);
				sphere(M, 0, -.19, .18, .58, .28, 0);
				for (const s of [-1, 1]) {
					box(M, s * .4, .1, .24, .055, .32, .09, 1);
					const p = rect(s * .69, .1, .12, .32);
					M.loft(p, .2, rect(s * .64, .12, .075, .21), 1.08, {
						...A(1),
						top: true
					});
					slit(M, s * .69, -.225, .06, .02, .37, .23, 1);
					for (let i = 0; i < 3; i++) box(M, s * .69, -.16 + i * .14, .125, .022, .51 + i * .1, .03, 2);
					bone(M, [
						s * .2,
						.06,
						.52
					], [
						s * .2,
						.1,
						.96
					], [
						s * .12,
						.08,
						1.15
					], .065, 1);
				}
				bevel(M, 0, -.47, .24, .15, .05, .18, 1);
				slit(M, 0, -.47, .14, .08, .235, .035, 0);
			}
		},
		{
			id: "templarArchives",
			name: "템플러 아카이브",
			fit: {
				...fit(80, 3.5, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .69, .02, .15, 2, .6);
				dome(M, .12, 0, .49, .17, .57, 0);
				sphere(M, .12, 0, .27, .66, .2, 0);
				for (const s of [-1, 1]) bone(M, [
					-.44,
					s * .33,
					.16
				], [
					-.48,
					s * .34,
					.9
				], [
					-.39,
					s * .3,
					1.21
				], .1, 1);
				for (let i = 0; i < 6; i++) {
					const a = Math.PI * .12 + i * Math.PI * .15, x = Math.cos(a), y = Math.sin(a);
					strut(M, [
						x * .61,
						y * .61,
						.13
					], [
						x * .4 + .07,
						y * .38,
						.55
					], .022, 1);
				}
				bevel(M, .62, -.33, .18, .18, .06, .14, 1);
				sphere(M, .62, -.33, .11, .2, .11, 0);
				box(M, -.27, -.2, .13, .17, .17, .22, 2);
				for (const x of [
					-.15,
					.05,
					.25
				]) strut(M, [
					x,
					-.45,
					.14
				], [
					x,
					-.2,
					.54
				], .02, 1);
			}
		},
		{
			id: "roboticsFacility",
			name: "로보틱스 퍼실리티",
			fit: {
				...fit(110, 3.8, 3),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .79, .69, 0, .14, 2);
				M.loft(rect(0, .21, .5, .39), .14, rect(0, .31, .11, .14), 1.28, {
					...A(0),
					top: true
				});
				M.box(0, -.31, .54, .035, .14, .58, D);
				for (let i = 0; i < 7; i++) strut(M, [
					-.48 + i * .16,
					-.35,
					.16
				], [
					-.28 + i * .09,
					-.32,
					.62
				], .018, 1);
				for (const z of [
					.24,
					.37,
					.5
				]) box(M, 0, -.36, .5, .015, z, .025, 1);
				for (const s of [-1, 1]) {
					bevel(M, s * .59, -.14, .15, .34, .08, .23, 1);
					slit(M, s * .59, -.14, .07, .18, .315, .035, 0);
					bone(M, [
						s * .31,
						.33,
						.38
					], [
						s * .24,
						.35,
						1.05
					], [
						s * .09,
						.33,
						1.4
					], .07, 1);
				}
				crystal(M, 0, .13, .12, .84, .43, 0);
			}
		},
		{
			id: "observatory",
			name: "옵저버토리",
			fit: {
				...fit(45, 3, 2),
				small: true
			},
			build(M) {
				const p = [
					[-.66, -.48],
					[.66, -.48],
					[0, .66]
				];
				M.loft(p, .02, p, .13, {
					...A(2),
					top: true
				});
				const posts = [
					[
						-.55,
						-.38,
						.65
					],
					[
						.55,
						-.38,
						.81
					],
					[
						0,
						.54,
						1.08
					]
				];
				for (const [x, y, h] of posts) {
					drum(M, x, y, .12, .13, h - .13, 1, .08, 6);
					sphere(M, x, y, .1, h, .22, 0);
					for (const z of [.24, .39]) drum(M, x, y, .13, z, .04, 2, .13, 6);
				}
				for (let i = 0; i < 3; i++) {
					const a = posts[i], b = posts[(i + 1) % 3];
					strut(M, [
						a[0],
						a[1],
						.25
					], [
						b[0],
						b[1],
						.43
					], .025, 1);
				}
				sphere(M, 0, 0, .16, .14, .2, 1);
				box(M, 0, -.41, .2, .08, .13, .13, 0);
			}
		},
		{
			id: "roboticsSupportBay",
			name: "로보틱스 서포트 베이",
			fit: {
				...fit(100, 3.2, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .69, .03, .13, 2, .62);
				ring(M, 0, 0, .59, .16, .1, 1, 8);
				M.frustum(0, 0, .38, .38, .16, .2, {
					n: 8,
					...G(1)
				});
				for (let i = 0; i < 3; i++) {
					const a = Math.PI / 2 + i * Math.PI * 2 / 3, x = Math.cos(a), y = Math.sin(a);
					M.loft(ngon(M, x * .21, y * .21, .15, 6), .17, ngon(M, x * .51, y * .51, .105, 6), 1.03, {
						...A(1),
						top: true
					});
					sphere(M, x * .51, y * .51, .09, 1.03, .16, 0);
					bone(M, [
						x * .13,
						y * .13,
						.18
					], [
						x * .3,
						y * .3,
						.66
					], [
						x * .39,
						y * .39,
						.99
					], .045, 0);
					slit(M, x * .56, y * .56, .04, .04, .2, .05, 0);
				}
				crystal(M, 0, 0, .11, .21, .24, 0);
			}
		},
		{
			id: "fleetBeacon",
			name: "플릿 비콘",
			fit: {
				...fit(140, 3, 2),
				big: true
			},
			build(M) {
				drum(M, 0, 0, .49, .04, .23, 2, .36);
				sphere(M, 0, 0, .32, .43, .67, 0);
				for (let i = 0; i < 3; i++) {
					const a = -Math.PI / 2 + i * Math.PI * 2 / 3, x = Math.cos(a), y = Math.sin(a);
					M.loft(ngon(M, x * .24, y * .24, .18, 6), .13, ngon(M, x * .58, y * .58, .12, 6), .4, {
						...A(0),
						top: true
					});
					drum(M, x * .6, y * .6, .16, .33, .15, 1, .14, 6);
					sphere(M, x * .6, y * .6, .11, .48, .14, 1);
					bone(M, [
						x * .25,
						y * .25,
						.32
					], [
						x * .34,
						y * .34,
						.62
					], [
						x * .23,
						y * .23,
						.89
					], .06, 1);
				}
				ring(M, 0, 0, .4, .42, .06, 1, 6);
			}
		},
		{
			id: "arbiterTribunal",
			name: "아비터 트리뷰널",
			fit: {
				...fit(110, 3.2, 2),
				big: true
			},
			build(M) {
				bevel(M, 0, 0, .64, .59, .02, .16, 2);
				for (const x of [-.5, .5]) for (const y of [-.45, .45]) {
					bevel(M, x, y, .2, .18, .02, .18, 0);
					slit(M, x, y, .08, .065, .205, .045, 1);
				}
				drum(M, 0, 0, .32, .18, .23, 1, .28);
				sphere(M, 0, 0, .24, .41, .25, 0);
				for (const x of [
					-.4,
					0,
					.4
				]) {
					drum(M, x, .42, .09, .18, .64, 0, .065, 6);
					sphere(M, x, .42, .08, .82, .23, 1);
					strut(M, [
						x,
						.42,
						.25
					], [
						x * .47,
						.12,
						.53
					], .04, 1);
				}
				for (const s of [-1, 1]) bone(M, [
					s * .36,
					-.18,
					.19
				], [
					s * .36,
					-.28,
					.48
				], [
					s * .2,
					-.35,
					.67
				], .055, 1);
			}
		},
		{
			id: "shieldBattery",
			name: "실드 배터리",
			fit: {
				...fit(30, 2.8, 4),
				small: true
			},
			build(M) {
				drum(M, 0, 0, .32, .02, .13, 2, .23);
				sphere(M, 0, 0, .14, .15, .24, 0);
				for (let i = 0; i < 6; i++) {
					const a = i * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
					strut(M, [
						x * .2,
						y * .2,
						.12
					], [
						x * .53,
						y * .53,
						.26
					], .025, 0);
					bone(M, [
						x * .53,
						y * .53,
						.26
					], [
						x * .58,
						y * .58,
						.41
					], [
						x * .48,
						y * .48,
						.52
					], .035, 1);
					slit(M, x * .51, y * .51, .025, .025, .31, .065, 1);
				}
				crystal(M, 0, 0, .075, .39, .2, 0);
			}
		}
	]
};
export { BUILDING_MODELS };
