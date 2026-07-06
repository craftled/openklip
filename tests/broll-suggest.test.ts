import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { callAgentTool, getAgentTool } from "../src/agent-tools.ts";
import { rankBrollAssets } from "../src/broll-rank.ts";
import { suggestBroll } from "../src/broll-suggest.ts";
import type { Asset, Project } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

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

function card(
  summary: string,
  tags: string[] = [],
  bestFor: string[] = []
): Asset["card"] {
  return { summary, tags, bestFor, analyzedAt: "2026-01-01T00:00:00.000Z" };
}

function brollAsset(id: string, over: Partial<Asset> = {}): Asset {
  return {
    id,
    kind: "broll",
    name: `${id}.mp4`,
    src: `/tmp/${id}.mp4`,
    proxy: `working/assets/${id}.mp4`,
    durationSamples: SAMPLE_RATE * 8,
    ...over,
  };
}

function projectWithAssets(assets: Asset[], words?: Project["words"]): Project {
  return makeProject({
    assets,
    words: words ?? makeProject().words,
  });
}

test("rankBrollAssets prefers bestFor and tag matches over summary-only", () => {
  const project = projectWithAssets([
    brollAsset("aerial", {
      card: card("City skyline at sunset", ["urban"], ["aerial drone shot"]),
    }),
    brollAsset("office", {
      card: card(
        "Person typing at a desk near a window",
        ["office"],
        ["talking head"]
      ),
    }),
  ]);
  const result = rankBrollAssets(project, "drone aerial skyline");
  assert.equal(result.suggestions[0]?.assetId, "aerial");
  assert.ok(result.suggestions[0]?.score > (result.suggestions[1]?.score ?? 0));
  assert.ok(
    result.suggestions[0]?.reasons.some((r) => r.includes("bestFor")),
    "top pick cites bestFor"
  );
});

test("rankBrollAssets boosts mustUse and excludes avoid", () => {
  const project = projectWithAssets([
    brollAsset("weak", {
      card: card("Generic hallway walk", ["hallway"], ["transition"]),
    }),
    brollAsset("forced", {
      mustUse: true,
      card: card("Logo animation on black", ["logo"], ["intro"]),
    }),
    brollAsset("blocked", {
      avoid: true,
      card: card(
        "Stock drone over beach",
        ["drone", "beach"],
        ["b-roll cover"]
      ),
    }),
  ]);
  const result = rankBrollAssets(project, "drone beach");
  assert.deepEqual(
    result.suggestions.map((s) => s.assetId),
    ["forced"]
  );
  assert.deepEqual(result.avoided, ["blocked"]);
  assert.ok(result.suggestions[0]?.reasons.some((r) => r.includes("mustUse")));
});

test("rankBrollAssets lists uncarded b-roll and emits analyze warning", () => {
  const project = projectWithAssets([
    brollAsset("ready", {
      card: card("Coffee pour close-up", ["coffee"], ["product"]),
    }),
    brollAsset("missing-card"),
    brollAsset("music-track", { kind: "music", name: "bed.mp3" }),
    brollAsset("still-shot", {
      kind: "still",
      card: card("Product on table", ["product"], ["hero"]),
    }),
  ]);
  const result = rankBrollAssets(project, "coffee product");
  assert.deepEqual(result.uncarded, ["missing-card"]);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0]?.assetId, "ready");
  assert.match(result.warning ?? "", /analyze/i);
});

test("rankBrollAssets breaks ties by asset id", () => {
  const project = projectWithAssets([
    brollAsset("z-clip", {
      card: card("Team high five", ["team"], ["celebration"]),
    }),
    brollAsset("a-clip", {
      card: card("Team celebrating a win", ["team"], ["celebration"]),
    }),
  ]);
  const result = rankBrollAssets(project, "team celebration");
  assert.deepEqual(
    result.suggestions.map((s) => s.assetId),
    ["a-clip", "z-clip"]
  );
});

test("suggestBroll resolves --phrase text from kept words", () => {
  const project = makeProject({
    words: [
      {
        id: "w0",
        text: "We",
        startSample: 0,
        endSample: SAMPLE_RATE,
        deleted: false,
      },
      {
        id: "w1",
        text: "flew",
        startSample: SAMPLE_RATE,
        endSample: SAMPLE_RATE * 2,
        deleted: false,
      },
      {
        id: "w2",
        text: "downtown",
        startSample: SAMPLE_RATE * 2,
        endSample: SAMPLE_RATE * 3,
        deleted: false,
      },
    ],
    assets: [
      brollAsset("city", {
        card: card("Downtown skyline from above", ["city"], ["aerial"]),
      }),
      brollAsset("forest", {
        card: card("Pine trees in fog", ["nature"], ["b-roll cover"]),
      }),
    ],
  });
  const result = suggestBroll(project, { phrase: "flew downtown" });
  assert.equal(result.query, "flew downtown");
  assert.equal(result.suggestions[0]?.assetId, "city");
  assert.equal(result.phrase?.matched, true);
});

test("suggestBroll reports unmatched phrase without ranking", () => {
  const project = projectWithAssets([
    brollAsset("city", {
      card: card("Downtown skyline", ["city"], ["aerial"]),
    }),
  ]);
  const result = suggestBroll(project, { phrase: "no such phrase here" });
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.phrase?.matched, false);
  assert.match(result.warning ?? "", /no match/i);
});

test("callAgentTool broll_suggest ranks from phrase", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: [
          {
            id: "w0",
            text: "Launch",
            startSample: 0,
            endSample: SAMPLE_RATE,
            deleted: false,
          },
          {
            id: "w1",
            text: "day",
            startSample: SAMPLE_RATE,
            endSample: SAMPLE_RATE * 2,
            deleted: false,
          },
        ],
        assets: [
          brollAsset("rocket", {
            card: card(
              "Rocket lifting off",
              ["rocket", "launch"],
              ["product launch"]
            ),
          }),
        ],
      })
    );
    const result = (await callAgentTool("broll_suggest", {
      slug,
      phrase: "launch day",
      top: 3,
    })) as { suggestions: Array<{ assetId: string }> };
    assert.equal(result.suggestions[0]?.assetId, "rocket");
  });
});

test("getAgentTool exposes broll_suggest on mcp surface", () => {
  const tool = getAgentTool("broll_suggest");
  assert.ok(tool);
  assert.ok(tool?.surfaces.includes("mcp"));
});

test("callAgentTool broll_suggest rejects missing text and phrase", async () => {
  await assert.rejects(
    () => callAgentTool("broll_suggest", { slug: "demo", top: 3 }),
    /exactly one of text or phrase/
  );
});

test("CLI broll-suggest --text returns ranked asset id", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        assets: [
          brollAsset("harbor", {
            card: card(
              "Sailboats in the harbor at golden hour",
              ["harbor"],
              ["travel b-roll"]
            ),
          }),
        ],
      })
    );
    const r = await runCli([
      "broll-suggest",
      slug,
      "--text",
      "harbor sailboats",
      "--json",
    ]);
    assert.equal(r.code, 0);
    const json = JSON.parse(r.out) as {
      suggestions: Array<{ assetId: string }>;
    };
    assert.equal(json.suggestions[0]?.assetId, "harbor");
  });
});
