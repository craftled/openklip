import { test } from "bun:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyCamMixToProject,
  buildCamMixArgs,
  buildCamMixVideoFilter,
  camMix,
  MulticamProvenanceSchema,
  planTimelineSummary,
} from "../src/cam-mix.ts";
import type { PlanSpan } from "../src/cam-plan.ts";
import { type Cam, CamSchema, ingestCam } from "../src/cams.ts";
import { ProjectSchema, SAMPLE_RATE } from "../src/edl.ts";
import { FFMPEG, probe } from "../src/ffmpeg.ts";
import { camDir, camFile, projectPaths } from "../src/paths.ts";
import { withTempProjectsRoot } from "./helpers/projectFixture.ts";

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
    durationSamples: sec(12),
    offsetMs: 0,
    ingestedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  });
}

function seedCam(slug: string, cam: Cam): void {
  mkdirSync(camDir(slug, cam.id), { recursive: true });
  writeFileSync(camFile(slug, cam.id), JSON.stringify(cam, null, 2));
}

test("buildCamMixVideoFilter single cam plan produces one trim chain and concat n=1", () => {
  const cams = [mkCam({ id: "cam1", name: "Speaker 1" })];
  const plan: PlanSpan[] = [{ fromSample: 0, toSample: sec(4), shot: "cam1" }];
  const { filter, inputOrder } = buildCamMixVideoFilter(plan, cams, {
    width: 320,
    height: 240,
    fps: 30,
  });
  assert.deepEqual(inputOrder, ["cam1"]);
  assert.match(filter, /trim=start=0:end=4/);
  assert.match(filter, /concat=n=1:v=1:a=0\[vout\]/);
});

test("buildCamMixVideoFilter A/B alternating plan lists each input once", () => {
  const cams = [
    mkCam({ id: "cam1", name: "Speaker 1" }),
    mkCam({ id: "cam2", name: "Speaker 2" }),
  ];
  const plan: PlanSpan[] = [
    { fromSample: 0, toSample: sec(2), shot: "cam1" },
    { fromSample: sec(2), toSample: sec(4), shot: "cam2" },
    { fromSample: sec(4), toSample: sec(6), shot: "cam1" },
  ];
  const { filter, inputOrder } = buildCamMixVideoFilter(plan, cams, {
    width: 320,
    height: 240,
    fps: 30,
  });
  assert.deepEqual(inputOrder, ["cam1", "cam2"]);
  assert.match(filter, /concat=n=3:v=1:a=0\[vout\]/);
  assert.equal((filter.match(/trim=start=/g) ?? []).length, 3);
});

test("buildCamMixVideoFilter trims offset-aware for positive offsetMs", () => {
  const cams = [mkCam({ id: "cam1", offsetMs: 2000 })];
  const plan: PlanSpan[] = [
    { fromSample: sec(10), toSample: sec(12), shot: "cam1" },
  ];
  const { filter } = buildCamMixVideoFilter(plan, cams, {
    width: 320,
    height: 240,
    fps: 30,
  });
  assert.match(filter, /trim=start=8:end=10/);
});

test("buildCamMixVideoFilter trims offset-aware for negative offsetMs", () => {
  const cams = [mkCam({ id: "cam1", offsetMs: -1000 })];
  const plan: PlanSpan[] = [{ fromSample: 0, toSample: sec(2), shot: "cam1" }];
  const { filter } = buildCamMixVideoFilter(plan, cams, {
    width: 320,
    height: 240,
    fps: 30,
  });
  assert.match(filter, /trim=start=1:end=3/);
});

test("buildCamMixVideoFilter wide shot uses physical wide cam when present", () => {
  const cams = [
    mkCam({ id: "cam1", name: "Speaker 1" }),
    mkCam({ id: "cam-wide", name: "Wide", role: "wide" }),
  ];
  const plan: PlanSpan[] = [{ fromSample: 0, toSample: sec(3), shot: "wide" }];
  const { filter, inputOrder } = buildCamMixVideoFilter(plan, cams, {
    width: 320,
    height: 240,
    fps: 30,
  });
  assert.deepEqual(inputOrder, ["cam-wide"]);
  assert.match(filter, /\[0:v\]trim=start=0:end=3/);
  assert.doesNotMatch(filter, /hstack|xstack/);
});

