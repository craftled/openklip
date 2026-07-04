import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SymbolsEffectPlayground from "../web/components/symbols-effect-playground.tsx";

test("/home playground renders symbols effect shell", () => {
  const html = renderToStaticMarkup(createElement(SymbolsEffectPlayground));

  assert.match(html, /symbols-playground/);
  assert.match(html, /Cell size/);
  assert.match(html, /Bands \(dark to light\)/);
  assert.match(html, /Save PNG/);
  assert.match(html, /Remix/);
  assert.match(html, /Preset:/);
});

test("GLYPHS exports the empty glyph at index 0", async () => {
  const { GLYPHS } = await import("../web/components/ui/symbols-effect.tsx");
  assert.equal(GLYPHS[0]?.name, "empty");
  assert.ok(GLYPHS.length >= 20);
});

test("mediaUrl does not double-encode arlan preset URLs", async () => {
  const { mediaUrl } = await import("../web/components/ui/symbols-effect.tsx");
  const encoded =
    "https://www.arlan.me/videos-glyph/Confident%20Life%20Notes%20for%20Busy%20Days.mp4";
  assert.equal(mediaUrl(encoded), encoded);
  assert.equal(
    mediaUrl("https://www.arlan.me/videos-glyph/Cat Enrichment Roundup.mp4"),
    "https://www.arlan.me/videos-glyph/Cat%20Enrichment%20Roundup.mp4"
  );
});
