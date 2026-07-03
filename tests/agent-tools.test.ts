import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readActionLog } from "../src/action-log.ts";
import {
  createAgentTask,
  getAgentTask,
  resetAgentTaskIdSequenceForTests,
} from "../src/agent-tasks.ts";
import {
  agentToolManifest,
  agentToolNames,
  callAgentTool,
  getAgentTool,
} from "../src/agent-tools.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { FFMPEG, run } from "../src/ffmpeg.ts";
import { projectPaths } from "../src/paths.ts";
import { actions } from "../src/registry.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("agentToolManifest includes query tools and registry mutations", () => {
  const names = agentToolNames("mcp");
  assert.ok(names.includes("list_projects"));
  assert.ok(names.includes("transcript_grep"));
  assert.ok(names.includes("project_status"));
  assert.ok(names.includes("cut"));
  assert.ok(names.includes("broll-add"));
  assert.ok(names.includes("json-graphic-add"));
  assert.ok(names.includes("json-graphic-set"));
  assert.ok(names.includes("title-add-phrase"));
  assert.ok(names.includes("export"));
  const manifest = agentToolManifest("mcp");
  assert.ok(manifest.length >= 30);
  for (const entry of manifest) {
    assert.ok(entry.name);
    assert.ok(entry.summary);
    assert.ok(entry.inputSchema);
    assert.ok(entry.surfaces.includes("mcp"));
  }
});

test("getAgentTool resolves known tools", () => {
  assert.ok(getAgentTool("cut"));
  assert.ok(getAgentTool("transcript_grep"));
  assert.equal(getAgentTool("not-a-tool"), undefined);
});

test("callAgentTool list_projects returns slugs", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = (await callAgentTool("list_projects", {})) as {
      projects: Array<{ slug: string }>;
    };
    assert.ok(result.projects.some((p) => p.slug === slug));
  });
});

test("callAgentTool transcript_grep finds phrase", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: [
          {
            id: "w0",
            text: "you",
            startSample: 0,
            endSample: SAMPLE_RATE,
            deleted: false,
          },
          {
            id: "w1",
            text: "know",
            startSample: SAMPLE_RATE,
            endSample: SAMPLE_RATE * 2,
            deleted: false,
          },
        ],
        durationSamples: SAMPLE_RATE * 2,
      })
    );
    const result = (await callAgentTool("transcript_grep", {
      slug,
      phrase: "you know",
    })) as { matches: Array<{ ids: string[] }> };
    assert.equal(result.matches.length, 1);
    assert.deepEqual(result.matches[0].ids, ["w0", "w1"]);
  });
});

test("callAgentTool cut mutates project via registry", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    const status = (await callAgentTool("project_status", { slug })) as {
      words: { deleted: number };
    };
    assert.equal(status.words.deleted, 1);
  });
});

test("callAgentTool rejects slug outside the pinned MCP project scope", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const otherSlug = "other-fixture";
    writeFixtureProject(slug, makeProject({ slug }));
    writeFixtureProject(otherSlug, makeProject({ slug: otherSlug }));
    const previousSlug = process.env.OPENKLIP_SLUG;
    process.env.OPENKLIP_SLUG = slug;

    try {
      await assert.rejects(
        () => callAgentTool("project_status", { slug: otherSlug }),
        /scoped to project/
      );

      const projects = (await callAgentTool("list_projects", {})) as {
        projects: Array<{ slug: string }>;
      };
      assert.deepEqual(
        projects.projects.map((p) => p.slug),
        [slug]
      );
      await assert.rejects(
        () => callAgentTool("project_status", {}),
        /requires a slug/
      );

      const status = (await callAgentTool("project_status", { slug })) as {
        words: { total: number };
      };
      assert.equal(status.words.total, 2);
    } finally {
      process.env.OPENKLIP_SLUG = previousSlug;
    }
  });
});

test("callAgentTool title-add-phrase places overlay", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("title-add-phrase", {
      slug,
      spokenPhrase: "Hello world",
      text: "Jane\\nCEO",
      position: "lower",
    });
    const overlays = (await callAgentTool("project_overlays", { slug })) as {
      titles: Array<{ text: string }>;
    };
    assert.equal(overlays.titles.length, 1);
    assert.equal(overlays.titles[0].text, "Jane\nCEO");
  });
});

