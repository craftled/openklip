import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findActiveProject,
  projectAtShortcutIndex,
  projectInitial,
} from "../web/lib/project-list.ts";

test("projectInitial uses the first segment before separators", () => {
  assert.equal(projectInitial("demo-interview"), "D");
  assert.equal(projectInitial("ok.sample"), "O");
  assert.equal(projectInitial("podcast_ep_12"), "P");
});

test("findActiveProject returns the matching listing", () => {
  const projects = [
    { slug: "alpha", mtimeMs: 100 },
    { slug: "beta", mtimeMs: 200 },
  ];
  assert.deepEqual(findActiveProject(projects, "beta"), {
    slug: "beta",
    mtimeMs: 200,
  });
});

test("findActiveProject falls back to the active slug when missing", () => {
  const projects = [{ slug: "alpha", mtimeMs: 100 }];
  const found = findActiveProject(projects, "ghost");
  assert.equal(found.slug, "ghost");
  assert.equal(typeof found.mtimeMs, "number");
});

test("projectAtShortcutIndex maps ⌘1-⌘9 to list order", () => {
  const projects = [
    { slug: "one", mtimeMs: 1 },
    { slug: "two", mtimeMs: 2 },
    { slug: "three", mtimeMs: 3 },
  ];
  assert.equal(projectAtShortcutIndex(projects, 1)?.slug, "one");
  assert.equal(projectAtShortcutIndex(projects, 2)?.slug, "two");
  assert.equal(projectAtShortcutIndex(projects, 9)?.slug, undefined);
  assert.equal(projectAtShortcutIndex(projects, 0)?.slug, undefined);
});
