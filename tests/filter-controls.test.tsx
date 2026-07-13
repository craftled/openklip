import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewToggleButton } from "../web/components/filter-controls.tsx";

// FilterControls itself only mounts its Dialog content in a portal once
// opened (Base UI Dialog does not keep closed content mounted), so the
// before/after preview toggle is extracted into a small presentational
// component and rendered statically here (same idea as ExportOptionsForm in
// export-dialog.tsx / TakesPanelView in takes-panel.tsx).

const noop = () => {
  // presentational test: callbacks are not exercised
};

function renderButton(
  overrides: Partial<{
    comparing: boolean;
    failed: boolean;
    onError: () => void;
    onToggle: () => void;
    src: string;
  }> = {}
): string {
  return renderToStaticMarkup(
    <PreviewToggleButton
      comparing={false}
      failed={false}
      onError={noop}
      onToggle={noop}
      src="/api/projects/demo/preview-frame"
      {...overrides}
    />
  );
}

function tagWith(html: string, marker: string, tag = "button"): string {
  const idx = html.indexOf(marker);
  assert.ok(idx >= 0, `missing ${marker} in markup`);
  const start = html.lastIndexOf(`<${tag}`, idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

test("preview toggle button has an interruptible scale-on-press transform", () => {
  const html = renderButton();
  const tag = tagWith(html, "aria-pressed");
  assert.match(tag, /active:scale-\[0\.98\]/);
  assert.match(tag, /transition-\[background-color,transform\]/);
});

test("preview toggle button reflects comparing state via aria-pressed and label", () => {
  const html = renderButton({ comparing: true });
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Show after filter preview/);
});

test("preview toggle button shows an unavailable message when the frame failed to load", () => {
  const html = renderButton({ failed: true });
  assert.match(html, /Preview unavailable/);
  assert.doesNotMatch(html, /<img/);
});

test("preview toggle button renders the preview frame image when not failed", () => {
  const html = renderButton({ src: "/api/projects/demo/preview-frame?t=1" });
  assert.match(html, /<img/);
  assert.match(html, /preview-frame\?t=1/);
});