test("buildCamMixVideoFilter synthetic wide with two speakers uses hstack", () => {
  const cams = [
    mkCam({ id: "cam1", name: "Speaker 1" }),
    mkCam({ id: "cam2", name: "Speaker 2" }),
  ];
  const plan: PlanSpan[] = [{ fromSample: 0, toSample: sec(3), shot: "wide" }];
  const { filter, inputOrder } = buildCamMixVideoFilter(plan, cams, {
    width: 320,
    height: 240,
    fps: 30,
  });
  assert.deepEqual(inputOrder, ["cam1", "cam2"]);
  assert.match(filter, /hstack=inputs=2/);
});

test("buildCamMixVideoFilter synthetic wide with three speakers uses xstack 2x2", () => {
  const cams = [
    mkCam({ id: "cam1", name: "Speaker 1" }),
    mkCam({ id: "cam2", name: "Speaker 2" }),
    mkCam({ id: "cam3", name: "Speaker 3" }),
  ];
  const plan: PlanSpan[] = [{ fromSample: 0, toSample: sec(3), shot: "wide" }];
  const { filter } = buildCamMixVideoFilter(plan, cams, {
    width: 320,
    height: 240,
    fps: 30,
  });
  assert.match(filter, /xstack=inputs=4:layout=0_0\|/);
  assert.match(filter, /color=black/);
});

test("buildCamMixVideoFilter is deterministic for identical input", () => {
  const cams = [
    mkCam({ id: "cam1" }),
    mkCam({ id: "cam2", name: "Speaker 2" }),
  ];
  const plan: PlanSpan[] = [
    { fromSample: 0, toSample: sec(2), shot: "cam1" },
    { fromSample: sec(2), toSample: sec(4), shot: "wide" },
  ];
  const opts = { width: 320, height: 240, fps: 30 };
  const a = buildCamMixVideoFilter(plan, cams, opts);
  const b = buildCamMixVideoFilter(plan, cams, opts);
  assert.equal(a.filter, b.filter);
  assert.deepEqual(a.inputOrder, b.inputOrder);
});

test("buildCamMixArgs maps program wav as last audio input with encoder flags", () => {
  const cams = [
    mkCam({ id: "cam1", source: "/vids/cam1.mp4" }),
    mkCam({ id: "cam2", source: "/vids/cam2.mp4", name: "Speaker 2" }),
  ];
  const plan: PlanSpan[] = [
    { fromSample: 0, toSample: sec(2), shot: "cam1" },
    { fromSample: sec(2), toSample: sec(4), shot: "cam2" },
  ];
  const args = buildCamMixArgs(plan, cams, {
    out: "/out/source.mp4",
    programWav: "/out/program.wav",
    width: 320,
    height: 240,
    fps: 30,
  });
  const cam1Idx = args.indexOf("/vids/cam1.mp4");
  const cam2Idx = args.indexOf("/vids/cam2.mp4");
  const wavIdx = args.indexOf("/out/program.wav");
  assert.ok(cam1Idx >= 0);
  assert.ok(cam2Idx > cam1Idx);
  assert.ok(wavIdx > cam2Idx);
  assert.ok(args.includes("-filter_complex"));
  assert.ok(args.includes("-map"));
  assert.ok(args.includes("[vout]"));
  assert.ok(args.includes("-c:v"));
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("-preset"));
  assert.ok(args.includes("veryfast"));
  assert.ok(args.includes("-crf"));
  assert.ok(args.includes("20"));
  assert.ok(args.includes("2:a"));
  assert.ok(
    args.includes("-map") && args.filter((a) => a.endsWith(":a")).length >= 1
  );
});

