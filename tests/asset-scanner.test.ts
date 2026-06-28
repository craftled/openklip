import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  listAssetDropFiles,
  syncAssetsFromFolder,
} from "../src/asset-scanner.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("listAssetDropFiles lists only recognized files in assets/", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const assetsDir = join(process.cwd(), "projects", slug, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "track.mp3"), "fake");
    writeFileSync(join(assetsDir, "notes.txt"), "skip");
    writeFileSync(join(assetsDir, ".hidden"), "skip");

    const files = listAssetDropFiles(slug);
    assert.equal(files.length, 1);
    assert.ok(files[0]?.endsWith("track.mp3"));
  });
});

test("syncAssetsFromFolder registers new drops in project.json", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const assetsDir = join(process.cwd(), "projects", slug, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(
      join(assetsDir, "incoming.png"),
      Buffer.from([137, 80, 78, 71])
    );

    const assets = await syncAssetsFromFolder(slug);
    assert.equal(assets.length, 1);
    assert.equal(assets[0]?.kind, "still");
    assert.ok(assets[0]?.src.includes("/assets/incoming.png"));
    assert.equal(assets[0]?.proxy, "assets/incoming.png");
  });
});
