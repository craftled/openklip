import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  type Asset,
  type Broll,
  type MusicPlacement,
  type Project,
  SAMPLE_RATE,
  sec,
  survivingRanges,
} from "../src/edl.ts";
import {
  buildAudioParts,
  buildMusicFilterParts,
  chooseAssetInput,
  chooseSourceInput,
  type ExportCompression,
  encoderArgsFor,
  exportCut,
  fpsFilterFor,
  graphicWindowDurationSamples,
  parseExportFpsFlag,
  planBrollForRanges,
  planGraphicWindow,
  planMusicWindows,
  resolveOutputFps,
} from "../src/exporter.ts";
import { FFMPEG, FFPROBE, probe, run } from "../src/ffmpeg.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "openklip-exporter-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("chooseSourceInput prefers the original source when it exists", () => {
  withTempDir((dir) => {
    const source = join(dir, "source.mp4");
    const proxy = join(dir, "proxy.mp4");
    writeFileSync(source, "source");
    writeFileSync(proxy, "proxy");

    const picked = chooseSourceInput({ dir, proxy, source });

    assert.equal(picked.path, source);
    assert.equal(picked.kind, "original");
  });
});

test("chooseSourceInput falls back to the project proxy when the source is missing", () => {
  withTempDir((dir) => {
    const proxy = join(dir, "proxy.mp4");
    writeFileSync(proxy, "proxy");

    const picked = chooseSourceInput({
      dir,
      proxy: "proxy.mp4",
      source: join(dir, "missing.mp4"),
    });

    assert.equal(picked.path, proxy);
    assert.equal(picked.kind, "proxy");
  });
});

test("chooseSourceInput gives an actionable error when no video input exists", () => {
  withTempDir((dir) => {
    assert.throws(
      () =>
        chooseSourceInput({
          dir,
          proxy: "proxy.mp4",
          source: join(dir, "missing.mp4"),
        }),
      /missing source video/
    );
  });
});

test("chooseAssetInput falls back to the proxied project asset when the source asset is missing", () => {
  withTempDir((dir) => {
    const assetDir = join(dir, "assets");
    const proxy = join(assetDir, "b-roll.mp4");
    mkdirSync(assetDir);
    writeFileSync(proxy, "proxy", { flag: "w" });

    const picked = chooseAssetInput(dir, {
      id: "b-roll",
      name: "b-roll.mp4",
      src: join(dir, "missing-b-roll.mp4"),
      proxy: "assets/b-roll.mp4",
      durationSamples: 48_000,
    });

    assert.equal(picked.path, proxy);
    assert.equal(picked.kind, "proxy");
  });
});

test("chooseAssetInput names the asset kind when source and proxy are missing", () => {
  withTempDir((dir) => {
    assert.throws(
      () =>
        chooseAssetInput(dir, {
          id: "bed",
          kind: "music",
          name: "bed.mp3",
          src: join(dir, "missing-bed.mp3"),
          proxy: "assets/bed.aac",
          durationSamples: 48_000,
        }),
      /missing music asset "bed"/
    );
  });
});

test("planBrollForRanges splits a b-roll cover across deleted gaps", () => {
  const broll: Broll = {
    id: "br1",
    assetId: "b-roll",
    startSample: Math.round(0.5 * SAMPLE_RATE),
    endSample: Math.round(3.5 * SAMPLE_RATE),
    srcInSample: 0,
  };

  const plans = planBrollForRanges({
    broll,
    firstInputIndex: 1,
    ranges: [
      { startSec: 0, endSec: 1 },
      { startSec: 3, endSec: 5 },
    ],
    sampleRate: SAMPLE_RATE,
    srcPath: "/tmp/b-roll.mp4",
  });

  assert.deepEqual(
    plans.map((p) => ({
      inputIndex: p.inputIndex,
      outEnd: p.outEnd,
      outStart: p.outStart,
      srcInSec: p.srcInSec,
    })),
    [
      { inputIndex: 1, outEnd: 1, outStart: 0.5, srcInSec: 0 },
      { inputIndex: 2, outEnd: 1.5, outStart: 1, srcInSec: 2.5 },
    ]
  );
});

