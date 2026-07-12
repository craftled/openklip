import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoMixPlan,
  buildAutoMixPrompt,
  type AutoMixContext,
  parseAutoMixReply,
} from "../src/cam-automix.ts";
import {
  DEFAULT_CAM_SWITCH_SETTINGS,
  type PlanSpan,
  ruleBasedAutoPlan,
  validatePlan,
} from "../src/cam-plan.ts";
import { SAMPLE_RATE } from "../src/edl.ts";

const ms = (n: number) => Math.round((n / 1000) * SAMPLE_RATE);
const sec = (n: number) => Math.round(n * SAMPLE_RATE);

const SPEAKER_A = {
  id: "cam-a",
  name: "Alice",
  role: "speaker" as const,
};
const SPEAKER_B = {
  id: "cam-b",
  name: "Bob",
  role: "speaker" as const,
};
const WIDE_CAM = {
  id: "wide-cam",
  name: "Wide angle",
  role: "wide" as const,
};
const DEFAULT_CAMS = [SPEAKER_A, SPEAKER_B, WIDE_CAM];

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

function makeBaseContext(
  overrides: Partial<AutoMixContext> = {}
): AutoMixContext {
  const durationSamples = sec(30);
  return {
    cams: DEFAULT_CAMS,
    durationSamples,
    words: [
      {
        id: "w0",
        text: "Hello",
        startSample: 0,
        endSample: sec(2),
      },
      {
        id: "w1",
        text: "world.",
        startSample: sec(2),
        endSample: sec(4),
      },
      {
        id: "w2",
        text: "How",
        startSample: sec(10),
        endSample: sec(11),
      },
      {
        id: "w3",
        text: "are",
        startSample: sec(11),
        endSample: sec(12),
      },
      {
        id: "w4",
        text: "you?",
        startSample: sec(12),
        endSample: sec(14),
      },
    ],
    attributions: [
      { wordId: "w0", camId: "cam-a" },
      { wordId: "w1", camId: "cam-a" },
      { wordId: "w2", camId: "cam-b" },
      { wordId: "w3", camId: "cam-b" },
      { wordId: "w4", camId: "cam-b" },
    ],
    spans: [
      { camId: "cam-a", fromSample: 0, toSample: sec(8) },
      { camId: "cam-b", fromSample: sec(10), toSample: sec(20) },
    ],
    settings: DEFAULT_CAM_SWITCH_SETTINGS,
    ...overrides,
  };
}

// ── buildAutoMixPrompt ──────────────────────────────────────────────────────

test("buildAutoMixPrompt includes cast, wide, guardrails, schema, JSON-only", () => {
  const ctx = makeBaseContext({
    settings: { minShotMs: 1500, maxShotMs: 20_000, interjectionMs: 600 },
  });
  const prompt = buildAutoMixPrompt(ctx);

  assert.match(prompt, /Alice/);
  assert.match(prompt, /Bob/);
  assert.match(prompt, /cam-a/);
  assert.match(prompt, /cam-b/);
  assert.match(prompt, /wide/i);
  assert.match(prompt, /1500/);
  assert.match(prompt, /20,?000|20000/);
  assert.match(prompt, /600/);
  assert.match(prompt, /"spans"/);
  assert.match(prompt, /fromSec/);
  assert.match(prompt, /toSec/);
  assert.match(prompt, /shot/);
  assert.match(prompt, /JSON only/i);
  assert.match(prompt, /\{"spans":\[\]\}/);
});

test("buildAutoMixPrompt includes speaker-labeled transcript with seconds", () => {
  const prompt = buildAutoMixPrompt(makeBaseContext());
  assert.match(prompt, /Alice/);
  assert.match(prompt, /0\.0/);
  assert.match(prompt, /Hello/);
});

test("buildAutoMixPrompt includes speaking-span timeline in seconds", () => {
  const prompt = buildAutoMixPrompt(makeBaseContext());
  assert.match(prompt, /cam-a.*0\.0.*8\.0|0\.0-8\.0s.*cam-a/i);
  assert.match(prompt, /cam-b.*10\.0.*20\.0|10\.0-20\.0s.*cam-b/i);
});

