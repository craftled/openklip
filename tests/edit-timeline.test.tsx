import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EditTimeline,
  type TimelineClip,
} from "../web/components/edit-timeline.tsx";

const clipWithKeyframe: TimelineClip = {
  endSample: 48_000,
  endSec: 1,
  id: "clip-1",
  keyframes: [
    { easing: "linear", property: "opacity", sampleOffset: 24_000, value: 1 },
  ],
  label: "Clip 1",
  startSample: 0,
  startSec: 0,
};

function renderTimeline() {
  return renderToStaticMarkup(
    <EditTimeline
      broll={[clipWithKeyframe]}
      curSec={0}
      durationSamples={48_000}
      durationSec={1}
      graphics={[]}
      onClipTiming={() => undefined}
      onSeek={() => undefined}
      onSelect={() => undefined}
      onWordClick={() => undefined}
      ranges={[{ endSec: 1, startSec: 0 }]}
      sampleRate={48_000}
      selected={null}
      selRange={null}
      stills={[]}
      titles={[]}
      wordSpans={[]}
      zooms={[]}
    />
  );
}

// better-ui principle 13 (minimum hit area): the zoom-out/zoom-in toolbar
// buttons carry a "size-6" override on top of an icon-sm Button, which
// clobbers the Button's own responsive size (44px mobile baseline). Dropping
// the override restores it.
test("EditTimeline zoom in/out toolbar buttons have no size-6 override, so the Button's own responsive icon-sm size applies", () => {
  const html = renderTimeline();
  const zoomOut = html.match(/<button[^>]*aria-label="Zoom out"[^>]*>/)?.[0];
  const zoomIn = html.match(/<button[^>]*aria-label="Zoom in"[^>]*>/)?.[0];
  assert.ok(zoomOut, "zoom out button renders");
  assert.ok(zoomIn, "zoom in button renders");
  assert.doesNotMatch(zoomOut as string, /size-6\b/);
  assert.doesNotMatch(zoomIn as string, /size-6\b/);
  assert.match(zoomOut as string, /size-11\b/);
  assert.match(zoomIn as string, /size-11\b/);
});

// The resize-start drag handle is a 6px-wide (HANDLE_W) button with no grab
// slop; widen the horizontal grab zone via a pseudo-element without changing
// the visible width (set inline via style, not a class).
test("EditTimeline resize-start handle gets horizontal grab slop via a pseudo-element", () => {
  const html = renderTimeline();
  const handle = html.match(/<button[^>]*data-handle="start"[^>]*>/)?.[0];
  assert.ok(handle, "resize-start handle renders");
  assert.match(handle as string, /after:absolute/);
  assert.match(handle as string, /after:inset-y-0/);
  assert.match(handle as string, /after:-inset-x-1\.5/);
  // Visible width stays HANDLE_W via inline style.
  assert.match(handle as string, /style="width:6px"/);
});

// The trim-dot (keyframe marker) is a 6px (size-1.5) rotated dot isolated at
// the clip edge, safe to expand generously without colliding with neighbors.
test("EditTimeline trim-dot (keyframe marker) gets a generous pseudo-element hit area", () => {
  const html = renderTimeline();
  const dot = html.match(/<button[^>]*aria-label="Keyframe[^"]*"[^>]*>/)?.[0];
  assert.ok(dot, "trim-dot renders");
  assert.match(dot as string, /after:absolute/);
  assert.match(dot as string, /after:-inset-2\.5/);
  // Visible dot stays size-1.5 and rotated.
  assert.match(dot as string, /size-1\.5\b/);
  assert.match(dot as string, /rotate-45\b/);
});
