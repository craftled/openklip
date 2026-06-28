import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetCardCaption,
  assetCardTooltip,
} from "../web/lib/asset-card-display.ts";

test("assetCardTooltip stacks summary, tags, and uses on separate lines", () => {
  const text = assetCardTooltip({
    summary: "Aerial city at dusk",
    tags: ["aerial", "city"],
    bestFor: ["intro", "transition"],
  });
  assert.equal(
    text,
    "Aerial city at dusk\n#aerial #city\nGood for: intro, transition"
  );
});

test("assetCardTooltip omits empty tag / use lines", () => {
  assert.equal(assetCardTooltip({ summary: "A plain logo" }), "A plain logo");
  assert.equal(
    assetCardTooltip({ summary: "A plain logo", tags: [], bestFor: [] }),
    "A plain logo"
  );
});

test("assetCardTooltip trims the summary", () => {
  assert.match(assetCardTooltip({ summary: "  spaced  " }), /^spaced$/);
});

test("assetCardCaption returns the trimmed summary", () => {
  assert.equal(
    assetCardCaption({ summary: "  Brand logo on white  " }),
    "Brand logo on white"
  );
});
