import { placeholderText, signAnchor, sortLines } from "../lib/station_signs.mjs";
// web/map/labels.mts
function createStationLabels({ map, stations, stationRects, colors, getSelected }) {
	let labels = [], frame = 0;
	function updateLabelVisibility() {
		frame = 0;
		map.triggerRepaint();
	}
	const schedule = () => {
		if (!frame) frame = requestAnimationFrame(updateLabelVisibility);
	};
	function rebuild() {
		const selected = getSelected();
		labels = [];
		const visible = stations.filter((s) => selected === "all" || s.lines.some((x) => x.name === selected)).sort((a, b) => b.lines.length - a.lines.length);
		for (const s of visible) {
			const line = selected !== "all" && s.lines.some((x) => x.name === selected) ? selected : s.lines[0].name;
			labels.push({
				station: s,
				line,
				text: s.name
			});
		}
		const src = map.getSource("station-labels");
		if (src) src.setData({
			type: "FeatureCollection",
			features: labels.flatMap(({ station: s, text }) => {
				const shown = s.lines.filter((x) => selected === "all" || x.name === selected);
				const c = signAnchor(shown.map((x) => stationRects.get(`${x.name}:${s.id}`)).filter(Boolean).map((r) => r.coords));
				if (!c) return [];
				const names = sortLines(shown.map((x) => x.name));
				return [{
					type: "Feature",
					properties: {
						text,
						rank: -s.lines.length,
						ln: names.join("|"),
						lc: names.map((n) => colors[n] || "#52646a").join("|"),
						ph: placeholderText(names, text)
					},
					geometry: {
						type: "Point",
						coordinates: c
					}
				}];
			})
		});
		schedule();
	}
	return {
		rebuild,
		schedule,
		get list() {
			return labels;
		}
	};
}
export { createStationLabels };
