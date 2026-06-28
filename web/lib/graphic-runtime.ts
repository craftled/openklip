// Shared graphic-overlay runtime: pure DOM + `motion` easing math, no React, no
// fs. Both the live PREVIEW (web/components/graphic-overlay.tsx) and the export
// rasterizer (rich path in src/graphic-render.ts, inside headless Chrome) call
// `applyGraphicFrame` with the SAME frame number so preview matches export.
//
// The contract a graphics/<id>/composition.html author relies on: the runtime
// injects ONE number (the current frame) and every animated value is computed
// from it (frame-purity, Remotion-style). No wall-clock, no CSS transitions,
// no animation keyframes — those desync from frame-stepped export.
import { cubicBezier, easeInOut, easeOut } from "motion";

export type EaseName = "easeOut" | "easeInOut" | "spring";

// A spring-like overshoot evaluated as a pure fn of progress t, so it is
// deterministic at any frame (motion's `spring` is a time-stepping generator,
// unsuitable for arbitrary-frame sampling). Tuned to a gentle back-out.
const springEase = cubicBezier(0.34, 1.56, 0.64, 1);

function easingFor(name: string | null): (t: number) => number {
  switch (name) {
    case "easeInOut":
      return easeInOut;
    case "spring":
      return springEase;
    default:
      return easeOut;
  }
}

function clamp01(t: number): number {
  if (t < 0) {
    return 0;
  }
  if (t > 1) {
    return 1;
  }
  return t;
}

function intAttr(el: Element, name: string, fallback: number): number {
  const raw = el.getAttribute(name);
  if (raw === null || raw === "") {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// Resolve a frame value that may be negative ("frames before the end"). A
// non-negative value is absolute; a negative value N resolves to durFrames + N.
// This is the SINGLE resolver shared by preview and export — keep it here only.
export function resolveFrame(value: number, durFrames: number): number {
  return value < 0 ? durFrames + value : value;
}

const EFFECTS = ["fade", "slideUp", "slideDown", "scaleIn", "wipe"] as const;

interface AnimState {
  ease: (t: number) => number;
  effects: string[];
  inDur: number;
  inStart: number;
  outDur: number;
  outStart: number;
  slide: number;
}

// Read the data-* animation contract off one child element, resolving defaults
// against the composition's intrinsic height and total duration in frames.
function readAnim(el: Element, durFrames: number, height: number): AnimState {
  const effects = (el.getAttribute("data-anim") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => (EFFECTS as readonly string[]).includes(s));
  const inDur = Math.max(1, intAttr(el, "data-in-dur", 5));
  const inStart = resolveFrame(intAttr(el, "data-in-frame", 0), durFrames);
  const outDur = Math.max(1, intAttr(el, "data-out-dur", inDur));
  const outStart = resolveFrame(
    intAttr(el, "data-out-frame", durFrames - outDur),
    durFrames
  );
  const slide = intAttr(el, "data-slide", Math.round(height * 0.04));
  return {
    effects,
    inStart,
    inDur,
    outStart,
    outDur,
    ease: easingFor(el.getAttribute("data-ease")),
    slide,
  };
}

// Inject bound params into [data-bind] elements (textContent, auto-escaped by
// the DOM). Idempotent — safe to call whenever params change.
export function applyGraphicParams(
  root: HTMLElement,
  params: Record<string, string | number | boolean>
): void {
  const bound = root.querySelectorAll<HTMLElement>("[data-bind]");
  for (const el of Array.from(bound)) {
    const key = el.getAttribute("data-bind");
    if (key && key in params) {
      el.textContent = String(params[key]);
    }
  }
  // Propagate an `accent` param to a CSS variable the templates read via
  // var(--accent, ...), matching the titles.ts accent treatment.
  if (typeof params.accent === "string") {
    root.style.setProperty("--accent", params.accent);
  }
}

// Compute and write opacity/transform/clip-path for each animated child from a
// single frame number. Called once per preview rAF tick and once per export
// frame, so the visual result is bit-identical across both.
export function applyGraphicFrame(
  root: HTMLElement,
  frame: number,
  durFrames: number,
  height: number
): void {
  const children = root.querySelectorAll<HTMLElement>("[data-anim]");
  for (const el of Array.from(children)) {
    const a = readAnim(el, durFrames, height);
    const pIn = a.ease(clamp01((frame - a.inStart) / a.inDur));
    const pOut = a.ease(clamp01((frame - a.outStart) / a.outDur));

    let opacity = 1;
    let translateY = 0;
    let scale = 1;
    let clip = "";

    for (const effect of a.effects) {
      switch (effect) {
        case "fade":
          opacity = pIn * (1 - pOut);
          break;
        case "slideUp":
          translateY = (1 - pIn) * a.slide + pOut * a.slide;
          break;
        case "slideDown":
          translateY = -((1 - pIn) * a.slide) - pOut * a.slide;
          break;
        case "scaleIn":
          scale = 0.92 + 0.08 * pIn;
          break;
        case "wipe": {
          const inset = (1 - pIn) * 100;
          clip = `inset(0 ${inset}% 0 0)`;
          break;
        }
        default:
          break;
      }
    }

    el.style.opacity = String(opacity);
    el.style.transform = `translateY(${translateY}px) scale(${scale})`;
    if (clip) {
      el.style.clipPath = clip;
    }
  }
}

// Derive the frame/time fields from the canonical sample grid. Pinned here so
// preview and export quantize identically (Math.floor for frame).
export function graphicFrameAt(
  curSample: number,
  startSample: number,
  endSample: number,
  sampleRate: number,
  fps: number
): { frame: number; durFrames: number } {
  const localSec = (curSample - startSample) / sampleRate;
  const durSec = (endSample - startSample) / sampleRate;
  return {
    frame: Math.floor(localSec * fps),
    durFrames: Math.max(1, Math.round(durSec * fps)),
  };
}
