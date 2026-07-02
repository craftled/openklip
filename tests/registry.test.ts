import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  actionManifest,
  actions,
  actionTable,
  getAction,
  runAction,
} from "../src/registry.ts";

// Same hand-written fixture shape the actions tests use: 6 words over 6 seconds,
// one b-roll asset and one still asset, no ffmpeg, no ingest.
function makeProject(): Project {
  const sec = (n: number) => n * SAMPLE_RATE;
  return {
    version: 1,
    slug: "test",
    source: "/tmp/test.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: sec(6),
    padMs: 0,
    captions: { enabled: true, maxWords: 6, style: "boxed" },
    assets: [
      {
        id: "broll-1",
        kind: "broll",
        name: "broll.mp4",
        src: "/tmp/broll.mp4",
        proxy: "assets/broll-1.mp4",
        durationSamples: sec(10),
      },
      {
        id: "still-1",
        kind: "still",
        name: "still.png",
        src: "/tmp/still.png",
        proxy: "assets/still-1.png",
        durationSamples: sec(0),
      },
      {
        id: "music-1",
        kind: "music",
        name: "bed.mp3",
        src: "/tmp/bed.mp3",
        proxy: "assets/music-1.aac",
        durationSamples: sec(10),
      },
    ],
    broll: [],
    titles: [],
    stills: [],
    zooms: [],
    look: { vignette: false },
    words: Array.from({ length: 6 }, (_, i) => ({
      id: `w${i}`,
      text: `word${i}`,
      startSample: sec(i),
      endSample: sec(i + 1),
      deleted: false,
    })),
  };
}

// The registry must cover every project.json mutation the capability map
// documents. This list is the contract: each surfaces through one named action.
const EXPECTED = [
  "cut",
  "cut-text",
  "restore-all",
  "broll-add",
  "broll-set",
  "broll-rm",
  "music-add",
  "music-set",
  "music-rm",
  "still-add",
  "still-set",
  "still-rm",
  "title-add",
  "title-set",
  "title-rm",
  "zoom-add",
  "zoom-set",
  "zoom-rm",
  "graphic-add",
  "graphic-set",
  "json-graphic-add",
  "json-graphic-set",
  "graphic-rm",
  "captions",
  "captions-max",
  "captions-style",
  "pad",
  "cuts-snap",
  "dead-air-add",
  "dead-air-rm",
  "audio",
  "look-vignette",
  "reorder",
  "reanchor",
  "word-text",
];

test("registry covers every documented mutation by name", () => {
  const names = new Set(actions.map((a) => a.name));
  for (const name of EXPECTED) {
    assert.ok(names.has(name), `missing action: ${name}`);
  }
});

test("assemble is NOT a registry action (it is a query/ffmpeg tool)", () => {
  // Multi-take assembly touches takes/ + ffmpeg like export/verify, so it lives
  // in agent-tools queryTools, never as a project.json mutation in the registry.
  const names = new Set(actions.map((a) => a.name));
  assert.equal(names.has("assemble"), false);
});

test("every action declares summary, schema, and at least one surface", () => {
  for (const a of actions) {
    assert.ok(a.summary.length > 0, `${a.name} has no summary`);
    assert.ok(a.schema, `${a.name} has no schema`);
    assert.ok(a.surfaces.length > 0, `${a.name} exposes no surface`);
  }
});

test("getAction resolves known names and rejects unknown", () => {
  assert.equal(getAction("broll-add")?.name, "broll-add");
  assert.equal(getAction("nope"), undefined);
});

test("runAction on unknown name throws", () => {
  assert.throws(() => runAction("nope", makeProject(), {}), /unknown action/i);
});

