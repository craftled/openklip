import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SilenceSpan } from "../src/audio-analysis-core.ts";
import type { CleanupCandidate, CleanupReport } from "../src/cleanup.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  buildCleanupCandidates,
  CleanupPanel,
} from "../web/components/cleanup-panel.tsx";
import { aiCleanupWordToCandidate } from "../web/lib/cleanup-ai.ts";
import { makeProject } from "./helpers/projectFixture.ts";

const sec = (n: number) => Math.round(n * SAMPLE_RATE);

// ── buildCleanupCandidates (pure) ───────────────────────────────────────────

test("buildCleanupCandidates: without silences returns filler-only candidates plus a degraded warning", () => {
  const project = makeProject({
    words: [
      {
        id: "w0",
        text: "so",
        startSample: sec(0),
        endSample: sec(0.3),
        deleted: false,
      },
      {
        id: "w1",
        text: "um",
        startSample: sec(0.3),
        endSample: sec(0.8),
        deleted: false,
      },
      {
        id: "w2",
        text: "hello",
        startSample: sec(0.8),
        endSample: sec(1.3),
        deleted: false,
      },
    ],
  });

  const report = buildCleanupCandidates(project, undefined);
  assert.equal(report.fillerCount, 1);
  assert.equal(report.deadAirCount, 0);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].kind, "filler");
  assert.ok(
    report.warnings.some((w) =>
      /dead-air detection needs audio analysis/i.test(w)
    ),
    `expected a degraded-mode warning, got ${JSON.stringify(report.warnings)}`
  );

  const reportNull = buildCleanupCandidates(project, null);
  assert.equal(reportNull.deadAirCount, 0);
  assert.ok(
    reportNull.warnings.some((w) =>
      /dead-air detection needs audio analysis/i.test(w)
    )
  );
});

test("buildCleanupCandidates: with silences merges filler and dead-air via cleanupReport", () => {
  const project = makeProject({
    words: [
      {
        id: "w0",
        text: "um",
        startSample: sec(0),
        endSample: sec(0.3),
        deleted: false,
      },
      {
        id: "w1",
        text: "hello",
        startSample: sec(0.3),
        endSample: sec(0.8),
        deleted: false,
      },
      {
        id: "w2",
        text: "world",
        startSample: sec(3.0),
        endSample: sec(3.5),
        deleted: false,
      },
    ],
    durationSamples: sec(5),
  });
  const silences: SilenceSpan[] = [{ startSec: 0.9, endSec: 2.9 }];

  const report = buildCleanupCandidates(project, silences);
  assert.equal(report.fillerCount, 1);
  assert.equal(report.deadAirCount, 1);
  assert.equal(report.candidates.length, 2);
  assert.ok(
    !report.warnings.some((w) => /needs audio analysis/i.test(w)),
    "should not surface the degraded-mode warning once silences are supplied"
  );
});

test("buildCleanupCandidates: an empty silences array still runs full dead-air analysis (no degraded warning)", () => {
  const project = makeProject({
    words: [
      {
        id: "w0",
        text: "hello",
        startSample: sec(0),
        endSample: sec(0.5),
        deleted: false,
      },
    ],
  });
  const report = buildCleanupCandidates(project, []);
  assert.equal(report.deadAirCount, 0);
  assert.ok(
    !report.warnings.some((w) => /needs audio analysis/i.test(w)),
    "an analyzed-but-empty silences array is not the degraded path"
  );
});

// ── CleanupPanel (presentational) ───────────────────────────────────────────

function candidate(
  overrides: Partial<CleanupCandidate> = {}
): CleanupCandidate {
  return {
    id: "f-w1",
    kind: "filler",
    category: "hesitation",
    wordIds: ["w1"],
    startSec: 1.5,
    endSec: 2.0,
    text: "um",
    reason: "isolated 'um'",
    risk: "safe",
    estSavedSec: 0.5,
    ...overrides,
  };
}

function report(overrides: Partial<CleanupReport> = {}): CleanupReport {
  return {
    candidates: [],
    categoryCounts: {
      hesitation: 0,
      hedging: 0,
      repeat: 0,
      "dead-air": 0,
    },
    config: {
      minSec: 0.7,
      keepPadSec: 0.15,
      categories: { hesitation: true, hedging: false, repeat: false },
    },
    fillerCount: 0,
    deadAirCount: 0,
    estSavedSec: 0,
    warnings: [],
    ...overrides,
  };
}

