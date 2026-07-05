import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  assertValidGraphicId,
  defaultGraphicParams,
  GraphicManifestSchema,
  graphicCompositionPath,
  graphicManifestPath,
  graphicPack,
  listGraphics,
  loadGraphicManifest,
} from "../src/graphics.ts";

test("listGraphics finds the bundled templates sorted by name", () => {
  const list = listGraphics();
  const ids = list.map((g) => g.id);
  assert.ok(ids.includes("lower-third"));
  assert.ok(ids.includes("kinetic-caption"));
  assert.ok(ids.includes("shader-dithering"));
  assert.ok(ids.includes("shader-grain-gradient"));
  assert.ok(ids.includes("shader-mesh-gradient"));
  assert.ok(ids.includes("shader-metaballs"));
  assert.ok(ids.includes("shader-image-dithering"));
  assert.ok(ids.includes("transition-flash"));
  assert.ok(ids.includes("shader-water"));
  const shaderIds = ids.filter((id) => id.startsWith("shader-"));
  assert.equal(shaderIds.length, 29);
  const names = list.map((g) => g.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sorted);
});

test("loadGraphicManifest validates the lower-third manifest", () => {
  const m = loadGraphicManifest("lower-third");
  assert.equal(m.id, "lower-third");
  assert.equal(m.kind, "text");
  assert.equal(m.width, 1920);
  assert.equal(m.height, 1080);
  assert.equal(m.fps, 30);
  assert.equal(m.params.title?.default, "Name");
});

test("title-card is a rich-kind manifest", () => {
  const m = loadGraphicManifest("title-card");
  assert.equal(m.kind, "rich");
});

test("shader manifests are rich-kind templates", () => {
  const shaderTemplateIds = listGraphics()
    .map((g) => g.id)
    .filter((id) => id.startsWith("shader-"));
  assert.equal(shaderTemplateIds.length, 29);
  for (const id of shaderTemplateIds) {
    assert.equal(loadGraphicManifest(id).kind, "rich", id);
  }
});

const MOTION_TEMPLATE_IDS = [
  "motion-typewriter",
  "motion-blur-reveal",
  "motion-shimmer",
  "motion-glitch",
  "motion-kinetic-build",
  "motion-roll-number",
  "motion-word-cascade",
  "motion-highlight-pop",
];

test("listGraphics includes param schemas and pack", () => {
  const wc = listGraphics().find((g) => g.id === "motion-word-cascade");
  assert.ok(wc);
  assert.equal(wc?.pack, "motion");
  assert.equal(wc?.params.text?.type, "string");
  assert.equal(wc?.params.inDurFrames?.type, "number");
  const shader = listGraphics().find((g) => g.id === "shader-mesh-gradient");
  assert.equal(shader?.pack, "shader");
});

test("listGraphics includes the bundled Motion text pack", () => {
  const ids = listGraphics().map((g) => g.id);
  for (const id of MOTION_TEMPLATE_IDS) {
    assert.ok(ids.includes(id), `expected listGraphics to include ${id}`);
  }
});

test("Motion pack manifests parse and are rich-kind", () => {
  for (const id of MOTION_TEMPLATE_IDS) {
    const m = loadGraphicManifest(id);
    assert.equal(m.id, id);
    assert.equal(m.kind, "rich");
    assert.equal(m.width, 1920);
    assert.equal(m.height, 1080);
    assert.equal(m.fps, 30);
    assert.ok(
      m.name.startsWith("Motion: "),
      `expected ${id} name to start with "Motion: "`
    );
  }
});

test("graphicPack classifies motion, shader, transition, and project ids", () => {
  assert.equal(graphicPack("motion-typewriter"), "motion");
  assert.equal(graphicPack("shader-mesh-gradient"), "shader");
  assert.equal(graphicPack("transition-flash"), "transition");
  assert.equal(graphicPack("lower-third"), "other");
  assert.equal(graphicPack("local-badge", "project"), "project");
});

test("loadGraphicManifest throws for an unknown template", () => {
  assert.throws(() => loadGraphicManifest("does-not-exist"), /not found/i);
});

test("assertValidGraphicId rejects traversal and bad ids", () => {
  assert.throws(() => assertValidGraphicId("../x"), /invalid graphic id/i);
  assert.throws(() => assertValidGraphicId("Bad_Id"), /invalid graphic id/i);
  assert.equal(assertValidGraphicId("lower-third"), "lower-third");
});

test("graphic path helpers point inside graphics/<id>/", () => {
  assert.ok(
    graphicManifestPath("lower-third").endsWith("lower-third/manifest.json")
  );
  assert.ok(
    graphicCompositionPath("lower-third").endsWith(
      "lower-third/composition.html"
    )
  );
});

test("defaultGraphicParams builds a fully-populated record from defaults", () => {
  const m = loadGraphicManifest("lower-third");
  const params = defaultGraphicParams(m);
  assert.equal(params.title, "Name");
  assert.equal(params.subtitle, "");
  assert.equal(params.accent, "oklch(0.809 0.1 284.59)");
});

test("GraphicManifestSchema rejects an invalid kind", () => {
  assert.throws(() =>
    GraphicManifestSchema.parse({
      id: "x",
      name: "X",
      kind: "video",
      width: 100,
      height: 100,
    })
  );
});

test("GraphicManifestSchema renders to JSON Schema (MCP tool registration)", () => {
  // The registry serializes action schemas via z.toJSONSchema(); the record/union
  // param shape must survive that pass so MCP tool registration does not break.
  const json = z.toJSONSchema(GraphicManifestSchema);
  assert.equal(json.type, "object");
});
