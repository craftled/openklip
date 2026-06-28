import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SIDEBAR_MENU_BUTTON_MOTION,
  SIDEBAR_PANEL_MOTION,
} from "../web/components/ui/sidebar.tsx";

test("sidebar menu button avoids layout property transitions", () => {
  assert.match(SIDEBAR_MENU_BUTTON_MOTION, /transition-\[color,opacity,transform\]/);
  assert.doesNotMatch(SIDEBAR_MENU_BUTTON_MOTION, /width|height|padding/);
  assert.match(SIDEBAR_MENU_BUTTON_MOTION, /active:scale-\[0\.98\]/);
});

test("sidebar panel offcanvas uses transform-only motion", () => {
  assert.match(SIDEBAR_PANEL_MOTION, /transition-transform/);
  assert.doesNotMatch(SIDEBAR_PANEL_MOTION, /width|left|right/);
});