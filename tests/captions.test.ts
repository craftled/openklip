import assert from "node:assert/strict";
import { test } from "node:test";
import { captionStyle } from "../src/caption-styles.ts";
import {
  buildAss,
  type CaptionGroup,
  captionPlacementForGroup,
  captionPlacementForSpan,
  keptWordsInOutputTime,
} from "../src/captions.ts";

const GROUPS: CaptionGroup[] = [
  {
    startSec: 0,
    endSec: 1,
    words: [{ text: "Hello", startSec: 0, endSec: 1 }],
  },
];

test("buildAss uses the normal lower caption margin by default", () => {
  const ass = buildAss(GROUPS, { width: 1920, height: 1080 });

  assert.match(ass, /Style: Cap,Arial,\d+,.+,76,1/);
});

test("buildAss can raise captions to avoid lower-title collisions", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    placement: "raised",
  });

  assert.match(ass, /Style: Cap,Arial,\d+,.+,259,1/);
});

test("buildAss carries rounded centiseconds into the next second", () => {
  const ass = buildAss(
    [
      {
        startSec: 1.999,
        endSec: 59.999,
        words: [{ text: "Carry", startSec: 1.999, endSec: 59.999 }],
      },
    ],
    { width: 1920, height: 1080 }
  );

  assert.match(ass, /Dialogue: 0,0:00:02\.00,0:01:00\.00,Cap/);
});

test("buildAss can choose bottom or raised caption placement per group", () => {
  const ass = buildAss(
    [
      {
        startSec: 0,
        endSec: 1,
        words: [{ text: "Bottom", startSec: 0, endSec: 1 }],
      },
      {
        startSec: 5,
        endSec: 6,
        words: [{ text: "Raised", startSec: 5, endSec: 6 }],
      },
    ],
    {
      width: 1920,
      height: 1080,
      placement: (_group, span) => (span.startSec >= 5 ? "raised" : "bottom"),
    }
  );

  assert.match(ass, /Style: CapBottom,Arial,\d+,.+,76,1/);
  assert.match(ass, /Style: CapRaised,Arial,\d+,.+,259,1/);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:01\.00,CapBottom/);
  assert.match(ass, /Dialogue: 0,0:00:05\.00,0:00:06\.00,CapRaised/);
});

test("captionPlacementForSpan hides captions during hero titles", () => {
  const titles = [{ startSec: 2, endSec: 4, position: "hero" as const }];

  assert.equal(captionPlacementForSpan(1, 1.5, titles), "bottom");
  assert.equal(captionPlacementForSpan(2.5, 3, titles), "hidden");
});

test("captionPlacementForSpan raises captions for lower-third titles", () => {
  const titles = [{ startSec: 2, endSec: 4, position: "lower" as const }];

  assert.equal(captionPlacementForSpan(2.5, 3, titles), "raised");
});

test("captionPlacementForSpan keeps captions at bottom for centered titles", () => {
  const titles = [{ startSec: 2, endSec: 4, position: "center" as const }];

  assert.equal(captionPlacementForSpan(2.5, 3, titles), "bottom");
});

test("captionPlacementForSpan prefers hiding over raising when hero overlaps", () => {
  const titles = [
    { startSec: 2, endSec: 4, position: "lower" as const },
    { startSec: 2, endSec: 4, position: "hero" as const },
  ];

  assert.equal(captionPlacementForSpan(2.5, 3, titles), "hidden");
});

test("captionPlacementForGroup mirrors span placement for the full group", () => {
  const group: CaptionGroup = {
    startSec: 2,
    endSec: 4,
    words: [{ text: "Hello", startSec: 2, endSec: 4 }],
  };
  const titles = [{ startSec: 2, endSec: 4, position: "hero" as const }];

  assert.equal(captionPlacementForGroup(group, titles), "hidden");
});

test("buildAss omits dialogue lines hidden by hero title overlap", () => {
  const ass = buildAss(
    [
      {
        startSec: 0,
        endSec: 6,
        words: [
          { text: "Before", startSec: 0, endSec: 1 },
          { text: "During", startSec: 2, endSec: 3 },
          { text: "After", startSec: 5, endSec: 6 },
        ],
      },
    ],
    {
      width: 1920,
      height: 1080,
      placement: (_group, span) =>
        captionPlacementForSpan(span.startSec, span.endSec, [
          { startSec: 2, endSec: 4, position: "hero" },
        ]),
    }
  );

  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:02\.00,CapBottom/);
  assert.doesNotMatch(ass, /Dialogue: 0,0:00:02\.00/);
  assert.match(ass, /Dialogue: 0,0:00:05\.00,0:00:06\.00,CapBottom/);
});

