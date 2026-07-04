import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenKlipLoader } from "../web/components/openklip-loader.tsx";

test("/home loader renders full-screen OpenKlip shell", () => {
  const html = renderToStaticMarkup(
    createElement(OpenKlipLoader, { label: "Loading project…" })
  );

  assert.match(html, /data-openklip-loader=""/);
  assert.match(html, /role="status"/);
  assert.match(html, /OpenKlip/);
  assert.match(html, /Loading project…/);
  assert.match(html, /h-screen/);
  assert.match(html, /bg-background/);
  assert.doesNotMatch(html, /<canvas/);
});

test("OpenKlipLoader works without a status label", () => {
  const html = renderToStaticMarkup(createElement(OpenKlipLoader));

  assert.match(html, /data-openklip-loader=""/);
  assert.match(html, /role="status"/);
  assert.match(html, /OpenKlip/);
  assert.match(html, /sr-only/);
  assert.doesNotMatch(html, /Loading project/);
});

test("ShimmeringText exports motion-based wordmark helper", async () => {
  const { ShimmeringText } = await import(
    "../web/components/shimmering-text.tsx"
  );
  assert.equal(typeof ShimmeringText, "function");
});
