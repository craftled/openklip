import assert from "node:assert/strict";
import { test } from "node:test";
import { TOOLTIP_SKIP_DELAY_MS } from "../web/components/ui/tooltip.tsx";

test("tooltip skipDelayDuration lets adjacent tooltips open instantly", () => {
  assert.equal(TOOLTIP_SKIP_DELAY_MS, 300);
});