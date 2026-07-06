import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { suggestBroll } from "../src/broll-suggest.ts";
import type { Asset, Project } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { projectsRoot } from "../src/paths.ts";
import { loadProject } from "../src/projectStore.ts";
import { makeProject } from "./helpers/projectFixture.ts";

interface EdgarasCardsFixture {
  assets: Array<{
    card: Asset["card"];
    id: string;
    kind: string;
    name: string;
  }>;
  slug: string;
}

interface EdgarasSpanCase {
  expectedTop1: string | null;
  id: string;
  minTop1Score?: number;
  mode: "phrase" | "text";
  note?: string;
  query: string;
}

interface EdgarasSpansFixture {
  cases: EdgarasSpanCase[];
  slug: string;
}

const FIXTURE_DIR = join(import.meta.dir, "../fixtures/broll-suggest");
const cardsFixture = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "edgaras-cards.json"), "utf8")
) as EdgarasCardsFixture;
const spansFixture = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "edgaras-spans.json"), "utf8")
) as EdgarasSpansFixture;

function projectFromCardsFixture(): Project {
  const sec = (n: number) => n * SAMPLE_RATE;
  return makeProject({
    slug: cardsFixture.slug,
    assets: cardsFixture.assets.map((entry) => ({
      id: entry.id,
      kind: entry.kind as Asset["kind"],
      name: entry.name,
      src: `/tmp/${entry.id}`,
      proxy: `working/assets/${entry.id}.mp4`,
      durationSamples: sec(8),
      card: entry.card,
    })),
    words: [
      {
        id: "w8",
        text: "design",
        startSample: sec(1),
        endSample: sec(2),
        deleted: false,
      },
      {
        id: "w9",
        text: "feedback",
        startSample: sec(2),
        endSample: sec(3),
        deleted: false,
      },
      {
        id: "w32",
        text: "Canvas",
        startSample: sec(11),
        endSample: sec(12),
        deleted: false,
      },
      {
        id: "w33",
        text: "design",
        startSample: sec(12),
        endSample: sec(13),
        deleted: false,
      },
    ],
  });
}

function assertCase(project: Project, span: EdgarasSpanCase): void {
  const input =
    span.mode === "text"
      ? { text: span.query, top: 3 }
      : { phrase: span.query, top: 3 };
  const result = suggestBroll(project, input);
  const top1 = result.suggestions[0]?.assetId ?? null;

  if (span.expectedTop1 === null) {
    assert.equal(
      result.suggestions.length,
      0,
      `${span.id}: expected no suggestions (${span.note ?? ""})`
    );
    return;
  }

  assert.equal(
    top1,
    span.expectedTop1,
    `${span.id}: expected top1 ${span.expectedTop1}, got ${top1 ?? "none"} (${result.suggestions.map((s) => `${s.assetId}:${s.score}`).join(", ")})`
  );
  if (span.minTop1Score !== undefined) {
    assert.ok(
      (result.suggestions[0]?.score ?? 0) >= span.minTop1Score,
      `${span.id}: score ${result.suggestions[0]?.score} < ${span.minTop1Score}`
    );
  }
}

for (const span of spansFixture.cases) {
  test(`broll-suggest fixture: ${span.id}`, () => {
    assertCase(projectFromCardsFixture(), span);
  });
}

const liveProjectPath = join(projectsRoot(), spansFixture.slug, "project.json");
const hasLiveEdgaras = existsSync(liveProjectPath);

test("edgaras-raw live project passes labeled b-roll suggest benchmark", {
  skip: hasLiveEdgaras
    ? false
    : "edgaras-raw project not present in projects root",
}, async () => {
  const project = await loadProject(spansFixture.slug);
  const brollWithCards = project.assets.filter(
    (a) => (a.kind ?? "broll") === "broll" && a.card
  );
  if (brollWithCards.length < 3) {
    return test.skip(
      "edgaras-raw b-roll assets lack cards; run: openklip analyze edgaras-raw"
    );
  }

  let passed = 0;
  for (const span of spansFixture.cases) {
    try {
      assertCase(project, span);
      passed += 1;
    } catch (error) {
      throw new Error(
        `live benchmark failed on ${span.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  assert.equal(passed, spansFixture.cases.length);
});