test("buildAutoMixPrompt caps transcript excerpt at ~6000 chars", () => {
  const longWord = "x".repeat(80);
  const words = Array.from({ length: 200 }, (_, i) => ({
    id: `w${i}`,
    text: longWord,
    startSample: sec(i * 0.5),
    endSample: sec(i * 0.5 + 0.4),
  }));
  const attributions = words.map((w, i) => ({
    wordId: w.id,
    camId: i % 2 === 0 ? "cam-a" : "cam-b",
  }));
  const prompt = buildAutoMixPrompt(
    makeBaseContext({
      words,
      attributions,
      durationSamples: sec(120),
    })
  );
  const excerptMatch = prompt.match(/"""([\s\S]*?)"""/);
  assert.ok(excerptMatch, "transcript excerpt block present");
  const excerpt = excerptMatch[1];
  assert.ok(excerpt.length <= 6100, `excerpt too long: ${excerpt.length}`);
  assert.match(excerpt, /truncated/);
});

// ── parseAutoMixReply ───────────────────────────────────────────────────────

test("parseAutoMixReply parses clean JSON and converts seconds to samples", () => {
  const spans = parseAutoMixReply(
    '{"spans":[{"fromSec":0,"toSec":12.5,"shot":"cam-a","reason":"opening"}]}',
    { durationSamples: sec(30) }
  );
  assert.equal(spans.length, 1);
  assert.equal(spans[0].fromSample, 0);
  assert.equal(spans[0].toSample, 600_000);
  assert.equal(spans[0].shot, "cam-a");
  assert.equal(spans[0].reason, "opening");
});

test("parseAutoMixReply recovers fenced JSON", () => {
  const spans = parseAutoMixReply(
    '```json\n{"spans":[{"fromSec":0,"toSec":5,"shot":"cam-b"}]}\n```',
    { durationSamples: sec(10) }
  );
  assert.equal(spans.length, 1);
  assert.equal(spans[0].shot, "cam-b");
  assert.equal(spans[0].toSample, sec(5));
});

test("parseAutoMixReply recovers JSON with leading prose", () => {
  const spans = parseAutoMixReply(
    'Here is the plan:\n{"spans":[{"fromSec":1,"toSec":4,"shot":"wide"}]}',
    { durationSamples: sec(10) }
  );
  assert.equal(spans.length, 1);
  assert.equal(spans[0].shot, "wide");
});

test("parseAutoMixReply returns [] on garbage", () => {
  assert.deepEqual(parseAutoMixReply("not json", { durationSamples: sec(10) }), []);
  assert.deepEqual(
    parseAutoMixReply('{"spans":[]}', { durationSamples: sec(10) }),
    []
  );
});

test("parseAutoMixReply drops inverted and non-numeric spans", () => {
  const spans = parseAutoMixReply(
    '{"spans":[{"fromSec":5,"toSec":3,"shot":"cam-a"},{"fromSec":"bad","toSec":4,"shot":"cam-b"},{"fromSec":0,"toSec":5,"shot":"cam-a"}]}',
    { durationSamples: sec(10) }
  );
  assert.equal(spans.length, 1);
  assert.equal(spans[0].shot, "cam-a");
});

// ── autoMixPlan (injected runText) ──────────────────────────────────────────

test("autoMixPlan: valid reply yields agent plan with full coverage", async () => {
  const ctx = makeBaseContext();
  const duration = ctx.durationSamples;
  let called = false;
  const result = await autoMixPlan(ctx, {
    agent: "claude-opus-4-8",
    runText: async () => {
      called = true;
      return JSON.stringify({
        spans: [
          { fromSec: 0, toSec: 15, shot: "cam-a", reason: "Alice opens" },
          { fromSec: 15, toSec: 30, shot: "cam-b", reason: "Bob responds" },
        ],
      });
    },
  });

  assert.equal(called, true);
  assert.equal(result.fallback, false);
  assert.equal(result.plannedBy, "claude-opus-4-8");
  assert.ok(result.raw);
  assertFullCoverage(result.plan, duration, ["cam-a", "cam-b", "wide"]);
  assertMinShotLength(result.plan, DEFAULT_CAM_SWITCH_SETTINGS.minShotMs);
});

