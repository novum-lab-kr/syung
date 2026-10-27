import { UNIT_SHAPES } from "./unit_shapes.mjs";
import "./units.mjs";
import { UnitConvoy } from "./convoy.mjs";
// web/modes/starcraft/sky_units.mjs
var SKY_MIN_PX = 26;
var SkyUnits = class SkyUnits {
	constructor({ random = Math.random } = {}) {
		this.flights = [];
		this.next = 0;
		this.seq = 0;
		this.random = random;
		this.r = new UnitConvoy();
	}
	spawn(now, sky, view, mpm) {
		const keys = (sky.units || []).filter((k) => UNIT_SHAPES[k]);
		if (!keys.length) return;
		const R = this.random, cx = (view[0] + view[2]) / 2, cy = (view[1] + view[3]) / 2, rad = Math.hypot(view[2] - view[0], view[3] - view[1]) * .75;
		const a = R() * 2 * Math.PI, sx = cx + Math.cos(a) * rad, sy = cy + Math.sin(a) * rad;
		const tx = cx + (R() - .5) * rad * .6, ty = cy + (R() - .5) * rad * .6, dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
		const speed = (sky.speedMps ?? 45) * (.75 + R() * .5) * mpm, len = rad * 2.2;
		this.flights.push({
			key: keys[Math.floor(R() * keys.length)],
			x: sx,
			y: sy,
			fx: dx / d,
			fy: dy / d,
			v: speed,
			t0: now,
			dur: len / speed,
			alt: (sky.altM ?? 90) * (.8 + R() * .5),
			id: ++this.seq
		});
	}
	frame(gl, M, ox, oy, { sky, now, view, mpm, unit, dark = false }) {
		const t = now / 1e3;
		this.flights = this.flights.filter((f) => t - f.t0 < f.dur && sky.units.includes(f.key));
		if (!this.next) this.next = t + (sky.firstS ?? 3);
		if (t >= this.next) {
			if (this.flights.length < (sky.maxN ?? 3)) this.spawn(t, sky, view, mpm);
			this.next = t + (sky.everyS ?? 12) * (.5 + this.random());
		}
		if (!this.flights.length) {
			SkyUnits.last = {
				n: 0,
				at: []
			};
			return 0;
		}
		this.r.init(gl);
		this.r.begin(ox, oy);
		for (const f of this.flights) {
			const s = (t - f.t0) * f.v, x = f.x + f.fx * s, y = f.y + f.fy * s, shape = UNIT_SHAPES[f.key];
			const W = Math.max((sky.sizeM ?? 28) * mpm / unit, 26), L = W * shape.len;
			const ox2 = x - f.fx * L / 2 * unit, oy2 = y - f.fy * L / 2 * unit;
			this.r.unit([
				ox2,
				oy2,
				f.alt * mpm,
				f.fx,
				f.fy,
				0,
				-f.fy,
				f.fx,
				0,
				0,
				0,
				1
			], L, W, f.key, [
				.5,
				.5,
				.5
			], true, "sky" + f.id);
		}
		const keep = UnitConvoy.last;
		this.r.draw(gl, M, ox, oy, {
			unit,
			dark,
			time: t
		});
		UnitConvoy.last = keep;
		SkyUnits.last = {
			n: this.flights.length,
			at: this.flights.map((f) => [
				f.key,
				f.x + f.fx * (t - f.t0) * f.v,
				f.y + f.fy * (t - f.t0) * f.v
			])
		};
		return this.flights.length;
	}
	dispose(gl) {
		this.r.dispose(gl);
		this.flights = [];
		this.next = 0;
		SkyUnits.last = null;
	}
};
SkyUnits.last = null;
export { SKY_MIN_PX, SkyUnits, SkyUnits as default };
