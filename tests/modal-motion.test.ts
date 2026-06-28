import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODAL_CONTENT_MOTION,
  MODAL_OVERLAY_MOTION,
} from "../web/components/ui/dialog.tsx";

test("modal motion exits faster than it enters", () => {
  for (const motion of [MODAL_OVERLAY_MOTION, MODAL_CONTENT_MOTION]) {
    assert.match(motion, /data-\[state=open\]:duration-200/);
    assert.match(motion, /data-\[state=closed\]:duration-150/);
  }
});