test("planGraphicWindow maps a graphic span onto the output timeline", () => {
  // A graphic covering source 0.5s..2.5s with a deleted gap (1s..3s removed):
  // surviving ranges [0,1] then [3,5] -> output. The graphic's 0.5..1.0 maps to
  // output 0.5..1.0; the 1.0..2.5 portion falls inside the deleted gap and is
  // clamped, so the window collapses to the surviving [0.5,1.0] slice.
  const win = planGraphicWindow({
    startSample: Math.round(0.5 * SAMPLE_RATE),
    endSample: Math.round(0.9 * SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
    ranges: [
      { startSec: 0, endSec: 1 },
      { startSec: 3, endSec: 5 },
    ],
  });

  assert.deepEqual(win, { outStart: 0.5, outEnd: 0.9 });
});

test("planGraphicWindow returns null when the surviving span is below the 0.05s guard", () => {
  const win = planGraphicWindow({
    startSample: Math.round(1.0 * SAMPLE_RATE),
    endSample: Math.round(1.02 * SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
    ranges: [{ startSec: 0, endSec: 5 }],
  });

  assert.equal(win, null);
});

test("planGraphicWindow shifts the window earlier when an earlier range is deleted", () => {
  // Source span 3.5s..4.5s with the first second [0,1] deleted (kept [1,2],[3,5]).
  // Output time of 3.5s = (2-1) + (3.5-3) = 1.5; 4.5s = 1 + 1.5 = 2.5.
  const win = planGraphicWindow({
    startSample: Math.round(3.5 * SAMPLE_RATE),
    endSample: Math.round(4.5 * SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
    ranges: [
      { startSec: 1, endSec: 2 },
      { startSec: 3, endSec: 5 },
    ],
  });

  assert.deepEqual(win, { outStart: 1.5, outEnd: 2.5 });
});

test("graphicWindowDurationSamples uses clipped output duration", () => {
  const win = planGraphicWindow({
    startSample: Math.round(0.5 * SAMPLE_RATE),
    endSample: Math.round(4.5 * SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
    ranges: [
      { startSec: 0, endSec: 1 },
      { startSec: 4, endSec: 5 },
    ],
  });

  assert.ok(win);
  assert.deepEqual(win, { outStart: 0.5, outEnd: 1.5 });
  assert.equal(graphicWindowDurationSamples(win, SAMPLE_RATE), SAMPLE_RATE);
});

// ── FEATURE 1: notes are metadata only and NEVER reach ffmpeg ────────────────
// The exporter is UNTOUCHED by the note feature. To pin "metadata only", build
// the exact computations that feed ffmpeg (the select expression over surviving
// ranges, the b-roll input plans, and the graphic output windows) for a project
// WITH a note on every overlay + word and for the same project WITHOUT any note,
// and assert the derived ffmpeg inputs are byte-identical.
function noteGuardFixture(withNotes: boolean): Project {
  const s = (n: number) => n * SAMPLE_RATE;
  const note = (text: string) => (withNotes ? { note: text } : {});
  return {
    version: 1,
    slug: "note-guard",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: s(6),
    padMs: 0,
    captions: { enabled: true, maxWords: 6 },
    assets: [
      {
        id: "broll-1",
        kind: "broll",
        name: "broll.mp4",
        src: "/tmp/broll.mp4",
        proxy: "assets/broll-1.mp4",
        durationSamples: s(10),
      },
    ],
    broll: [
      {
        id: "br1",
        assetId: "broll-1",
        startSample: s(0),
        endSample: s(3),
        srcInSample: 0,
        ...note("cover the intro"),
      },
    ],
    look: { vignette: false, filter: "none" },
    zooms: [],
    titles: [],
    stills: [],
    graphics: [
      {
        id: "g1",
        template: "lower-third",
        params: {},
        startSample: s(1),
        endSample: s(4),
        track: "title",
        ...note("name the speaker"),
      },
    ],
    words: Array.from({ length: 6 }, (_, i) => ({
      id: `w${i}`,
      text: `word${i}`,
      startSample: s(i),
      endSample: s(i + 1),
      deleted: i === 2,
      ...note(`why word${i}`),
    })),
    motion: { fadeMs: 180, heroFadeMs: 320, slideFrac: 0.04, speed: 1 },
  };
}

function ffmpegInputs(project: Project) {
  const ranges = survivingRanges(project);
  const selectExpr = ranges
    .map((r) => `between(t,${sec(r.startSec)},${sec(r.endSec)})`)
    .join("+");
  const brollPlans = project.broll.flatMap((b) =>
    planBrollForRanges({
      broll: b,
      firstInputIndex: 1,
      ranges,
      sampleRate: project.sampleRate,
      srcPath: "/tmp/broll.mp4",
    })
  );
  const graphicWindows = (project.graphics ?? []).map((g) =>
    planGraphicWindow({
      startSample: g.startSample,
      endSample: g.endSample,
      sampleRate: project.sampleRate,
      ranges,
    })
  );
  return { selectExpr, ranges, brollPlans, graphicWindows };
}

test("notes never change the ffmpeg argv/filter inputs (metadata only)", () => {
  const withNotes = ffmpegInputs(noteGuardFixture(true));
  const withoutNotes = ffmpegInputs(noteGuardFixture(false));
  assert.deepEqual(withNotes, withoutNotes);
  // And the select expression string itself is identical.
  assert.equal(withNotes.selectExpr, withoutNotes.selectExpr);
});

// ── Export settings: compression presets + output frame rate (pure) ─────────

test("encoderArgsFor social pins today's default encoder args", () => {
  assert.deepEqual(encoderArgsFor("social"), [
    "-preset",
    "medium",
    "-crf",
    "18",
  ]);
});

test("encoderArgsFor defaults to the social preset", () => {
  assert.deepEqual(encoderArgsFor(undefined), encoderArgsFor("social"));
});

test("encoderArgsFor CRF ordering runs studio < social < web < web-low", () => {
  const crf = (c: ExportCompression): number => {
    const args = encoderArgsFor(c);
    return Number(args[args.indexOf("-crf") + 1]);
  };
  assert.ok(crf("studio") < crf("social"));
  assert.ok(crf("social") < crf("web"));
  assert.ok(crf("web") < crf("web-low"));
});

test("resolveOutputFps rounds the source rate when nothing is requested", () => {
  assert.equal(resolveOutputFps(29.97, undefined), 30);
  assert.equal(resolveOutputFps(0.4, undefined), 1);
});

test("resolveOutputFps honors a requested rate", () => {
  assert.equal(resolveOutputFps(29.97, 24), 24);
  assert.equal(resolveOutputFps(29.97, 30), 30);
  assert.equal(resolveOutputFps(29.97, 60), 60);
});

test("fpsFilterFor always pins the resolved output rate", () => {
  assert.equal(fpsFilterFor(30, 24), ",fps=24");
  assert.equal(fpsFilterFor(30, 30), ",fps=30");
  // Source passthrough is still pinned explicitly: frame-rate metadata does
  // not reliably survive the select filter on every ffmpeg build (the Linux
  // ffmpeg-static falls back to 25 fps), so the resolved rate is always
  // written into the chain instead of trusting FRAME_RATE propagation.
  assert.equal(fpsFilterFor(29.97, undefined), ",fps=30");
  // An explicit number on a fractional source is a true retime order.
  assert.equal(fpsFilterFor(29.97, 30), ",fps=30");
});

test("parseExportFpsFlag accepts integers 1-120 and rejects the rest", () => {
  assert.equal(parseExportFpsFlag("24"), 24);
  for (const raw of ["22.5", "0", "240"]) {
    assert.throws(
      () => parseExportFpsFlag(raw),
      /--fps must be an integer between 1 and 120/,
      raw
    );
  }
});

// ── MILESTONE 4.1: music placement (pure planner + filter builder) ──────────

const MUSIC_ASSET: Asset = {
  id: "bed",
  kind: "music",
  name: "bed.mp3",
  src: "/tmp/bed.mp3",
  proxy: "assets/bed.aac",
  durationSamples: 8 * SAMPLE_RATE,
};

function musicPlacement(
  overrides: Partial<MusicPlacement> = {}
): MusicPlacement {
  return {
    id: "m1",
    assetId: "bed",
    startSample: Math.round(0.5 * SAMPLE_RATE),
    endSample: Math.round(4.5 * SAMPLE_RATE),
    srcInSample: 0,
    gain: 1,
    fadeInSec: 0,
    fadeOutSec: 0,
    mode: "trim",
    ...overrides,
  };
}

test("planMusicWindows maps a placement to ONE continuous output window across a gap", () => {
  const windows = planMusicWindows({
    music: [musicPlacement({ srcInSample: Math.round(0.25 * SAMPLE_RATE) })],
    assets: [MUSIC_ASSET],
    ranges: [
      { startSec: 0, endSec: 1 },
      { startSec: 3, endSec: 5 },
    ],
    sampleRate: SAMPLE_RATE,
  });
  // Source 0.5s -> output 0.5s; source 4.5s -> output 1 + (4.5-3) = 2.5s. One
  // window spans the collapsed cut, so the bed never restarts (unlike b-roll,
  // which splits into a plan per surviving range).
  assert.equal(windows.length, 1);
  assert.equal(windows[0].outStart, 0.5);
  assert.equal(windows[0].outEnd, 2.5);
  assert.equal(windows[0].srcInSec, 0.25);
});

test("planMusicWindows drops windows shorter than 0.05s", () => {
  const windows = planMusicWindows({
    music: [
      musicPlacement({
        startSample: Math.round(1.0 * SAMPLE_RATE),
        endSample: Math.round(1.02 * SAMPLE_RATE),
      }),
    ],
    assets: [MUSIC_ASSET],
    ranges: [{ startSec: 0, endSec: 5 }],
    sampleRate: SAMPLE_RATE,
  });
  assert.equal(windows.length, 0);
});

test("planMusicWindows skips unknown and non-music asset references", () => {
  const windows = planMusicWindows({
    music: [
      musicPlacement({ assetId: "missing" }),
      musicPlacement({ id: "m2", assetId: "broll-1" }),
    ],
    assets: [MUSIC_ASSET, { ...MUSIC_ASSET, id: "broll-1", kind: "broll" }],
    ranges: [{ startSec: 0, endSec: 5 }],
    sampleRate: SAMPLE_RATE,
  });
  assert.equal(windows.length, 0);
});

test("buildMusicFilterParts emits aresample/aloop/atrim/volume/afade/adelay for a loop placement", () => {
  const [win] = planMusicWindows({
    music: [
      musicPlacement({
        startSample: 1 * SAMPLE_RATE,
        endSample: 5 * SAMPLE_RATE,
        srcInSample: Math.round(0.5 * SAMPLE_RATE),
        gain: 0.3,
        fadeInSec: 1,
        fadeOutSec: 0.5,
        mode: "loop",
      }),
    ],
    assets: [MUSIC_ASSET],
    ranges: [{ startSec: 0, endSec: 6 }],
    sampleRate: SAMPLE_RATE,
  });
  const graph = buildMusicFilterParts([{ ...win, srcPath: "/tmp/bed.mp3" }], {
    firstInputIndex: 3,
  });
  assert.deepEqual(graph.inputArgs, ["-i", "/tmp/bed.mp3"]);
  assert.deepEqual(graph.mixInputLabels, ["m0"]);
  // aresample runs FIRST so aloop's size (48 kHz samples) matches the input
  // grid even when chooseAssetInput picks a 44.1/96 kHz original.
  assert.equal(
    graph.filterParts[0],
    "[3:a]aresample=48000,aloop=loop=-1:size=384000,atrim=start=0.500000:duration=4.000000,asetpts=PTS-STARTPTS,volume=0.300000,afade=t=in:st=0:d=1.000000,afade=t=out:st=3.500000:d=0.500000,adelay=1000:all=1[m0]"
  );
});

test("buildMusicFilterParts omits aloop and zero fades for a plain trim placement", () => {
  const [win] = planMusicWindows({
    music: [musicPlacement({ gain: 1 })],
    assets: [MUSIC_ASSET],
    ranges: [{ startSec: 0, endSec: 6 }],
    sampleRate: SAMPLE_RATE,
  });
  const graph = buildMusicFilterParts([{ ...win, srcPath: "/tmp/bed.mp3" }], {
    firstInputIndex: 1,
  });
  const chain = graph.filterParts[0];
  assert.doesNotMatch(chain, /aloop/);
  assert.doesNotMatch(chain, /afade/);
  assert.match(
    chain,
    /^\[1:a\]aresample=48000,atrim=start=0\.000000:duration=4\.000000/
  );
  assert.match(chain, /volume=1\.000000/);
  // all=1 so every channel is delayed, not just the first two.
  assert.match(chain, /adelay=500:all=1\[m0\]$/);
});

test("buildAudioParts mixes voice under music with amix duration=first normalize=0", () => {
  const windows = planMusicWindows({
    music: [
      musicPlacement(),
      musicPlacement({
        id: "m2",
        startSample: 5 * SAMPLE_RATE,
        endSample: 6 * SAMPLE_RATE,
      }),
    ],
    assets: [MUSIC_ASSET],
    ranges: [{ startSec: 0, endSec: 6 }],
    sampleRate: SAMPLE_RATE,
  });
  const graph = buildMusicFilterParts(
    windows.map((w) => ({ ...w, srcPath: "/tmp/bed.mp3" })),
    { firstInputIndex: 1 }
  );
  const expr = "between(t,0.000000,6.000000)";
  const parts = buildAudioParts(expr, graph);
  assert.equal(parts[0], `[0:a]aselect='${expr}',asetpts=N/SR/TB[avoice]`);
  assert.equal(
    parts.at(-1),
    "[avoice][m0][m1]amix=inputs=3:duration=first:normalize=0[aout]"
  );
});

test("zero music placements leave the audio graph byte-identical to today", () => {
  const graph = buildMusicFilterParts([], { firstInputIndex: 1 });
  assert.deepEqual(graph, {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  });
  const expr = "between(t,0.000000,6.000000)";
  assert.deepEqual(buildAudioParts(expr, graph), [
    `[0:a]aselect='${expr}',asetpts=N/SR/TB[aout]`,
  ]);
});

test("music placements never change the video planning (selectExpr/broll/graphics)", () => {
  const base = noteGuardFixture(false);
  const withMusic: Project = {
    ...base,
    assets: [...base.assets, MUSIC_ASSET],
    music: [musicPlacement()],
  };
  assert.deepEqual(ffmpegInputs(withMusic), ffmpegInputs(base));
});

// ── Skip-gated ffmpeg smoke: settings reach the encoder (assembly.test.ts
// pattern). Pure planner coverage stays above; this only proves fps/compression
// survive the argv end to end on a tiny 2s lavfi clip.
const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

test("exportCut applies the requested fps and compression (smoke)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    // testsrc carries enough detail that CRF changes move the file size.
    await run(
      FFMPEG,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=2:size=320x240:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        src,
      ],
      "ffmpeg(export-smoke-clip)"
    );
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        source: src,
        fps: 30,
        width: 320,
        height: 240,
        durationSamples: 2 * SAMPLE_RATE,
        captions: { enabled: false, maxWords: 6 },
        words: [
          {
            id: "w0",
            text: "Hello",
            startSample: 0,
            endSample: SAMPLE_RATE,
            deleted: false,
          },
          {
            id: "w1",
            text: "world",
            startSample: SAMPLE_RATE,
            endSample: 2 * SAMPLE_RATE,
            deleted: false,
          },
        ],
      })
    );

    const low = await exportCut(slug, { fps: 24, compression: "web-low" });
    assert.equal(low.fps, 24);
    assert.equal(low.compression, "web-low");
    assert.equal((await probe(p.out)).fps, 24);
    const lowBytes = statSync(p.out).size;

    const studio = await exportCut(slug, { compression: "studio" });
    assert.equal(studio.fps, 30);
    assert.equal(studio.compression, "studio");
    assert.equal((await probe(p.out)).fps, 30);
    const studioBytes = statSync(p.out).size;

    // The compression setting must change the output bitrate.
    assert.ok(
      studioBytes > lowBytes,
      `studio export (${studioBytes}B) should outweigh web-low (${lowBytes}B)`
    );
  });
});

