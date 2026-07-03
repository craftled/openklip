import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HighlightClip, Highlights } from "../src/edl.ts";
import { HighlightsPanel } from "../web/components/highlights-panel.tsx";

function clip(overrides: Partial<HighlightClip> = {}): HighlightClip {
  return {
    id: "h0",
    fromSec: 12,
    toSec: 57,
    title: "The hook",
    reason: "Strong opening question",
    score: 0.9,
    ...overrides,
  };
}

function highlights(overrides: Partial<Highlights> = {}): Highlights {
  return {
    clips: [],
    analyzedAt: "2026-07-03T12:00:00.000Z",
    ...overrides,
  };
}

const noop = () => {
  // presentational test: callbacks are not exercised
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof HighlightsPanel>> = {}
): string {
  return renderToStaticMarkup(
    <HighlightsPanel highlights={null} onSeekClip={noop} {...overrides} />
  );
}

function tagWith(html: string, marker: string, tag = "button"): string {
  const idx = html.indexOf(marker);
  assert.ok(idx >= 0, `missing ${marker} in markup`);
  const start = html.lastIndexOf(`<${tag}`, idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

test("empty state when no highlights", () => {
  const html = renderPanel({ highlights: null });
  assert.match(html, /data-highlights-panel/);
  assert.match(html, /No highlight clips yet\./);
  assert.doesNotMatch(html, /data-highlights-row/);
});

test("empty state when highlights has no clips", () => {
  const html = renderPanel({ highlights: highlights() });
  assert.match(html, /No highlight clips yet\./);
  assert.doesNotMatch(html, /data-highlights-row/);
});

test("renders clip rows with id, title, and time range", () => {
  const html = renderPanel({
    highlights: highlights({
      clips: [
        clip({ id: "h0", title: "Opening hook", fromSec: 0, toSec: 45 }),
        clip({ id: "h1", title: "Payoff", fromSec: 90, toSec: 135 }),
      ],
    }),
  });
  const rowCount = html.split("data-highlights-row=").length - 1;
  assert.equal(rowCount, 2);
  assert.match(html, /Opening hook/);
  assert.match(html, /Payoff/);
  assert.match(html, /0:00/);
  assert.match(html, /0:45/);
  assert.match(html, /1:30/);
  assert.match(html, /2:15/);
});

test("detect button renders when onDetect provided", () => {
  const html = renderPanel({ onDetect: noop });
  assert.match(html, /data-highlights-detect/);
  const detectTag = tagWith(html, "data-highlights-detect");
  assert.ok(!detectTag.includes('disabled=""'));
});

test("detect button is disabled while detecting", () => {
  const html = renderPanel({ detecting: true, onDetect: noop });
  const detectTag = tagWith(html, "data-highlights-detect");
  assert.ok(detectTag.includes('disabled=""'));
  assert.match(html, /Detecting/);
});

test("detect button is omitted without onDetect", () => {
  const html = renderPanel();
  assert.doesNotMatch(html, /data-highlights-detect/);
});
