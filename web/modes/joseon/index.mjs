import { JOSEON_DELTA } from "./style.mjs";
// web/modes/joseon/index.mts
var joseon_default = {
	id: "joseon",
	from: "simcity",
	label: "조선",
	settings: {
		city: {
			pack: JOSEON_DELTA,
			groundTexture: true,
			life: {
				cars: false,
				crossings: false
			},
			landmarks: "wood-tower"
		},
		map: { exitLook: "jangseung" },
		trains: { look: "fleet" },
		me: { look: "seonbi" },
		buses: { look: "palanquin" },
		sun: { lowHouseM: 5 }
	}
};
export { joseon_default as default };
