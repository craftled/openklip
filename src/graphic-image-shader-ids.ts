/** Image-shader template ids (no fs): safe for browser bundles. */

export const REQUIRED_IMAGE_SHADER_TEMPLATE_IDS = new Set([
  "shader-fluted-glass",
  "shader-halftone-cmyk",
  "shader-halftone-dots",
  "shader-heatmap",
  "shader-image-dithering",
]);

export const OPTIONAL_IMAGE_SHADER_TEMPLATE_IDS = new Set([
  "shader-gem-smoke",
  "shader-liquid-metal",
]);

export const IMAGE_SHADER_TEMPLATE_IDS = new Set([
  ...REQUIRED_IMAGE_SHADER_TEMPLATE_IDS,
  ...OPTIONAL_IMAGE_SHADER_TEMPLATE_IDS,
]);

export function graphicRequiresImageAsset(template: string): boolean {
  return REQUIRED_IMAGE_SHADER_TEMPLATE_IDS.has(template);
}

export function graphicSupportsImageAsset(template: string): boolean {
  return IMAGE_SHADER_TEMPLATE_IDS.has(template);
}
