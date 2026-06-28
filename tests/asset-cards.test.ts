import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetCardLines,
  assetsNeedingCards,
  buildAssetCardPrompt,
  isCardableKind,
  needsCard,
  parseAssetCard,
} from "../src/asset-cards.ts";
import type { Asset, Project } from "../src/edl.ts";

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: "broll-1",
    kind: "broll",
    name: "drone.mp4",
    src: "/x/drone.mp4",
    proxy: "working/assets/broll-1.mp4",
    durationSamples: 48_000 * 8,
    ...over,
  };
}

// ---- cardable kinds + needsCard ----

test("only b-roll and stills are cardable (music is skipped, not faked)", () => {
  assert.equal(isCardableKind("broll"), true);
  assert.equal(isCardableKind("still"), true);
  assert.equal(isCardableKind("music"), false);
});

test("needsCard: cardable kind without a card", () => {
  assert.equal(needsCard(asset()), true);
  assert.equal(needsCard(asset({ kind: "music" })), false);
  assert.equal(
    needsCard(
      asset({
        card: { summary: "x", tags: [], bestFor: [], analyzedAt: "t" },
      })
    ),
    false
  );
});

test("assetsNeedingCards filters the bin to un-carded visual assets", () => {
  const project = {
    assets: [
      asset({ id: "a" }),
      asset({ id: "b", kind: "music", name: "song.mp3" }),
      asset({
        id: "c",
        kind: "still",
        card: { summary: "done", tags: [], bestFor: [], analyzedAt: "t" },
      }),
      asset({ id: "d", kind: "still", name: "shot.png" }),
    ],
  } as unknown as Project;
  assert.deepEqual(
    assetsNeedingCards(project).map((a) => a.id),
    ["a", "d"]
  );
});

// ---- prompt ----

test("buildAssetCardPrompt names the asset, lists frames, asks JSON only", () => {
  const p = buildAssetCardPrompt(
    { kind: "broll", name: "drone.mp4", durationSamples: 48_000 * 8 },
    ["/tmp/f0.jpg", "/tmp/f1.jpg"]
  );
  assert.match(p, /b-roll named "drone\.mp4"|broll named "drone\.mp4"/);
  assert.match(p, /8\.0s/);
  assert.match(p, /\/tmp\/f0\.jpg/);
  assert.match(p, /\/tmp\/f1\.jpg/);
  assert.match(p, /JSON only/i);
  // No suggestedFocus ask for video.
  assert.doesNotMatch(p, /suggestedFocus/);
});

test("buildAssetCardPrompt asks stills for a Ken Burns focus point", () => {
  const p = buildAssetCardPrompt(
    { kind: "still", name: "city.png", durationSamples: 48_000 * 3 },
    ["/tmp/city.png"]
  );
  assert.match(p, /suggestedFocus/);
});

// ---- parse ----

test("parseAssetCard parses a clean JSON card", () => {
  const card = parseAssetCard(
    '{"summary":"Aerial city at dusk","tags":["aerial","city"],"bestFor":["intro"]}'
  );
  assert.equal(card?.summary, "Aerial city at dusk");
  assert.deepEqual(card?.tags, ["aerial", "city"]);
  assert.deepEqual(card?.bestFor, ["intro"]);
});

test("parseAssetCard recovers a fenced / prose-wrapped reply", () => {
  const card = parseAssetCard(
    'Here you go:\n```json\n{"summary":"A logo","tags":["brand"]}\n```'
  );
  assert.equal(card?.summary, "A logo");
  assert.deepEqual(card?.tags, ["brand"]);
  assert.deepEqual(card?.bestFor, []);
});

test("parseAssetCard clamps suggestedFocus into [0,1]", () => {
  const card = parseAssetCard(
    '{"summary":"x","suggestedFocus":{"x":1.4,"y":-0.2}}'
  );
  assert.deepEqual(card?.suggestedFocus, { x: 1, y: 0 });
});

test("parseAssetCard ignores a malformed focus object", () => {
  const card = parseAssetCard('{"summary":"x","suggestedFocus":{"x":"a"}}');
  assert.equal(card?.suggestedFocus, undefined);
});

test("parseAssetCard returns null on garbage or an empty summary", () => {
  assert.equal(parseAssetCard("not json"), null);
  assert.equal(parseAssetCard('{"summary":""}'), null);
  assert.equal(parseAssetCard('{"summary":"   "}'), null);
  assert.equal(parseAssetCard('{"tags":["a"]}'), null);
});

test("parseAssetCard drops non-string tags / uses", () => {
  const card = parseAssetCard(
    '{"summary":"x","tags":["a",5,null,""],"bestFor":[true,"intro"]}'
  );
  assert.deepEqual(card?.tags, ["a"]);
  assert.deepEqual(card?.bestFor, ["intro"]);
});

// ---- prompt-line rendering ----

test("assetCardLines renders one line per carded asset, omitting un-carded", () => {
  const lines = assetCardLines([
    asset({
      id: "broll-1",
      card: {
        summary: "Drone over coast",
        tags: ["aerial", "coast"],
        bestFor: ["intro", "transition"],
        analyzedAt: "t",
      },
    }),
    asset({ id: "broll-2" }), // no card → omitted
    asset({
      id: "still-1",
      kind: "still",
      name: "logo.png",
      card: { summary: "Brand logo", tags: [], bestFor: [], analyzedAt: "t" },
    }),
  ]);
  const rows = lines.split("\n");
  assert.equal(rows.length, 2);
  assert.match(
    rows[0],
    /broll-1 \(broll\): Drone over coast \[aerial, coast\] \(good for: intro, transition\)/
  );
  assert.match(rows[1], /still-1 \(still\): Brand logo/);
  assert.doesNotMatch(lines, /broll-2/);
});

test("assetCardLines is empty when nothing is carded", () => {
  assert.equal(assetCardLines([asset(), asset({ id: "broll-2" })]), "");
});
