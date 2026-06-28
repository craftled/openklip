import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DELETE } from "../app/api/projects/[slug]/assets/[assetId]/route.ts";
import { registerAssetBytes } from "../src/assets.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string, assetId: string) {
  return { params: Promise.resolve({ slug, assetId }) };
}

test("DELETE /api/projects/:slug/assets/:assetId removes the asset", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const asset = await registerAssetBytes(
      slug,
      "incoming.png",
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      "still"
    );
    const proxyPath = join(root, "projects", slug, asset.proxy);
    assert.ok(existsSync(proxyPath));

    const res = await DELETE(
      new Request("http://localhost/delete"),
      ctx(slug, asset.id)
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { assets: unknown[] };
    assert.equal(body.assets.length, 0);
    assert.ok(!existsSync(proxyPath));
  });
});

test("DELETE returns 404 for unknown asset", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const res = await DELETE(
      new Request("http://localhost/delete"),
      ctx(slug, "missing")
    );
    assert.equal(res.status, 404);
  });
});
