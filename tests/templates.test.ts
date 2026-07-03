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

test("listTemplates finds the make-draft, make-short, make-highlights, and revise-draft playbooks", () => {
  const list = listTemplates();
  const makeDraft = list.find((t) => t.id === "make-draft");
  const makeShort = list.find((t) => t.id === "make-short");
  const makeHighlights = list.find((t) => t.id === "make-highlights");
  const reviseDraft = list.find((t) => t.id === "revise-draft");
  assert.ok(makeDraft, "make-draft should be auto-listed from templates/");
  assert.equal(makeDraft?.label, "Make a draft");
  assert.ok(makeShort, "make-short should be auto-listed from templates/");
  assert.equal(makeShort?.label, "Make a short");
  assert.ok(makeHighlights, "make-highlights should be auto-listed from templates/");
  assert.ok(reviseDraft, "revise-draft should be auto-listed from templates/");
  assert.equal(reviseDraft?.label, "Revise a draft");
});

test("loadTemplateSkill reads the make-draft, make-short, make-highlights, and revise-draft playbooks", () => {
  const makeDraft = loadTemplateSkill("make-draft");
  assert.match(makeDraft, /task_complete/);

  const makeShort = loadTemplateSkill("make-short");
  assert.match(makeShort, /task_complete/);
  assert.match(makeShort, /export-set/);
  assert.match(makeShort, /vision-focus/);
  assert.match(makeShort, /platform: "shorts"/);

  const makeHighlights = loadTemplateSkill("make-highlights");
  assert.match(makeHighlights, /highlights-detect/);
  assert.match(makeHighlights, /highlights_list/);

  const reviseDraft = loadTemplateSkill("revise-draft");
  assert.match(reviseDraft, /task_complete/);
  assert.match(reviseDraft, /revert/);
  assert.match(reviseDraft, /project_overlays/);
});

test("revise-draft skill mentions Convert to short path", () => {
  const reviseDraft = loadTemplateSkill("revise-draft");
  assert.match(reviseDraft, /Convert to short/);
  assert.match(reviseDraft, /export-set/);
  assert.match(reviseDraft, /shorts/);
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
