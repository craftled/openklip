import {
  type AnimationPlaybackControlsWithThen,
  animate,
  useMotionValue,
  useMotionValueEvent,
  type ValueAnimationTransition,
} from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_SPEED = 5;
const DEFAULT_AMPLITUDE = 0.025;
const DEFAULT_FREQUENCY = 10;
const DEFAULT_TRANSITION: ValueAnimationTransition = {
  duration: 0.2,
  ease: "easeOut",
};

export type MediaVisualizerState =
  | "speaking"
  | "listening"
  | "thinking"
  | "connecting"
  | "idle";

function useAnimatedValue<T>(initialValue: T) {
  const [value, setValue] = useState(initialValue);
  const motionValue = useMotionValue(initialValue);
  const controlsRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  useMotionValueEvent(motionValue, "change", (next) => setValue(next as T));

  const animateFn = useCallback(
    (targetValue: T | T[], transition: ValueAnimationTransition) => {
      controlsRef.current = animate(motionValue, targetValue, transition);
    },
    [motionValue]
  );

  return { value, animate: animateFn };
}

export function useMediaAudioVisualizerWave({
  state = "speaking",
  volume = 0,
}: {
  state?: MediaVisualizerState;
  volume?: number;
}) {
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const { value: amplitude, animate: animateAmplitude } =
    useAnimatedValue(DEFAULT_AMPLITUDE);
  const { value: frequency, animate: animateFrequency } =
    useAnimatedValue(DEFAULT_FREQUENCY);
  const { value: opacity, animate: animateOpacity } = useAnimatedValue(1);

  useEffect(() => {
    switch (state) {
      case "idle":
        setSpeed(DEFAULT_SPEED);
        animateAmplitude(0, DEFAULT_TRANSITION);
        animateFrequency(0, DEFAULT_TRANSITION);
        animateOpacity(1, DEFAULT_TRANSITION);
        return;
      case "listening":
        setSpeed(DEFAULT_SPEED);
        animateAmplitude(DEFAULT_AMPLITUDE, DEFAULT_TRANSITION);
        animateFrequency(DEFAULT_FREQUENCY, DEFAULT_TRANSITION);
        animateOpacity([1, 0.3], {
          duration: 0.75,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "mirror",
        });
        return;
      case "thinking":
      case "connecting":
        setSpeed(DEFAULT_SPEED * 4);
        animateAmplitude(DEFAULT_AMPLITUDE / 4, DEFAULT_TRANSITION);
        animateFrequency(DEFAULT_FREQUENCY * 4, DEFAULT_TRANSITION);
        animateOpacity([1, 0.3], {
          duration: 0.4,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "mirror",
        });
        return;
      default:
        setSpeed(DEFAULT_SPEED * 2);
        animateAmplitude(DEFAULT_AMPLITUDE, DEFAULT_TRANSITION);
        animateFrequency(DEFAULT_FREQUENCY, DEFAULT_TRANSITION);
        animateOpacity(1, DEFAULT_TRANSITION);
        return;
    }
  }, [state, animateAmplitude, animateFrequency, animateOpacity]);

  useEffect(() => {
    if (state === "speaking") {
      animateAmplitude(0.015 + 0.4 * volume, { duration: 0 });
      animateFrequency(20 + 60 * volume, { duration: 0 });
    }
  }, [state, volume, animateAmplitude, animateFrequency]);

  return {
    speed,
    amplitude,
    frequency,
    opacity,
  };
}
