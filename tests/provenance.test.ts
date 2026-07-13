import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Word } from "../src/edl.ts";
import {
  guiMutateMeta,
  matchesAuthorFilter,
  resolveProvenance,
  stampOverlayProvenanceFromMutation,
  stampProvenanceFromMutation,
  stampWordProvenance,
} from "../src/provenance.ts";
import {
  authorDisplayLabel,
  authorToneClass,
} from "../src/provenance-display.ts";

const ENV_KEYS = [
  "OPENKLIP_AUTHOR_ID",
  "OPENKLIP_AGENT_MODEL",
  "OPENKLIP_AGENT_SURFACE",
  "OPENKLIP_ACTOR",
] as const;

function clearProvenanceEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  clearProvenanceEnv();
});

test("resolveProvenance prefers OPENKLIP_AUTHOR_ID", () => {
  process.env.OPENKLIP_AUTHOR_ID = "ai:cursor";
  process.env.OPENKLIP_ACTOR = "agent";
  assert.equal(resolveProvenance({ actor: "agent" }).authorId, "ai:cursor");
});

test("resolveProvenance derives ai:claude model authorId", () => {
  assert.equal(
    resolveProvenance({
      actor: "agent",
      model: "claude-sonnet-4-6",
      agentSurface: "claude-code",
    }).authorId,
    "ai:claude:claude-sonnet-4-6"
  );
});

test("guiMutateMeta sets human:local", () => {
  const meta = guiMutateMeta("edit-words");
  assert.equal(meta.authorId, "human:local");
  assert.equal(meta.agentSurface, "gui");
  assert.equal(meta.actor, "human");
});

test("authorDisplayLabel maps known models", () => {
  assert.equal(authorDisplayLabel("claude-sonnet-4-6"), "Sonnet 4.6");
  assert.equal(authorDisplayLabel("ai:claude:claude-sonnet-4-6"), "Sonnet 4.6");
  assert.equal(authorDisplayLabel("human:local"), "You (editor)");
  assert.equal(authorDisplayLabel("ai:cursor"), "Cursor");
  assert.equal(
    authorDisplayLabel("ai:cursor:composer-2-5"),
    "Cursor · Composer 2.5"
  );
  assert.equal(authorDisplayLabel("ai:codex"), "Codex");
});

test("authorToneClass classifies author ids", () => {
  assert.equal(authorToneClass("human:local"), "human");
  assert.equal(authorToneClass("ai:cursor"), "agent");
  assert.equal(authorToneClass("cli:openklip"), "cli");
});

test("matchesAuthorFilter matches authorId substring and exact model", () => {
  assert.equal(
    matchesAuthorFilter(
      { authorId: "ai:claude:claude-sonnet-4-6", model: "claude-sonnet-4-6" },
      "sonnet"
    ),
    true
  );
  assert.equal(
    matchesAuthorFilter(
      { authorId: "ai:cursor", model: "composer-2-5" },
      "composer-2-5"
    ),
    true
  );
  assert.equal(
    matchesAuthorFilter({ authorId: "human:local" }, "ai:cursor"),
    false
  );
});

test("stampWordProvenance writes optional word fields", () => {
  const words: Word[] = [
    {
      id: "w0",
      text: "hello",
      startSample: 0,
      endSample: 100,
      deleted: false,
    },
    {
      id: "w1",
      text: "world",
      startSample: 100,
      endSample: 200,
      deleted: false,
    },
  ];
  stampWordProvenance(words, ["w1"], { authorId: "human:local" }, 3, "t1");
  assert.equal(words[0].authoredBy, undefined);
  assert.equal(words[1].authoredBy, "human:local");
  assert.equal(words[1].authoredRevision, 3);
  assert.equal(words[1].authoredTaskId, "t1");
  assert.equal(typeof words[1].authoredAt, "number");
});

test("stampProvenanceFromMutation stamps words cut by cleanup-apply", () => {
  const words: Word[] = [
    {
      id: "w0",
      text: "um",
      startSample: 0,
      endSample: 100,
      deleted: true,
    },
    {
      id: "w1",
      text: "hello",
      startSample: 100,
      endSample: 200,
      deleted: false,
    },
  ];
  const project = {
    words,
    broll: [],
    titles: [],
    zooms: [],
    stills: [],
    graphics: [],
  };
  stampProvenanceFromMutation(
    project,
    {
      action: "cleanup-apply",
      input: { mode: "safe" },
      taskId: "task-cleanup",
    },
    { wordIds: ["w0"], deadAirSpanIds: [], extendedSpanIds: [], warnings: [] },
    { authorId: "ai:cursor" },
    7
  );
  assert.equal(words[0].authoredBy, "ai:cursor");
  assert.equal(words[0].authoredRevision, 7);
  assert.equal(words[0].authoredTaskId, "task-cleanup");
  assert.equal(words[1].authoredBy, undefined);
});

test("stampOverlayProvenanceFromMutation stamps b-roll on add", () => {
  const project = {
    words: [] as Word[],
    broll: [
      {
        id: "br1",
        assetId: "a1",
        startSample: 0,
        endSample: 100,
      },
    ],
  };
  stampOverlayProvenanceFromMutation(
    project,
    "broll-add",
    {},
    { id: "br1" },
    { authorId: "ai:cursor" },
    4,
    "task-abc"
  );
  assert.equal(project.broll[0]?.authoredBy, "ai:cursor");
  assert.equal(project.broll[0]?.authoredRevision, 4);
  assert.equal(project.broll[0]?.authoredTaskId, "task-abc");
});
