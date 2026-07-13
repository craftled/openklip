import assert from "node:assert/strict";
import { test } from "node:test";
import type { Cam } from "@engine/cams";
import { SAMPLE_RATE } from "@engine/edl";
import { renderToStaticMarkup } from "react-dom/server";
import { CamRowView } from "../web/components/cam-row.tsx";

const sec = (n: number) => Math.round(n * SAMPLE_RATE);

function cam(overrides: Partial<Cam> & { id: string }): Cam {
  return {
    id: overrides.id,
    name: overrides.name ?? "Speaker 1",
    role: overrides.role ?? "speaker",
    source: `/tmp/${overrides.id}.mp4`,
    proxy: "proxy.mp4",
    audio: "audio16k.f32",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 320,
    height: 240,
    durationSamples: sec(12),
    offsetMs: 0,
    ingestedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

const noop = () => {
  // presentational test: callbacks are not exercised
};

function render(playing: boolean): string {
  const c = cam({ id: "cam1" });
  return renderToStaticMarkup(
    <CamRowView
      cam={c}
      cams={[c]}
      index={0}
      onNameChange={noop}
      onOffsetChange={noop}
      onRoleChange={noop}
      onToggleAudio={noop}
      playing={playing}
      slug="demo"
    />
  );
}

test("the audio play/pause icon animates through the IconSwap primitive", () => {
  const html = render(false);
  assert.match(html, /data-slot="icon-swap"/);
});

test("the play affordance labels toggle with the playing state", () => {
  assert.match(render(false), /Play Speaker 1 audio/);
  assert.match(render(true), /Pause Speaker 1 audio/);
});
