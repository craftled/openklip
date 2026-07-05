import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { listGraphics, saveProjectGraphicTemplate } from "../src/graphics.ts";
import { projectPaths } from "../src/paths.ts";

test("saveProjectGraphicTemplate writes project-local manifest and composition", async () => {
  const slug = `test-graphic-upload-${Date.now()}`;
  const p = projectPaths(slug);
  try {
    rmSync(p.dir, { recursive: true, force: true });
    mkdirSync(join(p.dir, "working"), { recursive: true });
    const listing = await saveProjectGraphicTemplate(
      slug,
      {
        id: "upload-badge",
        name: "Upload Badge",
        kind: "text",
        width: 1920,
        height: 1080,
        fps: 30,
        params: {
          text: { type: "string", default: "Hello", label: "Text" },
        },
      },
      "<html><body><div>Hello</div></body></html>"
    );
    assert.equal(listing.scope, "project");
    assert.equal(listing.id, "upload-badge");
    const found = listGraphics({ slug }).find((g) => g.id === "upload-badge");
    assert.ok(found);
    assert.match(
      readFileSync(
        join(p.dir, "graphics", "upload-badge", "composition.html"),
        "utf8"
      ),
      /Hello/
    );
  } finally {
    rmSync(p.dir, { recursive: true, force: true });
  }
});
