"use client";

import { type ComponentProps, useMemo } from "react";
import {
  AgentAudioVisualizerWaveVariants,
  WaveShader,
} from "@/components/agents-ui/agent-audio-visualizer-wave";
import { useMediaAudioVisualizerWave } from "@/hooks/use-media-audio-visualizer-wave";
import { useMediaElementVolume } from "@/hooks/use-media-element-volume";
import { cn } from "@/lib/utils";

export function MediaAudioVisualizerWave({
  mediaRef,
  active = true,
  size = "md",
  state = "speaking",
  color = "#FA954C",
  colorShift = 0.3,
  lineWidth = 2,
  blur = 0.5,
  className,
  ref,
  ...props
}: {
  mediaRef: React.RefObject<HTMLMediaElement | null>;
  active?: boolean;
  size?: "icon" | "sm" | "md" | "lg" | "xl";
  state?: "speaking" | "listening" | "thinking" | "connecting" | "idle";
  color?: `#${string}`;
  colorShift?: number;
  lineWidth?: number;
  blur?: number;
  className?: string;
} & ComponentProps<"div">) {
  const volume = useMediaElementVolume(
    mediaRef,
    active && state === "speaking"
  );
  const visualState = active ? state : "idle";
  const { speed, amplitude, frequency, opacity } = useMediaAudioVisualizerWave({
    state: visualState,
    volume,
  });

  const resolvedLineWidth = useMemo(() => {
    switch (size) {
      case "icon":
      case "sm":
        return lineWidth ?? 2;
      default:
        return lineWidth ?? 1;
    }
  }, [lineWidth, size]);

  return (
    <WaveShader
      amplitude={amplitude}
      blur={blur}
      className={cn(
        AgentAudioVisualizerWaveVariants({ size }),
        "mask-[linear-gradient(90deg,transparent_0%,black_20%,black_80%,transparent_100%)]",
        className
      )}
      color={color}
      colorShift={colorShift}
      frequency={frequency}
      lineWidth={resolvedLineWidth}
      mix={opacity}
      ref={ref}
      speed={speed}
      {...props}
    />
  );
}