test("callAgentTool template_show returns skill markdown", async () => {
  const result = (await callAgentTool("template_show", {
    id: "talking-head",
  })) as { id: string; skill: string };
  assert.equal(result.id, "talking-head");
  assert.ok(result.skill.includes("talking-head") || result.skill.length > 20);
});

test("registry mcp mutations are included in agent tools", () => {
  const names = new Set(agentToolNames("mcp"));
  for (const action of actions.filter((a) => a.surfaces.includes("mcp"))) {
    assert.ok(
      names.has(action.name),
      `missing MCP tool for action ${action.name}`
    );
  }
});

test("callAgentTool rejects unknown tools", async () => {
  await assert.rejects(
    () => callAgentTool("not-a-tool", {}),
    /unknown agent tool/i
  );
});

// ── FEATURE 1: written rationale (note) surfaced to agents ──────────────────

test("callAgentTool transcript_list carries a note on a cut word", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("cut", { slug, ids: ["w0"], note: "filler" });
    const list = (await callAgentTool("transcript_list", { slug })) as {
      words: Array<{ id: string; note?: string }>;
    };
    const w0 = list.words.find((w) => w.id === "w0");
    assert.equal(w0?.note, "filler");
  });
});

test("callAgentTool broll-add-phrase forwards a note onto the overlay", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("broll-add-phrase", {
      slug,
      assetId: "broll-a",
      spokenPhrase: "Hello world",
      note: "cover the stumble",
    });
    const overlays = (await callAgentTool("project_overlays", { slug })) as {
      broll: Array<{ note?: string }>;
    };
    assert.equal(overlays.broll[0].note, "cover the stumble");
  });
});

// ── ACTION HISTORY: MCP mutations are recorded with an actor ────────────────

test("callAgentTool mutation records a history entry with actor mcp", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    delete process.env.OPENKLIP_ACTOR;
    try {
      await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "cut");
    assert.equal(entries[0].actor, "mcp");
    assert.equal(entries[0].revisionBefore, 0);
    assert.equal(entries[0].revisionAfter, 1);
  });
});

test("callAgentTool mutation records actor agent when OPENKLIP_ACTOR=agent", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    process.env.OPENKLIP_ACTOR = "agent";
    try {
      await callAgentTool("cut", { slug, ids: ["w1"], deleted: true });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].actor, "agent");
    assert.equal(entries[0].action, "cut");
  });
});

// ── FEATURE 3: multi-take assembly tools (query surface, not registry) ──────

test("multi-take tools are exposed as agent query tools", () => {
  const names = agentToolNames("mcp");
  assert.ok(names.includes("list_takes"));
  assert.ok(names.includes("take_transcript"));
  assert.ok(names.includes("assemble"));
});

test("assemble inputSchema exposes the selection segments and optional padMs", () => {
  const manifest = agentToolManifest("mcp");
  const assemble = manifest.find((m) => m.name === "assemble");
  assert.ok(assemble, "assemble tool missing from manifest");
  const schema = assemble?.inputSchema as {
    properties?: Record<
      string,
      { items?: { properties?: Record<string, unknown> } }
    >;
  };
  assert.ok(schema.properties?.slug, "assemble takes a slug");
  assert.ok(schema.properties?.padMs, "assemble takes an optional padMs");
  const segItem = schema.properties?.segments?.items?.properties;
  assert.ok(segItem?.takeId, "segments[].takeId");
  assert.ok(segItem?.startWordId, "segments[].startWordId");
  assert.ok(segItem?.endWordId, "segments[].endWordId");
});

// ── Export settings: the export tool accepts compression + fps ──────────────

test("export tool schema accepts compression and fps and rejects bad values", () => {
  const tool = getAgentTool("export");
  assert.ok(tool, "export tool missing");
  assert.equal(
    tool.schema.safeParse({ slug: "demo", compression: "web", fps: 24 })
      .success,
    true
  );
  assert.equal(
    tool.schema.safeParse({ slug: "demo", compression: "ultra" }).success,
    false
  );
  assert.equal(tool.schema.safeParse({ slug: "demo", fps: 0 }).success, false);
  // maxHeight shares the HTTP route's 8K cap on every surface.
  assert.equal(
    tool.schema.safeParse({ slug: "demo", maxHeight: 4320 }).success,
    true
  );
  assert.equal(
    tool.schema.safeParse({ slug: "demo", maxHeight: 4321 }).success,
    false
  );
});

