import assert from "node:assert/strict";
import { test } from "node:test";
import { addStill, removeStill } from "../src/actions.ts";
import { makeProject } from "./helpers/projectFixture.ts";

function stillProject() {
  return makeProject({
    assets: [
      {
        id: "shot1",
        kind: "still",
        name: "shot1.png",
        src: "/tmp/shot1.png",
        proxy: "working/assets/shot1.png",
        durationSamples: 48_000 * 5,
      },
    ],
  });
}

test("addStill places a still overlay with Ken Burns defaults", () => {
  const project = stillProject();
  const item = addStill(project, { assetId: "shot1", fromSec: 1, toSec: 4 });
  assert.equal(project.stills.length, 1);
  assert.equal(item.assetId, "shot1");
  assert.equal(item.scale, 1.2);
  assert.equal(item.focusX, 0.5);
  assert.equal(item.startSample, 48_000);
  assert.equal(item.endSample, 48_000 * 4);
});

test("addStill rejects a non-still asset", () => {
  const project = makeProject(); // fixture asset is kind broll
  assert.throws(
    () => addStill(project, { assetId: "broll-a", fromSec: 0, toSec: 2 }),
    /still/i
  );
});

test("addStill honors custom scale and focus", () => {
  const project = stillProject();
  const item = addStill(project, {
    assetId: "shot1",
    fromSec: 0,
    toSec: 3,
    scale: 1.4,
    focusX: 0.2,
    focusY: 0.8,
  });
  assert.equal(item.scale, 1.4);
  assert.equal(item.focusX, 0.2);
  assert.equal(item.focusY, 0.8);
});

test("removeStill deletes by id", () => {
  const project = stillProject();
  const item = addStill(project, { assetId: "shot1", fromSec: 0, toSec: 2 });
  assert.equal(removeStill(project, item.id), true);
  assert.equal(project.stills.length, 0);
  assert.equal(removeStill(project, "nope"), false);
});
