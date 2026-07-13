import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyOverrides,
  type CamSwitchSettings,
  CamSwitchSettingsSchema,
  DEFAULT_CAM_SWITCH_SETTINGS,
  followSpeakerPlan,
  type PlanCam,
  type PlanSpan,
  PlanSpanSchema,
  ruleBasedAutoPlan,
  type SpeakingSpan,
  validatePlan,
} from "../src/cam-plan.ts";
import { SAMPLE_RATE } from "../src/edl.ts";

const ms = (n: number) => Math.round((n / 1000) * SAMPLE_RATE);
const sec = (n: number) => Math.round(n * SAMPLE_RATE);

const SPEAKER_A: PlanCam = { id: "cam-a", role: "speaker" };
const SPEAKER_B: PlanCam = { id: "cam-b", role: "speaker" };
const WIDE: PlanCam = { id: "wide", role: "wide" };
const DEFAULT_CAMS = [SPEAKER_A, SPEAKER_B, WIDE];

function assertFullCoverage(
  plan: PlanSpan[],
  durationSamples: number,
  validShots: string[]
) {
  assert.ok(plan.length > 0, "plan must not be empty");
  assert.equal(plan[0].fromSample, 0, "plan must start at 0");
  assert.equal(
    plan.at(-1)?.toSample,
    durationSamples,
    "plan must end at durationSamples"
  );
  for (let i = 0; i < plan.length; i++) {
    const span = plan[i];
    assert.ok(validShots.includes(span.shot), `unknown shot: ${span.shot}`);
    assert.ok(
      span.fromSample < span.toSample,
      `span ${i} must have positive length`
    );
    if (i > 0) {
      assert.equal(
        plan[i - 1].toSample,
        span.fromSample,
        `gap or overlap at span ${i}`
      );
    }
  }
}

function assertMinShotLength(plan: PlanSpan[], minShotMs: number) {
  const minSamples = ms(minShotMs);
  for (const span of plan) {
    assert.ok(
      span.toSample - span.fromSample >= minSamples || plan.length === 1,
      `span ${span.shot} shorter than minShotMs`
    );
  }
}

// ── Settings schema ─────────────────────────────────────────────────────────

test("CamSwitchSettingsSchema applies defaults for empty object", () => {
  const parsed = CamSwitchSettingsSchema.parse({});
  assert.deepEqual(parsed, DEFAULT_CAM_SWITCH_SETTINGS);
});

test("CamSwitchSettingsSchema partial override preserves other defaults", () => {
  const parsed = CamSwitchSettingsSchema.parse({
    minShotMs: 1500,
    wide: "off",
  });
  assert.equal(parsed.minShotMs, 1500);
  assert.equal(parsed.wide, "off");
  assert.equal(
    parsed.interjectionMs,
    DEFAULT_CAM_SWITCH_SETTINGS.interjectionMs
  );
  assert.equal(parsed.leadMs, DEFAULT_CAM_SWITCH_SETTINGS.leadMs);
});

test("PlanSpanSchema parses valid span", () => {
  const span = PlanSpanSchema.parse({
    fromSample: 0,
    toSample: 1000,
    shot: "cam-a",
    locked: true,
    reason: "manual",
  });
  assert.equal(span.shot, "cam-a");
  assert.equal(span.locked, true);
});

// ── followSpeakerPlan ───────────────────────────────────────────────────────

test("followSpeakerPlan: simple A/B alternation with J-cut lead", () => {
  const duration = sec(20);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: sec(10) },
    { camId: "cam-b", fromSample: sec(10), toSample: sec(20) },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
  });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].shot, "cam-a");
  assert.equal(plan[0].fromSample, 0);
  assert.equal(plan[1].shot, "cam-b");
  // J-cut: switch lands leadMs (250ms) before B's span start at 10s
  assert.equal(plan[0].toSample, sec(10) - ms(250));
  assert.equal(plan[1].fromSample, sec(10) - ms(250));
  assert.equal(plan[1].toSample, duration);
});

