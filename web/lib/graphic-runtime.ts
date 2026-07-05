// Shared graphic-overlay runtime: pure DOM + `motion` easing math, no React, no
// fs. Both the live PREVIEW (web/components/graphic-overlay.tsx) and the export
// rasterizer (rich path in src/graphic-render.ts, inside headless Chrome) call
// `applyGraphicFrame` with the SAME frame number so preview matches export.
//
// The contract a graphics/<id>/composition.html author relies on: the runtime
// injects ONE number (the current frame) and every animated value is computed
// from it (frame-purity, Remotion-style). No wall-clock, no CSS transitions,
// no animation keyframes. Those desync from frame-stepped export.

import { ShaderMount } from "@paper-design/shaders";
import { cubicBezier, easeInOut, easeOut } from "motion";
import type { Keyframe } from "../../src/keyframes.ts";
import { evaluateKeyframes } from "../../src/keyframes.ts";
import { loadGraphicImage } from "./graphic-image-cache.ts";
import {
  SHADER_IDS,
  type ShaderId,
  shaderSpecFor,
} from "./paper-shader-specs.ts";

export { ensureGraphicImagesReady } from "./graphic-image-cache.ts";

export interface GraphicFrameOptions {
  height: number;
  keyframes?: Keyframe[];
  sampleOffset?: number;
  width: number;
}

export type EaseName = "easeOut" | "easeInOut" | "spring";
type GraphicParamValue = string | number | boolean;
type GraphicParams = Record<string, GraphicParamValue>;
interface ShaderState {
  mount: ShaderMount;
  shaderId: ShaderId;
  speed: number;
}

const shaderStates = new WeakMap<HTMLElement, ShaderState>();
const CANVAS_CONTEXT: WebGLContextAttributes = {
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
};

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

function shaderHosts(root: HTMLElement): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  if (root.getAttribute("data-shader")) {
    hosts.push(root);
  }
  for (const node of Array.from(
    root.querySelectorAll<HTMLElement>("[data-shader]")
  )) {
    hosts.push(node);
  }
  return hosts;
}

function fpsForHost(host: HTMLElement): number {
  const nearest = host.closest("[data-fps]");
  if (nearest) {
    return intAttr(nearest, "data-fps", 30);
  }
  return 30;
}

function mountOrUpdateShader(host: HTMLElement, params: GraphicParams): void {
  const shaderId = host.getAttribute("data-shader");
  if (!(shaderId && SHADER_IDS.includes(shaderId as ShaderId))) {
    return;
  }
  const spec = shaderSpecFor(shaderId as ShaderId, params);
  const current = shaderStates.get(host);
  if (!current || current.shaderId !== shaderId) {
    current?.mount.dispose();
    const mount = new ShaderMount(
      host,
      spec.fragmentShader,
      spec.uniforms,
      CANVAS_CONTEXT,
      0,
      0
    );
    shaderStates.set(host, {
      mount,
      shaderId: shaderId as ShaderId,
      speed: spec.speed,
    });
    return;
  }
  current.mount.setUniforms(spec.uniforms);
  current.speed = spec.speed;
}

function applyShaderFrame(root: HTMLElement, frame: number): void {
  for (const host of shaderHosts(root)) {
    const state = shaderStates.get(host);
    if (!state) {
      continue;
    }
    const fps = fpsForHost(host);
    const frameMs = ((frame * state.speed) / Math.max(1, fps)) * 1000;
    state.mount.setFrame(frameMs);
  }
}

export function disposeGraphicRuntime(root: HTMLElement): void {
  for (const host of shaderHosts(root)) {
    const state = shaderStates.get(host);
    if (!state) {
      continue;
    }
    state.mount.dispose();
    shaderStates.delete(host);
  }
}

// Resolve a frame value that may be negative ("frames before the end"). A
// non-negative value is absolute; a negative value N resolves to durFrames + N.
// This is the SINGLE resolver shared by preview and export. Keep it here only.
export function resolveFrame(value: number, durFrames: number): number {
  return value < 0 ? durFrames + value : value;
}