test("export tool schema accepts a known platform and rejects an unknown one", () => {
  const tool = getAgentTool("export");
  assert.ok(tool, "export tool missing");
  assert.equal(
    tool.schema.safeParse({ slug: "demo", platform: "youtube" }).success,
    true
  );
  assert.equal(
    tool.schema.safeParse({ slug: "demo", platform: "tiktok" }).success,
    false
  );
});

test("export tool schema bounds loudnessTargetLufs to -30..-10", () => {
  const tool = getAgentTool("export");
  assert.ok(tool, "export tool missing");
  assert.equal(
    tool.schema.safeParse({ slug: "demo", loudnessTargetLufs: -14 }).success,
    true
  );
  assert.equal(
    tool.schema.safeParse({ slug: "demo", loudnessTargetLufs: -9 }).success,
    false
  );
  assert.equal(
    tool.schema.safeParse({ slug: "demo", loudnessTargetLufs: -31 }).success,
    false
  );
});

test("export tool schema accepts a known format and rejects an unknown one", () => {
  const tool = getAgentTool("export");
  assert.ok(tool, "export tool missing");
  assert.equal(
    tool.schema.safeParse({ slug: "demo", format: "gif" }).success,
    true
  );
  assert.equal(
    tool.schema.safeParse({ slug: "demo", format: "mp4" }).success,
    true
  );
  assert.equal(
    tool.schema.safeParse({ slug: "demo", format: "bogus" }).success,
    false
  );
});

const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

test("export tool threads format through to exportCut and produces a .gif (smoke)", {
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
      "ffmpeg(agent-tools-export-format-gif-clip)"
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

    const result = (await callAgentTool("export", {
      slug,
      format: "gif",
    })) as { format: string; out: string };
    assert.equal(result.format, "gif");
    assert.ok(
      result.out.endsWith(".gif"),
      `expected a .gif path, got ${result.out}`
    );
    assert.ok(existsSync(result.out), "gif file should exist");
  });
});

// ── PROJECT BRIEF: brief_get / brief_set (brief.md, not a project.json field) ─

test("brief_set then brief_get round-trip through callAgentTool", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const setResult = (await callAgentTool("brief_set", {
      slug,
      text: "Audience: founders. Goal: explain the launch.",
    })) as { saved: boolean; chars: number };
    assert.equal(setResult.saved, true);
    assert.equal(
      setResult.chars,
      "Audience: founders. Goal: explain the launch.".length
    );
    const got = (await callAgentTool("brief_get", { slug })) as {
      brief: string | null;
    };
    assert.equal(got.brief, "Audience: founders. Goal: explain the launch.");
  });
});

test("brief_get on a project with no brief returns null", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const got = (await callAgentTool("brief_get", { slug })) as {
      brief: string | null;
    };
    assert.equal(got.brief, null);
  });
});

test("brief_set rejects text over the zod max", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await assert.rejects(
      () => callAgentTool("brief_set", { slug, text: "x".repeat(20_001) }),
      /invalid input/i
    );
  });
});

test("brief_set appends a brief-set entry to the action history", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("brief_set", { slug, text: "Tone: playful." });
    const entries = await readActionLog(slug);
    const entry = entries.find((e) => e.action === "brief-set");
    assert.ok(entry, "brief-set history entry missing");
    // brief.md is not part of the EDL, so the revision does not move.
    assert.equal(entry?.revisionBefore, entry?.revisionAfter);
    assert.match(entry?.input ?? "", /chars/);
  });
});

// ── AGENT TASK PROGRESS TOOLS: task_step / task_complete ────────────────────

function withTaskId<T>(taskId: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.OPENKLIP_TASK_ID;
  process.env.OPENKLIP_TASK_ID = taskId;
  return fn().finally(() => {
    if (prev === undefined) {
      delete process.env.OPENKLIP_TASK_ID;
    } else {
      process.env.OPENKLIP_TASK_ID = prev;
    }
  });
}

