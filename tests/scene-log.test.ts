import assert from "node:assert/strict";
import { test } from "node:test";
import type { SceneLog } from "../src/edl.ts";
import {
  buildSceneLogPrompt,
  frameTimeSec,
  parseSceneLog,
  sceneLogLines,
} from "../src/scene-log.ts";

test("frameTimeSec maps 1-based frame index to source seconds", () => {
  assert.equal(frameTimeSec(1, 3), 0);
  assert.equal(frameTimeSec(2, 3), 3);
  assert.equal(frameTimeSec(5, 3), 12);
});

test("buildSceneLogPrompt lists frames with timestamps and asks JSON only", () => {
  const p = buildSceneLogPrompt(
    [
      { atSec: 0, path: "/tmp/0001.jpg" },
      { atSec: 3, path: "/tmp/0002.jpg" },
    ],
    "hello world",
    60
  );
  assert.match(p, /t=0\.0s/);
  assert.match(p, /\/tmp\/0001\.jpg/);
  assert.match(p, /brollOpportunity/);
  assert.match(p, /JSON only/i);
  assert.match(p, /hello world/);
});

test("parseSceneLog parses valid segments", () => {
  const segments = parseSceneLog(
    '{"segments":[{"fromSec":0,"toSec":12,"summary":"Speaker at desk","onScreen":"speaker","brollOpportunity":true}]}'
  );
  assert.equal(segments?.length, 1);
  assert.equal(segments?.[0]?.summary, "Speaker at desk");
  assert.equal(segments?.[0]?.onScreen, "speaker");
  assert.equal(segments?.[0]?.brollOpportunity, true);
});

test("parseSceneLog recovers fenced JSON and drops invalid spans", () => {
  const segments = parseSceneLog(
    '```json\n{"segments":[{"fromSec":0,"toSec":5,"summary":"Slide deck","onScreen":"slide","brollOpportunity":false},{"fromSec":10,"toSec":8,"summary":"bad order"}]}\n```'
  );
  assert.equal(segments?.length, 1);
  assert.equal(segments?.[0]?.onScreen, "slide");
});

test("parseSceneLog returns null on garbage or empty segments", () => {
  assert.equal(parseSceneLog("not json"), null);
  assert.equal(parseSceneLog('{"segments":[]}'), null);
  assert.equal(
    parseSceneLog('{"segments":[{"fromSec":0,"toSec":1,"summary":""}]}'),
    null
  );
});

test("sceneLogLines renders spans and flags b-roll opportunities", () => {
  const log: SceneLog = {
    analyzedAt: "2026-06-28T00:00:00.000Z",
    segments: [
      {
        fromSec: 0,
        toSec: 10,
        summary: "Talking head",
        onScreen: "speaker",
        brollOpportunity: true,
      },
      {
        fromSec: 10,
        toSec: 20,
        summary: "Screen share demo",
        onScreen: "screen",
        brollOpportunity: false,
      },
    ],
  };
  const lines = sceneLogLines(log);
  assert.match(
    lines,
    /0\.0-10\.0s \[speaker\]: Talking head \(b-roll opportunity\)/
  );
  assert.match(lines, /10\.0-20\.0s \[screen\]: Screen share demo/);
  assert.doesNotMatch(lines, /Screen share.*b-roll opportunity/);
});

test("sceneLogLines returns empty string when absent", () => {
  assert.equal(sceneLogLines(undefined), "");
  assert.equal(sceneLogLines({ analyzedAt: "t", segments: [] }), "");
});