test("MulticamProvenanceSchema round-trips", () => {
  const raw = {
    version: 1,
    mode: "follow",
    settings: {
      minShotMs: 2000,
      interjectionMs: 700,
      leadMs: 250,
      maxShotMs: 25_000,
      snapMs: 120,
      wide: "auto",
    },
    plan: [{ fromSample: 0, toSample: sec(4), shot: "cam1" }],
    cams: [
      {
        id: "cam1",
        name: "Speaker 1",
        role: "speaker",
        offsetMs: 0,
        source: "/tmp/cam1.mp4",
      },
    ],
    attributions: [{ wordId: "w0", camId: "cam1" }],
    plannedBy: "follow",
    plannedAt: "2026-07-12T12:00:00.000Z",
    programAudio: { masterMix: null },
  };
  const parsed = MulticamProvenanceSchema.parse(raw);
  assert.equal(parsed.mode, "follow");
  assert.equal(parsed.plannedBy, "follow");
  assert.deepEqual(MulticamProvenanceSchema.parse(parsed), parsed);
});

test("planTimelineSummary formats human-readable spans", () => {
  const cams = [
    mkCam({ id: "cam1", name: "Alice" }),
    mkCam({ id: "cam2", name: "Bob" }),
  ];
  const plan: PlanSpan[] = [
    { fromSample: 0, toSample: sec(12), shot: "cam1" },
    { fromSample: sec(12), toSample: sec(15), shot: "wide" },
    { fromSample: sec(15), toSample: sec(20), shot: "cam2" },
  ];
  const summary = planTimelineSummary(plan, cams);
  assert.match(summary, /0:00-0:12 Alice/);
  assert.match(summary, /0:12-0:15 Wide/);
  assert.match(summary, /0:15-0:20 Bob/);
  assert.ok(summary.includes(" | "));
});

test("camMix throws when fewer than two speaker cams", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    seedCam(slug, mkCam({ id: "cam1", name: "Only" }));
    await assert.rejects(camMix(slug), /at least 2 speaker cams/i);
  });
});

test("camMix integration renders switched source and project", {
  timeout: 180_000,
}, async () => {
  if (process.env.OPENKLIP_INTEGRATION !== "1") {
    return;
  }
  if (typeof FFMPEG !== "string" || !existsSync(FFMPEG)) {
    return;
  }

  await withTempProjectsRoot(async ({ slug }) => {
    const dir = projectPaths(slug).dir;
    const videoA = join(dir, "cam-a.mp4");
    const videoB = join(dir, "cam-b.mp4");

    const lavfiBase = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=320x240:r=30:d=4",
      "-f",
      "lavfi",
    ];

    await Bun.spawn([
      FFMPEG,
      ...lavfiBase,
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=2",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=mono:duration=2",
      "-filter_complex",
      "[1:a][2:a]concat=n=2:v=0:a=1[aout]",
      "-map",
      "0:v",
      "-map",
      "[aout]",
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
      "-i",
      "anullsrc=r=48000:cl=mono:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:sample_rate=48000:duration=2",
      "-filter_complex",
      "[1:a][2:a]concat=n=2:v=0:a=1[aout]",
      "-map",
      "0:v",
      "-map",
      "[aout]",
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

    const result = await camMix(slug, { mode: "follow" });

    const sourcePath = join(dir, "source.mp4");
    assert.ok(existsSync(sourcePath));
    assert.equal(result.sourcePath, sourcePath);
    assert.ok(result.plan.length >= 2);
    const shots = new Set(result.plan.map((s) => s.shot));
    assert.ok(shots.has("cam1"));
    assert.ok(shots.has("cam2"));

    const meta = await probe(sourcePath);
    assert.ok(meta.durationSec > 2);
    assert.equal(meta.width, 320);
    assert.equal(meta.height, 240);

    assert.ok(existsSync(projectPaths(slug).proxy));
    const project = ProjectSchema.parse(
      JSON.parse(await Bun.file(projectPaths(slug).project).text())
    );
    assert.ok(project.multicam);
    MulticamProvenanceSchema.parse(project.multicam);
    assert.ok(Array.isArray(project.words));

    const transcript = JSON.parse(
      await Bun.file(projectPaths(slug).transcript).text()
    ) as { words: unknown[] };
    assert.ok(Array.isArray(transcript.words));
  });
});

// ── Orchestrator review regression (localhost E2E finding) ───────────────────
// Synthetic wide cell labels must be bracket-safe: `wseg[seg2]0` (nested
// brackets) breaks ffmpeg's filterchain parser.

test("buildCamMixVideoFilter synthetic wide labels contain no nested brackets", () => {
  const cams = [
    mkCam({ id: "cam1", role: "speaker" }),
    mkCam({ id: "cam2", role: "speaker" }),
  ];
  const plan = [
    { fromSample: 0, toSample: 480_000, shot: "cam1" },
    { fromSample: 480_000, toSample: 960_000, shot: "wide" },
    { fromSample: 960_000, toSample: 1_440_000, shot: "cam2" },
  ];
  const { filter } = buildCamMixVideoFilter(plan, cams, {
    width: 1280,
    height: 720,
    fps: 30,
  });
  assert.ok(!filter.includes("[wseg["), "no nested-bracket labels");
  const labels = filter.match(/\[[^\]]*\]/g) ?? [];
  for (const label of labels) {
    assert.match(
      label,
      /^\[[A-Za-z0-9:_]+\]$/,
      `malformed filter label: ${label}`
    );
  }
});

