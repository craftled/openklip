"use client";

import type { CutTransition } from "@engine/edl";
import { useEffect, useImperativeHandle, useRef } from "react";
import {
  type CutTransitionSweepController,
  createCutTransitionSweepController,
  prefersReducedMotion,
} from "@/lib/cut-transition-sweep";

export interface CutTransitionSweepHandle {
  play: (transition: CutTransition) => void;
}

export interface CutTransitionSweepProps {
  ref?: React.Ref<CutTransitionSweepHandle>;
}

// Decorative WebGL sweep overlay played over a preview cut boundary. Sits
// above every other preview-container layer (safe-area guides at z-30,
// hero title at z-20, overlays at z-10) so the band visually covers the
// cut instant. Pointer-events are disabled so it never blocks the
// transport controls underneath.
export function CutTransitionSweep({ ref }: CutTransitionSweepProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<CutTransitionSweepController | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const controller = createCutTransitionSweepController(canvas);
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      play: (transition: CutTransition) => {
        controllerRef.current?.play(transition, prefersReducedMotion());
      },
    }),
    []
  );

  return (
    <canvas
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      ref={canvasRef}
    />
  );
}