const EFFECTS = [
  "fade",
  "slideUp",
  "slideDown",
  "scaleIn",
  "wipe",
  "typewriter",
  "blurReveal",
  "shimmer",
  "glitch",
  "kineticBuild",
  "rollNumber",
] as const;

// Effects that animate per-text-unit (child spans from a data-split) rather
// than the whole [data-anim] element. fade/slideUp join this set only when
// data-split is explicitly present on the element (see applyGraphicFrame).
const SPLIT_UNIT_EFFECTS = [
  "fade",
  "slideUp",
  "typewriter",
  "blurReveal",
  "glitch",
  "kineticBuild",
] as const;

interface AnimState {
  ease: (t: number) => number;
  effects: string[];
  inDur: number;
  inStart: number;
  outDur: number;
  outStart: number;
  slide: number;
  stagger: number;
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
  const stagger = intAttr(
    el,
    "data-stagger",
    effects.includes("typewriter") ? 2 : 0
  );
  return {
    effects,
    inStart,
    inDur,
    outStart,
    outDur,
    ease: easingFor(el.getAttribute("data-ease")),
    slide,
    stagger,
  };
}

// Deterministic sin-hash in [0,1). No Math.random, keeps glitch frame-pure.
export function hash01(a: number, b: number, c: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43_758.5453;
  return x - Math.floor(x);
}

function mod(x: number, n: number): number {
  return ((x % n) + n) % n;
}

// Per-unit progress for a text-split animation: unit i lags the element's
// in-start by i*stagger frames, then eases over inDur frames.
export function unitProgress(
  frame: number,
  inStart: number,
  inDur: number,
  stagger: number,
  i: number,
  ease: (t: number) => number
): number {
  return ease(clamp01((frame - inStart - i * stagger) / inDur));
}

interface MotionUnitOpts {
  amp: number;
  frame: number;
  i: number;
  maxBlur: number;
  p: number;
  pOut: number;
  slide: number;
}

interface MotionUnitStyle {
  filter: string;
  opacity: number;
  textShadow: string;
  transform: string;
}

// Pure per-unit style math for the split-capable effects, factored out so it
// is testable without a DOM. applyGraphicFrame is a thin wrapper that feeds
// this from real elements and writes the result to el.style.
export function motionUnitStyle(
  effects: readonly string[],
  opts: MotionUnitOpts
): MotionUnitStyle {
  const { p, pOut, frame, i, maxBlur, amp, slide } = opts;
  let opacity = 1;
  let translateY = 0;
  let translateX = 0;
  let scale = 1;
  let rotate = 0;
  let filter = "";
  let textShadow = "";

  for (const effect of effects) {
    switch (effect) {
      case "fade":
        opacity = p * (1 - pOut);
        break;
      case "slideUp":
        translateY = (1 - p) * slide + pOut * slide;
        break;
      case "typewriter":
        opacity = p > 0 ? 1 : 0;
        break;
      case "blurReveal":
        filter = `blur(${(1 - p) * maxBlur}px)`;
        opacity = p;
        translateY = (1 - p) * slide * 0.3;
        break;
      case "glitch": {
        const step = Math.floor(frame / 2);
        const active = hash01(step, i, 1) < 0.4 * (1 - p);
        if (active) {
          translateX = (hash01(step, i, 2) - 0.5) * 2 * amp;
          const s = 2 * (1 - p) + 0.5;
          textShadow = `${-s}px 0 rgba(255,0,80,0.8), ${s}px 0 rgba(0,255,255,0.8)`;
        } else {
          translateX = 0;
          textShadow = "";
        }
        opacity = clamp01(p * 3) * (1 - pOut);
        break;
      }
      case "kineticBuild":
        scale = 0.6 + 0.4 * p;
        opacity = p * (1 - pOut);
        rotate = (i % 2 === 0 ? 1 : -1) * (1 - p) * 4;
        break;
      default:
        break;
    }
  }

  const transform = `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotate}deg) scale(${scale})`;

  return { opacity, transform, filter, textShadow };
}

