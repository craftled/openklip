import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCallInput, parseCallJson, runCallTool } from "../src/call-cli.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("parseCallJson accepts object and rejects non-object", () => {
  assert.deepEqual(parseCallJson('{"a":1}', "--json"), { a: 1 });
  assert.deepEqual(parseCallJson("", "--json"), {});
  assert.throws(() => parseCallJson("[]", "--json"), /must be a JSON object/);
  assert.throws(() => parseCallJson("{bad", "--json"), /invalid JSON/);
});

test("buildCallInput merges --slug over json body", () => {
  assert.deepEqual(
    buildCallInput({ json: '{"slug":"old","phrase":"hi"}', slug: "new" }),
    { slug: "new", phrase: "hi" }
  );
  assert.deepEqual(buildCallInput({ json: '{"phrase":"hi"}' }), {
    phrase: "hi",
  });
});

test("buildCallInput prefers --stdin over --json", () => {
  assert.deepEqual(
    buildCallInput({
      json: '{"ignored":true}',
      stdinJson: '{"phrase":"from stdin"}',
      slug: "demo",
    }),
    { phrase: "from stdin", slug: "demo" }
  );
});

test("runCallTool project_status returns JSON shape", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = (await runCallTool("project_status", { slug })) as {
      slug: string;
      words: { total: number };
    };
    assert.equal(result.slug, slug);
    assert.ok(result.words.total >= 0);
  });
});

test("runCallTool transcript_grep finds a phrase", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: [
          {
            id: "w0",
            text: "hello",
            startSample: 0,
            endSample: SAMPLE_RATE,
            deleted: false,
          },
        ],
        durationSamples: SAMPLE_RATE,
      })
    );
    const result = (await runCallTool("transcript_grep", {
      slug,
      phrase: "hello",
    })) as { matches: unknown[] };
    assert.equal(result.matches.length, 1);
  });
});

test("runCallTool rejects unknown tool name", async () => {
  await assert.rejects(
    () => runCallTool("not-a-real-tool", {}),
    /unknown agent tool/
  );
});
