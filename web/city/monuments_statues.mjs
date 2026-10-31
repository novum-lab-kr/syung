import { K } from "./monument_parts.mjs";
import { body, bowl, cup, ellipsoid, loft, rotate, torus, tube } from "./monument_curves.mjs";
// web/city/monuments_statues.mts
function slab(w, center, half, kind, pose) {
	const P = (x, y, z) => {
		const p = rotate([
			x * half[0],
			y * half[1],
			z * half[2]
		], pose);
		return [
			center[0] + p[0],
			center[1] + p[1],
			center[2] + p[2]
		];
	};
	const N = (x, y, z) => rotate([
		x,
		y,
		z
	], pose);
	for (const [axis, sign] of [
		[0, -1],
		[0, 1],
		[1, -1],
		[1, 1],
		[2, -1],
		[2, 1]
	]) {
		const u = (axis + 1) % 3, v = (axis + 2) % 3, at = (a, b) => {
			const c = [
				0,
				0,
				0
			];
			c[axis] = sign;
			c[u] = a;
			c[v] = b;
			return P(c[0], c[1], c[2]);
		};
		const n = [
			0,
			0,
			0
		];
		n[axis] = sign;
		w.quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), kind, N(n[0], n[1], n[2]));
	}
}
var YI = {
	shaftTop: 10.5,
	plinth: .5
};
function buildYiSunsin(w) {
	const z0 = YI.shaftTop;
	w.box(-5.2, 5.2, -5.2, 5.2, 0, .3, K.stone, { bottom: true });
	w.box(-4.2, 4.2, -4.2, 4.2, .3, YI.plinth, K.stone, { bottom: true });
	w.box(-2.6, 2.6, -2.1, 2.1, YI.plinth, 1.4, K.stone, { bottom: true });
	w.frustum(0, 0, 1.95, 1.55, 1.4, 1.6, 1.35, z0 - .3, K.stone, { bottom: true });
	w.box(-1.8, 1.8, -1.5, 1.5, z0 - .3, z0, K.stone, { bottom: true });
	const sy = -3.1, sz = YI.plinth;
	w.box(-1, 1, -5, -1.2000000000000002, sz, sz + .15, K.stone, { bottom: true });
	w.frustum(0, sy, .55, 1.5, sz + .15, .9, 1.75, sz + .55, K.bronze, { bottom: true });
	w.frustum(0, sy, .78, 1.45, sz + .55, .42, .95, sz + .95, K.bronze, { bottom: true });
	ellipsoid(w, [
		0,
		sy,
		sz + .95
	], [
		.2,
		.3,
		.08
	], K.trim, {}, [4, 8]);
	tube(w, [
		[
			0,
			-4.85,
			sz + .5,
			.13,
			.13
		],
		[
			0,
			-5.1,
			sz + .7,
			.13,
			.13
		],
		[
			0,
			-5.28,
			sz + .88,
			.15,
			.17
		]
	], K.bronze, {
		sides: 8,
		cap: 2
	});
	ellipsoid(w, [
		0,
		-1.32,
		sz + .5
	], [
		.28,
		.08,
		.22
	], K.bronze, {}, [4, 8]);
	for (const x of [-2.6, 2.6]) {
		const dy = -3;
		w.box(x - .5, x + .5, -3.18, -2.82, sz, sz + .22, K.stone, { bottom: true });
		tube(w, [
			[
				x - .42,
				dy,
				sz + .72,
				.34,
				.34
			],
			[
				x,
				dy,
				sz + .72,
				.46,
				.46
			],
			[
				x + .42,
				dy,
				sz + .72,
				.34,
				.34
			]
		], K.bronze, {
			sides: 16,
			steps: 8,
			cap: 0
		});
		for (const side of [-1, 1]) tube(w, [[
			x + side * .44,
			dy,
			sz + .72,
			.35,
			.35
		], [
			x + side * .48,
			dy,
			sz + .72,
			.35,
			.35
		]], K.trim, {
			sides: 16,
			steps: 1,
			cap: 0
		});
	}
	w.dz = z0;
	const fold = (v, u) => {
		const tier = v * 4 % 1 * .07 * (1 - v), groove = -.09 * Math.exp(-(((u - .75) / .028) ** 2)) * (1 - v * .6), panel = .035 * Math.sin(u * Math.PI * 2 * 5) * (1 - v) ** 1.2;
		return v < .62 ? tier + groove + panel : 0;
	};
	body(w, [
		[
			0,
			0,
			.3,
			1.04,
			.72
		],
		[
			0,
			0,
			1.1,
			.95,
			.66
		],
		[
			0,
			0,
			2,
			.83,
			.58
		],
		[
			0,
			0,
			2.75,
			.66,
			.5
		],
		[
			0,
			0,
			3.05,
			.6,
			.46
		],
		[
			0,
			0,
			3.5,
			.76,
			.5
		],
		[
			0,
			0,
			4,
			.93,
			.52
		],
		[
			0,
			0,
			4.4,
			.78,
			.44
		],
		[
			0,
			0,
			4.64,
			.3,
			.28
		]
	], K.bronze, {
		cols: 32,
		rows: 36,
		fold
	});
	body(w, [[
		0,
		0,
		2.86,
		.68,
		.54
	], [
		0,
		0,
		3.06,
		.68,
		.54
	]], K.bronze, {
		cols: 28,
		rows: 2
	});
	for (const x of [-.42, .42]) ellipsoid(w, [
		x,
		-.5,
		.12
	], [
		.3,
		.6,
		.17
	], K.bronze, { yaw: x * .3 }, [6, 10]);
	for (const side of [-1, 1]) ellipsoid(w, [
		side * 1,
		0,
		4.28
	], [
		.55,
		.44,
		.27
	], K.bronze, { roll: side * .45 }, [8, 14]);
	ellipsoid(w, [
		0,
		-.04,
		4.55
	], [
		.44,
		.36,
		.13
	], K.bronze, {}, [6, 12]);
	tube(w, [
		[
			-1,
			0,
			4.15,
			.32,
			.32
		],
		[
			-1.4,
			-.05,
			3.7,
			.3,
			.3
		],
		[
			-1.58,
			-.15,
			3.3,
			.3,
			.28
		],
		[
			-1.66,
			-.5,
			3.45,
			.22,
			.2
		],
		[
			-1.66,
			-.68,
			3.62,
			.15,
			.15
		]
	], K.bronze, { sides: 12 });
	ellipsoid(w, [
		-1.66,
		-.7,
		3.62
	], [
		.17,
		.17,
		.19
	], K.bronze, {}, [6, 10]);
	const sx = -1.66, syw = -.7;
	tube(w, [
		[
			sx,
			syw,
			.05,
			.12,
			.07
		],
		[
			sx,
			syw,
			.45,
			.15,
			.085
		],
		[
			sx,
			syw,
			2.6,
			.15,
			.09
		],
		[
			sx,
			syw,
			3.1,
			.13,
			.085
		],
		[
			sx,
			syw,
			3.3,
			.13,
			.085
		]
	], K.bronze, {
		sides: 10,
		steps: 12,
		cap: 1
	});
	tube(w, [
		[
			sx,
			syw,
			3.55,
			.075,
			.075
		],
		[
			sx,
			syw,
			4.2,
			.09,
			.09
		],
		[
			sx,
			syw,
			5,
			.08,
			.08
		]
	], K.bronze, {
		sides: 10,
		steps: 6,
		cap: 2
	});
	ellipsoid(w, [
		sx,
		syw,
		3.3
	], [
		.36,
		.13,
		.07
	], K.bronze, {}, [6, 12]);
	ellipsoid(w, [
		sx,
		syw,
		5.1
	], [
		.14,
		.12,
		.12
	], K.bronze, {}, [6, 8]);
	tube(w, [
		[
			1,
			0,
			4.15,
			.32,
			.32
		],
		[
			1.4,
			0,
			3.8,
			.3,
			.3
		],
		[
			1.64,
			-.05,
			3.35,
			.28,
			.28
		],
		[
			1.25,
			-.3,
			3.1,
			.2,
			.19
		],
		[
			.82,
			-.46,
			2.98,
			.15,
			.15
		]
	], K.bronze, { sides: 12 });
	ellipsoid(w, [
		.78,
		-.5,
		2.96
	], [
		.17,
		.15,
		.15
	], K.bronze, {}, [6, 10]);
	ellipsoid(w, [
		0,
		-.07,
		5
	], [
		.27,
		.3,
		.36
	], K.bronze, {}, [10, 14]);
	ellipsoid(w, [
		0,
		-.34,
		4.98
	], [
		.05,
		.08,
		.12
	], K.bronze, { pitch: .15 }, [5, 8]);
	tube(w, [[
		0,
		-.28,
		4.76,
		.1,
		.05
	], [
		0,
		-.31,
		4.6,
		.075,
		.04
	]], K.bronze, {
		sides: 8,
		cap: 2
	});
	body(w, [
		[
			0,
			.02,
			5.1,
			.47,
			.47
		],
		[
			0,
			.02,
			5.28,
			.43,
			.45
		],
		[
			0,
			.02,
			5.58,
			.39,
			.41
		],
		[
			0,
			.02,
			5.84,
			.26,
			.28
		],
		[
			0,
			.02,
			6.02,
			.1,
			.1
		]
	], K.bronze, {
		cols: 20,
		rows: 14
	});
	tube(w, [
		[
			0,
			.02,
			5.98,
			.05,
			.05
		],
		[
			0,
			.02,
			6.22,
			.035,
			.035
		],
		[
			0,
			.02,
			6.46,
			.02,
			.02
		]
	], K.bronze, {
		sides: 6,
		steps: 4,
		cap: 1
	});
	ellipsoid(w, [
		0,
		.02,
		6.03
	], [
		.1,
		.1,
		.07
	], K.bronze, {}, [4, 8]);
	loft(w, 6, 12, (v, u) => {
		const theta = u * Math.PI, flare = 1 + (1 - v) * .5;
		return [
			Math.cos(theta) * .44 * flare,
			Math.sin(theta) * .44 * flare + .02,
			4.64 + v * .56
		];
	}, K.bronze, { closed: false });
	w.dz = 0;
}
var SEJONG = {
	baseTop: 4.2,
	total: 10.4
};
function buildSejong(w) {
	const zb = SEJONG.baseTop, G = K.gilt;
	w.frustum(0, 0, 4.25, 3.1, 0, 2.7, 2.1, zb, K.stone, { bottom: true });
	for (const [x, kind] of [
		[-3.2, 0],
		[0, 1],
		[3.2, 2]
	]) {
		const y = -5.4;
		w.box(x - .55, x + .55, -5.95, -4.8500000000000005, 0, .85, K.stone, { bottom: true });
		if (kind === 0) {
			bowl(w, [
				x,
				y,
				1.45
			], .55, .07, G, [6, 20]);
			tube(w, [
				[
					x - .02,
					-5.1000000000000005,
					1.42,
					.025,
					.025
				],
				[
					x - .02,
					-5.42,
					1.07,
					.025,
					.025
				],
				[
					x - .02,
					-5.7,
					1,
					.025,
					.025
				]
			], G, {
				sides: 6,
				steps: 4,
				cap: 1
			});
		} else if (kind === 1) cup(w, [
			x,
			y,
			.85
		], .27, .045, .7, G, 20);
		else {
			ellipsoid(w, [
				x,
				y,
				1.5
			], [
				.14,
				.14,
				.14
			], G, {}, [6, 10]);
			torus(w, [
				x,
				y,
				1.5
			], .46, .028, G, {}, [4, 24]);
			torus(w, [
				x,
				y,
				1.5
			], .42, .028, G, { pitch: Math.PI / 2 }, [4, 24]);
			torus(w, [
				x,
				y,
				1.5
			], .38, .028, G, {
				pitch: Math.PI / 2,
				yaw: Math.PI / 2
			}, [4, 24]);
			torus(w, [
				x,
				y,
				1.5
			], .5, .03, G, { roll: .6 }, [4, 24]);
		}
	}
	w.dz = zb;
	w.box(-1.5, 1.5, -2.2, -1.1, 0, .6, G, { bottom: true });
	w.box(-1.78, 1.78, -1.1, 1.4, 0, 1.15, G, { bottom: true });
	for (const side of [-1, 1]) {
		w.box(Math.min(side * 1.78, side * 2.15), Math.max(side * 1.78, side * 2.15), -1.1, 1.4, 0, 2.9, G, { bottom: true });
		w.box(Math.min(side * 1.7, side * 2.23), Math.max(side * 1.7, side * 2.23), -1.15, 1.4, 2.9, 3.12, G, { bottom: true });
		tube(w, [
			[
				side * 1.97,
				-1.1,
				3.05,
				.11,
				.11
			],
			[
				side * 2.03,
				-1.3,
				3.25,
				.11,
				.11
			],
			[
				side * 2.05,
				-1.4,
				3.4,
				.13,
				.13
			]
		], G, {
			sides: 8,
			cap: 2
		});
		ellipsoid(w, [
			side * 2.05,
			-1.48,
			3.44
		], [
			.17,
			.21,
			.15
		], G, {}, [6, 10]);
	}
	w.box(-2.15, 2.15, 1, 1.4, 0, 3.7, G, { bottom: true });
	const drape = (v, u) => .05 * Math.sin(u * Math.PI * 2 * 11 + v * 1.5) * (1 - v) ** 1.2;
	body(w, [
		[
			0,
			-.95,
			.75,
			1.65,
			1.3
		],
		[
			0,
			-1,
			1.1,
			1.62,
			1.28
		],
		[
			0,
			-.85,
			1.7,
			1.52,
			1.1
		],
		[
			0,
			-.5,
			2.3,
			1.25,
			.85
		]
	], G, {
		cols: 40,
		rows: 20,
		fold: drape
	});
	body(w, [
		[
			0,
			-.05,
			1.9,
			1.35,
			.95
		],
		[
			0,
			-.02,
			2.7,
			1.02,
			.72
		],
		[
			0,
			0,
			3.15,
			.98,
			.62
		],
		[
			0,
			0,
			3.85,
			1.2,
			.6
		],
		[
			0,
			0,
			4.2,
			1.1,
			.5
		],
		[
			0,
			0,
			4.45,
			.4,
			.34
		]
	], G, {
		cols: 36,
		rows: 22,
		fold: (v, u) => v < .5 ? drape(v, u) * .6 : 0
	});
	body(w, [[
		0,
		-.02,
		2.88,
		1.05,
		.74
	], [
		0,
		-.02,
		3.06,
		1.05,
		.74
	]], G, {
		cols: 32,
		rows: 2
	});
	ellipsoid(w, [
		0,
		-.35,
		4.2
	], [
		.62,
		.22,
		.2
	], G, {}, [6, 14]);
	tube(w, [
		[
			-1.05,
			0,
			4,
			.4,
			.4
		],
		[
			-1.5,
			-.1,
			3.45,
			.46,
			.44
		],
		[
			-1.62,
			-.3,
			3.1,
			.48,
			.46
		]
	], G, { sides: 14 });
	ellipsoid(w, [
		-1.65,
		-.4,
		2.8
	], [
		.45,
		.4,
		.65
	], G, { roll: -.1 }, [8, 14]);
	tube(w, [
		[
			-1.55,
			-.25,
			3.4,
			.32,
			.32
		],
		[
			-1.52,
			-.6,
			4.1,
			.24,
			.24
		],
		[
			-1.46,
			-.95,
			4.75,
			.18,
			.18
		]
	], G, { sides: 12 });
	ellipsoid(w, [
		-1.45,
		-1.05,
		4.98
	], [
		.2,
		.06,
		.26
	], G, { pitch: -.15 }, [6, 12]);
	for (const [fx, fz] of [
		[-.14, .3],
		[-.05, .38],
		[.05, .38],
		[.14, .3]
	]) tube(w, [
		[
			-1.45 + fx * .6,
			-1.07,
			5.12,
			.035,
			.035
		],
		[
			-1.45 + fx,
			-1.08,
			5.12 + fz * .6,
			.028,
			.028
		],
		[
			-1.45 + fx * 1.2,
			-1.09,
			5.12 + fz,
			.022,
			.022
		]
	], G, {
		sides: 6,
		steps: 3,
		cap: 1
	});
	tube(w, [[
		-1.62,
		-1.04,
		4.9,
		.04,
		.04
	], [
		-1.7,
		-1.06,
		5.02,
		.03,
		.03
	]], G, {
		sides: 6,
		steps: 2,
		cap: 1
	});
	tube(w, [
		[
			1.05,
			0,
			4,
			.4,
			.4
		],
		[
			1.5,
			-.1,
			3.4,
			.45,
			.43
		],
		[
			1.58,
			-.35,
			2.95,
			.42,
			.4
		],
		[
			1.2,
			-.9,
			2.7,
			.22,
			.2
		],
		[
			.95,
			-1.15,
			2.6,
			.15,
			.15
		]
	], G, { sides: 14 });
	ellipsoid(w, [
		1.7,
		-.25,
		2.55
	], [
		.38,
		.34,
		.6
	], G, { roll: .1 }, [8, 14]);
	ellipsoid(w, [
		.93,
		-1.2,
		2.58
	], [
		.17,
		.13,
		.09
	], G, {}, [5, 10]);
	slab(w, [
		1.3,
		-1.3,
		2.62
	], [
		.55,
		.4,
		.035
	], G, {
		roll: .38,
		yaw: .1
	});
	slab(w, [
		.75,
		-1.25,
		2.55
	], [
		.52,
		.4,
		.035
	], G, {
		roll: .16,
		yaw: .1
	});
	tube(w, [[
		0,
		0,
		4.2,
		.34,
		.32
	], [
		0,
		0,
		4.6,
		.32,
		.3
	]], G, {
		sides: 12,
		cap: 1
	});
	ellipsoid(w, [
		0,
		-.05,
		5
	], [
		.5,
		.52,
		.6
	], G, {}, [10, 16]);
	ellipsoid(w, [
		0,
		-.52,
		4.93
	], [
		.08,
		.12,
		.17
	], G, { pitch: .15 }, [5, 8]);
	for (const side of [-1, 1]) ellipsoid(w, [
		side * .5,
		-.02,
		5
	], [
		.06,
		.1,
		.17
	], G, {}, [5, 8]);
	ellipsoid(w, [
		0,
		-.4,
		4.62
	], [
		.26,
		.12,
		.24
	], G, {}, [6, 12]);
	body(w, [
		[
			0,
			.06,
			5.3,
			.56,
			.6
		],
		[
			0,
			.08,
			5.6,
			.56,
			.6
		],
		[
			0,
			.1,
			5.95,
			.46,
			.5
		],
		[
			0,
			.1,
			6.2,
			.22,
			.26
		]
	], G, {
		cols: 22,
		rows: 12
	});
	for (const side of [-1, 1]) ellipsoid(w, [
		side * .2,
		.66,
		5.74
	], [
		.21,
		.045,
		.22
	], G, { yaw: side * .12 }, [8, 14]);
	w.dz = 0;
}
export { buildSejong, buildYiSunsin };