test("runAction wraps schema failures in a concise, field-tagged message", () => {
  const p = makeProject();
  let msg = "";
  try {
    runAction("reorder", p, { track: "bogus", id: "x", toIndex: 0 });
  } catch (e) {
    msg = (e as Error).message;
  }
  assert.match(msg, /reorder/, "names the action");
  assert.match(msg, /track/, "names the offending field");
  // Not a raw ZodError JSON dump.
  assert.doesNotMatch(msg, /\[\s*\{/);
});

test("broll-add: valid input mutates project and returns the item", () => {
  const p = makeProject();
  const item = runAction("broll-add", p, {
    assetId: "broll-1",
    fromSec: 1,
    toSec: 3,
  }) as { id: string; assetId: string };
  assert.equal(p.broll.length, 1);
  assert.equal(item.assetId, "broll-1");
  assert.match(item.id, /^br/);
});

test("broll-add: rejects negative seconds (primitive owns the bound)", () => {
  const p = makeProject();
  assert.throws(() =>
    runAction("broll-add", p, { assetId: "broll-1", fromSec: -1, toSec: 3 })
  );
  assert.equal(p.broll.length, 0);
});

test("broll-add: rejects NaN seconds (schema owns the shape)", () => {
  const p = makeProject();
  assert.throws(() =>
    runAction("broll-add", p, {
      assetId: "broll-1",
      fromSec: Number.NaN,
      toSec: 3,
    })
  );
  assert.equal(p.broll.length, 0);
});

// ── MILESTONE 4.1: music placement through the registry ─────────────────────

test("music-add: valid input mutates project and returns the placement", () => {
  const p = makeProject();
  const item = runAction("music-add", p, {
    assetId: "music-1",
    fromSec: 1,
    toSec: 3,
    gain: 0.5,
  }) as { id: string; assetId: string; gain: number; mode: string };
  assert.equal(p.music?.length, 1);
  assert.equal(item.assetId, "music-1");
  assert.equal(item.gain, 0.5);
  assert.equal(item.mode, "trim");
  assert.match(item.id, /^m/);
});

test("music-add: rejects out-of-range gain (primitive owns the bound)", () => {
  const p = makeProject();
  assert.throws(() =>
    runAction("music-add", p, {
      assetId: "music-1",
      fromSec: 0,
      toSec: 2,
      gain: 5,
    })
  );
  assert.equal(p.music?.length ?? 0, 0);
});

test("music-set: patches gain and mode through the registry", () => {
  const p = makeProject();
  const added = runAction("music-add", p, {
    assetId: "music-1",
    fromSec: 0,
    toSec: 2,
  }) as { id: string };
  const updated = runAction("music-set", p, {
    id: added.id,
    gain: 0.3,
    mode: "loop",
  }) as { gain: number; mode: string };
  assert.equal(updated.gain, 0.3);
  assert.equal(updated.mode, "loop");
  assert.equal(p.music?.[0].gain, 0.3);
});

test("music-rm: removes by id and reports removed:false on unknown id", () => {
  const p = makeProject();
  const added = runAction("music-add", p, {
    assetId: "music-1",
    fromSec: 0,
    toSec: 2,
  }) as { id: string };
  const missing = runAction("music-rm", p, { id: "nope" }) as {
    removed: boolean;
  };
  assert.equal(missing.removed, false);
  const removed = runAction("music-rm", p, { id: added.id }) as {
    removed: boolean;
  };
  assert.equal(removed.removed, true);
  assert.equal(p.music?.length, 0);
});

test("music-add manifest is exposed to mcp with fade and mode fields", () => {
  const entry = actionManifest("mcp").find((m) => m.name === "music-add");
  assert.ok(entry, "music-add not exposed to mcp");
  assert.equal(entry?.inputSchema.type, "object");
  assert.ok(entry?.inputSchema.properties.gain, "gain missing from schema");
  assert.ok(
    entry?.inputSchema.properties.fadeInSec,
    "fadeInSec missing from schema"
  );
  assert.ok(entry?.inputSchema.properties.mode, "mode missing from schema");
});

test("zoom-add: rejects out-of-range scale (primitive owns the bound)", () => {
  const p = makeProject();
  assert.throws(() =>
    runAction("zoom-add", p, { fromSec: 1, toSec: 2, scale: 5 })
  );
  assert.equal(p.zooms?.length ?? 0, 0);
});

test("cut: marks the given ids deleted", () => {
  const p = makeProject();
  runAction("cut", p, { ids: ["w0", "w1"] });
  assert.equal(p.words.filter((w) => w.deleted).length, 2);
});

test("cut-text: cuts the first matching run", () => {
  const p = makeProject();
  const r = runAction("cut-text", p, { phrase: "word2" }) as {
    matched: boolean;
    ids: string[];
  };
  assert.equal(r.matched, true);
  assert.deepEqual(r.ids, ["w2"]);
});

test("cuts-snap: stores VAD snap settings in project JSON", () => {
  const p = makeProject();
  const r = runAction("cuts-snap", p, {
    enabled: true,
    mode: "vad",
    maxShiftMs: 140.4,
    crossfadeMs: 31.6,
  }) as {
    snap: {
      enabled: boolean;
      mode: string;
      maxShiftMs: number;
      crossfadeMs: number;
    };
  };
  assert.deepEqual(r.snap, {
    enabled: true,
    mode: "vad",
    maxShiftMs: 140,
    crossfadeMs: 32,
  });
  assert.deepEqual(p.cuts.snap, r.snap);
});

test("audio: stores export audio quality settings, clamped, in project JSON", () => {
  const p = makeProject();
  const r = runAction("audio", p, {
    ducking: { enabled: true, amountDb: 999 },
    loudness: { enabled: true, targetLufs: -14 },
  }) as { audio: Project["audio"] };
  assert.deepEqual(r.audio, {
    ducking: { enabled: true, amountDb: 30, attackMs: 25, releaseMs: 250 },
    loudness: { enabled: true, targetLufs: -14 },
    voiceHighpass: { enabled: false, hz: 80 },
  });
  assert.deepEqual(p.audio, r.audio);
});

test("word-text: corrects a word's text and round-trips originalText", () => {
  const p = makeProject();
  const first = runAction("word-text", p, { id: "w0", text: "Word Zero" }) as {
    id: string;
    text: string;
    originalText?: string;
  };
  assert.equal(first.text, "Word Zero");
  assert.equal(first.originalText, "word0");
  assert.equal(p.words[0].text, "Word Zero");

  const second = runAction("word-text", p, {
    id: "w0",
    text: "Word Zero!!",
  }) as { id: string; text: string; originalText?: string };
  assert.equal(second.originalText, "word0");
});

test("word-text: rejects empty text (primitive owns the bound)", () => {
  const p = makeProject();
  assert.throws(() => runAction("word-text", p, { id: "w0", text: "   " }));
});

test("word-text: rejects an unknown word id", () => {
  const p = makeProject();
  assert.throws(() => runAction("word-text", p, { id: "nope", text: "hi" }));
});

test("captions-style: sets a valid preset id and surfaces to cli/gui/mcp", () => {
  const p = makeProject();
  const action = getAction("captions-style");
  assert.ok(action);
  assert.deepEqual(action?.surfaces, ["cli", "gui", "mcp"]);
  const result = runAction("captions-style", p, { style: "clean" }) as {
    style: string;
  };
  assert.equal(result.style, "clean");
  assert.equal(p.captions.style, "clean");
});

test("captions-style: rejects an unknown style id", () => {
  const p = makeProject();
  assert.throws(() => runAction("captions-style", p, { style: "not-a-style" }));
});

test("reorder: restacks within a track", () => {
  const p = makeProject();
  const a = runAction("broll-add", p, {
    assetId: "broll-1",
    fromSec: 0,
    toSec: 1,
  }) as {
    id: string;
  };
  const b = runAction("broll-add", p, {
    assetId: "broll-1",
    fromSec: 2,
    toSec: 3,
  }) as {
    id: string;
  };
  runAction("reorder", p, { track: "broll", id: b.id, toIndex: 0 });
  assert.deepEqual(
    p.broll.map((x) => x.id),
    [b.id, a.id]
  );
});

test("actionManifest exposes JSON-schema input per action and filters by surface", () => {
  const all = actionManifest();
  assert.equal(all.length, actions.length);
  const brollAdd = all.find((m) => m.name === "broll-add");
  assert.ok(brollAdd, "broll-add missing from manifest");
  // The Zod schema is rendered to JSON Schema : the MCP inputSchema seam.
  assert.equal(brollAdd?.inputSchema.type, "object");
  assert.ok(brollAdd?.inputSchema.properties.assetId, "assetId not in schema");

  const mcp = actionManifest("mcp");
  assert.ok(mcp.length > 0, "no actions exposed to mcp");
  assert.ok(mcp.every((m) => m.surfaces.includes("mcp")));
});

test("graphic-add: places a bundled template and fills manifest defaults", () => {
  const p = makeProject();
  const item = runAction("graphic-add", p, {
    template: "lower-third",
    fromSec: 1,
    toSec: 3,
  }) as {
    id: string;
    template: string;
    params: Record<string, unknown>;
    track: string;
  };
  assert.equal(p.graphics?.length, 1);
  assert.equal(item.template, "lower-third");
  assert.match(item.id, /^g/);
  assert.equal(item.track, "title");
  // Manifest declares `title` default "Name"; addGraphic seeds it.
  assert.equal(item.params.title, "Name");
});

test("graphic-add: caller params win over manifest defaults", () => {
  const p = makeProject();
  const item = runAction("graphic-add", p, {
    template: "lower-third",
    fromSec: 0,
    toSec: 2,
    params: { title: "Custom" },
  }) as { params: Record<string, unknown> };
  assert.equal(item.params.title, "Custom");
});

test("graphic-add: rejects an unknown template with the catalog listed", () => {
  const p = makeProject();
  let msg = "";
  try {
    runAction("graphic-add", p, { template: "nope", fromSec: 0, toSec: 2 });
  } catch (e) {
    msg = (e as Error).message;
  }
  assert.match(msg, /unknown graphic template/i);
  assert.match(msg, /Available:/);
  assert.equal(p.graphics?.length ?? 0, 0);
});

test("graphic-add: rejects an empty span (primitive owns the bound)", () => {
  const p = makeProject();
  assert.throws(() =>
    runAction("graphic-add", p, {
      template: "lower-third",
      fromSec: 3,
      toSec: 1,
    })
  );
  assert.equal(p.graphics?.length ?? 0, 0);
});

test("graphic-set: merges params over the existing record", () => {
  const p = makeProject();
  const added = runAction("graphic-add", p, {
    template: "lower-third",
    fromSec: 0,
    toSec: 2,
    params: { title: "A", subtitle: "B" },
  }) as { id: string };
  const updated = runAction("graphic-set", p, {
    id: added.id,
    params: { subtitle: "C" },
  }) as { params: Record<string, unknown> };
  assert.equal(updated.params.title, "A", "untouched param kept");
  assert.equal(updated.params.subtitle, "C", "patched param updated");
});

test("graphic-rm: removes by id and reports removed", () => {
  const p = makeProject();
  const added = runAction("graphic-add", p, {
    template: "lower-third",
    fromSec: 0,
    toSec: 2,
  }) as { id: string };
  const res = runAction("graphic-rm", p, { id: added.id }) as {
    removed: boolean;
  };
  assert.equal(res.removed, true);
  assert.equal(p.graphics?.length, 0);
});

test("graphic-add manifest renders params record to JSON Schema for MCP", () => {
  const entry = actionManifest("mcp").find((m) => m.name === "graphic-add");
  assert.ok(entry, "graphic-add not exposed to mcp");
  assert.equal(entry?.inputSchema.type, "object");
  // The z.record(union) params field must survive z.toJSONSchema() so MCP tool
  // registration does not throw at runtime.
  assert.ok(entry?.inputSchema.properties.params, "params missing from schema");
});

test("actionTable renders a markdown row for each action", () => {
  const md = actionTable();
  assert.match(md, /\| *Action *\|/);
  for (const a of actions) {
    assert.ok(md.includes(a.name), `table missing ${a.name}`);
  }
});

// ── FEATURE 1: written rationale (note) through the registry ─────────────────

test("broll-add: carries display pip onto the overlay", () => {
  const p = makeProject();
  const item = runAction("broll-add", p, {
    assetId: "broll-1",
    fromSec: 0,
    toSec: 2,
    display: "pip",
  }) as { display: string };
  assert.equal(item.display, "pip");
  assert.equal(p.broll[0]?.display, "pip");
});

test("broll-add: carries audioMode mix onto the overlay", () => {
  const p = makeProject();
  const item = runAction("broll-add", p, {
    assetId: "broll-1",
    fromSec: 0,
    toSec: 2,
    audioMode: "mix",
  }) as { audioMode: string };
  assert.equal(item.audioMode, "mix");
  assert.equal(p.broll[0]?.audioMode, "mix");
});

test("broll-add: carries an optional note onto the overlay", () => {
  const p = makeProject();
  runAction("broll-add", p, {
    assetId: "broll-1",
    fromSec: 1,
    toSec: 3,
    note: "n",
  });
  assert.equal(p.broll[0].note, "n");
});

test("cut: carries an optional note onto the cut word", () => {
  const p = makeProject();
  runAction("cut", p, { ids: ["w0"], note: "um" });
  assert.equal(p.words[0].note, "um");
  assert.equal(p.words[0].deleted, true);
});

test("cut-text: carries an optional note onto the matched words", () => {
  const p = makeProject();
  runAction("cut-text", p, { phrase: "word2", note: "filler" });
  const w = p.words.find((x) => x.id === "w2");
  assert.equal(w?.deleted, true);
  assert.equal(w?.note, "filler");
});

test("broll-add manifest exposes note as an optional property for MCP", () => {
  const entry = actionManifest("mcp").find((m) => m.name === "broll-add");
  assert.ok(entry, "broll-add not exposed to mcp");
  assert.ok(
    entry?.inputSchema.properties.note,
    "note missing from broll-add schema"
  );
});

test("cut manifest exposes note as an optional property for MCP", () => {
  const entry = actionManifest("mcp").find((m) => m.name === "cut");
  assert.ok(entry, "cut not exposed to mcp");
  assert.ok(entry?.inputSchema.properties.note, "note missing from cut schema");
});

// ── FEATURE 2: phrase-anchored cues (reanchor) through the registry ──────────

// Place an anchored title at the spoken phrase, then verify the action re-snaps.
function withAnchoredTitle(p: Project): void {
  p.titles = [
    {
      id: "t1",
      text: "Card",
      // Deliberately wrong stored span: word0 (0-1s), phrase is word2.
      startSample: 0,
      endSample: SAMPLE_RATE,
      position: "lower",
      anchor: { phrase: "word2", wordIds: [], stale: false },
    },
  ];
}

test("reanchor: re-resolves every anchored overlay from its phrase", () => {
  const p = makeProject();
  withAnchoredTitle(p);
  const results = runAction("reanchor", p, {}) as Array<{
    id: string;
    status: string;
  }>;
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "t1");
  // "word2" is the third word (2-3s); the title snaps onto it.
  assert.equal(p.titles?.[0].startSample, 2 * SAMPLE_RATE);
});

test("reanchor: cut-text of an anchored phrase marks the overlay stale", () => {
  const p = makeProject();
  withAnchoredTitle(p);
  // Snap first so the stored span is correct, then delete the phrase.
  runAction("reanchor", p, {});
  runAction("cut-text", p, { phrase: "word2" });
  assert.equal(p.titles?.[0].anchor?.stale, true);
});

// ── MILESTONE 3.1: UI phrase search and batch cuts ───────────────────────────

test("cut-text is exposed to the GUI surface", () => {
  const gui = actionManifest("gui");
  assert.ok(
    gui.some((m) => m.name === "cut-text"),
    "cut-text missing from gui manifest"
  );
});

test("reanchor manifest is exposed to mcp with an optional id", () => {
  const entry = actionManifest("mcp").find((m) => m.name === "reanchor");
  assert.ok(entry, "reanchor not exposed to mcp");
  assert.equal(entry?.inputSchema.type, "object");
});
