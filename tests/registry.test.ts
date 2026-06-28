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
    captions: { enabled: true, maxWords: 6 },
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
  "still-add",
  "still-set",
  "still-rm",
  "title-add",
  "title-set",
  "title-rm",
  "zoom-add",
  "zoom-set",
  "zoom-rm",
  "captions",
  "captions-max",
  "pad",
  "look-vignette",
  "reorder",
];

test("registry covers every documented mutation by name", () => {
  const names = new Set(actions.map((a) => a.name));
  for (const name of EXPECTED) {
    assert.ok(names.has(name), `missing action: ${name}`);
  }
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

test("actionTable renders a markdown row for each action", () => {
  const md = actionTable();
  assert.match(md, /\| *Action *\|/);
  for (const a of actions) {
    assert.ok(md.includes(a.name), `table missing ${a.name}`);
  }
});
