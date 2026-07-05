import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../src/edl.ts";
import {
  addGraphicsAtCutSeams,
  cutSeamTimes,
  defaultTransitionDurationSec,
  spanAtCutSeam,
} from "../src/graphic-cut-transitions.ts";
import { makeProject } from "./helpers/projectFixture.ts";

function projectWithCuts(): Project {
  const p = makeProject();
  p.words = [
    {
      id: "w0",
      text: "one",
      startSample: 0,
      endSample: 48_000,
      deleted: false,
    },
    {
      id: "w1",
      text: "two",
      startSample: 48_000,
      endSample: 96_000,
      deleted: false,
    },
    {
      id: "w-cut",
      text: "filler",
      startSample: 96_000,
      endSample: 200_000,
      deleted: true,
    },
    {
      id: "w2",
      text: "three",
      startSample: 200_000,
      endSample: 248_000,
      deleted: false,
    },
    {
      id: "w3",
      text: "four",
      startSample: 248_000,
      endSample: 296_000,
      deleted: false,
    },
  ];
  p.durationSamples = 400_000;
  return p;
}

test("cutSeamTimes returns boundaries between kept ranges", () => {
  const seams = cutSeamTimes(projectWithCuts());
  assert.equal(seams.length, 1);
  assert.ok(seams[0] > 1.9 && seams[0] < 2.2);
});

test("defaultTransitionDurationSec reads transition manifest frames", () => {
  const sec = defaultTransitionDurationSec("transition-flash");
  assert.ok(sec >= 0.3 && sec <= 0.5);
});

test("spanAtCutSeam centers on the seam", () => {
  const span = spanAtCutSeam(10, 0.4, 60);
  assert.equal(span.fromSec, 9.8);
  assert.equal(span.toSec, 10.2);
});

test("addGraphicsAtCutSeams places one overlay per seam", () => {
  const project = projectWithCuts();
  const placed = addGraphicsAtCutSeams(project, {
    template: "transition-flash",
  });
  assert.equal(placed.length, 1);
  assert.equal(placed[0].template, "transition-flash");
  assert.ok(placed[0].endSample > placed[0].startSample);
});

test("addGraphicsAtCutSeams rejects non-transition templates", () => {
  const project = projectWithCuts();
  assert.throws(
    () =>
      addGraphicsAtCutSeams(project, {
        template: "motion-typewriter",
      }),
    /transition-\*/
  );
});

test("addGraphicsAtCutSeams errors when there is only one kept range", () => {
  const project = makeProject();
  assert.throws(
    () =>
      addGraphicsAtCutSeams(project, {
        template: "transition-dip",
      }),
    /no cut seams/
  );
});
