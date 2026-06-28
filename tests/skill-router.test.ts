import assert from "node:assert/strict";
import { test } from "node:test";
import { routeIntent } from "../web/lib/skill-router.ts";

test("routes filler-word intent to a multi-step cut plan", () => {
  const m = routeIntent("please cut all the filler words", "demo");
  assert.equal(m.id, "filler");
  assert.ok(m.steps.some((s) => s.includes('cut demo --text "um" --all')));
  assert.ok(m.steps.some((s) => s.includes("transcript grep demo")));
  assert.ok(m.steps.some((s) => s.startsWith("openklip status demo")));
});

test("routes captions off vs on by polarity", () => {
  assert.ok(
    routeIntent("turn off the captions", "demo").steps.some((s) =>
      s.includes("captions demo off")
    )
  );
  assert.ok(
    routeIntent("enable subtitles", "demo").steps.some((s) =>
      s.includes("captions demo on")
    )
  );
});

test("routes zoom and export intents", () => {
  const zoom = routeIntent("add a push-in zoom", "demo");
  assert.equal(zoom.id, "zoom");
  assert.ok(zoom.steps[0].startsWith("openklip zoom-add-phrase demo"));

  const exp = routeIntent("render and export the final cut", "demo");
  assert.equal(exp.id, "export");
  assert.ok(exp.steps.some((s) => s === "openklip export demo"));
});

test("routes template playbook intent", () => {
  const m = routeIntent("Apply template talking-head", "demo");
  assert.equal(m.id, "template");
  assert.ok(m.steps.some((s) => s.includes("template show talking-head")));
});

test("falls back to an orientation plan for unrecognized intent", () => {
  const m = routeIntent("asdfqwer", "demo");
  assert.equal(m.id, "orientation");
  assert.ok(m.steps.length > 0);
});

test("every step embeds the given slug", () => {
  for (const intent of ["cut filler", "export", "add b-roll", "vignette"]) {
    for (const step of routeIntent(intent, "my-proj").steps) {
      assert.ok(step.includes("my-proj"), `${intent} -> ${step}`);
    }
  }
});
