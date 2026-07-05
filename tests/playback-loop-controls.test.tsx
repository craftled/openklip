import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaybackLoopControls } from "../web/components/playback-loop-controls.tsx";

test("PlaybackLoopControls renders kept-time counter and loop buttons", () => {
  const html = renderToStaticMarkup(
    <PlaybackLoopControls
      curSec={12.5}
      fmtTime={(sec) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${String(s).padStart(2, "0")}`;
      }}
      fullDurationSec={120}
      keptDurationSec={61}
      loop={null}
      onClearLoop={() => undefined}
      onSetLoop={() => undefined}
      outPos={0}
    />
  );
  assert.match(html, /data-playback-loop-section/);
  assert.match(html, /0:00 \/ 1:01/);
  assert.match(html, />In</);
  assert.match(html, />Out</);
});

test("PlaybackLoopControls shows active loop clear affordance", () => {
  const html = renderToStaticMarkup(
    <PlaybackLoopControls
      curSec={20}
      fmtTime={(sec) => sec.toFixed(1)}
      fullDurationSec={120}
      keptDurationSec={61}
      loop={{ inSec: 10, outSec: 25 }}
      onClearLoop={() => undefined}
      onSetLoop={() => undefined}
      outPos={15}
    />
  );
  assert.match(html, /Loop 10\.0–25\.0/);
});
