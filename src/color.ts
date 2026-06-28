import {
  clampChroma,
  converter,
  formatHex,
  inGamut,
  type Oklch,
  parse,
  wcagContrast,
} from "culori";

const toOklch = converter("oklch");

export function formatOklch(l: number, c: number, h: number): string {
  const L = Number(l.toFixed(3));
  const C = Number(c.toFixed(3));
  const H = Number(h.toFixed(3));
  return `oklch(${L} ${C} ${H})`;
}

export function hexToOklch(hex: string): string {
  const parsed = parse(hex);
  if (!parsed) {
    throw new Error(`Invalid color: ${hex}`);
  }
  const oklch = toOklch(parsed) as Oklch | undefined;
  if (!oklch || oklch.l == null) {
    throw new Error(`Could not convert color: ${hex}`);
  }
  const clamped = clampChroma(
    { mode: "oklch", l: oklch.l, c: oklch.c ?? 0, h: oklch.h ?? 0 },
    "rgb"
  ) as Oklch;
  return formatOklch(clamped.l ?? 0, clamped.c ?? 0, clamped.h ?? 0);
}

export function colorToHex(color: string): string | null {
  const parsed = parse(color);
  if (!parsed) {
    return null;
  }
  return formatHex(parsed) ?? null;
}

export function maxChromaInRgb(l: number, h: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const candidate = { mode: "oklch" as const, l, c: mid, h };
    if (inGamut("rgb")(candidate)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export type BrandScaleStep =
  | 50
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900
  | 950;

const BRAND_SCALE_LABELS: BrandScaleStep[] = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
];

export function generateBrandScale(base: {
  l: number;
  c: number;
  h: number;
}): Record<BrandScaleStep, string> {
  const delta = 0.4;
  const minL = Math.max(0.05, base.l - delta);
  const maxL = Math.min(0.95, base.l + delta);
  const maxAtBase = maxChromaInRgb(base.l, base.h);
  const chromaPct = maxAtBase > 0 ? (base.c / maxAtBase) * 100 : 0;
  const steps = BRAND_SCALE_LABELS.length;
  const out = {} as Record<BrandScaleStep, string>;

  for (let i = 0; i < steps; i++) {
    const label = BRAND_SCALE_LABELS[i];
    const t = i / (steps - 1);
    const L = maxL - t * (maxL - minL);
    const maxC = maxChromaInRgb(L, base.h);
    const C = (chromaPct / 100) * maxC;
    const clamped = clampChroma(
      { mode: "oklch", l: L, c: C, h: base.h },
      "rgb"
    ) as Oklch;
    out[label] = formatOklch(
      clamped.l ?? L,
      clamped.c ?? C,
      clamped.h ?? base.h
    );
  }

  return out;
}

export interface ContrastResult {
  backgroundL: number;
  foregroundL: number;
  lightnessGap: number;
  passesApcaNormalApprox: boolean;
  passesWcagAaaNormal: boolean;
  passesWcagAaLarge: boolean;
  passesWcagAaNormal: boolean;
  wcagRatio: number;
}

export function measureContrast(
  foreground: string,
  background: string
): ContrastResult | null {
  const fg = parse(foreground);
  const bg = parse(background);
  if (!(fg && bg)) {
    return null;
  }
  const ratio = wcagContrast(fg, bg) ?? 0;
  const fgL = (toOklch(fg) as Oklch | undefined)?.l ?? 0;
  const bgL = (toOklch(bg) as Oklch | undefined)?.l ?? 0;
  const gap = Math.abs(fgL - bgL);
  return {
    wcagRatio: ratio,
    foregroundL: fgL,
    backgroundL: bgL,
    lightnessGap: gap,
    passesWcagAaNormal: ratio >= 4.5,
    passesWcagAaLarge: ratio >= 3,
    passesWcagAaaNormal: ratio >= 7,
    passesApcaNormalApprox: gap >= 0.35,
  };
}
