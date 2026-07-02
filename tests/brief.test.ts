import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { briefPath, loadBrief, saveBrief } from "../src/brief.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("saveBrief then loadBrief round-trips the text", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await saveBrief(slug, "Audience: founders\nGoal: explain the product");
    const loaded = await loadBrief(slug);
    assert.equal(loaded, "Audience: founders\nGoal: explain the product");
  });
});

test("loadBrief returns undefined when brief.md does not exist", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assert.equal(await loadBrief(slug), undefined);
  });
});

test("saving empty/whitespace text deletes brief.md", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await saveBrief(slug, "Some brief content");
    assert.ok(existsSync(briefPath(slug)));
    await saveBrief(slug, "   \n  ");
    assert.equal(existsSync(briefPath(slug)), false);
    assert.equal(await loadBrief(slug), undefined);
  });
});

test("saveBrief throws when text exceeds the 100KB cap", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const huge = "x".repeat(100 * 1024 + 1);
    await assert.rejects(() => saveBrief(slug, huge), /100KB/);
  });
});

test("saveBrief normalizes the file to end with a trailing newline", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await saveBrief(slug, "No trailing newline here");
    const raw = await readFile(briefPath(slug), "utf8");
    assert.ok(raw.endsWith("\n"));
    assert.equal(raw, "No trailing newline here\n");
  });
});

test("saveBrief overwrites previous content rather than appending", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await saveBrief(slug, "First draft");
    await saveBrief(slug, "Second draft");
    assert.equal(await loadBrief(slug), "Second draft");
  });
});

test("two concurrent saveBrief calls both settle and the file ends with one of the two contents intact", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const [a, b] = await Promise.allSettled([
      saveBrief(slug, "First concurrent draft"),
      saveBrief(slug, "Second concurrent draft"),
    ]);
    assert.equal(a.status, "fulfilled");
    assert.equal(b.status, "fulfilled");
    const loaded = await loadBrief(slug);
    assert.ok(
      loaded === "First concurrent draft" ||
        loaded === "Second concurrent draft",
      `expected one of the two drafts to survive intact, got ${loaded}`
    );
  });
});
