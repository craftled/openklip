import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listExportPlatforms,
  resolvePlatformOptions,
} from "@engine/export-platforms";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildExportOptions,
  effectiveMaxHeight,
  estimateExportOutput,
  outputDimensionsForMaxHeight,
  resolveGifMaxWidthSubmission,
} from "../web/components/export-dialog.tsx";
import {
  ExportOptionsForm,
  platformFormValues,
} from "../web/components/export-options-form.tsx";

// The full ExportDialog only mounts its content in a portal when opened, so the
// options form is extracted into a presentational component (the
// empty-workspace-main.tsx precedent) and rendered statically here.
function renderForm(
  overrides: Partial<Parameters<typeof ExportOptionsForm>[0]> = {}
): string {
  return renderToStaticMarkup(
    <ExportOptionsForm
      compression="social"
      destination="file"
      dims={{ width: 1280, height: 720 }}
      format="mp4"
      frameRate="source"
      onCompressionChange={() => undefined}
      onDestinationChange={() => undefined}
      onFormatChange={() => undefined}
      onFrameRateChange={() => undefined}
      onGifMaxWidthChange={() => undefined}
      onPlatformChange={() => undefined}
      onResolutionChange={() => undefined}
      platform="manual"
      resolution="4k"
      sourceFps={30}
      {...overrides}
    />
  );
}

// The attribute segment of the <button> whose children start with `label`.
function buttonAttrs(html: string, label: string): string {
  const chunk = html
    .split("<button")
    .find((piece) => piece.includes(`>${label}<`));
  assert.ok(chunk, `no button rendering "${label}"`);
  return chunk.slice(0, chunk.indexOf(">"));
}

// React renders a disabled button as `disabled=""` (see toggle-group.test.tsx);
// a bare substring check would false-positive on Tailwind `disabled:` classes.
function isDisabledButton(attrs: string): boolean {
  return (
    attrs.includes('disabled=""') || attrs.includes('aria-disabled="true"')
  );
}

test("compression presets render as enabled toggle items", () => {
  const html = renderForm();
  for (const label of ["Studio", "Social Media", "Web", "Web (Low)"]) {
    assert.ok(
      !isDisabledButton(buttonAttrs(html, label)),
      `compression item "${label}" should be enabled`
    );
  }
});

test("frame-rate select offers a Source option at the source fps", () => {
  const html = renderForm();
  assert.match(html, /Source \(30 fps\)/);
});

test("compression and frame-rate groups drop the coming-soon copy", () => {
  const html = renderForm();
  assert.doesNotMatch(html, /coming soon/i);
});

test("destination and format toggles are enabled (no longer out of scope)", () => {
  const html = renderForm();
  for (const label of ["File", "Clipboard", "MP4", "GIF"]) {
    assert.ok(
      !isDisabledButton(buttonAttrs(html, label)),
      `"${label}" should be enabled`
    );
  }
});

test("GIF format selection shows a no-audio hint", () => {
  const html = renderForm({ format: "gif" });
  assert.match(html, /no audio/i);
});

test("estimateExportOutput uses a separate GIF profile", () => {
  const mp4 = estimateExportOutput({
    compression: "social",
    durationSec: 60,
    dims: { width: 1280, height: 720 },
    format: "mp4",
    sourceFps: 30,
    sourceHeight: 720,
    sourceWidth: 1280,
  });
  const gif = estimateExportOutput({
    compression: "social",
    durationSec: 60,
    dims: { width: 1280, height: 720 },
    format: "gif",
    sourceFps: 30,
    sourceHeight: 720,
    sourceWidth: 1280,
  });
  assert.notEqual(gif.outputBytes, mp4.outputBytes);
  assert.notEqual(gif.exportTimeSec, mp4.exportTimeSec);
  assert.match(gif.note ?? "", /GIF estimate/i);
});

test("MP4 format selection does not show the no-audio hint", () => {
  const html = renderForm({ format: "mp4" });
  assert.doesNotMatch(html, /no audio/i);
});

test("GIF max width override control renders for GIF format", () => {
  const html = renderForm({ format: "gif" });
  assert.match(html, /max width/i);
});

test("GIF max width override control does not render for MP4 format", () => {
  const html = renderForm({ format: "mp4" });
  assert.doesNotMatch(html, /max width/i);
});

test("Clipboard destination selection shows a path-only hint", () => {
  const html = renderForm({ destination: "clipboard" });
  assert.match(html, /exported file path, not the video itself/i);
});

test("File destination selection does not show the clipboard path hint", () => {
  const html = renderForm({ destination: "file" });
  assert.doesNotMatch(html, /exported file path, not the video itself/i);
});

// ── Format/destination payload assembly (pure, portal-free) ────────────────

