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
import { buildBrollAudioFilterGraph } from "../src/broll-audio.ts";
import { buildBrollOverlayFilters } from "../src/broll-display.ts";
import {
  type Asset,
  type Audio,
  AudioSchema,
  type Broll,
  CutSnapSchema,
  effectiveRanges,
  type MusicPlacement,
  type Project,
  type Range,
  SAMPLE_RATE,
  sec,
  survivingRanges,
} from "../src/edl.ts";
import {
  buildAudioParts,
  buildMusicFilterParts,
  buildSeamedVoiceParts,
  chooseAssetInput,
  chooseSourceInput,
  type ExportCompression,
  encoderArgsFor,
  exportCut,
  fpsFilterFor,
  graphicWindowDurationSamples,
  type MusicFilterGraph,
  parseExportFpsFlag,
  parseExportLoudnessFlag,
  planBrollForRanges,
  planGraphicWindow,
  planMusicWindows,
  resolveOutputFps,
  shouldUseSeamedVoice,
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

test("buildBrollOverlayFilters uses pip overlay coordinates when display is pip", () => {
  const parts = buildBrollOverlayFilters({
    display: "pip",
    inputIndex: 2,
    outW: 1920,
    outH: 1080,
    outStart: 1,
    outEnd: 4,
    srcInSec: 0,
    lastLabel: "v0",
  });
  assert.equal(parts.length, 2);
  assert.match(parts[0] ?? "", /pad=538:302/);
  assert.match(parts[1] ?? "", /overlay=W-w-38:H-h-38/);
});

test("buildBrollOverlayFilters keeps full-frame cover overlay by default", () => {
  const parts = buildBrollOverlayFilters({
    display: "cover",
    inputIndex: 2,
    outW: 1280,
    outH: 720,
    outStart: 0,
    outEnd: 2,
    srcInSec: 0,
    lastLabel: "vz",
  });
  assert.match(
    parts[0] ?? "",
    /scale=1280:720:force_original_aspect_ratio=increase/
  );
  assert.match(parts[1] ?? "", /overlay=eof_action=pass/);
  assert.doesNotMatch(parts[1] ?? "", /overlay=W-w-/);
});

test("buildAudioParts mixes b-roll audio with voice when audioMode is mix", () => {
  const expr = "between(t,0.000000,6.000000)";
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  const brollAudio = buildBrollAudioFilterGraph([
    {
      audioMode: "mix",
      inputIndex: 1,
      outEnd: 4,
      outStart: 1,
      srcInSec: 0,
    },
  ]);
  const parts = buildAudioParts(expr, zeroMusic, { brollAudio });
  assert.equal(parts[0], `[0:a]aselect='${expr}',asetpts=N/SR/TB[avoice]`);
  assert.match(parts[1] ?? "", /\[1:a\]aresample=/);
  assert.deepEqual(parts.slice(-1), [
    "[avoice][ba1]amix=inputs=2:duration=first:normalize=0[aout]",
  ]);
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
    captions: { enabled: true, maxWords: 6, style: "boxed" },
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

// ── D2: dead-air subtraction (effectiveRanges) shrinks the ffmpeg selectExpr ─
// exportCut computes ranges via effectiveRanges(project, silences) instead of
// survivingRanges(project); the seam between that call and the ffmpeg argv
// (selectExpr, b-roll/graphic planning) is pure, so exercise it directly
// rather than through a real ffmpeg export.

test("dead-air spans shrink the selectExpr window fed to ffmpeg", () => {
  const withoutDeadAir = noteGuardFixture(false);
  const withDeadAir: Project = {
    ...withoutDeadAir,
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [
        {
          id: "d1",
          startSample: Math.round(SAMPLE_RATE * 0.5),
          endSample: SAMPLE_RATE,
        },
      ],
    },
  };

  const selectExprFor = (project: Project) => {
    const ranges = effectiveRanges(project);
    return ranges
      .map((r) => `between(t,${sec(r.startSec)},${sec(r.endSec)})`)
      .join("+");
  };

  const before = selectExprFor(withoutDeadAir);
  const after = selectExprFor(withDeadAir);
  assert.notEqual(before, after);
  // The dead-air split adds one more between() clause to the expression.
  assert.equal(after.split("+").length, before.split("+").length + 1);
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

test("parseExportLoudnessFlag accepts -30..-10 and rejects the rest", () => {
  assert.equal(parseExportLoudnessFlag("-18"), -18);
  assert.equal(parseExportLoudnessFlag("-30"), -30);
  assert.equal(parseExportLoudnessFlag("-10"), -10);
  for (const raw of ["-5", "-31", "0", "not-a-number"]) {
    assert.throws(
      () => parseExportLoudnessFlag(raw),
      /--loudness must be a number between -30 and -10/,
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

// ── MILESTONE 4.2: export audio quality (seam declick, ducking, loudness) ───

const DEFAULT_AUDIO = AudioSchema.parse({});
const DISABLED_SNAP = CutSnapSchema.parse({});

test("buildSeamedVoiceParts: 3 ranges pin extensions, per-seam acrossfade d, and a clamped seam", () => {
  // seam0 gap (2.5-2=0.5s) comfortably fits the 300ms crossfade: full d=0.3,
  // ext=0.15 each side. seam1 gap (5.2-5=0.2s) is SHORTER than 300ms, so it
  // clamps: d shrinks to the whole gap (0.2s), ext=0.1 each side.
  const ranges: Range[] = [
    { startSec: 0, endSec: 2 },
    { startSec: 2.5, endSec: 5 },
    { startSec: 5.2, endSec: 8 },
  ];
  const result = buildSeamedVoiceParts(ranges, { crossfadeMs: 300 });
  assert.deepEqual(result.filterParts, [
    "[0:a]atrim=start=0.000000:end=2.150000,asetpts=PTS-STARTPTS[av0]",
    "[0:a]atrim=start=2.350000:end=5.100000,asetpts=PTS-STARTPTS[av1]",
    "[0:a]atrim=start=5.100000:end=8.000000,asetpts=PTS-STARTPTS[av2]",
    "[av0][av1]acrossfade=d=0.300000:c1=qsin:c2=qsin[avseam0]",
    "[avseam0][av2]acrossfade=d=0.200000:c1=qsin:c2=qsin[avseam1]",
  ]);
  assert.equal(result.outLabel, "avseam1");
  // Duration invariant: extension + acrossfade d cancel out exactly, so the
  // chained output equals the plain kept duration (2 + 2.5 + 2.8 = 7.3s).
  const kept = ranges.reduce((a, r) => a + (r.endSec - r.startSec), 0);
  assert.equal(kept, 7.3);
});

test("buildSeamedVoiceParts: prepends highpass to every segment when requested", () => {
  const ranges: Range[] = [
    { startSec: 0, endSec: 2 },
    { startSec: 2.5, endSec: 5 },
  ];
  const result = buildSeamedVoiceParts(ranges, {
    crossfadeMs: 100,
    highpassHz: 100,
  });
  assert.equal(
    result.filterParts[0],
    "[0:a]highpass=f=100,atrim=start=0.000000:end=2.050000,asetpts=PTS-STARTPTS[av0]"
  );
  assert.equal(
    result.filterParts[1],
    "[0:a]highpass=f=100,atrim=start=2.450000:end=5.000000,asetpts=PTS-STARTPTS[av1]"
  );
});

test("buildSeamedVoiceParts: zero-gap seam falls back to a duration-preserving butt join", () => {
  const ranges: Range[] = [
    { startSec: 0, endSec: 2 },
    { startSec: 2, endSec: 4 },
  ];
  const result = buildSeamedVoiceParts(ranges, { crossfadeMs: 300 });
  assert.deepEqual(result.filterParts, [
    "[0:a]atrim=start=0.000000:end=2.000000,asetpts=PTS-STARTPTS[av0]",
    "[0:a]atrim=start=2.000000:end=4.000000,asetpts=PTS-STARTPTS[av1]",
    "[av0]afade=t=out:st=1.992000:d=0.008000:curve=qsin[av0fo]",
    "[av1]afade=t=in:st=0.000000:d=0.008000:curve=qsin[av1fi]",
    "[av0fo][av1fi]concat=n=2:v=0:a=1[avseam0]",
  ]);
  assert.equal(result.outLabel, "avseam0");
  // No material was borrowed (afade reshapes existing samples only), so
  // duration is exactly the plain kept duration (2 + 2 = 4s).
});

// R3 (ffmpeg-verified): acrossfade with an input shorter than d produces
// EMPTY or truncated audio, so d must clamp to the adjacent range lengths,
// not just the gap - snapRanges can shrink an edge range below crossfadeMs/2.
test("buildSeamedVoiceParts: a 30ms first range clamps d to the range length, never past it", () => {
  const ranges: Range[] = [
    { startSec: 0, endSec: 0.03 },
    { startSec: 1, endSec: 3 },
  ];
  const result = buildSeamedVoiceParts(ranges, { crossfadeMs: 100 });
  // d = min(0.1, gap 0.97, leftLen 0.03, rightLen 2.0) = 0.03; ext = 0.015.
  assert.deepEqual(result.filterParts, [
    "[0:a]atrim=start=0.000000:end=0.045000,asetpts=PTS-STARTPTS[av0]",
    "[0:a]atrim=start=0.985000:end=3.000000,asetpts=PTS-STARTPTS[av1]",
    "[av0][av1]acrossfade=d=0.030000:c1=qsin:c2=qsin[avseam0]",
  ]);
  // The crossfade never exceeds either input: segment 0 is 45ms >= d 30ms.
  assert.equal(result.outLabel, "avseam0");
});

test("buildSeamedVoiceParts: a clamped d under 4ms falls back to the duration-preserving butt join", () => {
  const ranges: Range[] = [
    { startSec: 0, endSec: 0.003 },
    { startSec: 1, endSec: 3 },
  ];
  const result = buildSeamedVoiceParts(ranges, { crossfadeMs: 100 });
  // d would clamp to leftLen 3ms < the 4ms floor: butt join, no borrowing.
  assert.deepEqual(result.filterParts, [
    "[0:a]atrim=start=0.000000:end=0.003000,asetpts=PTS-STARTPTS[av0]",
    "[0:a]atrim=start=1.000000:end=3.000000,asetpts=PTS-STARTPTS[av1]",
    "[av0]afade=t=out:st=0.000000:d=0.003000:curve=qsin[av0fo]",
    "[av1]afade=t=in:st=0.000000:d=0.008000:curve=qsin[av1fi]",
    "[av0fo][av1fi]concat=n=2:v=0:a=1[avseam0]",
  ]);
});

test("buildSeamedVoiceParts: a short MIDDLE range clamps both of its seams", () => {
  const ranges: Range[] = [
    { startSec: 0, endSec: 2 },
    { startSec: 3, endSec: 3.03 },
    { startSec: 4, endSec: 6 },
  ];
  const result = buildSeamedVoiceParts(ranges, { crossfadeMs: 100 });
  const crossfades = result.filterParts.filter((p) => p.includes("acrossfade"));
  // Both seams touch the 30ms middle range: each d clamps to 0.03.
  assert.deepEqual(crossfades, [
    "[av0][av1]acrossfade=d=0.030000:c1=qsin:c2=qsin[avseam0]",
    "[avseam0][av2]acrossfade=d=0.030000:c1=qsin:c2=qsin[avseam1]",
  ]);
});

test("buildSeamedVoiceParts: single range is a no-op passthrough segment (buildAudioParts never calls this case)", () => {
  const ranges: Range[] = [{ startSec: 0, endSec: 3 }];
  const result = buildSeamedVoiceParts(ranges, { crossfadeMs: 300 });
  assert.deepEqual(result.filterParts, [
    "[0:a]atrim=start=0.000000:end=3.000000,asetpts=PTS-STARTPTS[av0]",
  ]);
  assert.equal(result.outLabel, "av0");
});

test("shouldUseSeamedVoice requires snap enabled, a positive crossfade, and more than one range", () => {
  const ranges2: Range[] = [
    { startSec: 0, endSec: 2 },
    { startSec: 3, endSec: 5 },
  ];
  const ranges1: Range[] = [{ startSec: 0, endSec: 2 }];
  const enabledSnap = CutSnapSchema.parse({ enabled: true, crossfadeMs: 24 });
  assert.equal(shouldUseSeamedVoice(ranges2, enabledSnap), true);
  assert.equal(shouldUseSeamedVoice(ranges1, enabledSnap), false);
  assert.equal(shouldUseSeamedVoice(ranges2, DISABLED_SNAP), false);
  assert.equal(
    shouldUseSeamedVoice(ranges2, { ...enabledSnap, crossfadeMs: 0 }),
    false
  );
  assert.equal(shouldUseSeamedVoice(ranges2, undefined), false);
});

test("buildAudioParts wires the seam-declick voice path in when cuts.snap is enabled", () => {
  const ranges: Range[] = [
    { startSec: 0, endSec: 2 },
    { startSec: 2.6, endSec: 5 },
  ];
  const expr = "between(t,0.000000,2.000000)+between(t,2.600000,5.000000)";
  const graph: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  const parts = buildAudioParts(expr, graph, {
    ranges,
    snap: CutSnapSchema.parse({ enabled: true, crossfadeMs: 100 }),
    audio: DEFAULT_AUDIO,
  });
  assert.deepEqual(parts, [
    "[0:a]atrim=start=0.000000:end=2.050000,asetpts=PTS-STARTPTS[av0]",
    "[0:a]atrim=start=2.550000:end=5.000000,asetpts=PTS-STARTPTS[av1]",
    "[av0][av1]acrossfade=d=0.100000:c1=qsin:c2=qsin[avseam0]",
    "[avseam0]anull[aout]",
  ]);
});

test("buildAudioParts: zero-config byte-parity with the explicit disabled opts object (snap off, audio off)", () => {
  const expr = "between(t,0.000000,6.000000)";
  const ranges: Range[] = [{ startSec: 0, endSec: 6 }];
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  assert.deepEqual(
    buildAudioParts(expr, zeroMusic, {
      ranges,
      snap: DISABLED_SNAP,
      audio: DEFAULT_AUDIO,
    }),
    [`[0:a]aselect='${expr}',asetpts=N/SR/TB[aout]`]
  );

  const windows = planMusicWindows({
    music: [musicPlacement(), musicPlacement({ id: "m2" })],
    assets: [MUSIC_ASSET],
    ranges: [{ startSec: 0, endSec: 6 }],
    sampleRate: SAMPLE_RATE,
  });
  const withMusic = buildMusicFilterParts(
    windows.map((w) => ({ ...w, srcPath: "/tmp/bed.mp3" })),
    { firstInputIndex: 1 }
  );
  assert.deepEqual(
    buildAudioParts(expr, withMusic, {
      ranges,
      snap: DISABLED_SNAP,
      audio: DEFAULT_AUDIO,
    }),
    [
      `[0:a]aselect='${expr}',asetpts=N/SR/TB[avoice]`,
      ...withMusic.filterParts,
      "[avoice][m0][m1]amix=inputs=3:duration=first:normalize=0[aout]",
    ]
  );
});

test("buildAudioParts: ducking pins the sidechaincompress chain (mix beds, split, sidechain, remix)", () => {
  const expr = "between(t,0.000000,6.000000)";
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
  const audio: Audio = {
    ...DEFAULT_AUDIO,
    ducking: { enabled: true, amountDb: 12, attackMs: 25, releaseMs: 250 },
  };
  const parts = buildAudioParts(expr, graph, { audio });
  assert.deepEqual(parts.slice(-4), [
    "[m0][m1]amix=inputs=2:duration=first:normalize=0[mmix]",
    "[avoice]asplit=2[avmain][avsc]",
    "[mmix][avsc]sidechaincompress=threshold=0.02:ratio=8:attack=25:release=250:makeup=1[mduck]",
    "[avmain][mduck]amix=inputs=2:duration=first:normalize=0[aout]",
  ]);
  assert.equal(parts[0], `[0:a]aselect='${expr}',asetpts=N/SR/TB[avoice]`);
});

test("buildAudioParts: ducking with a single music bed skips the mmix pre-mix (direct passthrough)", () => {
  const expr = "between(t,0.000000,6.000000)";
  const [win] = planMusicWindows({
    music: [musicPlacement()],
    assets: [MUSIC_ASSET],
    ranges: [{ startSec: 0, endSec: 6 }],
    sampleRate: SAMPLE_RATE,
  });
  const graph = buildMusicFilterParts([{ ...win, srcPath: "/tmp/bed.mp3" }], {
    firstInputIndex: 1,
  });
  const audio: Audio = {
    ...DEFAULT_AUDIO,
    ducking: { enabled: true, amountDb: 12, attackMs: 25, releaseMs: 250 },
  };
  const parts = buildAudioParts(expr, graph, { audio });
  assert.deepEqual(parts.slice(-3), [
    "[avoice]asplit=2[avmain][avsc]",
    "[m0][avsc]sidechaincompress=threshold=0.02:ratio=8:attack=25:release=250:makeup=1[mduck]",
    "[avmain][mduck]amix=inputs=2:duration=first:normalize=0[aout]",
  ]);
});

test("buildAudioParts: ducking ratio mapping pins light/medium/heavy amountDb bands", () => {
  const expr = "between(t,0.000000,6.000000)";
  const [win] = planMusicWindows({
    music: [musicPlacement()],
    assets: [MUSIC_ASSET],
    ranges: [{ startSec: 0, endSec: 6 }],
    sampleRate: SAMPLE_RATE,
  });
  const graph = buildMusicFilterParts([{ ...win, srcPath: "/tmp/bed.mp3" }], {
    firstInputIndex: 1,
  });
  const ratioFor = (amountDb: number) => {
    const audio: Audio = {
      ...DEFAULT_AUDIO,
      ducking: { enabled: true, amountDb, attackMs: 25, releaseMs: 250 },
    };
    const parts = buildAudioParts(expr, graph, { audio });
    const line = parts.find((p) => p.includes("sidechaincompress")) as string;
    return line.match(/ratio=(\d+)/)?.[1];
  };
  assert.equal(ratioFor(6), "4");
  assert.equal(ratioFor(12), "8");
  assert.equal(ratioFor(30), "20");
});

test("buildAudioParts: ducking disabled (or no music) leaves the amix path byte-identical", () => {
  const expr = "between(t,0.000000,6.000000)";
  const [win] = planMusicWindows({
    music: [musicPlacement()],
    assets: [MUSIC_ASSET],
    ranges: [{ startSec: 0, endSec: 6 }],
    sampleRate: SAMPLE_RATE,
  });
  const graph = buildMusicFilterParts([{ ...win, srcPath: "/tmp/bed.mp3" }], {
    firstInputIndex: 1,
  });
  // ducking.enabled true but zero music: never engages (the amix path with
  // one bed is used, not sidechaincompress).
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  const audio: Audio = {
    ...DEFAULT_AUDIO,
    ducking: { enabled: true, amountDb: 12, attackMs: 25, releaseMs: 250 },
  };
  assert.deepEqual(buildAudioParts(expr, zeroMusic, { audio }), [
    `[0:a]aselect='${expr}',asetpts=N/SR/TB[aout]`,
  ]);
  // music present but ducking disabled: plain amix, no sidechaincompress.
  const parts = buildAudioParts(expr, graph, { audio: DEFAULT_AUDIO });
  assert.ok(!parts.some((p) => p.includes("sidechaincompress")));
  assert.equal(
    parts.at(-1),
    "[avoice][m0]amix=inputs=2:duration=first:normalize=0[aout]"
  );
});

test("buildAudioParts: loudnorm is appended as the final stage before [aout] (voice only, no music)", () => {
  const expr = "between(t,0.000000,6.000000)";
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  const audio: Audio = {
    ...DEFAULT_AUDIO,
    loudness: { enabled: true, targetLufs: -14 },
  };
  const parts = buildAudioParts(expr, zeroMusic, { audio });
  // R2: aformat=sample_rates=48000 pinned after loudnorm (loudnorm outputs
  // 192k internally; aac would clamp that to 96k without it).
  assert.deepEqual(parts, [
    `[0:a]aselect='${expr}',asetpts=N/SR/TB[avoice]`,
    "[avoice]loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_rates=48000[aout]",
  ]);
});

test("buildAudioParts: loudnorm chains after the plain music amix", () => {
  const expr = "between(t,0.000000,6.000000)";
  const [win] = planMusicWindows({
    music: [musicPlacement()],
    assets: [MUSIC_ASSET],
    ranges: [{ startSec: 0, endSec: 6 }],
    sampleRate: SAMPLE_RATE,
  });
  const graph = buildMusicFilterParts([{ ...win, srcPath: "/tmp/bed.mp3" }], {
    firstInputIndex: 1,
  });
  const audio: Audio = {
    ...DEFAULT_AUDIO,
    loudness: { enabled: true, targetLufs: -16 },
  };
  const parts = buildAudioParts(expr, graph, { audio });
  assert.deepEqual(parts.slice(-2), [
    "[avoice][m0]amix=inputs=2:duration=first:normalize=0[apreln]",
    "[apreln]loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000[aout]",
  ]);
});

test("buildAudioParts: loudness disabled leaves every path byte-identical", () => {
  const expr = "between(t,0.000000,6.000000)";
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  assert.deepEqual(buildAudioParts(expr, zeroMusic, { audio: DEFAULT_AUDIO }), [
    `[0:a]aselect='${expr}',asetpts=N/SR/TB[aout]`,
  ]);
});

// F7: voiceHighpass previously only reached the seam-declick path
// (cuts.snap enabled); the plain aselect voice path silently ignored it.
test("buildAudioParts: voiceHighpass reaches the plain aselect voice path (snap off)", () => {
  const expr = "between(t,0.000000,6.000000)";
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  const audio: Audio = {
    ...DEFAULT_AUDIO,
    voiceHighpass: { enabled: true, hz: 90 },
  };
  assert.deepEqual(buildAudioParts(expr, zeroMusic, { audio }), [
    `[0:a]aselect='${expr}',asetpts=N/SR/TB,highpass=f=90[aout]`,
  ]);
});

test("buildAudioParts: voiceHighpass disabled leaves the plain aselect path byte-identical", () => {
  const expr = "between(t,0.000000,6.000000)";
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  assert.deepEqual(buildAudioParts(expr, zeroMusic, { audio: DEFAULT_AUDIO }), [
    `[0:a]aselect='${expr}',asetpts=N/SR/TB[aout]`,
  ]);
});

// ── Export platform presets: per-invocation loudnessTargetLufs override ────
// (project.audio.loudness is never mutated; the override only shapes THIS
// export's filtergraph). Matrix: project loudness {off, on} x override
// {unset, set}. off/unset and on/unset are already pinned above by the
// existing loudness tests; these two cover the override-set column.

test("buildAudioParts: loudnessTargetLufs override applies loudnorm even when project loudness is disabled", () => {
  const expr = "between(t,0.000000,6.000000)";
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  const parts = buildAudioParts(expr, zeroMusic, {
    audio: DEFAULT_AUDIO,
    loudnessTargetLufs: -14,
  });
  assert.deepEqual(parts, [
    `[0:a]aselect='${expr}',asetpts=N/SR/TB[avoice]`,
    "[avoice]loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_rates=48000[aout]",
  ]);
});

test("buildAudioParts: loudnessTargetLufs override replaces the project's own target when project loudness is enabled", () => {
  const expr = "between(t,0.000000,6.000000)";
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  const audio: Audio = {
    ...DEFAULT_AUDIO,
    loudness: { enabled: true, targetLufs: -16 },
  };
  const parts = buildAudioParts(expr, zeroMusic, {
    audio,
    loudnessTargetLufs: -20,
  });
  assert.deepEqual(parts, [
    `[0:a]aselect='${expr}',asetpts=N/SR/TB[avoice]`,
    "[avoice]loudnorm=I=-20:TP=-1.5:LRA=11,aformat=sample_rates=48000[aout]",
  ]);
});

test("buildAudioParts: no loudnessTargetLufs override and project loudness disabled stays byte-identical", () => {
  const expr = "between(t,0.000000,6.000000)";
  const zeroMusic: MusicFilterGraph = {
    filterParts: [],
    inputArgs: [],
    mixInputLabels: [],
  };
  assert.deepEqual(buildAudioParts(expr, zeroMusic, { audio: DEFAULT_AUDIO }), [
    `[0:a]aselect='${expr}',asetpts=N/SR/TB[aout]`,
  ]);
});

// T2: seams (ranges > 1 + snap crossfade) + ducking + loudness in a single
// call - the seam voice path's outLabel must feed asplit/sidechaincompress
// and, downstream of that, loudnorm, exactly like the plain aselect voice
// path already does in the dedicated ducking/loudnorm tests above.
test("buildAudioParts: seams + ducking + loudness combine in one call (seam feeds asplit/sidechain then loudnorm)", () => {
  const ranges: Range[] = [
    { startSec: 0, endSec: 2 },
    { startSec: 2.6, endSec: 5 },
  ];
  const expr = "between(t,0.000000,2.000000)+between(t,2.600000,5.000000)";
  const [win] = planMusicWindows({
    music: [musicPlacement()],
    assets: [MUSIC_ASSET],
    ranges,
    sampleRate: SAMPLE_RATE,
  });
  const graph = buildMusicFilterParts([{ ...win, srcPath: "/tmp/bed.mp3" }], {
    firstInputIndex: 1,
  });
  const audio: Audio = {
    ...DEFAULT_AUDIO,
    ducking: { enabled: true, amountDb: 12, attackMs: 25, releaseMs: 250 },
    loudness: { enabled: true, targetLufs: -14 },
  };
  const parts = buildAudioParts(expr, graph, {
    ranges,
    snap: CutSnapSchema.parse({ enabled: true, crossfadeMs: 100 }),
    audio,
  });
  // Seam-declick voice path writes to [avoice] (not [aout]): both ducking
  // and loudness still have stages to run downstream of it.
  assert.deepEqual(parts.slice(0, 4), [
    "[0:a]atrim=start=0.000000:end=2.050000,asetpts=PTS-STARTPTS[av0]",
    "[0:a]atrim=start=2.550000:end=5.000000,asetpts=PTS-STARTPTS[av1]",
    "[av0][av1]acrossfade=d=0.100000:c1=qsin:c2=qsin[avseam0]",
    "[avseam0]anull[avoice]",
  ]);
  assert.deepEqual(parts.slice(-4), [
    "[avoice]asplit=2[avmain][avsc]",
    "[m0][avsc]sidechaincompress=threshold=0.02:ratio=8:attack=25:release=250:makeup=1[mduck]",
    "[avmain][mduck]amix=inputs=2:duration=first:normalize=0[apreln]",
    "[apreln]loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_rates=48000[aout]",
  ]);
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
        captions: { enabled: false, maxWords: 6, style: "boxed" },
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
    // Fixture project has no snap enabled: export truth says so too.
    assert.equal(low.audio.snapped, false);
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
        captions: { enabled: false, maxWords: 6, style: "boxed" },
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

// T1: exportCut's audio.snapped path (F10's fixed gate: snap enabled AND a
// silences array that actually loaded AND is non-empty).
test("exportCut: audio.snapped is true when snap is enabled and a matching analysis cache exists (smoke)", {
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
        "color=c=blue:s=320x240:r=30:d=2",
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
      "ffmpeg(snapped-flag-smoke-source)"
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
        captions: { enabled: false, maxWords: 6, style: "boxed" },
        cuts: {
          snap: {
            enabled: true,
            mode: "vad",
            maxShiftMs: 120,
            crossfadeMs: 24,
          },
        },
        words: [
          {
            id: "w0",
            text: "hello",
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
    // audioRaw only needs to EXIST (loadAudioAnalysis gates on existsSync);
    // its bytes are never read once the cache below hits on a matching mtime.
    mkdirSync(p.working, { recursive: true });
    writeFileSync(p.audioRaw, Buffer.alloc(16));
    const sourceMtimeMs = statSync(p.audioRaw).mtimeMs;
    writeFileSync(
      join(p.working, "audio-analysis.json"),
      JSON.stringify({
        version: 1,
        sampleRate: 16_000,
        windowMs: 20,
        thresholdDb: -38,
        minSilenceMs: 300,
        sourceMtimeMs,
        silences: [{ startSec: 0.97, endSec: 1.03 }],
      })
    );

    const result = await exportCut(slug);
    assert.deepEqual(result.audio, {
      seams: false,
      ducking: false,
      loudness: false,
      snapped: true,
    });
  });
});

test("exportCut: audio.snapped is false when snap is enabled but analysis is unavailable (fallback still exports) (smoke)", {
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
        "color=c=red:s=320x240:r=30:d=2",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:duration=2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        src,
      ],
      "ffmpeg(snapped-fallback-smoke-source)"
    );
    // No working/audio16k.f32 written at all: loadAudioAnalysis throws, the
    // exportCut catch() falls back to `silences: undefined` instead of
    // failing the export.
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        source: src,
        fps: 30,
        width: 320,
        height: 240,
        durationSamples: 2 * SAMPLE_RATE,
        captions: { enabled: false, maxWords: 6, style: "boxed" },
        cuts: {
          snap: {
            enabled: true,
            mode: "vad",
            maxShiftMs: 120,
            crossfadeMs: 24,
          },
        },
        words: [
          {
            id: "w0",
            text: "hello",
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

    const result = await exportCut(slug);
    assert.equal(result.audio.snapped, false);
    assert.ok(existsSync(p.out), "out.mp4 missing");
  });
});

// ── MILESTONE 4.2: export audio quality smokes (skip-gated, real ffmpeg) ────

async function probeOut(outPath: string): Promise<{
  audioSampleRate: string | undefined;
  audioStreamCount: number;
  durationSec: number;
}> {
  const proc = Bun.spawn(
    [
      FFPROBE,
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      outPath,
    ],
    { stdout: "pipe", stderr: "pipe" }
  );
  const probed = JSON.parse(await new Response(proc.stdout).text()) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; sample_rate?: string }>;
  };
  await proc.exited;
  const audioStreams = (probed.streams ?? []).filter(
    (s) => s.codec_type === "audio"
  );
  return {
    durationSec: Number(probed.format?.duration ?? 0),
    audioStreamCount: audioStreams.length,
    audioSampleRate: audioStreams[0]?.sample_rate,
  };
}

test("exportCut: seam crossfade preserves duration within 20ms of the plain aselect duration (smoke)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    // 4s tone: two 1s kept words separated by a deleted 2s middle word, so
    // survivingRanges collapses to 2 ranges ([0,1] and [2,4], a 1s deleted
    // gap comfortably larger than a 40ms crossfade) -> 3s expected kept.
    await run(
      FFMPEG,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=320x240:r=30:d=4",
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
      "ffmpeg(seam-smoke-source)"
    );
    const words = [
      { id: "w0", startSample: 0, endSample: SAMPLE_RATE, deleted: false },
      {
        id: "w1",
        startSample: SAMPLE_RATE,
        endSample: 2 * SAMPLE_RATE,
        deleted: true,
      },
      {
        id: "w2",
        startSample: 2 * SAMPLE_RATE,
        endSample: 3 * SAMPLE_RATE,
        deleted: false,
      },
      {
        id: "w3",
        startSample: 3 * SAMPLE_RATE,
        endSample: 4 * SAMPLE_RATE,
        deleted: false,
      },
    ].map((w) => ({ ...w, text: w.id }));
    const baseProject = makeProject({
      slug,
      source: src,
      fps: 30,
      width: 320,
      height: 240,
      durationSamples: 4 * SAMPLE_RATE,
      padMs: 0,
      captions: { enabled: false, maxWords: 6, style: "boxed" },
      words,
    });

    writeFixtureProject(slug, {
      ...baseProject,
      cuts: {
        snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      },
    });
    const plain = await exportCut(slug);
    assert.equal(plain.audio.seams, false);
    const plainDuration = (await probeOut(p.out)).durationSec;

    writeFixtureProject(slug, {
      ...baseProject,
      cuts: {
        snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 40 },
      },
    });
    const seamed = await exportCut(slug);
    assert.equal(seamed.audio.seams, true);
    const seamedDuration = (await probeOut(p.out)).durationSec;

    assert.ok(
      Math.abs(plainDuration - 3) < 0.35,
      `expected ~3s plain kept duration, got ${plainDuration}s`
    );
    assert.ok(
      Math.abs(seamedDuration - plainDuration) < 0.02,
      `seamed (${seamedDuration}s) should be within 20ms of plain (${plainDuration}s)`
    );
  });
});

// R3 (ffmpeg-verified): before the segment-length clamp, a 30ms range with a
// 100ms crossfade fed acrossfade an input SHORTER than d, which exits 0 but
// produces empty/truncated audio (silent voice track or A/V desync).
test("exportCut: seam crossfade survives a 30ms range (d clamps; duration and audio intact) (smoke)", {
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
        "color=c=teal:s=320x240:r=30:d=4",
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
      "ffmpeg(short-range-seam-smoke-source)"
    );
    // 3 surviving ranges with padMs 0: [0, 0.03], [1, 2], [3, 4]; the first
    // is 30ms, well under crossfadeMs 100's half-extension. Expected kept
    // duration: 2.03s.
    const words = [
      {
        id: "w0",
        startSample: 0,
        endSample: Math.round(0.03 * SAMPLE_RATE),
        deleted: false,
      },
      {
        id: "w1",
        startSample: Math.round(0.03 * SAMPLE_RATE),
        endSample: SAMPLE_RATE,
        deleted: true,
      },
      {
        id: "w2",
        startSample: SAMPLE_RATE,
        endSample: 2 * SAMPLE_RATE,
        deleted: false,
      },
      {
        id: "w3",
        startSample: 2 * SAMPLE_RATE,
        endSample: 3 * SAMPLE_RATE,
        deleted: true,
      },
      {
        id: "w4",
        startSample: 3 * SAMPLE_RATE,
        endSample: 4 * SAMPLE_RATE,
        deleted: false,
      },
    ].map((w) => ({ ...w, text: w.id }));
    const baseProject = makeProject({
      slug,
      source: src,
      fps: 30,
      width: 320,
      height: 240,
      durationSamples: 4 * SAMPLE_RATE,
      padMs: 0,
      captions: { enabled: false, maxWords: 6, style: "boxed" },
      words,
    });

    writeFixtureProject(slug, {
      ...baseProject,
      cuts: {
        snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      },
    });
    await exportCut(slug);
    const plain = await probeOut(p.out);

    writeFixtureProject(slug, {
      ...baseProject,
      cuts: {
        snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 100 },
      },
    });
    const seamed = await exportCut(slug);
    assert.equal(seamed.audio.seams, true);
    const probed = await probeOut(p.out);

    assert.ok(
      Math.abs(plain.durationSec - 2.03) < 0.35,
      `expected ~2.03s plain kept duration, got ${plain.durationSec}s`
    );
    assert.ok(
      Math.abs(probed.durationSec - plain.durationSec) < 0.02,
      `seamed (${probed.durationSec}s) should be within 20ms of plain (${plain.durationSec}s)`
    );
    // Non-empty audio: one stream, with a real duration (the pre-fix failure
    // mode was an empty/truncated voice track out of acrossfade).
    assert.equal(probed.audioStreamCount, 1);
    assert.ok(
      probed.durationSec > 1.5,
      `expected a non-empty audio/video output, got ${probed.durationSec}s`
    );
  });
});