// Split an element's text into `<span data-unit>` children, tracking the
// source text in data-split-src so a later external textContent write (from
// applyGraphicParams rebinding [data-bind]) can be detected and re-split.
function ensureSplit(el: HTMLElement, mode: "char" | "word"): void {
  const existing = el.querySelectorAll<HTMLElement>("[data-unit]");
  if (existing.length > 0) {
    return;
  }
  // Preserve markup children (e.g. a typewriter [data-caret]) that live
  // alongside the plain text being split; only the text itself is replaced
  // by unit spans.
  const preserved = Array.from(
    el.querySelectorAll<HTMLElement>("[data-caret]")
  );
  const text = el.textContent ?? "";
  el.setAttribute("data-split-src", text);
  const doc = el.ownerDocument;
  el.textContent = "";

  const makeUnit = (content: string): HTMLElement => {
    const span = doc.createElement("span");
    span.setAttribute("data-unit", "");
    span.style.display = "inline-block";
    if (mode === "char") {
      span.style.whiteSpace = "pre";
    }
    span.textContent = content;
    return span;
  };

  if (mode === "char") {
    for (const ch of text.split("")) {
      el.appendChild(makeUnit(ch));
    }
  } else {
    const words = text.split(" ");
    words.forEach((word, idx) => {
      if (word.length > 0) {
        el.appendChild(makeUnit(word));
      }
      if (idx < words.length - 1) {
        el.appendChild(doc.createTextNode(" "));
      }
    });
  }

  for (const caret of preserved) {
    el.appendChild(caret);
  }
}

// Inject bound params into [data-bind] elements (textContent, auto-escaped by
// the DOM). Idempotent, safe to call whenever params change.
export function applyGraphicParams(
  root: HTMLElement,
  params: GraphicParams
): void {
  const bound = root.querySelectorAll<HTMLElement>("[data-bind]");
  for (const el of Array.from(bound)) {
    const key = el.getAttribute("data-bind");
    if (key && key in params) {
      el.textContent = String(params[key]);
    }
  }
  if (typeof params.accent === "string") {
    root.style.setProperty("--accent", params.accent);
  }
  for (const host of shaderHosts(root)) {
    mountOrUpdateShader(host, params);
    const shaderId = host.getAttribute("data-shader");
    const src = params._imageSrc;
    if (
      typeof src === "string" &&
      src.length > 0 &&
      shaderId &&
      SHADER_IDS.includes(shaderId as ShaderId)
    ) {
      void loadGraphicImage(src, { heatmap: shaderId === "heatmap" }).then(
        () => {
          mountOrUpdateShader(host, params);
        }
      );
    }
  }
  const timingBound = root.querySelectorAll<HTMLElement>("[data-timing-bind]");
  for (const el of Array.from(timingBound)) {
    if (typeof params.staggerFrames === "number") {
      el.setAttribute("data-stagger", String(Math.round(params.staggerFrames)));
    }
    if (typeof params.inDurFrames === "number") {
      el.setAttribute("data-in-dur", String(Math.round(params.inDurFrames)));
    }
  }
}

