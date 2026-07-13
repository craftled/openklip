import assert from "node:assert/strict";
import { test } from "node:test";
import type { MulticamProvenance } from "@engine/cam-mix";
import { DEFAULT_CAM_SWITCH_SETTINGS, type PlanSpan } from "@engine/cam-plan";
import type { Cam } from "@engine/cams";
import { SAMPLE_RATE } from "@engine/edl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CamSwitchPanelView } from "../web/components/cam-switch-panel.tsx";

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

function plan(spans: PlanSpan[]): MulticamProvenance["plan"] {
  return spans;
}

function multicam(
  overrides: Partial<MulticamProvenance> = {}
): MulticamProvenance {
  return {
    version: 1,
    mode: "follow",
    settings: {
      minShotMs: 2000,
      interjectionMs: 700,
      leadMs: 250,
      maxShotMs: 25_000,
      snapMs: 120,
      wide: "auto",
    },
    plan: [],
    cams: [],
    attributions: [],
    plannedBy: "follow",
    plannedAt: "2026-07-01T10:00:00.000Z",
    programAudio: { masterMix: null },
    ...overrides,
  };
}

const noop = () => {
  // presentational test: callbacks are not exercised
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof CamSwitchPanelView>> = {}
): string {
  return renderToStaticMarkup(
    <CamSwitchPanelView
      addCamBusy={false}
      addCamError={null}
      addCamName=""
      addCamProgress={null}
      addCamRole="speaker"
      cams={[]}
      loadingCams={false}
      mixError={null}
      mixing={false}
      mode="follow"
      multicam={null}
      onAddCamFile={noop}
      onAddCamNameChange={noop}
      onAddCamRoleChange={noop}
      onCamNameChange={noop}
      onCamOffsetChange={noop}
      onCamOverride={noop}
      onCamRoleChange={noop}
      onModeChange={noop}
      onRemix={noop}
      onSettingsChange={noop}
      onToggleCamAudio={noop}
      playingCamId={null}
      settings={DEFAULT_CAM_SWITCH_SETTINGS}
      slug="demo"
      {...overrides}
    />
  );
}

