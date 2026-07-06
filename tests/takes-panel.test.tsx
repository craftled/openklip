import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AssemblySegment, Take } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { TakesPanelView } from "../web/components/takes-panel.tsx";

const sec = (n: number) => n * SAMPLE_RATE;

function take(overrides: Partial<Take> = {}): Take {
  return {
    id: "takeA",
    label: "Take A",
    source: "/tmp/takeA-src.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 320,
    height: 240,
    durationSamples: sec(4),
    words: [
      {
        id: "w0",
        text: "hello",
        startSample: 0,
        endSample: sec(1),
        deleted: false,
      },
      {
        id: "w1",
        text: "world",
        startSample: sec(1),
        endSample: sec(2),
        deleted: false,
      },
    ],
    ingestedAt: "2026-06-29T00:00:00.000Z",
    ...overrides,
  };
}

function segment(overrides: Partial<AssemblySegment> = {}): AssemblySegment {
  return {
    takeId: "takeA",
    startWordId: "w0",
    endWordId: "w1",
    ...overrides,
  };
}

const noop = () => {
  // presentational test: callbacks are not exercised
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof TakesPanelView>> = {}
): string {
  return renderToStaticMarkup(
    <TakesPanelView
      addTakeBusy={false}
      addTakeError={null}
      addTakeLabel=""
      addTakeProgress={null}
      anchorWordId={null}
      assembleError={null}
      assembling={false}
      forceArmed={false}
      loadingTakes={false}
      loadingWords={false}
      onAddTakeFile={noop}
      onAddTakeLabelChange={noop}
      onAssemble={noop}
      onCancelForce={noop}
      onClickWord={noop}
      onRemoveSegment={noop}
      onSelectTake={noop}
      segments={[]}
      selectedTakeId={null}
      selectedWords={null}
      takes={[]}
      {...overrides}
    />
  );
}

function tagWith(html: string, marker: string, tag = "button"): string {
  const idx = html.indexOf(marker);
  assert.ok(idx >= 0, `missing ${marker} in markup`);
  const start = html.lastIndexOf(`<${tag}`, idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

test("empty state when there are no takes", () => {
  const html = renderPanel({ takes: [] });
  assert.match(html, /data-takes-panel/);
  assert.match(html, /No takes ingested yet/);
  assert.doesNotMatch(html, /data-takes-row/);
});

test("renders one row per take with label, duration, and word count", () => {
  const html = renderPanel({
    takes: [
      take({ id: "takeA", label: "Take A", words: take().words }),
      take({
        id: "takeB",
        label: "Take B",
        words: [
          {
            id: "w0",
            text: "hi",
            startSample: 0,
            endSample: sec(1),
            deleted: false,
          },
        ],
        durationSamples: sec(1),
      }),
    ],
  });
  const rowCount = html.split("data-takes-row").length - 1;
  assert.equal(rowCount, 2);
  assert.match(html, /Take A/);
  assert.match(html, /Take B/);
  assert.match(html, /2 words/);
  assert.match(html, /1 word\b/);
});

test("assemble button is disabled when the selection has no segments", () => {
  const html = renderPanel({ segments: [] });
  const tag = tagWith(html, "data-takes-assemble");
  assert.ok(tag.includes('disabled=""'));
});

test("assemble button is enabled once the selection has at least one segment", () => {
  const html = renderPanel({ segments: [segment()] });
  const tag = tagWith(html, "data-takes-assemble");
  assert.ok(!tag.includes('disabled=""'));
});

test("assemble button is disabled while assembling even with segments selected", () => {
  const html = renderPanel({ assembling: true, segments: [segment()] });
  const tag = tagWith(html, "data-takes-assemble");
  assert.ok(tag.includes('disabled=""'));
});

test("selecting a take renders its transcript words as clickable buttons", () => {
  const html = renderPanel({
    selectedTakeId: "takeA",
    selectedWords: take().words,
  });
  assert.match(html, /data-takes-word/);
  assert.match(html, /hello/);
  assert.match(html, /world/);
});

test("segments list renders one row per added segment with a remove affordance", () => {
  const html = renderPanel({
    takes: [take()],
    segments: [segment(), segment({ startWordId: "w1", endWordId: "w1" })],
  });
  const rowCount = html.split("data-takes-segment").length - 1;
  assert.equal(rowCount, 2);
});

test("force-overwrite confirmation renders when forceArmed is true instead of the assemble button", () => {
  const html = renderPanel({ forceArmed: true, segments: [segment()] });
  assert.match(html, /data-takes-force-confirm/);
  assert.match(html, /Overwrite existing edit\?/);
  assert.doesNotMatch(html, /data-takes-assemble/);
});

test("assemble error renders when set", () => {
  const html = renderPanel({ assembleError: "boom" });
  assert.match(html, /boom/);
});

test("renders an Add take control with a file input", () => {
  const html = renderPanel({});
  assert.match(html, /data-takes-add/);
  assert.match(html, /data-takes-add-file/);
  assert.match(html, /type="file"/);
});

test("Add take shows a busy state while ingesting", () => {
  const html = renderPanel({ addTakeBusy: true });
  assert.match(html, /Ingesting take/);
});

test("Add take renders its own error separately from assembleError", () => {
  const html = renderPanel({ addTakeError: "take upload failed" });
  assert.match(html, /take upload failed/);
});
