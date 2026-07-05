import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LookControls } from "../web/components/look-controls.tsx";

test("LookControls renders consolidated look controls in config", () => {
  const html = renderToStaticMarkup(
    <LookControls
      atSec={12.5}
      color={null}
      filter="dramatic"
      motionSpeed={1.4}
      onColor={() => undefined}
      onFilter={() => undefined}
      onMotionSpeed={() => undefined}
      onVignette={() => undefined}
      slug="demo"
      vignetteOn
    />
  );
  assert.match(html, /data-look-section/);
  assert.match(html, /Filter/);
  assert.match(html, /Vignette/);
  assert.match(html, /Motion/);
  assert.match(html, /Temp \/ tint/);
});
