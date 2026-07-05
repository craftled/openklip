import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LookTabPanel } from "../web/components/config/look-tab-panel.tsx";

const reframe = {
  applying: false,
  applyingVision: false,
  exportSettings: {
    aspect: "16:9" as const,
    crop: { focusX: 0.5, focusY: 0.5, scale: 1 },
    cropMode: "manual" as const,
    layout: "fill" as const,
  },
  hasSceneLog: false,
  onPatchExport: () => undefined,
  onRunVisionFocus: () => undefined,
  visionFocusAvailable: false,
};

test("LookTabPanel renders flat look groups without timing accordion", () => {
  const html = renderToStaticMarkup(
    <LookTabPanel
      atSec={4}
      captionStyle="boxed"
      color={null}
      filter="neutral"
      maxWords={6}
      motionSpeed={1}
      onCaptionStyle={() => undefined}
      onColor={() => undefined}
      onFilter={() => undefined}
      onMaxWords={() => undefined}
      onMotionSpeed={() => undefined}
      onPadMs={() => undefined}
      onVignette={() => undefined}
      padMs={50}
      reframe={reframe}
      slug="demo"
      vignetteOn={false}
    />
  );
  assert.match(html, /data-look-tab/);
  assert.match(html, /data-look-section/);
  assert.match(html, /data-look-tab-group="captions"/);
  assert.match(html, /data-look-tab-group="frame"/);
  assert.match(html, /Per line/);
  assert.match(html, /Cut pad/);
  assert.doesNotMatch(html, /Timing/);
  assert.doesNotMatch(html, /Reframe/);
});
