import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseCropMode } from "../scripts/agent-make-short.ts";
import { setExportSettings } from "../src/actions.ts";
import type { Project } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { resolvePlatformOptions } from "../src/export-platforms.ts";
import { loadProject, mutateProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function makeProjectWithExport(overrides: Partial<Project> = {}): Project {
  return makeProject({
    export: {
      aspect: "source",
      crop: { focusX: 0.25, focusY: 0.5, scale: 1 },
      cropMode: "manual",
    },
    ...overrides,
  });
}

test("make-short: setExportSettings applies 9:16 scene mode when sceneLog present", () => {
  const project = makeProjectWithExport({
    sceneLog: {
      segments: [
        {
          fromSec: 0,
          toSec: 30,
          summary: "speaker on camera",
          onScreen: "speaker",
          focusX: 0.2,
          focusY: 0.7,
        },
      ],
      analyzedAt: "2026-07-03T00:00:00Z",
    },
  });

  setExportSettings(project, { aspect: "9:16", cropMode: "scene" });

  assert.equal(project.export?.aspect, "9:16");
  assert.equal(project.export?.cropMode, "scene");
  assert.equal(project.export?.crop.focusX, 0.2);
  assert.equal(project.export?.crop.focusY, 0.7);
});

test("make-short: without sceneLog, manual mode preserves existing crop focus", () => {
  const project = makeProjectWithExport();

  setExportSettings(project, { aspect: "9:16", cropMode: "manual" });

  assert.equal(project.export?.aspect, "9:16");
  assert.equal(project.export?.cropMode, "manual");
  // manual mode with no explicit input.crop leaves the existing focusX intact
  assert.equal(project.export?.crop.focusX, 0.25);
});

test("make-short: scene mode with no sceneLog falls back to current crop", () => {
  const project = makeProjectWithExport();
  // no sceneLog: suggestCropFromSceneLog returns null, crop stays as current

  setExportSettings(project, { aspect: "9:16", cropMode: "scene" });

  assert.equal(project.export?.aspect, "9:16");
  assert.equal(project.export?.cropMode, "scene");
  // suggestion is null (no sceneLog), so current crop is kept
  assert.equal(project.export?.crop.focusX, 0.25);
});

test("make-short: shorts platform preset resolves 9:16 1920p 30fps social", () => {
  const resolved = resolvePlatformOptions("shorts", {});
  assert.equal(resolved.aspect, "9:16");
  assert.equal(resolved.maxHeight, 1920);
  assert.equal(resolved.fps, 30);
  assert.equal(resolved.compression, "social");
  assert.equal(resolved.loudnessTargetLufs, -14);
});

test("make-short: chooseCropMode returns scene when sceneLog present", () => {
  const withScene = makeProject({
    sceneLog: {
      segments: [
        { fromSec: 0, toSec: 10, summary: "speaker", onScreen: "speaker" },
      ],
      analyzedAt: "2026-07-03T00:00:00Z",
    },
  });
  assert.equal(chooseCropMode(withScene), "scene");

  const withoutScene = makeProject();
  assert.equal(chooseCropMode(withoutScene), "manual");
});

test("make-short: mutateProject persists export settings", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({
      slug,
      export: {
        aspect: "source",
        crop: { focusX: 0.25, focusY: 0.5, scale: 1 },
        cropMode: "manual",
      },
      sceneLog: {
        segments: [
          {
            fromSec: 0,
            toSec: SAMPLE_RATE * 10,
            summary: "speaker on camera",
            onScreen: "speaker",
          },
        ],
        analyzedAt: "2026-07-03T00:00:00Z",
      },
    });
    writeFixtureProject(slug, project);

    await mutateProject(
      slug,
      (p) => {
        setExportSettings(p, { aspect: "9:16", cropMode: "scene" });
      },
      { action: "export-set", actor: "agent" }
    );

    const saved = await loadProject(slug);
    assert.equal(saved.export?.aspect, "9:16");
    assert.equal(saved.export?.cropMode, "scene");
    // history revision was bumped
    assert.ok(
      (saved.revision ?? 0) > 0,
      "revision should be > 0 after logged mutation"
    );
  });
});
