var MAT = {
	TOP: 0,
	SIDE: 1,
	UNDER: 2,
	PARAPET: 3,
	PIER: 4,
	BED: 5,
	RAIL: 6,
	FLOOR: 7,
	ROOF: 8,
	ROOF_UNDER: 9,
	POST: 10,
	FASCIA: 11,
	STAIR: 12,
	STAIR_WALL: 13,
	WALK: 14,
	WALK_WALL: 15
};
var COLOR_KEYS = [
	"concrete",
	"concrete",
	"under",
	"concrete",
	"pier",
	"bed",
	"rail",
	"platform",
	"roof",
	"roofUnder",
	"post",
	"concrete",
	"stair",
	"stairWall",
	"walk",
	"walkWall"
];
var Mesh = class {
	constructor(n) {
		this.d = new Float32Array(Math.max(21, n * 21));
		this.o = 0;
	}
	v(r, h, px, kl, kb, apx, lm, am, szl, sza, lp, ap, mat, shade, n) {
		if (this.o + 21 > this.d.length) {
			const g = new Float32Array(this.d.length * 2);
			g.set(this.d);
			this.d = g;
		}
		const d = this.d, o = this.o;
		this.o += 21;
		d[o] = r.x;
		d[o + 1] = r.y;
		d[o + 2] = h;
		d[o + 3] = r.rx;
		d[o + 4] = r.ry;
		d[o + 5] = r.fx;
		d[o + 6] = r.fy;
		d[o + 7] = px;
		d[o + 8] = apx;
		d[o + 9] = kl;
		d[o + 10] = kb;
		d[o + 11] = lm;
		d[o + 12] = am;
		d[o + 13] = szl;
		d[o + 14] = sza;
		d[o + 15] = lp;
		d[o + 16] = ap;
		d[o + 17] = mat;
		d[o + 18] = shade;
		d[o + 19] = n;
		d[o + 20] = r.s || 0;
	}
	quad(a, b, c, d) {
		for (const q of [
			a,
			b,
			c,
			a,
			c,
			d
		]) this.v(...q);
	}
	data() {
		return this.d.subarray(0, this.o);
	}
};
export { COLOR_KEYS, MAT, Mesh };
