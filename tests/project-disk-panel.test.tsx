import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectDiskPanelView } from "../web/components/project-disk-panel.tsx";

const noop = () => {
  // presentational test: callbacks are not exercised
};

function render(
  overrides: Partial<ComponentProps<typeof ProjectDiskPanelView>> = {}
): string {
  return renderToStaticMarkup(
    <ProjectDiskPanelView
      checkingStatus={false}
      compacted={false}
      compacting={false}
      confirmingCompact={false}
      onCancelCompact={noop}
      onCompact={noop}
      onRebuild={noop}
      onRequestCompact={noop}
      rebuilding={false}
      {...overrides}
    />
  );
}

test("shows a Compact button by default", () => {
  const html = render();
  assert.match(html, /Compact project/i);
});

test("shows a confirm prompt when confirming compact", () => {
  const html = render({ confirmingCompact: true });
  assert.match(html, /sure/i);
});

test("shows a needs-rebuild banner when compacted", () => {
  const html = render({ compacted: true });
  assert.match(html, /rebuild/i);
  assert.match(html, /compacted/i);
});

test("disables Compact while a project is already compacted", () => {
  const html = render({ compacted: true });
  const idx = html.indexOf("Compact project");
  const start = html.lastIndexOf("<button", idx);
  const tag = html.slice(start, html.indexOf(">", start) + 1);
  assert.match(tag, /disabled/);
});

test("shows a loading state while rebuilding", () => {
  const html = render({ compacted: true, rebuilding: true });
  assert.match(html, /Rebuilding/i);
});
