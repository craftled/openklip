import assert from "node:assert/strict";
import { test } from "node:test";
import { applyProjectEdits } from "../src/projectMutations.ts";
import {
  assertValidTemplateId,
  defaultTemplateId,
  listTemplates,
  loadTemplateSkill,
  templateSkillPath,
} from "../src/templates.ts";
import { makeProject } from "./helpers/projectFixture.ts";

test("listTemplates finds talking-head", () => {
  const list = listTemplates();
  assert.ok(list.some((t) => t.id === "talking-head"));
  const th = list.find((t) => t.id === "talking-head");
  assert.equal(th?.label, "Talking head");
});

test("loadTemplateSkill reads skill.md", () => {
  const skill = loadTemplateSkill("talking-head");
  assert.match(skill, /Cut filler/i);
  assert.equal(templateSkillPath("talking-head").endsWith("skill.md"), true);
});

test("assertValidTemplateId rejects traversal", () => {
  assert.throws(() => assertValidTemplateId("../x"), /invalid template id/i);
  assert.equal(assertValidTemplateId("talking-head"), "talking-head");
});

test("applyProjectEdits sets template on project", () => {
  const project = makeProject();
  applyProjectEdits(project, { template: "talking-head" });
  assert.equal(project.template, "talking-head");
});

test("defaultTemplateId prefers talking-head", () => {
  assert.equal(defaultTemplateId(), "talking-head");
});
