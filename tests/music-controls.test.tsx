import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_MUSIC_BED_SEC,
  type MusicPlacementView,
  MusicSectionControls,
} from "../web/components/music-controls.tsx";

const SR = 48_000;

function placement(
  overrides: Partial<MusicPlacementView> = {}
): MusicPlacementView {
  return {
    id: "m1",
    assetId: "bed",
    startSample: 0,
    endSample: 5 * SR,
    srcInSample: 0,
    gain: 0.4,
    fadeInSec: 1,
    fadeOutSec: 2,
    mode: "loop",
    ...overrides,
  };
}

function render(
  overrides: Partial<Parameters<typeof MusicSectionControls>[0]> = {}
): string {
  return renderToStaticMarkup(
    <MusicSectionControls
      assetName={(id) => (id === "bed" ? "bed.mp3" : id)}
      assets={[{ id: "bed", name: "bed.mp3" }]}
      chosenAssetId="bed"
      onAdd={() => undefined}
      onChooseAsset={() => undefined}
      onPatch={() => undefined}
      onRemove={() => undefined}
      placements={[]}
      sampleRate={SR}
      {...overrides}
    />
  );
}

test("empty state renders the music asset select and place button", () => {
  const html = render();
  assert.match(html, /data-music-section/);
  assert.match(html, /data-music-asset-select/);
  assert.match(html, /data-music-add/);
  assert.match(html, /Place at playhead/);
  assert.doesNotMatch(html, /data-music-row/);
  // The helper copy names the same default span addMusicPlacement uses.
  assert.ok(html.includes(`Places a ${DEFAULT_MUSIC_BED_SEC}s bed`));
});

test("the place button disables when no music asset is available", () => {
  const html = render({ assets: [], chosenAssetId: "" });
  const chunk = html
    .split("<button")
    .find((piece) => piece.includes("data-music-add"));
  assert.ok(chunk, "no data-music-add button rendered");
  assert.ok(
    chunk.slice(0, chunk.indexOf(">")).includes('disabled=""'),
    "place button should be disabled without a music asset"
  );
});

test("a placement renders gain, fade, mode, and remove controls", () => {
  const html = render({ placements: [placement()] });
  assert.match(html, /data-music-row/);
  assert.match(html, /data-music-gain/);
  assert.match(html, /data-music-remove/);
  assert.match(html, /Trim/);
  assert.match(html, /Loop/);
  assert.match(html, /bed\.mp3/);
  // Fade number inputs carry the current values.
  assert.match(html, /value="1"/);
  assert.match(html, /value="2"/);
  // The add controls hide once a placement exists.
  assert.doesNotMatch(html, /data-music-add/);
});

test("a placement row shows its span in seconds", () => {
  const html = render({
    placements: [placement({ startSample: 2 * SR, endSample: 7 * SR })],
  });
  // From/to second inputs reflect the sample span on the 48 kHz grid.
  assert.match(html, /value="2"/);
  assert.match(html, /value="7"/);
  // The range label uses an en dash between the values.
  assert.ok(html.includes("2.0s–7.0s"));
});
