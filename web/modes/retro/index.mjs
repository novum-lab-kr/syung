import { RETRO_DELTA } from "./style.mjs";
// web/modes/retro/index.mjs
var retro_default = {
	id: "retro",
	from: "simcity",
	label: "레트로",
	settings: {
		map: {
			pixel: { enabled: true },
			fov: 12
		},
		city: { pack: RETRO_DELTA }
	}
};
export { retro_default as default };
