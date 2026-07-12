import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTextSnippet,
  countBadge,
  defaultMomentSearchTab,
  formatClock,
  momentFrameThumbnailUrl,
  momentIndexBanner,
} from "../web/lib/moment-search-display.ts";

// ── formatClock ──────────────────────────────────────────────────────────

test("formatClock renders seconds under a minute as m:ss", () => {
  assert.equal(formatClock(59), "0:59");
});

test("formatClock renders minutes as m:ss", () => {
  assert.equal(formatClock(61), "1:01");
});

test("formatClock renders an hour boundary as h:mm:ss", () => {
  assert.equal(formatClock(3661), "1:01:01");
});

test("formatClock floors fractional seconds", () => {
  assert.equal(formatClock(61.9), "1:01");
});

test("formatClock clamps negative seconds to zero", () => {
  assert.equal(formatClock(-5), "0:00");
});

test("formatClock pads minutes and seconds past an hour", () => {
  assert.equal(formatClock(3605), "1:00:05");
});

// ── countBadge ───────────────────────────────────────────────────────────

test("countBadge shows the raw count under the limit", () => {
  assert.equal(countBadge(5, 24), "5");
  assert.equal(countBadge(0, 24), "0");
});

test("countBadge caps at the limit with a plus suffix", () => {
  assert.equal(countBadge(24, 24), "24+");
  assert.equal(countBadge(30, 24), "24+");
});

// ── defaultMomentSearchTab ───────────────────────────────────────────────

test("defaultMomentSearchTab prefers text when it has results", () => {
  assert.equal(defaultMomentSearchTab(3), "text");
  assert.equal(defaultMomentSearchTab(1), "text");
});

test("defaultMomentSearchTab falls back to scene when text is empty", () => {
  assert.equal(defaultMomentSearchTab(0), "scene");
});

// ── momentIndexBanner ────────────────────────────────────────────────────

test("momentIndexBanner shows the error state once errored, even if indexed is true", () => {
  assert.equal(momentIndexBanner(false, true), "error");
  assert.equal(momentIndexBanner(true, true), "error");
});

test("momentIndexBanner shows building while not yet indexed and not errored", () => {
  assert.equal(momentIndexBanner(false, false), "building");
});

test("momentIndexBanner is none once indexed and not errored", () => {
  assert.equal(momentIndexBanner(true, false), "none");
});

// ── momentFrameThumbnailUrl ──────────────────────────────────────────────

test("momentFrameThumbnailUrl builds the frame media URL with an encoded slug", () => {
  assert.equal(
    momentFrameThumbnailUrl("my project", "0001.jpg"),
    "/media/frames/0001.jpg?slug=my%20project"
  );
});

// ── buildTextSnippet ─────────────────────────────────────────────────────

const WORDS = [
  { text: "I" },
  { text: "think" },
  { text: "the" },
  { text: "dog" },
  { text: "runs" },
  { text: "fast" },
  { text: "today" },
  { text: "yes" },
];

test("buildTextSnippet pulls context words around the match range", () => {
  const snippet = buildTextSnippet(WORDS, { range: [3, 3], text: "dog" }, 2);
  assert.deepEqual(snippet, {
    before: "think the",
    match: "dog",
    after: "runs fast",
  });
});

test("buildTextSnippet clamps context at the start of the word list", () => {
  const snippet = buildTextSnippet(WORDS, { range: [0, 0], text: "I" }, 2);
  assert.equal(snippet.before, "");
  assert.equal(snippet.after, "think the");
});

test("buildTextSnippet clamps context at the end of the word list", () => {
  const snippet = buildTextSnippet(WORDS, { range: [7, 7], text: "yes" }, 2);
  assert.equal(snippet.before, "fast today");
  assert.equal(snippet.after, "");
});

test("buildTextSnippet spans a multi-word match using match.text verbatim", () => {
  const snippet = buildTextSnippet(
    WORDS,
    { range: [2, 3], text: "the dog" },
    1
  );
  assert.deepEqual(snippet, {
    before: "think",
    match: "the dog",
    after: "runs",
  });
});

test("buildTextSnippet defaults to a 4-word context window", () => {
  const snippet = buildTextSnippet(WORDS, { range: [3, 3], text: "dog" });
  assert.equal(snippet.before, "I think the");
  assert.equal(snippet.after, "runs fast today yes");
});