test("exportCut: ducking on succeeds and reaches the encoder with a music bed present (smoke)", {
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
        "color=c=green:s=320x240:r=30:d=4",
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
      "ffmpeg(ducking-smoke-source)"
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
        "sine=frequency=220:duration=4",
        "-c:a",
        "aac",
        "-ar",
        String(SAMPLE_RATE),
        "-ac",
        "2",
        bed,
      ],
      "ffmpeg(ducking-smoke-bed)"
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
        captions: { enabled: false, maxWords: 6, style: "boxed" },
        assets: [
          {
            id: "bed",
            kind: "music",
            name: "bed.aac",
            src: bed,
            proxy: "assets/bed.aac",
            durationSamples: 4 * SAMPLE_RATE,
          },
        ],
        music: [
          {
            id: "m1",
            assetId: "bed",
            startSample: 0,
            endSample: 4 * SAMPLE_RATE,
            srcInSample: 0,
            gain: 0.5,
            fadeInSec: 0,
            fadeOutSec: 0,
            mode: "trim",
          },
        ],
        audio: {
          ducking: {
            enabled: true,
            amountDb: 12,
            attackMs: 25,
            releaseMs: 250,
          },
          loudness: { enabled: false, targetLufs: -16 },
          voiceHighpass: { enabled: false, hz: 80 },
        },
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
    assert.equal(result.audio.ducking, true);
    assert.ok(existsSync(p.out), "out.mp4 missing");
    const probed = await probeOut(p.out);
    assert.equal(probed.audioStreamCount, 1);
    assert.ok(
      Math.abs(probed.durationSec - 4) < 0.35,
      `expected ~4s of ducked audio+video, got ${probed.durationSec}s`
    );
  });
});

