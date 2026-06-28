// Browser entry bundled by src/headless-render.ts and injected into the headless
// Chrome page. It exposes the SAME web/lib/graphic-runtime.ts functions that the
// live preview uses, on window.__okGraphic, so a rich graphic's export is
// frame-identical to its preview. NOT imported by the app/server bundle.
import {
  applyGraphicFrame,
  applyGraphicParams,
} from "../web/lib/graphic-runtime.ts";

(window as unknown as { __okGraphic: unknown }).__okGraphic = {
  applyGraphicFrame,
  applyGraphicParams,
};