// ── Second-opinion review regressions (codex lane, pre-PR) ───────────────────

function mkProject(overrides: Record<string, unknown> = {}) {
  return ProjectSchema.parse({
    version: 1,
    slug: "fixture",
    source: "/tmp/old-source.mp4",
    proxy: "working/proxy.mp4",
    sampleRate: 48_000,
    fps: 30,
    width: 1280,
    height: 720,
    durationSamples: 480_000,
    padMs: 50,
    words: [
      {
        id: "w0",
        text: "hello",
        startSample: 0,
        endSample: 24_000,
        deleted: false,
      },
      {
        id: "w1",
        text: "world",
        startSample: 24_000,
        endSample: 48_000,
        deleted: true,
      },
    ],
    titles: [
      {
        id: "t1",
        kind: "lower-third",
        text: "Keep me",
        startSample: 0,
        endSample: 96_000,
      },
    ],
    ...overrides,
  });
}

function mkPatch() {
  return {
    source: "/tmp/new-source.mp4",
    proxy: "working/proxy.mp4",
    sampleRate: 48_000 as const,
    fps: 30,
    width: 1280,
    height: 720,
    durationSamples: 480_000,
    multicam: MulticamProvenanceSchema.parse({
      version: 1,
      mode: "follow",
      settings: {
        minShotMs: 2000,
        interjectionMs: 700,
        leadMs: 250,
        maxShotMs: 25_000,
        snapMs: 120,
        wide: "auto",
      },
      plan: [{ fromSample: 0, toSample: 480_000, shot: "cam1" }],
      cams: [
        {
          id: "cam1",
          name: "A",
          role: "speaker",
          offsetMs: 0,
          source: "/a.mp4",
        },
        {
          id: "cam2",
          name: "B",
          role: "speaker",
          offsetMs: 0,
          source: "/b.mp4",
        },
      ],
      attributions: [],
      plannedBy: "follow",
      plannedAt: "2026-07-12T00:00:00.000Z",
      programAudio: { masterMix: null },
    }),
  };
}

test("applyCamMixToProject preserves edit state and deletions when words match", () => {
  const loaded = mkProject();
  const fresh = [
    {
      id: "w0",
      text: "hello",
      startSample: 0,
      endSample: 24_000,
      deleted: false,
    },
    {
      id: "w1",
      text: "world",
      startSample: 24_000,
      endSample: 48_000,
      deleted: false,
    },
  ];
  const words = applyCamMixToProject(loaded, mkPatch(), fresh, [
    { wordId: "w0", camId: "cam1" },
    { wordId: "w1", camId: "cam2" },
  ]);
  assert.equal(loaded.titles.length, 1, "user titles survive re-mix");
  assert.equal(loaded.titles[0]?.text, "Keep me");
  assert.equal(
    words[1]?.deleted,
    true,
    "user deletion survives (existing words kept)"
  );
  assert.equal(words[0]?.speaker, "cam1", "speaker stamped");
  assert.equal(words[1]?.speaker, "cam2");
  assert.equal(loaded.source, "/tmp/new-source.mp4", "source refreshed");
  assert.ok(loaded.multicam, "provenance attached");
});

