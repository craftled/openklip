import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetRemovedToast,
  assetRemoveFailedToast,
  assetsSyncedToast,
  assetUploadFailedToast,
  assetUploadSuccessToast,
  chatArchiveFailedToast,
  chatAssetUploadSuccessToast,
  chatDeleteFailedToast,
  chatEnsureFailedToast,
  chatRenameFailedToast,
  chatSendFailedToast,
  chatUnarchiveFailedToast,
  countNewAssetIds,
  exportFailedToast,
  exportPromiseMessages,
  exportSuccessToast,
  findFillerFailedToast,
  findFillerLoadingMessage,
  findFillerPromiseMessages,
  findFillerSuccessToast,
  nothingToPlayToast,
  playbackFailedToast,
  projectCreateFailedToast,
  projectDeletedToast,
  projectDeleteFailedToast,
  projectIngestLoadingMessage,
  proxyExportWarningToast,
  revealFailedToast,
  revertFailedToast,
  revertSucceededToast,
  saveFailedToast,
  transitionFallbackToast,
  workspacePickerToasts,
  workspacePickFailedToast,
} from "../web/lib/toast-notifications.ts";

test("saveFailedToast", () => {
  assert.deepEqual(saveFailedToast("network"), {
    kind: "error",
    title: "Could not save edit",
    description: "network",
  });
});

test("exportSuccessToast formats cut summary", () => {
  assert.deepEqual(
    exportSuccessToast({
      ranges: 12,
      height: 1080,
      durationSec: 45.23,
      out: "output/out.mp4",
    }),
    {
      kind: "success",
      title: "Export complete",
      description: "12 cuts @ 1080p (45.2s) · output/out.mp4",
    }
  );
});

test("exportFailedToast", () => {
  assert.deepEqual(exportFailedToast("Empty cut"), {
    kind: "error",
    title: "Export failed",
    description: "Empty cut",
  });
});

test("proxyExportWarningToast: info toast when exporting from proxy", () => {
  const payload = proxyExportWarningToast(
    "Original source missing; exports use the 720p proxy."
  );
  assert.equal(payload?.kind, "info");
  assert.equal(payload?.title, "Exporting from proxy");
  assert.match(payload?.description ?? "", /720p proxy/);
});

test("proxyExportWarningToast: null when no warning", () => {
  assert.equal(proxyExportWarningToast(undefined), null);
});

test("transitionFallbackToast: null when no transition was requested", () => {
  assert.equal(transitionFallbackToast({ type: "none", applied: false }), null);
});

test("transitionFallbackToast: null when the requested transition applied", () => {
  assert.equal(
    transitionFallbackToast({ type: "crossfade", applied: true }),
    null
  );
});

test("transitionFallbackToast: info toast explaining the fallback when overlays are present", () => {
  const payload = transitionFallbackToast({
    type: "crossfade",
    applied: false,
    reason: "overlays-present",
  });
  assert.equal(payload?.kind, "info");
  assert.equal(payload?.title, "Transition not applied");
  assert.match(payload?.description ?? "", /crossfade/);
  assert.match(payload?.description ?? "", /b-roll or rich graphics present/);
});

test("transitionFallbackToast: info toast for dip requested but too few ranges", () => {
  const payload = transitionFallbackToast({
    type: "dip",
    applied: false,
    reason: "too-few-ranges",
  });
  assert.equal(payload?.kind, "info");
  assert.match(payload?.description ?? "", /dip/);
  assert.match(payload?.description ?? "", /fewer than two kept ranges/);
});

test("nothingToPlayToast", () => {
  assert.deepEqual(nothingToPlayToast(), {
    kind: "info",
    title: "Nothing to play",
    description: "All words in the transcript are cut.",
  });
});

test("playbackFailedToast", () => {
  assert.deepEqual(playbackFailedToast("blocked"), {
    kind: "error",
    title: "Playback failed",
    description: "blocked",
  });
});

test("assetUploadSuccessToast singular and plural", () => {
  assert.deepEqual(assetUploadSuccessToast(1), {
    kind: "success",
    title: "Asset added",
  });
  assert.deepEqual(assetUploadSuccessToast(3), {
    kind: "success",
    title: "3 assets added",
  });
});

test("assetUploadFailedToast", () => {
  assert.deepEqual(assetUploadFailedToast("proxy build failed"), {
    kind: "error",
    title: "Upload failed",
    description: "proxy build failed",
  });
});

test("assetRemovedToast includes optional name", () => {
  assert.deepEqual(assetRemovedToast("clip.mp4"), {
    kind: "success",
    title: "Asset removed",
    description: "clip.mp4",
  });
  assert.deepEqual(assetRemovedToast(), {
    kind: "success",
    title: "Asset removed",
  });
});

test("assetRemoveFailedToast", () => {
  assert.deepEqual(assetRemoveFailedToast("in use"), {
    kind: "error",
    title: "Could not remove asset",
    description: "in use",
  });
});

test("countNewAssetIds returns ids not yet known", () => {
  const known = new Set(["a1"]);
  assert.deepEqual(
    countNewAssetIds(known, [
      { id: "a1", name: "old" },
      { id: "a2", name: "new" },
    ]),
    ["a2"]
  );
});

test("assetsSyncedToast returns null when nothing new", () => {
  assert.equal(assetsSyncedToast(0), null);
});

