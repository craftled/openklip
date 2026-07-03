// Shared graphic-overlay runtime: pure DOM + `motion` easing math, no React, no
// fs. Both the live PREVIEW (web/components/graphic-overlay.tsx) and the export
// rasterizer (rich path in src/graphic-render.ts, inside headless Chrome) call
// `applyGraphicFrame` with the SAME frame number so preview matches export.
//
// The contract a graphics/<id>/composition.html author relies on: the runtime
// injects ONE number (the current frame) and every animated value is computed
// from it (frame-purity, Remotion-style). No wall-clock, no CSS transitions,
// no animation keyframes. Those desync from frame-stepped export.

import {
  DitheringShapes,
  DitheringTypes,
  defaultObjectSizing,
  ditheringFragmentShader,
  GrainGradientShapes,
  getShaderColorFromString,
  getShaderNoiseTexture,
  grainGradientFragmentShader,
  meshGradientFragmentShader,
  ShaderFitOptions,
  ShaderMount,
} from "@paper-design/shaders";
import { cubicBezier, easeInOut, easeOut } from "motion";

export type EaseName = "easeOut" | "easeInOut" | "spring";
type GraphicParamValue = string | number | boolean;
type GraphicParams = Record<string, GraphicParamValue>;
type ShaderId = "meshGradient" | "grainGradient" | "dithering";

interface ShaderSpec {
  fragmentShader: string;
  speed: number;
  uniforms: Record<
    string,
    boolean | number | number[] | number[][] | HTMLImageElement | undefined
  >;
}

interface ShaderState {
  mount: ShaderMount;
  shaderId: ShaderId;
  speed: number;
}

const SHADER_IDS: readonly ShaderId[] = [
  "meshGradient",
  "grainGradient",
  "dithering",
];
const shaderStates = new WeakMap<HTMLElement, ShaderState>();
const DEFAULT_SHADER_COLORS = ["#c084fc", "#67e8f9", "#818cf8"];
const DEFAULT_GRAIN_BACK = "#090f1f";
const DEFAULT_DITHER_BACK = "#ffffff";
const DEFAULT_DITHER_FRONT = "#0f172a";
const CANVAS_CONTEXT: WebGLContextAttributes = {
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
};
const MIN_SCALE = 0.01;
const MAX_SCALE = 4;
const MIN_SIZE = 0.5;
const MAX_SIZE = 20;

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

function numberParam(
  value: GraphicParamValue | undefined,
  fallback: number
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function parseColorList(value: GraphicParamValue | undefined): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function shaderColorUniforms(
  value: GraphicParamValue | undefined,
  fallback: readonly string[],
  maxColors: number
): number[][] {
  const parsed = parseColorList(value);
  const candidates = parsed.length > 0 ? parsed : [...fallback];
  return candidates
    .slice(0, maxColors)
    .map((color) => getShaderColorFromString(color));
}

function fitUniform(value: GraphicParamValue | undefined): number {
  if (typeof value === "string" && value in ShaderFitOptions) {
    return ShaderFitOptions[value as keyof typeof ShaderFitOptions];
  }
  return ShaderFitOptions[defaultObjectSizing.fit];
}

function baseSizingUniforms(params: GraphicParams): Record<string, number> {
  return {
    u_fit: fitUniform(params.fit),
    u_scale: clamp(
      numberParam(params.scale, defaultObjectSizing.scale),
      MIN_SCALE,
      MAX_SCALE
    ),
    u_rotation: numberParam(params.rotation, defaultObjectSizing.rotation),
    u_originX: numberParam(params.originX, defaultObjectSizing.originX),
    u_originY: numberParam(params.originY, defaultObjectSizing.originY),
    u_offsetX: numberParam(params.offsetX, defaultObjectSizing.offsetX),
    u_offsetY: numberParam(params.offsetY, defaultObjectSizing.offsetY),
    u_worldWidth: numberParam(
      params.worldWidth,
      defaultObjectSizing.worldWidth
    ),
    u_worldHeight: numberParam(
      params.worldHeight,
      defaultObjectSizing.worldHeight
    ),
  };
}

export function shaderSpecFor(
  shaderId: ShaderId,
  params: GraphicParams
): ShaderSpec {
  const speed = numberParam(params.speed, 1);
  const sizing = baseSizingUniforms(params);
  switch (shaderId) {
    case "meshGradient": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        10
      );
      return {
        fragmentShader: meshGradientFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colors: colors,
          u_colorsCount: colors.length,
          u_distortion: clamp(numberParam(params.distortion, 0.35), 0, 1),
          u_swirl: clamp(numberParam(params.swirl, 0.2), 0, 1),
          u_grainMixer: clamp(numberParam(params.grainMixer, 0.15), 0, 1),
          u_grainOverlay: clamp(numberParam(params.grainOverlay, 0.12), 0, 1),
        },
      };
    }
    case "grainGradient": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        7
      );
      const shape =
        typeof params.shape === "string" && params.shape in GrainGradientShapes
          ? GrainGradientShapes[
              params.shape as keyof typeof GrainGradientShapes
            ]
          : GrainGradientShapes.wave;
      return {
        fragmentShader: grainGradientFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: getShaderColorFromString(
            typeof params.colorBack === "string"
              ? params.colorBack
              : DEFAULT_GRAIN_BACK
          ),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_softness: clamp(numberParam(params.softness, 0.65), 0, 1),
          u_intensity: clamp(numberParam(params.intensity, 0.4), 0, 1),
          u_noise: clamp(numberParam(params.noise, 0.25), 0, 1),
          u_shape: shape,
          u_noiseTexture: getShaderNoiseTexture(),
        },
      };
    }
    case "dithering": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        2
      );
      const shape =
        typeof params.shape === "string" && params.shape in DitheringShapes
          ? DitheringShapes[params.shape as keyof typeof DitheringShapes]
          : DitheringShapes.warp;
      const type =
        typeof params.type === "string" && params.type in DitheringTypes
          ? DitheringTypes[params.type as keyof typeof DitheringTypes]
          : DitheringTypes["4x4"];
      const back = colors[0] ?? getShaderColorFromString(DEFAULT_DITHER_BACK);
      const front = colors[1] ?? getShaderColorFromString(DEFAULT_DITHER_FRONT);
      return {
        fragmentShader: ditheringFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: back,
          u_colorFront: front,
          u_shape: shape,
          u_type: type,
          u_pxSize: clamp(numberParam(params.size, 2.5), MIN_SIZE, MAX_SIZE),
        },
      };
    }
    default: {
      throw new Error(`unsupported shader id: ${String(shaderId)}`);
    }
  }
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
  // Propagate an `accent` param to a CSS variable the templates read via
  // var(--accent, ...), matching the titles.ts accent treatment.
  if (typeof params.accent === "string") {
    root.style.setProperty("--accent", params.accent);
  }
  for (const host of shaderHosts(root)) {
    mountOrUpdateShader(host, params);
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
  applyShaderFrame(root, frame);
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