test("exportCut: loudness normalization on succeeds with one audio stream (smoke)", {
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
        "color=c=red:s=320x240:r=30:d=2",
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
      "ffmpeg(loudness-smoke-source)"
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
        captions: { enabled: false, maxWords: 6, style: "boxed" },
        audio: {
          ducking: {
            enabled: false,
            amountDb: 12,
            attackMs: 25,
            releaseMs: 250,
          },
          loudness: { enabled: true, targetLufs: -16 },
          voiceHighpass: { enabled: false, hz: 80 },
        },
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

    const result = await exportCut(slug);
    assert.equal(result.audio.loudness, true);
    assert.ok(existsSync(p.out), "out.mp4 missing");
    const probed = await probeOut(p.out);
    assert.equal(probed.audioStreamCount, 1);
    // R2: without the rate constraint after loudnorm, loudnorm's internal
    // 192kHz output gets clamped by aac to 96kHz; the export must stay 48k.
    assert.equal(probed.audioSampleRate, "48000");
  });
});

// ── Export platform presets: one resolution point at the top of exportCut ──

function platformSmokeProject(slug: string, src: string) {
  return makeProject({
    slug,
    source: src,
    fps: 30,
    width: 320,
    height: 240,
    durationSamples: 2 * SAMPLE_RATE,
    captions: { enabled: false, maxWords: 6, style: "boxed" },
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
  });
}

