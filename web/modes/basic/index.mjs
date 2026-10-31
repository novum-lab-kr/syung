import { PARK_DEFAULTS } from "./park.mjs";
import { SEOUL_CITY_STYLE } from "./city.mjs";
import { MAP_COLORS, MAP_THEMES, PARK_COLORS } from "./palette.mjs";
// web/modes/basic/index.mts
var basic_default = {
	id: "basic",
	label: "기본",
	settings: {
		themeChoice: "auto",
		mapColor: "calm",
		map: {
			themes: MAP_THEMES,
			colors: MAP_COLORS,
			park: PARK_COLORS,
			paletteKind: "base",
			verticalGradient: true,
			exitLook: "pillar",
			pixel: {
				enabled: false,
				size: 1.5,
				palette: "endesga32",
				outline: true
			},
			fov: null
		},
		city: {
			enabled: false,
			heritage: false,
			groundTexture: false,
			xray: false,
			tone: "simcity",
			lampPool: 1.4,
			life: {
				cars: true,
				crossings: true,
				units: null
			},
			landmarks: "tower",
			pack: SEOUL_CITY_STYLE
		},
		park: {
			enabled: false,
			towerM: 150,
			style: PARK_DEFAULTS,
			landmarkRides: []
		},
		track: {
			kind: "ground",
			platform: "ribbon"
		},
		trains: {
			look: "commuter",
			body: "wide",
			predictStops: 3,
			timeWarp: false,
			units: {
				lead: "siegeTank",
				rest: "siegeTank"
			}
		},
		buses: { look: "bus" },
		me: { look: "sprout" },
		sky: {
			units: [],
			everyS: 12,
			maxN: 3,
			altM: 90,
			sizeM: 28,
			speedMps: 45
		},
		sun: {
			light: "map",
			lowHouseM: null
		}
	}
};
export { basic_default as default };
