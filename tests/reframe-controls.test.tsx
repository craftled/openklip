import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReframeControls } from "../web/components/reframe-controls.tsx";

test("ReframeControls renders focus and zoom sliders", () => {
  const html = renderToStaticMarkup(
    <ReframeControls
      exportSettings={{
        aspect: "9:16",
        crop: { focusX: 0.5, focusY: 0.5, scale: 1 },
      }}
      onPatchExport={() => undefined}
    />
  );
  assert.match(html, /Focus X/);
  assert.match(html, /Focus Y/);
  assert.match(html, /Zoom/);
  assert.match(html, /data-reframe-section/);
});
