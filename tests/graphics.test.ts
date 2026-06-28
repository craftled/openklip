import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  assertValidGraphicId,
  defaultGraphicParams,
  GraphicManifestSchema,
  graphicCompositionPath,
  graphicManifestPath,
  listGraphics,
  loadGraphicManifest,
} from "../src/graphics.ts";

test("listGraphics finds the bundled templates sorted by name", () => {
  const list = listGraphics();
  const ids = list.map((g) => g.id);
  assert.ok(ids.includes("lower-third"));
  assert.ok(ids.includes("kinetic-caption"));
  assert.ok(ids.includes("title-card"));
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
