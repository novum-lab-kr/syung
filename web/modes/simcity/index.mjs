// web/modes/simcity/index.mts
var simcity_default = {
	id: "simcity",
	from: "basic",
	label: "심시티",
	settings: {
		map: { paletteKind: "city" },
		city: {
			enabled: true,
			xray: true
		},
		track: { kind: "viaduct" },
		trains: { body: "slim" },
		me: { look: "builder" }
	}
};
export { simcity_default as default };
