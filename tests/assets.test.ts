import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  inferAssetKind,
  listAssetsByKind,
  registerAsset,
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
        id: "legacy",
        name: "old.mp4",
        src: "/old.mp4",
        proxy: "assets/legacy.mp4",
        durationSamples: 48_000,
      },
    ],
  });
  assert.equal(project.assets[0]?.kind, "broll");
});

test("registerAsset copies a still into the project asset bin", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const stillPath = join(process.cwd(), "projects", slug, "incoming.png");
    writeFileSync(stillPath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const asset = await registerAsset(slug, stillPath, "still");
    assert.equal(asset.kind, "still");
    assert.match(asset.proxy, /^working\/assets\/.+\.png$/);
    const raw = readFileSync(`projects/${slug}/project.json`, "utf8");
    const project = ProjectSchema.parse(JSON.parse(raw));
    assert.equal(project.assets.length, 1);
    assert.equal(project.assets[0]?.id, asset.id);
  });
});
