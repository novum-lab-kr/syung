// web/lib/server_url.mts
var APP_SERVER_ORIGIN = "https://map.syung.novum-lab.com";
function appMapMode() {
	return globalThis.document?.documentElement?.dataset.app === "map";
}
function serverUrl(path, app = appMapMode()) {
	if (!app || /^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
	return `${APP_SERVER_ORIGIN}/${path.replace(/^\.?\//, "")}`;
}
export { APP_SERVER_ORIGIN, appMapMode, serverUrl };