test("exportCut mixes a placed music bed under the voice (smoke)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    await run(
      FFMPEG,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=320x240:r=30:d=4",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=4",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        src,
      ],
      "ffmpeg(music-smoke-source)"
    );
    const bed = join(p.dir, "assets", "bed.aac");
    mkdirSync(join(p.dir, "assets"), { recursive: true });
    await run(
      FFMPEG,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=2",
        "-c:a",
        "aac",
        "-ar",
        String(SAMPLE_RATE),
        "-ac",
        "2",
        bed,
      ],
      "ffmpeg(music-smoke-bed)"
    );
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        source: src,
        fps: 30,
        width: 320,
        height: 240,
        durationSamples: 4 * SAMPLE_RATE,
        captions: { enabled: false, maxWords: 6 },
        assets: [
          {
            id: "bed",
            kind: "music",
            name: "bed.aac",
            src: bed,
            proxy: "assets/bed.aac",
            durationSamples: 2 * SAMPLE_RATE,
          },
        ],
        music: [
          {
            id: "m1",
            assetId: "bed",
            startSample: 0,
            endSample: 2 * SAMPLE_RATE,
            srcInSample: 0,
            gain: 0.3,
            fadeInSec: 0,
            fadeOutSec: 0.5,
            mode: "trim",
          },
        ],
        words: Array.from({ length: 4 }, (_, i) => ({
          id: `w${i}`,
          text: `word${i}`,
          startSample: i * SAMPLE_RATE,
          endSample: (i + 1) * SAMPLE_RATE,
          deleted: false,
        })),
      })
    );

    const result = await exportCut(slug);
    assert.equal(result.music, 1);
    assert.ok(existsSync(p.out), "out.mp4 missing");

    // One mixed audio stream, and the bed must not stretch the cut duration.
    const probeProc = Bun.spawn(
      [
        FFPROBE,
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        p.out,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const probed = JSON.parse(await new Response(probeProc.stdout).text()) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string }>;
    };
    await probeProc.exited;
    const audioStreams = (probed.streams ?? []).filter(
      (s) => s.codec_type === "audio"
    );
    assert.equal(audioStreams.length, 1);
    const durationSec = Number(probed.format?.duration ?? 0);
    assert.ok(
      Math.abs(durationSec - 4) < 0.35,
      `expected ~4s of mixed audio+video, got ${durationSec}s`
    );
  });
});
