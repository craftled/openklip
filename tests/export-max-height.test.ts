import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveExportMaxHeight } from "../web/lib/export-max-height.ts";

test("resolveExportMaxHeight trusts a numeric dialog maxHeight verbatim", () => {
  assert.equal(resolveExportMaxHeight(2160, true, true), 2160);
  assert.equal(resolveExportMaxHeight(2160, true, false), 2160);
});

test("resolveExportMaxHeight keeps Manual+Source source-native (undefined) when the dialog supplied options", () => {
  assert.equal(resolveExportMaxHeight(undefined, true, true), undefined);
  assert.equal(resolveExportMaxHeight(undefined, true, false), undefined);
});

test("youtube-4k as the first export of a session is not forced to 1080 by a stale export1080 default", () => {
  // Pre-fix, web/app.tsx computed
  // `options?.maxHeight ?? (export1080 ? 1080 : undefined)`. export1080
  // defaults to true (web/app.tsx `useState(true)`), so the very first export
  // of a session, before any manual toggle, had export1080 still true. When
  // the dialog submitted youtube-4k with maxHeight 2160, that legacy fallback
  // never even ran (options?.maxHeight was already 2160, so `??` short
  // circuited) -- the real bug was when maxHeight came back undefined for a
  // platform that meant "cap at 2160", which the OLD dialog (pre finding-2
  // fix) produced for youtube-4k. Simulating that exact pre-fix input here:
  // dialogMaxHeight undefined, hasDialogOptions true, export1080 still
  // defaulted true. The fixed helper must return undefined (trust the
  // dialog), never silently substitute 1080.
  const dialogMaxHeightPreFix = undefined;
  const hasDialogOptions = true;
  const export1080StillDefaultTrue = true;
  const result = resolveExportMaxHeight(
    dialogMaxHeightPreFix,
    hasDialogOptions,
    export1080StillDefaultTrue
  );
  assert.notEqual(result, 1080);
  assert.equal(result, undefined);
});

test("resolveExportMaxHeight falls back to export1080 only when there is no dialog options object at all", () => {
  // This is the CinemaPlayer toolbar Export button (web/components/cinema-player.tsx),
  // which calls onExport() with zero arguments, bypassing the dialog entirely.
  // That path has no per-export maxHeight of its own, so it is the one
  // legitimate remaining use of the export1080 toggle.
  assert.equal(resolveExportMaxHeight(undefined, false, true), 1080);
  assert.equal(resolveExportMaxHeight(undefined, false, false), undefined);
});