test("task_step updates the active task when OPENKLIP_TASK_ID is set", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Do work" });

    await withTaskId(task.id, async () => {
      const result = (await callAgentTool("task_step", {
        slug,
        title: "Scanning transcript",
        note: "found 3 candidates",
      })) as {
        task: {
          steps: Array<{ title: string; status: string; note?: string }>;
        };
      };
      assert.equal(result.task.steps.length, 1);
      assert.equal(result.task.steps[0]?.title, "Scanning transcript");
      assert.equal(result.task.steps[0]?.status, "running");
      assert.equal(result.task.steps[0]?.note, "found 3 candidates");
    });

    const stored = await getAgentTask(slug, task.id);
    assert.equal(stored?.steps.length, 1);
  });
});

test("task_step without OPENKLIP_TASK_ID set fails with a clear message", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_TASK_ID;
    delete process.env.OPENKLIP_TASK_ID;
    try {
      await assert.rejects(
        () => callAgentTool("task_step", { slug, title: "x" }),
        /no active task for this session/i
      );
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_TASK_ID;
      } else {
        process.env.OPENKLIP_TASK_ID = prev;
      }
    }
  });
});

test("task_complete blocked without a question is a validation error", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Do work" });

    await withTaskId(task.id, async () => {
      await assert.rejects(
        () => callAgentTool("task_complete", { slug, outcome: "blocked" }),
        /question/i
      );
    });
  });
});

test("task_complete partial stores remaining work and stays completed", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Do work" });

    await withTaskId(task.id, async () => {
      const result = (await callAgentTool("task_complete", {
        slug,
        outcome: "partial",
        summary: "Cut filler",
        remaining: ["Add b-roll"],
      })) as { task: { status: string; remaining?: string[] } };
      assert.equal(result.task.status, "completed");
      assert.deepEqual(result.task.remaining, ["Add b-roll"]);
    });
  });
});

test("task_step with a MISSING task id fails with not found/already finished", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await withTaskId("no-such-task-id", async () => {
      await assert.rejects(
        () => callAgentTool("task_step", { slug, title: "x" }),
        /not found|already finished/i
      );
    });
  });
});

test("task_complete with a MISSING task id fails with not found", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await withTaskId("no-such-task-id", async () => {
      await assert.rejects(
        () => callAgentTool("task_complete", { slug, outcome: "completed" }),
        /not found|already finished/i
      );
    });
  });
});

test("task_complete called twice: the second (terminal) call is a no-op, not an error", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Do work" });

    await withTaskId(task.id, async () => {
      const first = (await callAgentTool("task_complete", {
        slug,
        outcome: "completed",
        summary: "first summary",
      })) as { task: { status: string; summary?: string } };
      assert.equal(first.task.status, "completed");
      assert.equal(first.task.summary, "first summary");

      // completeAgentTask is a terminal-safe no-op: the second call
      // succeeds (does not throw) but the ORIGINAL outcome wins.
      const second = (await callAgentTool("task_complete", {
        slug,
        outcome: "completed",
        summary: "second summary",
      })) as { task: { status: string; summary?: string } };
      assert.equal(second.task.status, "completed");
      assert.equal(second.task.summary, "first summary");
    });
  });
});

// ── cleanup_report ───────────────────────────────────────────────────────

const ANALYSIS_SR = 16_000;

function tonePcm(seconds: number, amplitude = 0.5): Float32Array {
  const n = Math.round(ANALYSIS_SR * seconds);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pcm[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / ANALYSIS_SR);
  }
  return pcm;
}

function concatPcm(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function word48(id: string, text: string, startSec: number, endSec: number) {
  return {
    id,
    text,
    startSample: Math.round(startSec * SAMPLE_RATE),
    endSample: Math.round(endSec * SAMPLE_RATE),
    deleted: false,
  };
}

test("cleanup_report: degrades to filler-only with a warning when there is no audio analysis yet", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: [word48("w0", "um", 0, 0.4), word48("w1", "hello", 0.4, 0.9)],
      })
    );
    const result = (await callAgentTool("cleanup_report", { slug })) as {
      candidates: Array<{ kind: string }>;
      deadAirCount: number;
      fillerCount: number;
      warnings: string[];
    };
    assert.equal(result.fillerCount, 1);
    assert.equal(result.deadAirCount, 0);
    assert.equal(result.candidates.length, 1);
    assert.ok(
      result.warnings.some((w) => /needs audio analysis/i.test(w)),
      `expected a degraded-mode warning, got ${JSON.stringify(result.warnings)}`
    );
  });
});

