import { __vitePreload } from "../_virtual/_vite/preload-helper.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { useEffect as A, useRef as T } from "../npm/preact/hooks/dist/hooks.mjs";
// web/components/ride_arrival.tsx
function useAnchor(map, at) {
	const anchor = T(null);
	A(() => {
		const place = () => {
			const node = anchor.current;
			if (!node) return;
			const point = map.project([at[0], at[1]]), box = map.getContainer().getBoundingClientRect();
			node.style.transform = `translate(${Math.round(box.left + point.x)}px,${Math.round(box.top + point.y)}px)`;
		};
		place();
		map.on("move", place);
		map.on("resize", place);
		return () => {
			map.off("move", place);
			map.off("resize", place);
		};
	}, [
		map,
		at[0],
		at[1]
	]);
	return anchor;
}
function useMotion(name, onError) {
	const box = T(null);
	A(() => {
		let stop = null, gone = false;
		__vitePreload(() => import("../lib/arrival_motion.mjs").then((motion) => {
			if (!gone && box.current) stop = motion.playArrival(box.current, name, onError);
		}), [], import.meta.url).catch(() => {
			if (!gone) onError?.();
		});
		return () => {
			gone = true;
			stop?.();
		};
	}, [name, onError]);
	return box;
}
function useTapClose(map, onClose) {
	A(() => {
		const box = map.getContainer();
		const tap = () => onClose();
		const key = (event) => {
			if (event.key === "Escape") onClose();
		};
		box.addEventListener("pointerdown", tap, true);
		document.addEventListener("keydown", key);
		return () => {
			box.removeEventListener("pointerdown", tap, true);
			document.removeEventListener("keydown", key);
		};
	}, [map, onClose]);
}
function MapArrival({ map, at, arrival, onClose, onError, hideMe }) {
	const anchor = useAnchor(map, at), box = useMotion("char-ride", onError);
	A(() => {
		hideMe?.(true);
		return () => hideMe?.(false);
	}, [hideMe]);
	useTapClose(map, onClose);
	return /* @__PURE__ */ a("div", {
		ref: anchor,
		class: "ra ram rac",
		role: "status",
		"aria-live": "polite",
		"aria-label": `${arrival.to} 슝 도착 · ${arrival.time} 도착 · ${arrival.took}분 걸렸어요 · 지도를 누르면 길찾기를 끝내요`,
		children: [/* @__PURE__ */ a("span", {
			ref: box,
			class: "ral-scene rac-scene rac-ride",
			"aria-hidden": "true"
		}), /* @__PURE__ */ a("span", {
			class: "rac-say",
			"aria-hidden": "true",
			children: "도착!"
		})]
	});
}
function GoalFlag({ map, at }) {
	const anchor = useAnchor(map, at), box = useMotion("flag");
	return /* @__PURE__ */ a("div", {
		ref: anchor,
		class: "rag",
		"aria-hidden": "true",
		children: /* @__PURE__ */ a("span", {
			ref: box,
			class: "ral-scene rag-flag"
		})
	});
}
export { GoalFlag, MapArrival };
