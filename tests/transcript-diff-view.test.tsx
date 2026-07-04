import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TranscriptDiffHeader,
  TranscriptDiffLayoutPicker,
  TranscriptDiffView,
  transcriptDiffCaption,
  transcriptDiffSurfaceStyle,
} from "../web/components/transcript-diff-view.tsx";

const SAMPLE_WORDS = [
  { id: "w0", text: "So", deleted: false },
  { id: "w1", text: "you", deleted: true },
  { id: "w2", text: "know,", deleted: true },
  { id: "w3", text: "I", deleted: false },
  { id: "w4", text: "think", deleted: false },
  { id: "w5", text: "this", deleted: false },
  { id: "w6", text: "works.", deleted: false },
] as const;

const SAMPLE_BEFORE = SAMPLE_WORDS.map((word) => ({ ...word, deleted: false }));

function noopLayoutChange(): void {
  // SSR render tests do not exercise layout persistence.
}

test("transcriptDiffCaption formats hunk and line counts", () => {
  assert.equal(
    transcriptDiffCaption({ additions: 3, deletions: 1, hunks: 2 }),
    "2 hunks · 3 added · 1 removed"
  );
  assert.equal(
    transcriptDiffCaption({ additions: 0, deletions: 0, hunks: 0 }),
    "No transcript changes"
  );
});

test("TranscriptDiffHeader renders caption and optional title", () => {
  const html = renderToStaticMarkup(
    <TranscriptDiffHeader
      caption="2 hunks · 1 added · 1 removed"
      layout="inline"
      onLayoutChange={noopLayoutChange}
      title="Agent edit"
    />
  );
  assert.match(html, /Agent edit/);
  assert.match(html, /2 hunks · 1 added · 1 removed/);
  assert.match(html, /Inline/);
  assert.match(html, /Classic/);
});

test("TranscriptDiffHeader omits title when not provided", () => {
  const html = renderToStaticMarkup(
    <TranscriptDiffHeader
      caption="No transcript changes"
      layout="classic"
      onLayoutChange={noopLayoutChange}
    />
  );
  assert.match(html, /No transcript changes/);
  assert.doesNotMatch(html, /<h3/);
});

test("TranscriptDiffLayoutPicker renders both layout choices", () => {
  const html = renderToStaticMarkup(
    <TranscriptDiffLayoutPicker
      layout="inline"
      onLayoutChange={noopLayoutChange}
    />
  );
  assert.match(html, /Inline/);
  assert.match(html, /Classic/);
});

test("transcriptDiffSurfaceStyle uses Inter 500 via font-sans and weight 500", () => {
  const surface = transcriptDiffSurfaceStyle();
  assert.equal(surface.fontWeight, 500);
  assert.match(String(surface["--diffs-font-family"]), /Inter/);
  assert.match(String(surface["--diffs-font-family"]), /var\(--font-sans\)/);
  assert.equal(surface["--diffs-font-size"], "1rem");
  assert.equal(surface["--diffs-bg"], "var(--card)");
  assert.equal(
    transcriptDiffSurfaceStyle(true)["--diffs-font-size"],
    "0.875rem"
  );
});

test("TranscriptDiffHeader compact mode shows summary badges instead of caption", () => {
  const html = renderToStaticMarkup(
    <TranscriptDiffHeader
      caption="1 hunks · 1 added · 1 removed"
      compact
      layout="inline"
      onLayoutChange={noopLayoutChange}
      summary={{ additions: 1, deletions: 1, hunks: 1 }}
      title="cut · 4 → 5"
    />
  );
  assert.match(html, /1 removed/);
  assert.match(html, /1 added/);
  assert.doesNotMatch(html, /1 hunks/);
  assert.match(html, /cut · 4 → 5/);
});

test("TranscriptDiffHeader compact mode shows no-changes badge when summary is empty", () => {
  const html = renderToStaticMarkup(
    <TranscriptDiffHeader
      caption="No transcript changes"
      compact
      layout="inline"
      onLayoutChange={noopLayoutChange}
      summary={{ additions: 0, deletions: 0, hunks: 0 }}
    />
  );
  assert.match(html, /No changes/);
  assert.doesNotMatch(html, /No transcript changes/);
});

test("TranscriptDiffView renders diff surface with layout data attribute", () => {
  const html = renderToStaticMarkup(
    <TranscriptDiffView
      layout="inline"
      newWords={SAMPLE_WORDS}
      oldWords={SAMPLE_BEFORE}
      title="Cut filler"
    />
  );
  assert.match(html, /data-transcript-diff-view/);
  assert.match(html, /data-transcript-diff-layout="inline"/);
  assert.match(html, /Cut filler/);
  assert.match(html, /min-h-32/);
  assert.match(html, /bg-card/);
});

test("TranscriptDiffView compact mode uses constrained height for history sidebar", () => {
  const html = renderToStaticMarkup(
    <TranscriptDiffView
      compact
      layout="inline"
      newWords={SAMPLE_WORDS}
      oldWords={SAMPLE_BEFORE}
      title="cut · 4 → 5"
    />
  );
  assert.match(html, /max-h-56/);
  assert.match(html, /text-sm/);
  assert.doesNotMatch(html, /min-h-32/);
});

test("TranscriptDiffView omits Pierre surface when kept-word text is unchanged", () => {
  const html = renderToStaticMarkup(
    <TranscriptDiffView
      compact
      layout="inline"
      newWords={SAMPLE_BEFORE}
      oldWords={SAMPLE_BEFORE}
      title="unchanged"
    />
  );
  assert.match(html, /No kept-word changes in this edit/);
  assert.doesNotMatch(html, /diffs-container/);
});
