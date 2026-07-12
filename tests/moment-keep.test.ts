import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  decodeMomentDragPayload,
  deletedWordIdsInSpan,
  encodeMomentDragPayload,
  MOMENT_DRAG_MIME,
  mergeMomentTextMatches,
  mergePhraseSearchMatchLists,
  wordIdsInSpan,
} from "../web/lib/moment-keep.ts";
import type { PhraseSearchMatch } from "../web/lib/phrase-search.ts";

interface SpanWord {
  deleted: boolean;
  endSample: number;
  id: string;
  startSample: number;
  text: string;
}

function word(
  id: string,
  startSec: number,
  endSec: number,
  text: string,
  deleted = false
): SpanWord {
  return {
    id,
    text,
    deleted,
    startSample: Math.round(startSec * SAMPLE_RATE),
    endSample: Math.round(endSec * SAMPLE_RATE),
  };
}

// ── wordIdsInSpan / deletedWordIdsInSpan ─────────────────────────────────

test("wordIdsInSpan includes words overlapping [fromSec, toSec)", () => {
  const words = [
    word("w0", 0, 1, "a"),
    word("w1", 1, 2, "b"),
    word("w2", 2, 3, "c"),
    word("w3", 3, 4, "d"),
  ];
  assert.deepEqual(wordIdsInSpan(words, 1, 3), ["w1", "w2"]);
});

test("wordIdsInSpan treats span end as exclusive", () => {
  const words = [word("w0", 0, 1, "a"), word("w1", 1, 2, "b")];
  assert.deepEqual(wordIdsInSpan(words, 1, 1.5), ["w1"]);
  assert.deepEqual(wordIdsInSpan(words, 2, 3), []);
});

test("wordIdsInSpan includes deleted words", () => {
  const words = [word("w0", 0, 1, "a", true), word("w1", 1, 2, "b", false)];
  assert.deepEqual(wordIdsInSpan(words, 0, 2), ["w0", "w1"]);
});

test("deletedWordIdsInSpan returns only deleted overlapping ids", () => {
  const words = [
    word("w0", 0, 1, "a", true),
    word("w1", 1, 2, "b", false),
    word("w2", 2, 3, "c", true),
  ];
  assert.deepEqual(deletedWordIdsInSpan(words, 0, 3), ["w0", "w2"]);
});

test("wordIdsInSpan uses half-open overlap at boundaries", () => {
  const words = [word("w0", 0.5, 1.5, "mid")];
  assert.deepEqual(wordIdsInSpan(words, 0, 0.5), []);
  assert.deepEqual(wordIdsInSpan(words, 0, 0.51), ["w0"]);
  assert.deepEqual(wordIdsInSpan(words, 1.5, 2), []);
  assert.deepEqual(wordIdsInSpan(words, 1.49, 2), ["w0"]);
});

// ── mergeMomentTextMatches ───────────────────────────────────────────────

test("mergeMomentTextMatches combines kept and cut matches sorted by fromSec", () => {
  const words = [
    word("w0", 0, 1, "hello"),
    word("w1", 1, 2, "there"),
    word("w2", 2, 3, "hello"),
    word("w3", 3, 4, "there", true),
    word("w4", 4, 5, "again", true),
  ];
  const merged = mergeMomentTextMatches({ words }, "hello there", 24);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].fromSec, 0);
  assert.deepEqual([...merged[0].range], [0, 1]);
  assert.equal(merged[0].hasCutWords, false);
  assert.equal(merged[1].fromSec, 2);
  assert.deepEqual([...merged[1].range], [2, 3]);
  assert.equal(merged[1].hasCutWords, true);
});

test("mergePhraseSearchMatchLists dedupes by word-index range", () => {
  const match: PhraseSearchMatch = {
    fromSec: 0,
    toSec: 2,
    ids: ["w0", "w1"],
    range: [0, 1],
    text: "hello there",
  };
  const words = [
    word("w0", 0, 1, "hello", true),
    word("w1", 1, 2, "there", true),
  ];
  const merged = mergePhraseSearchMatchLists([match], [match], words, 24);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].hasCutWords, true);
});

test("mergeMomentTextMatches returns empty for blank query", () => {
  const words = [word("w0", 0, 1, "a")];
  assert.deepEqual(mergeMomentTextMatches({ words }, "", 24), []);
  assert.deepEqual(mergeMomentTextMatches({ words }, "   ", 24), []);
});

// ── encodeMomentDragPayload / decodeMomentDragPayload ──────────────────────

test("encodeMomentDragPayload round-trips through decode", () => {
  const payload = encodeMomentDragPayload({ fromSec: 12.5, toSec: 18 });
  const decoded = decodeMomentDragPayload(payload);
  assert.deepEqual(decoded, { fromSec: 12.5, toSec: 18 });
});

test("decodeMomentDragPayload returns null for malformed input", () => {
  assert.equal(decodeMomentDragPayload(""), null);
  assert.equal(decodeMomentDragPayload("not-json"), null);
  assert.equal(decodeMomentDragPayload(JSON.stringify({ fromSec: 1 })), null);
  assert.equal(
    decodeMomentDragPayload(JSON.stringify({ fromSec: "x", toSec: 2 })),
    null
  );
});

test("MOMENT_DRAG_MIME is the custom dataTransfer type", () => {
  assert.equal(MOMENT_DRAG_MIME, "application/x-openklip-moment");
});