test("followSpeakerPlan: backchannel shorter than interjectionMs is ignored", () => {
  const duration = sec(15);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: duration },
    { camId: "cam-b", fromSample: sec(5), toSample: sec(5) + ms(500) },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].shot, "cam-a");
  assert.equal(plan[0].fromSample, 0);
  assert.equal(plan[0].toSample, duration);
});

test("followSpeakerPlan: rapid ping-pong respects minShotMs deferral", () => {
  const duration = sec(12);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: sec(3) },
    { camId: "cam-b", fromSample: sec(3), toSample: sec(6) },
    { camId: "cam-a", fromSample: sec(6), toSample: sec(9) },
    { camId: "cam-b", fromSample: sec(9), toSample: duration },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { minShotMs: 2000, leadMs: 250 },
  });
  assert.ok(plan.length >= 2);
  for (const span of plan) {
    assert.ok(span.toSample - span.fromSample >= ms(2000) || plan.length === 1);
  }
  assert.equal(plan[0].shot, "cam-a");
  // First switch to B: max(minShot at 2s, 3s - 250ms) = 2.75s
  const firstSwitch = plan.find((s) => s.shot === "cam-b");
  assert.ok(firstSwitch);
  assert.ok(firstSwitch.fromSample >= ms(2000));
});

test("followSpeakerPlan: trigger span ended before minShotMs elapsed is skipped", () => {
  const duration = sec(20);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: duration },
    { camId: "cam-b", fromSample: sec(1), toSample: sec(1) + ms(800) },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { minShotMs: 2000, interjectionMs: 700 },
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].shot, "cam-a");
});

test("followSpeakerPlan: silence holds current shot", () => {
  const duration = sec(20);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: sec(5) },
    { camId: "cam-b", fromSample: sec(10), toSample: sec(15) },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
  });
  // Gap 5s-10s: hold cam-a (merged into the preceding cam-a span)
  const gapMid = sec(7);
  const gapHolder = plan.find(
    (s) => s.fromSample <= gapMid && s.toSample > gapMid
  );
  assert.ok(gapHolder);
  assert.equal(gapHolder.shot, "cam-a");
});

test("followSpeakerPlan: opens on first speaker at sample 0", () => {
  const duration = sec(30);
  const spans: SpeakingSpan[] = [
    { camId: "cam-b", fromSample: sec(5), toSample: sec(15) },
    { camId: "cam-a", fromSample: sec(20), toSample: sec(25) },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
  });
  assert.equal(plan[0].fromSample, 0);
  assert.equal(plan[0].shot, "cam-b");
});

test("followSpeakerPlan: full coverage, no gaps, no overlaps", () => {
  const duration = sec(60);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: sec(0), toSample: sec(20) },
    { camId: "cam-b", fromSample: sec(15), toSample: sec(40) },
    { camId: "cam-a", fromSample: sec(35), toSample: sec(55) },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
  });
  assertFullCoverage(plan, duration, ["cam-a", "cam-b", "wide"]);
});

test("followSpeakerPlan: wide cam never chosen", () => {
  const duration = sec(30);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: sec(10) },
    { camId: "cam-b", fromSample: sec(10), toSample: sec(20) },
    { camId: "wide", fromSample: sec(5), toSample: sec(25) },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
  });
  assert.ok(plan.every((s) => s.shot !== "wide"));
});

test("followSpeakerPlan: single speaker cam covers entire duration", () => {
  const duration = sec(45);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: sec(5), toSample: sec(30) },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: [SPEAKER_A],
    durationSamples: duration,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].shot, "cam-a");
  assert.equal(plan[0].fromSample, 0);
  assert.equal(plan[0].toSample, duration);
});

test("followSpeakerPlan: empty spans opens on first speaker cam", () => {
  const duration = sec(30);
  const plan = followSpeakerPlan([], {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].shot, "cam-a");
  assert.equal(plan[0].fromSample, 0);
  assert.equal(plan[0].toSample, duration);
});