const noop = () => {
  // presentational test: callbacks are not exercised
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof CleanupPanel>> = {}
): string {
  return renderToStaticMarkup(
    <CleanupPanel
      aiPassEnabled={false}
      lastUndo={null}
      onApply={noop}
      onApplyAllSafe={noop}
      onApplyAllSilences={noop}
      onApplyEnabled={noop}
      onPatchCleanupThreshold={noop}
      onToggleCategory={noop}
      onUndoLast={noop}
      report={report()}
      slug="demo"
      {...overrides}
    />
  );
}

function deadAirCandidate(
  overrides: Partial<CleanupCandidate> = {}
): CleanupCandidate {
  return candidate({
    id: "da-1000",
    kind: "dead-air",
    category: "dead-air",
    text: "",
    reason: "1.4s silence between words",
    risk: "review",
    startSec: 5,
    endSec: 6.4,
    estSavedSec: 1.4,
    ...overrides,
  });
}

const testPeaks = {
  sampleRate: 16_000,
  fromSec: 4,
  toSec: 7.4,
  buckets: Array.from({ length: 8 }, () => [-0.2, 0.2] as [number, number]),
};

// The opening tag of the element carrying the given marker attribute.
function tagWith(html: string, marker: string, tag = "button"): string {
  const idx = html.indexOf(marker);
  assert.ok(idx >= 0, `missing ${marker} in markup`);
  const start = html.lastIndexOf(`<${tag}`, idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

test("empty report renders the empty state, category cards, and disabled apply buttons", () => {
  const html = renderPanel();
  assert.match(html, /data-cleanup-panel/);
  assert.match(html, /data-cleanup-category-cards/);
  assert.match(html, /Nothing to clean up\./);
  assert.doesNotMatch(html, /data-cleanup-row/);
  const applySafeTag = tagWith(html, "data-cleanup-apply-safe");
  assert.ok(applySafeTag.includes('disabled=""'));
  assert.match(html, /data-cleanup-category-card="hesitation"/);
  assert.match(html, /data-cleanup-category-card="hedging"/);
  assert.match(html, /data-cleanup-category-card="repeat"/);
});

test("category checkbox reflects config enabled state", () => {
  const html = renderPanel({
    report: report({
      config: {
        minSec: 0.7,
        keepPadSec: 0.15,
        categories: { hesitation: true, hedging: true, repeat: false },
      },
    }),
  });
  const hesitationToggle = tagWith(
    html,
    'data-cleanup-category-toggle="hesitation"',
    "span"
  );
  const hedgingToggle = tagWith(
    html,
    'data-cleanup-category-toggle="hedging"',
    "span"
  );
  const repeatToggle = tagWith(
    html,
    'data-cleanup-category-toggle="repeat"',
    "span"
  );
  assert.ok(hesitationToggle.includes('aria-checked="true"'));
  assert.ok(hedgingToggle.includes('aria-checked="true"'));
  assert.ok(repeatToggle.includes('aria-checked="false"'));
});

test("category cards show counts and example snippets", () => {
  const html = renderPanel({
    report: report({
      candidates: [
        candidate({ id: "h-1", category: "hesitation", text: "um" }),
        candidate({ id: "h-2", category: "hesitation", text: "uh" }),
        candidate({ id: "g-1", category: "hedging", text: "you know" }),
      ],
      categoryCounts: {
        hesitation: 2,
        hedging: 1,
        repeat: 0,
        "dead-air": 0,
      },
      fillerCount: 3,
    }),
  });
  assert.match(html, /Hesitations/);
  assert.match(html, /Um.*Uh.*Er/);
  assert.match(html, /you know/);
});

test("rows render kind, risk, timecode, savings, and a per-row apply button", () => {
  const html = renderPanel({
    report: report({
      candidates: [
        candidate(),
        candidate({
          id: "da-1000",
          kind: "dead-air",
          category: "dead-air",
          text: "",
          reason: "1.4s silence between words",
          risk: "review",
          startSec: 5,
          endSec: 6.4,
          estSavedSec: 1.4,
        }),
      ],
      fillerCount: 1,
      deadAirCount: 1,
      estSavedSec: 1.9,
    }),
  });
  const rowCount = html.split("data-cleanup-row=").length - 1;
  assert.equal(rowCount, 2);
  assert.match(html, /Safe/);
  assert.match(html, /Review/);
  const applyCount = html.split("data-cleanup-apply=").length - 1;
  assert.equal(applyCount, 2);
  assert.match(html, /1\.4s silence between words/);
});

test("candidate list groups categories in fixed order and hides empty groups", () => {
  const html = renderPanel({
    report: report({
      candidates: [
        candidate({
          id: "da-1",
          category: "dead-air",
          kind: "dead-air",
          text: "",
        }),
        candidate({ id: "h-1", category: "hesitation", text: "um" }),
      ],
      categoryCounts: {
        hesitation: 1,
        hedging: 0,
        repeat: 0,
        "dead-air": 1,
      },
    }),
  });
  assert.match(html, /data-cleanup-group="hesitation"/);
  assert.match(html, /data-cleanup-group="dead-air"/);
  assert.doesNotMatch(html, /data-cleanup-group="hedging"/);
  assert.doesNotMatch(html, /data-cleanup-group="repeat"/);
  const hesitationIdx = html.indexOf('data-cleanup-group="hesitation"');
  const deadAirIdx = html.indexOf('data-cleanup-group="dead-air"');
  assert.ok(hesitationIdx >= 0 && deadAirIdx > hesitationIdx);
});

test("apply-all-safe shows the safe count and total savings, and is enabled when safe candidates exist", () => {
  const html = renderPanel({
    report: report({
      candidates: [
        candidate({ id: "f-a", risk: "safe", estSavedSec: 0.4 }),
        candidate({ id: "f-b", risk: "safe", estSavedSec: 0.6 }),
        candidate({ id: "f-c", risk: "review", estSavedSec: 2 }),
      ],
      fillerCount: 3,
      estSavedSec: 3,
    }),
  });
  const applySafeTag = tagWith(html, "data-cleanup-apply-safe");
  assert.ok(!applySafeTag.includes('disabled=""'));
  assert.match(html, /Apply all safe \(2, saves ~1\.0s\)/);
});

test("apply-enabled button renders as a primary action", () => {
  const html = renderPanel();
  assert.match(html, /data-cleanup-apply-enabled/);
  assert.match(html, /Apply enabled categories/);
});

test("merged AI suggestion rows render with an AI badge", () => {
  const html = renderPanel({
    initialAiCandidates: [
      aiCleanupWordToCandidate({
        category: "repeat",
        endSec: 4.2,
        id: "w9",
        startSec: 3.9,
        text: "I mean",
      }),
    ],
    report: report({
      candidates: [
        candidate({ id: "h-1", category: "hesitation", text: "um" }),
      ],
      categoryCounts: {
        hesitation: 1,
        hedging: 0,
        repeat: 1,
        "dead-air": 0,
      },
    }),
  });
  assert.match(html, /data-cleanup-ai-row/);
  assert.match(html, /data-cleanup-ai-badge/);
  assert.match(html, /data-cleanup-group="repeat"/);
});

test("undo button renders with item count when lastUndo is set", () => {
  const html = renderPanel({
    lastUndo: { wordIds: ["w1", "w2", "w3"], deadAirSpanIds: ["da-1"] },
  });
  assert.match(html, /data-cleanup-undo/);
  assert.match(html, /Undo last cleanup \(4\)/);
});

test("undo button is hidden when lastUndo is null", () => {
  const html = renderPanel({ lastUndo: null });
  const undoTag = tagWith(html, "data-cleanup-undo");
  assert.ok(undoTag.includes('aria-hidden="true"'));
  assert.ok(undoTag.includes('disabled=""'));
});

test("renders every row up to the 200-row cap without an 'N more' line", () => {
  const some = Array.from({ length: 35 }, (_, i) =>
    candidate({ id: `f-${i}`, startSec: i, endSec: i + 0.2 })
  );
  const html = renderPanel({
    report: report({ candidates: some, fillerCount: 35, estSavedSec: 17.5 }),
  });
  const rowCount = html.split("data-cleanup-row=").length - 1;
  assert.equal(rowCount, 35);
  assert.doesNotMatch(html, /\d+ more/);
});

test("caps rendered rows at 200 and shows a muted 'N more' line beyond that", () => {
  const many = Array.from({ length: 205 }, (_, i) =>
    candidate({ id: `f-${i}`, startSec: i, endSec: i + 0.2 })
  );
  const html = renderPanel({
    report: report({ candidates: many, fillerCount: 205, estSavedSec: 100 }),
  });
  const rowCount = html.split("data-cleanup-row=").length - 1;
  assert.equal(rowCount, 200);
  assert.match(html, /5 more/);
});

test("warnings render as a muted list", () => {
  const html = renderPanel({
    report: report({
      warnings: ["dead-air detection needs audio analysis"],
    }),
  });
  assert.match(html, /dead-air detection needs audio analysis/);
});

// ── Registered dead-air spans section ───────────────────────────────────────

test("registered spans section is absent when registeredSpans is empty", () => {
  const html = renderPanel({ registeredSpans: [] });
  assert.doesNotMatch(html, /data-dead-air-registered/);
});

test("registered spans section renders when spans are provided", () => {
  const html = renderPanel({
    registeredSpans: [
      { id: "da-1", startSec: 5, endSec: 6.5 },
      { id: "da-2", startSec: 20, endSec: 21.2 },
    ],
  });
  assert.match(html, /data-dead-air-registered/);
  const rmCount = html.split("data-dead-air-rm=").length - 1;
  assert.equal(rmCount, 2);
  assert.match(html, /0:05/);
  assert.match(html, /0:06/);
  assert.match(html, /1\.5s/);
  assert.match(html, /0:20/);
});

test("registered spans remove buttons are disabled while applying", () => {
  const html = renderPanel({
    applying: true,
    registeredSpans: [{ id: "da-1", startSec: 5, endSec: 6.5 }],
  });
  const rmTag = tagWith(html, "data-dead-air-rm");
  assert.ok(rmTag.includes('disabled=""'));
});

// ── Remove-silence card ─────────────────────────────────────────────────────

test("silence card renders with dead-air candidates and threshold subtitle", () => {
  const html = renderPanel({
    peaksOverride: testPeaks,
    report: report({
      candidates: [deadAirCandidate()],
      deadAirCount: 1,
      estSavedSec: 1.4,
    }),
  });
  assert.match(html, /data-cleanup-silence-card/);
  assert.match(html, /Remove silence/);
  assert.match(
    html,
    /Cutting pauses longer than 0\.7s, keeping 0\.15s padding/
  );
  assert.match(html, /1 silence · saves ~1\.4s/);
  assert.match(html, /data-cleanup-silence-waveform/);
});

test("remove all silences button is disabled when there are zero dead-air candidates", () => {
  const html = renderPanel({
    report: report({
      candidates: [candidate()],
      fillerCount: 1,
    }),
  });
  const applyTag = tagWith(html, "data-cleanup-apply-all-silences");
  assert.ok(applyTag.includes('disabled=""'));
});

test("selecting a dead-air row switches the silence card selection marker", () => {
  const first = deadAirCandidate({ id: "da-1", startSec: 1, endSec: 2 });
  const second = deadAirCandidate({
    id: "da-2",
    startSec: 8,
    endSec: 9.2,
    estSavedSec: 1.0,
  });
  const base = report({
    candidates: [first, second],
    deadAirCount: 2,
    estSavedSec: 2.4,
  });
  const htmlFirst = renderPanel({
    initialSelectedDeadAirId: "da-1",
    peaksOverride: testPeaks,
    report: base,
  });
  const htmlSecond = renderPanel({
    initialSelectedDeadAirId: "da-2",
    peaksOverride: testPeaks,
    report: base,
  });
  assert.match(htmlFirst, /data-cleanup-selected-dead-air-id="da-1"/);
  assert.match(htmlSecond, /data-cleanup-selected-dead-air-id="da-2"/);
  assert.match(htmlFirst, /data-cleanup-row-selected/);
});

test("hydrated silences remove the degraded dead-air warning from the report", () => {
  const project = makeProject({
    words: [
      {
        id: "w0",
        text: "hello",
        startSample: sec(0),
        endSample: sec(0.5),
        deleted: false,
      },
      {
        id: "w1",
        text: "world",
        startSample: sec(3),
        endSample: sec(3.5),
        deleted: false,
      },
    ],
    durationSamples: sec(5),
  });
  const hydrated = buildCleanupCandidates(project, [
    { startSec: 0.6, endSec: 2.9 },
  ]);
  const html = renderPanel({
    peaksOverride: testPeaks,
    report: hydrated,
  });
  assert.doesNotMatch(html, /dead-air detection needs audio analysis/i);
});
