import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { projectsRoot } from "../src/paths.ts";
import { auditProjectForShip } from "../src/project-brief-audit.ts";
import { loadProject } from "../src/projectStore.ts";

const SLUG = "edgaras-raw";
const briefPath = `${projectsRoot()}/${SLUG}/brief.md`;
const hasEdgarasRaw = existsSync(briefPath);

test("edgaras-raw passes brief ship audit", {
  skip: hasEdgarasRaw
    ? false
    : "edgaras-raw project not present in projects root",
}, async () => {
  const briefText = await readFile(briefPath, "utf8");
  const project = await loadProject(SLUG);
  const result = auditProjectForShip({ briefText, project });

  assert.equal(
    result.ok,
    true,
    `brief audit failed: ${result.issues.join("; ")}`
  );
});