test("followSpeakerPlan: empty spans with only wide cam uses first cam", () => {
  const duration = sec(10);
  const plan = followSpeakerPlan([], {
    cams: [WIDE],
    durationSamples: duration,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].shot, "wide");
  assertFullCoverage(plan, duration, ["wide"]);
});

test("followSpeakerPlan: overlap newest start wins", () => {
  const duration = sec(20);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: sec(15) },
    { camId: "cam-b", fromSample: sec(5), toSample: sec(10) },
  ];
  const plan = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { minShotMs: 1000, leadMs: 0, interjectionMs: 100 },
  });
  const bSpan = plan.find((s) => s.shot === "cam-b");
  assert.ok(bSpan, "cam-b should get a shot when interrupting");
  assert.ok(bSpan.fromSample <= sec(5));
});

test("followSpeakerPlan: deterministic same input same output", () => {
  const duration = sec(40);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: sec(2), toSample: sec(18) },
    { camId: "cam-b", fromSample: sec(8), toSample: sec(22) },
    { camId: "cam-a", fromSample: sec(25), toSample: sec(35) },
  ];
  const opts = { cams: DEFAULT_CAMS, durationSamples: duration };
  const a = followSpeakerPlan(spans, opts);
  const b = followSpeakerPlan(spans, opts);
  assert.deepEqual(a, b);
});

// ── ruleBasedAutoPlan ───────────────────────────────────────────────────────

test("ruleBasedAutoPlan: sustained crosstalk switches to wide", () => {
  const duration = sec(30);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: duration },
    { camId: "cam-b", fromSample: sec(5), toSample: sec(15) },
  ];
  const plan = ruleBasedAutoPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { interjectionMs: 700, wide: "auto" },
  });
  const wideSpans = plan.filter((s) => s.shot === "wide");
  assert.ok(wideSpans.length > 0, "crosstalk should produce wide shot");
});

test("ruleBasedAutoPlan: wide off uses other speaker for variety", () => {
  const duration = sec(60);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: duration },
  ];
  const plan = ruleBasedAutoPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { maxShotMs: 10_000, wide: "off", minShotMs: 2000 },
  });
  assert.ok(plan.every((s) => s.shot !== "wide"));
  const shots = new Set(plan.map((s) => s.shot));
  assert.ok(shots.size > 1, "variety change should use another speaker cam");
});

test("ruleBasedAutoPlan: monologue exceeding maxShotMs inserts variety then returns", () => {
  const duration = sec(60);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: duration },
  ];
  const plan = ruleBasedAutoPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { maxShotMs: 15_000, minShotMs: 2000, wide: "auto" },
  });
  assert.ok(plan.length >= 3, "should have variety break and return");
  const shots = plan.map((s) => s.shot);
  assert.equal(shots[0], "cam-a");
  assert.notEqual(shots[1], "cam-a");
  const lastA = plan.filter((s) => s.shot === "cam-a").at(-1);
  assert.ok(lastA && lastA.toSample === duration);
});

test("ruleBasedAutoPlan: wide off crosstalk stays on speaker cams", () => {
  const duration = sec(20);
  const spans: SpeakingSpan[] = [
    { camId: "cam-a", fromSample: 0, toSample: duration },
    { camId: "cam-b", fromSample: sec(3), toSample: sec(12) },
  ];
  const plan = ruleBasedAutoPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { wide: "off", interjectionMs: 500 },
  });
  assert.ok(plan.every((s) => s.shot !== "wide"));
});

// ── validatePlan ────────────────────────────────────────────────────────────

test("validatePlan: garbage input throws", () => {
  assert.throws(
    () =>
      validatePlan("not an array", {
        cams: DEFAULT_CAMS,
        durationSamples: sec(10),
      }),
    /array|invalid/i
  );
  assert.throws(
    () =>
      validatePlan(
        { foo: 1 },
        {
          cams: DEFAULT_CAMS,
          durationSamples: sec(10),
        }
      ),
    /array|invalid/i
  );
});