// ── caption style presets (buildAss consumes CaptionStyleDef) ────────────────

test("buildAss header uses WrapStyle 0 (libass smart wrapping) for every preset", () => {
  // Finding 1: WrapStyle 2 (no wrap) let a 6-word bold-caps portrait group
  // clip off-frame at 1080x1920. WrapStyle 0 is a deliberate header change
  // (not a regression) that applies unconditionally, including to the
  // legacy "boxed" default; see the byte-compat pin below for that case.
  const defaultAss = buildAss(GROUPS, { width: 1080, height: 1920 });
  assert.match(defaultAss, /^WrapStyle: 0$/m);
  const boldCapsAss = buildAss(GROUPS, {
    width: 1080,
    height: 1920,
    style: captionStyle("bold-caps"),
  });
  assert.match(boldCapsAss, /^WrapStyle: 0$/m);
});

// Byte-compat gate: captured verbatim from HEAD before buildAss learned about
// styles, EXCEPT WrapStyle, which was deliberately changed from 2 to 0
// (Finding 1: WrapStyle 2 clipped portrait captions off-frame; WrapStyle 0
// is libass's smart/balanced wrapping and is correct-by-design for every
// preset, including this legacy "boxed" default). Everything else below
// (Style line, Dialogue line) is still byte-identical to the pre-preset
// output.
const BOXED_BYTE_COMPAT_ASS =
  "[Script Info]\n" +
  "ScriptType: v4.00+\n" +
  "WrapStyle: 0\n" +
  "PlayResX: 1920\n" +
  "PlayResY: 1080\n" +
  "ScaledBorderAndShadow: yes\n" +
  "\n" +
  "[V4+ Styles]\n" +
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n" +
  "Style: Cap,Arial,59,&H00FFFFFF&,&H00FFFFFF&,&H00000000&,&H64000000&,1,0,0,0,100,100,0,0,3,6,0,2,90,90,76,1\n" +
  "\n" +
  "[Events]\n" +
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
  "Dialogue: 0,0:00:00.00,0:00:01.00,Cap,,0,0,0,,{\\c&H00FFCC94&}Hello{\\c&H00FFFFFF&}\n";

test("buildAss byte-compat: omitting opts.style reproduces the pre-preset output exactly", () => {
  const ass = buildAss(GROUPS, { width: 1920, height: 1080 });
  assert.equal(ass, BOXED_BYTE_COMPAT_ASS);
});

test("buildAss byte-compat: opts.style 'boxed' reproduces the pre-preset output exactly", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("boxed"),
  });
  assert.equal(ass, BOXED_BYTE_COMPAT_ASS);
});

test("buildAss 'bold-caps' style uppercases dialogue text and scales the font size up", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("bold-caps"),
  });
  // base = max(18, round(1080*0.055)) = 59; sizeScale 1.18 -> round(69.62) = 70
  assert.match(ass, /Style: Cap,Arial,70,/);
  // Finding 4: non-default presets now emit an explicit \alpha reset on the
  // active word (no trailing close tag needed with only one word in the
  // group, unlike the legacy default two-tag composition).
  assert.match(ass, /\}HELLO$/m);
});

test("buildAss 'minimal' style is not bold and scales the font size down", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("minimal"),
  });
  // sizeScale 0.85 -> round(59*0.85) = 50
  assert.match(
    ass,
    /Style: Cap,Arial,50,&H00FFFFFF&,&H00FFFFFF&,.+,0,0,0,0,100,100,0,0,1,2,/
  );
});

test("buildAss 'clean' style uses BorderStyle 1 (true outline, no box)", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("clean"),
  });
  assert.match(ass, /Style: Cap,Arial,59,.+,1,0,0,0,100,100,0,0,1,3,/);
});

