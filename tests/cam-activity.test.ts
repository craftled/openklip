import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_SAMPLE_RATE,
  DEFAULT_THRESHOLD_DB,
  DEFAULT_WINDOW_MS,
} from "../src/audio-analysis-core.ts";
import {
  attributeWords,
  computeActivityFromPcm,
  dbAt,
  loadCamActivity,
  programAudioArgs,
  speakingSpans,
  type ActivityCam,
  type CamActivity,
} from "../src/cam-activity.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { FFMPEG } from "../src/ffmpeg.ts";

const PCM_RATE = DEFAULT_SAMPLE_RATE;
const WINDOW_MS = DEFAULT_WINDOW_MS;

function windowSamples(windowMs = WINDOW_MS, sampleRate = PCM_RATE): number {
  return Math.max(1, Math.round((sampleRate * windowMs) / 1000));
}

function makePcm(opts: {
  durationSec: number;
  sampleRate?: number;
  signalWindows?: Array<{ startMs: number; endMs: number; amplitude?: number }>;
}): Float32Array {
  const sampleRate = opts.sampleRate ?? PCM_RATE;
  const length = Math.ceil(opts.durationSec * sampleRate);
  const pcm = new Float32Array(length);
  for (const win of opts.signalWindows ?? []) {
    const amp = win.amplitude ?? 0.5;
    const start = Math.floor((win.startMs / 1000) * sampleRate);
    const end = Math.min(length, Math.ceil((win.endMs / 1000) * sampleRate));
    for (let i = start; i < end; i++) {
      pcm[i] = amp * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
  }
  return pcm;
}

function makeActivity(
  camId: string,
  pcm: Float32Array,
  windowMs = WINDOW_MS
): CamActivity {
  return {
    camId,
    windowMs,
    db: computeActivityFromPcm(pcm, { windowMs }),
  };
}

function cam(
  id: string,
  role: ActivityCam["role"],
  offsetMs: number,
  audioPath: string
): ActivityCam {
  return { id, role, offsetMs, audioPath };
}

test("computeActivityFromPcm returns one dB value per window", () => {
  const pcm = makePcm({ durationSec: 0.5 });
  const db = computeActivityFromPcm(pcm);
  const expectedWindows = Math.ceil(pcm.length / windowSamples());
  assert.equal(db.length, expectedWindows);
});

test("computeActivityFromPcm separates silence from signal", () => {
  const pcm = makePcm({
    durationSec: 0.4,
    signalWindows: [{ startMs: 0, endMs: 200, amplitude: 0.5 }],
  });
  const db = computeActivityFromPcm(pcm);
  const silentWindow = db[15]!;
  const signalWindow = db[0]!;
  assert.ok(signalWindow > DEFAULT_THRESHOLD_DB);
  assert.ok(silentWindow < DEFAULT_THRESHOLD_DB);
  assert.ok(signalWindow - silentWindow > 20);
});

test("dbAt maps cam-local window 0 to project time with offset", () => {
  const pcm = makePcm({
    durationSec: 2,
    signalWindows: [{ startMs: 0, endMs: 40, amplitude: 0.8 }],
  });
  const activity = makeActivity("cam-a", pcm);
  const c = cam("cam-a", "speaker", 1000, "/tmp/cam-a.f32");
  const atOffset = dbAt(activity, c, 1.0);
  const atLocalZero = dbAt(activity, c, 0);
  assert.ok(atOffset > DEFAULT_THRESHOLD_DB);
  assert.equal(atLocalZero, Number.NEGATIVE_INFINITY);
});

test("dbAt returns -Infinity outside cam PCM range", () => {
  const pcm = makePcm({ durationSec: 0.5 });
  const activity = makeActivity("cam-a", pcm);
  const c = cam("cam-a", "speaker", 0, "/tmp/cam-a.f32");
  assert.equal(dbAt(activity, c, -0.1), Number.NEGATIVE_INFINITY);
  assert.equal(dbAt(activity, c, 10), Number.NEGATIVE_INFINITY);
});

test("speakingSpans alternates two speaker cams", () => {
  const cam1Pcm = makePcm({
    durationSec: 2,
    signalWindows: [{ startMs: 0, endMs: 500, amplitude: 0.7 }],
  });
  const cam2Pcm = makePcm({
    durationSec: 2,
    signalWindows: [{ startMs: 500, endMs: 1000, amplitude: 0.7 }],
  });
  const activities = [
    makeActivity("cam1", cam1Pcm),
    makeActivity("cam2", cam2Pcm),
  ];
  const cams = [
    cam("cam1", "speaker", 0, "/cams/cam1/audio16k.f32"),
    cam("cam2", "speaker", 0, "/cams/cam2/audio16k.f32"),
  ];
  const spans = speakingSpans(activities, cams);
  const cam1Spans = spans.filter((s) => s.camId === "cam1");
  const cam2Spans = spans.filter((s) => s.camId === "cam2");
  assert.equal(cam1Spans.length, 1);
  assert.equal(cam2Spans.length, 1);
  assert.ok(cam1Spans[0]!.fromSample < cam2Spans[0]!.fromSample);
  assert.equal(cam1Spans[0]!.fromSample, 0);
  assert.ok(cam1Spans[0]!.toSample > 0);
});

test("speakingSpans drops bursts shorter than minSpanMs", () => {
  const pcm = makePcm({
    durationSec: 1,
    signalWindows: [{ startMs: 0, endMs: 150, amplitude: 0.8 }],
  });
  const activities = [makeActivity("cam1", pcm)];
  const cams = [cam("cam1", "speaker", 0, "/cams/cam1/audio16k.f32")];
  const spans = speakingSpans(activities, cams, { minSpanMs: 300 });
  assert.equal(spans.length, 0);
});

test("speakingSpans merges short gaps within one cam", () => {
  const pcm = makePcm({
    durationSec: 1.5,
    signalWindows: [
      { startMs: 0, endMs: 400, amplitude: 0.8 },
      { startMs: 500, endMs: 900, amplitude: 0.8 },
    ],
  });
  const activities = [makeActivity("cam1", pcm)];
  const cams = [cam("cam1", "speaker", 0, "/cams/cam1/audio16k.f32")];
  const spans = speakingSpans(activities, cams, {
    minSpanMs: 300,
    mergeGapMs: 200,
  });
  assert.equal(spans.length, 1);
  assert.equal(spans[0]!.camId, "cam1");
});

test("speakingSpans excludes wide-role cams", () => {
  const pcm = makePcm({
    durationSec: 1,
    signalWindows: [{ startMs: 0, endMs: 600, amplitude: 0.8 }],
  });
  const activities = [makeActivity("wide", pcm)];
  const cams = [cam("wide", "wide", 0, "/cams/wide/audio16k.f32")];
  const spans = speakingSpans(activities, cams);
  assert.equal(spans.length, 0);
});

test("speakingSpans preserves overlap when both cams are active", () => {
  const overlapPcm = makePcm({
    durationSec: 1.5,
    signalWindows: [{ startMs: 400, endMs: 800, amplitude: 0.8 }],
  });
  const activities = [
    makeActivity("cam1", overlapPcm),
    makeActivity("cam2", overlapPcm),
  ];
  const cams = [
    cam("cam1", "speaker", 0, "/cams/cam1/audio16k.f32"),
    cam("cam2", "speaker", 0, "/cams/cam2/audio16k.f32"),
  ];
  const spans = speakingSpans(activities, cams, { minSpanMs: 300 });
  assert.equal(spans.filter((s) => s.camId === "cam1").length, 1);
  assert.equal(spans.filter((s) => s.camId === "cam2").length, 1);
});

test("attributeWords assigns words to the active cam burst", () => {
  const cam1Pcm = makePcm({
    durationSec: 2,
    signalWindows: [{ startMs: 0, endMs: 800, amplitude: 0.8 }],
  });
  const cam2Pcm = makePcm({ durationSec: 2 });
  const activities = [
    makeActivity("cam1", cam1Pcm),
    makeActivity("cam2", cam2Pcm),
  ];
  const cams = [
    cam("cam1", "speaker", 0, "/cams/cam1/audio16k.f32"),
    cam("cam2", "speaker", 0, "/cams/cam2/audio16k.f32"),
  ];
  const words = [
    { id: "w0", startSample: 0, endSample: Math.round(0.5 * SAMPLE_RATE) },
  ];
  const result = attributeWords(words, activities, cams);
  assert.equal(result[0]!.wordId, "w0");
  assert.equal(result[0]!.camId, "cam1");
});

test("attributeWords returns null during silence", () => {
  const pcm = makePcm({ durationSec: 2 });
  const activities = [makeActivity("cam1", pcm)];
  const cams = [cam("cam1", "speaker", 0, "/cams/cam1/audio16k.f32")];
  const words = [
    {
      id: "w0",
      startSample: Math.round(1 * SAMPLE_RATE),
      endSample: Math.round(1.5 * SAMPLE_RATE),
    },
  ];
  const result = attributeWords(words, activities, cams);
  assert.equal(result[0]!.camId, null);
});

test("attributeWords picks higher-energy cam during crosstalk", () => {
  const cam1Pcm = makePcm({
    durationSec: 2,
    signalWindows: [{ startMs: 400, endMs: 900, amplitude: 0.9 }],
  });
  const cam2Pcm = makePcm({
    durationSec: 2,
    signalWindows: [{ startMs: 400, endMs: 900, amplitude: 0.2 }],
  });
  const activities = [
    makeActivity("cam1", cam1Pcm),
    makeActivity("cam2", cam2Pcm),
  ];
  const cams = [
    cam("cam1", "speaker", 0, "/cams/cam1/audio16k.f32"),
    cam("cam2", "speaker", 0, "/cams/cam2/audio16k.f32"),
  ];
  const words = [
    {
      id: "w0",
      startSample: Math.round(0.5 * SAMPLE_RATE),
      endSample: Math.round(0.8 * SAMPLE_RATE),
    },
  ];
  const result = attributeWords(words, activities, cams);
  assert.equal(result[0]!.camId, "cam1");
});

test("attributeWords is offset-aware", () => {
  const pcm = makePcm({
    durationSec: 2,
    signalWindows: [{ startMs: 0, endMs: 600, amplitude: 0.8 }],
  });
  const activities = [makeActivity("cam1", pcm)];
  const cams = [cam("cam1", "speaker", 1000, "/cams/cam1/audio16k.f32")];
  const words = [
    {
      id: "w0",
      startSample: SAMPLE_RATE,
      endSample: 2 * SAMPLE_RATE,
    },
  ];
  const result = attributeWords(words, activities, cams);
  assert.equal(result[0]!.camId, "cam1");
});

test("attributeWords converts 48k word samples to 16k PCM windows", () => {
  const pcm = makePcm({
    durationSec: 3,
    signalWindows: [{ startMs: 1000, endMs: 2000, amplitude: 0.8 }],
  });
  const activities = [makeActivity("cam1", pcm)];
  const cams = [cam("cam1", "speaker", 0, "/cams/cam1/audio16k.f32")];
  const words = [
    {
      id: "w0",
      startSample: SAMPLE_RATE,
      endSample: 2 * SAMPLE_RATE,
    },
  ];
  const result = attributeWords(words, activities, cams);
  assert.equal(result[0]!.camId, "cam1");
});

test("programAudioArgs short-circuits when masterMix is provided", () => {
  const args = programAudioArgs([], {
    out: "/tmp/program.wav",
    masterMix: "/tmp/master.wav",
  });
  assert.equal(args[0], FFMPEG);
  assert.ok(args.includes("/tmp/master.wav"));
  assert.ok(args.includes("/tmp/program.wav"));
  assert.ok(!args.includes("amix"));
});

test("programAudioArgs mixes speaker cams with adelay and amix", () => {
  const cams = [
    cam("cam1", "speaker", 0, "/cams/cam1/audio.wav"),
    cam("cam2", "speaker", 500, "/cams/cam2/audio.wav"),
    cam("wide", "wide", 0, "/cams/wide/audio.wav"),
  ];
  const args = programAudioArgs(cams, { out: "/tmp/program.wav" });
  const filter = args[args.indexOf("-filter_complex") + 1] as string;
  assert.equal(args[0], FFMPEG);
  assert.ok(args.includes("/cams/cam1/audio.wav"));
  assert.ok(args.includes("/cams/cam2/audio.wav"));
  assert.ok(!args.includes("/cams/wide/audio.wav"));
  assert.ok(filter.includes("adelay=0:all=1"));
  assert.ok(filter.includes("adelay=500:all=1"));
  assert.ok(filter.includes("amix=inputs=2"));
  assert.ok(filter.includes("loudnorm"));
  assert.equal(args.at(-1), "/tmp/program.wav");
});

test("loadCamActivity caches activity JSON invalidated by PCM mtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "openklip-cam-"));
  const priorRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = root;
  try {
    const slug = "cache-test";
    const camDir = join(root, slug, "cams", "cam1");
    await mkdir(camDir, { recursive: true });
    const pcmPath = join(camDir, "audio16k.f32");
    const pcm = makePcm({
      durationSec: 0.4,
      signalWindows: [{ startMs: 0, endMs: 120, amplitude: 0.6 }],
    });
    const buf = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    await writeFile(pcmPath, buf);

    const activityCam = cam("cam1", "speaker", 0, pcmPath);
    const first = await loadCamActivity(slug, activityCam);
    assert.equal(first.camId, "cam1");
    assert.ok(first.db.length > 0);

    const cachePath = join(camDir, "activity.json");
    assert.ok(await readFile(cachePath, "utf8").then(() => true));

    const cached = JSON.parse(await readFile(cachePath, "utf8")) as {
      sourceMtimeMs: number;
    };
    const second = await loadCamActivity(slug, activityCam);
    assert.deepEqual(second.db, first.db);

    const mtime = (await stat(pcmPath)).mtime;
    await utimes(pcmPath, mtime, new Date(mtime.getTime() + 5000));
    const third = await loadCamActivity(slug, activityCam);
    const refreshed = JSON.parse(await readFile(cachePath, "utf8")) as {
      sourceMtimeMs: number;
    };
    assert.notEqual(refreshed.sourceMtimeMs, cached.sourceMtimeMs);
    assert.deepEqual(third.db, first.db);
  } finally {
    if (priorRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = priorRoot;
    }
  }
});

