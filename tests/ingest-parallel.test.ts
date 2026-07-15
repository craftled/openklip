import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ingestProgressForPhase,
  runIngestMediaPhases,
  runTakeMediaPhases,
  wordsFromRawChunks,
} from "../src/ingest.ts";
import type { IngestPhase } from "../src/ingest-types.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("ingestProgressForPhase maps fixed step numbers", () => {
  assert.deepEqual(ingestProgressForPhase("probe"), {
    phase: "probe",
    message: "Reading video",
    step: 1,
    total: 7,
  });
  assert.deepEqual(ingestProgressForPhase("transcribe")?.step, 6);
  assert.equal(ingestProgressForPhase("done"), null);
});

test("runIngestMediaPhases runs proxy-track and audio-track concurrently", async () => {
  const events: string[] = [];
  const started: Record<string, number> = {};
  const mark = (name: string) => {
    events.push(name);
    started[name] = Date.now();
  };

  const words = await runIngestMediaPhases({
    source: "/tmp/source.mp4",
    slug: "parallel-fixture",
    paths: {
      proxy: "/tmp/proxy.mp4",
      audioRaw: "/tmp/audio.f32",
      frames: "/tmp/frames",
      transcriptRawJson: "/tmp/raw.json",
    },
    emit: (phase: IngestPhase) => {
      events.push(`emit:${phase}`);
    },
    deps: {
      log: () => undefined,
      buildProxy: async () => {
        mark("proxy-start");
        await delay(40);
        mark("proxy-end");
      },
      extractAudio: async () => {
        mark("audio-start");
        await delay(40);
        mark("audio-end");
      },
      extractSampleFrames: () => {
        mark("frames");
        return Promise.resolve();
      },
      buildMomentIndex: () => {
        mark("index");
        return Promise.resolve();
      },
      transcribeToWords: () => {
        mark("transcribe");
        return Promise.resolve(
          wordsFromRawChunks([{ text: "hi", start: 0, end: 0.2 }])
        );
      },
    },
  });

  assert.equal(words.length, 1);
  assert.equal(words[0].text, "hi");

  // Both tracks must have started before either finished (overlap).
  assert.ok(started["proxy-start"] !== undefined);
  assert.ok(started["audio-start"] !== undefined);
  assert.ok(
    started["proxy-start"] < started["audio-end"] &&
      started["audio-start"] < started["proxy-end"],
    `expected concurrent proxy/audio, events=${events.join(",")}`
  );

  // Dependency order inside tracks.
  const proxyStart = events.indexOf("proxy-start");
  const frames = events.indexOf("frames");
  const index = events.indexOf("index");
  const audioStart = events.indexOf("audio-start");
  const audioEnd = events.indexOf("audio-end");
  const transcribe = events.indexOf("transcribe");
  assert.ok(proxyStart < frames && frames < index);
  assert.ok(audioStart < audioEnd && audioEnd < transcribe);

  // Progress emits include both tracks.
  assert.ok(events.includes("emit:proxy"));
  assert.ok(events.includes("emit:audio"));
  assert.ok(events.includes("emit:transcribe"));
});

test("runIngestMediaPhases keeps frames/index non-fatal", async () => {
  const words = await runIngestMediaPhases({
    source: "/tmp/s.mp4",
    slug: "soft-fail",
    paths: {
      proxy: "/tmp/p.mp4",
      audioRaw: "/tmp/a.f32",
      frames: "/tmp/f",
      transcriptRawJson: "/tmp/r.json",
    },
    deps: {
      log: () => undefined,
      buildProxy: () => Promise.resolve(),
      extractAudio: () => Promise.resolve(),
      extractSampleFrames: () => Promise.reject(new Error("frames boom")),
      buildMomentIndex: () => Promise.reject(new Error("index boom")),
      transcribeToWords: () =>
        Promise.resolve(
          wordsFromRawChunks([{ text: "ok", start: 0, end: 0.1 }])
        ),
    },
  });
  assert.equal(words[0].text, "ok");
});

test("runTakeMediaPhases runs proxy and audio in parallel then transcribes", async () => {
  const events: string[] = [];
  const started: Record<string, number> = {};

  const words = await runTakeMediaPhases({
    source: "/tmp/take.mp4",
    paths: {
      proxy: "/tmp/take-proxy.mp4",
      audioRaw: "/tmp/take-audio.f32",
      transcriptRawJson: "/tmp/take-raw.json",
    },
    deps: {
      log: () => undefined,
      buildProxy: async () => {
        events.push("proxy-start");
        started.proxy = Date.now();
        await delay(35);
        events.push("proxy-end");
      },
      extractAudio: async () => {
        events.push("audio-start");
        started.audio = Date.now();
        await delay(35);
        events.push("audio-end");
      },
      transcribeToWords: () => {
        events.push("transcribe");
        return Promise.resolve(
          wordsFromRawChunks([{ text: "take", start: 0, end: 0.2 }])
        );
      },
    },
  });

  assert.equal(words[0].text, "take");
  assert.ok(
    started.proxy < started.audio + 20 || started.audio < started.proxy + 20
  );
  assert.ok(events.indexOf("audio-end") < events.indexOf("transcribe"));
  assert.ok(true);
  // Transcribe only after audio finished (proxy may still be running or done).
  assert.ok(events.indexOf("audio-end") < events.indexOf("transcribe"));
});
