var cellOf = (x, y) => `${Math.floor(x / 150)},${Math.floor(y / 150)}`;
function splitPoints(at, lists) {
	const cells = /* @__PURE__ */ new Map();
	lists.forEach((points, kind) => {
		for (let i = 0; i < points.length; i += 2) {
			const wx = at[0] + points[i] / 10, wy = at[1] - points[i + 1] / 10, key = cellOf(wx, wy);
			let cell = cells.get(key);
			if (!cell) {
				cell = {
					rect: [
						Infinity,
						-Infinity,
						Infinity,
						-Infinity
					],
					items: lists.map(() => [])
				};
				cells.set(key, cell);
			}
			cell.items[kind].push(points[i], points[i + 1]);
			const r = cell.rect;
			r[0] = Math.min(r[0], wx - 3);
			r[1] = Math.max(r[1], wx + 3);
			r[2] = Math.min(r[2], wy - 3);
			r[3] = Math.max(r[3], wy + 3);
		}
	});
	return [...cells.values()];
}
function splitTriangles(data, stride, world) {
	const groups = /* @__PURE__ */ new Map();
	for (let i = 0; i < data.length; i += stride * 3) {
		const a = world(i), b = world(i + stride), c = world(i + stride * 2), key = cellOf((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);
		let group = groups.get(key);
		if (!group) {
			group = {
				floats: [],
				rect: [
					Infinity,
					-Infinity,
					Infinity,
					-Infinity
				]
			};
			groups.set(key, group);
		}
		for (let k = 0; k < stride * 3; k++) group.floats.push(data[i + k]);
		for (const [x, y] of [
			a,
			b,
			c
		]) {
			const r = group.rect;
			r[0] = Math.min(r[0], x);
			r[1] = Math.max(r[1], x);
			r[2] = Math.min(r[2], y);
			r[3] = Math.max(r[3], y);
		}
	}
	return [...groups.values()].map((group) => ({
		rect: group.rect,
		items: new Float32Array(group.floats)
	}));
}
export { splitPoints, splitTriangles };
