import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isTranscriptDiffLayout,
  transcriptDiffFileOptions,
  transcriptDiffUnsafeCss,
} from "../web/lib/transcript-diff-layout.ts";

test("isTranscriptDiffLayout accepts inline and classic only", () => {
  assert.equal(isTranscriptDiffLayout("inline"), true);
  assert.equal(isTranscriptDiffLayout("classic"), true);
  assert.equal(isTranscriptDiffLayout("split"), false);
  assert.equal(isTranscriptDiffLayout(null), false);
});

test("transcriptDiffFileOptions uses prose-friendly inline defaults", () => {
  const inline = transcriptDiffFileOptions("inline");
  assert.equal(inline.diffStyle, "unified");
  assert.equal(inline.diffIndicators, "none");
  assert.equal(inline.disableLineNumbers, true);
  assert.equal(inline.hunkSeparators, "simple");
  assert.equal(inline.disableBackground, false);
  assert.equal(inline.lineDiffType, "word-alt");
});

test("transcriptDiffFileOptions uses classic git-style defaults", () => {
  const classic = transcriptDiffFileOptions("classic");
  assert.equal(classic.diffIndicators, "bars");
  assert.equal(classic.disableLineNumbers, false);
  assert.equal(classic.hunkSeparators, "line-info");
  assert.equal(classic.disableBackground, false);
});

test("transcriptDiffUnsafeCss bridges app theme and styles inline deletions", () => {
  const css = transcriptDiffUnsafeCss("inline");
  assert.match(css, /var\(--card\)/);
  assert.match(css, /var\(--foreground\)/);
  assert.match(css, /var\(--muted-foreground\)/);
  assert.match(css, /var\(--destructive\)/);
  assert.match(css, /var\(--primary\)/);
  assert.match(css, /change-deletion/);
  assert.match(css, /line-through/);
  assert.doesNotMatch(css, /display:\s*none/);
});

test("transcriptDiffUnsafeCss always applies font-weight 500 in classic layout", () => {
  assert.match(transcriptDiffUnsafeCss("classic"), /font-weight:\s*500/);
  assert.doesNotMatch(transcriptDiffUnsafeCss("classic"), /change-deletion/);
});
