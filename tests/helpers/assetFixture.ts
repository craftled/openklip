import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Asset, Broll, Project } from "../../src/edl.ts";

/** Minimal PNG header: enough for `isRecognizedAssetFile` and still registration. */
export const TINY_PNG = Buffer.from([137, 80, 78, 71]);

export function projectAssetsDir(root: string, slug: string): string {
  return join(root, "projects", slug, "assets");
}

export function writeAssetDrop(
  root: string,
  slug: string,
  filename: string,
  data: Buffer | string = "fake"
): string {
  const dir = projectAssetsDir(root, slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, data);
  return path;
}

export function orphanBrollAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "orphan",
    kind: "broll",
    name: "b-roll.mp4",
    src: "/tmp/outside-b-roll.mp4",
    proxy: "working/assets/b-roll.mp4",
    durationSamples: 1000,
    ...overrides,
  };
}

export function brollClipFor(assetId: string): Broll {
  return {
    id: "b1",
    assetId,
    startSample: 0,
    endSample: 1000,
    srcInSample: 0,
  };
}

export function keptMusicAsset(
  assetsDir: string,
  overrides: Partial<Asset> = {}
): Asset {
  return {
    id: "keep",
    kind: "music",
    name: "keep.mp3",
    src: join(assetsDir, "keep.mp3"),
    proxy: "working/assets/keep.aac",
    durationSamples: 1000,
    ...overrides,
  };
}

/** Default fixture asset lives outside any project assets/ folder. */
export function defaultFixtureOrphan(project: Project): Asset | undefined {
  return project.assets.find((a) => a.id === "broll-a");
}