const baseExportState = {
  compression: "social" as const,
  destination: "file" as const,
  format: "mp4" as const,
  frameRate: "source",
  maxHeight: undefined,
  platform: "manual" as const,
  resolution: "4k" as const,
};

test("buildExportOptions submits format: gif when GIF is selected", () => {
  const options = buildExportOptions({ ...baseExportState, format: "gif" });
  assert.equal(options.format, "gif");
});

test("buildExportOptions submits format: mp4 by default", () => {
  const options = buildExportOptions(baseExportState);
  assert.equal(options.format, "mp4");
});

test("buildExportOptions submits destination: clipboard when Clipboard is selected", () => {
  const options = buildExportOptions({
    ...baseExportState,
    destination: "clipboard",
  });
  assert.equal(options.destination, "clipboard");
});

test("buildExportOptions submits destination: file by default", () => {
  const options = buildExportOptions(baseExportState);
  assert.equal(options.destination, "file");
});

test("buildExportOptions includes gifMaxWidth when GIF format has a custom width", () => {
  const options = buildExportOptions({
    ...baseExportState,
    format: "gif",
    gifMaxWidth: 500,
  });
  assert.equal(options.gifMaxWidth, 500);
});

test("buildExportOptions omits gifMaxWidth when left at default/empty", () => {
  const options = buildExportOptions({ ...baseExportState, format: "gif" });
  assert.equal(options.gifMaxWidth, undefined);
});

test("buildExportOptions omits gifMaxWidth when the input matches the 960 default", () => {
  const options = buildExportOptions({
    ...baseExportState,
    format: "gif",
    gifMaxWidth: 960,
  });
  assert.equal(options.gifMaxWidth, undefined);
});

test("buildExportOptions omits gifMaxWidth for mp4 format even with a width set", () => {
  const options = buildExportOptions({
    ...baseExportState,
    format: "mp4",
    gifMaxWidth: 500,
  });
  assert.equal(options.gifMaxWidth, undefined);
});

// ── resolveGifMaxWidthSubmission (pure "what to submit" resolution) ────────

test("resolveGifMaxWidthSubmission: empty string is undefined", () => {
  assert.equal(resolveGifMaxWidthSubmission("", "gif"), undefined);
});

test("resolveGifMaxWidthSubmission: undefined input is undefined", () => {
  assert.equal(resolveGifMaxWidthSubmission(undefined, "gif"), undefined);
});

test("resolveGifMaxWidthSubmission: a value matching the 960 default is undefined", () => {
  assert.equal(resolveGifMaxWidthSubmission("960", "gif"), undefined);
  assert.equal(resolveGifMaxWidthSubmission(960, "gif"), undefined);
});

test("resolveGifMaxWidthSubmission: the 1920 ceiling passes through unchanged", () => {
  assert.equal(resolveGifMaxWidthSubmission("1920", "gif"), 1920);
});

test("resolveGifMaxWidthSubmission: an in-range custom value passes through unchanged", () => {
  assert.equal(resolveGifMaxWidthSubmission("500", "gif"), 500);
});

test("resolveGifMaxWidthSubmission: an out-of-range value clamps to the 1920 ceiling", () => {
  assert.equal(resolveGifMaxWidthSubmission("5000", "gif"), 1920);
});

// Zero/negative input is clamped to 1 rather than treated as equivalent to
// empty: a user who explicitly typed "0" gets a deterministic, in-range
// value instead of silently reverting to the untouched default.
test("resolveGifMaxWidthSubmission: zero clamps to 1", () => {
  assert.equal(resolveGifMaxWidthSubmission("0", "gif"), 1);
});

test("resolveGifMaxWidthSubmission: a negative value clamps to 1", () => {
  assert.equal(resolveGifMaxWidthSubmission("-50", "gif"), 1);
});

test("resolveGifMaxWidthSubmission: non-GIF format is always undefined regardless of value", () => {
  assert.equal(resolveGifMaxWidthSubmission("500", "mp4"), undefined);
  assert.equal(resolveGifMaxWidthSubmission("1920", "mp4"), undefined);
  assert.equal(resolveGifMaxWidthSubmission(undefined, "mp4"), undefined);
});

test("platform row renders Manual plus one chip per export platform", () => {
  const html = renderForm();
  assert.ok(
    !isDisabledButton(buttonAttrs(html, "Manual")),
    'platform item "Manual" should be enabled'
  );
  for (const def of listExportPlatforms()) {
    assert.ok(
      !isDisabledButton(buttonAttrs(html, def.label)),
      `platform item "${def.label}" should be enabled`
    );
  }
});