test("buildAss 'karaoke' style uses BorderStyle 1 and its own accent color on the active word", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("karaoke"),
  });
  // karaoke's accentColor #7dc4ff -> ASS BGR &H00FFC47D&. Finding 4: for
  // non-default presets the active word also gets an explicit
  // \alpha&H00& reset so it is never dimmed by the inactive-word tag.
  assert.match(ass, /,,\{\\c&H00FFC47D&\\alpha&H00&\}Hello/);
  assert.match(ass, /Style: Cap,Arial,62,.+,1,0,0,0,100,100,0,0,1,3,/);
});

// ── Finding 4: opacity-only emphasis when accentColor is undefined ─────────
// Contract (src/caption-styles.ts ~26-29): undefined accentColor means
// emphasize by opacity only, never a hardcoded color swap. Non-default
// presets: active word = def.accentColor ?? def.textColor at full opacity;
// inactive words dim via an ASS \alpha override derived from
// def.inactiveOpacity (alphaByte = round((1 - inactiveOpacity) * 255)).

const TWO_WORD_GROUPS: CaptionGroup[] = [
  {
    startSec: 0,
    endSec: 2,
    words: [
      { text: "Active", startSec: 0, endSec: 1 },
      { text: "Idle", startSec: 1, endSec: 2 },
    ],
  },
];

test("buildAss 'karaoke' dims the inactive word using its own inactiveOpacity", () => {
  const ass = buildAss(TWO_WORD_GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("karaoke"),
  });
  // karaoke inactiveOpacity 0.85 -> alphaByte round((1-0.85)*255) = 38 = 0x26.
  // Active word (own accentColor, full opacity) first, then the dimmed
  // inactive word in the style's textColor.
  assert.match(
    ass,
    /,,\{\\c&H00FFC47D&\\alpha&H00&\}Active \{\\c&H00FFFFFF&\\alpha&H26&\}Idle/
  );
});

test("buildAss 'clean' (accentColor undefined) uses textColor on the active word, not the hardcoded blue accent", () => {
  const ass = buildAss(TWO_WORD_GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("clean"),
  });
  // clean has no accentColor: active word = def.textColor (#ffffff), never
  // DEFAULT_CAPTION_ACCENT (the blue oklch(0.825 0.093 246.663) -> #ffcc94
  // BGR literal seen in the boxed byte-compat pin).
  assert.doesNotMatch(ass, /FFCC94/i);
  // clean inactiveOpacity 0.75 -> alphaByte round((1-0.75)*255) = 64 = 0x40.
  assert.match(
    ass,
    /,,\{\\c&H00FFFFFF&\\alpha&H00&\}Active \{\\c&H00FFFFFF&\\alpha&H40&\}Idle/
  );
});

test("buildAss 'minimal' (accentColor undefined) dims the inactive word by its own inactiveOpacity", () => {
  const ass = buildAss(TWO_WORD_GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("minimal"),
  });
  // minimal inactiveOpacity 0.6 -> alphaByte round((1-0.6)*255) = 102 = 0x66.
  assert.match(
    ass,
    /,,\{\\c&H00FFFFFF&\\alpha&H00&\}Active \{\\c&H00FFFFFF&\\alpha&H66&\}Idle/
  );
});

test("buildAss 'bold-caps' (accentColor undefined) dims the inactive word by its own inactiveOpacity", () => {
  const ass = buildAss(TWO_WORD_GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("bold-caps"),
  });
  // bold-caps inactiveOpacity 0.65 -> alphaByte round((1-0.65)*255) = 89 = 0x59.
  // allCaps uppercases the text too.
  assert.match(
    ass,
    /,,\{\\c&H00FFFFFF&\\alpha&H00&\}ACTIVE \{\\c&H00FFFFFF&\\alpha&H59&\}IDLE/
  );
});

test("buildAss 'boxed' (default) dialogue is unaffected by the Finding 4 dimming change", () => {
  const ass = buildAss(TWO_WORD_GROUPS, { width: 1920, height: 1080 });
  // Legacy two-tag composition only: accent-wrap the active word, plain
  // text for the inactive word, no \alpha tags anywhere.
  assert.match(ass, /,,\{\\c&H00FFCC94&\}Active\{\\c&H00FFFFFF&\} Idle\n/);
  assert.doesNotMatch(ass, /\\alpha/);
});

// ── Finding 2: box.alpha / outline alpha must reach OutlineColour ───────────
// alphaByte(alpha) = round((1 - alpha) * 255). Style line field order is:
// Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,...

