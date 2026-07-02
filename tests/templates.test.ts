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

test("listTemplates finds the make-draft and revise-draft playbooks", () => {
  const list = listTemplates();
  const makeDraft = list.find((t) => t.id === "make-draft");
  const reviseDraft = list.find((t) => t.id === "revise-draft");
  assert.ok(makeDraft, "make-draft should be auto-listed from templates/");
  assert.equal(makeDraft?.label, "Make a draft");
  assert.ok(reviseDraft, "revise-draft should be auto-listed from templates/");
  assert.equal(reviseDraft?.label, "Revise a draft");
});

test("loadTemplateSkill reads the make-draft and revise-draft playbooks", () => {
  const makeDraft = loadTemplateSkill("make-draft");
  assert.match(makeDraft, /task_complete/);

  const reviseDraft = loadTemplateSkill("revise-draft");
  assert.match(reviseDraft, /task_complete/);
  assert.match(reviseDraft, /revert/);
  assert.match(reviseDraft, /project_overlays/);
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