function tagWith(html: string, marker: string, tag = "button"): string {
  const idx = html.indexOf(marker);
  assert.ok(idx >= 0, `missing ${marker} in markup`);
  const start = html.lastIndexOf(`<${tag}`, idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

function radioWith(html: string, mode: string): string {
  const marker = `data-cam-mode="${mode}"`;
  const idx = html.indexOf(marker);
  assert.ok(idx >= 0, `missing ${marker} in markup`);
  const labelEnd = html.indexOf(">", idx);
  const inputStart = html.indexOf("<input", labelEnd);
  const inputEnd = html.indexOf(">", inputStart);
  return html.slice(inputStart, inputEnd + 1);
}

test("mode picker highlights follow when provenance mode is follow", () => {
  const html = renderPanel({
    mode: "follow",
    multicam: multicam({ mode: "follow" }),
  });
  assert.match(html, /data-cam-mode-picker/);
  const follow = radioWith(html, "follow");
  assert.match(follow, /checked=""/);
  const auto = radioWith(html, "auto");
  assert.ok(!auto.includes('checked=""'));
});

test("mode picker highlights auto when provenance mode is auto", () => {
  const html = renderPanel({
    mode: "auto",
    multicam: multicam({ mode: "auto" }),
  });
  const auto = radioWith(html, "auto");
  assert.match(auto, /checked=""/);
});

test("mix timeline renders one segment per plan span with proportional widths", () => {
  const html = renderPanel({
    cams: [
      cam({ id: "cam1", name: "Speaker 1" }),
      cam({ id: "cam2", name: "Speaker 2" }),
    ],
    mode: "auto",
    multicam: multicam({
      mode: "auto",
      plan: plan([
        { fromSample: 0, toSample: sec(6), shot: "cam1" },
        { fromSample: sec(6), toSample: sec(10), shot: "cam2" },
      ]),
    }),
  });
  assert.match(html, /data-cam-mix-timeline/);
  const segmentCount = html.split("data-cam-mix-span=").length - 1;
  assert.equal(segmentCount, 2);
  assert.match(html, /data-cam-mix-span-width="60"/);
  assert.match(html, /data-cam-mix-span-width="40"/);
});

test("mix timeline legend lists each speaker cam and Wide", () => {
  const html = renderPanel({
    cams: [
      cam({ id: "cam1", name: "Speaker 1" }),
      cam({ id: "cam2", name: "Speaker 2" }),
      cam({ id: "cam3", name: "Wide", role: "wide" }),
    ],
    mode: "auto",
    multicam: multicam({
      mode: "auto",
      plan: plan([
        { fromSample: 0, toSample: sec(4), shot: "cam1" },
        { fromSample: sec(4), toSample: sec(8), shot: "wide" },
      ]),
    }),
  });
  assert.match(html, /data-cam-legend/);
  assert.match(html, /Spk 1/);
  assert.match(html, /Spk 2/);
  assert.match(html, /Wide/);
});

test("cam row renders editable name field wired for updates", () => {
  const html = renderPanel({
    cams: [cam({ id: "cam1", name: "Alice" })],
  });
  assert.match(html, /data-cam-row/);
  assert.match(html, /data-cam-name="cam1"/);
  assert.match(html, /value="Alice"/);
});

test("re-mix button is disabled while mixing is pending", () => {
  const html = renderPanel({
    cams: [cam({ id: "cam1" }), cam({ id: "cam2", name: "Speaker 2" })],
    mixing: true,
  });
  const tag = tagWith(html, "data-cam-remix");
  assert.ok(tag.includes('disabled=""'));
});

test("re-mix button is enabled when not mixing and at least two speaker cams exist", () => {
  const html = renderPanel({
    cams: [cam({ id: "cam1" }), cam({ id: "cam2", name: "Speaker 2" })],
    mixing: false,
  });
  const tag = tagWith(html, "data-cam-remix");
  assert.ok(!tag.includes('disabled=""'));
});

test("add camera control renders upload affordance", () => {
  const html = renderPanel();
  assert.match(html, /data-cam-add/);
  assert.match(html, /Add camera/);
  assert.match(html, /data-cam-add-file/);
});

test("guardrail settings render mix controls with defaults", () => {
  const html = renderPanel({
    settings: DEFAULT_CAM_SWITCH_SETTINGS,
  });
  assert.match(html, /data-cam-guardrails/);
  assert.match(html, /Mix guardrails/);
  assert.match(html, /data-cam-wide/);
});

test("cam row renders editable offset field wired for updates", () => {
  const html = renderPanel({
    cams: [cam({ id: "cam1", name: "Alice", offsetMs: -120 })],
  });
  assert.match(html, /data-cam-offset="cam1"/);
  assert.match(html, /value="-120"/);
});

test("empty state points users to add camera control", () => {
  const html = renderPanel({ cams: [], loadingCams: false });
  assert.match(html, /data-cam-empty/);
  assert.match(html, /Add a camera file above/);
});

test("mix timeline renders in follow mode when a plan exists", () => {
  const html = renderPanel({
    cams: [
      cam({ id: "cam1", name: "Speaker 1" }),
      cam({ id: "cam2", name: "Speaker 2" }),
    ],
    mode: "follow",
    multicam: multicam({
      mode: "follow",
      plan: plan([
        { fromSample: 0, toSample: sec(6), shot: "cam1" },
        { fromSample: sec(6), toSample: sec(10), shot: "cam2" },
      ]),
    }),
  });
  assert.match(html, /data-cam-mix-timeline/);
});

test("cam override form renders when multicam provenance exists", () => {
  const html = renderPanel({
    cams: [cam({ id: "cam1" }), cam({ id: "cam2", name: "Speaker 2" })],
    multicam: multicam({ mode: "follow" }),
  });
  assert.match(html, /data-cam-override-form/);
  assert.match(html, /Lock shot span/);
  assert.match(html, /data-cam-override-apply/);
});