test("validatePlan: unknown shot dropped and gap filled from fallback", () => {
  const duration = sec(20);
  const fallback: PlanSpan[] = [
    { fromSample: 0, toSample: duration, shot: "cam-a" },
  ];
  const raw = [
    { fromSample: 0, toSample: sec(10), shot: "cam-a" },
    { fromSample: sec(10), toSample: duration, shot: "unknown-cam" },
  ];
  const plan = validatePlan(raw, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    fallback,
  });
  assertFullCoverage(plan, duration, ["cam-a", "cam-b", "wide"]);
  assert.ok(plan.every((s) => s.shot !== "unknown-cam"));
});

test("validatePlan: overlap resolution later span wins", () => {
  const duration = sec(20);
  const raw: PlanSpan[] = [
    { fromSample: 0, toSample: sec(15), shot: "cam-a" },
    { fromSample: sec(10), toSample: duration, shot: "cam-b" },
  ];
  const plan = validatePlan(raw, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { minShotMs: 1000 },
  });
  const overlapRegion = plan.find(
    (s) => s.shot === "cam-b" && s.fromSample >= sec(10)
  );
  assert.ok(overlapRegion);
  assert.ok(!plan.some((s) => s.shot === "cam-a" && s.toSample > sec(10)));
});

test("validatePlan: out-of-range clipping", () => {
  const duration = sec(20);
  const raw: PlanSpan[] = [
    { fromSample: -sec(5), toSample: sec(10), shot: "cam-a" },
    { fromSample: sec(10), toSample: sec(30), shot: "cam-b" },
  ];
  const plan = validatePlan(raw, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { minShotMs: 1000 },
  });
  assert.equal(plan[0].fromSample, 0);
  assert.equal(plan.at(-1)?.toSample, duration);
});

test("validatePlan: minShotMs absorbs short spans", () => {
  const duration = sec(20);
  const raw: PlanSpan[] = [
    { fromSample: 0, toSample: sec(10), shot: "cam-a" },
    { fromSample: sec(10), toSample: sec(10) + ms(500), shot: "cam-b" },
    { fromSample: sec(10) + ms(500), toSample: duration, shot: "cam-a" },
  ];
  const plan = validatePlan(raw, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { minShotMs: 2000 },
  });
  assertMinShotLength(plan, 2000);
  assert.ok(!plan.some((s) => s.shot === "cam-b"));
});

test("validatePlan: snap moves edge onto silence boundary within snapMs", () => {
  const duration = sec(20);
  const raw: PlanSpan[] = [
    { fromSample: 0, toSample: sec(10) + ms(50), shot: "cam-a" },
    { fromSample: sec(10) + ms(50), toSample: duration, shot: "cam-b" },
  ];
  const silences = [{ startSec: 9.9, endSec: 10.1 }];
  const plan = validatePlan(raw, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { minShotMs: 1000, snapMs: 120 },
    silences,
  });
  const boundary = plan.find((s) => s.shot === "cam-b")?.fromSample;
  assert.ok(boundary !== undefined);
  // Edge should snap to silence end at 10.1s (within 120ms of original ~10.05s)
  assert.equal(boundary, sec(10.1));
});

test("validatePlan: snap does not move beyond snapMs", () => {
  const duration = sec(20);
  const originalBoundary = sec(10);
  const raw: PlanSpan[] = [
    { fromSample: 0, toSample: originalBoundary, shot: "cam-a" },
    { fromSample: originalBoundary, toSample: duration, shot: "cam-b" },
  ];
  const silences = [{ startSec: 8.0, endSec: 8.5 }];
  const plan = validatePlan(raw, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { minShotMs: 1000, snapMs: 120 },
    silences,
  });
  const boundary = plan.find((s) => s.shot === "cam-b")?.fromSample;
  assert.equal(boundary, originalBoundary);
});

