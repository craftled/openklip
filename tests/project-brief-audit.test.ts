import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  auditProjectForShip,
  parseBriefTargets,
  spanOverlapsKeptRanges,
} from "../src/project-brief-audit.ts";
import { makeProject } from "./helpers/projectFixture.ts";

const EDGARAS_BRIEF =
  "Audience: startup founders and indie hackers curious about agent-native tools. Goal: a tight talking-head intro about building a canvas design tool, positioned as a personal build-in-public story. Tone: honest, energetic, no hype. Must use: at least two aerial b-roll shots over the speaker's talking sections and one still image. Music: keep the gravity score bed subtle under the voice. Avoid: cutting the sentence about working in my own world. Target length: about 90 seconds. Export: social preset, 1080p.";

function sec(n: number): number {
  return n * SAMPLE_RATE;
}

function word(
  id: string,
  text: string,
  startSec: number,
  endSec: number,
  deleted = false
): Project["words"][number] {
  return {
    id,
    text,
    startSample: sec(startSec),
    endSample: sec(endSec),
    deleted,
  };
}

test("parseBriefTargets reads target length and avoid phrase", () => {
  const targets = parseBriefTargets(EDGARAS_BRIEF);
  assert.equal(targets.targetLengthSec, 90);
  assert.equal(targets.minBroll, 2);
  assert.equal(targets.minStill, 1);
  assert.ok(targets.avoidPhrases.some((p) => p.includes("own world")));
});

test("spanOverlapsKeptRanges detects intersection", () => {
  const ranges = [{ startSec: 10, endSec: 20 }];
  assert.equal(spanOverlapsKeptRanges(9, 11, ranges), true);
  assert.equal(spanOverlapsKeptRanges(20, 22, ranges), false);
  assert.equal(spanOverlapsKeptRanges(5, 8, ranges), false);
});

test("auditProjectForShip fails when runtime is too short", () => {
  const project = makeProject({
    words: [word("w0", "hello", 0, 1)],
    broll: [
      {
        id: "br1",
        assetId: "a1",
        startSample: sec(0.5),
        endSample: sec(2.5),
        srcInSample: 0,
      },
      {
        id: "br2",
        assetId: "a2",
        startSample: sec(3),
        endSample: sec(5),
        srcInSample: 0,
      },
    ],
    stills: [
      {
        id: "s1",
        assetId: "a1",
        startSample: sec(1),
        endSample: sec(3),
        scale: 1.2,
        focusX: 0.5,
        focusY: 0.5,
      },
    ],
    music: [
      {
        id: "m1",
        assetId: "music",
        startSample: 0,
        endSample: sec(10),
        srcInSample: 0,
        gain: 0.25,
      },
    ],
    durationSamples: sec(10),
  });

  const result = auditProjectForShip({
    briefText: EDGARAS_BRIEF,
    project,
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes("kept runtime")));
});

test("auditProjectForShip passes a well-formed talking-head edit", () => {
  const words: Project["words"] = [];
  for (let i = 0; i < 200; i++) {
    words.push(word(`w${i}`, `word${i}`, i * 0.45, i * 0.45 + 0.4));
  }
  words.push(
    word("w200", "working", 84.5, 84.8),
    word("w201", "in", 84.8, 84.9),
    word("w202", "my", 84.9, 85),
    word("w203", "own", 85, 85.3),
    word("w204", "world", 85.3, 85.6)
  );

  const project = makeProject({
    words,
    durationSamples: sec(120),
    broll: [
      {
        id: "br1",
        assetId: "dji-a",
        startSample: sec(5),
        endSample: sec(7),
        srcInSample: 0,
      },
      {
        id: "br2",
        assetId: "dji-b",
        startSample: sec(80),
        endSample: sec(82),
        srcInSample: 0,
      },
    ],
    stills: [
      {
        id: "s1",
        assetId: "still-a",
        startSample: sec(20),
        endSample: sec(23),
        scale: 1.2,
        focusX: 0.5,
        focusY: 0.5,
      },
    ],
    music: [
      {
        id: "m1",
        assetId: "9-gravity-score",
        startSample: 0,
        endSample: sec(120),
        srcInSample: 0,
        gain: 0.25,
      },
    ],
  });

  const result = auditProjectForShip({
    briefText: EDGARAS_BRIEF,
    project,
  });

  assert.equal(result.ok, true, result.issues.join("; "));
});
