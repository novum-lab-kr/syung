import { render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { StationSheet } from "../components/station_sheet.mjs";
// web/ui/station_sheet.tsx
var drawStationSheet = (body, props) => K(/* @__PURE__ */ a(StationSheet, { ...props }), body);
var clearPanel = (body) => K(null, body);
export { clearPanel, drawStationSheet };
