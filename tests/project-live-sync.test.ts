import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideLiveSync,
  mergeExternalEditorProject,
  revisionFromProject,
} from "../web/lib/project-live-sync.ts";

test("decideLiveSync noops when remote matches synced", () => {
  assert.deepEqual(
    decideLiveSync({
      syncedRevision: 3,
      remoteRevision: 3,
      pendingSaves: 0,
    }),
    { action: "noop" }
  );
});

test("decideLiveSync noops when remote is behind (stale poll)", () => {
  assert.deepEqual(
    decideLiveSync({
      syncedRevision: 5,
      remoteRevision: 4,
      pendingSaves: 0,
    }),
    { action: "noop" }
  );
});

test("decideLiveSync fetches when remote is ahead and idle", () => {
  assert.deepEqual(
    decideLiveSync({
      syncedRevision: 2,
      remoteRevision: 5,
      pendingSaves: 0,
    }),
    { action: "fetch-project", remoteRevision: 5 }
  );
});

test("decideLiveSync noops while GUI saves are pending", () => {
  assert.deepEqual(
    decideLiveSync({
      syncedRevision: 2,
      remoteRevision: 9,
      pendingSaves: 1,
    }),
    { action: "noop" }
  );
});

test("decideLiveSync noops while a project fetch is already in flight", () => {
  assert.deepEqual(
    decideLiveSync({
      syncedRevision: 2,
      remoteRevision: 9,
      pendingSaves: 0,
      fetchInFlight: true,
    }),
    { action: "noop" }
  );
});

test("mergeExternalEditorProject keeps client-only fields", () => {
  const prev = {
    slug: "demo",
    revision: 1,
    words: [{ id: "w0", text: "old" }],
    brief: "keep me",
    dirPath: "/Movies/OpenKlip/demo",
    mediaVersion: 12_345,
    silences: [{ startSample: 0, endSample: 100 }],
  };
  const remote = {
    slug: "demo",
    revision: 4,
    words: [{ id: "w0", text: "new", deleted: true }],
    padMs: 80,
  };
  const merged = mergeExternalEditorProject(prev, remote);
  assert.equal(merged.revision, 4);
  assert.equal(merged.words[0].text, "new");
  assert.equal(merged.padMs, 80);
  assert.equal(merged.brief, "keep me");
  assert.equal(merged.dirPath, "/Movies/OpenKlip/demo");
  assert.equal(merged.mediaVersion, 12_345);
  assert.deepEqual(merged.silences, [{ startSample: 0, endSample: 100 }]);
});

test("revisionFromProject defaults missing/invalid to 0", () => {
  assert.equal(revisionFromProject({}), 0);
  assert.equal(revisionFromProject({ revision: null }), 0);
  assert.equal(revisionFromProject({ revision: 7 }), 7);
});
