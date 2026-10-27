function catchup(gap, v0 = 0, vmax = 10, a = 1) {
	gap = Math.max(0, gap);
	v0 = Math.max(0, Math.min(vmax, v0));
	if (gap <= 0) return {
		gap: 0,
		v0: 0,
		vp: 0,
		a1: a,
		a3: a,
		t1: 0,
		t2: 0,
		t3: 0,
		T: 0
	};
	if (v0 * v0 / (2 * a) >= gap) {
		const a3 = v0 * v0 / (2 * gap);
		return {
			gap,
			v0,
			vp: v0,
			a1: a,
			a3,
			t1: 0,
			t2: 0,
			t3: v0 / a3,
			T: v0 / a3
		};
	}
	const vp = Math.min(vmax, Math.sqrt((2 * a * gap + v0 * v0) / 2)), t1 = (vp - v0) / a, t3 = vp / a, d13 = (vp * vp - v0 * v0) / (2 * a) + vp * vp / (2 * a), t2 = Math.max(0, (gap - d13) / vp);
	return {
		gap,
		v0,
		vp,
		a1: a,
		a3: a,
		t1,
		t2,
		t3,
		T: t1 + t2 + t3
	};
}
function catchupAt(c, t) {
	if (t >= c.T) return {
		left: 0,
		v: 0,
		done: true
	};
	t = Math.max(0, t);
	let s, v;
	if (t < c.t1) {
		v = c.v0 + c.a1 * t;
		s = (c.v0 + v) / 2 * t;
	} else if (t < c.t1 + c.t2) {
		v = c.vp;
		s = (c.v0 + c.vp) / 2 * c.t1 + c.vp * (t - c.t1);
	} else {
		const u = t - c.t1 - c.t2;
		v = Math.max(0, c.vp - c.a3 * u);
		s = (c.v0 + c.vp) / 2 * c.t1 + c.vp * c.t2 + (c.vp + v) / 2 * u;
	}
	return {
		left: Math.max(0, c.gap - s),
		v,
		done: false
	};
}
export { catchup, catchupAt };
