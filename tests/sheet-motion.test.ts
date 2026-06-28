import assert from "node:assert/strict";
import { test } from "node:test";
import { SHEET_CONTENT_MOTION } from "../web/components/ui/sheet.tsx";

test("sheet content uses explicit transform and opacity transitions", () => {
  assert.match(SHEET_CONTENT_MOTION, /transition-\[transform,opacity\]/);
  assert.doesNotMatch(SHEET_CONTENT_MOTION, /transition duration/);
});