test("applyCamMixToProject adopts fresh words when transcript diverges, keeps other state", () => {
  const loaded = mkProject();
  const fresh = [
    {
      id: "w0",
      text: "different",
      startSample: 0,
      endSample: 24_000,
      deleted: false,
    },
    {
      id: "w1",
      text: "content",
      startSample: 24_000,
      endSample: 48_000,
      deleted: false,
    },
  ];
  const words = applyCamMixToProject(loaded, mkPatch(), fresh, []);
  assert.equal(words[0]?.text, "different", "fresh transcript adopted");
  assert.equal(
    words[1]?.deleted,
    false,
    "old deletions not carried onto new words"
  );
  assert.equal(loaded.titles.length, 1, "non-word edit state still survives");
});

test("buildCamMixVideoFilter pads missing footage so segment durations stay exact", () => {
  const cams = [
    mkCam({ id: "cam1", role: "speaker" }),
    // cam2 starts 2s late and its file is only 4s long
    mkCam({
      id: "cam2",
      role: "speaker",
      offsetMs: 2000,
      durationSamples: sec(4),
    }),
  ];
  const plan: PlanSpan[] = [
    // cam2 shown for project 0-4s: first 2s have no cam2 footage (lead pad)
    { fromSample: 0, toSample: sec(4), shot: "cam2" },
    // cam2 shown for project 4-8s: cam2 footage ends at project 6s (tail pad)
    { fromSample: sec(4), toSample: sec(8), shot: "cam2" },
    { fromSample: sec(8), toSample: sec(12), shot: "cam1" },
  ];
  const { filter } = buildCamMixVideoFilter(plan, cams, {
    width: 1280,
    height: 720,
    fps: 30,
  });
  assert.ok(
    /tpad=[^;[]*start_duration=2/.test(filter),
    `lead gap padded with 2s: ${filter.slice(0, 400)}`
  );
  assert.ok(
    /tpad=[^;[]*stop_duration=2/.test(filter),
    "tail gap padded with 2s"
  );
  assert.ok(
    !/\[2:v\]|\[seg2\][^;]*tpad/.test(filter.split("[seg2]")[0] ?? ""),
    "fully covered cam1 span gets no pad"
  );
});

test("camMix integration: offset/short cam padding renders exact duration via real ffmpeg", {
  timeout: 180_000,
}, async () => {
  if (process.env.OPENKLIP_INTEGRATION !== "1") {
    return;
  }
  if (typeof FFMPEG !== "string" || !existsSync(FFMPEG)) {
    return;
  }

  await withTempProjectsRoot(async ({ slug }) => {
    const dir = projectPaths(slug).dir;
    const videoA = join(dir, "cam-a.mp4");
    const videoB = join(dir, "cam-b.mp4");

    await Bun.spawn([
      FFMPEG,
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x240:r=30:d=12",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=12",
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
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=320x240:r=30:d=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:sample_rate=48000:duration=4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      videoB,
    ]).exited;

    await ingestCam(slug, videoA, { id: "cam1", name: "A", force: true });
    await ingestCam(slug, videoB, {
      id: "cam2",
      name: "B",
      offsetMs: 2000,
      force: true,
    });

    const plan = [
      { fromSample: 0, toSample: sec(4), shot: "cam2" },
      { fromSample: sec(4), toSample: sec(8), shot: "cam2" },
      { fromSample: sec(8), toSample: sec(12), shot: "cam1" },
    ];

    const result = await camMix(slug, { mode: "follow", plan });
    const sourcePath = result.sourcePath;
    assert.ok(existsSync(sourcePath));

    const meta = await probe(sourcePath);
    assert.ok(
      Math.abs(meta.durationSec - 12) < 0.15,
      `expected ~12s output (padding keeps segments exact), got ${meta.durationSec}s`
    );
  });
});
