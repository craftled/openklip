import assert from "node:assert/strict";
import { test } from "node:test";
import { GradeSchema } from "../src/edl.ts";
import {
  GRADE_NAMES,
  GRADE_OPTIONS,
  gradeFilter,
  gradeLabel,
  isGrade,
} from "../src/grade.ts";

test("none is a no-op (empty filter chain)", () => {
  assert.equal(gradeFilter("none"), "");
});

test("every non-none grade expands to a real ffmpeg filter chain", () => {
  for (const name of GRADE_NAMES) {
    const chain = gradeFilter(name);
    if (name === "none") {
      assert.equal(chain, "");
    } else {
      assert.ok(chain.length > 0, `${name} has a filter`);
      assert.match(chain, /eq=/, `${name} uses eq`);
    }
  }
});

test("cool_desat (the deck's neutral_cool_desat) desaturates and cools", () => {
  const chain = gradeFilter("cool_desat");
  assert.match(chain, /saturation=0\.85/); // desaturated
  assert.match(chain, /colorbalance=/); // shifted toward cool
});

test("the filter chains carry no shell-breaking quotes for filter_complex", () => {
  for (const name of GRADE_NAMES) {
    assert.doesNotMatch(gradeFilter(name), /['"]/, `${name} is quote-free`);
  }
});

test("GradeSchema accepts every grade name and rejects unknowns", () => {
  for (const name of GRADE_NAMES) {
    assert.equal(GradeSchema.parse(name), name);
  }
  assert.throws(() => GradeSchema.parse("teal_orange"));
  // Defaulted: undefined resolves to "none".
  assert.equal(GradeSchema.parse(undefined), "none");
});

test("isGrade guards membership", () => {
  assert.equal(isGrade("filmic"), true);
  assert.equal(isGrade("none"), true);
  assert.equal(isGrade("teal_orange"), false);
  assert.equal(isGrade(""), false);
});

test("GRADE_OPTIONS pairs every grade with a human label", () => {
  assert.equal(GRADE_OPTIONS.length, GRADE_NAMES.length);
  assert.equal(gradeLabel("cool_desat"), "Cool desat");
  assert.equal(gradeLabel("none"), "None");
  for (const opt of GRADE_OPTIONS) {
    assert.ok(opt.label.length > 0);
  }
});
