import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphicSectionControls } from "../web/components/graphic-picker-controls.tsx";

const noop = () => {
  // presentational test: callbacks are not exercised
};

function renderControls(): string {
  return renderToStaticMarkup(
    <GraphicSectionControls
      assets={[]}
      beatCount={4}
      chosenTemplateId=""
      durationSec={30}
      onAdd={noop}
      onBeatCountChange={noop}
      onChooseMusicAsset={noop}
      onChooseTemplate={noop}
      onParamChange={noop}
      onSpanModeChange={noop}
      paramDraft={{}}
      slug="demo"
      spanMode="seconds"
      templates={[]}
    />
  );
}

test("upload-template wrapper radius stays concentric with the inner compact input", () => {
  const html = renderControls();
  const marker = "Upload project-local template";
  const markerIdx = html.indexOf(marker);
  assert.ok(markerIdx >= 0, "missing upload template section in markup");
  // The wrapper div opens before the marker text; walk back to the nearest <div.
  const wrapperStart = html.lastIndexOf("<div", markerIdx);
  const wrapperEnd = html.indexOf(">", wrapperStart);
  const wrapperTag = html.slice(wrapperStart, wrapperEnd + 1);
  // Inner Input uses CONFIG_COMPACT_INPUT_CLASS: rounded-md! (8px), inset by
  // the wrapper's p-2 (8px) padding. Concentric outer radius = 8 + 8 = 16px,
  // closest scale step is rounded-2xl (18px).
  assert.match(wrapperTag, /rounded-2xl/);
  assert.ok(
    !wrapperTag.includes("rounded-md "),
    "outer wrapper should no longer carry the mismatched rounded-md"
  );
  assert.match(html, /rounded-md!/);
});
