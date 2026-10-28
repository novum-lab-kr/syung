import { SEOUL_CITY_STYLE } from "../basic/city.mjs";
import { BULB_FS, bulbSize, compile, hexRGB, lightsOff, lightsOn } from "./night.mjs";
import { routeBadgeAtlas, routeBadgeId } from "./badges.mjs";
// web/modes/coaster/train.mts
var SUN = ((v) => {
	const l = Math.hypot(...v);
	return v.map((c) => c / l);
})([
	-.3,
	.46,
	.84
]);
var LINE_MIX = [15.2, 16.6];
var LOD_MID = 11;
var LOD_HI = 22;
var INST = 20;
var fnv1a = (s) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
};
var TUB0 = .16;
var TUBH = .4;
var WALL = .06;
var NOSE = .62;
var FLOOR = TUB0 + .02;
var P_FLAT = 0;
var P_SIDE = 1;
var P_PLATE = 2;
var P_TAIL = 3;
var P_LINE = 4;
var P_FOOT = 5;
var P_HEAD = 6;
var P_SHIRT = 8;
var P_ARM = 9;
var P_FACE = 10;
var P_HAIR = 11;
var S_CREAM = 0;
var S_RED = 1;
var S_TEAL = 3;
var S_SEAT = 4;
var S_BAR = 5;
var S_CHASSIS = 6;
var S_WHEEL = 7;
var S_DECK = 8;
var S_SKIN = 9;
var S_SHIRT = 10;
var SHIRTS = 7;
var S_HAIR = 17;
var HAIRS = 4;
var PAL = 24;
var SKIN = [
	.97,
	.82,
	.68
];
var HAIR = [
	[
		.16,
		.12,
		.1
	],
	[
		.3,
		.2,
		.12
	],
	[
		.1,
		.1,
		.12
	],
	[
		.45,
		.3,
		.18
	]
];
var SHIRTS_RGB = [
	[
		.95,
		.38,
		.35
	],
	[
		.3,
		.58,
		.92
	],
	[
		1,
		.8,
		.2
	],
	[
		.36,
		.74,
		.48
	],
	[
		.66,
		.5,
		.88
	],
	[
		.98,
		.62,
		.32
	],
	[
		.95,
		.95,
		.96
	]
];
var V_ALL = 0;
var V_LEAD = 1;
var V_TAIL = 3;
var norm = (a) => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [
		a[0] / l,
		a[1] / l,
		a[2] / l
	];
};
var Mesh = class {
	constructor() {
		this.d = [];
		this.n = 0;
	}
	v(x, p, n, part, slot, vis) {
		this.d.push(x, p[0], p[1], p[2], n[0], n[1], n[2], part, slot, vis);
		this.n++;
	}
	quad(x, A, B, C, D, o, n) {
		for (const p of [
			A,
			B,
			C,
			A,
			C,
			D
		]) this.v(x, p, n, o.part, o.slot, o.vis);
	}
	slab(x0, ex0, x1, ex1, y0, y1, z0, z1, o, faces = "XxYyZz") {
		const P = (x, ex, y, z) => [x, [
			ex,
			y,
			z
		]], q = (face, a, b, c, d, n) => {
			if (!faces.includes(face)) return;
			for (const [x, p] of [
				a,
				b,
				c,
				a,
				c,
				d
			]) this.v(x, p, n, o.part, o.slot, o.vis);
		};
		const A = (y, z) => P(x0, ex0, y, z), B = (y, z) => P(x1, ex1, y, z);
		q("X", B(y0, z0), B(y1, z0), B(y1, z1), B(y0, z1), [
			1,
			0,
			0
		]);
		q("x", A(y1, z0), A(y0, z0), A(y0, z1), A(y1, z1), [
			-1,
			0,
			0
		]);
		q("Y", A(y1, z0), B(y1, z0), B(y1, z1), A(y1, z1), [
			0,
			1,
			0
		]);
		q("y", B(y0, z0), A(y0, z0), A(y0, z1), B(y0, z1), [
			0,
			-1,
			0
		]);
		q("Z", A(y0, z1), B(y0, z1), B(y1, z1), A(y1, z1), [
			0,
			0,
			1
		]);
		q("z", A(y1, z0), B(y1, z0), B(y0, z0), A(y0, z0), [
			0,
			0,
			-1
		]);
	}
	box(x, c, h, o, faces = "XxYyZz") {
		this.slab(x, c[0] - h[0], x, c[0] + h[0], c[1] - h[1], c[1] + h[1], c[2] - h[2], c[2] + h[2], o, faces);
	}
	buffer() {
		return new Float32Array(this.d);
	}
};
function nose(M, rings) {
	const prof = (t) => ({
		w: .5 * Math.sqrt(Math.max(0, 1 - t * t)) + .06 * t,
		z: TUB0 + TUBH * (1 - .55 * Math.pow(t, 1.4)),
		x: NOSE * t
	});
	const side = {
		part: P_FLAT,
		slot: S_RED,
		vis: V_LEAD
	}, plate = {
		part: P_PLATE,
		slot: S_CREAM,
		vis: V_LEAD
	};
	for (let i = 0; i < rings; i++) {
		const a = prof(i / rings), b = prof((i + 1) / rings), dx = b.x - a.x, dw = a.w - b.w, dz = a.z - b.z;
		M.quad(1, [
			a.x,
			-a.w,
			TUB0
		], [
			a.x,
			-a.w,
			a.z
		], [
			b.x,
			-b.w,
			b.z
		], [
			b.x,
			-b.w,
			TUB0
		], side, norm([
			dw,
			-dx,
			0
		]));
		M.quad(1, [
			a.x,
			a.w,
			TUB0
		], [
			b.x,
			b.w,
			TUB0
		], [
			b.x,
			b.w,
			b.z
		], [
			a.x,
			a.w,
			a.z
		], side, norm([
			dw,
			dx,
			0
		]));
		M.quad(1, [
			a.x,
			-a.w,
			a.z
		], [
			a.x,
			a.w,
			a.z
		], [
			b.x,
			b.w,
			b.z
		], [
			b.x,
			-b.w,
			b.z
		], plate, norm([
			dz,
			0,
			dx
		]));
	}
	const t = prof(1);
	M.quad(1, [
		t.x,
		-t.w,
		TUB0
	], [
		t.x,
		-t.w,
		t.z
	], [
		t.x,
		t.w,
		t.z
	], [
		t.x,
		t.w,
		TUB0
	], side, [
		1,
		0,
		0
	]);
}
function headboard(M) {
	const o = {
		part: P_LINE,
		slot: S_TEAL,
		vis: V_LEAD
	}, z0 = TUB0 + TUBH, z1 = z0 + .17, lean = .11, hw = .34, nb = norm([
		-(z1 - z0),
		0,
		-.11
	]), nf = norm([
		z1 - z0,
		0,
		lean
	]);
	M.quad(1, [
		-.03,
		-.34,
		z0
	], [
		-.03,
		hw,
		z0
	], [
		-.14,
		hw,
		z1
	], [
		-.14,
		-.34,
		z1
	], o, nb);
	M.quad(1, [
		0,
		hw,
		z0
	], [
		0,
		-.34,
		z0
	], [
		-.11,
		-.34,
		z1
	], [
		-.11,
		hw,
		z1
	], o, nf);
	M.quad(1, [
		-.14,
		-.34,
		z1
	], [
		-.14,
		hw,
		z1
	], [
		-.11,
		hw,
		z1
	], [
		-.11,
		-.34,
		z1
	], o, [
		0,
		0,
		1
	]);
	for (const s of [-1, 1]) M.quad(1, [
		0,
		s * hw,
		z0
	], [
		-.11,
		s * hw,
		z1
	], [
		-.14,
		s * hw,
		z1
	], [
		-.03,
		s * hw,
		z0
	], o, [
		0,
		s,
		0
	]);
}
function tailboard(M) {
	M.slab(0, -.025, 0, 0, -.46, .46, TUB0 + .04, TUB0 + TUBH + .02, {
		part: P_TAIL,
		slot: S_CREAM,
		vis: V_TAIL
	}, "x");
	M.slab(0, -.025, 0, 0, -.46, .46, TUB0 + .04, TUB0 + TUBH + .02, {
		part: P_LINE,
		slot: S_TEAL,
		vis: V_TAIL
	}, "YyZ");
	for (const s of [-1, 1]) M.box(0, [
		-.03,
		s * .3,
		TUB0 + TUBH * .55
	], [
		.012,
		.06,
		.05
	], {
		part: P_FLAT,
		slot: S_RED,
		vis: V_TAIL
	}, "xYyZz");
}
function chassis(M, wheels) {
	M.slab(0, .02, 1, -.02, -.44, .44, .08, TUB0, {
		part: P_FLAT,
		slot: S_CHASSIS,
		vis: V_ALL
	}, "XxYyz");
	if (wheels) for (const x of [.14, .86]) for (const s of [-1, 1]) M.box(x, [
		0,
		s * .31,
		.075
	], [
		.075,
		.045,
		.075
	], {
		part: P_FLAT,
		slot: S_WHEEL,
		vis: V_ALL
	}, "XxYyz");
}
function footprint(M) {
	M.slab(0, -.12, 1, .12, -.62, .62, 0, 0, {
		part: P_FOOT,
		slot: 0,
		vis: V_ALL
	}, "Z");
}
function tub(M) {
	const outer = {
		part: P_SIDE,
		slot: S_CREAM,
		vis: V_ALL
	}, inner = {
		part: P_FLAT,
		slot: S_TEAL,
		vis: V_ALL
	}, deck = {
		part: P_FLAT,
		slot: S_DECK,
		vis: V_ALL
	}, z0 = TUB0, z1 = TUB0 + TUBH;
	for (const s of [-1, 1]) {
		const yo = s * .5, yi = s * (.5 - WALL);
		M.slab(0, WALL, 1, -WALL, Math.min(yo, yi), Math.max(yo, yi), z0, z1, outer, s > 0 ? "Y" : "y");
		M.slab(0, WALL, 1, -WALL, Math.min(yo, yi), Math.max(yo, yi), z0, z1, inner, (s > 0 ? "y" : "Y") + "Z");
	}
	M.slab(1, -WALL, 1, 0, -.5, .5, z0, z1, outer, "X");
	M.slab(1, -WALL, 1, 0, -.5, .5, z0, z1, inner, "xZ");
	M.slab(0, 0, 0, WALL, -.5, .5, z0, z1, outer, "x");
	M.slab(0, 0, 0, WALL, -.5, .5, z0, z1, inner, "XZ");
	M.slab(0, WALL, 1, -WALL, -.5 + WALL, .5 - WALL, FLOOR, FLOOR, deck, "Z");
}
function seats(M, rows, lod) {
	const seat = {
		part: P_FLAT,
		slot: S_SEAT,
		vis: V_ALL
	}, head = {
		part: P_HEAD,
		slot: S_SEAT,
		vis: V_ALL
	}, bar = {
		part: P_FLAT,
		slot: S_BAR,
		vis: V_ALL
	};
	const rs = lod === 0 ? 1.5 : lod === 1 ? 1.2 : 1, hs = lod === 0 ? 1.8 : lod === 1 ? 1.35 : 1, full = lod > 1;
	const bodyX = .05 * rs - .065, headX = Math.max(bodyX - .01, .052 * hs - .065);
	for (let i = 0; i < rows; i++) {
		const x = (i + .5) / rows;
		for (const s of [-1, 1]) {
			const y = s * .215, k = i * 2 + (s > 0 ? 1 : 0);
			M.box(x, [
				.03,
				y,
				FLOOR + .035
			], [
				.11,
				.095,
				.035
			], seat, "XxYyZ");
			M.box(x, [
				-.095,
				y,
				FLOOR + .07 + .13
			], [
				.025,
				.095,
				.13
			], seat, "XxYyZ");
			M.box(x, [
				-.095,
				y,
				FLOOR + .07 + .26 + .045
			], [
				.025,
				.075,
				.045
			], head, "XxYyZ");
			const shirt = {
				part: P_SHIRT,
				slot: k,
				vis: V_ALL
			}, face = {
				part: P_FACE,
				slot: k,
				vis: V_ALL
			}, hair = {
				part: P_HAIR,
				slot: k,
				vis: V_ALL
			}, arm = {
				part: P_ARM,
				slot: k,
				vis: V_ALL
			};
			const z0 = FLOOR + .07, hz = z0 + .2 * rs + .055 * hs + .005;
			M.box(x, [
				bodyX,
				y,
				z0 + .1 * rs
			], [
				.05 * rs,
				.07 * rs,
				.1 * rs
			], shirt, "XxYyZ");
			M.box(x, [
				headX,
				y,
				hz
			], [
				.045 * hs,
				.045 * hs,
				.055 * hs
			], face, "XxYy");
			M.box(x, [
				headX,
				y,
				hz + .055 * hs
			], [
				.052 * hs,
				.052 * hs,
				.02 * hs
			], hair, "XxYyZ");
			if (full) for (const t of [-1, 1]) M.box(x, [
				bodyX,
				y + t * .085,
				z0 + .19 + .13
			], [
				.02,
				.02,
				.13
			], arm, "XxYyZ");
		}
		if (full) M.box(x, [
			.1,
			0,
			FLOOR + .21
		], [
			.022,
			.5 - WALL,
			.022
		], bar, "XxZz");
	}
}
function buildCar(lod, rows) {
	const M = new Mesh();
	chassis(M, lod > 0);
	headboard(M);
	tailboard(M);
	nose(M, lod ? lod > 1 ? 10 : 6 : 3);
	tub(M);
	seats(M, rows, lod);
	return M.buffer();
}
function buildBulbs() {
	const d = [], zb = TUB0 + TUBH * .46;
	for (let i = 0; i < 5; i++) for (const s of [-1, 1]) d.push((i + .5) / 5, s * .53, zb, 0);
	d.push(1, 0, TUB0 + TUBH * .5, 1);
	for (const s of [-1, 1]) d.push(0, s * .3, TUB0 + TUBH * .55, 2);
	return new Float32Array(d);
}
var CAR_VS = `#version 300 es
precision highp float;
in float a_x;in vec3 a_p;in vec3 a_n;in float a_part;in float a_slot;in float a_vis;
in vec3 i_o;in vec3 i_F;in vec3 i_R;in vec3 i_U;in vec2 i_LW;in vec3 i_rgb;in float i_flag;in float i_seed;in float i_badge;
uniform mat4 u_matrix;uniform float u_unit,u_pass;uniform vec2 u_shadow;uniform vec3 u_pal[${PAL}];
out vec3 v_loc;out vec3 v_n;flat out vec3 v_rgb;flat out vec3 v_col;flat out float v_part;flat out float v_slot;flat out vec2 v_LW;flat out float v_badge;
float hash1(float n){return fract(sin(n*12.9898)*43758.5453);}
void main(){
  bool front=mod(i_flag,2.)>.5,back=mod(floor(i_flag/2.),2.)>.5,shadow=u_pass>.5;
  bool hide=(a_vis==1.&&!front)||(a_vis==2.&&front)||(a_vis==3.&&!back)||((a_part==5.)!=shadow);
  float mine=floor(i_flag/4.)-1.;   // 1인칭으로 탄 칸: 내 자리 번호(아니면 −1) — 내 자리 사람과 눈앞을 가리는 행선판은 그리지 않는다
  if(mine>-.5&&(abs(a_slot-mine)<.5&&a_part>7.5||a_part==4.&&a_vis==1.))hide=true;
  v_col=vec3(0.);
  if(a_part>7.5){   // a rider: 70–90 % of a car's seats are taken, fixed by the car's seed and the seat (nothing flickers or changes), each in their own shirt and hair; the arms only on a drop
    float seat=a_slot,occ=.7+.2*hash1(i_seed*5.3+.7),h=hash1(seat*7.31+i_seed*53.17+.5);
    if(h>occ)hide=true;
    if(a_part==9.&&i_F.z>-.22)hide=true;
    int part=int(a_part+.5);
    v_col=part==10?u_pal[${S_SKIN}]:part==11?u_pal[${S_HAIR}+int(floor(hash1(seat*3.3+i_seed*41.)*${HAIRS}.))]:u_pal[${S_SHIRT}+int(floor(hash1(seat*5.+i_seed*97.)*${SHIRTS}.))];
  }
  if(hide){gl_Position=vec4(2.,2.,2.,1.);return;}
  float L=i_LW.x,W=i_LW.y;
  vec3 loc=vec3(a_x*L+a_p.x*W,a_p.y*W,a_p.z*W);   // px in the car's frame: along, across, up
  vec3 w=i_o+(i_F*loc.x+i_R*loc.y+i_U*loc.z)*u_unit;
  if(shadow){w=i_o+(i_F*loc.x+i_R*loc.y)*u_unit;w.z=0.;w.xy+=u_shadow*u_unit;}   // on the ground under the car, offset as the sun throws it
  gl_Position=u_matrix*vec4(w,1.);
  v_loc=loc;v_n=i_F*a_n.x+i_R*a_n.y+i_U*a_n.z;v_rgb=i_rgb;v_part=a_part;v_slot=a_slot;v_LW=i_LW;v_badge=i_badge;
}`;
var CAR_FS = `#version 300 es
precision highp float;
in vec3 v_loc;in vec3 v_n;flat in vec3 v_rgb;flat in vec3 v_col;flat in float v_part;flat in float v_slot;flat in vec2 v_LW;flat in float v_badge;
uniform float u_pass,u_alpha,u_lineMix,u_headrest,u_amb,u_dif,u_riderLight;uniform vec3 u_pal[${PAL}];uniform vec3 u_light;
uniform sampler2D u_badges;uniform float u_badgeText;
out vec4 o;
float ink(float d){float a=max(.18,fwidth(d)*.65);return 1.-smoothstep(-a,a,d);}
void main(){
  float W=v_LW.y,L=v_LW.x;
  if(u_pass>.5){   // the ground shadow: the footprint, its edge softened as the trains' are
    float edge=max(abs(v_loc.y)-W*.5,max(-v_loc.x,v_loc.x-L));
    float a=(1.-smoothstep(-.4,2.4,edge))*.22*u_alpha;o=vec4(vec3(.09,.13,.16)*a,a);return;}
  int part=int(v_part+.5);vec3 col;vec2 badgeP=vec2(0.);float badgeR=0.;
  vec3 cream=u_pal[0],red=u_pal[1],gold=u_pal[2];
  vec3 skirt=mix(red,v_rgb,u_lineMix);   // zoomed out the skirt is the line's colour
  if(part==1){   // the body side: cream over the gold belt, the skirt under it (z up from the tub's floor)
    float z=v_loc.z-${TUB0}*W,H=${TUBH}*W,b0=H*.46,bh=max(.5,H*.05);
    col=cream;col=mix(col,skirt,ink(z-b0));col=mix(col,gold,ink(abs(z-b0)-bh));
  }else if(part==2){   // nose: a circular route badge, upright when viewed from the front; slope-corrected along the plate
    col=cream;badgeP=vec2(-v_loc.y,(v_loc.x-L-${NOSE * .48}*W)*1.07);badgeR=.285*W;   // mercator y points south: -R reads left-to-right from the nose
  }else if(part==3){   // tail: the opposite across-axis, upright when viewed from behind
    col=cream;badgeP=vec2(v_loc.y,${TUB0 + TUBH * .575}*W-v_loc.z);badgeR=.175*W;
  }else if(part==4)col=v_rgb;                                  // headboard, tail board edges: the line
  else if(part==6)col=u_headrest>.5?v_rgb:u_pal[4];            // headrests: the line's colour, or the seat's
  else if(part>=8)col=v_col;                                   // a rider
  else col=u_pal[int(v_slot+.5)];
  float nl=length(v_n),d=nl>1e-6?max(dot(v_n/nl,u_light),0.):0.;
  col*=part>=8?max(u_amb+u_dif*d,u_riderLight):u_amb+u_dif*d;   // riders keep a floor of light (at night their own car's festoon lights them)
  if(badgeR>0.){
    float mask=ink(length(badgeP)-badgeR);
    col=mix(col,v_rgb*max(.9,u_amb+u_dif*d),mask);   // retain route hue at night, below the white lettering
    vec2 uv=clamp(badgeP/(2.*badgeR)+.5,vec2(0.),vec2(1.));
    uv=(vec2(mod(v_badge,8.),floor(v_badge/8.))+uv)/vec2(8.,4.);
    vec4 glyph=texture(u_badges,uv)*(mask*u_badgeText);   // premultiplied white glyph with a thin dark keyline
    col=col*(1.-glyph.a)+glyph.rgb;
  }
  o=vec4(col,1.)*u_alpha;
}`;
var BULB_VS = `#version 300 es
precision highp float;
in vec4 a_b;
in vec3 i_o;in vec3 i_F;in vec3 i_R;in vec3 i_U;in vec2 i_LW;in vec3 i_rgb;in float i_flag;
uniform mat4 u_matrix;uniform float u_unit,u_size,u_core;uniform vec3 u_warm,u_red;
out vec3 v_rgb;out vec2 v_mix;
void main(){
  bool front=mod(i_flag,2.)>.5,back=mod(floor(i_flag/2.),2.)>.5;
  if(a_b.w==1.&&!front||a_b.w==2.&&!back){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}
  float L=i_LW.x,W=i_LW.y;
  vec3 loc=vec3(a_b.x*L+(a_b.w==1.?${NOSE}*W:0.),a_b.y*W,a_b.z*W);
  gl_Position=u_matrix*vec4(i_o+(i_F*loc.x+i_R*loc.y+i_U*loc.z)*u_unit,1.);
  gl_Position.z-=2.5e-4*gl_Position.w;   // a hair in front of the panel it hangs on
  gl_PointSize=u_size*(a_b.w==2.?1.15:1.);
  v_rgb=a_b.w==2.?u_red:u_warm;v_mix=vec2(u_core,.85);
}`;
var DEFAULT_STYLE = {
	bodyColors: {
		cream: "#F4E4BC",
		red: "#C94235",
		gold: "#E9AF32",
		teal: "#244D56"
	},
	seat: "#723C31",
	safetyBar: "#C5C4B2",
	chassis: "#293A3F",
	bulbColor: "#FFD27E",
	nightMinBodyLight: .55
};
var CoasterTrain = class CoasterTrain {
	static livery = "B";
	static last = null;
	static dropped = 0;
	static repaired = 0;
	constructor(style) {
		const S = {
			...DEFAULT_STYLE,
			...style || SEOUL_CITY_STYLE?.train?.coaster88 || {}
		}, C = {
			...DEFAULT_STYLE.bodyColors,
			...S.bodyColors || {}
		};
		const cream = hexRGB(C.cream), teal = hexRGB(C.teal), deck = cream.map((c, i) => c * .8 + teal[i] * .2);
		this.pal = new Float32Array(PAL * 3);
		this.pal.set([
			...cream,
			...hexRGB(C.red),
			...hexRGB(C.gold),
			...teal,
			...hexRGB(S.seat),
			...hexRGB(S.safetyBar),
			...hexRGB(S.chassis),
			...hexRGB("#1E2A2F"),
			...deck,
			...SKIN
		]);
		SHIRTS_RGB.forEach((c, i) => this.pal.set(c, (S_SHIRT + i) * 3));
		HAIR.forEach((c, i) => this.pal.set(c, (S_HAIR + i) * 3));
		this.bulb = hexRGB(S.bulbColor);
		this.minLight = S.nightMinBodyLight ?? .55;
		this.inst = new Float32Array(INST * 512);
		this.n = 0;
		this.M = /* @__PURE__ */ new Float32Array(16);
		this.flip = 0;
		this.seeds = /* @__PURE__ */ new Map();
	}
	init(gl) {
		if (this.p) return;
		this.p = compile(gl, CAR_VS, CAR_FS);
		this.pb = compile(gl, BULB_VS, BULB_FS);
		const inst = [
			"i_o",
			"i_F",
			"i_R",
			"i_U",
			"i_LW",
			"i_rgb",
			"i_flag",
			"i_seed",
			"i_badge"
		];
		this.attr = Object.fromEntries([
			"a_x",
			"a_p",
			"a_n",
			"a_part",
			"a_slot",
			"a_vis",
			...inst
		].map((n) => [n, gl.getAttribLocation(this.p, n)]));
		this.attrB = Object.fromEntries(["a_b", ...inst].map((n) => [n, gl.getAttribLocation(this.pb, n)]));
		this.uni = Object.fromEntries([
			"u_matrix",
			"u_unit",
			"u_pass",
			"u_shadow",
			"u_alpha",
			"u_lineMix",
			"u_headrest",
			"u_amb",
			"u_dif",
			"u_riderLight",
			"u_pal",
			"u_light",
			"u_badges",
			"u_badgeText"
		].map((n) => [n, gl.getUniformLocation(this.p, n)]));
		this.uniB = Object.fromEntries([
			"u_matrix",
			"u_unit",
			"u_size",
			"u_core",
			"u_warm",
			"u_red",
			"u_wt"
		].map((n) => [n, gl.getUniformLocation(this.pb, n)]));
		const oldTex = gl.getParameter(gl.TEXTURE_BINDING_2D), oldPre = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), oldFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
		this.badges = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.badges);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, routeBadgeAtlas());
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, oldPre);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, oldFlip);
		gl.bindTexture(gl.TEXTURE_2D, oldTex);
		this.meshes = /* @__PURE__ */ new Map();
		const mesh = (key, data, stride, pointers) => {
			const b = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, b);
			gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
			const va = gl.createVertexArray();
			gl.bindVertexArray(va);
			gl.bindBuffer(gl.ARRAY_BUFFER, b);
			for (const [loc, size, off] of pointers) if (loc >= 0) {
				gl.enableVertexAttribArray(loc);
				gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
			}
			gl.bindVertexArray(null);
			this.meshes.set(key, {
				b,
				va,
				n: data.length / (stride / 4)
			});
		};
		const A = this.attr, carPtrs = [
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
			],
			[
				A.a_vis,
				1,
				36
			]
		];
		for (const lod of [
			0,
			1,
			2
		]) for (const rows of [
			2,
			3,
			4
		]) mesh(lod + ":" + rows, buildCar(lod, rows), 40, carPtrs);
		{
			const F = new Mesh();
			footprint(F);
			mesh("foot", F.buffer(), 40, carPtrs);
		}
		mesh("bulbs", buildBulbs(), 16, [[
			this.attrB.a_b,
			4,
			0
		]]);
		this.ib = [gl.createBuffer(), gl.createBuffer()];
		this.cap = 0;
	}
	begin(ox, oy) {
		this.ox = ox;
		this.oy = oy;
		this.n = 0;
	}
	car(fr, L, W, rgb, front, back, key, j = 0, line = "", seat = -1) {
		if ((this.n + 1) * INST > this.inst.length) {
			const g = new Float32Array(this.inst.length * 2);
			g.set(this.inst);
			this.inst = g;
		}
		const d = this.inst, i = this.n * INST;
		for (let k = 0; k < 12; k++) if (!Number.isFinite(fr[k])) {
			CoasterTrain.dropped++;
			return;
		}
		d[i] = fr[0] - this.ox;
		d[i + 1] = fr[1] - this.oy;
		d[i + 2] = fr[2];
		for (let k = 0; k < 9; k++) d[i + 3 + k] = fr[3 + k];
		if (Math.hypot(fr[9], fr[10], fr[11]) < .5) {
			const F = [
				fr[3],
				fr[4],
				fr[5]
			];
			let R = [
				-F[1],
				F[0],
				0
			], l = Math.hypot(R[0], R[1]);
			if (l < 1e-6) {
				R = [
					1,
					0,
					0
				];
				l = 1;
			}
			R = [
				R[0] / l,
				R[1] / l,
				0
			];
			const U = [
				F[1] * R[2] - F[2] * R[1],
				F[2] * R[0] - F[0] * R[2],
				F[0] * R[1] - F[1] * R[0]
			];
			d[i + 6] = R[0];
			d[i + 7] = R[1];
			d[i + 8] = R[2];
			d[i + 9] = U[0];
			d[i + 10] = U[1];
			d[i + 11] = U[2];
			CoasterTrain.repaired++;
		}
		d[i + 12] = L;
		d[i + 13] = W;
		d[i + 14] = rgb[0];
		d[i + 15] = rgb[1];
		d[i + 16] = rgb[2];
		d[i + 17] = (front ? 1 : 0) + (back ? 2 : 0) + 4 * (seat + 1);
		let s = this.seeds.get(key);
		if (s == null) {
			s = fnv1a(String(key)) / 4294967296;
			if (this.seeds.size > 4096) this.seeds.clear();
			this.seeds.set(key, s);
		}
		d[i + 18] = (s + j * .6180339887) % 1;
		d[i + 19] = routeBadgeId(line);
		this.n++;
	}
	instancePointers(gl, A) {
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip]);
		for (const [n, size, off] of [
			[
				"i_o",
				3,
				0
			],
			[
				"i_F",
				3,
				12
			],
			[
				"i_R",
				3,
				24
			],
			[
				"i_U",
				3,
				36
			],
			[
				"i_LW",
				2,
				48
			],
			[
				"i_rgb",
				3,
				56
			],
			[
				"i_flag",
				1,
				68
			],
			[
				"i_seed",
				1,
				72
			],
			[
				"i_badge",
				1,
				76
			]
		]) {
			const loc = A[n];
			if (loc < 0) continue;
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, INST * 4, off);
			gl.vertexAttribDivisor(loc, 1);
		}
	}
	draw(gl, M, ox, oy, o) {
		if (!this.n || !this.p) return;
		const MT = this.M;
		MT.set(M);
		for (let r = 0; r < 4; r++) MT[12 + r] = M[r] * ox + M[4 + r] * oy + M[12 + r];
		this.flip ^= 1;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip]);
		if (this.cap < this.inst.length) {
			gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
			this.cap = this.inst.length;
			gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip ^ 1]);
			gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip]);
		}
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, this.n * INST);
		const W = this.inst[13], L = this.inst[12], lod = o.lod ?? (W < LOD_MID ? 0 : W < LOD_HI ? 1 : 2), rows = Math.max(2, Math.min(4, Math.round(L / W * 1.3)));
		const m = this.meshes.get(lod + ":" + rows), livery = CoasterTrain.livery;
		CoasterTrain.last = {
			n: this.n,
			lod,
			rows,
			W,
			L,
			zoom: o.zoom,
			badgeText: o.zoom >= 16.5,
			dropped: CoasterTrain.dropped,
			repaired: CoasterTrain.repaired
		};
		const z = o.zoom, lineMix = livery === "C" ? 1 - Math.min(1, Math.max(0, (z - LINE_MIX[0]) / (LINE_MIX[1] - LINE_MIX[0]))) : 0;
		gl.useProgram(this.p);
		gl.bindVertexArray(m.va);
		this.instancePointers(gl, this.attr);
		const U = this.uni;
		gl.uniformMatrix4fv(U.u_matrix, false, MT);
		gl.uniform1f(U.u_unit, o.unit);
		gl.uniform2f(U.u_shadow, o.shadow[0], o.shadow[1]);
		gl.uniform1f(U.u_lineMix, lineMix * lineMix * (3 - 2 * lineMix));
		gl.uniform1f(U.u_headrest, livery === "A" ? 0 : 1);
		gl.uniform1f(U.u_amb, o.dark ? Math.max(this.minLight, .62) : .64);
		gl.uniform1f(U.u_dif, o.dark ? .26 : .36);
		gl.uniform1f(U.u_riderLight, o.dark ? .85 : .78);
		gl.uniform3fv(U.u_pal, this.pal);
		gl.uniform3fv(U.u_light, SUN);
		const oldActive = gl.getParameter(gl.ACTIVE_TEXTURE);
		gl.activeTexture(gl.TEXTURE0);
		const oldTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
		gl.bindTexture(gl.TEXTURE_2D, this.badges);
		gl.uniform1i(U.u_badges, 0);
		gl.uniform1f(U.u_badgeText, o.zoom >= 16.5 ? 1 : 0);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.DEPTH_TEST);
		const pass = (mesh, p, alpha) => {
			gl.uniform1f(U.u_pass, p);
			gl.uniform1f(U.u_alpha, alpha);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.n, this.n);
		};
		gl.depthMask(false);
		if (o.walls && o.occlude && o.part !== "body") {
			gl.depthFunc(gl.GREATER);
			pass(m, 0, o.occlude);
		}
		gl.depthFunc(gl.LEQUAL);
		const foot = this.meshes.get("foot");
		if (o.part !== "body") {
			gl.bindVertexArray(foot.va);
			this.instancePointers(gl, this.attr);
			pass(foot, 1, 1);
		}
		if (o.part === "foot") {
			gl.bindVertexArray(null);
			gl.bindTexture(gl.TEXTURE_2D, oldTex);
			gl.activeTexture(oldActive);
			return;
		}
		gl.bindVertexArray(m.va);
		this.instancePointers(gl, this.attr);
		gl.depthMask(true);
		pass(m, 0, 1);
		gl.depthMask(false);
		gl.bindVertexArray(null);
		gl.bindTexture(gl.TEXTURE_2D, oldTex);
		gl.activeTexture(oldActive);
		if (o.dark && (W >= LOD_MID || lod)) {
			const b = this.meshes.get("bulbs"), s = bulbSize(z, o.pixelRatio || 1, .5), UB = this.uniB;
			gl.useProgram(this.pb);
			gl.bindVertexArray(b.va);
			this.instancePointers(gl, this.attrB);
			lightsOn(gl);
			gl.uniformMatrix4fv(UB.u_matrix, false, MT);
			gl.uniform1f(UB.u_unit, o.unit);
			gl.uniform1f(UB.u_size, s.point);
			gl.uniform1f(UB.u_core, s.coreFrac);
			gl.uniform3fv(UB.u_warm, this.bulb);
			gl.uniform3f(UB.u_red, 1, .32, .22);
			gl.uniform2f(UB.u_wt, 1, .55);
			gl.drawArraysInstanced(gl.POINTS, 0, b.n, this.n);
			gl.bindVertexArray(null);
			lightsOff(gl);
			gl.depthMask(false);
		}
		gl.depthFunc(gl.LEQUAL);
	}
	dispose(gl) {
		if (!this.p) return;
		for (const m of this.meshes.values()) {
			gl.deleteBuffer(m.b);
			gl.deleteVertexArray(m.va);
		}
		for (const b of this.ib) gl.deleteBuffer(b);
		gl.deleteTexture(this.badges);
		this.badges = null;
		gl.deleteProgram(this.p);
		gl.deleteProgram(this.pb);
		this.p = null;
	}
};
export { CoasterTrain, CoasterTrain as default };
