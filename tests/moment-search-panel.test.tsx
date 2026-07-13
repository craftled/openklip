import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ErrorRow,
  HintBlock,
  IndexingRow,
  SceneResultCard,
  TextResultCard,
} from "../web/components/moment-search-panel.tsx";
import type { MomentSceneResult } from "../web/hooks/use-moment-search.tsx";
import type { MomentTextMatch } from "../web/lib/moment-keep.ts";

const noop = () => undefined;

test("IndexingRow renders the building state", () => {
  const html = renderToStaticMarkup(<IndexingRow />);
  assert.match(html, /Indexing footage/);
});

test("ErrorRow renders the static message plus the real failure message when present", () => {
  const html = renderToStaticMarkup(
    <ErrorRow message="moment index build failed" onRetry={noop} />
  );
  assert.match(html, /build the visual index/);
  assert.match(html, /moment index build failed/);
  assert.match(html, /Retry/);
});

test("ErrorRow renders without a detail line when there is no message", () => {
  const html = renderToStaticMarkup(<ErrorRow message={null} onRetry={noop} />);
  assert.match(html, /build the visual index/);
});

test("HintBlock renders its children (the empty-query / no-results copy)", () => {
  const html = renderToStaticMarkup(
    <HintBlock>Find moments: try &apos;laughing&apos;</HintBlock>
  );
  assert.match(html, /Find moments/);
});

test("TextResultCard renders a populated text match with a cut badge and snippet", () => {
  const match: MomentTextMatch = {
    fromSec: 22.4,
    toSec: 23.48,
    ids: ["w1"],
    text: "hesitations",
    range: [5, 5],
    hasCutWords: true,
  };
  const words = [
    {
      id: "w0",
      text: "some",
      startSample: 0,
      endSample: 48_000,
      deleted: false,
    },
    {
      id: "w1",
      text: "hesitations",
      startSample: 48_000,
      endSample: 96_000,
      deleted: true,
    },
  ];
  const html = renderToStaticMarkup(
    <ul>
      <TextResultCard
        keepMoment={noop}
        match={match}
        onSeek={noop}
        slug="demo"
        words={words}
      />
    </ul>
  );
  assert.match(html, /hesitations/);
  assert.match(html, /cut/);
  assert.match(html, /Keep/);
  assert.match(html, /data-moment-from-sec="22\.4"/);
});

test("SceneResultCard renders a populated scene match with its summary", () => {
  const result: MomentSceneResult = {
    fromSec: 12,
    toSec: 18,
    score: 0.31,
    source: "both",
    summary: "two people laughing at a whiteboard",
  };
  const html = renderToStaticMarkup(
    <ul>
      <SceneResultCard
        keepMoment={noop}
        onSeek={noop}
        result={result}
        slug="demo"
      />
    </ul>
  );
  assert.match(html, /two people laughing at a whiteboard/);
  assert.match(html, /data-moment-to-sec="18"/);
});

test("the moment result card gives scale-on-press feedback when seeking", () => {
  const result: MomentSceneResult = {
    fromSec: 12,
    toSec: 18,
    score: 0.31,
    source: "both",
    summary: "a card to press",
  };
  const html = renderToStaticMarkup(
    <ul>
      <SceneResultCard
        keepMoment={noop}
        onSeek={noop}
        result={result}
        slug="demo"
      />
    </ul>
  );
  assert.match(html, /active:scale-\[0\.98\]/);
  assert.match(html, /transition-transform/);
});
