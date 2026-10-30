import { render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { TrainSheet } from "../components/train_sheet.mjs";
// web/ui/train_sheet.tsx
var drawTrainSheet = (body, props) => K(/* @__PURE__ */ a(TrainSheet, { ...props }), body);
export { drawTrainSheet };