test("assetsSyncedToast singular and plural", () => {
  assert.deepEqual(assetsSyncedToast(1), {
    kind: "info",
    title: "Synced 1 new asset",
    description: "Registered from the assets folder.",
  });
  assert.deepEqual(assetsSyncedToast(2), {
    kind: "info",
    title: "Synced 2 new assets",
    description: "Registered from the assets folder.",
  });
});

test("project lifecycle toasts", () => {
  assert.deepEqual(projectCreateFailedToast("ingest failed"), {
    kind: "error",
    title: "Could not create project",
    description: "ingest failed",
  });
  assert.deepEqual(projectDeletedToast(), {
    kind: "success",
    title: "Project deleted",
  });
  assert.deepEqual(projectDeleteFailedToast("locked"), {
    kind: "error",
    title: "Could not delete project",
    description: "locked",
  });
  assert.equal(projectIngestLoadingMessage(), "Ingesting video…");
});

test("workspacePickerToasts on cancelled returns empty", () => {
  assert.deepEqual(workspacePickerToasts({ cancelled: true }), []);
});

test("workspacePickerToasts on empty folder", () => {
  assert.deepEqual(
    workspacePickerToasts({ root: "/Users/me/projects", projects: [] }),
    [
      {
        kind: "success",
        title: "Workspace folder set",
        description: "/Users/me/projects",
      },
      {
        kind: "info",
        title: "No projects yet",
        description:
          "Run openklip ingest <video> to create one in this folder.",
      },
    ]
  );
});

test("workspacePickerToasts when projects exist only confirms folder", () => {
  assert.deepEqual(
    workspacePickerToasts({
      root: "/Users/me/projects",
      projects: [{ slug: "demo" }],
    }),
    [
      {
        kind: "success",
        title: "Workspace folder set",
        description: "/Users/me/projects",
      },
    ]
  );
});

test("workspacePickFailedToast", () => {
  assert.deepEqual(workspacePickFailedToast("osascript denied"), {
    kind: "error",
    title: "Could not choose folder",
    description: "osascript denied",
  });
});

test("revealFailedToast", () => {
  assert.deepEqual(revealFailedToast("not macOS"), {
    kind: "error",
    title: "Could not open in Finder",
    description: "not macOS",
  });
});

test("chat thread failure toasts", () => {
  assert.deepEqual(chatRenameFailedToast("404"), {
    kind: "error",
    title: "Could not rename chat",
    description: "404",
  });
  assert.deepEqual(chatArchiveFailedToast("500"), {
    kind: "error",
    title: "Could not archive chat",
    description: "500",
  });
  assert.deepEqual(chatUnarchiveFailedToast("500"), {
    kind: "error",
    title: "Could not restore chat",
    description: "500",
  });
  assert.deepEqual(chatDeleteFailedToast("500"), {
    kind: "error",
    title: "Could not delete chat",
    description: "500",
  });
  assert.deepEqual(chatEnsureFailedToast("500"), {
    kind: "error",
    title: "Could not start chat",
    description: "500",
  });
  assert.deepEqual(chatSendFailedToast("timeout"), {
    kind: "error",
    title: "Could not send message",
    description: "timeout",
  });
});

test("findFiller toast messages", () => {
  assert.equal(
    findFillerLoadingMessage("Claude"),
    "Claude is reading the transcript…"
  );
  assert.deepEqual(
    findFillerSuccessToast({ cut: 2, words: [{ id: "w1", text: "um" }] }),
    {
      kind: "success",
      title: "Cut 2 filler words",
      description: 'w1 "um"',
    }
  );
  assert.deepEqual(findFillerSuccessToast({ cut: 0, words: [] }), {
    kind: "success",
    title: "No filler words found",
  });
  assert.deepEqual(findFillerFailedToast("agent offline"), {
    kind: "error",
    title: "Find filler failed",
    description: "agent offline",
  });
});

test("findFillerPromiseMessages maps provider label and result", () => {
  const messages = findFillerPromiseMessages("Claude");
  assert.equal(messages.loading, "Claude is reading the transcript…");
  assert.equal(
    messages.success({ cut: 1, words: [] }).message,
    "Cut 1 filler word"
  );
  assert.equal(
    messages.error(new Error("offline")).message,
    "Find filler failed"
  );
});

test("exportPromiseMessages formats loading, success, and error", () => {
  const messages = exportPromiseMessages();
  assert.equal(messages.loading, "Exporting MP4…");
  assert.deepEqual(
    messages.success({
      ranges: 2,
      height: 720,
      durationSec: 4.2,
      out: "output/out.mp4",
    }),
    {
      message: "Export complete",
      description: "2 cuts @ 720p (4.2s) · output/out.mp4",
    }
  );
  assert.equal(messages.error(new Error("empty")).message, "Export failed");
});

test("chatAssetUploadSuccessToast adds bin hint", () => {
  assert.deepEqual(chatAssetUploadSuccessToast(2), {
    kind: "success",
    title: "2 assets added",
    description: "Available in the asset bin.",
  });
});

test("revertSucceededToast formats the restored and new revisions", () => {
  assert.deepEqual(revertSucceededToast({ revision: 3, restoredTo: 0 }), {
    kind: "success",
    title: "Reverted",
    description: "Restored revision 0 (now revision 3)",
  });
});

test("revertFailedToast", () => {
  assert.deepEqual(revertFailedToast("nothing to revert"), {
    kind: "error",
    title: "Could not revert",
    description: "nothing to revert",
  });
});