test("validatePlan: locked span survives verbatim", () => {
  const duration = sec(30);
  const locked: PlanSpan[] = [
    {
      fromSample: sec(10),
      toSample: sec(15),
      shot: "cam-b",
      locked: true,
      reason: "director lock",
    },
  ];
  const raw: PlanSpan[] = [
    { fromSample: 0, toSample: duration, shot: "cam-a" },
  ];
  const plan = validatePlan(raw, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    locked,
    settings: { minShotMs: 2000 },
  });
  const lockedRegion = plan.find(
    (s) =>
      s.shot === "cam-b" && s.fromSample === sec(10) && s.toSample === sec(15)
  );
  assert.ok(lockedRegion, "locked span must survive verbatim");
});

test("validatePlan: adversarial fuzz determinism", () => {
  const duration = sec(120);
  const spans: SpeakingSpan[] = [];
  for (let i = 0; i < 100; i++) {
    const start = Math.floor(Math.random() * duration * 0.9);
    const end = start + Math.floor(Math.random() * duration * 0.1) + ms(100);
    spans.push({
      camId: i % 2 === 0 ? "cam-a" : "cam-b",
      fromSample: start,
      toSample: Math.min(end, duration),
    });
  }
  const fallback = followSpeakerPlan(spans, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
  });
  const raw = [
    { fromSample: 0, toSample: sec(30), shot: "cam-a" },
    { fromSample: sec(25), toSample: sec(60), shot: "cam-b" },
    { fromSample: sec(55), toSample: sec(90), shot: "cam-a" },
    { fromSample: sec(85), toSample: duration, shot: "cam-b" },
  ];
  const opts = {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    fallback,
    settings: { minShotMs: 2000, snapMs: 120 } as Partial<CamSwitchSettings>,
  };
  const a = validatePlan(raw, opts);
  const b = validatePlan(raw, opts);
  assert.deepEqual(a, b);
  assertFullCoverage(a, duration, ["cam-a", "cam-b", "wide"]);
  assertMinShotLength(a, 2000);
});

test("validatePlan: merges adjacent same-shot spans", () => {
  const duration = sec(20);
  const raw: PlanSpan[] = [
    { fromSample: 0, toSample: sec(10), shot: "cam-a" },
    { fromSample: sec(10), toSample: duration, shot: "cam-a" },
  ];
  const plan = validatePlan(raw, {
    cams: DEFAULT_CAMS,
    durationSamples: duration,
    settings: { minShotMs: 1000 },
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].shot, "cam-a");
});

// ── applyOverrides ──────────────────────────────────────────────────────────

test("applyOverrides stamps locked spans into plan", () => {
  const duration = sec(30);
  const base: PlanSpan[] = [
    { fromSample: 0, toSample: duration, shot: "cam-a" },
  ];
  const overrides: PlanSpan[] = [
    {
      fromSample: sec(10),
      toSample: sec(15),
      shot: "cam-b",
      reason: "manual cut",
    },
  ];
  const plan = applyOverrides(base, overrides);
  const lockedRegion = plan.find(
    (s) =>
      s.shot === "cam-b" &&
      s.fromSample === sec(10) &&
      s.toSample === sec(15) &&
      s.locked === true
  );
  assert.ok(lockedRegion);
  assertFullCoverage(plan, duration, ["cam-a", "cam-b", "wide"]);
});

test("applyOverrides full coverage preserved", () => {
  const duration = sec(40);
  const base: PlanSpan[] = [
    { fromSample: 0, toSample: sec(20), shot: "cam-a" },
    { fromSample: sec(20), toSample: duration, shot: "cam-b" },
  ];
  const overrides: PlanSpan[] = [
    { fromSample: sec(5), toSample: sec(8), shot: "cam-b" },
    { fromSample: sec(25), toSample: sec(28), shot: "cam-a" },
  ];
  const plan = applyOverrides(base, overrides);
  assertFullCoverage(plan, duration, ["cam-a", "cam-b", "wide"]);
  assert.ok(plan.some((s) => s.locked === true));
});

// ── Orchestrator review regressions (lane A3 review) ─────────────────────────

