import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlanSpan } from "../src/cam-plan.ts";
import { DEFAULT_CAM_SWITCH_SETTINGS } from "../src/cam-plan.ts";
import {
  camMixOrRemix,
  camRemix,
  hasMulticamProvenance,
  resolveCamRemixPlan,
} from "../src/cam-remix.ts";
import type { Cam } from "../src/cams.ts";
import { CamSchema } from "../src/cams.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { camDir, camFile } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const sec = (n: number) => Math.round(n * SAMPLE_RATE);

function mkCam(overrides: Partial<Cam> & { id: string }): Cam {
  return CamSchema.parse({
    name: "Speaker 1",
    role: "speaker",
    source: `/tmp/${overrides.id}.mp4`,
    proxy: "proxy.mp4",
    audio: "audio16k.f32",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 320,
    height: 240,
    durationSamples: sec(30),
    offsetMs: 0,
    ingestedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  });
}

function seedCam(slug: string, cam: Cam): void {
  const dir = camDir(slug, cam.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(camFile(slug, cam.id), JSON.stringify(cam, null, 2));
  writeFileSync(join(dir, cam.audio), Buffer.alloc(48_000 * 4));
  writeFileSync(join(dir, cam.proxy), "fake-proxy");
}

function mkMulticam(plan: PlanSpan[], mode: "follow" | "auto" = "follow") {
  return {
    version: 1 as const,
    mode,
    settings: DEFAULT_CAM_SWITCH_SETTINGS,
    plan,
    cams: [
      {
        id: "cam1",
        name: "Speaker 1",
        role: "speaker" as const,
        offsetMs: 0,
        source: "/tmp/cam1.mp4",
      },
      {
        id: "cam2",
        name: "Speaker 2",
        role: "speaker" as const,
        offsetMs: 0,
        source: "/tmp/cam2.mp4",
      },
    ],
    attributions: [
      { wordId: "w0", camId: "cam1" },
      { wordId: "w1", camId: "cam2" },
    ],
    plannedBy: mode === "follow" ? "follow" : "rules",
    plannedAt: "2026-07-01T00:00:00.000Z",
    programAudio: { masterMix: null },
  };
}

function seedMulticamProject(
  slug: string,
  plan: PlanSpan[],
  mode: "follow" | "auto" = "follow"
): void {
  writeFixtureProject(
    slug,
    makeProject({
      slug,
      durationSamples: sec(30),
      multicam: mkMulticam(plan, mode),
    }) as ReturnType<typeof makeProject>
  );
  seedCam(slug, mkCam({ id: "cam1", name: "Speaker 1" }));
  seedCam(slug, mkCam({ id: "cam2", name: "Speaker 2" }));
}

test("camRemix throws when multicam provenance is absent", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    seedCam(slug, mkCam({ id: "cam1" }));
    seedCam(slug, mkCam({ id: "cam2", name: "Speaker 2" }));
    await assert.rejects(() => camRemix(slug), /no multicam mix/i);
  });
});

test("resolveCamRemixPlan overrides convert seconds to samples and return locked spans", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    seedMulticamProject(slug, [
      { fromSample: 0, toSample: sec(30), shot: "cam1" },
    ]);

    const result = await resolveCamRemixPlan(slug, {
      overrides: [{ fromSec: 10, toSec: 15, shot: "cam2" }],
    });

    const locked = result.plan.find(
      (s) =>
        s.shot === "cam2" &&
        s.fromSample === sec(10) &&
        s.toSample === sec(15) &&
        s.locked === true
    );
    assert.ok(locked, "override span is locked in returned plan");
  });
});

test("resolveCamRemixPlan preserves previously locked spans across a second override round", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    seedMulticamProject(slug, [
      { fromSample: 0, toSample: sec(30), shot: "cam1" },
    ]);

    const first = await resolveCamRemixPlan(slug, {
      overrides: [{ fromSec: 5, toSec: 10, shot: "cam2" }],
    });
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        durationSamples: sec(30),
        multicam: {
          ...mkMulticam(first.plan),
          plan: first.plan,
        },
      }) as ReturnType<typeof makeProject>
    );

    const second = await resolveCamRemixPlan(slug, {
      overrides: [{ fromSec: 20, toSec: 25, shot: "cam2" }],
    });

    const firstLock = second.plan.find(
      (s) =>
        s.fromSample === sec(5) &&
        s.toSample === sec(10) &&
        s.shot === "cam2" &&
        s.locked === true
    );
    assert.ok(firstLock, "first override survives the second camRemix round");
    const secondLock = second.plan.find(
      (s) =>
        s.fromSample === sec(20) &&
        s.toSample === sec(25) &&
        s.shot === "cam2" &&
        s.locked === true
    );
    assert.ok(secondLock, "second override is also locked");
  });
});

