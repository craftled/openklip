"use client";

import type {
  AgentState,
  TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import type { VariantProps } from "class-variance-authority";
import type { LocalAudioTrack, RemoteAudioTrack } from "livekit-client";
import { type ComponentProps, useMemo } from "react";
import {
  AgentAudioVisualizerWaveVariants,
  WaveShader,
} from "@/components/agents-ui/wave-shader";
import { useAgentAudioVisualizerWave } from "@/hooks/agents-ui/use-agent-audio-visualizer-wave";
import { useThemeColorHex } from "@/hooks/use-theme-color-hex";
import { cn } from "@/lib/utils";

export {
  AgentAudioVisualizerWaveVariants,
  WaveShader,
} from "@/components/agents-ui/wave-shader";

const WAVEFORM_AGENT_FALLBACK = "#171717";

export interface AgentAudioVisualizerWaveProps {
  /**
   * The audio track to visualize. Can be a local/remote audio track or a track reference.
   */
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder;
  /**
   * The blur of the wave in pixels.
   * @defaultValue 0.5
   */
  blur?: number;
  /**
   * Additional CSS class names to apply to the container.
   */
  className?: string;
  /**
   * The color of the wave in hexidecimal format.
   * Defaults to the theme primary color.
   */
  color?: `#${string}`;
  /**
   * The color shift of the wave. Higher values increase hue variation toward the edges.
   * @defaultValue 0.05
   */
  colorShift?: number;
  /**
   * The line width of the wave in pixels.
   * @defaultValue 2.0
   */
  lineWidth?: number;
  /**
   * The size of the visualizer.
   * @defaultValue 'lg'
   */
  size?: "icon" | "sm" | "md" | "lg" | "xl";
  /**
   * The agent state.
   * @defaultValue 'speaking'
   */
  state?: AgentState;
}

/**
 * A wave-style audio visualizer that responds to agent state and audio levels.
 * Displays an animated wave that reacts to the current agent state (connecting, thinking, speaking, etc.)
 * and audio volume when speaking.
 *
 * @extends ComponentProps<'div'>
 *
 * @example ```tsx
 * <AgentAudioVisualizerWave
 *   size="lg"
 *   state="speaking"
 *   color="#00a0c1"
 *   colorShift={0.3}
 *   lineWidth={2}
 *   blur={0.5}
 *   audioTrack={audioTrack}
 * />
 * ```
 */
export function AgentAudioVisualizerWave({
  size = "lg",
  state = "speaking",
  color,
  colorShift = 0.05,
  lineWidth,
  blur,
  audioTrack,
  className,
  ref,
  ...props
}: AgentAudioVisualizerWaveProps &
  ComponentProps<"div"> &
  VariantProps<typeof AgentAudioVisualizerWaveVariants>) {
  const _lineWidth = useMemo(() => {
    if (lineWidth !== undefined) {
      return lineWidth;
    }
    switch (size) {
      case "icon":
      case "sm":
        return 2;
      default:
        return 1;
    }
  }, [lineWidth, size]);

  const { speed, amplitude, frequency, opacity } = useAgentAudioVisualizerWave({
    state,
    audioTrack,
  });
  const themeColor = useThemeColorHex("--primary", WAVEFORM_AGENT_FALLBACK);
  const resolvedColor = (color ?? themeColor) as `#${string}`;

  return (
    <WaveShader
      amplitude={amplitude}
      blur={blur}
      className={cn(
        AgentAudioVisualizerWaveVariants({ size }),
        "mask-[linear-gradient(90deg,transparent_0%,black_20%,black_80%,transparent_100%)]",
        className
      )}
      color={resolvedColor}
      colorShift={colorShift}
      data-lk-state={state}
      frequency={frequency}
      lineWidth={_lineWidth}
      mix={opacity}
      ref={ref}
      speed={speed}
      {...props}
    />
  );
}
