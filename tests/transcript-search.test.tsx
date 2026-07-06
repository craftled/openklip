import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TranscriptSearch } from "../web/components/transcript-search.tsx";
import type { PhraseSearchMatch } from "../web/lib/phrase-search.ts";

function match(
  range: [number, number],
  ids: string[],
  fromSec: number,
  text: string
): PhraseSearchMatch {
  return { ids, range, fromSec, toSec: fromSec + ids.length, text };
}

const TWO_MATCHES = [
  match([0, 1], ["w0", "w1"], 0, "Hello, there"),
  match([3, 4], ["w3", "w4"], 3, "hello there"),
];

const noop = () => {
  // presentational test: callbacks are not exercised
};

function renderSearch(
  overrides: Partial<ComponentProps<typeof TranscriptSearch>> = {}
): string {
  return renderToStaticMarkup(
    <TranscriptSearch
      activeMatchIndex={null}
      matches={[]}
      note=""
      onCutMatches={noop}
      onNoteChange={noop}
      onQueryChange={noop}
      onSearchClear={noop}
      onSeekMatch={noop}
      onSeekNextMatch={noop}
      onSelectMatch={noop}
      query="hello there"
      {...overrides}
    />
  );
}

// The opening tag of the button that carries the given marker attribute.
function buttonTag(html: string, marker: string): string {
  const idx = html.indexOf(marker);
  assert.ok(idx >= 0, `missing ${marker} in markup`);
  const start = html.lastIndexOf("<button", idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

test("two matches render a count and an enabled Cut all with word count", () => {
  const html = renderSearch({ matches: TWO_MATCHES });
  assert.match(html, /2 matches/);
  assert.match(html, /Cut first \(2 words\)/);
  assert.match(html, /Cut all \(4 words\)/);
  assert.doesNotMatch(
    buttonTag(html, "data-transcript-search-cut-all"),
    /disabled=""/
  );
  assert.doesNotMatch(
    buttonTag(html, "data-transcript-search-cut-first"),
    /disabled=""/
  );
});

test("zero matches render a no-matches state with disabled cut buttons", () => {
  const html = renderSearch({ matches: [] });
  assert.match(html, /No matches/);
  assert.match(
    buttonTag(html, "data-transcript-search-cut-all"),
    /disabled=""/
  );
  assert.match(
    buttonTag(html, "data-transcript-search-cut-first"),
    /disabled=""/
  );
});

test("search renders kept-word cut controls only", () => {
  const html = renderSearch({ matches: TWO_MATCHES });
  assert.match(html, /Cut first \(2 words\)/);
  assert.match(html, /Cut all \(4 words\)/);
  assert.doesNotMatch(html, /Restore/);
  assert.doesNotMatch(html, /data-transcript-search-restore/);
});

test("note input is present with an accessible label", () => {
  const html = renderSearch({ matches: TWO_MATCHES });
  assert.match(html, /for="transcript-search-note"/);
  assert.match(html, /id="transcript-search-note"/);
  assert.match(html, /Cut note/);
});
