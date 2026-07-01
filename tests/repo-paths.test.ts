import assert from "node:assert/strict";
import { basename, isAbsolute } from "node:path";
import { test } from "node:test";
import { cwdPath, repoPath } from "../src/repo-paths.ts";
import { templatesRoot } from "../src/templates.ts";

test("repoPath resolves cwd-relative repo folders to absolute paths", () => {
  const templates = repoPath("templates");
  assert.equal(isAbsolute(templates), true);
  assert.equal(basename(templates), "templates");
});

test("cwdPath preserves nested cwd-relative segments", () => {
  const nested = cwdPath("src", "mcp-server.ts");
  assert.equal(isAbsolute(nested), true);
  assert.equal(nested.endsWith("src/mcp-server.ts"), true);
});

test("template root is expressed through repoPath", () => {
  assert.equal(templatesRoot(), repoPath("templates"));
});
