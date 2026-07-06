import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getAgentTool } from "../src/agent-tools.ts";
import {
  FEATURE_GROUP_IDS,
  features,
  normalizeFeatureTitle,
} from "../src/features.ts";
import { getAction } from "../src/registry.ts";
import { listTemplates } from "../src/templates.ts";

test("features: unique ids and valid groups", () => {
  const ids = new Set<string>();
  for (const feature of features) {
    assert.ok(!ids.has(feature.id), `duplicate feature id: ${feature.id}`);
    ids.add(feature.id);
    assert.ok(
      (FEATURE_GROUP_IDS as readonly string[]).includes(feature.group),
      `invalid group on ${feature.id}`
    );
  }
});

test("features: linked tools resolve", () => {
  for (const feature of features) {
    for (const toolName of feature.links?.tools ?? []) {
      assert.ok(
        getAgentTool(toolName),
        `feature "${feature.id}" links unknown tool: ${toolName}`
      );
    }
  }
});

test("features: linked actions resolve", () => {
  for (const feature of features) {
    for (const actionName of feature.links?.actions ?? []) {
      assert.ok(
        getAction(actionName),
        `feature "${feature.id}" links unknown action: ${actionName}`
      );
    }
  }
});

test("features: linked templates resolve", () => {
  const templateIds = new Set(listTemplates().map((t) => t.id));
  for (const feature of features) {
    for (const templateId of feature.links?.templates ?? []) {
      assert.ok(
        templateIds.has(templateId),
        `feature "${feature.id}" links unknown template: ${templateId}`
      );
    }
  }
});

function parseReadmeFeatureTitles(): string[] {
  const readme = readFileSync(
    join(import.meta.dirname, "..", "README.md"),
    "utf8"
  );
  const sectionStart = readme.indexOf("## What works today");
  assert.ok(sectionStart >= 0, "README missing ## What works today");
  const sectionEnd = readme.indexOf("\n### ", sectionStart + 1);
  const section =
    sectionEnd >= 0
      ? readme.slice(sectionStart, sectionEnd)
      : readme.slice(sectionStart);
  const titles: string[] = [];
  const bulletRe = /^- \*\*([^*]+)\*\*/gm;
  let match = bulletRe.exec(section);
  while (match) {
    titles.push(match[1].trim());
    match = bulletRe.exec(section);
  }
  return titles;
}

test("features: README What works today title parity", () => {
  const readmeTitles = parseReadmeFeatureTitles();
  const registryByNorm = new Map(
    features.map((f) => [normalizeFeatureTitle(f.title), f])
  );

  for (const title of readmeTitles) {
    const norm = normalizeFeatureTitle(title);
    assert.ok(
      registryByNorm.has(norm),
      `README feature missing from registry: ${title}`
    );
  }

  const readmeNorms = new Set(readmeTitles.map(normalizeFeatureTitle));
  for (const feature of features) {
    const norm = normalizeFeatureTitle(feature.title);
    assert.ok(
      readmeNorms.has(norm),
      `registry feature missing from README: ${feature.title}`
    );
  }

  assert.equal(
    readmeTitles.length,
    features.length,
    "README and registry feature counts differ"
  );
});
