import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  contextBlock,
  loadProjectContext,
  projectContextPath,
  projectStatusWithContext,
} from "../src/project-context.ts";
import { makeProject, withTempProjectsRoot } from "./helpers/projectFixture.ts";

test("loadProjectContext returns undefined when file is absent", async () => {
  await withTempProjectsRoot(({ slug }) => {
    assert.equal(loadProjectContext(slug), undefined);
    assert.ok(projectContextPath(slug).endsWith("AGENTS.local.md"));
  });
});

test("loadProjectContext reads AGENTS.local.md from project root", async () => {
  await withTempProjectsRoot(({ root, slug }) => {
    const dir = join(root, "projects", slug);
    writeFileSync(
      join(dir, "AGENTS.local.md"),
      "Always keep the first 3 seconds.\nNo vignette.",
      "utf8"
    );
    assert.equal(
      loadProjectContext(slug),
      "Always keep the first 3 seconds.\nNo vignette."
    );
  });
});

test("loadProjectContext truncates oversized files", async () => {
  await withTempProjectsRoot(({ root, slug }) => {
    const dir = join(root, "projects", slug);
    writeFileSync(join(dir, "AGENTS.local.md"), "x".repeat(9000), "utf8");
    const text = loadProjectContext(slug);
    assert.ok(text);
    assert.ok(text.length < 9000);
    assert.match(text, /\[context truncated\]$/);
  });
});

test("contextBlock renders markdown fence or empty string", () => {
  assert.equal(contextBlock(undefined), "");
  assert.equal(contextBlock("  "), "");
  assert.match(contextBlock("No zooms."), /AGENTS\.local\.md/);
  assert.match(contextBlock("No zooms."), /No zooms\./);
});

test("projectStatusWithContext includes context when present", async () => {
  await withTempProjectsRoot(({ root, slug }) => {
    const dir = join(root, "projects", slug);
    writeFileSync(
      join(dir, "AGENTS.local.md"),
      "Captions off for this one.",
      "utf8"
    );
    const project = makeProject({ slug });
    const status = projectStatusWithContext(project, slug);
    assert.equal(status.slug, slug);
    assert.equal(status.context, "Captions off for this one.");
  });
});

test("projectStatusWithContext omits context field when absent", async () => {
  await withTempProjectsRoot(({ slug }) => {
    const project = makeProject({ slug });
    const status = projectStatusWithContext(project, slug);
    assert.equal(status.slug, slug);
    assert.equal("context" in status, false);
  });
});
