import assert from "node:assert/strict";
import { test } from "node:test";
import { reorderBroll, reorderTitle, reorderZoom } from "../src/actions.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { makeProject } from "./helpers/projectFixture.ts";

const sec = (n: number) => n * SAMPLE_RATE;

function brollProject() {
  return makeProject({
    broll: [
      {
        id: "b1",
        assetId: "broll-a",
        startSample: 0,
        endSample: sec(1),
        srcInSample: 0,
      },
      {
        id: "b2",
        assetId: "broll-a",
        startSample: sec(1),
        endSample: sec(2),
        srcInSample: 0,
      },
      {
        id: "b3",
        assetId: "broll-a",
        startSample: sec(2),
        endSample: sec(3),
        srcInSample: 0,
      },
    ],
  });
}

test("reorderBroll moves a clip to a new paint-order index", () => {
  const project = brollProject();
  reorderBroll(project, "b3", 0);
  assert.deepEqual(
    project.broll.map((b) => b.id),
    ["b3", "b1", "b2"]
  );
});

test("reorderBroll clamps an out-of-range target index", () => {
  const project = brollProject();
  reorderBroll(project, "b1", 99);
  assert.deepEqual(
    project.broll.map((b) => b.id),
    ["b2", "b3", "b1"]
  );
});

test("reorderBroll throws for an unknown id", () => {
  assert.throws(() => reorderBroll(brollProject(), "nope", 0), /unknown/i);
});

test("reorderTitle and reorderZoom reorder their tracks", () => {
  const project = makeProject({
    titles: [
      {
        id: "t1",
        text: "a",
        startSample: 0,
        endSample: sec(1),
        position: "lower",
      },
      {
        id: "t2",
        text: "b",
        startSample: sec(1),
        endSample: sec(2),
        position: "lower",
      },
    ],
    zooms: [
      { id: "z1", startSample: 0, endSample: sec(1), scale: 1.2, rampSec: 0.4 },
      {
        id: "z2",
        startSample: sec(1),
        endSample: sec(2),
        scale: 1.2,
        rampSec: 0.4,
      },
    ],
  });
  reorderTitle(project, "t2", 0);
  reorderZoom(project, "z2", 0);
  assert.deepEqual(
    project.titles.map((t) => t.id),
    ["t2", "t1"]
  );
  assert.deepEqual(
    project.zooms.map((z) => z.id),
    ["z2", "z1"]
  );
});