test("autoMixPlan: unknown cam ids and gaps filled via rules fallback", async () => {
  const ctx = makeBaseContext();
  const duration = ctx.durationSamples;
  const rules = ruleBasedAutoPlan(ctx.spans, {
    cams: ctx.cams.map(({ id, role }) => ({ id, role })),
    durationSamples: duration,
    settings: ctx.settings,
  });

  const result = await autoMixPlan(ctx, {
    agent: "claude-sonnet-4-6",
    runText: async () =>
      JSON.stringify({
        spans: [
          { fromSec: 0, toSec: 5, shot: "unknown-cam" },
          { fromSec: 20, toSec: 25, shot: "cam-b" },
        ],
      }),
  });

  assert.equal(result.fallback, false);
  assertFullCoverage(result.plan, duration, ["cam-a", "cam-b", "wide"]);
  assertMinShotLength(result.plan, DEFAULT_CAM_SWITCH_SETTINGS.minShotMs);
  assert.ok(!result.plan.some((s) => s.shot === "unknown-cam"));
  const validatedRules = validatePlan(rules, {
    cams: ctx.cams.map(({ id, role }) => ({ id, role })),
    durationSamples: duration,
    settings: ctx.settings,
    fallback: rules,
  });
  assert.notDeepEqual(result.plan, validatedRules);
});

test("autoMixPlan: empty spans reply falls back to rules", async () => {
  const ctx = makeBaseContext();
  const rules = ruleBasedAutoPlan(ctx.spans, {
    cams: ctx.cams.map(({ id, role }) => ({ id, role })),
    durationSamples: ctx.durationSamples,
    settings: ctx.settings,
  });
  const expected = validatePlan(rules, {
    cams: ctx.cams.map(({ id, role }) => ({ id, role })),
    durationSamples: ctx.durationSamples,
    settings: ctx.settings,
    fallback: rules,
  });

  const result = await autoMixPlan(ctx, {
    agent: "claude-opus-4-8",
    runText: async () => '{"spans":[]}',
  });

  assert.equal(result.fallback, true);
  assert.equal(result.plannedBy, "rules");
  assert.equal(result.raw, undefined);
  assert.deepEqual(result.plan, expected);
});

test("autoMixPlan: runText throw falls back to rules", async () => {
  const ctx = makeBaseContext();
  const rules = ruleBasedAutoPlan(ctx.spans, {
    cams: ctx.cams.map(({ id, role }) => ({ id, role })),
    durationSamples: ctx.durationSamples,
    settings: ctx.settings,
  });
  const expected = validatePlan(rules, {
    cams: ctx.cams.map(({ id, role }) => ({ id, role })),
    durationSamples: ctx.durationSamples,
    settings: ctx.settings,
    fallback: rules,
  });

  const result = await autoMixPlan(ctx, {
    agent: "claude-opus-4-8",
    runText: async () => {
      throw new Error("agent CLI failed");
    },
  });

  assert.equal(result.fallback, true);
  assert.equal(result.plannedBy, "rules");
  assert.deepEqual(result.plan, expected);
});

test("autoMixPlan: rejected runText promise falls back to rules", async () => {
  const ctx = makeBaseContext();
  const result = await autoMixPlan(ctx, {
    agent: "claude-opus-4-8",
    runText: async () => Promise.reject(new Error("timeout")),
  });

  assert.equal(result.fallback, true);
  assert.equal(result.plannedBy, "rules");
  assertFullCoverage(result.plan, ctx.durationSamples, [
    "cam-a",
    "cam-b",
    "wide",
  ]);
});

test("autoMixPlan: no agent and no runText falls back without calling", async () => {
  const ctx = makeBaseContext();
  const result = await autoMixPlan(ctx, {});
  assert.equal(result.fallback, true);
  assert.equal(result.plannedBy, "rules");
  assertFullCoverage(result.plan, ctx.durationSamples, [
    "cam-a",
    "cam-b",
    "wide",
  ]);
});

test("autoMixPlan: same ctx and canned reply is deterministic", async () => {
  const ctx = makeBaseContext();
  const canned = JSON.stringify({
    spans: [
      { fromSec: 0, toSec: 10, shot: "cam-a" },
      { fromSec: 10, toSec: 20, shot: "wide" },
      { fromSec: 20, toSec: 30, shot: "cam-b" },
    ],
  });
  const runText = async () => canned;

  const a = await autoMixPlan(ctx, { agent: "claude-opus-4-8", runText });
  const b = await autoMixPlan(ctx, { agent: "claude-opus-4-8", runText });

  assert.deepEqual(a.plan, b.plan);
  assert.equal(a.fallback, b.fallback);
  assert.equal(a.plannedBy, b.plannedBy);
});