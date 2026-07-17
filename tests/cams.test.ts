import { mock, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Cam } from "../src/cams.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import * as realFfmpeg from "../src/ffmpeg.ts";
import * as realIngest from "../src/ingest.ts";
import { camDir, camFile, projectPaths } from "../src/paths.ts";
import { withTempProjectsRoot } from "./helpers/projectFixture.ts";

const FAKE_META = {
  fps: 30,
  width: 320,
  height: 240,
  durationSec: 2,
};

mock.module("../src/ffmpeg.ts", () => ({
  ...realFfmpeg,
  probe: async () => FAKE_META,
}));

mock.module("../src/ingest.ts", () => ({
  ...realIngest,
  buildProxy: async () => undefined,
  extractAudio: async () => undefined,
}));

const { CamSchema, ingestCam, listCams, loadCam, setCam } = await import(
  "../src/cams.ts"
);

const sec = (n: number) => Math.round(n * SAMPLE_RATE);

function mkCam(overrides: Partial<Cam> & { id: string }): Cam {
  return CamSchema.parse({
    name: "Speaker 1",
    role: "speaker",
    source: "/tmp/cam-src.mp4",
    proxy: "proxy.mp4",
    audio: "audio16k.f32",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 320,
    height: 240,
    durationSamples: sec(2),
    offsetMs: 0,
    ingestedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  });
}

function seedCam(slug: string, cam: Cam): void {
  mkdirSync(camDir(slug, cam.id), { recursive: true });
  writeFileSync(camFile(slug, cam.id), JSON.stringify(cam, null, 2));
}

function touchVideo(path: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "fake-video-bytes");
}

test("CamSchema rejects invalid cam ids", () => {
  assert.throws(
    () =>
      CamSchema.parse({
        id: "Cam1",
        name: "Speaker 1",
        role: "speaker",
        source: "/tmp/a.mp4",
        proxy: "proxy.mp4",
        audio: "audio16k.f32",
        sampleRate: SAMPLE_RATE,
        fps: 30,
        width: 320,
        height: 240,
        durationSamples: sec(2),
        ingestedAt: "2026-07-01T00:00:00.000Z",
      }),
    /id/i
  );
});

test("CamSchema rejects invalid roles", () => {
  assert.throws(
    () =>
      CamSchema.parse({
        id: "cam1",
        name: "Speaker 1",
        role: "overhead",
        source: "/tmp/a.mp4",
        proxy: "proxy.mp4",
        audio: "audio16k.f32",
        sampleRate: SAMPLE_RATE,
        fps: 30,
        width: 320,
        height: 240,
        durationSamples: sec(2),
        ingestedAt: "2026-07-01T00:00:00.000Z",
      }),
    /role/i
  );
});

test("ingestCam assigns cam1 then cam2 when ids are omitted", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const videoA = join(projectPaths(slug).dir, "a.mp4");
    const videoB = join(projectPaths(slug).dir, "b.mp4");
    touchVideo(videoA);
    touchVideo(videoB);

    const first = await ingestCam(slug, videoA);
    const second = await ingestCam(slug, videoB);

    assert.equal(first.id, "cam1");
    assert.equal(second.id, "cam2");
  });
});

test("ingestCam reports probe, proxy, and audio progress in order", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const video = join(projectPaths(slug).dir, "progress.mp4");
    touchVideo(video);

    const progress: Array<{ phase: string; step: number; total: number }> = [];
    await ingestCam(slug, video, {
      onProgress: (p) => {
        progress.push({ phase: p.phase, step: p.step, total: p.total });
      },
    });

    assert.deepEqual(progress, [
      { phase: "probe", step: 1, total: 3 },
      { phase: "proxy", step: 2, total: 3 },
      { phase: "audio", step: 3, total: 3 },
    ]);
  });
});

test("ingestCam applies default speaker names by ingest order", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const videoA = join(projectPaths(slug).dir, "a.mp4");
    const videoB = join(projectPaths(slug).dir, "b.mp4");
    touchVideo(videoA);
    touchVideo(videoB);

    const first = await ingestCam(slug, videoA);
    const second = await ingestCam(slug, videoB);

    assert.equal(first.name, "Speaker 1");
    assert.equal(second.name, "Speaker 2");
  });
});

test('ingestCam names wide-role cams "Wide" by default', async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const video = join(projectPaths(slug).dir, "wide.mp4");
    touchVideo(video);

    const wide = await ingestCam(slug, video, { role: "wide" });
    assert.equal(wide.name, "Wide");
    assert.equal(wide.role, "wide");
  });
});

test("ingestCam throws when reusing an id without force", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const video = join(projectPaths(slug).dir, "a.mp4");
    touchVideo(video);

    await ingestCam(slug, video, { id: "cam1" });
    await assert.rejects(
      ingestCam(slug, video, { id: "cam1" }),
      /already exists/i
    );
  });
});

test("ingestCam refuses a ninth cam", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    for (let i = 1; i <= 8; i++) {
      seedCam(
        slug,
        mkCam({
          id: `cam${i}`,
          name: `Speaker ${i}`,
          ingestedAt: `2026-07-01T10:0${i}:00.000Z`,
        })
      );
    }
    const video = join(projectPaths(slug).dir, "ninth.mp4");
    touchVideo(video);

    await assert.rejects(ingestCam(slug, video), /cam limit reached/i);
  });
});

test("setCam patches name, role, and offsetMs and persists", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    seedCam(slug, mkCam({ id: "cam1", name: "Speaker 1", offsetMs: 0 }));

    const updated = await setCam(slug, "cam1", {
      name: "Host",
      role: "wide",
      offsetMs: 250,
    });

    assert.equal(updated.name, "Host");
    assert.equal(updated.role, "wide");
    assert.equal(updated.offsetMs, 250);

    const reloaded = await loadCam(slug, "cam1");
    assert.deepEqual(reloaded, updated);
  });
});

test("listCams sorts by ingestedAt then id", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    seedCam(
      slug,
      mkCam({
        id: "cam2",
        name: "Speaker 2",
        ingestedAt: "2026-07-02T00:00:00.000Z",
      })
    );
    seedCam(
      slug,
      mkCam({
        id: "cam1",
        name: "Speaker 1",
        ingestedAt: "2026-07-01T00:00:00.000Z",
      })
    );
    seedCam(
      slug,
      mkCam({
        id: "cam3",
        name: "Wide",
        role: "wide",
        ingestedAt: "2026-07-01T00:00:00.000Z",
      })
    );

    const cams = await listCams(slug);
    assert.deepEqual(
      cams.map((c) => c.id),
      ["cam1", "cam3", "cam2"]
    );
  });
});

test("loadCam throws for a missing cam id", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    await assert.rejects(loadCam(slug, "missing"), /cam not found/i);
  });
});
