import assert from "node:assert/strict";
import { test } from "node:test";
import { OPENKLIP_FEATURE_GROUPS } from "../web/lib/openklip-features.ts";
import { normalizeSettingsSection } from "../web/lib/settings-navigation.ts";

test("OPENKLIP_FEATURE_GROUPS lists shipped capability groups", () => {
  assert.ok(OPENKLIP_FEATURE_GROUPS.length >= 5);
  for (const group of OPENKLIP_FEATURE_GROUPS) {
    assert.ok(group.id);
    assert.ok(group.title);
    assert.ok(group.features.length > 0);
    for (const feature of group.features) {
      assert.ok(feature.title);
      assert.ok(feature.description);
    }
  }
  const titles = OPENKLIP_FEATURE_GROUPS.flatMap((g) =>
    g.features.map((f) => f.title)
  );
  assert.ok(titles.includes("B-roll suggest"));
});

test("normalizeSettingsSection accepts features", () => {
  assert.equal(normalizeSettingsSection("features"), "features");
});
