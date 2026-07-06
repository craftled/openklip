import assert from "node:assert/strict";
import { test } from "node:test";
import { featureGroups, features } from "../src/features.ts";
import { normalizeSettingsSection } from "../web/lib/settings-navigation.ts";

test("feature registry lists shipped capability groups", () => {
  assert.ok(featureGroups.length >= 5);
  for (const group of featureGroups) {
    const groupFeatures = features.filter((f) => f.group === group.id);
    assert.ok(groupFeatures.length > 0, `empty group: ${group.id}`);
    for (const feature of groupFeatures) {
      assert.ok(feature.title);
      assert.ok(feature.description);
    }
  }
  const titles = features.map((f) => f.title);
  assert.ok(titles.includes("B-roll suggest"));
});

test("normalizeSettingsSection accepts features", () => {
  assert.equal(normalizeSettingsSection("features"), "features");
});
