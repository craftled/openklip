import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  bootstrapSmokeFixture,
  resolveRealSmokeSlug,
  runAgentSmokeAudit,
  runReviseDraftSmokeAudit,
  SMOKE_SLUG,
  verifyExportStructural,
} from "../src/agent-smoke-audit.ts";
import { FFMPEG } from "../src/ffmpeg.ts";
import { projectPaths } from "../src/paths.ts";

const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

test("bootstrapSmokeFixture writes project.json, brief.md, and media", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  const root = mkdtempSync(join(tmpdir(), "openklip-smoke-boot-"));
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = root;
  try {
    const slug = await bootstrapSmokeFixture(root);
    assert.equal(slug, SMOKE_SLUG);
    const paths = projectPaths(SMOKE_SLUG);
    assert.ok(existsSync(paths.project));
    assert.ok(existsSync(paths.brief));
    assert.ok(existsSync(paths.proxy));
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveRealSmokeSlug returns null for an empty temp projects root", () => {
  const root = mkdtempSync(join(tmpdir(), "openklip-smoke-missing-"));
  try {
    assert.equal(resolveRealSmokeSlug(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runAgentSmokeAudit passes the deterministic loop", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  const result = await runAgentSmokeAudit();
  assert.equal(
    result.ok,
    true,
    result.steps.map((s) => `${s.name}:${s.detail}`).join("; ")
  );
});

test("runReviseDraftSmokeAudit passes the deterministic revise loop", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  const result = await runReviseDraftSmokeAudit();
  assert.equal(
    result.ok,
    true,
    result.steps.map((step) => `${step.name}:${step.detail}`).join("; ")
  );
});

test("verifyExportStructural compares export duration to kept runtime", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  const root = mkdtempSync(join(tmpdir(), "openklip-smoke-verify-"));
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = root;
  try {
    const slug = await bootstrapSmokeFixture(root);
    const { exportCut } = await import("../src/exporter.ts");
    await exportCut(slug, { compression: "web", fps: 30 });
    const step = await verifyExportStructural(slug, 4, 1.5);
    assert.equal(step.ok, true, step.detail);
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
