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
      onApply={noop}
      onApplyAllSafe={noop}
      report={report()}
      {...overrides}
    />
  );
}

// The opening tag of the element carrying the given marker attribute.
function tagWith(html: string, marker: string, tag = "button"): string {
  const idx = html.indexOf(marker);
  assert.ok(idx >= 0, `missing ${marker} in markup`);
  const start = html.lastIndexOf(`<${tag}`, idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

test("empty report renders the empty state and a disabled apply-all-safe button", () => {
  const html = renderPanel();
  assert.match(html, /data-cleanup-panel/);
  assert.match(html, /Nothing to clean up\./);
  assert.doesNotMatch(html, /data-cleanup-row/);
  const applySafeTag = tagWith(html, "data-cleanup-apply-safe");
  assert.ok(applySafeTag.includes('disabled=""'));
});

test("rows render kind, risk, timecode, savings, and a per-row apply button", () => {
  const html = renderPanel({
    report: report({
      candidates: [
        candidate(),
        candidate({
          id: "da-1000",
          kind: "dead-air",
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
  // D1: risk labels are Title-cased (Safe/Review), and review carries the
  // stronger (secondary) badge weight while safe is the quieter outline.
  assert.match(html, /Safe/);
  assert.match(html, /Review/);
  const applyCount = html.split("data-cleanup-apply=").length - 1;
  assert.equal(applyCount, 2);
  assert.match(html, /1\.4s silence between words/);
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

// D3: the hard 30-row cap was replaced with a scrollable list (max-h-40
// overflow-y-auto) and MAX_ROWS raised to 200 as a safety cap; "N more"
// only kicks in beyond that.
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