// Compute and write opacity/transform/clip-path for each animated child from a
// single frame number. Called once per preview rAF tick and once per export
// frame, so the visual result is bit-identical across both. Optional keyframes
// apply a wrapper transform on [data-graphic-root] on top of child data-anim.
export function applyGraphicFrame(
  root: HTMLElement,
  frame: number,
  durFrames: number,
  height: number,
  options?: GraphicFrameOptions
): void {
  applyShaderFrame(root, frame);
  const children = root.querySelectorAll<HTMLElement>("[data-anim]");
  for (const el of Array.from(children)) {
    const a = readAnim(el, durFrames, height);
    const pIn = a.ease(clamp01((frame - a.inStart) / a.inDur));
    const pOut = a.ease(clamp01((frame - a.outStart) / a.outDur));

    const splitMode = el.getAttribute("data-split");
    const canSplit = splitMode === "char" || splitMode === "word";
    if (canSplit) {
      ensureSplit(el, splitMode);
    }
    const units = canSplit
      ? Array.from(el.querySelectorAll<HTMLElement>("[data-unit]"))
      : [];
    const splitActive = canSplit && units.length > 0;

    const unitEffects = splitActive
      ? a.effects.filter((e) =>
          (SPLIT_UNIT_EFFECTS as readonly string[]).includes(e)
        )
      : [];
    const elementEffects = a.effects.filter((e) => !unitEffects.includes(e));

    if (splitActive && unitEffects.length > 0) {
      const maxBlur = intAttr(el, "data-blur", 12);
      const amp = intAttr(el, "data-glitch-amp", 8);
      units.forEach((unit, i) => {
        const p = unitProgress(frame, a.inStart, a.inDur, a.stagger, i, a.ease);
        const style = motionUnitStyle(unitEffects, {
          p,
          pOut,
          frame,
          i,
          maxBlur,
          amp,
          slide: a.slide,
        });
        unit.style.opacity = String(style.opacity);
        unit.style.transform = style.transform;
        unit.style.filter = style.filter;
        unit.style.textShadow = style.textShadow;
      });
    }

    if (unitEffects.includes("typewriter")) {
      // Carets live as SIBLINGS of the animated span, not inside it: a
      // [data-bind] rebind rewrites textContent and would destroy a nested
      // caret. Search the parent container so the sibling layout works.
      const period = intAttr(el, "data-caret-period", 16);
      const caretScope = el.parentElement ?? el;
      const carets = caretScope.querySelectorAll<HTMLElement>("[data-caret]");
      for (const caret of Array.from(carets)) {
        const on = mod(frame, period) < period / 2 ? 1 : 0;
        caret.style.opacity = String(on * (1 - pOut));
      }
    }

    let opacity = 1;
    let translateY = 0;
    let scale = 1;
    let clip = "";
    let backgroundPosition = "";

    for (const effect of elementEffects) {
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
        case "shimmer": {
          opacity = pIn * (1 - pOut);
          const sweepDur = Math.max(1, intAttr(el, "data-sweep-dur", 30));
          const loopDur = intAttr(el, "data-loop-dur", 0);
          const shimmerT =
            loopDur > 0
              ? clamp01(mod(frame - a.inStart, loopDur) / sweepDur)
              : clamp01((frame - a.inStart) / sweepDur);
          backgroundPosition = `${-100 + 200 * shimmerT}% 0`;
          break;
        }
        case "rollNumber": {
          if (el.getAttribute("data-roll-target") === null) {
            el.setAttribute("data-roll-target", el.textContent ?? "0");
          } else {
            const lastAttr = el.getAttribute("data-roll-last");
            if (lastAttr !== null && el.textContent !== lastAttr) {
              el.setAttribute(
                "data-roll-target",
                String(Number(el.textContent))
              );
            }
          }
          const from = intAttr(el, "data-roll-from", 0);
          const target = Number(el.getAttribute("data-roll-target"));
          const displayed = Math.round(from + (target - from) * pIn);
          el.textContent = String(displayed);
          el.setAttribute("data-roll-last", String(displayed));
          opacity = 1 * (1 - pOut);
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
    el.style.backgroundPosition = backgroundPosition;
  }

  applyKeyframeWrapper(root, height, options);
}

function applyKeyframeWrapper(
  root: HTMLElement,
  height: number,
  options?: GraphicFrameOptions
): void {
  const graphicRoot = root.matches("[data-graphic-root]")
    ? root
    : root.querySelector<HTMLElement>("[data-graphic-root]");
  if (!graphicRoot) {
    return;
  }

  const keyframes = options?.keyframes;
  if (!keyframes?.length || options?.sampleOffset === undefined) {
    graphicRoot.style.opacity = "";
    graphicRoot.style.transform = "";
    return;
  }

  const width = options.width;
  const props = evaluateKeyframes(keyframes, options.sampleOffset);
  const opacity = props.opacity ?? 1;
  const scale = props.scale ?? 1;
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  graphicRoot.style.opacity = String(opacity);
  graphicRoot.style.transform = `translate(${x * width}px, ${y * height}px) scale(${scale})`;
}

// Map an overlay-local frame index to the canonical sample offset used by
// evaluateKeyframes. Matches graphicFrameAt's floor quantization in reverse.
export function graphicSampleOffsetAt(
  frame: number,
  sampleRate: number,
  fps: number
): number {
  return Math.floor((frame * sampleRate) / fps);
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
