import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  executeMomentSearch,
  grepMomentTextMatches,
} from "../src/cli-query.ts";
import type { Project, SceneLog, Word } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  isMomentIndexCurrent,
  type MomentIndexFile,
  momentIndexPath,
  searchScenes,
} from "../src/moment-search.ts";
import { projectPaths, projectsRoot } from "../src/paths.ts";
import { loadProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

interface SyntheticWordFixture {
  deleted: boolean;
  endSec: number;
  id: string;
  startSec: number;
  text: string;
}

interface SyntheticProjectFixture {
  description?: string;
  sceneLog: SceneLog;
  slug: string;
  words: SyntheticWordFixture[];
}

interface ExpectedTextMatch {
  cut: boolean;
  fromSec: number;
  text: string;
  toSec: number;
}

interface ExpectedSceneTop1 {
  fromSec: number;
  minScore?: number;
  source?: "embedding" | "summary" | "both";
  toSec: number;
}

interface SyntheticCaseBase {
  id: string;
  note?: string;
  query: string;
}

interface TextCase extends SyntheticCaseBase {
  expectedMatches: ExpectedTextMatch[];
  kind: "text";
}

interface SceneCase extends SyntheticCaseBase {
  expectedCount: number;
  expectedTop1?: ExpectedSceneTop1;
  index: "four-scene" | "uniform";
  kind: "scene";
  queryVector: number[];
}

type SyntheticCase = TextCase | SceneCase;

interface SyntheticCasesFixture {
  cases: SyntheticCase[];
  slug: string;
}

interface EdgarasTextCase {
  id: string;
  kind: "text";
  minMatches?: number;
  note?: string;
  query: string;
}

interface EdgarasSceneCase {
  expectedCount?: number;
  id: string;
  kind: "scene";
  minMatches?: number;
  note?: string;
  query: string;
  toleranceSec?: number;
}

type EdgarasCase = EdgarasTextCase | EdgarasSceneCase;

interface EdgarasCasesFixture {
  cases: EdgarasCase[];
  slug: string;
}

const FIXTURE_DIR = join(import.meta.dir, "../fixtures/moment-search");
const projectFixture = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "synthetic-project.json"), "utf8")
) as SyntheticProjectFixture;
const syntheticCasesFixture = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "synthetic-cases.json"), "utf8")
) as SyntheticCasesFixture;
const edgarasCasesFixture = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "edgaras-cases.json"), "utf8")
) as EdgarasCasesFixture;

const INDEX_FILES: Record<"four-scene" | "uniform", MomentIndexFile> = {
  "four-scene": JSON.parse(
    readFileSync(join(FIXTURE_DIR, "four-scene-index.json"), "utf8")
  ) as MomentIndexFile,
  uniform: JSON.parse(
    readFileSync(join(FIXTURE_DIR, "uniform-index.json"), "utf8")
  ) as MomentIndexFile,
};

function wordsFromFixture(fixture: SyntheticProjectFixture): Word[] {
  const sec = (n: number) => Math.round(n * SAMPLE_RATE);
  return fixture.words.map((word) => ({
    id: word.id,
    text: word.text,
    startSample: sec(word.startSec),
    endSample: sec(word.endSec),
    deleted: word.deleted,
  }));
}

function projectFromFixture(fixture: SyntheticProjectFixture): Project {
  const words = wordsFromFixture(fixture);
  const lastEnd = words.at(-1)?.endSample ?? SAMPLE_RATE * 60;
  return makeProject({
    slug: fixture.slug,
    sceneLog: fixture.sceneLog,
    words,
    durationSamples: lastEnd + SAMPLE_RATE,
  });
}

function writeIndexFixture(
  slug: string,
  indexKey: "four-scene" | "uniform"
): void {
  const paths = projectPaths(slug);
  mkdirSync(paths.frames, { recursive: true });
  for (const frame of INDEX_FILES[indexKey].frames) {
    writeFileSync(join(paths.frames, frame.name), "fake");
  }
  writeFileSync(momentIndexPath(slug), JSON.stringify(INDEX_FILES[indexKey]));
}

function assertTextCase(project: Project, span: TextCase): void {
  const matches = grepMomentTextMatches(project, span.query);
  assert.equal(
    matches.length,
    span.expectedMatches.length,
    `${span.id}: expected ${span.expectedMatches.length} text match(es), got ${matches.length} (${matches.map((m) => `${m.fromSec}-${m.toSec}${m.cut ? "[cut]" : ""}`).join(", ")})`
  );
  for (let i = 0; i < span.expectedMatches.length; i++) {
    const expected = span.expectedMatches[i];
    const actual = matches[i];
    assert.equal(actual.fromSec, expected.fromSec, `${span.id}: fromSec`);
    assert.equal(actual.toSec, expected.toSec, `${span.id}: toSec`);
    assert.equal(actual.cut, expected.cut, `${span.id}: cut`);
    assert.equal(actual.text, expected.text, `${span.id}: text`);
  }
}

