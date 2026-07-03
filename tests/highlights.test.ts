import assert from "node:assert/strict";
import { test } from "node:test";
import type { Highlights } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  assignHighlightIds,
  buildHighlightsPrompt,
  highlightClipLines,
  parseHighlights,
} from "../src/highlights.ts";
import { makeProject } from "./helpers/projectFixture.ts";

test("buildHighlightsPrompt includes timed transcript and clip bounds", () => {
  const project = makeProject({
    words: [
      {
        id: "w0",
        text: "Hello",
        startSample: 0,
        endSample: SAMPLE_RATE,
        deleted: false,
      },
      {
        id: "w1",
        text: "world.",
        startSample: SAMPLE_RATE,
        endSample: SAMPLE_RATE * 2,
        deleted: false,
      },
    ],
    durationSamples: SAMPLE_RATE * 120,
  });
  const prompt = buildHighlightsPrompt(project, {
    targetClipSec: 45,
    maxClips: 3,
  });
  assert.match(prompt, /JSON only/i);
  assert.match(prompt, /Hello world/);
  assert.match(prompt, /45/);
  assert.match(prompt, /clips/);
});

test("parseHighlights parses valid clip spans", () => {
  const clips = parseHighlights(
    '{"clips":[{"fromSec":10,"toSec":40,"title":"Best hook","reason":"punchy opener","score":0.9}]}'
  );
  assert.equal(clips?.length, 1);
  assert.equal(clips?.[0]?.title, "Best hook");
  assert.equal(clips?.[0]?.fromSec, 10);
  assert.equal(clips?.[0]?.toSec, 40);
  assert.equal(clips?.[0]?.score, 0.9);
});

test("parseHighlights drops clips shorter than 10s or out of order", () => {
  const clips = parseHighlights(
    '{"clips":[{"fromSec":0,"toSec":5,"title":"too short"},{"fromSec":20,"toSec":10,"title":"bad order"},{"fromSec":12,"toSec":30,"title":"ok"}]}'
  );
  assert.equal(clips?.length, 1);
  assert.equal(clips?.[0]?.title, "ok");
});

test("parseHighlights returns null on garbage", () => {
  assert.equal(parseHighlights("not json"), null);
  assert.equal(parseHighlights('{"clips":[]}'), null);
});

test("assignHighlightIds assigns h1, h2", () => {
  const clips = assignHighlightIds([
    { fromSec: 0, toSec: 30, title: "A" },
    { fromSec: 40, toSec: 70, title: "B" },
  ]);
  assert.deepEqual(
    clips.map((c) => c.id),
    ["h1", "h2"]
  );
});

test("highlightClipLines renders stored highlights", () => {
  const log: Highlights = {
    analyzedAt: "2026-07-03T00:00:00Z",
    clips: [
      {
        id: "h1",
        fromSec: 12,
        toSec: 42,
        title: "Key insight",
        score: 0.88,
      },
    ],
  };
  const lines = highlightClipLines(log);
  assert.match(lines, /h1/);
  assert.match(lines, /12\.0-42\.0s/);
  assert.match(lines, /Key insight/);
});
