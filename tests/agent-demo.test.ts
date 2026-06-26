import assert from "node:assert/strict";
import { test } from "node:test";
import { cutAllByText, cutByText, summarize } from "../src/actions.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { loadProject, saveProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("agent-demo flow: phrase list cuts and persists", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const sec = (n: number) => n * SAMPLE_RATE;
    const project = makeProject({
      slug,
      words: [
        {
          id: "w0",
          text: "you",
          startSample: 0,
          endSample: sec(1),
          deleted: false,
        },
        {
          id: "w1",
          text: "know",
          startSample: sec(1),
          endSample: sec(2),
          deleted: false,
        },
        {
          id: "w2",
          text: "this",
          startSample: sec(2),
          endSample: sec(3),
          deleted: false,
        },
        {
          id: "w3",
          text: "works",
          startSample: sec(3),
          endSample: sec(4),
          deleted: false,
        },
      ],
      durationSamples: sec(4),
    });
    writeFixtureProject(slug, project);

    const loaded = await loadProject(slug);
    const before = summarize(loaded);
    const result = cutByText(loaded, "you know");
    assert.equal(result.matched, true);
    await saveProject(slug, loaded);

    const saved = await loadProject(slug);
    const after = summarize(saved);
    assert.equal(after.deleted, before.deleted + 2);
    assert.ok(after.keptDurationSec < before.keptDurationSec);
  });
});

test("cutAllByText in agent loop removes repeated filler", () => {
  const sec = (n: number) => n * SAMPLE_RATE;
  const project = makeProject({
    words: [
      {
        id: "w0",
        text: "um",
        startSample: 0,
        endSample: sec(1),
        deleted: false,
      },
      {
        id: "w1",
        text: "hello",
        startSample: sec(1),
        endSample: sec(2),
        deleted: false,
      },
      {
        id: "w2",
        text: "um",
        startSample: sec(2),
        endSample: sec(3),
        deleted: false,
      },
      {
        id: "w3",
        text: "world",
        startSample: sec(3),
        endSample: sec(4),
        deleted: false,
      },
    ],
    durationSamples: sec(4),
  });
  const result = cutAllByText(project, "um");
  assert.equal(result.matches, 2);
  assert.equal(project.words.filter((w) => w.deleted).length, 2);
});