test("buildAss 'bold-caps' OutlineColour carries its own box.alpha (BorderStyle 3)", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("bold-caps"),
  });
  // bold-caps box.alpha 0.7 -> alphaByte round((1-0.7)*255) = 77 = 0x4D.
  // box.color #000000 -> BGR 000000.
  assert.match(ass, /Style: Cap,Arial,70,&H00FFFFFF&,&H00FFFFFF&,&H4D000000&,/);
});

test("buildAss 'minimal' OutlineColour carries its own box.alpha (BorderStyle 1)", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("minimal"),
  });
  // minimal box.alpha 0.7 -> alphaByte round((1-0.7)*255) = 77 = 0x4D.
  assert.match(ass, /Style: Cap,Arial,50,&H00FFFFFF&,&H00FFFFFF&,&H4D000000&,/);
});

test("buildAss 'clean' OutlineColour carries its own box.alpha (BorderStyle 1)", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("clean"),
  });
  // clean box.alpha 0.9 -> alphaByte round((1-0.9)*255) = 25 = 0x19.
  assert.match(ass, /Style: Cap,Arial,59,&H00FFFFFF&,&H00FFFFFF&,&H19000000&,/);
});

test("buildAss 'karaoke' OutlineColour carries its own box.alpha (BorderStyle 1)", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    style: captionStyle("karaoke"),
  });
  // karaoke box.alpha 0.9 -> alphaByte round((1-0.9)*255) = 25 = 0x19.
  assert.match(ass, /Style: Cap,Arial,62,&H00FFFFFF&,&H00FFFFFF&,&H19000000&,/);
});

// ── keptWordsInOutputTime (R1: shared by exporter.ts + compiledTimeline.ts) ─

const kwSec = (n: number) => Math.round(n * 48_000);

function kwWord(id: string, text: string, startSec: number, endSec: number) {
  return {
    id,
    text,
    startSample: kwSec(startSec),
    endSample: kwSec(endSec),
    deleted: false,
  };
}

test("keptWordsInOutputTime: a range start 100ms inside a word still emits the word, clamped to the range", () => {
  // Snap moved the range start FORWARD past word 1's soft onset (or a
  // dead-air span covers its start): most of the word's audio still plays,
  // so the caption must too.
  const project = {
    sampleRate: 48_000,
    words: [kwWord("w0", "hello", 0, 1), kwWord("w1", "world", 1, 2)],
  };
  const ranges = [{ startSec: 0.1, endSec: 2 }];
  const out = keptWordsInOutputTime(project, ranges);
  assert.equal(out.length, 2);
  // w0 clamps to the range start: output time 0 through 0.9.
  assert.equal(out[0].text, "hello");
  assert.ok(Math.abs(out[0].startSec - 0) < 1e-9);
  assert.ok(Math.abs(out[0].endSec - 0.9) < 1e-9);
  // w1 is untouched: output 0.9 through 1.9.
  assert.ok(Math.abs(out[1].startSec - 0.9) < 1e-9);
  assert.ok(Math.abs(out[1].endSec - 1.9) < 1e-9);
});

test("keptWordsInOutputTime: a word end is clamped to the range end", () => {
  const project = {
    sampleRate: 48_000,
    words: [kwWord("w0", "hello", 0, 1)],
  };
  const ranges = [{ startSec: 0, endSec: 0.8 }];
  const out = keptWordsInOutputTime(project, ranges);
  assert.equal(out.length, 1);
  assert.ok(Math.abs(out[0].endSec - 0.8) < 1e-9);
});

test("keptWordsInOutputTime: a kept word with NO range overlap is not emitted", () => {
  // The whole word span was subtracted (dead air covering it entirely).
  const project = {
    sampleRate: 48_000,
    words: [kwWord("w0", "gone", 1, 2), kwWord("w1", "kept", 3, 4)],
  };
  const ranges = [
    { startSec: 0, endSec: 0.9 },
    { startSec: 2.5, endSec: 4 },
  ];
  const out = keptWordsInOutputTime(project, ranges);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "kept");
});

test("keptWordsInOutputTime: deleted words never emit", () => {
  const project = {
    sampleRate: 48_000,
    words: [{ ...kwWord("w0", "cut", 0, 1), deleted: true }],
  };
  const out = keptWordsInOutputTime(project, [{ startSec: 0, endSec: 1 }]);
  assert.equal(out.length, 0);
});
