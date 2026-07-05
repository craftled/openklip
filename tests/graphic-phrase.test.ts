import assert from "node:assert/strict";
import { test } from "node:test";
import {
  phraseStaggerFrames,
  resolveGraphicPhraseParams,
} from "../src/graphic-phrase.ts";
import { makeProject } from "./helpers/projectFixture.ts";

test("phraseStaggerFrames scales down with more words", () => {
  assert.ok(phraseStaggerFrames(3) > phraseStaggerFrames(8));
  assert.equal(phraseStaggerFrames(1), 0);
});

test("resolveGraphicPhraseParams sets stagger from phrase word ids", () => {
  const project = makeProject();
  project.words = [
    {
      id: "w0",
      text: "hello",
      startSample: 0,
      endSample: 24_000,
      deleted: false,
    },
    {
      id: "w1",
      text: "brave",
      startSample: 24_000,
      endSample: 48_000,
      deleted: false,
    },
    {
      id: "w2",
      text: "world",
      startSample: 48_000,
      endSample: 72_000,
      deleted: false,
    },
  ];
  const params = resolveGraphicPhraseParams(
    project,
    "motion-word-cascade",
    "brave world",
    undefined,
    ["w1", "w2"]
  );
  assert.equal(params.text, "brave world");
  assert.equal(typeof params.staggerFrames, "number");
  assert.ok((params.staggerFrames as number) >= 2);
});
