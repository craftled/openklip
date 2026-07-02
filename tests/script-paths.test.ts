import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { repoPath } from "../src/repo-paths.ts";
import {
  graphicRuntimeEntryPath,
  transcribeScriptPath,
} from "../src/script-paths.ts";

// These scripts are spawned as sibling files at runtime. Resolving them via
// import.meta.dir breaks under the Next server bundle (Turbopack compiles it
// to undefined), so they must anchor at the repo root instead.
test("transcribe script resolves to a real file without import.meta.dir", () => {
  assert.equal(transcribeScriptPath(), repoPath("src", "transcribe.mjs"));
  assert.ok(existsSync(transcribeScriptPath()));
});

test("graphic runtime entry resolves to a real file without import.meta.dir", () => {
  assert.equal(
    graphicRuntimeEntryPath(),
    repoPath("src", "graphic-runtime-entry.ts")
  );
  assert.ok(existsSync(graphicRuntimeEntryPath()));
});
