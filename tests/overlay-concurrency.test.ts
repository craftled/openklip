// CRAFT-6177: prevent stale GUI overlay saves from overwriting CLI/MCP edits.
//
// The bug: web/hooks/use-overlay-editors.ts used to build a COMPLETE
// zoom/b-roll/title/still array from the browser's `project` snapshot and
// submit it as a whole-track REPLACEMENT via saveZooms/saveBroll/saveTitles/
// saveStills. If the CLI or an MCP agent added/changed an overlay after the
// browser's snapshot was taken, the next GUI save silently deleted it.
//
// The fix: add/update/remove now route through ID-scoped registry actions
// (zoom-add/-set/-rm, broll-add/-set/-rm, title-add/-set/-rm,
// still-add/-set/-rm) via runGuiAction, which only ever touch the ONE overlay
// named by id and always operate on the freshly-loaded server project - a
// stale browser snapshot can't cause them to drop an overlay they never knew
// about. The one remaining whole-track op (b-roll paint-order reorder) keeps
// sending the full array, but now guarded by an optional `expectedRevision`
// compare-and-swap on saveBroll: a stale reorder is rejected outright instead
// of silently clobbering a concurrent edit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runGuiAction, saveBroll, saveZooms } from "../app/actions.ts";
import { readActionLog } from "../src/action-log.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { loadProject, mutateProject } from "../src/projectStore.ts";
import { runAction } from "../src/registry.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// ── 1. Interleaving survives (the core acceptance) ──────────────────────────

test("a stale GUI zoom edit does not delete a concurrently CLI-added zoom on the same track", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    project.zooms = [
      {
        id: "z-existing",
        startSample: 0,
        endSample: SAMPLE_RATE,
        scale: 1.1,
        rampSec: 0.3,
      },
    ];
    writeFixtureProject(slug, project);

    // The browser loads the project - this snapshot predates the CLI's add.
    const clientSnapshot = await loadProject(slug);
    assert.equal(clientSnapshot.zooms.length, 1);

    // CLI/MCP concurrently adds a new zoom via the registry action directly,
    // bumping the revision. The browser has no idea this happened.
    await mutateProject(
      slug,
      (p) => runAction("zoom-add", p, { fromSec: 5, toSec: 6 }),
      { action: "zoom-add", actor: "cli" }
    );
    const afterCli = await loadProject(slug);
    assert.equal(afterCli.zooms.length, 2);
    const cliZoom = afterCli.zooms.find((z) => z.id !== "z-existing");
    assert.ok(cliZoom, "CLI zoom-add did not persist");

    // The GUI, still working off its stale (pre-CLI-add) snapshot, edits a
    // DIFFERENT zoom - exactly what use-overlay-editors.ts's updateZoom now
    // sends: an id-scoped patch, not a whole-array replace.
    const result = await runGuiAction(slug, "zoom-set", {
      id: "z-existing",
      scale: 1.5,
    });
    assert.equal(result.ok, true);

    const finalProject = await loadProject(slug);
    assert.equal(
      finalProject.zooms.length,
      2,
      "a zoom went missing after the GUI save"
    );
    assert.ok(
      finalProject.zooms.some((z) => z.id === cliZoom?.id),
      "CLI-added zoom was deleted by the stale GUI save"
    );
    const existing = finalProject.zooms.find((z) => z.id === "z-existing");
    assert.equal(existing?.scale, 1.5, "GUI's zoom edit did not apply");
  });
});

// Characterizes the actual bug being fixed: the OLD calling convention
// (use-overlay-editors.ts building a whole zooms array from its stale
// client snapshot and calling saveZooms) really does delete a concurrently
// CLI-added zoom, because applyZooms/clampZoomItems is a blind replace with
// no notion of "an id I've never seen." This is exactly why the fix converts
// the hook to the id-scoped zoom-set call exercised above instead of ever
// reaching for saveZooms on an add/update/remove path.
test("characterization: the legacy whole-array saveZooms path does lose a concurrently CLI-added zoom", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    project.zooms = [
      {
        id: "z-existing",
        startSample: 0,
        endSample: SAMPLE_RATE,
        scale: 1.1,
        rampSec: 0.3,
      },
    ];
    writeFixtureProject(slug, project);

    const clientSnapshot = await loadProject(slug);
    await mutateProject(
      slug,
      (p) => runAction("zoom-add", p, { fromSec: 5, toSec: 6 }),
      { action: "zoom-add", actor: "cli" }
    );
    const afterCli = await loadProject(slug);
    assert.equal(afterCli.zooms.length, 2);

    // Old hook behavior: whole array rebuilt from the stale snapshot.
    const staleZooms = clientSnapshot.zooms.map((z) =>
      z.id === "z-existing" ? { ...z, scale: 1.5 } : z
    );
    const legacyResult = await saveZooms(slug, staleZooms);
    assert.equal(legacyResult.ok, true);

    const afterLegacySave = await loadProject(slug);
    assert.equal(
      afterLegacySave.zooms.length,
      1,
      "documents the bug: the legacy whole-array save drops the CLI zoom"
    );
  });
});

