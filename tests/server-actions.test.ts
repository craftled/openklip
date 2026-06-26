import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exportProject,
  saveBroll,
  saveLook,
  saveProjectEdits,
  saveTitles,
  saveZooms,
} from "../app/actions.ts";
import { loadProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("saveProjectEdits persists word and caption edits", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await saveProjectEdits(slug, {
      words: [{ id: "w0", deleted: true }],
      captions: { enabled: false },
    });
    assert.equal(result.ok, true);
    const loaded = await loadProject(slug);
    assert.equal(loaded.words[0].deleted, true);
    assert.equal(loaded.captions.enabled, false);
  });
});

test("saveLook persists vignette toggle", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await saveLook(slug, { vignette: true });
    assert.equal(result.ok, true);
    assert.equal((await loadProject(slug)).look.vignette, true);
  });
});

test("saveZooms persists clamped zoom windows", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await saveZooms(slug, [
      {
        id: "z1",
        startSample: 0,
        endSample: 48_000,
        scale: 1.2,
        rampSec: 0.5,
      },
    ]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.zooms.length, 1);
    }
  });
});

test("saveBroll ignores unknown asset ids", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await saveBroll(slug, [
      {
        id: "br1",
        assetId: "missing",
        startSample: 0,
        endSample: 48_000,
        srcInSample: 0,
      },
    ]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.broll.length, 0);
    }
  });
});

test("saveTitles persists hero cards with two-line text", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await saveTitles(slug, [
      {
        id: "t-hero",
        text: "$90,000\nCheapest Citizenship Program",
        startSample: 0,
        endSample: 96_000,
        position: "hero",
      },
    ]);
    assert.equal(result.ok, true);
    const loaded = await loadProject(slug);
    assert.equal(loaded.titles[0].position, "hero");
    assert.match(loaded.titles[0].text, /\n/);
  });
});

test("saveProjectEdits returns ok:false for missing projects", async () => {
  await withTempProjectsRoot(async () => {
    const result = await saveProjectEdits("missing", {
      captions: { enabled: false },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /project not found/);
    }
  });
});

test("failed actions include a stack trace outside production", async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    await withTempProjectsRoot(async () => {
      const result = await saveProjectEdits("missing", {
        captions: { enabled: false },
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(typeof result.stack, "string");
      }
    });
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test("failed actions omit the stack trace in production", async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await withTempProjectsRoot(async () => {
      const result = await saveProjectEdits("missing", {
        captions: { enabled: false },
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.stack, undefined);
      }
    });
  } finally {
    process.env.NODE_ENV = prev;
  }
});

// exportProject delegates to exportCut, which runs ffmpeg on real media. We only
// cover ok:false paths here; a full success export would need ffmpeg, probe, and
// valid video inputs and is covered indirectly by exporter unit tests.
test("exportProject returns ok:false for missing projects", async () => {
  await withTempProjectsRoot(async () => {
    const result = await exportProject("missing");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /project\.json/);
    }
  });
});

test("exportProject returns ok:false when all words are cut", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: makeProject().words.map((w) => ({ ...w, deleted: true })),
      })
    );
    const result = await exportProject(slug);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /nothing to export/);
    }
  });
});
