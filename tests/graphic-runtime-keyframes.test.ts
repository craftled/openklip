import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_RATE } from "../src/edl.ts";
import { evaluateKeyframes, type Keyframe } from "../src/keyframes.ts";
import {
  applyGraphicFrame,
  graphicFrameAt,
  graphicSampleOffsetAt,
} from "../web/lib/graphic-runtime.ts";

function mockGraphicRoot(): HTMLElement {
  const style: Record<string, string> = {};
  return {
    matches: (selector: string) => selector === "[data-graphic-root]",
    getAttribute: () => null,
    querySelector: () => null,
    style,
    querySelectorAll: () => [],
  } as unknown as HTMLElement;
}

function mockGraphicRootWithChild(child: HTMLElement): HTMLElement {
  const style: Record<string, string> = {};
  return {
    matches: (selector: string) => selector === "[data-graphic-root]",
    getAttribute: () => null,
    querySelector: () => null,
    style,
    querySelectorAll: (selector: string) =>
      selector === "[data-anim]" ? [child] : [],
  } as unknown as HTMLElement;
}

function mockAnimChild(): HTMLElement {
  const style: Record<string, string> = {};
  return {
    getAttribute: (name: string) => {
      switch (name) {
        case "data-anim":
          return "fade";
        case "data-in-dur":
          return "5";
        case "data-out-dur":
          return "5";
        case "data-out-frame":
          return "25";
        case "data-ease":
          return null;
        case "data-in-frame":
          return "0";
        case "data-slide":
          return null;
        default:
          return null;
      }
    },
    style,
  } as unknown as HTMLElement;
}

function kf(
  sampleOffset: number,
  property: Keyframe["property"],
  value: number,
  easing: Keyframe["easing"] = "linear"
): Keyframe {
  return { sampleOffset, property, value, easing };
}

test("evaluateKeyframes holds before first and after last", () => {
  const keyframes = [kf(4800, "opacity", 0), kf(9600, "opacity", 1)];
  assert.equal(evaluateKeyframes(keyframes, 0).opacity, 0);
  assert.equal(evaluateKeyframes(keyframes, 4800).opacity, 0);
  assert.equal(evaluateKeyframes(keyframes, 20_000).opacity, 1);
});

test("evaluateKeyframes linear interpolation between keyframes", () => {
  const keyframes = [kf(0, "opacity", 0), kf(4800, "opacity", 1, "linear")];
  assert.equal(evaluateKeyframes(keyframes, 2400).opacity, 0.5);
});

test("evaluateKeyframes uses later keyframe easing (easeOut)", () => {
  const keyframes = [kf(0, "scale", 1), kf(4800, "scale", 2, "easeOut")];
  const mid = evaluateKeyframes(keyframes, 2400).scale ?? 0;
  // easeOut at t=0.5: 1 - (0.5)^3 = 0.875 -> value 1 + 1*0.875 = 1.875
  assert.ok(Math.abs(mid - 1.875) < 0.001);
});

test("evaluateKeyframes sorts per property independently", () => {
  const keyframes = [
    kf(4800, "x", 0.5),
    kf(0, "x", 0),
    kf(2400, "opacity", 0.25),
    kf(0, "opacity", 0),
  ];
  const at = evaluateKeyframes(keyframes, 1200);
  assert.equal(at.opacity, 0.125);
  assert.equal(at.x, 0.125);
});

test("graphicSampleOffsetAt inverts graphicFrameAt frame quantization", () => {
  const fps = 30;
  const start = 100_000;
  const end = start + SAMPLE_RATE * 2;
  for (let frame = 0; frame < 60; frame++) {
    const sampleOffset = graphicSampleOffsetAt(frame, SAMPLE_RATE, fps);
    const { frame: back } = graphicFrameAt(
      start + sampleOffset,
      start,
      end,
      SAMPLE_RATE,
      fps
    );
    assert.equal(back, frame);
  }
});

test("applyGraphicFrame keyframe wrapper sets root opacity and transform", () => {
  const child = mockAnimChild();
  const root = mockGraphicRootWithChild(child);

  const keyframes = [
    kf(0, "opacity", 0.5),
    kf(48_000, "opacity", 1),
    kf(0, "x", 0.1),
    kf(48_000, "x", 0),
    kf(0, "scale", 1),
    kf(48_000, "scale", 1.2),
  ];

  applyGraphicFrame(root, 0, 60, 1080, {
    width: 1920,
    height: 1080,
    keyframes,
    sampleOffset: 0,
  });

  assert.equal(root.style.opacity, "0.5");
  assert.equal(root.style.transform, "translate(192px, 0px) scale(1)");

  const midOffset = graphicSampleOffsetAt(15, SAMPLE_RATE, 30);
  applyGraphicFrame(root, 15, 60, 1080, {
    width: 1920,
    height: 1080,
    keyframes,
    sampleOffset: midOffset,
  });

  assert.equal(root.style.opacity, "0.75");
  assert.equal(root.style.transform, "translate(96px, 0px) scale(1.1)");

  // Child data-anim still runs independently of the root wrapper.
  assert.ok((child.style as Record<string, string>).opacity.length > 0);
});

test("applyGraphicFrame keyframes are deterministic", () => {
  const root = mockGraphicRoot();

  const keyframes = [
    kf(0, "opacity", 0),
    kf(9600, "opacity", 1, "easeInOut"),
    kf(0, "y", -0.25),
    kf(9600, "y", 0.25, "easeIn"),
  ];
  const opts = {
    width: 1280,
    height: 720,
    keyframes,
    sampleOffset: 4800,
  };

  applyGraphicFrame(root, 15, 60, 720, opts);
  const first = {
    opacity: root.style.opacity,
    transform: root.style.transform,
  };
  applyGraphicFrame(root, 15, 60, 720, opts);
  const second = {
    opacity: root.style.opacity,
    transform: root.style.transform,
  };
  assert.deepEqual(first, second);
});

test("applyGraphicFrame clears wrapper when keyframes absent", () => {
  const root = mockGraphicRoot();

  applyGraphicFrame(root, 0, 30, 1080, {
    width: 1920,
    height: 1080,
    keyframes: [kf(0, "opacity", 0.5)],
    sampleOffset: 0,
  });
  assert.equal(root.style.opacity, "0.5");

  applyGraphicFrame(root, 0, 30, 1080);
  assert.equal(root.style.opacity, "");
  assert.equal(root.style.transform, "");
});