test("a stale GUI b-roll add does not delete a concurrently CLI-added b-roll clip", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);

    // Browser snapshot: no b-roll yet.
    const clientSnapshot = await loadProject(slug);
    assert.equal(clientSnapshot.broll.length, 0);

    // CLI/MCP adds a b-roll clip the browser doesn't know about.
    await mutateProject(
      slug,
      (p) =>
        runAction("broll-add", p, {
          assetId: "broll-a",
          fromSec: 4,
          toSec: 5,
        }),
      { action: "broll-add", actor: "cli" }
    );
    const afterCli = await loadProject(slug);
    assert.equal(afterCli.broll.length, 1);
    const cliBroll = afterCli.broll[0];

    // The GUI, from its stale snapshot, adds its OWN b-roll clip - an
    // id-scoped add, so it can never know about (or clobber) the CLI's clip.
    const result = await runGuiAction(slug, "broll-add", {
      assetId: "broll-a",
      fromSec: 0,
      toSec: 1,
    });
    assert.equal(result.ok, true);

    const finalProject = await loadProject(slug);
    assert.equal(finalProject.broll.length, 2, "a b-roll clip went missing");
    assert.ok(
      finalProject.broll.some((b) => b.id === cliBroll.id),
      "CLI-added b-roll clip was deleted by the stale GUI add"
    );
  });
});

// ── 2. Stale reorder rejected; fresh reorder succeeds ────────────────────────

test("a stale reorder is rejected and does not overwrite a concurrent change", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    project.broll = [
      {
        id: "b1",
        assetId: "broll-a",
        startSample: 0,
        endSample: SAMPLE_RATE,
        srcInSample: 0,
        display: "cover",
      },
      {
        id: "b2",
        assetId: "broll-a",
        startSample: SAMPLE_RATE,
        endSample: 2 * SAMPLE_RATE,
        srcInSample: 0,
        display: "cover",
      },
    ];
    writeFixtureProject(slug, project);

    const clientSnapshot = await loadProject(slug);
    const expectedRevision = clientSnapshot.revision ?? 0;

    // CLI/MCP concurrently patches b1, bumping the revision the browser
    // doesn't know about yet.
    await mutateProject(
      slug,
      (p) => runAction("broll-set", p, { id: "b1", display: "pip" }),
      { action: "broll-set", actor: "cli" }
    );
    const afterCli = await loadProject(slug);
    assert.equal(afterCli.revision, expectedRevision + 1);

    // Stale reorder: the whole array, built from the pre-CLI snapshot, sent
    // with the OLD (now-stale) expected revision.
    const staleReordered = [clientSnapshot.broll[1], clientSnapshot.broll[0]];
    const staleResult = await saveBroll(slug, staleReordered, expectedRevision);
    assert.equal(staleResult.ok, false);
    if (!staleResult.ok) {
      assert.match(staleResult.error, /revision/i);
    }

    const afterStale = await loadProject(slug);
    assert.equal(
      afterStale.broll.find((b) => b.id === "b1")?.display,
      "pip",
      "the rejected stale reorder overwrote the CLI's concurrent change"
    );
    assert.equal(
      afterStale.revision,
      expectedRevision + 1,
      "a rejected save must not bump the revision"
    );

    // A fresh reorder (correct current revision) succeeds normally.
    const freshSnapshot = await loadProject(slug);
    const freshRevision = freshSnapshot.revision ?? 0;
    const freshReordered = [freshSnapshot.broll[1], freshSnapshot.broll[0]];
    const freshResult = await saveBroll(slug, freshReordered, freshRevision);
    assert.equal(freshResult.ok, true);

    const afterFresh = await loadProject(slug);
    assert.deepEqual(
      afterFresh.broll.map((b) => b.id),
      ["b2", "b1"]
    );
    assert.equal(afterFresh.revision, freshRevision + 1);
  });
});

test("saveBroll without an expectedRevision keeps its old (unguarded) behavior", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await saveBroll(slug, [
      {
        id: "br1",
        assetId: "broll-a",
        startSample: 0,
        endSample: SAMPLE_RATE,
        srcInSample: 0,
      },
    ]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.broll.length, 1);
      assert.equal(result.data.revision, 1);
    }
  });
});

// ── 3. Add/set/remove correctness across all four overlay kinds ─────────────