async function makePlatformSmokeSource(src: string) {
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
    "ffmpeg(platform-smoke-clip)"
  );
}

test("exportCut resolves a platform preset (x: web/30fps/1080) and reports it in the summary (smoke)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    await makePlatformSmokeSource(src);
    writeFixtureProject(slug, platformSmokeProject(slug, src));

    const result = await exportCut(slug, { platform: "x" });
    assert.equal(result.platform, "x");
    assert.equal(result.compression, "web");
    assert.equal(result.fps, 30);
    assert.equal(result.height, 240); // source is already below the 1080 ceiling
    assert.equal(result.loudnessTargetLufs, -14);
    assert.equal(result.audio.loudness, true);
    assert.equal((await probe(p.out)).fps, 30);
  });
});

test("exportCut: an explicit option wins over the platform default for that one field only", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    await makePlatformSmokeSource(src);
    writeFixtureProject(slug, platformSmokeProject(slug, src));

    // youtube pins compression=social, fps=source, targetLufs=-14; only fps
    // is overridden explicitly here, so compression/loudness still come from
    // the platform.
    const result = await exportCut(slug, { platform: "youtube", fps: 24 });
    assert.equal(result.platform, "youtube");
    assert.equal(result.fps, 24);
    assert.equal(result.compression, "social");
    assert.equal(result.loudnessTargetLufs, -14);
    assert.equal((await probe(p.out)).fps, 24);
  });
});

