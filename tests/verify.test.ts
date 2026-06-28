import assert from "node:assert/strict";
import { test } from "node:test";
import { diffCut, tokenize, verifyVerdict } from "../src/verify.ts";

// ---- tokenize ----

test("tokenize lowercases, splits on punctuation, keeps apostrophes", () => {
  assert.deepEqual(tokenize("Hey everyone, it's Thariq..."), [
    "hey",
    "everyone",
    "it's",
    "thariq",
  ]);
});

test("tokenize drops empties and edge apostrophes", () => {
  assert.deepEqual(tokenize("  'quoted'   word  "), ["quoted", "word"]);
  assert.deepEqual(tokenize("—  —"), []);
});

// ---- diffCut: the clean pass ----

test("diffCut: a faithful render verifies clean", () => {
  const report = diffCut({
    keptWords: ["hello", "world", "this", "is", "great"],
    deletedWords: ["um", "uh"],
    renderedWords: ["Hello world.", "This is great!"],
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.fillerSurvivors, []);
  assert.deepEqual(report.leakedDeleted, []);
  assert.equal(report.keptCoverage, 1);
  assert.equal(report.renderedWordCount, 5);
});

// ---- diffCut: defects ----

test("diffCut flags filler that survived into the render", () => {
  const report = diffCut({
    keptWords: ["hello", "world"],
    deletedWords: ["um"],
    renderedWords: ["hello", "um", "world"],
  });
  assert.deepEqual(report.fillerSurvivors, ["um"]);
  assert.equal(report.ok, false);
});

test("diffCut flags deleted content that leaked back in", () => {
  const report = diffCut({
    keptWords: ["keep", "this"],
    deletedWords: ["tangent", "rambling"],
    renderedWords: ["keep", "this", "tangent"],
  });
  assert.deepEqual(report.leakedDeleted, ["tangent"]);
  assert.equal(report.ok, false);
});

test("diffCut does not flag a deleted word that is also kept elsewhere", () => {
  const report = diffCut({
    keptWords: ["the", "plan", "the", "goal"],
    deletedWords: ["the"], // also a kept word → not a unique leak
    renderedWords: ["the", "plan", "the", "goal"],
  });
  assert.deepEqual(report.leakedDeleted, []);
  assert.equal(report.ok, true);
});

test("diffCut reports low coverage when kept words are missing", () => {
  const report = diffCut({
    keptWords: ["one", "two", "three", "four", "five"],
    deletedWords: [],
    renderedWords: ["one", "two"], // 3 of 5 clipped
    // coverage 0.4 < 0.9
  });
  assert.ok(report.keptCoverage < 0.9);
  assert.deepEqual(report.missingKept, ["three", "four", "five"]);
  assert.equal(report.ok, false);
});

test("diffCut: empty kept set is full coverage (nothing to miss)", () => {
  const report = diffCut({
    keptWords: [],
    deletedWords: ["um"],
    renderedWords: [],
  });
  assert.equal(report.keptCoverage, 1);
  assert.equal(report.ok, true);
});

// ---- verdict ----

test("verifyVerdict summarizes a clean pass", () => {
  const verdict = verifyVerdict({
    ok: true,
    fillerSurvivors: [],
    leakedDeleted: [],
    missingKept: [],
    keptCoverage: 1,
    renderedWordCount: 10,
  });
  assert.match(verdict, /^verified: zero filler, no leaked cuts, 100% /);
});

test("verifyVerdict lists every drift reason", () => {
  const verdict = verifyVerdict({
    ok: false,
    fillerSurvivors: ["um", "uh"],
    leakedDeleted: ["tangent"],
    missingKept: ["four"],
    keptCoverage: 0.5,
    renderedWordCount: 8,
  });
  assert.match(verdict, /filler survived: um, uh/);
  assert.match(verdict, /cut words leaked: tangent/);
  assert.match(verdict, /50% kept-word coverage/);
});
