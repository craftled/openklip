import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { projectsRoot } from "../src/paths.ts";
import { auditProjectForShip } from "../src/project-brief-audit.ts";
import { loadProject } from "../src/projectStore.ts";

const SLUG = "edgaras-raw";

test("edgaras-raw passes brief ship audit", async () => {
  const root = projectsRoot();
  let briefText: string;
  try {
    briefText = await readFile(`${root}/${SLUG}/brief.md`, "utf8");
  } catch {
    test.skip("edgaras-raw project not found on this machine");
    return;
  }

  const project = await loadProject(SLUG);
  const result = auditProjectForShip({ briefText, project });

  assert.equal(
    result.ok,
    true,
    `brief audit failed: ${result.issues.join("; ")}`
  );
});
