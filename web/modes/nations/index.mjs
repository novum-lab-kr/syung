import { SEOUL_KEEP } from "../starcraft/style.mjs";
import { GREECE_DELTA } from "./greece.mjs";
import { NETHERLANDS_DELTA } from "./netherlands.mjs";
import { PARIS_DELTA } from "./paris.mjs";
import { EGYPT_DELTA } from "./egypt.mjs";
// web/modes/nations/index.mjs
var withModels = (pack, kind) => ({
	...pack,
	race: {
		kind,
		keep: SEOUL_KEEP
	}
});
var GREECE = {
	id: "greece",
	from: "simcity",
	label: "그리스",
	settings: { city: { pack: withModels(GREECE_DELTA, "greece") } }
};
var NETHERLANDS = {
	id: "netherlands",
	from: "simcity",
	label: "네덜란드",
	settings: { city: { pack: withModels(NETHERLANDS_DELTA, "netherlands") } }
};
var PARIS = {
	id: "paris",
	from: "simcity",
	label: "파리",
	settings: { city: { pack: withModels(PARIS_DELTA, "paris") } }
};
var EGYPT = {
	id: "egypt",
	from: "simcity",
	label: "이집트",
	settings: { city: { pack: withModels(EGYPT_DELTA, "egypt") } }
};
var nations_default = [
	GREECE,
	NETHERLANDS,
	PARIS,
	EGYPT
];
export { EGYPT, GREECE, NETHERLANDS, PARIS, nations_default as default };