test("buildProgramAudio renders wav and 16k PCM with integration flag", async () => {
  if (process.env.OPENKLIP_INTEGRATION !== "1") {
    return;
  }
  const { buildProgramAudio } = await import("../src/cam-activity.ts");
  const root = await mkdtemp(join(tmpdir(), "openklip-cam-build-"));
  const priorRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = root;
  try {
    const slug = "build-test";
    const working = join(root, slug, "working");
    await mkdir(working, { recursive: true });
    const sineWav = join(working, "tone.wav");
    await Bun.spawn(
      [
        FFMPEG,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=0.5",
        "-ar",
        "48000",
        "-ac",
        "1",
        sineWav,
      ],
      { stdout: "ignore", stderr: "ignore" }
    ).exited;

    const cams = [cam("cam1", "speaker", 0, sineWav)];
    const out = await buildProgramAudio(slug, cams);
    assert.ok(out.wav.endsWith("program-audio.wav"));
    assert.ok(out.pcm16k.endsWith("program-audio16k.f32"));
    const wavStat = await stat(out.wav);
    const pcmStat = await stat(out.pcm16k);
    assert.ok(wavStat.size > 0);
    assert.ok(pcmStat.size > 0);
  } finally {
    if (priorRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = priorRoot;
    }
  }
});
// ── Orchestrator review regression (lane A2 review) ──────────────────────────

test("programAudioArgs trims lead-in for negative offsets instead of clamping", () => {
  const cams = [
    { id: "cam1", role: "speaker" as const, offsetMs: -1500, audioPath: "/a/cam1.f32" },
    { id: "cam2", role: "speaker" as const, offsetMs: 250, audioPath: "/a/cam2.f32" },
  ];
  const args = programAudioArgs(cams, { out: "/tmp/out.wav" });
  const filter = args[args.indexOf("-filter_complex") + 1] ?? "";
  assert.ok(
    filter.includes("atrim=start=1.500"),
    "negative offset becomes a lead-in trim"
  );
  assert.ok(
    filter.includes("asetpts=PTS-STARTPTS"),
    "trimmed stream resets PTS"
  );
  assert.ok(filter.includes("adelay=250"), "positive offset still delays");
  assert.ok(!filter.includes("adelay=0"), "no zero-clamped delay for the negative cam");
});
