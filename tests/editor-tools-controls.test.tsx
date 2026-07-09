import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AudioDrawer } from "../web/components/audio-drawer.tsx";
import { TimelineDrawer } from "../web/components/timeline-drawer.tsx";

test("AudioDrawer renders an improve-sound trigger", () => {
  const html = renderToStaticMarkup(
    <AudioDrawer
      applying={false}
      audio={{
        deEsser: { enabled: false, intensity: 0.5 },
        ducking: {
          amountDb: 12,
          attackMs: 80,
          enabled: false,
          releaseMs: 400,
        },
        loudness: { enabled: false, mode: "single", targetLufs: -14 },
        noiseReduction: { enabled: false, nr: 12 },
        voiceHighpass: { enabled: false, hz: 80 },
      }}
      onPatchAudio={() => undefined}
      onPatchSnap={() => undefined}
      snap={{
        crossfadeMs: 0,
        enabled: false,
        maxShiftMs: 120,
        mode: "off",
      }}
    />
  );
  assert.match(html, /Improve sound/);
});

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