test("exportCut: explicit loudnessTargetLufs works with no platform selected (smoke)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    await makePlatformSmokeSource(src);
    writeFixtureProject(slug, platformSmokeProject(slug, src));

    const result = await exportCut(slug, { loudnessTargetLufs: -18 });
    assert.equal(result.platform, undefined);
    assert.equal(result.loudnessTargetLufs, -18);
    assert.equal(result.audio.loudness, true);
    const probed = await probeOut(p.out);
    assert.equal(probed.audioSampleRate, "48000");
  });
});

test("exportCut: no platform and no loudnessTargetLufs leaves the summary exactly as before (smoke)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    await makePlatformSmokeSource(src);
    writeFixtureProject(slug, platformSmokeProject(slug, src));

    const result = await exportCut(slug, {});
    assert.equal(result.platform, undefined);
    assert.equal(result.loudnessTargetLufs, undefined);
    assert.equal(result.audio.loudness, false);
  });
});

// ── CLI: --platform flag (product-announcement.test.tsx runCli pattern) ────

const CLI = join(import.meta.dir, "../src/cli.ts");

async function runCli(args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: stdout + stderr };
}

test("CLI export --platform bogus errors and lists the known platform ids", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["export", slug, "--platform", "bogus"]);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /youtube, youtube-4k, x, linkedin/);
  });
});

