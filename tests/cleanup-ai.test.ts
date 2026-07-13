import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bumpCleanupAiFlightOnSlugChange,
  canStartCleanupAiPass,
  shouldMergeCleanupAiResult,
  startCleanupAiFlight,
} from "../web/hooks/use-cleanup-ai-pass.ts";
import {
  aiCleanupWordsToCandidates,
  aiCleanupWordToCandidate,
} from "../web/lib/cleanup-ai.ts";

test("aiCleanupWordToCandidate maps review-risk filler rows with ai id prefix", () => {
  const candidate = aiCleanupWordToCandidate({
    category: "repeat",
    endSec: 2.4,
    id: "w12",
    startSec: 2.1,
    text: "like",
  });
  assert.equal(candidate.id, "ai-w12");
  assert.equal(candidate.kind, "filler");
  assert.equal(candidate.category, "repeat");
  assert.equal(candidate.risk, "review");
  assert.deepEqual(candidate.wordIds, ["w12"]);
});

test("aiCleanupWordsToCandidates preserves category grouping inputs", () => {
  const candidates = aiCleanupWordsToCandidates([
    {
      category: "hesitation",
      endSec: 1,
      id: "w1",
      startSec: 0.5,
      text: "um",
    },
    {
      category: "hedging",
      endSec: 3,
      id: "w2",
      startSec: 2,
      text: "you know",
    },
  ]);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0]?.category, "hesitation");
  assert.equal(candidates[1]?.category, "hedging");
});

test("shouldMergeCleanupAiResult merges when slug and requestId still match", () => {
  const live = { slug: "project-a", requestId: 2 };
  const captured = { slug: "project-a", requestId: 2 };
  assert.equal(shouldMergeCleanupAiResult(live, captured), true);
});

test("shouldMergeCleanupAiResult drops stale result after slug change", () => {
  let live = { slug: "project-a", requestId: 1 };
  const { captured, nextFlight } = startCleanupAiFlight(live, "project-a");
  live = nextFlight;
  live = bumpCleanupAiFlightOnSlugChange(live, "project-b");
  assert.equal(shouldMergeCleanupAiResult(live, captured), false);
});

test("bumpCleanupAiFlightOnSlugChange invalidates in-flight AI pass", () => {
  const live = bumpCleanupAiFlightOnSlugChange(
    { slug: "project-a", requestId: 3 },
    "project-b"
  );
  assert.equal(live.slug, "project-b");
  assert.equal(live.requestId, 4);
});

test("canStartCleanupAiPass rejects duplicate in-flight launch", () => {
  assert.equal(
    canStartCleanupAiPass({
      agentUsable: true,
      applying: false,
      running: true,
    }),
    false
  );
  assert.equal(
    canStartCleanupAiPass({
      agentUsable: true,
      applying: false,
      running: false,
    }),
    true
  );
});
