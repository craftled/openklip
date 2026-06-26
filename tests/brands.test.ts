import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBrand, brandPath, loadBrand } from "../src/brands.ts";
import { makeProject } from "./helpers/projectFixture.ts";

test("loadBrand reads the bundled default brand", async () => {
  const brand = await loadBrand("default");
  assert.equal(brand.captions?.enabled, true);
  assert.equal(typeof brand.padMs, "number");
});

test("loadBrand throws for a missing brand", async () => {
  await assert.rejects(() => loadBrand("does-not-exist"), /brand not found/i);
});

test("brandPath rejects traversal in the brand name", () => {
  assert.throws(() => brandPath("../secret"), /invalid brand name/i);
  assert.throws(() => brandPath("a/b"), /invalid brand name/i);
});

test("applyBrand overrides only the fields the brand specifies", () => {
  const project = makeProject({
    captions: { enabled: true, maxWords: 6 },
    look: { vignette: false },
    padMs: 50,
  });
  applyBrand(project, {
    captions: { maxWords: 4 },
    look: { vignette: true },
    padMs: 80,
  });
  assert.equal(project.captions.maxWords, 4);
  assert.equal(project.captions.enabled, true); // untouched
  assert.equal(project.look.vignette, true);
  assert.equal(project.padMs, 80);
});

test("applyBrand leaves words and overlays untouched (project.json stays the edit)", () => {
  const project = makeProject();
  const words = structuredClone(project.words);
  applyBrand(project, { padMs: 120 });
  assert.deepEqual(project.words, words);
  assert.equal(project.padMs, 120);
});