function assertSceneCase(
  slug: string,
  project: Project,
  span: SceneCase
): void {
  writeIndexFixture(slug, span.index);
  const queryVec = Float32Array.from(span.queryVector);
  const result = searchScenes(slug, project, queryVec, span.query, {
    limit: 10,
  });
  assert.equal(result.indexed, true, `${span.id}: index should be current`);
  assert.equal(
    result.results.length,
    span.expectedCount,
    `${span.id}: expected ${span.expectedCount} scene hit(s), got ${result.results.length} (${result.results.map((r) => `${r.fromSec}-${r.toSec}:${r.score.toFixed(2)}:${r.source}`).join(", ")})`
  );
  if (!span.expectedTop1) {
    return;
  }
  const top1 = result.results[0];
  assert.ok(top1, `${span.id}: missing top1`);
  assert.equal(top1.fromSec, span.expectedTop1.fromSec, `${span.id}: fromSec`);
  assert.equal(top1.toSec, span.expectedTop1.toSec, `${span.id}: toSec`);
  if (span.expectedTop1.source !== undefined) {
    assert.equal(top1.source, span.expectedTop1.source, `${span.id}: source`);
  }
  if (span.expectedTop1.minScore !== undefined) {
    assert.ok(
      top1.score >= span.expectedTop1.minScore,
      `${span.id}: score ${top1.score} < ${span.expectedTop1.minScore}`
    );
  }
}

for (const span of syntheticCasesFixture.cases) {
  test(`moment-search fixture: ${span.id}`, async () => {
    await withTempProjectsRoot(({ slug }) => {
      const project = projectFromFixture({
        ...projectFixture,
        slug,
      });
      writeFixtureProject(slug, project);
      if (span.kind === "text") {
        assertTextCase(project, span);
        return;
      }
      assertSceneCase(slug, project, span);
    });
  });
}

const liveProjectPath = join(
  projectsRoot(),
  edgarasCasesFixture.slug,
  "project.json"
);
const hasLiveEdgaras = existsSync(liveProjectPath);

test("edgaras-raw live project passes labeled moment-search benchmark", {
  skip: hasLiveEdgaras
    ? false
    : "edgaras-raw project not present in projects root",
  timeout: 300_000,
}, async () => {
  const project = await loadProject(edgarasCasesFixture.slug);
  const indexReady = isMomentIndexCurrent(edgarasCasesFixture.slug);
  let passed = 0;
  let runnable = 0;

  for (const span of edgarasCasesFixture.cases) {
    if (span.kind === "text") {
      runnable += 1;
      const matches = grepMomentTextMatches(project, span.query);
      if (span.minMatches !== undefined) {
        assert.ok(
          matches.length >= span.minMatches,
          `live benchmark failed on ${span.id}: expected >= ${span.minMatches} text match(es), got ${matches.length}`
        );
      } else if (span.id === "text-filler-cut") {
        const cutMatches = matches.filter((m) => m.cut);
        assert.ok(
          cutMatches.length >= 1,
          `live benchmark failed on ${span.id}: expected at least one cut text match`
        );
      }
      passed += 1;
      continue;
    }

    if (!indexReady) {
      continue;
    }
    runnable += 1;

    const payload = await executeMomentSearch(
      edgarasCasesFixture.slug,
      project,
      span.query,
      { limit: 10 }
    );
    assert.equal(
      payload.indexed,
      true,
      `live benchmark failed on ${span.id}: moment index not searchable`
    );

    if (span.expectedCount !== undefined) {
      assert.equal(
        payload.scenes.length,
        span.expectedCount,
        `live benchmark failed on ${span.id}: expected ${span.expectedCount} scene hit(s), got ${payload.scenes.length}`
      );
    }
    if (span.minMatches !== undefined) {
      assert.ok(
        payload.scenes.length >= span.minMatches,
        `live benchmark failed on ${span.id}: expected >= ${span.minMatches} scene hit(s), got ${payload.scenes.length}`
      );
      if (span.toleranceSec !== undefined) {
        const top1 = payload.scenes[0];
        assert.ok(top1, `live benchmark failed on ${span.id}: missing top1`);
        assert.ok(
          top1.fromSec <= span.toleranceSec,
          `live benchmark failed on ${span.id}: top1 fromSec ${top1.fromSec} > ${span.toleranceSec}`
        );
      }
    }
    passed += 1;
  }

  assert.ok(
    runnable > 0,
    "edgaras-raw benchmark had no runnable cases (text + indexed scenes)"
  );
  assert.equal(passed, runnable);
});
