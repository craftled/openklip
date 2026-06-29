import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentToolManifest,
  agentToolNames,
  callAgentTool,
  getAgentTool,
} from "../src/agent-tools.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
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
