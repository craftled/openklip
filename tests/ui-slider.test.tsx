import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Slider } from "../web/components/ui/slider.tsx";

// better-ui principle 13 (minimum hit area): the size-3 (12px) thumb needs a
// pseudo-element hit slop so the effective tap target reaches ~40px, without
// growing the visible thumb itself. 12 + 2*14 = 40.
test("Slider thumb expands its hit area via a pseudo-element without growing the visible thumb", () => {
  const html = renderToStaticMarkup(<Slider defaultValue={[50]} />);
  assert.match(html, /after:absolute/);
  assert.match(html, /after:-inset-3\.5/);
  assert.doesNotMatch(html, /after:-inset-2\b/);
  // Visible thumb stays size-3 (12px).
  assert.match(html, /size-3\b/);
});
