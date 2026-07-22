import type { CutTransition } from "@engine/edl";
import type { SegmentExportGate } from "@engine/export-segments";
import { shouldApplyCutTransition } from "@engine/export-segments";
import {
  type CutTransitionSweepPlan,
  cutTransitionSweepPlan,
} from "@engine/schedulerLogic";
import {
  accentPair,
  createShader,
  PALETTES,
  type Palette,
  playSweep,
  type SweepOptions,
} from "glimm";

// Near-black custom palette for the "dip" look: both the base color and the
// oscillation amplitude sit within a hair of zero (see the near-black
// assertion in tests/cut-transition-sweep.test.ts), so the swept band reads
// as "goes dark" at every point along its travel rather than a colorful
// flash that merely dims. accentPair does pure color math, no DOM/canvas.
const DIP_PALETTE: Palette = accentPair("#000000", "#050505");

// Crossfade reads as a quick, bright dissolve-like flash rather than a
// jarring strobe: azure is a cool, smooth built-in palette and peakAlpha is
// capped in the 0.6-0.85 band so the band never fully whites out the frame.
const CROSSFADE_PALETTE: Palette = PALETTES.azure;
const CROSSFADE_PEAK_ALPHA = 0.75;
// Glimm 0.1.x fired the page swap at the halfway point. Keep that timing
// explicit across the 0.3.x default change to 0.56 so cut previews do not
// shift when the dependency is upgraded.
const LEGACY_SWEEP_MIDPOINT = 0.5;

/**
 * Maps a pure cut-transition sweep plan to concrete glimm SweepOptions.
 * Pure function, safe to unit test directly (accentPair/PALETTES are pure
 * color math with no DOM/canvas access).
 */
export function sweepOptionsForPlan(
  plan: CutTransitionSweepPlan
): SweepOptions {
  if (plan.type === "dip") {
    return {
      midpoint: LEGACY_SWEEP_MIDPOINT,
      sweepMs: plan.sweepMs,
      outroMs: plan.outroMs,
      palette: DIP_PALETTE,
      peakAlpha: 1,
    };
  }
  return {
    midpoint: LEGACY_SWEEP_MIDPOINT,
    sweepMs: plan.sweepMs,
    outroMs: plan.outroMs,
    palette: CROSSFADE_PALETTE,
    peakAlpha: CROSSFADE_PEAK_ALPHA,
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface CutTransitionSweepController {
  destroy: () => void;
  play: (
    transition: CutTransition,
    reducedMotion: boolean,
    gate?: SegmentExportGate
  ) => void;
}

const NOOP_CONTROLLER: CutTransitionSweepController = {
  play: () => {
    // WebGL unavailable; no-op so callers never need to null-check.
  },
  destroy: () => {
    // Nothing to tear down.
  },
};

/**
 * Wraps createShader for the preview cut-transition sweep overlay. Degrades
 * gracefully when WebGL is unavailable (createShader returns null): the
 * returned controller has the same shape but play/destroy are harmless
 * no-ops, so callers never need to null-check.
 */
export function createCutTransitionSweepController(
  canvas: HTMLCanvasElement
): CutTransitionSweepController {
  const ctrl = createShader({ canvas });
  if (!ctrl) {
    return NOOP_CONTROLLER;
  }
  return {
    play: (transition, reducedMotion, gate) => {
      if (
        gate &&
        transition.type !== "none" &&
        !shouldApplyCutTransition(transition.type, gate)
      ) {
        return;
      }
      const plan = cutTransitionSweepPlan(transition, reducedMotion);
      if (!plan) {
        return;
      }
      playSweep(ctrl, sweepOptionsForPlan(plan));
    },
    destroy: () => {
      ctrl.destroy();
    },
  };
}
