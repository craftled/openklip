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

// ── deletedWordIdsInSpan ──────────────────────────────────────────────────

test("deletedWordIdsInSpan returns only deleted overlapping ids", () => {
  const words = [
    word("w0", 0, 1, "a", true),
    word("w1", 1, 2, "b", false),
    word("w2", 2, 3, "c", true),
  ];
  assert.deepEqual(deletedWordIdsInSpan(words, 0, 3), ["w0", "w2"]);
});

test("deletedWordIdsInSpan treats span end as exclusive", () => {
  const words = [word("w0", 0, 1, "a", true), word("w1", 1, 2, "b", true)];
  assert.deepEqual(deletedWordIdsInSpan(words, 1, 1.5), ["w1"]);
  assert.deepEqual(deletedWordIdsInSpan(words, 2, 3), []);
});

test("deletedWordIdsInSpan uses half-open overlap at boundaries", () => {
  const words = [word("w0", 0.5, 1.5, "mid", true)];
  assert.deepEqual(deletedWordIdsInSpan(words, 0, 0.5), []);
  assert.deepEqual(deletedWordIdsInSpan(words, 0, 0.51), ["w0"]);
  assert.deepEqual(deletedWordIdsInSpan(words, 1.5, 2), []);
  assert.deepEqual(deletedWordIdsInSpan(words, 1.49, 2), ["w0"]);
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

test("decodeMomentDragPayload rejects a negative fromSec", () => {
  assert.equal(
    decodeMomentDragPayload(JSON.stringify({ fromSec: -1, toSec: 2 })),
    null
  );
});

test("decodeMomentDragPayload rejects a reversed or zero-width span", () => {
  assert.equal(
    decodeMomentDragPayload(JSON.stringify({ fromSec: 5, toSec: 2 })),
    null
  );
  assert.equal(
    decodeMomentDragPayload(JSON.stringify({ fromSec: 5, toSec: 5 })),
    null
  );
});

test("decodeMomentDragPayload rejects a span far wider than any real project (guards the bulk-restore case)", () => {
  // A forward (fromSec < toSec), non-negative span can still overlap every
  // word in the project if it is absurdly wide - "reject reversed/negative"
  // alone would NOT catch this input, since 0 < 1e9 holds.
  assert.equal(
    decodeMomentDragPayload(JSON.stringify({ fromSec: 0, toSec: 1e9 })),
    null
  );
});

test("decodeMomentDragPayload accepts a span right at the sanity ceiling", () => {
  const oneDaySec = 24 * 60 * 60;
  const decoded = decodeMomentDragPayload(
    JSON.stringify({ fromSec: 0, toSec: oneDaySec })
  );
  assert.deepEqual(decoded, { fromSec: 0, toSec: oneDaySec });
});

test("MOMENT_DRAG_MIME is the custom dataTransfer type", () => {
  assert.equal(MOMENT_DRAG_MIME, "application/x-openklip-moment");
});