test("enforceMinShot survives consecutive sub-minimum spans without corruption", () => {
  const sec = (n: number) => Math.round(n * 48_000);
  const cams = [
    { id: "cam-a", role: "speaker" as const },
    { id: "cam-b", role: "speaker" as const },
  ];
  // long open, then a run of three 0.5s spans, then long tail — shorts must absorb, never corrupt
  const raw = [
    { fromSample: 0, toSample: sec(10), shot: "cam-a" },
    { fromSample: sec(10), toSample: sec(10.5), shot: "cam-b" },
    { fromSample: sec(10.5), toSample: sec(11), shot: "cam-a" },
    { fromSample: sec(11), toSample: sec(11.5), shot: "cam-b" },
    { fromSample: sec(11.5), toSample: sec(30), shot: "cam-a" },
  ];
  const plan = validatePlan(raw, { cams, durationSamples: sec(30) });
  let cursor = 0;
  for (const span of plan) {
    assert.equal(typeof span.fromSample, "number");
    assert.equal(typeof span.shot, "string");
    assert.ok(Number.isFinite(span.fromSample), "fromSample finite");
    assert.ok(Number.isFinite(span.toSample), "toSample finite");
    assert.equal(span.fromSample, cursor, "no gaps/overlaps");
    assert.ok(span.toSample > span.fromSample, "positive length");
    cursor = span.toSample;
  }
  assert.equal(cursor, sec(30), "full coverage");
});

test("applyOverrides preserves previously locked spans across a second override", () => {
  const sec = (n: number) => Math.round(n * 48_000);
  const base = [{ fromSample: 0, toSample: sec(30), shot: "cam-a" }];
  const once = applyOverrides(base, [
    { fromSample: sec(5), toSample: sec(10), shot: "cam-b" },
  ]);
  const twice = applyOverrides(once, [
    { fromSample: sec(20), toSample: sec(25), shot: "cam-b" },
  ]);
  const first = twice.find(
    (s) =>
      s.fromSample === sec(5) && s.toSample === sec(10) && s.shot === "cam-b"
  );
  assert.ok(
    first,
    "first override survives the second applyOverrides verbatim"
  );
  assert.equal(first?.locked, true, "and stays locked");
});

// ── Second-opinion review regressions (grok lane, pre-PR) ────────────────────

test("validatePlan never snaps locked span boundaries onto silence edges", () => {
  const sec = (n: number) => Math.round(n * 48_000);
  const cams = [
    { id: "cam-a", role: "speaker" as const },
    { id: "cam-b", role: "speaker" as const },
  ];
  // Silence edges sit 50ms away from the locked boundaries — inside snapMs=120.
  const silences = [
    { startSec: 9.55, endSec: 10.05 },
    { startSec: 14.95, endSec: 15.45 },
  ];
  const plan = [
    { fromSample: 0, toSample: sec(10), shot: "cam-a" },
    { fromSample: sec(10), toSample: sec(15), shot: "cam-b", locked: true },
    { fromSample: sec(15), toSample: sec(30), shot: "cam-a" },
  ];
  const out = validatePlan(plan, {
    cams,
    durationSamples: sec(30),
    silences,
    locked: plan.filter((s) => s.locked),
  });
  const lockedOut = out.find((s) => s.locked);
  assert.ok(lockedOut, "locked span still present");
  assert.equal(lockedOut?.fromSample, sec(10), "locked start not snapped");
  assert.equal(lockedOut?.toSample, sec(15), "locked end not snapped");
  assert.equal(lockedOut?.shot, "cam-b");
});