test("cleanup_report: merges filler and dead-air candidates once audio analysis is available", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: [
          word48("w0", "so", 0, 0.3),
          word48("w1", "um", 0.3, 0.7),
          word48("w2", "hello", 0.7, 1.2),
          word48("w3", "world", 3.2, 3.7),
        ],
        durationSamples: SAMPLE_RATE * 4,
      })
    );
    const pcm = concatPcm([
      tonePcm(1.2),
      new Float32Array(ANALYSIS_SR * 2),
      tonePcm(0.8),
    ]);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const result = (await callAgentTool("cleanup_report", { slug })) as {
      candidates: Array<{ kind: string }>;
      deadAirCount: number;
      fillerCount: number;
      warnings: string[];
    };
    assert.equal(result.fillerCount, 1);
    assert.equal(result.deadAirCount, 1);
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.some((c) => c.kind === "filler"));
    assert.ok(result.candidates.some((c) => c.kind === "dead-air"));
  });
});

// ── F1: project_status / project_ranges load silences when snap is enabled ─

// A single word "hello" 0-1s, real acoustic silence detected starting 40ms
// before the transcribed word boundary (tone stops at 0.96s, well inside the
// window-quantized analysis grid) - the same "silence begins slightly before
// the word boundary" shape as tests/edl.test.ts's effectiveRanges snap test,
// but exercised end to end through a real audioRaw file + loadAudioAnalysis
// instead of a hand-built SilenceSpan array.
function writeSnapFixture(slug: string): void {
  writeFixtureProject(
    slug,
    makeProject({
      slug,
      durationSamples: SAMPLE_RATE * 2,
      words: [word48("w0", "hello", 0, 1.0)],
      cuts: {
        snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 24 },
        deadAir: [],
      },
    })
  );
  const pcm = concatPcm([tonePcm(0.96), new Float32Array(ANALYSIS_SR * 0.54)]);
  writeFileSync(
    projectPaths(slug).audioRaw,
    Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  );
}

test("project_ranges: loads silences when snap is enabled, so the range end reflects the snapped (not raw padded) boundary", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeSnapFixture(slug);
    const result = (await callAgentTool("project_ranges", { slug })) as {
      ranges: Array<{ endSec: number; startSec: number }>;
    };
    assert.equal(result.ranges.length, 1);
    // Raw padded end (word end 1.0 + 50ms pad) would be 1.05; snapped end
    // pulls back onto the detected silence boundary near 0.96.
    assert.ok(
      result.ranges[0].endSec < 1.0,
      `expected a snapped range end under 1.0s, got ${result.ranges[0].endSec}`
    );
    assert.ok(
      Math.abs(result.ranges[0].endSec - 0.96) < 0.05,
      `expected the range end near the 0.96s silence boundary, got ${result.ranges[0].endSec}`
    );
  });
});

test("project_status: ranges reflect the same silence-snapped boundary as project_ranges", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeSnapFixture(slug);
    const status = (await callAgentTool("project_status", { slug })) as {
      ranges: Array<{ endSec: number; startSec: number }>;
    };
    assert.equal(status.ranges.length, 1);
    assert.ok(
      status.ranges[0].endSec < 1.0,
      `expected a snapped range end under 1.0s, got ${status.ranges[0].endSec}`
    );
  });
});

test("project_ranges: snap disabled never loads silences (call path stays robust without audio analysis)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        durationSamples: SAMPLE_RATE * 2,
        words: [word48("w0", "hello", 0, 1.0)],
      })
    );
    // No audioRaw at all: if project_ranges tried to load analysis anyway,
    // this would throw instead of falling back cleanly.
    const result = (await callAgentTool("project_ranges", { slug })) as {
      ranges: Array<{ endSec: number; startSec: number }>;
    };
    assert.equal(result.ranges.length, 1);
    assert.ok(Math.abs(result.ranges[0].endSec - 1.05) < 1e-9);
  });
});

test("agentToolManifest includes cleanup_report", () => {
  assert.ok(agentToolNames("mcp").includes("cleanup_report"));
  assert.ok(agentToolNames("cli").includes("cleanup_report"));
});

// ── ACTION HISTORY: OPENKLIP_TASK_ID threads onto logged entries ────────────

test("callAgentTool mutation records taskId when OPENKLIP_TASK_ID is set", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await withTaskId("task-abc", async () => {
      await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    });
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "cut");
    assert.equal(entries[0].taskId, "task-abc");
  });
});

