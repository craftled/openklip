import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CleanupSilenceWaveform } from "../web/components/cleanup-silence-waveform.tsx";

test("silence waveform strip uses theme-aware outline CSS variable", () => {
  const html = renderToStaticMarkup(
    <CleanupSilenceWaveform
      buckets={[
        [-0.2, 0.2],
        [-0.5, 0.5],
      ]}
      candidate={{
        category: "dead-air",
        endSec: 3,
        estSavedSec: 1,
        id: "da-1",
        kind: "dead-air",
        reason: "silence",
        risk: "review",
        startSec: 2,
        text: "",
        wordIds: [],
      }}
      keepPadSec={0.15}
      minSec={0.7}
      window={{ fromSec: 1, toSec: 4 }}
    />
  );
  assert.match(html, /data-cleanup-silence-waveform/);
  assert.match(html, /--cleanup-waveform-outline:oklch\(0_0_0\/0\.1\)/);
  assert.match(
    html,
    /dark:\[--cleanup-waveform-outline:oklch\(1_0_0\/0\.1\)\]/
  );
  assert.match(html, /outline-\[var\(--cleanup-waveform-outline\)\]/);
});
