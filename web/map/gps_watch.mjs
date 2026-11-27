// web/map/gps_watch.mts
function ownGpsWatch(control, geolocation, normal, low) {
	let lowPower = false;
	const rewatch = () => {
		const id = control._geolocationWatchID;
		if (id === void 0) return;
		const geo = geolocation();
		geo.clearWatch(id);
		control._geolocationWatchID = geo.watchPosition(control._onSuccess, control._onError, lowPower ? low : normal);
	};
	const trigger = control.trigger.bind(control);
	control.trigger = () => {
		const before = control._geolocationWatchID, result = trigger();
		if (control._geolocationWatchID !== void 0 && control._geolocationWatchID !== before) rewatch();
		return result;
	};
	return { lowPower(on) {
		if (on === lowPower) return;
		lowPower = on;
		rewatch();
	} };
}
export { ownGpsWatch };
