/**
 * Generates graphics/shader-<name>/ manifest.json + composition.html from SHADER_TEMPLATES.
 * Run: bun run scripts/generate-shader-templates.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ParamDef {
  default: string | number | boolean;
  label: string;
  type: "string" | "number" | "boolean";
}

interface ShaderTemplate {
  id: string;
  name: string;
  params: Record<string, ParamDef>;
  shaderId: string;
}

const SHADER_TEMPLATES: ShaderTemplate[] = [
  {
    id: "shader-color-panels",
    shaderId: "colorPanels",
    name: "Shader Color Panels",
    params: {
      colors: {
        type: "string",
        default: "#ff9d00, #fd4f30, #809bff, #6d2eff, #333aff",
        label: "Colors (comma-separated hex)",
      },
      speed: { type: "number", default: 0.5, label: "Speed" },
      scale: { type: "number", default: 0.8, label: "Scale" },
      density: { type: "number", default: 3, label: "Panel density" },
      length: { type: "number", default: 1.1, label: "Panel length" },
    },
  },
  {
    id: "shader-dot-grid",
    shaderId: "dotGrid",
    name: "Shader Dot Grid",
    params: {
      colorBack: { type: "string", default: "#000000", label: "Background" },
      colorFill: { type: "string", default: "#ffffff", label: "Fill" },
      colorStroke: { type: "string", default: "#ffaa00", label: "Stroke" },
      scale: { type: "number", default: 0.6, label: "Scale" },
      size: { type: "number", default: 2, label: "Dot size" },
      gapX: { type: "number", default: 32, label: "Gap X" },
      gapY: { type: "number", default: 32, label: "Gap Y" },
      shape: {
        type: "string",
        default: "circle",
        label: "Shape (circle, diamond, square, triangle)",
      },
    },
  },
  {
    id: "shader-dot-orbit",
    shaderId: "dotOrbit",
    name: "Shader Dot Orbit",
    params: {
      colors: {
        type: "string",
        default: "#ffc96b, #ff6200, #ff2f00, #421100",
        label: "Colors (comma-separated hex)",
      },
      speed: { type: "number", default: 1.5, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      size: { type: "number", default: 1, label: "Dot size" },
      spreading: { type: "number", default: 1, label: "Orbit spread" },
    },
  },
  {
    id: "shader-gem-smoke",
    shaderId: "gemSmoke",
    name: "Shader Gem Smoke",
    params: {
      colors: {
        type: "string",
        default: "#333333, #e7e6df",
        label: "Smoke colors (comma-separated hex)",
      },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 0.6, label: "Scale" },
      shape: {
        type: "string",
        default: "diamond",
        label: "Shape (circle, daisy, diamond, metaballs)",
      },
      innerGlow: { type: "number", default: 1, label: "Inner glow" },
      outerGlow: { type: "number", default: 0.55, label: "Outer glow" },
    },
  },
  {
    id: "shader-god-rays",
    shaderId: "godRays",
    name: "Shader God Rays",
    params: {
      colors: {
        type: "string",
        default: "#a600ff, #6200ff, #ffffff, #33fff5",
        label: "Ray colors (comma-separated hex)",
      },
      speed: { type: "number", default: 0.75, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      intensity: { type: "number", default: 0.8, label: "Intensity" },
      density: { type: "number", default: 0.3, label: "Ray density" },
      bloom: { type: "number", default: 0.4, label: "Bloom" },
    },
  },
  {
    id: "shader-liquid-metal",
    shaderId: "liquidMetal",
    name: "Shader Liquid Metal",
    params: {
      colorBack: { type: "string", default: "#AAAAAC", label: "Background" },
      colorTint: { type: "string", default: "#ffffff", label: "Tint" },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 0.6, label: "Scale" },
      shape: {
        type: "string",
        default: "diamond",
        label: "Shape (circle, daisy, diamond, metaballs)",
      },
      distortion: { type: "number", default: 0.07, label: "Distortion" },
      repetition: { type: "number", default: 2, label: "Stripe repetition" },
    },
  },
  {
    id: "shader-metaballs",
    shaderId: "metaballs",
    name: "Shader Metaballs",
    params: {
      colors: {
        type: "string",
        default: "#6e33cc, #ff5500, #ffc105, #f585ff",
        label: "Colors (comma-separated hex)",
      },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      count: { type: "number", default: 10, label: "Ball count" },
      size: { type: "number", default: 0.83, label: "Ball size" },
    },
  },
  {
    id: "shader-neuro-noise",
    shaderId: "neuroNoise",
    name: "Shader Neuro Noise",
    params: {
      colorFront: { type: "string", default: "#ffffff", label: "Highlight" },
      colorMid: { type: "string", default: "#47a8ff", label: "Mid" },
      colorBack: { type: "string", default: "#000000", label: "Background" },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      brightness: { type: "number", default: 0.5, label: "Brightness" },
      contrast: { type: "number", default: 0.5, label: "Contrast" },
    },
  },
  {
    id: "shader-paper-texture",
    shaderId: "paperTexture",
    name: "Shader Paper Texture",
    params: {
      colorFront: { type: "string", default: "#9fadbc", label: "Foreground" },
      colorBack: { type: "string", default: "#ffffff", label: "Background" },
      scale: { type: "number", default: 0.6, label: "Scale" },
      contrast: { type: "number", default: 0.3, label: "Contrast" },
      fiber: { type: "number", default: 0.3, label: "Fiber" },
      folds: { type: "number", default: 0.65, label: "Folds" },
    },
  },
  {
    id: "shader-perlin-noise",
    shaderId: "perlinNoise",
    name: "Shader Perlin Noise",
    params: {
      colorFront: { type: "string", default: "#47a8ff", label: "Foreground" },
      colorBack: { type: "string", default: "#0a0a12", label: "Background" },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      octaveCount: { type: "number", default: 4, label: "Octaves" },
      softness: { type: "number", default: 0.5, label: "Softness" },
    },
  },
  {
    id: "shader-pulsing-border",
    shaderId: "pulsingBorder",
    name: "Shader Pulsing Border",
    params: {
      colors: {
        type: "string",
        default: "#0dc1fd, #d915ef, #ff3f2e",
        label: "Border colors (comma-separated hex)",
      },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 0.6, label: "Scale" },
      thickness: { type: "number", default: 0.1, label: "Thickness" },
      roundness: { type: "number", default: 0.25, label: "Roundness" },
      pulse: { type: "number", default: 0.25, label: "Pulse" },
    },
  },
  {
    id: "shader-simplex-noise",
    shaderId: "simplexNoise",
    name: "Shader Simplex Noise",
    params: {
      colors: {
        type: "string",
        default: "#4449CF, #FFD1E0, #F94446, #FFD36B, #FFFFFF",
        label: "Colors (comma-separated hex)",
      },
      speed: { type: "number", default: 0.5, label: "Speed" },
      scale: { type: "number", default: 0.6, label: "Scale" },
      stepsPerColor: { type: "number", default: 2, label: "Steps per color" },
      softness: { type: "number", default: 0, label: "Softness" },
    },
  },
  {
    id: "shader-smoke-ring",
    shaderId: "smokeRing",
    name: "Shader Smoke Ring",
    params: {
      colors: {
        type: "string",
        default: "#c084fc, #67e8f9, #818cf8, #f472b6",
        label: "Colors (comma-separated hex)",
      },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      radius: { type: "number", default: 0.5, label: "Radius" },
      thickness: { type: "number", default: 0.35, label: "Thickness" },
      noiseIterations: { type: "number", default: 4, label: "Noise layers" },
    },
  },
  {
    id: "shader-spiral",
    shaderId: "spiral",
    name: "Shader Spiral",
    params: {
      colorFront: { type: "string", default: "#ffffff", label: "Ink" },
      colorBack: { type: "string", default: "#0a0a12", label: "Background" },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      strokeWidth: { type: "number", default: 0.5, label: "Stroke width" },
      distortion: { type: "number", default: 0.3, label: "Distortion" },
    },
  },
  {
    id: "shader-static-mesh-gradient",
    shaderId: "staticMeshGradient",
    name: "Shader Static Mesh Gradient",
    params: {
      colors: {
        type: "string",
        default: "#c084fc, #67e8f9, #818cf8, #f472b6",
        label: "Colors (comma-separated hex)",
      },
      speed: { type: "number", default: 0.5, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      mixing: { type: "number", default: 0.5, label: "Color mixing" },
      waveX: { type: "number", default: 0.2, label: "Wave X" },
      waveY: { type: "number", default: 0.15, label: "Wave Y" },
    },
  },
  {
    id: "shader-static-radial-gradient",
    shaderId: "staticRadialGradient",
    name: "Shader Static Radial Gradient",
    params: {
      colors: {
        type: "string",
        default: "#c084fc, #67e8f9, #818cf8",
        label: "Colors (comma-separated hex)",
      },
      colorBack: { type: "string", default: "#0a0a12", label: "Background" },
      speed: { type: "number", default: 0.5, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      radius: { type: "number", default: 1.2, label: "Radius" },
      distortion: { type: "number", default: 0.25, label: "Distortion" },
    },
  },
  {
    id: "shader-swirl",
    shaderId: "swirl",
    name: "Shader Swirl",
    params: {
      colors: {
        type: "string",
        default: "#ffd1d1, #ff8a8a, #660000",
        label: "Colors (comma-separated hex)",
      },
      speed: { type: "number", default: 0.32, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      bandCount: { type: "number", default: 4, label: "Band count" },
      twist: { type: "number", default: 0.1, label: "Twist" },
    },
  },
  {
    id: "shader-voronoi",
    shaderId: "voronoi",
    name: "Shader Voronoi",
    params: {
      colors: {
        type: "string",
        default: "#ff8247, #ffe53d",
        label: "Cell colors (comma-separated hex)",
      },
      speed: { type: "number", default: 0.5, label: "Speed" },
      scale: { type: "number", default: 0.5, label: "Scale" },
      gap: { type: "number", default: 0.04, label: "Gap width" },
      distortion: { type: "number", default: 0.4, label: "Distortion" },
    },
  },
  {
    id: "shader-warp",
    shaderId: "warp",
    name: "Shader Warp",
    params: {
      colors: {
        type: "string",
        default: "#121212, #9470ff, #8838ff",
        label: "Colors (comma-separated hex)",
      },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 1, label: "Scale" },
      shape: {
        type: "string",
        default: "checks",
        label: "Pattern (checks, stripes, edge)",
      },
      swirl: { type: "number", default: 0.8, label: "Swirl" },
      distortion: { type: "number", default: 0.25, label: "Distortion" },
    },
  },
  {
    id: "shader-water",
    shaderId: "water",
    name: "Shader Water",
    params: {
      colorBack: { type: "string", default: "#909090", label: "Background" },
      colorHighlight: {
        type: "string",
        default: "#ffffff",
        label: "Highlight",
      },
      speed: { type: "number", default: 1, label: "Speed" },
      scale: { type: "number", default: 0.8, label: "Scale" },
      caustic: { type: "number", default: 0.1, label: "Caustic" },
      waves: { type: "number", default: 0.3, label: "Waves" },
    },
  },
  {
    id: "shader-waves",
    shaderId: "waves",
    name: "Shader Waves",
    params: {
      colorFront: { type: "string", default: "#ffbb00", label: "Foreground" },
      colorBack: { type: "string", default: "#000000", label: "Background" },
      scale: { type: "number", default: 0.6, label: "Scale" },
      frequency: { type: "number", default: 0.5, label: "Frequency" },
      amplitude: { type: "number", default: 0.5, label: "Amplitude" },
      spacing: { type: "number", default: 1.2, label: "Line spacing" },
    },
  },
];

const root = join(import.meta.dir, "..", "graphics");

for (const template of SHADER_TEMPLATES) {
  const dir = join(root, template.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "manifest.json"),
    `${JSON.stringify(
      {
        id: template.id,
        name: template.name,
        kind: "rich",
        width: 1920,
        height: 1080,
        fps: 30,
        params: template.params,
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    join(dir, "composition.html"),
    `<div data-fps="30" data-graphic-root data-height="1080" data-width="1920">
  <style>
  .shader-root {
    position: absolute;
    inset: 0;
  }
  </style>
  <div class="shader-root" data-shader="${template.shaderId}"></div>
</div>
`
  );
}

console.log(`Generated ${SHADER_TEMPLATES.length} shader templates.`);
