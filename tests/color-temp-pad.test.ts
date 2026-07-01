import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ColorTempPad } from "../web/components/color-temp-pad.tsx";

test("ColorTempPad renders temperature and tint values", () => {
  let changed = false;
  const html = renderToStaticMarkup(
    createElement(ColorTempPad, {
      color: {
        brightness: 0,
        contrast: 1,
        saturation: 1,
        temperature: 0.52,
        tint: -0.45,
      },
      onColorChange: () => {
        changed = true;
      },
    })
  );

  assert.match(html, /Color/);
  assert.match(html, /0\.52, -0\.45/);
  assert.match(html, /Reset color temperature/);
  assert.equal(changed, false);
});
