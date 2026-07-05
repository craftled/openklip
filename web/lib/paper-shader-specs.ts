// Single source of truth for all Paper Design shader parameters, defaults, and
// uniform mapping. Used by graphic-runtime.ts (preview) and graphic-render.ts
// (headless Chrome export). Both callers invoke shaderSpecFor with the same
// params so preview and export are bit-identical.

import {
  colorPanelsFragmentShader,
  DitheringShapes,
  DitheringTypes,
  DotGridShapes,
  defaultObjectSizing,
  defaultPatternSizing,
  ditheringFragmentShader,
  dotGridFragmentShader,
  dotOrbitFragmentShader,
  emptyPixel,
  flutedGlassFragmentShader,
  GemSmokeShapes,
  GlassDistortionShapes,
  GlassGridShapes,
  GrainGradientShapes,
  gemSmokeFragmentShader,
  getShaderColorFromString,
  getShaderNoiseTexture,
  godRaysFragmentShader,
  grainGradientFragmentShader,
  halftoneCmykFragmentShader,
  HalftoneCmykTypes,
  halftoneDotsFragmentShader,
  HalftoneDotsGrids,
  HalftoneDotsTypes,
  heatmapFragmentShader,
  imageDitheringFragmentShader,
  LiquidMetalShapes,
  liquidMetalFragmentShader,
  meshGradientFragmentShader,
  metaballsFragmentShader,
  neuroNoiseFragmentShader,
  PulsingBorderAspectRatios,
  paperTextureFragmentShader,
  perlinNoiseFragmentShader,
  pulsingBorderFragmentShader,
  ShaderFitOptions,
  simplexNoiseFragmentShader,
  smokeRingFragmentShader,
  spiralFragmentShader,
  staticMeshGradientFragmentShader,
  staticRadialGradientFragmentShader,
  swirlFragmentShader,
  voronoiFragmentShader,
  WarpPatterns,
  warpFragmentShader,
  waterFragmentShader,
  wavesFragmentShader,
} from "@paper-design/shaders";
import {
  getCachedGraphicImage,
  imageAspectFromCached,
} from "./graphic-image-cache.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ShaderId =
  | "meshGradient"
  | "grainGradient"
  | "dithering"
  | "colorPanels"
  | "dotGrid"
  | "dotOrbit"
  | "gemSmoke"
  | "godRays"
  | "liquidMetal"
  | "metaballs"
  | "neuroNoise"
  | "paperTexture"
  | "perlinNoise"
  | "pulsingBorder"
  | "simplexNoise"
  | "smokeRing"
  | "spiral"
  | "staticMeshGradient"
  | "staticRadialGradient"
  | "swirl"
  | "voronoi"
  | "warp"
  | "water"
  | "waves"
  | "flutedGlass"
  | "halftoneCmyk"
  | "halftoneDots"
  | "heatmap"
  | "imageDithering";

export const SHADER_IDS: readonly ShaderId[] = [
  "meshGradient",
  "grainGradient",
  "dithering",
  "colorPanels",
  "dotGrid",
  "dotOrbit",
  "gemSmoke",
  "godRays",
  "liquidMetal",
  "metaballs",
  "neuroNoise",
  "paperTexture",
  "perlinNoise",
  "pulsingBorder",
  "simplexNoise",
  "smokeRing",
  "spiral",
  "staticMeshGradient",
  "staticRadialGradient",
  "swirl",
  "voronoi",
  "warp",
  "water",
  "waves",
  "flutedGlass",
  "halftoneCmyk",
  "halftoneDots",
  "heatmap",
  "imageDithering",
];

export type GraphicParams = Record<string, string | number | boolean>;

type GraphicParamValue = string | number | boolean | undefined;

