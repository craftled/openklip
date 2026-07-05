import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineDrawer } from "../web/components/timeline-drawer.tsx";

test("TimelineDrawer renders a config-friendly timeline trigger", () => {
  const html = renderToStaticMarkup(
    <TimelineDrawer
      broll={[]}
      curSec={12.5}
      durationSamples={48_000}
      durationSec={60}
      fmtTime={(sec) => sec.toFixed(1)}
      graphics={[]}
      onClipTiming={() => undefined}
      onSeek={() => undefined}
      onSelect={() => undefined}
      onWordClick={() => undefined}
      ranges={[]}
      sampleRate={48_000}
      selected={null}
      selRange={null}
      stills={[]}
      titles={[]}
      triggerClassName="w-full"
      wordSpans={[]}
      zooms={[]}
    />
  );
  assert.match(html, /Timeline/);
  assert.match(html, /w-full/);
});
