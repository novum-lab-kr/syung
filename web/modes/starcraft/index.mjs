import { PROTOSS_DELTA, TERRAN_DELTA, ZERG_DELTA } from "./style.mjs";
// web/modes/starcraft/index.mts
var TERRAN = {
	id: "terran",
	from: "simcity",
	label: "테란",
	settings: {
		city: {
			pack: TERRAN_DELTA,
			life: { units: {
				people: [
					"marine",
					"marine",
					"firebat",
					"medic",
					"ghost"
				],
				cars: ["vulture", "goliath"]
			} }
		},
		trains: {
			look: "units",
			units: {
				lead: "dropship",
				rest: "dropship"
			}
		},
		buses: { look: "siegeTank" },
		sky: { units: [
			"wraith",
			"wraith",
			"battlecruiser",
			"scienceVessel",
			"valkyrie"
		] },
		me: { look: "scv" }
	}
};
var ZERG = {
	id: "zerg",
	from: "simcity",
	label: "저그",
	settings: {
		city: {
			pack: ZERG_DELTA,
			groundTexture: true,
			life: { units: {
				people: [
					"zergling",
					"zergling",
					"hydralisk"
				],
				cars: ["lurker", "defiler"]
			} }
		},
		trains: {
			look: "units",
			units: {
				lead: "overlord",
				rest: "overlord"
			}
		},
		buses: { look: "ultralisk" },
		sky: { units: [
			"mutalisk",
			"mutalisk",
			"guardian",
			"scourge",
			"devourer"
		] },
		me: { look: "drone" }
	}
};
var PROTOSS = {
	id: "protoss",
	from: "simcity",
	label: "프로토스",
	settings: {
		city: {
			pack: PROTOSS_DELTA,
			life: { units: {
				people: [
					"zealot",
					"zealot",
					"highTemplar",
					"darkTemplar"
				],
				cars: ["dragoon", "archon"]
			} }
		},
		trains: {
			look: "units",
			units: {
				lead: "shuttle",
				rest: "shuttle"
			}
		},
		buses: { look: "reaver" },
		sky: { units: [
			"scout",
			"carrier",
			"corsair",
			"corsair",
			"arbiter"
		] },
		me: { look: "probe" }
	}
};
var starcraft_default = [
	TERRAN,
	ZERG,
	PROTOSS
];
export { PROTOSS, TERRAN, ZERG, starcraft_default as default };