test("platformFormValues maps youtube-4k to visible 4K, studio, Source fps", () => {
  const def = listExportPlatforms().find((p) => p.id === "youtube-4k");
  assert.ok(def, "youtube-4k platform must exist");
  const values = platformFormValues(def);
  assert.equal(values.resolution, "4k");
  assert.equal(values.compression, "studio");
  assert.equal(values.fpsValue, "source");
});

test("platformFormValues maps x platform to visible 1080p, web, 30 fps", () => {
  const def = listExportPlatforms().find((p) => p.id === "x");
  assert.ok(def, "x platform must exist");
  const values = platformFormValues(def);
  assert.equal(values.resolution, "1080");
  assert.equal(values.compression, "web");
  assert.equal(values.fpsValue, "30");
});

test("LUFS note renders under an active platform with a loudness target", () => {
  const html = renderForm({ platform: "youtube" });
  assert.match(html, /Loudness normalized to -14 LUFS for this export/);
});

test("LUFS note does not render when Manual is selected", () => {
  const html = renderForm({ platform: "manual" });
  assert.doesNotMatch(html, /Loudness normalized/);
});

// ── Platform-aware effective maxHeight (WYSIWYG for platform presets) ──────

test("effectiveMaxHeight keeps Manual+Source source-native (undefined), never forced to a number", () => {
  assert.equal(effectiveMaxHeight("manual", "4k", 2988), undefined);
});

test("effectiveMaxHeight keeps plain Manual resolution buckets unchanged", () => {
  assert.equal(effectiveMaxHeight("manual", "1080", 2988), 1080);
  assert.equal(effectiveMaxHeight("manual", "720", 2988), 720);
});

test("effectiveMaxHeight uses youtube-4k's real 2160 ceiling (capped at source) when resolution is left on its auto-picked 4k bucket", () => {
  assert.equal(effectiveMaxHeight("youtube-4k", "4k", 2988), 2160);
  // A 1080p source can't be upscaled to 2160: honest cap at source.
  assert.equal(effectiveMaxHeight("youtube-4k", "4k", 1080), 1080);
});

test("effectiveMaxHeight: an explicit 720/1080 resolution pick still wins over an active platform's own ceiling", () => {
  assert.equal(effectiveMaxHeight("youtube-4k", "1080", 2988), 1080);
  assert.equal(effectiveMaxHeight("youtube-4k", "720", 2988), 720);
});

test("outputDimensionsForMaxHeight caps a tall source at youtube-4k's real ceiling, preserving aspect ratio", () => {
  const maxHeight = effectiveMaxHeight("youtube-4k", "4k", 2988);
  const dims = outputDimensionsForMaxHeight(maxHeight, 5312, 2988);
  assert.deepEqual(dims, { width: 3840, height: 2160 });
});

test("outputDimensionsForMaxHeight cannot upscale a source smaller than the platform ceiling", () => {
  const maxHeight = effectiveMaxHeight("youtube-4k", "4k", 1080);
  const dims = outputDimensionsForMaxHeight(maxHeight, 1920, 1080);
  assert.deepEqual(dims, { width: 1920, height: 1080 });
});

test("outputDimensionsForMaxHeight is a source-dims no-op for Manual+Source", () => {
  const maxHeight = effectiveMaxHeight("manual", "4k", 2988);
  const dims = outputDimensionsForMaxHeight(maxHeight, 5312, 2988);
  assert.deepEqual(dims, { width: 5312, height: 2988 });
});

test("outputDimensionsForMaxHeight uses 9:16 aspect for vertical export", () => {
  const dims = outputDimensionsForMaxHeight(1080, 1920, 1080, "9:16");
  assert.deepEqual(dims, { width: 608, height: 1080 });
});

test("shorts platform chip renders in the export form", () => {
  const html = renderForm();
  const def = listExportPlatforms().find((p) => p.id === "shorts");
  assert.ok(def, "shorts platform must exist");
  assert.ok(html.includes(def.label));
});

// ── Client/server agreement: dialog's effectiveMaxHeight vs resolvePlatformOptions ──

test("dialog's youtube-4k maxHeight agrees with the server's resolvePlatformOptions on a 1080p source", () => {
  const dialogMax = effectiveMaxHeight("youtube-4k", "4k", 1080);
  assert.equal(dialogMax, 1080);
  const resolved = resolvePlatformOptions("youtube-4k", {
    maxHeight: dialogMax,
  });
  assert.equal(resolved.maxHeight, 1080);
});

test("dialog's youtube-4k maxHeight agrees with the server's resolvePlatformOptions on a 5312x2988 source", () => {
  const dialogMax = effectiveMaxHeight("youtube-4k", "4k", 2988);
  assert.equal(dialogMax, 2160);
  const resolved = resolvePlatformOptions("youtube-4k", {
    maxHeight: dialogMax,
  });
  assert.equal(resolved.maxHeight, 2160);
});
