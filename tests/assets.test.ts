import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  inferAssetKind,
  listAssetsByKind,
  registerAsset,
  registerAssetBytes,
} from "../src/assets.ts";
import { ProjectSchema } from "../src/edl.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("inferAssetKind detects video, audio, and image extensions", () => {
  assert.equal(inferAssetKind("clip.mp4"), "broll");
  assert.equal(inferAssetKind("clip.MOV"), "broll");
  assert.equal(inferAssetKind("track.mp3"), "music");
  assert.equal(inferAssetKind("track.wav"), "music");
  assert.equal(inferAssetKind("photo.png"), "still");
  assert.equal(inferAssetKind("photo.webp"), "still");
});

test("listAssetsByKind groups registered assets", () => {
  const grouped = listAssetsByKind([
    {
      id: "a",
      kind: "broll",
      name: "a.mp4",
      src: "/a.mp4",
      proxy: "assets/a.mp4",
      durationSamples: 1,
    },
    {
      id: "b",
      kind: "music",
      name: "b.mp3",
      src: "/b.mp3",
      proxy: "assets/b.aac",
      durationSamples: 2,
    },
  ]);
  assert.equal(grouped.broll.length, 1);
  assert.equal(grouped.music.length, 1);
  assert.equal(grouped.still.length, 0);
});

test("ProjectSchema defaults missing asset kind to broll", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "x",
    source: "/s.mp4",
    proxy: "proxy.mp4",
    sampleRate: 48_000,
    fps: 30,
    width: 1280,
    height: 720,
    durationSamples: 48_000,
    words: [],
    assets: [
      {
        id: "no-kind",
        name: "old.mp4",
        src: "/old.mp4",
        proxy: "working/assets/old.mp4",
        durationSamples: 48_000,
      },
    ],
  });
  assert.equal(project.assets[0]?.kind, "broll");
});

test("registerAsset copies a still into the project asset bin", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const assetsDir = join(root, "projects", slug, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const stillPath = join(assetsDir, "incoming.png");
    writeFileSync(stillPath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const asset = await registerAsset(slug, stillPath, "still");
    assert.equal(asset.kind, "still");
    assert.equal(asset.proxy, "assets/incoming.png");
    const raw = readFileSync(
      join(root, "projects", slug, "project.json"),
      "utf8"
    );
    const project = ProjectSchema.parse(JSON.parse(raw));
    assert.equal(project.assets.length, 1);
    assert.equal(project.assets[0]?.id, asset.id);
  });
});

test("registerAssetBytes keeps the uploaded source file on disk", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const asset = await registerAssetBytes(
      slug,
      "incoming.png",
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      "still"
    );
    assert.equal(asset.kind, "still");
    assert.ok(existsSync(asset.src));
    assert.ok(asset.src.includes("/assets/incoming.png"));
  });
});

test("registerAsset copies an external still into assets/ (no ../../ proxy)", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    // Source lives OUTSIDE the project's assets/ folder.
    const external = join(root, "external-pic.png");
    writeFileSync(external, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    const asset = await registerAsset(slug, external, "still");
    assert.equal(asset.kind, "still");
    // proxy must be a portable in-project path, not a ../../external-pic.png.
    assert.ok(asset.proxy.startsWith("assets/"));
    assert.ok(!asset.proxy.includes(".."));
    // The original was copied into the project's assets/ dir.
    assert.ok(existsSync(join(root, "projects", slug, asset.proxy)));
  });
});