test("callAgentTool mutation omits taskId when OPENKLIP_TASK_ID is not set", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_TASK_ID;
    delete process.env.OPENKLIP_TASK_ID;
    try {
      await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_TASK_ID;
      } else {
        process.env.OPENKLIP_TASK_ID = prev;
      }
    }
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].taskId, undefined);
    assert.ok(!("taskId" in entries[0]));
  });
});

test("callAgentTool title-add-phrase records taskId when OPENKLIP_TASK_ID is set", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await withTaskId("task-phrase", async () => {
      await callAgentTool("title-add-phrase", {
        slug,
        spokenPhrase: "Hello world",
        text: "Jane",
        position: "lower",
      });
    });
    const entries = await readActionLog(slug);
    const entry = entries.find((e) => e.action === "title-add-phrase");
    assert.ok(entry, "title-add-phrase history entry missing");
    assert.equal(entry?.taskId, "task-phrase");
  });
});

test("brief_set records taskId on the brief-set history entry when OPENKLIP_TASK_ID is set", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await withTaskId("task-brief", async () => {
      await callAgentTool("brief_set", { slug, text: "Tone: playful." });
    });
    const entries = await readActionLog(slug);
    const entry = entries.find((e) => e.action === "brief-set");
    assert.ok(entry, "brief-set history entry missing");
    assert.equal(entry?.taskId, "task-brief");
  });
});

// ── revert: manual mutation-style MCP tool (not a registry action) ──────────

test("revert tool is exposed on the mcp surface", () => {
  assert.ok(agentToolNames("mcp").includes("revert"));
});

test("callAgentTool revert with {to} restores an earlier revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    const result = (await callAgentTool("revert", { slug, to: 0 })) as {
      revision: number;
      restoredTo: number;
    };
    assert.equal(result.restoredTo, 0);
    assert.equal(result.revision, 2);
    const status = (await callAgentTool("project_status", { slug })) as {
      words: { deleted: number };
    };
    assert.equal(status.words.deleted, 0);
  });
});

test("callAgentTool revert rejects input with none of to/task/last set", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await assert.rejects(
      () => callAgentTool("revert", { slug }),
      /invalid input/i
    );
  });
});

test("callAgentTool revert rejects input with more than one of to/task/last set", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await assert.rejects(
      () => callAgentTool("revert", { slug, to: 0, last: true }),
      /invalid input/i
    );
  });
});

test("callAgentTool revert with {last:true} reverts the most recent logged edit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    const result = (await callAgentTool("revert", {
      slug,
      last: true,
    })) as { restoredTo: number };
    assert.equal(result.restoredTo, 0);
  });
});

test("callAgentTool revert logs an actor mcp entry and threads OPENKLIP_TASK_ID", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    await withTaskId("task-revert", async () => {
      await callAgentTool("revert", { slug, to: 0 });
    });
    const entries = await readActionLog(slug);
    assert.equal(entries[0].action, "revert");
    assert.equal(entries[0].actor, "mcp");
    assert.equal(entries[0].taskId, "task-revert");
  });
});

test("callAgentTool revert with {task, force:true} proceeds despite a later interloping edit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await withTaskId("task-mcp-1", async () => {
      await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    });
    await callAgentTool("cut", { slug, ids: ["w1"], deleted: true });

    await assert.rejects(
      () => callAgentTool("revert", { slug, task: "task-mcp-1" }),
      /force/i
    );

    const result = (await callAgentTool("revert", {
      slug,
      task: "task-mcp-1",
      force: true,
    })) as { restoredTo: number };
    assert.equal(result.restoredTo, 0);
  });
});

test("history_list returns entries newest-first with snapshot revisions", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    await callAgentTool("cut", { slug, ids: ["w1"], deleted: true });

    const result = (await callAgentTool("history_list", { slug })) as {
      entries: Array<{
        action: string;
        revisionBefore: number;
        revisionAfter: number;
      }>;
      snapshotRevisions: number[];
    };
    assert.equal(result.entries.length, 2);
    assert.equal(result.entries[0].revisionBefore, 1);
    assert.equal(result.entries[0].revisionAfter, 2);
    assert.equal(result.entries[1].revisionBefore, 0);
    assert.deepEqual(result.snapshotRevisions, [0, 1]);
  });
});