test("CLI export --platform youtube reaches the encoder and is reflected in the printed summary (smoke)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    await makePlatformSmokeSource(src);
    writeFixtureProject(slug, platformSmokeProject(slug, src));

    const result = await runCli(["export", slug, "--platform", "youtube"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /platform youtube/);
    assert.match(result.out, /social/);
  });
});

test("CLI export --platform youtube --loudness -18 reports -18 LUFS, winning over the youtube preset's -14 default (smoke)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    await makePlatformSmokeSource(src);
    writeFixtureProject(slug, platformSmokeProject(slug, src));

    const result = await runCli([
      "export",
      slug,
      "--platform",
      "youtube",
      "--loudness",
      "-18",
    ]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /platform youtube/);
    assert.match(result.out, /-18 LUFS/);
    assert.doesNotMatch(result.out, /-14 LUFS/);
  });
});

test("CLI export --loudness -5 (out of -30..-10 range) errors and states the valid range", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["export", slug, "--loudness", "-5"]);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /--loudness must be a number between -30 and -10/);
  });
});

test("CLI export --platform with no following value errors and lists the known platform ids", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["export", slug, "--platform"]);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /youtube, youtube-4k, x, linkedin/);
  });
});

test("CLI export --loudness with no following value errors", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["export", slug, "--loudness"]);
    assert.notEqual(result.code, 0);
  });
});
