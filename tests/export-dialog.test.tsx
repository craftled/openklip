import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportOptionsForm } from "../web/components/export-options-form.tsx";

// The full ExportDialog only mounts its content in a portal when opened, so the
// options form is extracted into a presentational component (the
// empty-workspace-main.tsx precedent) and rendered statically here.
function renderForm(
  overrides: Partial<Parameters<typeof ExportOptionsForm>[0]> = {}
): string {
  return renderToStaticMarkup(
    <ExportOptionsForm
      compression="social"
      destination="file"
      dims={{ width: 1280, height: 720 }}
      frameRate="source"
      onCompressionChange={() => undefined}
      onFrameRateChange={() => undefined}
      onResolutionChange={() => undefined}
      resolution="4k"
      sourceFps={30}
      {...overrides}
    />
  );
}

// The attribute segment of the <button> whose children start with `label`.
function buttonAttrs(html: string, label: string): string {
  const chunk = html
    .split("<button")
    .find((piece) => piece.includes(`>${label}<`));
  assert.ok(chunk, `no button rendering "${label}"`);
  return chunk.slice(0, chunk.indexOf(">"));
}

// React renders a disabled button as `disabled=""` (see toggle-group.test.tsx);
// a bare substring check would false-positive on Tailwind `disabled:` classes.
function isDisabledButton(attrs: string): boolean {
  return (
    attrs.includes('disabled=""') || attrs.includes('aria-disabled="true"')
  );
}

test("compression presets render as enabled toggle items", () => {
  const html = renderForm();
  for (const label of ["Studio", "Social Media", "Web", "Web (Low)"]) {
    assert.ok(
      !isDisabledButton(buttonAttrs(html, label)),
      `compression item "${label}" should be enabled`
    );
  }
});

test("frame-rate select offers a Source option at the source fps", () => {
  const html = renderForm();
  assert.match(html, /Source \(30 fps\)/);
});

test("compression and frame-rate groups drop the coming-soon copy", () => {
  const html = renderForm();
  assert.doesNotMatch(html, /coming soon/i);
});

test("destination and format stay disabled (out of scope)", () => {
  const html = renderForm();
  for (const label of ["File", "Clipboard", "MP4", "GIF"]) {
    assert.ok(
      isDisabledButton(buttonAttrs(html, label)),
      `"${label}" should stay disabled`
    );
  }
});
