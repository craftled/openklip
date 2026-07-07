import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildExportVerificationReport } from "../src/export-verification-report.ts";
import { MAP_MOTION_CATALOG } from "../src/map-motion.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const sec = (n: number) => n * 48_000;

test("buildExportVerificationReport preserves verifyCut report and returns clean deterministic checks", async () => {
  await withTempProjectsRoot(({ slug }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    const p = projectPaths(slug);
    mkdirSync(join(p.dir, "assets"), { recursive: true });
    mkdirSync(join(p.working, "assets"), { recursive: true });
    writeFileSync("/tmp/b-roll.mp4", "source");
    writeFileSync(join(p.working, "assets", "broll-a.mp4"), "proxy");

    const report = buildExportVerificationReport(project, {
      slug,
      transcript: {
        fillerSurvivors: [],
        keptCoverage: 1,
        leakedDeleted: [],
        missingKept: [],
        ok: true,
        renderedWordCount: 2,
      },
    });

    assert.equal(report.ok, true);
    assert.equal(report.transcript?.ok, true);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.checks.missingAssets.length, 0);
    assert.equal(report.checks.staleAnchors.length, 0);
    assert.equal(report.checks.invalidGraphics.length, 0);
  });
});

test("buildExportVerificationReport reports stale anchors, missing assets, invalid json specs, and transition fallback", async () => {
  await withTempProjectsRoot(({ slug }) => {
    const project = makeProject({
      slug,
      durationSamples: sec(3),
      words: [
        {
          id: "w0",
          text: "Keep",
          startSample: 0,
          endSample: sec(1),
          deleted: false,
        },
        {
          id: "w1",
          text: "cut",
          startSample: sec(1),
          endSample: sec(2),
          deleted: true,
        },
        {
          id: "w2",
          text: "again",
          startSample: sec(2),
          endSample: sec(3),
          deleted: false,
        },
      ],
      look: {
        vignette: false,
        transition: { type: "crossfade", durationMs: 500 },
      },
      broll: [
        {
          id: "b1",
          assetId: "missing-asset",
          startSample: 0,
          endSample: sec(1),
          srcInSample: 0,
          anchor: { phrase: "missing phrase", stale: true, wordIds: [] },
        },
      ],
      graphics: [
        {
          id: "g1",
          type: "json-render",
          template: MAP_MOTION_CATALOG,
          catalog: MAP_MOTION_CATALOG,
          spec: { mode: "route", points: [] },
          params: {},
          startSample: 0,
          endSample: sec(2),
          track: "title",
        },
      ],
    });
    writeFixtureProject(slug, project);

    const report = buildExportVerificationReport(project, { slug });

    assert.equal(report.ok, false);
    assert.deepEqual(
      report.checks.missingAssets.map((x) => x.id),
      ["missing-asset"]
    );
    assert.deepEqual(
      report.checks.staleAnchors.map((x) => x.overlayId),
      ["b1"]
    );
    assert.deepEqual(
      report.checks.invalidGraphics.map((x) => x.id),
      ["g1"]
    );
    assert.equal(report.checks.transition.wouldApply, false);
    assert.equal(report.checks.transition.fallbackReason, "overlays-present");
    assert.match(report.warnings.join("\n"), /missing asset/i);
    assert.match(report.warnings.join("\n"), /stale anchor/i);
    assert.match(report.warnings.join("\n"), /invalid graphic/i);
    assert.match(report.warnings.join("\n"), /transition fallback/i);
  });
});
