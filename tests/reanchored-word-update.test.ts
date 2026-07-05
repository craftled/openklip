import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project as EngineProject } from "@engine/edl";
import { reanchoredWordUpdate } from "../web/lib/reanchored-word-update.ts";

function minimalProject(): EngineProject {
  return {
    assets: [],
    broll: [
      {
        assetId: "a1",
        endSample: 96_000,
        id: "br1",
        srcInSample: 0,
        startSample: 48_000,
        anchor: { phrase: "hello world", wordIds: ["w0", "w1"], stale: false },
      },
    ],
    captions: { enabled: true },
    durationSamples: 240_000,
    fps: 30,
    height: 1080,
    padMs: 50,
    proxy: "working/proxy.mp4",
    revision: 1,
    sampleRate: 48_000,
    slug: "demo",
    source: "source.mp4",
    titles: [],
    version: 1,
    width: 1920,
    words: [
      {
        deleted: false,
        endSample: 24_000,
        id: "w0",
        startSample: 0,
        text: "hello",
      },
      {
        deleted: false,
        endSample: 48_000,
        id: "w1",
        startSample: 24_000,
        text: "world",
      },
    ],
    zooms: [],
  };
}

test("reanchoredWordUpdate marks words deleted and keeps overlays cloned", () => {
  const next = reanchoredWordUpdate(minimalProject(), new Set(["w0"]), true);
  assert.equal(next.words.find((w) => w.id === "w0")?.deleted, true);
  assert.equal(next.broll?.[0]?.anchor?.wordIds?.length, 2);
});
