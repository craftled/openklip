// Export aspect ratio and manual reframe crop: shared math for preview
// dimensions, export filter graphs, and platform presets.

import type { ExportAspect, ExportCrop } from "./edl.ts";

export const EXPORT_ASPECT_IDS = [
  "source",
  "16:9",
  "9:16",
  "1:1",
] as const satisfies readonly ExportAspect[];

export function aspectToRatio(aspect: ExportAspect): number | null {
  if (aspect === "source") {
    return null;
  }
  if (aspect === "16:9") {
    return 16 / 9;
  }
  if (aspect === "9:16") {
    return 9 / 16;
  }
  return 1;
}

export function normalizeExportCrop(value: ExportCrop | undefined): ExportCrop {
  return {
    focusX: value?.focusX ?? 0.5,
    focusY: value?.focusY ?? 0.5,
    scale: value?.scale ?? 1,
  };
}

/** Output frame size after maxHeight cap and optional fixed aspect. */
export function resolveExportDimensions(input: {
  aspect: ExportAspect;
  maxHeight?: number;
  sourceHeight: number;
  sourceWidth: number;
}): { outH: number; outW: number } {
  const cappedH =
    input.maxHeight === undefined
      ? input.sourceHeight
      : Math.min(input.sourceHeight, input.maxHeight);
  const targetRatio = aspectToRatio(input.aspect);
  if (targetRatio === null) {
    const outH = cappedH;
    const outW =
      Math.round((input.sourceWidth * outH) / input.sourceHeight / 2) * 2;
    return { outW, outH };
  }
  const outH = cappedH;
  const outW = Math.max(2, Math.round(((outH * targetRatio) / 2) * 2));
  return { outW, outH };
}

export function reframeCropBox(input: {
  focusX: number;
  focusY: number;
  scale: number;
  sourceHeight: number;
  sourceWidth: number;
  targetHeight: number;
  targetWidth: number;
}): { h: number; w: number; x: number; y: number } {
  const srcW = input.sourceWidth;
  const srcH = input.sourceHeight;
  const targetRatio = input.targetWidth / input.targetHeight;
  const srcRatio = srcW / srcH;
  const zoom = Math.max(1, input.scale);

  let cropW: number;
  let cropH: number;
  if (targetRatio < srcRatio) {
    cropH = Math.min(srcH, Math.round(srcH / zoom));
    cropW = Math.min(srcW, Math.round(cropH * targetRatio));
  } else {
    cropW = Math.min(srcW, Math.round(srcW / zoom));
    cropH = Math.min(srcH, Math.round(cropW / targetRatio));
  }

  const x = Math.max(
    0,
    Math.min(srcW - cropW, Math.round((srcW - cropW) * input.focusX))
  );
  const y = Math.max(
    0,
    Math.min(srcH - cropH, Math.round((srcH - cropH) * input.focusY))
  );
  return { h: cropH, w: cropW, x, y };
}

export function shouldApplyReframe(input: {
  aspect: ExportAspect;
  crop: ExportCrop;
}): boolean {
  if (input.aspect !== "source") {
    return true;
  }
  const crop = input.crop;
  return crop.scale !== 1 || crop.focusX !== 0.5 || crop.focusY !== 0.5;
}

/** ffmpeg filter fragment: [inputLabel] -> [outputLabel]. */
export function buildReframeFilter(input: {
  aspect: ExportAspect;
  crop: ExportCrop;
  inputLabel: string;
  outH: number;
  outW: number;
  outputLabel: string;
  sourceH: number;
  sourceW: number;
}): string {
  if (!shouldApplyReframe({ aspect: input.aspect, crop: input.crop })) {
    if (input.outW === input.sourceW && input.outH === input.sourceH) {
      return `[${input.inputLabel}]null[${input.outputLabel}]`;
    }
    return `[${input.inputLabel}]scale=${input.outW}:${input.outH}[${input.outputLabel}]`;
  }
  const box = reframeCropBox({
    focusX: input.crop.focusX,
    focusY: input.crop.focusY,
    scale: input.crop.scale,
    sourceHeight: input.sourceH,
    sourceWidth: input.sourceW,
    targetHeight: input.outH,
    targetWidth: input.outW,
  });
  return `[${input.inputLabel}]crop=${box.w}:${box.h}:${box.x}:${box.y},scale=${input.outW}:${input.outH}[${input.outputLabel}]`;
}

export function orientationToExportAspect(
  orientation: "landscape" | "portrait" | "square"
): ExportAspect {
  if (orientation === "portrait") {
    return "9:16";
  }
  if (orientation === "square") {
    return "1:1";
  }
  return "16:9";
}

export function exportAspectToOrientation(
  aspect: ExportAspect
): "landscape" | "portrait" | "square" {
  if (aspect === "9:16") {
    return "portrait";
  }
  if (aspect === "1:1") {
    return "square";
  }
  return "landscape";
}

/** CSS object-position for preview object-cover from a reframe crop. */
export function cropObjectPosition(crop: ExportCrop | undefined): string {
  const c = normalizeExportCrop(crop);
  return `${Math.round(c.focusX * 100)}% ${Math.round(c.focusY * 100)}%`;
}

export function parseExportAspectFlag(raw: string): ExportAspect {
  if (!EXPORT_ASPECT_IDS.includes(raw as ExportAspect)) {
    throw new Error(`--aspect must be one of: ${EXPORT_ASPECT_IDS.join(", ")}`);
  }
  return raw as ExportAspect;
}