test("resolveCamRemixPlan mode switch re-plans while honoring locked spans", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    seedMulticamProject(
      slug,
      [{ fromSample: 0, toSample: sec(30), shot: "cam1" }],
      "follow"
    );

    const withLock = await resolveCamRemixPlan(slug, {
      overrides: [{ fromSec: 8, toSec: 12, shot: "cam2" }],
    });
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        durationSamples: sec(30),
        multicam: {
          ...mkMulticam(withLock.plan, "follow"),
          plan: withLock.plan,
        },
      }) as ReturnType<typeof makeProject>
    );

    const switched = await resolveCamRemixPlan(slug, { mode: "auto" });

    assert.equal(switched.mode, "auto");
    const lock = switched.plan.find(
      (s) =>
        s.fromSample === sec(8) &&
        s.toSample === sec(12) &&
        s.shot === "cam2" &&
        s.locked === true
    );
    assert.ok(lock, "locked override survives auto re-plan");
    assert.notEqual(
      switched.plan.filter((s) => !s.locked).length,
      0,
      "auto re-plan still produces unlocked regions"
    );
  });
});

// ── Second-opinion review regressions (grok+codex lanes, pre-PR) ─────────────
// CLI cam-mix / MCP cam_mix / GUI re-mix must all route through camRemix when
// multicam provenance exists, or locked spans are silently dropped.

test("hasMulticamProvenance is true only for projects with a multicam block", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assert.equal(await hasMulticamProvenance(slug), false);
  });
  await withTempProjectsRoot(async ({ slug }) => {
    const plan = [{ fromSample: 0, toSample: sec(30), shot: "cam1" }];
    writeFixtureProject(
      slug,
      makeProject({ slug, multicam: mkMulticam(plan) })
    );
    assert.equal(await hasMulticamProvenance(slug), true);
  });
});

test("hasMulticamProvenance is false when no project exists", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    assert.equal(await hasMulticamProvenance(slug), false);
  });
});

// ── camMixOrRemix dispatch coverage (fresh-context review follow-up) ────────
// The dispatch router itself had zero direct test coverage: it's what fixed
// the CLI/MCP lock-drop bug (all three surfaces now go through it instead of
// calling camMix directly), so a regression here would silently reopen that
// exact bug. Distinct, unmistakable error signatures from camMix ("at least
// 2 speaker cams") vs camRemix ("no multicam mix") let this be verified
// cheaply without running the full ffmpeg pipeline for the no-provenance case.

test("camMixOrRemix calls camMix directly when no multicam provenance exists", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    seedCam(slug, mkCam({ id: "cam1" }));
    // Only one cam: camMix's own guard throws a distinct error from
    // camRemix's "no multicam mix" — proving this path reached camMix,
    // not camRemix, without needing a real ffmpeg render.
    await assert.rejects(() => camMixOrRemix(slug), /at least 2 speaker cams/i);
  });
});

test("camMixOrRemix integration: routes to camRemix and preserves a locked override once provenance exists", {
  timeout: 180_000,
}, async () => {
  if (process.env.OPENKLIP_INTEGRATION !== "1") {
    return;
  }
  const { FFMPEG } = await import("../src/ffmpeg.ts");
  const { existsSync } = await import("node:fs");
  if (typeof FFMPEG !== "string" || !existsSync(FFMPEG)) {
    return;
  }
  const { ingestCam } = await import("../src/cams.ts");
  const { camMix } = await import("../src/cam-mix.ts");
  const { projectPaths } = await import("../src/paths.ts");

  await withTempProjectsRoot(async ({ slug }) => {
    const dir = projectPaths(slug).dir;
    const videoA = join(dir, "cam-a.mp4");
    const videoB = join(dir, "cam-b.mp4");

    const lavfiBase = ["-y", "-f", "lavfi", "-i"];

    await Bun.spawn([
      FFMPEG,
      ...lavfiBase,
      "color=c=red:s=320x240:r=30:d=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=6",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      videoA,
    ]).exited;

    await Bun.spawn([
      FFMPEG,
      ...lavfiBase,
      "color=c=blue:s=320x240:r=30:d=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:sample_rate=48000:duration=6",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      videoB,
    ]).exited;

    await ingestCam(slug, videoA, { id: "cam1", name: "Red", force: true });
    await ingestCam(slug, videoB, { id: "cam2", name: "Blue", force: true });

    // First mix: no provenance exists yet, so this establishes it.
    await camMix(slug, { mode: "follow" });

    // Lock a span via camRemix directly (mirrors what `cam-override` does).
    const withLock = await camRemix(slug, {
      overrides: [{ fromSec: 1, toSec: 3, shot: "cam2" }],
    });
    const lockedSpan = withLock.plan.find(
      (s) =>
        s.shot === "cam2" &&
        s.locked === true &&
        s.fromSample === sec(1) &&
        s.toSample === sec(3)
    );
    assert.ok(lockedSpan, "override is locked after the first camRemix call");

    // Now call the SAME dispatch surface every CLI/MCP/GUI cam-mix call
    // goes through. If this silently fell back to plain camMix (the exact
    // bug this router fixes), the lock below would vanish.
    const result = await camMixOrRemix(slug, { mode: "follow" });
    const survived = result.plan.find(
      (s) =>
        s.shot === "cam2" &&
        s.locked === true &&
        s.fromSample === sec(1) &&
        s.toSample === sec(3)
    );
    assert.ok(
      survived,
      "locked override survives a plain camMixOrRemix call once provenance exists"
    );
  });
});