test("validatePlan without explicit locked opts still respects locked flags in the plan", () => {
  const sec = (n: number) => Math.round(n * 48_000);
  const cams = [
    { id: "cam-a", role: "speaker" as const },
    { id: "cam-b", role: "speaker" as const },
  ];
  const silences = [{ startSec: 9.55, endSec: 10.05 }];
  // This mirrors camMix's re-validation of a pre-resolved plan (opts.plan path).
  const plan = [
    { fromSample: 0, toSample: sec(10), shot: "cam-a" },
    { fromSample: sec(10), toSample: sec(15), shot: "cam-b", locked: true },
    { fromSample: sec(15), toSample: sec(30), shot: "cam-a" },
  ];
  const out = validatePlan(plan, { cams, durationSamples: sec(30), silences });
  const lockedOut = out.find((s) => s.shot === "cam-b");
  assert.equal(
    lockedOut?.fromSample,
    sec(10),
    "locked start stable without opts.locked"
  );
  assert.equal(
    lockedOut?.toSample,
    sec(15),
    "locked end stable without opts.locked"
  );
});

// ── Third-party review regressions (grok+codex verify-the-fix round) ────────

test("validatePlan: enforceMinShot never extends a locked neighbor to absorb a short unlocked remnant", () => {
  const cams = [
    { id: "cam-a", role: "speaker" as const },
    { id: "cam-b", role: "speaker" as const },
  ];
  // Two cam-override calls placed close together: a 0.5s unlocked gap
  // (shorter than the default 2s minShotMs) sits between them.
  const base = [{ fromSample: 0, toSample: sec(30), shot: "cam-a" }];
  const locked = [
    { fromSample: sec(10), toSample: sec(15), shot: "cam-b", locked: true },
    { fromSample: sec(15.5), toSample: sec(20), shot: "cam-a", locked: true },
  ];
  const out = validatePlan(base, {
    cams,
    durationSamples: sec(30),
    locked,
  });
  const lockB = out.find((s) => s.shot === "cam-b" && s.locked);
  const lockA2 = out.find(
    (s) => s.shot === "cam-a" && s.locked && s.fromSample >= sec(15)
  );
  assert.ok(lockB, "first lock present");
  assert.equal(lockB?.fromSample, sec(10), "first lock start unmoved");
  assert.equal(
    lockB?.toSample,
    sec(15),
    "first lock end NOT extended into the short unlocked gap"
  );
  assert.ok(lockA2, "second lock present");
  assert.equal(
    lockA2?.fromSample,
    sec(15.5),
    "second lock start NOT pulled backward into the short unlocked gap"
  );
  assertFullCoverage(out, sec(30), ["cam-a", "cam-b", "wide"]);
});

test("validatePlan enforces maxShotMs on an arbitrary unlocked plan, not only via ruleBasedAutoPlan/autoMixPlan", () => {
  const cams = [
    { id: "cam-a", role: "speaker" as const },
    { id: "cam-b", role: "speaker" as const },
  ];
  const raw = [{ fromSample: 0, toSample: sec(60), shot: "cam-a" }];
  const out = validatePlan(raw, {
    cams,
    durationSamples: sec(60),
    settings: { maxShotMs: 10_000, minShotMs: 2000, wide: "auto" },
  });
  const maxShotSamples = ms(10_000);
  for (const span of out) {
    if (!span.locked) {
      assert.ok(
        span.toSample - span.fromSample <= maxShotSamples,
        `unlocked span ${span.fromSample}-${span.toSample} (${span.shot}) exceeds maxShotMs`
      );
    }
  }
  assertFullCoverage(out, sec(60), ["cam-a", "cam-b", "wide"]);
});

test("validatePlan's maxShotMs enforcement never splits a locked span", () => {
  const cams = [
    { id: "cam-a", role: "speaker" as const },
    { id: "cam-b", role: "speaker" as const },
  ];
  const raw = [{ fromSample: 0, toSample: sec(60), shot: "cam-a" }];
  const locked = [
    { fromSample: sec(0), toSample: sec(60), shot: "cam-a", locked: true },
  ];
  const out = validatePlan(raw, {
    cams,
    durationSamples: sec(60),
    settings: { maxShotMs: 10_000 },
    locked,
  });
  assert.equal(out.length, 1, "locked 60s span survives whole, not split");
  assert.equal(out[0]?.fromSample, 0);
  assert.equal(out[0]?.toSample, sec(60));
  assert.equal(out[0]?.locked, true);
});
