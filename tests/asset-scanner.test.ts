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
  await withTempProjectsRoot(({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const assetsDir = join(root, "projects", slug, "assets");
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
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const assetsDir = join(root, "projects", slug, "assets");
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

test("syncAssetsFromFolder serializes overlapping calls (no lost updates)", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const assetsDir = join(root, "projects", slug, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "a.png"), Buffer.from([137, 80, 78, 71]));
    writeFileSync(join(assetsDir, "b.png"), Buffer.from([137, 80, 78, 71]));

    // Two concurrent syncs over the same files. Without per-slug
    // serialization both would read project.json before either write landed,
    // each register both files, and the second save would clobber the first:
    // duplicate ids or a lost update. With the lock they collapse: one
    // registers, the other sees them already known.
    const [first, second] = await Promise.all([
      syncAssetsFromFolder(slug),
      syncAssetsFromFolder(slug),
    ]);

    assert.equal(first.length, 2);
    assert.equal(second.length, 2);
    const firstSrcs = first.map((a) => a.src).sort();
    const secondSrcs = second.map((a) => a.src).sort();
    assert.deepEqual(firstSrcs, secondSrcs);
    // No duplicate ids on disk.
    const ids = first.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