test("history_list respects limit and filters by action name", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    await callAgentTool("pad", { slug, padMs: 20 });
    await callAgentTool("cut", { slug, ids: ["w1"], deleted: true });

    const limited = (await callAgentTool("history_list", {
      slug,
      limit: 1,
    })) as { entries: Array<{ action: string }> };
    assert.equal(limited.entries.length, 1);
    assert.equal(limited.entries[0].action, "cut");

    const filtered = (await callAgentTool("history_list", {
      slug,
      action: "pad",
    })) as { entries: Array<{ action: string }> };
    assert.equal(filtered.entries.length, 1);
    assert.equal(filtered.entries[0].action, "pad");
  });
});

test("history_list filters entries by task id", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await withTaskId("task-hist-1", async () => {
      await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
    });
    await callAgentTool("cut", { slug, ids: ["w1"], deleted: true });

    const result = (await callAgentTool("history_list", {
      slug,
      task: "task-hist-1",
    })) as { entries: Array<{ taskId?: string }> };
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].taskId, "task-hist-1");
  });
});

test("history_list on a project with no history returns empty entries and snapshots", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = (await callAgentTool("history_list", { slug })) as {
      entries: unknown[];
      snapshotRevisions: number[];
    };
    assert.deepEqual(result.entries, []);
    assert.deepEqual(result.snapshotRevisions, []);
  });
});

test("history_list filters entries by actor", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    try {
      process.env.OPENKLIP_ACTOR = "agent";
      await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
      process.env.OPENKLIP_ACTOR = "human";
      await callAgentTool("cut", { slug, ids: ["w1"], deleted: true });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }

    const result = (await callAgentTool("history_list", {
      slug,
      actor: "agent",
    })) as { entries: Array<{ actor: string }> };
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].actor, "agent");
  });
});

test("history_list combines actor with task and action filters using AND semantics", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    try {
      // Same task id and action, different actors, so that --task + --action
      // alone would still match two entries. Only adding --actor narrows to
      // one, proving the actor filter is actually applied (not a no-op).
      await withTaskId("task-actor-1", async () => {
        process.env.OPENKLIP_ACTOR = "agent";
        await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });
        process.env.OPENKLIP_ACTOR = "human";
        await callAgentTool("cut", { slug, ids: ["w1"], deleted: true });
      });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }

    const result = (await callAgentTool("history_list", {
      slug,
      actor: "agent",
      task: "task-actor-1",
      action: "cut",
    })) as {
      entries: Array<{ action: string; taskId?: string; actor: string }>;
    };
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].action, "cut");
    assert.equal(result.entries[0].taskId, "task-actor-1");
    assert.equal(result.entries[0].actor, "agent");
  });
});

test("history_list actor filter matching nothing returns empty entries", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await callAgentTool("cut", { slug, ids: ["w0"], deleted: true });

    const result = (await callAgentTool("history_list", {
      slug,
      actor: "human",
    })) as { entries: unknown[] };
    assert.deepEqual(result.entries, []);
  });
});

test("task_list returns tasks newest-first", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const first = await createAgentTask(slug, { request: "First task" });
    const second = await createAgentTask(slug, { request: "Second task" });

    const result = (await callAgentTool("task_list", { slug })) as {
      tasks: Array<{ id: string; request: string }>;
    };
    assert.equal(result.tasks.length, 2);
    assert.equal(result.tasks[0].id, second.id);
    assert.equal(result.tasks[1].id, first.id);
  });
});

test("task_list respects limit and filters by status", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const first = await createAgentTask(slug, { request: "First task" });
    await withTaskId(first.id, async () => {
      await callAgentTool("task_complete", { slug, outcome: "completed" });
    });
    const second = await createAgentTask(slug, { request: "Second task" });

    const limited = (await callAgentTool("task_list", {
      slug,
      limit: 1,
    })) as { tasks: Array<{ id: string }> };
    assert.equal(limited.tasks.length, 1);
    assert.equal(limited.tasks[0].id, second.id);

    const completedOnly = (await callAgentTool("task_list", {
      slug,
      status: "completed",
    })) as { tasks: Array<{ id: string; status: string }> };
    assert.equal(completedOnly.tasks.length, 1);
    assert.equal(completedOnly.tasks[0].id, first.id);
    assert.equal(completedOnly.tasks[0].status, "completed");
  });
});
