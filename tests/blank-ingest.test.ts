import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ingestBlank, isBlankCanvasProject } from "../src/blank-ingest.ts";
import { rangesForExport } from "../src/edl.ts";
import { listGraphics } from "../src/graphics.ts";
import { projectPaths } from "../src/paths.ts";
import { loadProject } from "../src/projectStore.ts";

test("ingestBlank creates a graphics-first project with empty words", async () => {
  const slug = `test-blank-canvas-${Date.now()}`;
  try {
    await ingestBlank({
      slug,
      durationSec: 2,
      aspect: "16:9",
      fps: 30,
      force: true,
    });
    const p = projectPaths(slug);
    assert.ok(existsSync(p.project));
    assert.ok(existsSync(join(p.dir, "graphics")));
    assert.ok(existsSync(join(p.working, "blank-source.mp4")));
    assert.ok(existsSync(p.proxy));
    const project = await loadProject(slug);
    assert.equal(isBlankCanvasProject(project), true);
    assert.equal(project.words.length, 0);
    const ranges = rangesForExport(project);
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0]?.startSec, 0);
    assert.equal(
      ranges[0]?.endSec,
      project.durationSamples / project.sampleRate
    );
  } finally {
    rmSync(projectPaths(slug).dir, { recursive: true, force: true });
  }
});

test("listGraphics merges project-local templates", () => {
  const slug = `test-local-graphics-${Date.now()}`;
  const p = projectPaths(slug);
  try {
    rmSync(p.dir, { recursive: true, force: true });
    const localRoot = join(p.dir, "graphics", "local-badge");
    mkdirSync(localRoot, { recursive: true });
    writeFileSync(
      join(localRoot, "manifest.json"),
      JSON.stringify(
        {
          id: "local-badge",
          name: "Project Badge",
          kind: "rich",
          width: 1920,
          height: 1080,
          fps: 30,
          params: {
            text: { type: "string", default: "Local", label: "Text" },
          },
        },
        null,
        2
      )
    );
    writeFileSync(
      join(localRoot, "composition.html"),
      `<div data-fps="30" data-graphic-root data-height="1080" data-width="1920"><p data-bind="text">Local</p></div>`
    );
    const list = listGraphics({ slug });
    const local = list.find((g) => g.id === "local-badge");
    assert.ok(local);
    assert.equal(local?.scope, "project");
    assert.equal(local?.pack, "project");
  } finally {
    rmSync(p.dir, { recursive: true, force: true });
  }
});
