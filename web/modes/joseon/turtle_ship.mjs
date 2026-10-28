import { compile, hexRGB } from "../coaster/night.mjs";
// web/modes/joseon/turtle_ship.mts
var SUN = ((v) => {
	const l = Math.hypot(...v);
	return v.map((c) => c / l);
})([
	-.3,
	.46,
	.84
]);
var LOD_MID = 9;
var LOD_HI = 20;
var INST = 20;
var fnv1a = (s) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
};
var norm = (a) => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [
		a[0] / l,
		a[1] / l,
		a[2] / l
	];
};
var P_FLAT = 0;
var P_HULL = 1;
var P_SHELL = 2;
var P_LINE = 3;
var P_HEAD = 4;
var P_BOW = 5;
var P_FLAG = 6;
var P_OAR = 7;
var P_DECK = 8;
var P_OPEN = 9;
var S_WOOD = 0;
var S_WOOD_DARK = 1;
var S_SHELL = 2;
var S_SHELL_EDGE = 3;
var S_SPIKE = 4;
var S_RED = 5;
var S_GOLD = 6;
var S_WHITE = 7;
var S_INK = 8;
var S_OAR = 9;
var S_LAMP = 10;
var S_HEAD = 11;
var S_DECK = 12;
var S_PATH = 13;
var PAL = 14;
var POLE = {
	turtle: {
		t: .035,
		z: .37,
		h: 1.4
	},
	boat: {
		t: .07,
		z: .36,
		h: 1.35
	}
};
var FLAG = {
	w: 1,
	h: .65,
	flame: .07,
	n: [6, 3],
	nSmall: [3, 2],
	minPx: 22,
	maxScale: 1.6,
	amp: [.07, .02],
	droop: .04,
	period: 2.4
};
var LABELS = {
	"GTX-A": "A",
	"경강선": "경강",
	"경의중앙선": "경의",
	"경춘선": "경춘",
	"공항철도": "공항",
	"김포골드라인": "김포",
	"서해선": "서해",
	"수인분당선": "수인",
	"신림선": "신림",
	"신분당선": "신분",
	"에버라인선": "에버",
	"우이신설선": "우이",
	"의정부선": "의정",
	"인천1호선": "인1",
	"인천2호선": "인2"
};
var lineLabel = (line) => {
	const m = /^(\d+)호선$/.exec(line || "");
	return m ? m[1] : LABELS[line] || String(line || "").replace(/선$/, "").slice(0, 2);
};
var hullHalf = (t) => Math.max(.2, .5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 3)), .38));
var gunwale = (t) => .3 + .1 * Math.pow(Math.abs(2 * t - 1), 2);
var SHELL_T = [.07, .93];
var shellRise = (t) => {
	const u = (t - SHELL_T[0]) / (SHELL_T[1] - SHELL_T[0]);
	return .42 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 4)), .5);
};
var OAR_PIVOT = {
	y: .45,
	z: .17
};
var Mesh = class {
	constructor() {
		this.d = [];
		this.n = 0;
	}
	v(x, p, n, part, slot) {
		this.d.push(x, p[0], p[1], p[2], n[0], n[1], n[2], part, slot);
		this.n++;
	}
	tri(a, b, c, o) {
		const P = (q) => [
			q[0] * 4 + q[1][0],
			q[1][1],
			q[1][2]
		], A = P(a), B = P(b), C = P(c);
		const u = [
			B[0] - A[0],
			B[1] - A[1],
			B[2] - A[2]
		], w = [
			C[0] - A[0],
			C[1] - A[1],
			C[2] - A[2]
		];
		let n = norm([
			u[1] * w[2] - u[2] * w[1],
			u[2] * w[0] - u[0] * w[2],
			u[0] * w[1] - u[1] * w[0]
		]);
		if (o.out) {
			const c = [
				A[0] - o.out[0],
				A[1] - o.out[1],
				A[2] - o.out[2]
			];
			if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) n = n.map((v) => -v);
		}
		for (const q of [
			a,
			b,
			c
		]) this.v(q[0], q[1], n, o.part, o.slot);
	}
	quad(a, b, c, d, o) {
		this.tri(a, b, c, o);
		this.tri(a, c, d, o);
	}
	box(x, c, h, o) {
		const V = (i, j, k) => [x, [
			c[0] + i * h[0],
			c[1] + j * h[1],
			c[2] + k * h[2]
		]], q = (a, b, cc, d, n) => {
			for (const p of [
				a,
				b,
				cc,
				a,
				cc,
				d
			]) this.v(p[0], p[1], n, o.part, o.slot);
		};
		q(V(1, -1, -1), V(1, 1, -1), V(1, 1, 1), V(1, -1, 1), [
			1,
			0,
			0
		]);
		q(V(-1, 1, -1), V(-1, -1, -1), V(-1, -1, 1), V(-1, 1, 1), [
			-1,
			0,
			0
		]);
		q(V(-1, 1, -1), V(1, 1, -1), V(1, 1, 1), V(-1, 1, 1), [
			0,
			1,
			0
		]);
		q(V(1, -1, -1), V(-1, -1, -1), V(-1, -1, 1), V(1, -1, 1), [
			0,
			-1,
			0
		]);
		q(V(-1, -1, 1), V(1, -1, 1), V(1, 1, 1), V(-1, 1, 1), [
			0,
			0,
			1
		]);
		if (o.bottom) q(V(-1, 1, -1), V(1, 1, -1), V(1, -1, -1), V(-1, -1, -1), [
			0,
			0,
			-1
		]);
	}
	buffer() {
		return new Float32Array(this.d);
	}
};
function hull(M, rings, face = true) {
	const side = {
		part: P_HULL,
		slot: S_WOOD
	}, z0 = -.06, ts = Array.from({ length: rings + 1 }, (_, i) => i / rings);
	for (let i = 0; i < rings; i++) {
		const a = ts[i], b = ts[i + 1];
		for (const s of [-1, 1]) M.quad([a, [
			0,
			s * hullHalf(a) * .84,
			z0
		]], [b, [
			0,
			s * hullHalf(b) * .84,
			z0
		]], [b, [
			0,
			s * hullHalf(b),
			gunwale(b)
		]], [a, [
			0,
			s * hullHalf(a),
			gunwale(a)
		]], {
			...side,
			out: [
				a * 4,
				0,
				.1
			]
		});
	}
	const end = (t, part, slot, dir) => {
		const h = hullHalf(t), g = gunwale(t);
		M.quad([t, [
			0,
			-h * .84,
			z0
		]], [t, [
			0,
			h * .84,
			z0
		]], [t, [
			0,
			h,
			g
		]], [t, [
			0,
			-h,
			g
		]], {
			part,
			slot,
			out: [
				(t - dir * .1) * 4,
				0,
				.1
			]
		});
	};
	end(1, face ? P_BOW : P_HULL, face ? S_RED : S_WOOD_DARK, 1);
	end(0, P_HULL, S_WOOD_DARK, -1);
	if (!face) return;
	const deck = {
		part: P_DECK,
		slot: S_WOOD_DARK
	};
	for (const [t0, t1] of [[0, SHELL_T[0]], [SHELL_T[1], 1]]) {
		const n = 2;
		for (let i = 0; i < n; i++) {
			const a = t0 + (t1 - t0) * i / n, b = t0 + (t1 - t0) * (i + 1) / n;
			M.quad([a, [
				0,
				-hullHalf(a),
				gunwale(a)
			]], [b, [
				0,
				-hullHalf(b),
				gunwale(b)
			]], [b, [
				0,
				hullHalf(b),
				gunwale(b)
			]], [a, [
				0,
				hullHalf(a),
				gunwale(a)
			]], {
				...deck,
				out: [
					0,
					0,
					-5
				]
			});
		}
	}
}
function shell(M, rings, arcs) {
	const o = {
		part: P_SHELL,
		slot: S_SHELL
	}, ridge = {
		part: P_LINE,
		slot: S_SHELL_EDGE
	};
	const at = (t, k) => {
		const h = hullHalf(t) * .97, g = gunwale(t), th = Math.PI * k / arcs, r = shellRise(t);
		return [t, [
			0,
			-Math.cos(th) * h,
			g + Math.pow(Math.sin(th), .7) * r
		]];
	};
	for (let i = 0; i < rings; i++) {
		const a = SHELL_T[0] + (SHELL_T[1] - SHELL_T[0]) * i / rings, b = SHELL_T[0] + (SHELL_T[1] - SHELL_T[0]) * (i + 1) / rings;
		for (let k = 0; k < arcs; k++) M.quad(at(a, k), at(b, k), at(b, k + 1), at(a, k + 1), {
			...o,
			out: [
				(a + b) * 2,
				0,
				-2
			]
		});
		const m = (a + b) / 2, rr = shellRise(m) + gunwale(m) + .012, w = .045;
		M.quad([a, [
			0,
			-.045,
			shellRise(a) + gunwale(a) + .012
		]], [b, [
			0,
			-.045,
			shellRise(b) + gunwale(b) + .012
		]], [b, [
			0,
			w,
			shellRise(b) + gunwale(b) + .012
		]], [a, [
			0,
			w,
			shellRise(a) + gunwale(a) + .012
		]], {
			...ridge,
			out: [
				m * 4,
				0,
				rr - 5
			]
		});
	}
}
function spikes(M, rows, arcs) {
	const o = {
		part: P_FLAT,
		slot: S_SPIKE
	}, dk = {
		part: P_FLAT,
		slot: S_SHELL_EDGE
	}, b = .0175, hgt = .095;
	for (let i = 0; i < rows; i++) {
		const t = SHELL_T[0] + (SHELL_T[1] - SHELL_T[0]) * (i + .5) / rows;
		if (Math.abs(t - .5) < .045) continue;
		const h = hullHalf(t) * .97, g = gunwale(t), r = shellRise(t);
		for (let k = 1; k < arcs; k++) {
			const th = Math.PI * k / arcs;
			if (Math.abs(th - Math.PI / 2) < .2) continue;
			const y = -Math.cos(th) * h, z = g + Math.pow(Math.sin(th), .7) * r;
			let ny = -Math.cos(th) / Math.max(h, .1), nz = Math.sin(th) / Math.max(r, .1);
			const l = Math.hypot(ny, nz);
			ny /= l;
			nz /= l;
			const ty = nz, tz = -ny, A = [t, [
				0,
				y + ny * hgt,
				z + nz * hgt
			]], out = [
				t * 4,
				y - ny * .2,
				z - nz * .2
			];
			const C = [
				[-.0175, -.0175],
				[b, -.0175],
				[b, b],
				[-.0175, b]
			].map(([dx, dt]) => [t, [
				dx,
				y + ty * dt,
				z + tz * dt
			]]);
			for (let q = 0; q < 4; q++) M.tri(C[q], C[(q + 1) % 4], A, {
				...q % 2 ? dk : o,
				out
			});
		}
	}
}
function dragon(M, lod) {
	const head = {
		part: P_HEAD,
		slot: S_HEAD,
		bottom: true
	}, gold = {
		part: P_FLAT,
		slot: S_GOLD,
		bottom: true
	}, white = {
		part: P_FLAT,
		slot: S_WHITE
	}, ink = {
		part: P_FLAT,
		slot: S_INK
	};
	M.box(1, [
		.12,
		0,
		.44
	], [
		.16,
		.17,
		.13
	], head);
	M.box(1, [
		.36,
		0,
		.58
	], [
		.14,
		.19,
		.14
	], head);
	M.box(1, [
		.76,
		0,
		.78
	], [
		.34,
		.3,
		.14
	], head);
	M.box(1, [
		1.06,
		0,
		.74
	], [
		.1,
		.24,
		.1
	], head);
	M.box(1, [
		.86,
		0,
		.4
	], [
		.28,
		.24,
		.055
	], {
		...head,
		slot: S_RED
	});
	M.box(1, [
		.88,
		0,
		.55
	], [
		.24,
		.22,
		.09
	], ink);
	for (const sd of [-1, 1]) {
		M.box(1, [
			.5,
			sd * .16,
			1.02
		], [
			.05,
			.045,
			.16
		], gold);
		M.box(1, [
			.66,
			sd * .302,
			.86
		], [
			.11,
			.014,
			.085
		], white);
		if (lod > 1) M.box(1, [
			.7,
			sd * .318,
			.86
		], [
			.045,
			.006,
			.045
		], ink);
		for (const k of [0, 1]) M.box(1, [
			1.1 - k * .12,
			sd * .17,
			.62
		], [
			.03,
			.03,
			.035
		], white);
	}
	M.box(1, [
		.66,
		0,
		.935
	], [
		.26,
		.2,
		.012
	], gold);
}
function buildFlag() {
	const M = new Mesh();
	M.box(0, [
		0,
		0,
		.5
	], [
		.028,
		.028,
		.5
	], {
		part: P_FLAT,
		slot: S_WOOD_DARK
	});
	M.box(0, [
		0,
		0,
		.955
	], [
		.06,
		.06,
		.045
	], {
		part: P_FLAT,
		slot: S_RED
	});
	M.box(0, [
		0,
		0,
		1.06
	], [
		.022,
		.022,
		.06
	], {
		part: P_FLAT,
		slot: S_GOLD
	});
	const nu = 12, nv = 4, q = (u, v) => M.v(0, [
		u,
		v,
		0
	], [
		0,
		1,
		0
	], P_FLAG, 0);
	for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
		const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
		q(u0, v0);
		q(u1, v0);
		q(u1, v1);
		q(u0, v0);
		q(u1, v1);
		q(u0, v1);
	}
	return M.buffer();
}
function openDeck(M, lod) {
	const o = {
		part: P_OPEN,
		slot: S_DECK
	}, n = 6, t0 = .05;
	for (let i = 0; i < n; i++) {
		const a = t0 + .8999999999999999 * i / n, b = t0 + .8999999999999999 * (i + 1) / n, za = gunwale(a) - .07, zb = gunwale(b) - .07;
		M.quad([a, [
			0,
			-hullHalf(a) * .93,
			za
		]], [b, [
			0,
			-hullHalf(b) * .93,
			zb
		]], [b, [
			0,
			hullHalf(b) * .93,
			zb
		]], [a, [
			0,
			hullHalf(a) * .93,
			za
		]], {
			...o,
			out: [
				0,
				0,
				-5
			]
		});
	}
	if (lod) for (const t of [.33, .62]) M.box(t, [
		0,
		0,
		gunwale(t) - .03
	], [
		.035,
		hullHalf(t) * .9,
		.018
	], {
		part: P_FLAT,
		slot: S_WOOD_DARK
	});
}
function oars(M, n) {
	const o = {
		part: P_OAR,
		slot: S_OAR
	};
	for (let i = 0; i < n; i++) {
		const t = .24 + .52 * (i + .5) / n;
		for (const s of [-1, 1]) {
			const y0 = s * OAR_PIVOT.y, y1 = s * (OAR_PIVOT.y + .22), z0 = OAR_PIVOT.z, z1 = -.03, w = .022;
			M.quad([t, [
				-.022,
				y0,
				z0
			]], [t, [
				w,
				y0,
				z0
			]], [t, [
				w,
				y1,
				z1
			]], [t, [
				-.022,
				y1,
				z1
			]], {
				...o,
				out: [
					t * 4,
					0,
					-5
				]
			});
			M.quad([t, [
				-.0484,
				y1 - s * .09,
				-.0049999999999999975
			]], [t, [
				w * 2.2,
				y1 - s * .09,
				-.0049999999999999975
			]], [t, [
				w * 2.2,
				y1,
				z1
			]], [t, [
				-.0484,
				y1,
				z1
			]], {
				...o,
				out: [
					t * 4,
					0,
					-5
				]
			});
		}
	}
}
function buildShip(lod) {
	const M = new Mesh();
	hull(M, lod ? 12 : 6);
	shell(M, lod ? 10 : 5, lod > 1 ? 8 : lod ? 6 : 4);
	dragon(M, lod);
	if (lod) spikes(M, lod > 1 ? 15 : 9, lod > 1 ? 9 : 6);
	if (lod) oars(M, lod > 1 ? 8 : 5);
	return M.buffer();
}
function buildBoat(lod) {
	const M = new Mesh();
	hull(M, lod ? 10 : 6, false);
	openDeck(M, lod);
	if (lod) oars(M, lod > 1 ? 6 : 4);
	return M.buffer();
}
var VS = `#version 300 es
precision highp float;
in float a_x;in vec3 a_p;in vec3 a_n;in float a_part;in float a_slot;
in vec3 i_o;in vec3 i_F;in vec3 i_R;in vec3 i_U;in vec2 i_LW;in vec3 i_rgb;in float i_flag;in float i_seed;in float i_label;
uniform mat4 u_matrix;uniform float u_unit,u_time,u_flagPass;
uniform vec3 u_pole[2];uniform vec4 u_flag,u_fl,u_fl2;   // 깃대 (t, 뿌리 z, 길이) 거북선 · 일반 배; 깃발 FLAG: (폭, 높이, 키움 상한, 천 높이 목표 px), (화염각, 주기, 끝 · 가운데 진폭), (처짐)
out vec3 v_loc;out vec3 v_n;out float v_fold;flat out vec3 v_rgb;flat out float v_part;flat out float v_slot;flat out vec2 v_LW;flat out float v_seed;flat out float v_label;
void main(){
  float L=i_LW.x,W=i_LW.y;vec3 p=a_p;vec3 nn=a_n;float x=a_x*L;
  bool moving=mod(floor(i_flag/4.),2.)>.5;
  v_rgb=i_rgb;v_part=a_part;v_slot=a_slot;v_LW=i_LW;v_seed=i_seed;v_label=i_label;v_fold=0.;
  if(u_flagPass>.5){   // 깃대 · 깃발: 배 종류의 깃대 자리에
    int kind=int(mod(floor(i_flag/64.),2.)+.5);vec3 po=u_pole[kind];
    float sf=clamp(u_flag.w/(u_flag.y*W),1.,u_flag.z),top=po.y+po.z*sf;   // 작을 때 깃발 · 깃대를 함께 키운다(천 높이 목표 px, 상한)
    if(a_part==${P_FLAG}.){   // 천: 깃대 꼭대기에 한 변, 배 뒤쪽으로 날리고 끝으로 갈수록 크게 펄럭 · 처짐 (가운데 번호 쪽은 거의 가만히)
      float fl=u_fl.x,X=p.x*(u_flag.x+fl),Y=p.y*(u_flag.y+2.*fl)-fl,ph=u_time*6.2832/u_fl.y+i_seed*20.,k=7.5,mv=moving?1.:.6;
      float amp=(u_fl.z*smoothstep(.5,1.,p.x)+u_fl.w*p.x)*mv,off=sin(X*k-ph)*amp,dOff=cos(X*k-ph)*k*amp,sag=u_fl2.x*p.x*p.x;
      vec3 loc=vec3(po.x*L-X*W*sf,off*W*sf,(top-.06-(Y+sag)*sf)*W);
      gl_Position=u_matrix*vec4(i_o+(i_F*loc.x+i_R*loc.y+i_U*loc.z)*u_unit,1.);
      vec2 tn=normalize(vec2(-dOff,-1.));v_n=i_F*tn.x+i_R*tn.y;
      v_fold=cos(X*k-ph)*smoothstep(.15,.7,p.x);   // 천의 접힘: 물결 골은 어둡고 마루는 밝게(Codex: 판처럼 보이지 않게)
      v_loc=vec3(X,Y,u_flag.y*W*sf);return;   // (z: 천 높이 px — 작으면 화염각을 줄인다)
    }
    vec3 loc=vec3(po.x*L+p.x*W*sf,p.y*W*sf,(po.y+p.z*po.z*sf)*W);
    gl_Position=u_matrix*vec4(i_o+(i_F*loc.x+i_R*loc.y+i_U*loc.z)*u_unit,1.);
    v_loc=vec3(po.x,p.y,po.y+p.z*po.z);v_n=i_F*nn.x+i_R*nn.y+i_U*nn.z;return;
  }
  if(a_part==${P_OAR}.){   // 노: 걸린 자리 둘레로 앞뒤로 젓고, 돌아올 때 물에서 든다(배가 멈춰 있으면 가만히)
    float s=sign(p.y),ph=u_time*2.6+i_seed*6.283,sw=moving?sin(ph)*.42:0.,lift=moving?max(0.,cos(ph))*.07:0.;
    vec2 d=vec2(p.x,p.y-s*${OAR_PIVOT.y});float c=cos(sw*s),sn=sin(sw*s);
    d=vec2(c*d.x-sn*d.y,sn*d.x+c*d.y);p.x=d.x;p.y=d.y+s*${OAR_PIVOT.y};p.z+=lift*abs(d.y)/.22;
  }
  vec3 loc=vec3(x+p.x*W,p.y*W,p.z*W);
  vec3 w=i_o+(i_F*loc.x+i_R*loc.y+i_U*loc.z)*u_unit;
  gl_Position=u_matrix*vec4(w,1.);
  v_loc=vec3(a_x,p.y,p.z);v_n=i_F*nn.x+i_R*nn.y+i_U*nn.z;
}`;
var FS = `#version 300 es
precision highp float;
in vec3 v_loc;in vec3 v_n;in float v_fold;flat in vec3 v_rgb;flat in float v_part;flat in float v_slot;flat in vec2 v_LW;flat in float v_seed;flat in float v_label;
uniform float u_alpha,u_amb,u_dif,u_dark,u_rows;uniform vec3 u_pal[${PAL}];uniform vec3 u_light;uniform sampler2D u_atlas;uniform vec4 u_fl,u_fn;
out vec4 o;
float ink(float d){float a=max(.02,fwidth(d)*.7);return 1.-smoothstep(-a,a,d);}
void main(){
  int part=int(v_part+.5);float L=v_LW.x,W=v_LW.y,ax=v_loc.x*L/W;   // ax: 고물에서 앞으로, W 단위
  vec3 col=u_pal[int(v_slot+.5)];float glow=0.;
  float detail=smoothstep(7.,16.,W);
  if(part==${P_FLAG}){   // 천: 노선 색 바탕, 가운데 흰 번호, 위 · 아래 · 끝 세 변에 불꽃 모양 테(화염각: 짙은 적색, 붉은 노선이면 금색)
    float fw=u_fl.x,X=v_loc.x,Y=v_loc.y,FW=${FLAG.w.toFixed(3)},FH=${FLAG.h.toFixed(3)};bool small=v_loc.z<24.;
    float n=small?u_fn.z:u_fn.x,ne=small?u_fn.w:u_fn.y;
    bool field=X<=FW&&Y>=0.&&Y<=FH;
    if(!field){   // 화염각: 혀마다 가운데가 길고 끝이 뾰족
      float d,h;
      if(X>FW&&Y>=0.&&Y<=FH){float t=fract(Y/FH*ne);h=fw*(1.-abs(2.*t-1.));d=X-FW;}   // (Codex 2차: 가늘고 고른 세모 혀)
      else if(X<=FW){float t=fract(X/FW*n);h=fw*(1.-abs(2.*t-1.));d=Y<0.?-Y:Y-FH;}
      else discard;
      if(d>h)discard;
      vec3 fc=(v_rgb.r>.55&&v_rgb.g<.45)?u_pal[${S_GOLD}]:u_pal[${S_RED}]*.78;
      float nl=length(v_n),dd=nl>1e-6?abs(dot(v_n/nl,u_light)):0.;o=vec4(fc*(u_amb+u_dif*dd)*(1.+.14*v_fold),1.)*u_alpha;return;
    }
    vec2 uv=vec2(X/FW,Y/FH);if(gl_FrontFacing)uv.x=1.-uv.x;   // 어느 면에서 봐도 번호가 바로 읽히게(천은 깃대에서 배 뒤쪽으로 날린다: 앞면에서는 좌우를 뒤집어 읽는다)
    vec4 t=texture(u_atlas,vec2(uv.x,(v_label+uv.y)/u_rows));
    vec3 c=mix(v_rgb,t.rgb,t.a);float nl=length(v_n),dd=nl>1e-6?abs(dot(v_n/nl,u_light)):0.;
    o=vec4(c*(u_amb+.08+u_dif*dd)*(1.+.14*v_fold),1.)*u_alpha;return;
  }
  if(part==${P_HULL}){   // 몸통: 널판 줄, 뱃전 위 짙은 테, 그 밑 노선 색 띠, 그 밑 총통 구멍(거북선만: 일반 배는 slot 이 어두운 나무)
    float z=v_loc.z,g=.3+.1*pow(abs(2.*v_loc.x-1.),2.);
    col=mix(col,u_pal[${S_WOOD_DARK}],ink(abs(fract(z/.075)-.5)*.075-.006)*.55*detail);
    col=mix(col,u_pal[${S_WOOD_DARK}]*.8,ink(g-.028-z));
    col=mix(col,v_rgb,ink(abs(z-(g-.065))-.034));
    if(int(v_slot+.5)==${S_WOOD}){float cell=fract(ax/.36)-.5,port=ink(max(abs(cell)*.36-.045,abs(z-.17)-.035))*step(.12,v_loc.x)*step(v_loc.x,.88);
      col=mix(col,mix(u_pal[${S_INK}],u_pal[${S_LAMP}],u_dark),port*detail);glow=port*detail*u_dark;}
  }else if(part==${P_SHELL}){   // 등딱지: 육각 철갑, 이음마다 쇠못(가까이서), 가운데 가로 길(밝게; 세로 길은 용마루)
    vec2 q=vec2(ax,v_loc.y*1.15+v_loc.z*.6)/.16;
    vec2 r=vec2(1.,1.732),h=r*.5,a=mod(q,r)-h,b=mod(q-h,r)-h,gv=dot(a,a)<dot(b,b)?a:b;
    float e=max(abs(gv.x)*.866+abs(gv.y)*.5,abs(gv.y));   // 육각 칸 안에서 가장자리까지
    col=mix(col,u_pal[${S_SHELL_EDGE}],ink(.47-e)*.85*detail);
    col=mix(col,u_pal[${S_SPIKE}],ink(length(gv)-.13)*detail*smoothstep(12.,22.,W));
    col=mix(col,u_pal[${S_PATH}],ink(abs(ax-L/W*.5)-.045));
  }else if(part==${P_LINE})col=u_pal[${S_PATH}];   // 용마루(세로 길): 가로 길과 같은 밝은 길 — 노선은 깃발이 알린다(2026-10-10 행님)
  else if(part==${P_OPEN}){col=mix(col,u_pal[${S_WOOD_DARK}],ink(abs(fract(v_loc.y/.21+.5)-.5)*.21-.007)*.6*detail);}   // 일반 배 갑판: 앞뒤로 가는 널판 줄
  else if(part==${P_BOW}){   // 이물판의 귀면: 붉은 얼굴에 흰 눈 · 이빨
    vec2 f=vec2(v_loc.y,v_loc.z-.17);
    col=mix(col,u_pal[${S_WHITE}],ink(length(vec2(abs(f.x)-.08,f.y-.05))-.035)*detail);
    col=mix(col,u_pal[${S_INK}],ink(length(vec2(abs(f.x)-.08,f.y-.05))-.015)*detail);
    col=mix(col,u_pal[${S_WHITE}],ink(max(abs(f.x)-.1,abs(f.y+.05)-.018))*ink(abs(fract(f.x/.04)-.5)*.04-.012)*detail);
  }
  float nl=length(v_n),d=nl>1e-6?abs(dot(v_n/nl,u_light)):0.;
  col*=u_amb+u_dif*d;col=mix(col,u_pal[${S_LAMP}],glow*.8);
  o=vec4(col,1.)*u_alpha;
}`;
var DEFAULT_STYLE = {
	wood: "#5A3E2B",
	woodDark: "#3B2A1E",
	shell: "#3E4A3B",
	shellEdge: "#263027",
	spike: "#C9C3B0",
	red: "#B23A2A",
	gold: "#D9A43A",
	white: "#F2EBDC",
	ink: "#17120E",
	oar: "#8A6A4A",
	lamp: "#FFC874",
	head: "#8A3324",
	deck: "#B08A5E",
	path: "#A99C7C"
};
var ATLAS = {
	w: 128,
	h: 64,
	rows: 32
};
var TurtleShips = class TurtleShips {
	static last = null;
	constructor(style) {
		const S = {
			...DEFAULT_STYLE,
			...style || {}
		};
		this.pal = new Float32Array(PAL * 3);
		[
			S.wood,
			S.woodDark,
			S.shell,
			S.shellEdge,
			S.spike,
			S.red,
			S.gold,
			S.white,
			S.ink,
			S.oar,
			S.lamp,
			S.head,
			S.deck,
			S.path
		].forEach((h, i) => this.pal.set(hexRGB(h), i * 3));
		this.lists = {
			turtle: {
				inst: new Float32Array(INST * 64),
				n: 0
			},
			boat: {
				inst: new Float32Array(INST * 256),
				n: 0
			},
			flag: {
				inst: new Float32Array(INST * 64),
				n: 0
			}
		};
		this.M = /* @__PURE__ */ new Float32Array(16);
		this.seeds = /* @__PURE__ */ new Map();
		this.rows = /* @__PURE__ */ new Map();
		this.atlasDirty = true;
	}
	init(gl) {
		if (this.p) return;
		this.p = compile(gl, VS, FS);
		const inst = [
			"i_o",
			"i_F",
			"i_R",
			"i_U",
			"i_LW",
			"i_rgb",
			"i_flag",
			"i_seed",
			"i_label"
		];
		this.attr = Object.fromEntries([
			"a_x",
			"a_p",
			"a_n",
			"a_part",
			"a_slot",
			...inst
		].map((n) => [n, gl.getAttribLocation(this.p, n)]));
		this.uni = Object.fromEntries([
			"u_matrix",
			"u_unit",
			"u_time",
			"u_alpha",
			"u_amb",
			"u_dif",
			"u_dark",
			"u_pal",
			"u_light",
			"u_flagPass",
			"u_pole",
			"u_flag",
			"u_fl",
			"u_fl2",
			"u_fn",
			"u_rows",
			"u_atlas"
		].map((n) => [n, gl.getUniformLocation(this.p, n)]));
		this.meshes = /* @__PURE__ */ new Map();
		const A = this.attr, ptrs = [
			[
				A.a_x,
				1,
				0
			],
			[
				A.a_p,
				3,
				4
			],
			[
				A.a_n,
				3,
				16
			],
			[
				A.a_part,
				1,
				28
			],
			[
				A.a_slot,
				1,
				32
			]
		];
		const add = (key, data) => {
			const b = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, b);
			gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
			const va = gl.createVertexArray();
			gl.bindVertexArray(va);
			gl.bindBuffer(gl.ARRAY_BUFFER, b);
			for (const [loc, size, off] of ptrs) if (loc >= 0) {
				gl.enableVertexAttribArray(loc);
				gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, off);
			}
			gl.bindVertexArray(null);
			this.meshes.set(key, {
				b,
				va,
				n: data.length / 9
			});
		};
		for (const lod of [
			0,
			1,
			2
		]) {
			add("turtle" + lod, buildShip(lod));
			add("boat" + lod, buildBoat(lod));
		}
		add("flag", buildFlag());
		this.ib = gl.createBuffer();
		this.cap = 0;
		this.tex = gl.createTexture();
		if (typeof document !== "undefined" && document.fonts?.load) document.fonts.load("900 44px Jua").then(() => {
			this.atlasDirty = true;
		}).catch(() => {});
	}
	labelRow(line) {
		let r = this.rows.get(line);
		if (r == null) {
			r = this.rows.size % ATLAS.rows;
			this.rows.set(line, r);
			this.atlasDirty = true;
		}
		return r;
	}
	atlas(gl) {
		if (!this.atlasDirty || typeof document === "undefined") return;
		const c = this.canvas || (this.canvas = document.createElement("canvas"));
		c.width = ATLAS.w;
		c.height = ATLAS.h * ATLAS.rows;
		const g = c.getContext("2d");
		g.clearRect(0, 0, c.width, c.height);
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.lineJoin = "round";
		for (const [line, r] of this.rows) {
			const t = lineLabel(line);
			g.font = `900 ${t.length > 1 ? 38 : 48}px Jua, "Noto Sans KR", sans-serif`;
			const y = r * ATLAS.h + ATLAS.h * .54;
			g.lineWidth = 4;
			g.strokeStyle = "rgba(20,16,12,.75)";
			g.strokeText(t, ATLAS.w / 2, y);
			g.fillStyle = "#FFFFFF";
			g.fillText(t, ATLAS.w / 2, y);
		}
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.atlasDirty = false;
	}
	begin(ox, oy) {
		this.ox = ox;
		this.oy = oy;
		for (const l of Object.values(this.lists)) l.n = 0;
	}
	push(list, fr, L, W, rgb, flag, seed, label) {
		if ((list.n + 1) * INST > list.inst.length) {
			const g = new Float32Array(list.inst.length * 2);
			g.set(list.inst);
			list.inst = g;
		}
		const d = list.inst, i = list.n * INST;
		d[i] = fr[0] - this.ox;
		d[i + 1] = fr[1] - this.oy;
		d[i + 2] = fr[2];
		for (let k = 0; k < 9; k++) d[i + 3 + k] = fr[3 + k];
		d[i + 12] = L;
		d[i + 13] = W;
		d[i + 14] = rgb[0];
		d[i + 15] = rgb[1];
		d[i + 16] = rgb[2];
		d[i + 17] = flag;
		d[i + 18] = seed;
		d[i + 19] = label;
		list.n++;
	}
	ship(fr, L, W, rgb, moving, key, o = {}) {
		for (let k = 0; k < 12; k++) if (!Number.isFinite(fr[k])) return;
		let s = this.seeds.get(key);
		if (s == null) {
			s = fnv1a(String(key)) / 4294967296;
			if (this.seeds.size > 4096) this.seeds.clear();
			this.seeds.set(key, s);
		}
		const kind = o.kind === "boat" ? "boat" : "turtle";
		this.push(this.lists[kind], fr, L, W, rgb, moving ? 4 : 0, s, 0);
		if (o.flag) this.push(this.lists.flag, fr, L, W, rgb, (moving ? 4 : 0) + (kind === "boat" ? 64 : 0), s, this.labelRow(o.line));
	}
	draw(gl, M, ox, oy, o) {
		const T = this.lists, total = T.turtle.n + T.boat.n;
		if (!total || !this.p) {
			TurtleShips.last = { n: 0 };
			return;
		}
		const MT = this.M;
		MT.set(M);
		for (let r = 0; r < 4; r++) MT[12 + r] = M[r] * ox + M[4 + r] * oy + M[12 + r];
		const at = [];
		for (const l of [T.turtle, T.boat]) for (let k = 0; k < Math.min(l.n, 40); k++) at.push([
			l.inst[k * INST] + ox,
			l.inst[k * INST + 1] + oy,
			l.inst[k * INST + 2],
			l.inst[k * INST + 17] >= 4 ? 1 : 0,
			Math.atan2(l.inst[k * INST + 4], l.inst[k * INST + 3])
		]);
		const W0 = (T.turtle.n ? T.turtle : T.boat).inst[13];
		TurtleShips.last = {
			atlas: this.canvas || null,
			n: total,
			turtles: T.turtle.n,
			boats: T.boat.n,
			flags: T.flag.n,
			lod: W0 < LOD_MID ? 0 : W0 < LOD_HI ? 1 : 2,
			W: W0,
			L: (T.turtle.n ? T.turtle : T.boat).inst[12],
			zoom: o.zoom,
			at
		};
		this.atlas(gl);
		const U = this.uni;
		gl.useProgram(this.p);
		gl.uniformMatrix4fv(U.u_matrix, false, MT);
		gl.uniform1f(U.u_unit, o.unit);
		gl.uniform1f(U.u_time, o.time ?? performance.now() / 1e3);
		gl.uniform1f(U.u_amb, o.dark ? .5 : .62);
		gl.uniform1f(U.u_dif, o.dark ? .22 : .42);
		gl.uniform1f(U.u_dark, o.dark ? 1 : 0);
		gl.uniform3fv(U.u_pal, this.pal);
		gl.uniform3fv(U.u_light, SUN);
		gl.uniform3fv(U.u_pole, [
			POLE.turtle.t,
			POLE.turtle.z,
			POLE.turtle.h,
			POLE.boat.t,
			POLE.boat.z,
			POLE.boat.h
		]);
		gl.uniform4f(U.u_flag, FLAG.w, FLAG.h, FLAG.maxScale, FLAG.minPx);
		gl.uniform4f(U.u_fl, FLAG.flame, FLAG.period, ...FLAG.amp);
		gl.uniform4f(U.u_fl2, FLAG.droop, ...FLAG.n, 0);
		gl.uniform4f(U.u_fn, ...FLAG.n, ...FLAG.nSmall);
		gl.uniform1f(U.u_rows, ATLAS.rows);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.uniform1i(U.u_atlas, 0);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.DEPTH_TEST);
		const need = (T.turtle.n + T.boat.n + T.flag.n) * INST;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
		if (this.cap < need) {
			this.cap = Math.max(need, INST * 256) * 2;
			gl.bufferData(gl.ARRAY_BUFFER, this.cap * 4, gl.DYNAMIC_DRAW);
		}
		let off = 0;
		const runs = [];
		for (const [key, l] of [
			["turtle", T.turtle],
			["boat", T.boat],
			["flag", T.flag]
		]) {
			if (!l.n) continue;
			gl.bufferSubData(gl.ARRAY_BUFFER, off * 4, l.inst, 0, l.n * INST);
			runs.push([
				key,
				l,
				off
			]);
			off += l.n * INST;
		}
		const names = [
			"i_o",
			"i_F",
			"i_R",
			"i_U",
			"i_LW",
			"i_rgb",
			"i_flag",
			"i_seed",
			"i_label"
		], sizes = [
			3,
			3,
			3,
			3,
			2,
			3,
			1,
			1,
			1
		];
		for (const [key, l, base] of runs) {
			const W = l.inst[13], lod = W < LOD_MID ? 0 : W < LOD_HI ? 1 : 2, m = this.meshes.get(key === "flag" ? "flag" : key + lod);
			gl.bindVertexArray(m.va);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
			let at2 = 0;
			names.forEach((n, k) => {
				const loc = this.attr[n];
				if (loc >= 0) {
					gl.enableVertexAttribArray(loc);
					gl.vertexAttribPointer(loc, sizes[k], gl.FLOAT, false, INST * 4, base * 4 + at2 * 4);
					gl.vertexAttribDivisor(loc, 1);
				}
				at2 += sizes[k];
			});
			gl.uniform1f(U.u_flagPass, key === "flag" ? 1 : 0);
			const pass = (alpha) => {
				gl.uniform1f(U.u_alpha, alpha);
				gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, l.n);
			};
			gl.depthMask(false);
			if (o.walls && o.occlude) {
				gl.depthFunc(gl.GREATER);
				pass(o.occlude);
			}
			gl.depthFunc(gl.LEQUAL);
			gl.depthMask(true);
			pass(1);
			gl.depthMask(false);
			for (const n of names) {
				const loc = this.attr[n];
				if (loc >= 0) gl.vertexAttribDivisor(loc, 0);
			}
		}
		gl.bindVertexArray(null);
		gl.depthFunc(gl.LEQUAL);
	}
	dispose(gl) {
		if (!this.p) return;
		for (const m of this.meshes.values()) {
			gl.deleteBuffer(m.b);
			gl.deleteVertexArray(m.va);
		}
		gl.deleteBuffer(this.ib);
		gl.deleteTexture(this.tex);
		gl.deleteProgram(this.p);
		this.p = null;
	}
};
export { FLAG, POLE, TurtleShips, TurtleShips as default, buildBoat, buildFlag, buildShip, gunwale, hullHalf, lineLabel };
