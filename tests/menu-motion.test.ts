import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MENU_INSTANT_ATTR } from "../web/components/ui/dropdown-menu.tsx";

test("menu instant attr matches globals.css selector", () => {
  assert.equal(MENU_INSTANT_ATTR, "data-menu-instant");
  const css = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8"
  );
  assert.match(css, /\[data-menu-instant\]\[data-slot="dropdown-menu-content"\]/);
});