test("id-scoped overlay add/set/remove works for zoom, broll, title, still", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({
      slug,
      assets: [
        {
          id: "broll-a",
          kind: "broll",
          name: "b.mp4",
          src: "/tmp/b.mp4",
          proxy: "working/assets/b.mp4",
          durationSamples: SAMPLE_RATE * 30,
        },
        {
          id: "still-a",
          kind: "still",
          name: "s.png",
          src: "/tmp/s.png",
          proxy: "working/assets/s.png",
          durationSamples: SAMPLE_RATE * 30,
        },
      ],
    });
    writeFixtureProject(slug, project);

    // zoom
    const zoomAdd = await runGuiAction(slug, "zoom-add", {
      fromSec: 0,
      toSec: 1,
    });
    assert.equal(zoomAdd.ok, true);
    const zoomId = zoomAdd.ok ? (zoomAdd.data.result as { id: string }).id : "";
    const zoomSet = await runGuiAction(slug, "zoom-set", {
      id: zoomId,
      scale: 1.4,
    });
    assert.equal(zoomSet.ok, true);
    let loaded = await loadProject(slug);
    assert.equal(loaded.zooms.find((z) => z.id === zoomId)?.scale, 1.4);
    const zoomRm = await runGuiAction(slug, "zoom-rm", { id: zoomId });
    assert.equal(zoomRm.ok, true);
    loaded = await loadProject(slug);
    assert.equal(
      loaded.zooms.find((z) => z.id === zoomId),
      undefined
    );

    // broll
    const brollAdd = await runGuiAction(slug, "broll-add", {
      assetId: "broll-a",
      fromSec: 0,
      toSec: 1,
    });
    assert.equal(brollAdd.ok, true);
    const brollId = brollAdd.ok
      ? (brollAdd.data.result as { id: string }).id
      : "";
    const brollSet = await runGuiAction(slug, "broll-set", {
      id: brollId,
      display: "pip",
    });
    assert.equal(brollSet.ok, true);
    loaded = await loadProject(slug);
    assert.equal(loaded.broll.find((b) => b.id === brollId)?.display, "pip");
    const brollRm = await runGuiAction(slug, "broll-rm", { id: brollId });
    assert.equal(brollRm.ok, true);
    loaded = await loadProject(slug);
    assert.equal(
      loaded.broll.find((b) => b.id === brollId),
      undefined
    );

    // title
    const titleAdd = await runGuiAction(slug, "title-add", {
      fromSec: 0,
      toSec: 1,
      text: "Hello",
    });
    assert.equal(titleAdd.ok, true);
    const titleId = titleAdd.ok
      ? (titleAdd.data.result as { id: string }).id
      : "";
    const titleSet = await runGuiAction(slug, "title-set", {
      id: titleId,
      text: "Updated",
    });
    assert.equal(titleSet.ok, true);
    loaded = await loadProject(slug);
    assert.equal(loaded.titles.find((t) => t.id === titleId)?.text, "Updated");
    const titleRm = await runGuiAction(slug, "title-rm", { id: titleId });
    assert.equal(titleRm.ok, true);
    loaded = await loadProject(slug);
    assert.equal(
      loaded.titles.find((t) => t.id === titleId),
      undefined
    );

    // still
    const stillAdd = await runGuiAction(slug, "still-add", {
      assetId: "still-a",
      fromSec: 0,
      toSec: 1,
    });
    assert.equal(stillAdd.ok, true);
    const stillId = stillAdd.ok
      ? (stillAdd.data.result as { id: string }).id
      : "";
    const stillSet = await runGuiAction(slug, "still-set", {
      id: stillId,
      scale: 1.5,
    });
    assert.equal(stillSet.ok, true);
    loaded = await loadProject(slug);
    assert.equal(loaded.stills?.find((s) => s.id === stillId)?.scale, 1.5);
    const stillRm = await runGuiAction(slug, "still-rm", { id: stillId });
    assert.equal(stillRm.ok, true);
    loaded = await loadProject(slug);
    assert.equal(
      loaded.stills?.find((s) => s.id === stillId),
      undefined
    );
  });
});

// ── 4. History + provenance remain correct ───────────────────────────────────

test("id-scoped zoom-add records history with actor human and bumps revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runGuiAction(slug, "zoom-add", {
      fromSec: 0,
      toSec: 1,
    });
    assert.equal(result.ok, true);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "zoom-add");
    assert.equal(entries[0].actor, "human");
    assert.equal(entries[0].revisionBefore, 0);
    assert.equal(entries[0].revisionAfter, 1);
    const loaded = await loadProject(slug);
    assert.equal(loaded.revision, 1);
  });
});

test("a rejected stale reorder does not write a history entry or bump the revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    project.broll = [
      {
        id: "b1",
        assetId: "broll-a",
        startSample: 0,
        endSample: SAMPLE_RATE,
        srcInSample: 0,
        display: "cover",
      },
    ];
    writeFixtureProject(slug, project);
    const result = await saveBroll(slug, project.broll, 5);
    assert.equal(result.ok, false);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 0);
    const loaded = await loadProject(slug);
    assert.equal(loaded.revision ?? 0, 0);
  });
});
