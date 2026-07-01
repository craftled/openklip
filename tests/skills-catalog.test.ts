import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSkillCatalog,
  buildSkillMessage,
  buildSkillsMessage,
  filterSkills,
  parseSlashQuery,
} from "../web/lib/skills-catalog.ts";

test("parseSlashQuery detects leading slash queries", () => {
  assert.deepEqual(parseSlashQuery("/filler"), { query: "filler" });
  assert.deepEqual(parseSlashQuery("/talking-head"), { query: "talking-head" });
  assert.equal(parseSlashQuery("hello /filler"), null);
  assert.equal(parseSlashQuery("filler"), null);
});

test("buildSkillCatalog merges workflow and template skills", () => {
  const catalog = buildSkillCatalog([
    {
      id: "talking-head",
      label: "Talking head",
      description: "Solo short-form edit playbook.",
    },
  ]);
  assert.ok(catalog.some((s) => s.id === "filler" && s.kind === "workflow"));
  assert.ok(
    catalog.some(
      (s) => s.id === "template:talking-head" && s.kind === "template"
    )
  );
});

test("buildSkillCatalog includes bundled product announcement skill by default", () => {
  const catalog = buildSkillCatalog([]);
  const skill = catalog.find((s) => s.id === "template:product-announcement");
  assert.ok(skill);
  assert.equal(skill.kind, "template");
  assert.equal(skill.templateId, "product-announcement");
  assert.match(skill.invokeText, /json-graphic-add/);
});

test("buildSkillCatalog does not duplicate default template skills", () => {
  const catalog = buildSkillCatalog([
    {
      id: "product-announcement",
      label: "Product announcement",
      description: "Short technical launch video.",
    },
  ]);
  assert.equal(
    catalog.filter((s) => s.id === "template:product-announcement").length,
    1
  );
});

test("buildSkillCatalog pins product announcement before workflows", () => {
  const catalog = buildSkillCatalog([]);
  const productIndex = catalog.findIndex(
    (s) => s.id === "template:product-announcement"
  );
  const fillerIndex = catalog.findIndex((s) => s.id === "filler");
  assert.notEqual(productIndex, -1);
  assert.notEqual(fillerIndex, -1);
  assert.ok(productIndex < fillerIndex);
});

test("product announcement template skill tells Claude to use json tools", () => {
  const catalog = buildSkillCatalog([
    {
      id: "product-announcement",
      label: "Product Announcement",
      description: "Short technical launch video.",
    },
  ]);
  const skill = catalog.find((s) => s.id === "template:product-announcement");
  assert.ok(skill);
  assert.match(skill.invokeText, /template_show/);
  assert.match(skill.invokeText, /template_set/);
  assert.match(skill.invokeText, /json-graphic-add/);
  assert.match(skill.invokeText, /3-6 second span/);
});

test("filterSkills matches title slash and description", () => {
  const catalog = buildSkillCatalog([]);
  const filtered = filterSkills(catalog, "filler");
  assert.ok(filtered.some((s) => s.id === "filler"));
  assert.equal(filterSkills(catalog, "zzzz-not-found").length, 0);
});

test("buildSkillMessage composes invoke text with optional follow-up", () => {
  const skill = {
    id: "filler",
    title: "Cut filler words",
    description: "",
    slash: "filler",
    invokeText: "Cut all filler words",
    kind: "workflow" as const,
  };
  assert.equal(buildSkillMessage(skill), "Cut all filler words");
  assert.equal(
    buildSkillMessage(skill, "focus on um and uh"),
    "Cut all filler words. focus on um and uh"
  );
  assert.equal(buildSkillMessage(skill, "   "), "Cut all filler words");
});

test("buildSkillsMessage composes ordered skill invokes with optional follow-up", () => {
  const skills = [
    {
      id: "filler",
      title: "Cut filler words",
      description: "",
      slash: "filler",
      invokeText: "Cut all filler words",
      kind: "workflow" as const,
    },
    {
      id: "zoom",
      title: "Add a push-in zoom",
      description: "",
      slash: "zoom",
      invokeText: "Add a push-in zoom",
      kind: "workflow" as const,
    },
  ];

  assert.equal(
    buildSkillsMessage(skills),
    "Cut all filler words. Add a push-in zoom"
  );
  assert.equal(
    buildSkillsMessage(skills, "focus on the intro"),
    "Cut all filler words. Add a push-in zoom. focus on the intro"
  );
});
