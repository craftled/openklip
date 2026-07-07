interface LottiePocManifest {
  fps: number;
  height: number;
  id: string;
  kind: "rich";
  lottie?: {
    file: string;
    slots?: Record<string, { param: string; path: string }>;
    transparent?: boolean;
  };
  params?: Record<string, unknown>;
  width: number;
}

interface LottiePocInput {
  lottie: unknown;
  manifest: LottiePocManifest;
}

export interface LottiePocValidation {
  issues: string[];
  ok: boolean;
}

export const lottiePocTemplateDoc = `Lottie is a project-local graphic template POC, not a new AssetKind.
Use projects/<slug>/graphics/<id>/manifest.json plus composition.html and a local Lottie JSON scene.
Slots map template params to editable text/color controls. Persisting user marks or Lottie as an asset
kind would need a separate EDL/action-history design.`;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateLottieGraphicTemplate(
  input: LottiePocInput
): LottiePocValidation {
  const issues: string[] = [];
  const scene = record(input.lottie);
  if (!scene) {
    return { ok: false, issues: ["Lottie scene must be a JSON object"] };
  }

  const width = scene.w;
  const height = scene.h;
  if (!(finitePositive(width) && finitePositive(height))) {
    issues.push("blank canvas: Lottie width and height must be positive");
  }

  const fps = scene.fr;
  const inFrame = scene.ip;
  const outFrame = scene.op;
  if (
    !(
      finitePositive(fps) &&
      typeof inFrame === "number" &&
      Number.isFinite(inFrame) &&
      finitePositive(outFrame) &&
      outFrame > inFrame
    )
  ) {
    issues.push("frame bounds: fr/ip/op must describe a positive frame span");
  }

  if (input.manifest.kind !== "rich") {
    issues.push('manifest kind must stay "rich" for the graphic-template POC');
  }
  if (!input.manifest.lottie?.file) {
    issues.push("manifest.lottie.file is required");
  }
  if (input.manifest.lottie?.transparent !== true) {
    issues.push("transparent background must be explicit for overlay use");
  }

  const assets = Array.isArray(scene.assets) ? scene.assets : [];
  if (assets.length > 0) {
    issues.push(
      "external assets/fonts are not bundled by this POC; inline or project-local resolution is required"
    );
  }

  const params = input.manifest.params ?? {};
  for (const [slotName, slot] of Object.entries(
    input.manifest.lottie?.slots ?? {}
  )) {
    if (!slot.path.trim()) {
      issues.push(`slot ${slotName}: path is required`);
    }
    if (!(slot.param in params)) {
      issues.push(`slot ${slotName}: param "${slot.param}" is not declared`);
    }
  }

  return { ok: issues.length === 0, issues };
}