interface ShaderSpec {
  fragmentShader: string;
  speed: number;
  uniforms: Record<
    string,
    boolean | number | number[] | number[][] | HTMLImageElement | undefined
  >;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SHADER_COLORS = ["#c084fc", "#67e8f9", "#818cf8"] as const;
const DEFAULT_GRAIN_BACK = "#090f1f";
const DEFAULT_DITHER_BACK = "#ffffff";
const DEFAULT_DITHER_FRONT = "#0f172a";

const MIN_SCALE = 0.01;
const MAX_SCALE = 4;
const MIN_SIZE = 0.5;
const MAX_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numberParam(value: GraphicParamValue, fallback: number): number {
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

function clamp01(t: number): number {
  if (t < 0) {
    return 0;
  }
  if (t > 1) {
    return 1;
  }
  return t;
}

function parseColorList(value: GraphicParamValue): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function shaderColorUniforms(
  value: GraphicParamValue,
  fallback: readonly string[],
  maxColors: number
): number[][] {
  const parsed = parseColorList(value);
  const candidates = parsed.length > 0 ? parsed : [...fallback];
  return candidates
    .slice(0, maxColors)
    .map((color) => getShaderColorFromString(color));
}

function fitUniform(value: GraphicParamValue): number {
  if (typeof value === "string" && value in ShaderFitOptions) {
    return ShaderFitOptions[value as keyof typeof ShaderFitOptions];
  }
  return ShaderFitOptions[defaultObjectSizing.fit];
}

function fitUniformPattern(value: GraphicParamValue): number {
  if (typeof value === "string" && value in ShaderFitOptions) {
    return ShaderFitOptions[value as keyof typeof ShaderFitOptions];
  }
  return ShaderFitOptions[defaultPatternSizing.fit];
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

function patternSizingUniforms(params: GraphicParams): Record<string, number> {
  return {
    u_fit: fitUniformPattern(params.fit),
    u_scale: clamp(
      numberParam(params.scale, defaultPatternSizing.scale),
      MIN_SCALE,
      MAX_SCALE
    ),
    u_rotation: numberParam(params.rotation, defaultPatternSizing.rotation),
    u_originX: numberParam(params.originX, defaultPatternSizing.originX),
    u_originY: numberParam(params.originY, defaultPatternSizing.originY),
    u_offsetX: numberParam(params.offsetX, defaultPatternSizing.offsetX),
    u_offsetY: numberParam(params.offsetY, defaultPatternSizing.offsetY),
    u_worldWidth: numberParam(
      params.worldWidth,
      defaultPatternSizing.worldWidth
    ),
    u_worldHeight: numberParam(
      params.worldHeight,
      defaultPatternSizing.worldHeight
    ),
  };
}

function enumParam<T extends Record<string, number>>(
  enumObj: T,
  value: GraphicParamValue,
  fallbackKey: keyof T
): number {
  if (typeof value === "string" && value in enumObj) {
    return enumObj[value as keyof T];
  }
  return enumObj[fallbackKey];
}

function colorParam(value: GraphicParamValue, fallback: string): number[] {
  return getShaderColorFromString(typeof value === "string" ? value : fallback);
}

function getNoiseTexture(): HTMLImageElement | undefined {
  return getShaderNoiseTexture();
}

let _emptyPixelCache: HTMLImageElement | undefined;

function emptyPixelImage(): HTMLImageElement | undefined {
  if (typeof window === "undefined") {
    return;
  }
  if (!_emptyPixelCache) {
    _emptyPixelCache = new Image();
    _emptyPixelCache.src = emptyPixel;
  }
  return _emptyPixelCache;
}

function imageUniform(
  params: GraphicParams,
  shaderId: ShaderId
): HTMLImageElement | undefined {
  const src = params._imageSrc;
  if (typeof src === "string" && src.length > 0) {
    return getCachedGraphicImage(src, shaderId) ?? emptyPixelImage();
  }
  return emptyPixelImage();
}

function imageAspectUniform(
  params: GraphicParams,
  shaderId: ShaderId
): number {
  return imageAspectFromCached(params, shaderId);
}

// ---------------------------------------------------------------------------
// Main spec factory
// ---------------------------------------------------------------------------

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
      return {
        fragmentShader: grainGradientFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, DEFAULT_GRAIN_BACK),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_softness: clamp01(numberParam(params.softness, 0.65)),
          u_intensity: clamp01(numberParam(params.intensity, 0.4)),
          u_noise: clamp01(numberParam(params.noise, 0.25)),
          u_shape: enumParam(GrainGradientShapes, params.shape, "wave"),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "dithering": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        2
      );
      const back = colors[0] ?? colorParam(undefined, DEFAULT_DITHER_BACK);
      const front = colors[1] ?? colorParam(undefined, DEFAULT_DITHER_FRONT);
      return {
        fragmentShader: ditheringFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: back,
          u_colorFront: front,
          u_shape: enumParam(DitheringShapes, params.shape, "warp"),
          u_type: enumParam(DitheringTypes, params.type, "4x4"),
          u_pxSize: clamp(numberParam(params.size, 2.5), MIN_SIZE, MAX_SIZE),
        },
      };
    }

    case "colorPanels": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        7
      );
      return {
        fragmentShader: colorPanelsFragmentShader,
        speed: numberParam(params.speed, 0.5),
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_density: numberParam(params.density, 3),
          u_length: numberParam(params.length, 1.1),
          u_angle1: numberParam(params.angle1, 0),
          u_angle2: numberParam(params.angle2, 0),
          u_edges: typeof params.edges === "boolean" ? params.edges : false,
          u_blur: clamp01(numberParam(params.blur, 0)),
          u_fadeIn: clamp01(numberParam(params.fadeIn, 0)),
          u_fadeOut: clamp01(numberParam(params.fadeOut, 0)),
          u_gradient: clamp01(numberParam(params.gradient, 0)),
        },
      };
    }

    case "dotGrid": {
      const pSizing = patternSizingUniforms(params);
      return {
        fragmentShader: dotGridFragmentShader,
        speed: 0,
        uniforms: {
          ...pSizing,
          u_colorBack: colorParam(params.colorBack, "#ffffff"),
          u_colorFill: colorParam(params.colorFill, "#000000"),
          u_colorStroke: colorParam(params.colorStroke, "#000000"),
          u_dotSize: clamp(numberParam(params.size, 2), 1, 100),
          u_gapX: clamp(numberParam(params.gapX, 32), 2, 500),
          u_gapY: clamp(numberParam(params.gapY, 32), 2, 500),
          u_strokeWidth: clamp(numberParam(params.strokeWidth, 0), 0, 50),
          u_sizeRange: clamp01(numberParam(params.sizeRange, 0)),
          u_opacityRange: clamp01(numberParam(params.opacityRange, 0)),
          u_shape: enumParam(DotGridShapes, params.shape, "circle"),
        },
      };
    }

    case "dotOrbit": {
      const pSizing = patternSizingUniforms(params);
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        10
      );
      return {
        fragmentShader: dotOrbitFragmentShader,
        speed,
        uniforms: {
          ...pSizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_spreading: clamp01(numberParam(params.spreading, 1)),
          u_size: clamp01(numberParam(params.size, 1)),
          u_sizeRange: clamp01(numberParam(params.sizeRange, 0)),
          u_stepsPerColor: clamp(numberParam(params.stepsPerColor, 4), 1, 4),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "gemSmoke": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        6
      );
      const hasImage =
        typeof params._imageSrc === "string" && params._imageSrc.length > 0;
      return {
        fragmentShader: gemSmokeFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_image: imageUniform(params, "gemSmoke"),
          u_imageAspectRatio: imageAspectUniform(params, "gemSmoke"),
          u_isImage: hasImage,
          u_shape: enumParam(GemSmokeShapes, params.shape, "diamond"),
          u_innerDistortion: clamp01(numberParam(params.innerDistortion, 0.5)),
          u_outerDistortion: clamp01(numberParam(params.outerDistortion, 0.1)),
          u_outerGlow: clamp01(numberParam(params.outerGlow, 0.55)),
          u_innerGlow: clamp01(numberParam(params.innerGlow, 1)),
          u_colorInner: colorParam(params.colorInner, "#000000"),
          u_offset: numberParam(params.offset, 0),
          u_angle: numberParam(params.angle, 0),
          u_size: clamp01(numberParam(params.size, 1)),
        },
      };
    }

    case "godRays": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        5
      );
      return {
        fragmentShader: godRaysFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colorBloom: colorParam(params.colorBloom, "#c084fc"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_intensity: clamp01(numberParam(params.intensity, 0.8)),
          u_density: clamp01(numberParam(params.density, 0.3)),
          u_bloom: clamp01(numberParam(params.bloom, 0.4)),
          u_spotty: clamp01(numberParam(params.spotty, 0)),
          u_midSize: clamp01(numberParam(params.midSize, 0)),
          u_midIntensity: clamp01(numberParam(params.midIntensity, 0)),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "liquidMetal": {
      const hasImage =
        typeof params._imageSrc === "string" && params._imageSrc.length > 0;
      return {
        fragmentShader: liquidMetalFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colorTint: colorParam(params.colorTint, "#ffffff"),
          u_image: imageUniform(params, "liquidMetal"),
          u_imageAspectRatio: imageAspectUniform(params, "liquidMetal"),
          u_isImage: hasImage,
          u_shape: enumParam(LiquidMetalShapes, params.shape, "diamond"),
          u_distortion: clamp01(numberParam(params.distortion, 0.07)),
          u_repetition: clamp(numberParam(params.repetition, 2), 1, 10),
          u_softness: clamp01(numberParam(params.softness, 0.5)),
          u_shiftRed: clamp(numberParam(params.shiftRed, 0), -1, 1),
          u_shiftBlue: clamp(numberParam(params.shiftBlue, 0), -1, 1),
          u_contour: clamp01(numberParam(params.contour, 0)),
          u_angle: numberParam(params.angle, 0),
        },
      };
    }

    case "metaballs": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        8
      );
      return {
        fragmentShader: metaballsFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_count: clamp(numberParam(params.count, 10), 1, 20),
          u_size: clamp01(numberParam(params.size, 0.83)),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "neuroNoise": {
      return {
        fragmentShader: neuroNoiseFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorFront: colorParam(params.colorFront, "#c084fc"),
          u_colorMid: colorParam(params.colorMid, "#67e8f9"),
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_brightness: clamp01(numberParam(params.brightness, 0.5)),
          u_contrast: clamp01(numberParam(params.contrast, 0.5)),
        },
      };
    }

    case "paperTexture": {
      return {
        fragmentShader: paperTextureFragmentShader,
        speed: 0,
        uniforms: {
          ...sizing,
          u_image: emptyPixelImage(),
          u_imageAspectRatio: numberParam(params.imageAspectRatio, 1),
          u_colorFront: colorParam(params.colorFront, "#ffffff"),
          u_colorBack: colorParam(params.colorBack, "#f5f0e8"),
          u_contrast: clamp01(numberParam(params.contrast, 0.3)),
          u_roughness: clamp01(numberParam(params.roughness, 0)),
          u_fiber: clamp01(numberParam(params.fiber, 0.3)),
          u_fiberSize: clamp01(numberParam(params.fiberSize, 0.5)),
          u_crumples: clamp01(numberParam(params.crumples, 0)),
          u_crumpleSize: clamp01(numberParam(params.crumpleSize, 0.5)),
          u_folds: clamp01(numberParam(params.folds, 0.65)),
          u_foldCount: clamp(numberParam(params.foldCount, 5), 1, 15),
          u_fade: clamp01(numberParam(params.fade, 0)),
          u_drops: clamp01(numberParam(params.drops, 0)),
          u_seed: clamp(numberParam(params.seed, 0), 0, 1000),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "perlinNoise": {
      return {
        fragmentShader: perlinNoiseFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorFront: colorParam(params.colorFront, "#c084fc"),
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_proportion: clamp01(numberParam(params.proportion, 0.5)),
          u_softness: clamp01(numberParam(params.softness, 0.5)),
          u_octaveCount: clamp(numberParam(params.octaveCount, 4), 1, 8),
          u_persistence: clamp(numberParam(params.persistence, 0.5), 0.3, 1),
          u_lacunarity: clamp(numberParam(params.lacunarity, 2), 1.5, 10),
        },
      };
    }

    case "pulsingBorder": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        5
      );
      const margin = numberParam(params.margin, 0);
      return {
        fragmentShader: pulsingBorderFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_roundness: clamp01(numberParam(params.roundness, 0.25)),
          u_thickness: clamp01(numberParam(params.thickness, 0.1)),
          u_softness: clamp01(numberParam(params.softness, 0.1)),
          u_marginLeft: numberParam(params.marginLeft, margin),
          u_marginRight: numberParam(params.marginRight, margin),
          u_marginTop: numberParam(params.marginTop, margin),
          u_marginBottom: numberParam(params.marginBottom, margin),
          u_aspectRatio: enumParam(
            PulsingBorderAspectRatios,
            params.aspectRatio,
            "auto"
          ),
          u_intensity: clamp01(numberParam(params.intensity, 0.5)),
          u_bloom: clamp01(numberParam(params.bloom, 0)),
          u_spots: clamp(numberParam(params.spots, 1), 1, 20),
          u_spotSize: clamp01(numberParam(params.spotSize, 0.5)),
          u_pulse: clamp01(numberParam(params.pulse, 0.25)),
          u_smoke: clamp01(numberParam(params.smoke, 0)),
          u_smokeSize: clamp01(numberParam(params.smokeSize, 0.5)),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "simplexNoise": {
      const pSizing = patternSizingUniforms(params);
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        10
      );
      return {
        fragmentShader: simplexNoiseFragmentShader,
        speed,
        uniforms: {
          ...pSizing,
          u_colors: colors,
          u_colorsCount: colors.length,
          u_stepsPerColor: clamp(numberParam(params.stepsPerColor, 2), 1, 10),
          u_softness: clamp01(numberParam(params.softness, 0.5)),
        },
      };
    }

    case "smokeRing": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        10
      );
      return {
        fragmentShader: smokeRingFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_noiseScale: clamp(numberParam(params.noiseScale, 1), 0.01, 5),
          u_thickness: clamp01(numberParam(params.thickness, 0.5)),
          u_radius: clamp01(numberParam(params.radius, 0.5)),
          u_innerShape: clamp(numberParam(params.innerShape, 0), 0, 4),
          u_noiseIterations: clamp(
            numberParam(params.noiseIterations, 4),
            1,
            8
          ),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "spiral": {
      return {
        fragmentShader: spiralFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colorFront: colorParam(params.colorFront, "#c084fc"),
          u_density: clamp01(numberParam(params.density, 0.5)),
          u_distortion: clamp01(numberParam(params.distortion, 0.3)),
          u_strokeWidth: clamp01(numberParam(params.strokeWidth, 0.5)),
          u_strokeTaper: clamp01(numberParam(params.strokeTaper, 0.5)),
          u_strokeCap: clamp01(numberParam(params.strokeCap, 0.5)),
          u_noise: clamp01(numberParam(params.noise, 0)),
          u_noiseFrequency: clamp01(numberParam(params.noiseFrequency, 0)),
          u_softness: clamp01(numberParam(params.softness, 0.3)),
        },
      };
    }

    case "staticMeshGradient": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        10
      );
      return {
        fragmentShader: staticMeshGradientFragmentShader,
        speed: 0,
        uniforms: {
          ...sizing,
          u_colors: colors,
          u_colorsCount: colors.length,
          u_positions: numberParam(params.positions, 0),
          u_waveX: clamp01(numberParam(params.waveX, 0.2)),
          u_waveXShift: clamp01(numberParam(params.waveXShift, 0)),
          u_waveY: clamp01(numberParam(params.waveY, 0.15)),
          u_waveYShift: clamp01(numberParam(params.waveYShift, 0)),
          u_mixing: clamp01(numberParam(params.mixing, 0.5)),
          u_grainMixer: clamp01(numberParam(params.grainMixer, 0)),
          u_grainOverlay: clamp01(numberParam(params.grainOverlay, 0)),
        },
      };
    }

    case "staticRadialGradient": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        10
      );
      return {
        fragmentShader: staticRadialGradientFragmentShader,
        speed: 0,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_radius: clamp(numberParam(params.radius, 1.2), 0, 3),
          u_focalDistance: clamp(numberParam(params.focalDistance, 0), 0, 3),
          u_focalAngle: numberParam(params.focalAngle, 0),
          u_falloff: clamp(numberParam(params.falloff, 0), -1, 1),
          u_mixing: clamp01(numberParam(params.mixing, 0.5)),
          u_distortion: clamp01(numberParam(params.distortion, 0.25)),
          u_distortionShift: clamp(
            numberParam(params.distortionShift, 0),
            -1,
            1
          ),
          u_distortionFreq: clamp(numberParam(params.distortionFreq, 5), 0, 20),
          u_grainMixer: clamp01(numberParam(params.grainMixer, 0)),
          u_grainOverlay: clamp01(numberParam(params.grainOverlay, 0)),
        },
      };
    }

    case "swirl": {
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        10
      );
      return {
        fragmentShader: swirlFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_bandCount: clamp(numberParam(params.bandCount, 4), 0, 15),
          u_twist: clamp01(numberParam(params.twist, 0.1)),
          u_center: clamp01(numberParam(params.center, 0)),
          u_proportion: clamp01(numberParam(params.proportion, 0.5)),
          u_softness: clamp01(numberParam(params.softness, 0.5)),
          u_noise: clamp01(numberParam(params.noise, 0)),
          u_noiseFrequency: clamp01(numberParam(params.noiseFrequency, 0)),
        },
      };
    }

    case "voronoi": {
      const pSizing = patternSizingUniforms(params);
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        5
      );
      return {
        fragmentShader: voronoiFragmentShader,
        speed,
        uniforms: {
          ...pSizing,
          u_colors: colors,
          u_colorsCount: colors.length,
          u_stepsPerColor: clamp(numberParam(params.stepsPerColor, 1), 1, 3),
          u_colorGap: colorParam(params.colorGap, "#000000"),
          u_colorGlow: colorParam(params.colorGlow, "#000000"),
          u_distortion: clamp(numberParam(params.distortion, 0.4), 0, 0.5),
          u_gap: clamp(numberParam(params.gap, 0.04), 0, 0.1),
          u_glow: clamp01(numberParam(params.glow, 0)),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "warp": {
      const pSizing = patternSizingUniforms(params);
      const colors = shaderColorUniforms(
        params.colors,
        DEFAULT_SHADER_COLORS,
        10
      );
      return {
        fragmentShader: warpFragmentShader,
        speed,
        uniforms: {
          ...pSizing,
          u_colors: colors,
          u_colorsCount: colors.length,
          u_proportion: clamp01(numberParam(params.proportion, 0.5)),
          u_softness: clamp01(numberParam(params.softness, 0.5)),
          u_shape: enumParam(WarpPatterns, params.shape, "checks"),
          u_shapeScale: clamp01(numberParam(params.shapeScale, 0.5)),
          u_distortion: clamp01(numberParam(params.distortion, 0.25)),
          u_swirl: clamp01(numberParam(params.swirl, 0.8)),
          u_swirlIterations: clamp(
            numberParam(params.swirlIterations, 5),
            0,
            20
          ),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "water": {
      return {
        fragmentShader: waterFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_image: emptyPixelImage(),
          u_imageAspectRatio: numberParam(params.imageAspectRatio, 1),
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colorHighlight: colorParam(params.colorHighlight, "#67e8f9"),
          u_highlights: clamp01(numberParam(params.highlights, 0)),
          u_layering: clamp01(numberParam(params.layering, 0.5)),
          u_edges: clamp01(numberParam(params.edges, 0.5)),
          u_caustic: clamp01(numberParam(params.caustic, 0.1)),
          u_waves: clamp01(numberParam(params.waves, 0.3)),
          u_size: clamp(numberParam(params.size, 1), 0.01, 7),
        },
      };
    }

    case "waves": {
      const pSizing = patternSizingUniforms(params);
      return {
        fragmentShader: wavesFragmentShader,
        speed: 0,
        uniforms: {
          ...pSizing,
          u_colorFront: colorParam(params.colorFront, "#c084fc"),
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_shape: clamp(numberParam(params.shape, 0), 0, 3),
          u_frequency: clamp(numberParam(params.frequency, 0.5), 0, 2),
          u_amplitude: clamp01(numberParam(params.amplitude, 0.5)),
          u_spacing: clamp(numberParam(params.spacing, 1), 0, 2),
          u_proportion: clamp01(numberParam(params.proportion, 0.5)),
          u_softness: clamp01(numberParam(params.softness, 0.5)),
        },
      };
    }

    case "flutedGlass": {
      const sizing = baseSizingUniforms(params);
      return {
        fragmentShader: flutedGlassFragmentShader,
        speed,
        uniforms: {
          ...sizing,
          u_image: imageUniform(params, "flutedGlass"),
          u_imageAspectRatio: imageAspectUniform(params, "flutedGlass"),
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colorShadow: colorParam(params.colorShadow, "#000000"),
          u_colorHighlight: colorParam(params.colorHighlight, "#ffffff"),
          u_size: clamp(numberParam(params.size, 0.5), 0.01, 2),
          u_shadows: clamp01(numberParam(params.shadows, 0.25)),
          u_angle: numberParam(params.angle, 0),
          u_stretch: clamp01(numberParam(params.stretch, 0.5)),
          u_shape: enumParam(GlassGridShapes, params.shape, "lines"),
          u_distortion: clamp01(numberParam(params.distortion, 0.5)),
          u_highlights: clamp01(numberParam(params.highlights, 0.5)),
          u_distortionShape: enumParam(
            GlassDistortionShapes,
            params.distortionShape,
            "prism"
          ),
          u_shift: clamp(numberParam(params.shift, 0), -1, 1),
          u_blur: clamp01(numberParam(params.blur, 0.15)),
          u_edges: clamp01(numberParam(params.edges, 0.2)),
          u_marginLeft: numberParam(params.marginLeft, 0),
          u_marginRight: numberParam(params.marginRight, 0),
          u_marginTop: numberParam(params.marginTop, 0),
          u_marginBottom: numberParam(params.marginBottom, 0),
          u_grainMixer: clamp01(numberParam(params.grainMixer, 0.15)),
          u_grainOverlay: clamp01(numberParam(params.grainOverlay, 0.12)),
        },
      };
    }

    case "halftoneDots": {
      return {
        fragmentShader: halftoneDotsFragmentShader,
        speed,
        uniforms: {
          u_rotation: numberParam(params.rotation, 0),
          u_colorFront: colorParam(params.colorFront, "#000000"),
          u_colorBack: colorParam(params.colorBack, "#ffffff"),
          u_radius: clamp01(numberParam(params.radius, 0.5)),
          u_contrast: clamp(numberParam(params.contrast, 1), 0.5, 2),
          u_image: imageUniform(params, "halftoneDots"),
          u_imageAspectRatio: imageAspectUniform(params, "halftoneDots"),
          u_size: clamp(numberParam(params.size, 2), 0.5, 20),
          u_grainMixer: clamp01(numberParam(params.grainMixer, 0.15)),
          u_grainOverlay: clamp01(numberParam(params.grainOverlay, 0.12)),
          u_grainSize: clamp(numberParam(params.grainSize, 1), 0.5, 5),
          u_grid: enumParam(HalftoneDotsGrids, params.grid, "square"),
          u_originalColors:
            typeof params.originalColors === "boolean"
              ? params.originalColors
              : true,
          u_inverted:
            typeof params.inverted === "boolean" ? params.inverted : false,
          u_type: enumParam(HalftoneDotsTypes, params.type, "classic"),
        },
      };
    }

    case "halftoneCmyk": {
      return {
        fragmentShader: halftoneCmykFragmentShader,
        speed: 0,
        uniforms: {
          u_image: imageUniform(params, "halftoneCmyk"),
          u_imageAspectRatio: imageAspectUniform(params, "halftoneCmyk"),
          u_colorBack: colorParam(params.colorBack, "#ffffff"),
          u_colorC: colorParam(params.colorC, "#00ffff"),
          u_colorM: colorParam(params.colorM, "#ff00ff"),
          u_colorY: colorParam(params.colorY, "#ffff00"),
          u_colorK: colorParam(params.colorK, "#000000"),
          u_size: clamp(numberParam(params.size, 2), 0.5, 20),
          u_minDot: clamp01(numberParam(params.minDot, 0.1)),
          u_contrast: clamp(numberParam(params.contrast, 1), 0.5, 2),
          u_grainSize: clamp(numberParam(params.grainSize, 1), 0.5, 5),
          u_grainMixer: clamp01(numberParam(params.grainMixer, 0.15)),
          u_grainOverlay: clamp01(numberParam(params.grainOverlay, 0.12)),
          u_gridNoise: clamp01(numberParam(params.gridNoise, 0.1)),
          u_softness: clamp01(numberParam(params.softness, 0.2)),
          u_floodC: clamp01(numberParam(params.floodC, 0)),
          u_floodM: clamp01(numberParam(params.floodM, 0)),
          u_floodY: clamp01(numberParam(params.floodY, 0)),
          u_floodK: clamp01(numberParam(params.floodK, 0)),
          u_gainC: clamp(numberParam(params.gainC, 1), 0, 2),
          u_gainM: clamp(numberParam(params.gainM, 1), 0, 2),
          u_gainY: clamp(numberParam(params.gainY, 1), 0, 2),
          u_gainK: clamp(numberParam(params.gainK, 1), 0, 2),
          u_type: enumParam(HalftoneCmykTypes, params.type, "dots"),
          u_noiseTexture: getNoiseTexture(),
        },
      };
    }

    case "heatmap": {
      const colors = shaderColorUniforms(
        params.colors,
        ["#0000ff", "#00ffff", "#ffff00", "#ff0000"],
        10
      );
      return {
        fragmentShader: heatmapFragmentShader,
        speed,
        uniforms: {
          u_image: imageUniform(params, "heatmap"),
          u_imageAspectRatio: imageAspectUniform(params, "heatmap"),
          u_colorBack: colorParam(params.colorBack, "#000000"),
          u_colors: colors,
          u_colorsCount: colors.length,
          u_angle: numberParam(params.angle, 0),
          u_noise: clamp01(numberParam(params.noise, 0.25)),
          u_innerGlow: clamp01(numberParam(params.innerGlow, 0.5)),
          u_outerGlow: clamp01(numberParam(params.outerGlow, 0.5)),
          u_contour: clamp01(numberParam(params.contour, 0.5)),
        },
      };
    }

    case "imageDithering": {
      const sizing = baseSizingUniforms(params);
      return {
        fragmentShader: imageDitheringFragmentShader,
        speed: 0,
        uniforms: {
          ...sizing,
          u_image: imageUniform(params, "imageDithering"),
          u_imageAspectRatio: imageAspectUniform(params, "imageDithering"),
          u_colorFront: colorParam(params.colorFront, "#000000"),
          u_colorBack: colorParam(params.colorBack, "#ffffff"),
          u_colorHighlight: colorParam(params.colorHighlight, "#ffffff"),
          u_type: enumParam(DitheringTypes, params.type, "4x4"),
          u_pxSize: clamp(numberParam(params.size, 2.5), MIN_SIZE, MAX_SIZE),
          u_originalColors:
            typeof params.originalColors === "boolean"
              ? params.originalColors
              : true,
          u_inverted:
            typeof params.inverted === "boolean" ? params.inverted : false,
          u_colorSteps: clamp(numberParam(params.colorSteps, 4), 2, 16),
        },
      };
    }

    default: {
      throw new Error(`unsupported shader id: ${String(shaderId)}`);
    }
  }
}
