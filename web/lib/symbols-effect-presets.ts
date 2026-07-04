export interface SymbolsEffectPreset {
  colors: string[];
  glyphs: number[];
  name: string;
  video: string;
  zoom?: number;
}

const GLYPH_VIDEO_BASE = "https://www.arlan.me/videos-glyph";

function glyphVideo(file: string): string {
  return `${GLYPH_VIDEO_BASE}/${encodeURIComponent(file)}`;
}

/** Presets from https://www.arlan.me/vault/sandbox (Remix cycles these). */
export const SYMBOLS_EFFECT_PRESETS: SymbolsEffectPreset[] = [
  {
    name: "Cobalt",
    video: glyphVideo("Confident Life Notes for Busy Days.mp4"),
    colors: ["#241452", "#6d3bf5", "#a9c2ff", "#ffffff"],
    glyphs: [4, 2, 1, 0],
  },
  {
    name: "Ember",
    video: glyphVideo("Trending Meal Prep Recipes.mp4"),
    colors: ["#fff7ed", "#ffc24b", "#f0531f", "#5c160a"],
    glyphs: [0, 1, 9, 3],
    zoom: 0.66,
  },
  {
    name: "Reef",
    video: glyphVideo("Dreamy Wellness Habit Ideas.mp4"),
    colors: ["#06302f", "#0fb5ad", "#7fe8d6", "#ffffff"],
    glyphs: [6, 10, 2, 0],
  },
  {
    name: "Punch",
    video: glyphVideo("Crochet Project Inspiration.mp4"),
    colors: ["#fff0f6", "#ffb3d2", "#ff2d8e", "#5a0a30"],
    glyphs: [0, 1, 11, 8],
  },
  {
    name: "Slate",
    video: glyphVideo("Pattern Storage Tips.mp4"),
    colors: ["#2a1d4a", "#6b5a9e", "#c2b6e6", "#ffffff"],
    glyphs: [4, 3, 1, 0],
    zoom: 0.7,
  },
  {
    name: "Bloom",
    video: glyphVideo("Creative Sewing Room Tips.mp4"),
    colors: ["#127a4a", "#ff2e63", "#ffd23f", "#fdeef5"],
    glyphs: [12, 1, 9, 0],
  },
  {
    name: "Forest",
    video: glyphVideo("Nature Escape Ideas for Fall.mp4"),
    colors: ["#ffffff", "#cdeaa0", "#5fa83a", "#16401f"],
    glyphs: [0, 16, 9, 12],
    zoom: 0.8,
  },
  {
    name: "Coral",
    video: glyphVideo("Cat Enrichment Roundup.mp4"),
    colors: ["#fff4ef", "#ffc4a3", "#ff6b4a", "#7a2415"],
    glyphs: [0, 1, 14, 2],
  },
  {
    name: "Basil",
    video: glyphVideo("Fresh Meal Prep Recipes Inspiration.mp4"),
    colors: ["#ffffff", "#dff06a", "#84b521", "#26350c"],
    glyphs: [0, 2, 10, 3],
    zoom: 0.67,
  },
  {
    name: "Pixel",
    video: glyphVideo("Man Face Roblox Transparent.jpg"),
    colors: ["#0a1230", "#2f6bff", "#7ad7ff", "#ffffff"],
    glyphs: [3, 3, 1, 0],
    zoom: 1.24,
  },
];

export function isImagePreset(preset: SymbolsEffectPreset): boolean {
  return /\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(preset.video);
}

export function videoPreloadSrcs(): string[] {
  return SYMBOLS_EFFECT_PRESETS.filter((preset) => !isImagePreset(preset)).map(
    (preset) => preset.video
  );
}

export const SYMBOLS_EFFECT_DEMO_VIDEO = SYMBOLS_EFFECT_PRESETS[0].video;
