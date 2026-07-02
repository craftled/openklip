import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exportProject,
  loadBriefAction,
  revealProjectFolder,
  runGuiAction,
  saveBrief,
  saveBroll,
  saveLook,
  saveProjectEdits,
  saveStills,
  saveTitles,
  saveZooms,
} from "../app/actions.ts";
import { readActionLog } from "../src/action-log.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import type { ExportCompression } from "../src/exporter.ts";
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

test("runGuiAction persists registry-backed GUI actions", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const vignette = await runGuiAction(slug, "look-vignette", {
      vignette: true,
    });
    assert.equal(vignette.ok, true);
    const captions = await runGuiAction(slug, "captions", { enabled: false });
    assert.equal(captions.ok, true);
    const captionMax = await runGuiAction(slug, "captions-max", {
      maxWords: 4,
    });
    assert.equal(captionMax.ok, true);
    const motion = await runGuiAction(slug, "motion", { speed: 1.4 });
    assert.equal(motion.ok, true);

    const loaded = await loadProject(slug);
    assert.equal(loaded.look.vignette, true);
    assert.equal(loaded.captions.enabled, false);
    assert.equal(loaded.captions.maxWords, 4);
    assert.equal(loaded.motion?.speed, 1.4);
  });
});

test("runGuiAction rejects unknown actions", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runGuiAction(slug, "does-not-exist", {});
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /unknown GUI action/);
    }
  });
});

// ── MILESTONE 3.1: UI phrase search and batch cuts through the GUI surface ──

function phraseWords(texts: string[]) {
  return texts.map((text, i) => ({
    id: `w${i}`,
    text,
    startSample: i * SAMPLE_RATE,
    endSample: (i + 1) * SAMPLE_RATE,
    deleted: false,
  }));
}

test("runGuiAction cut-text cuts every match and carries the note", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: phraseWords(["you", "know", "this", "you", "know"]),
      })
    );
    const result = await runGuiAction(slug, "cut-text", {
      phrase: "you know",
      all: true,
      note: "filler",
    });
    assert.equal(result.ok, true);
    const loaded = await loadProject(slug);
    const byId = new Map(loaded.words.map((w) => [w.id, w]));
    for (const id of ["w0", "w1", "w3", "w4"]) {
      assert.equal(byId.get(id)?.deleted, true, `${id} not cut`);
      assert.equal(byId.get(id)?.note, "filler", `${id} missing note`);
    }
    assert.equal(byId.get("w2")?.deleted, false);
  });
});

test("runGuiAction cut with deleted:false restores words", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    project.words[0].deleted = true;
    writeFixtureProject(slug, project);
    const result = await runGuiAction(slug, "cut", {
      ids: ["w0"],
      deleted: false,
    });
    assert.equal(result.ok, true);
    const loaded = await loadProject(slug);
    assert.equal(loaded.words[0].deleted, false);
  });
});

test("runGuiAction cut-text flags a phrase-anchored overlay stale", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    project.broll = [
      {
        id: "br1",
        assetId: "broll-a",
        startSample: SAMPLE_RATE,
        endSample: 2 * SAMPLE_RATE,
        srcInSample: 0,
        anchor: { phrase: "world", wordIds: ["w1"], stale: false },
      },
    ];
    writeFixtureProject(slug, project);
    const result = await runGuiAction(slug, "cut-text", { phrase: "world" });
    assert.equal(result.ok, true);
    const loaded = await loadProject(slug);
    assert.equal(loaded.broll[0].anchor?.stale, true);
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

test("saveStills persists clamped still overlays", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({
      slug,
      assets: [
        {
          id: "shot1",
          kind: "still",
          name: "shot1.png",
          src: "/tmp/shot1.png",
          proxy: "working/assets/shot1.png",
          durationSamples: 48_000 * 5,
        },
      ],
    });
    writeFixtureProject(slug, project);
    const result = await saveStills(slug, [
      {
        id: "s1",
        assetId: "shot1",
        startSample: 0,
        endSample: 96_000,
        scale: 1.2,
        focusX: 0.5,
        focusY: 0.5,
      },
    ]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.stills.length, 1);
    }
    const loaded = await loadProject(slug);
    assert.equal(loaded.stills?.length, 1);
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

test("exportProject rejects out-of-bounds options before any export work", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // The fixture has no real media, so reaching exportCut would fail with a
    // missing-source error; matching the validation copy proves the request
    // failed fast before ffmpeg (or any export work) was invoked.
    const badFps = await exportProject(slug, { fps: 1e9 });
    assert.equal(badFps.ok, false);
    if (!badFps.ok) {
      assert.match(badFps.error, /fps must be an integer between 1 and 120/);
    }
    const badCompression = await exportProject(slug, {
      compression: "ultra" as ExportCompression,
    });
    assert.equal(badCompression.ok, false);
    if (!badCompression.ok) {
      assert.match(badCompression.error, /unknown compression preset "ultra"/);
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

// ── ACTION HISTORY: GUI mutations are recorded with actor "human" ───────────

test("runGuiAction records a history entry with actor human", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runGuiAction(slug, "look-vignette", {
      vignette: true,
    });
    assert.equal(result.ok, true);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "look-vignette");
    assert.equal(entries[0].actor, "human");
    assert.equal(entries[0].revisionBefore, 0);
    assert.equal(entries[0].revisionAfter, 1);
  });
});

test("saveProjectEdits records an edit-words history entry", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await saveProjectEdits(slug, {
      words: [{ id: "w0", deleted: true }],
    });
    assert.equal(result.ok, true);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "edit-words");
    assert.equal(entries[0].actor, "human");
  });
});

// ── PROJECT BRIEF: saveBrief / loadBriefAction server actions ───────────────

test("saveBrief server action round-trips through loadBriefAction", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const saved = await saveBrief(
      slug,
      "Audience: founders. Goal: ship the demo."
    );
    assert.equal(saved.ok, true);
    const loaded = await loadBriefAction(slug);
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(
        loaded.data.brief,
        "Audience: founders. Goal: ship the demo."
      );
    }
  });
});

test("saveBrief with empty text clears the brief", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await saveBrief(slug, "Some content");
    const cleared = await saveBrief(slug, "   ");
    assert.equal(cleared.ok, true);
    const loaded = await loadBriefAction(slug);
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(loaded.data.brief, null);
    }
  });
});

test("loadBriefAction on a project with no brief.md returns ok with brief null", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const loaded = await loadBriefAction(slug);
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(loaded.data.brief, null);
    }
  });
});

test("revealProjectFolder rejects invalid slug", async () => {
  const result = await revealProjectFolder("../etc");
  assert.equal(result.ok, false);
});

test("revealProjectFolder rejects missing project", async () => {
  await withTempProjectsRoot(async () => {
    const result = await revealProjectFolder("missing-project");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /project not found/);
    }
  });
});
