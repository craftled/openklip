"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type * as React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

const CLICK_THRESHOLD = 3;
const DEAD_ZONE = 32;
const MAX_CURSOR_RANGE = 200;
const MAX_STRETCH = 8;
const HANDLE_BUFFER = 8;
const LABEL_OFFSET = 12;
const VALUE_OFFSET = 0;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function decimalsForStep(step: number): number {
  const text = step.toString();
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function roundValue(value: number, step: number): number {
  const raw = Math.round(value / step) * step;
  return Number.parseFloat(raw.toFixed(decimalsForStep(step)));
}

function snapToDecile(rawValue: number, min: number, max: number): number {
  const normalized = (rawValue - min) / (max - min || 1);
  const nearest = Math.round(normalized * 10) / 10;
  if (Math.abs(normalized - nearest) <= 0.031_25) {
    return min + nearest * (max - min);
  }
  return rawValue;
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type ElasticSliderProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "defaultValue" | "onChange"
> & {
  "aria-label"?: string;
  defaultValue?: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  label: string;
  max?: number;
  min?: number;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
  step?: number;
  value?: number;
};

export function ElasticSlider({
  "aria-label": ariaLabel,
  className,
  defaultValue,
  disabled = false,
  formatValue,
  label,
  max = 1,
  min = 0,
  onValueChange,
  onValueCommit,
  step = 0.01,
  value: valueProp,
  ...props
}: ElasticSliderProps) {
  const safeStep = step > 0 ? step : 0.01;
  const safeMax = Math.max(min + safeStep, max);
  const range = safeMax - min;
  const isControlled = valueProp !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(
    defaultValue ?? min
  );
  const rawValue = isControlled ? valueProp : uncontrolledValue;
  const value = clamp(rawValue, min, safeMax);

  const shouldReduceMotion = useReducedMotion();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  const [isInteracting, setIsInteracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [keyboardFocusRing, setKeyboardFocusRing] = useState(false);

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const pendingPointerFocusRef = useRef(false);
  const isClickRef = useRef(true);
  const animRef = useRef<ReturnType<typeof animate> | null>(null);
  const wrapperRectRef = useRef<DOMRect | null>(null);
  const scaleRef = useRef(1);
  const lastDragValueRef = useRef(value);

  const percentage = ((value - min) / range) * 100;
  const isActive = isInteracting || isHovered;
  const displayValue = formatValue
    ? formatValue(value)
    : value.toFixed(decimalsForStep(safeStep));

  const fillPercent = useMotionValue(percentage);
  const fillWidth = useTransform(fillPercent, (pct) => `${pct}%`);
  const handleLeft = useTransform(
    fillPercent,
    (pct) => `max(4px, calc(${pct}% - 8px))`
  );

  const rubberStretch = useMotionValue(0);
  const rubberWidth = useTransform(
    rubberStretch,
    (stretch) => `calc(100% + ${Math.abs(stretch)}px)`
  );
  const rubberX = useTransform(rubberStretch, (stretch) =>
    stretch < 0 ? stretch : 0
  );

  const setValue = useCallback(
    (nextValue: number) => {
      const rounded = roundValue(clamp(nextValue, min, safeMax), safeStep);
      lastDragValueRef.current = rounded;
      if (!isControlled) {
        setUncontrolledValue(rounded);
      }
      onValueChange?.(rounded);
      return rounded;
    },
    [isControlled, min, onValueChange, safeMax, safeStep]
  );

  const commitValue = useCallback(
    (nextValue: number) => {
      onValueCommit?.(roundValue(clamp(nextValue, min, safeMax), safeStep));
    },
    [min, onValueCommit, safeMax, safeStep]
  );

  useEffect(() => {
    if (!(isInteracting || animRef.current)) {
      fillPercent.jump(percentage);
    }
  }, [fillPercent, isInteracting, percentage]);

  const percentFromValue = useCallback(
    (nextValue: number) => ((nextValue - min) / range) * 100,
    [min, range]
  );

  const positionToValue = useCallback(
    (clientX: number) => {
      const rect = wrapperRectRef.current;
      if (!rect) {
        return min;
      }

      const sceneX = (clientX - rect.left) / scaleRef.current;
      const nativeWidth = wrapperRef.current?.offsetWidth ?? rect.width;
      const percent = clamp(sceneX / nativeWidth, 0, 1);

      return clamp(min + percent * range, min, safeMax);
    },
    [min, range, safeMax]
  );

  const animateFillTo = useCallback(
    (targetPercent: number) => {
      animRef.current?.stop();

      if (shouldReduceMotion) {
        fillPercent.jump(targetPercent);
        animRef.current = null;
        return;
      }

      animRef.current = animate(fillPercent, targetPercent, {
        damping: 25,
        mass: 0.8,
        onComplete: () => {
          animRef.current = null;
        },
        stiffness: 300,
        type: "spring",
      });
    },
    [fillPercent, shouldReduceMotion]
  );

  const computeRubberStretch = useCallback((clientX: number, sign: number) => {
    const rect = wrapperRectRef.current;
    if (!rect) {
      return 0;
    }

    const distancePast = sign < 0 ? rect.left - clientX : clientX - rect.right;
    const overflow = Math.max(0, distancePast - DEAD_ZONE);

    return (
      sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1))
    );
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled) {
        return;
      }

      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);

      pointerDownPos.current = { x: event.clientX, y: event.clientY };
      isClickRef.current = true;
      lastDragValueRef.current = value;
      setIsInteracting(true);

      pendingPointerFocusRef.current = true;
      setKeyboardFocusRing(false);
      trackRef.current?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        pendingPointerFocusRef.current = false;
      });

      const wrapper = wrapperRef.current;
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        wrapperRectRef.current = rect;
        scaleRef.current =
          wrapper.offsetWidth > 0 ? rect.width / wrapper.offsetWidth : 1;
      }
    },
    [disabled, value]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!(isInteracting && pointerDownPos.current)) {
        return;
      }

      const dx = event.clientX - pointerDownPos.current.x;
      const dy = event.clientY - pointerDownPos.current.y;

      if (isClickRef.current && Math.hypot(dx, dy) > CLICK_THRESHOLD) {
        isClickRef.current = false;
        setIsDragging(true);
      }

      if (isClickRef.current) {
        return;
      }

      const rect = wrapperRectRef.current;
      if (rect && !shouldReduceMotion) {
        if (event.clientX < rect.left) {
          rubberStretch.jump(computeRubberStretch(event.clientX, -1));
        } else if (event.clientX > rect.right) {
          rubberStretch.jump(computeRubberStretch(event.clientX, 1));
        } else {
          rubberStretch.jump(0);
        }
      }

      const nextValue = positionToValue(event.clientX);
      animRef.current?.stop();
      animRef.current = null;
      fillPercent.jump(percentFromValue(nextValue));
      setValue(nextValue);
    },
    [
      computeRubberStretch,
      fillPercent,
      isInteracting,
      percentFromValue,
      positionToValue,
      rubberStretch,
      setValue,
      shouldReduceMotion,
    ]
  );

  const endInteraction = useCallback(() => {
    if (!shouldReduceMotion && rubberStretch.get() !== 0) {
      animate(rubberStretch, 0, {
        bounce: 0.15,
        type: "spring",
        visualDuration: 0.35,
      });
    }

    setIsInteracting(false);
    setIsDragging(false);
    pointerDownPos.current = null;
  }, [rubberStretch, shouldReduceMotion]);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!isInteracting) {
        return;
      }

      if (isClickRef.current) {
        const rawValue = positionToValue(event.clientX);
        const discreteSteps = range / safeStep;
        const snapped =
          discreteSteps <= 10
            ? clamp(
                min + Math.round((rawValue - min) / safeStep) * safeStep,
                min,
                safeMax
              )
            : snapToDecile(rawValue, min, safeMax);
        const rounded = setValue(snapped);
        animateFillTo(percentFromValue(rounded));
        commitValue(rounded);
      } else {
        commitValue(lastDragValueRef.current);
      }

      endInteraction();
    },
    [
      animateFillTo,
      commitValue,
      endInteraction,
      isInteracting,
      min,
      percentFromValue,
      positionToValue,
      range,
      safeMax,
      safeStep,
      setValue,
    ]
  );

  const handlePointerCancel = useCallback(() => {
    if (isInteracting) {
      animateFillTo(percentFromValue(value));
      endInteraction();
    }
  }, [animateFillTo, endInteraction, isInteracting, percentFromValue, value]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) {
        return;
      }

      const arrowStep = event.shiftKey ? safeStep * 10 : safeStep;
      let next: number | null = null;

      switch (event.key) {
        case "ArrowDown":
        case "ArrowLeft":
          next = value - arrowStep;
          break;
        case "ArrowRight":
        case "ArrowUp":
          next = value + arrowStep;
          break;
        case "End":
          next = safeMax;
          break;
        case "Home":
          next = min;
          break;
        default:
          return;
      }

      event.preventDefault();
      setKeyboardFocusRing(true);

      const rounded = setValue(next);
      animateFillTo(percentFromValue(rounded));
      commitValue(rounded);
    },
    [
      animateFillTo,
      commitValue,
      disabled,
      min,
      percentFromValue,
      safeMax,
      safeStep,
      setValue,
      value,
    ]
  );

  const [dodge, setDodge] = useState({ left: 38, right: 72 });

  useIsomorphicLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const measure = () => {
      const trackWidth = wrapper.offsetWidth;
      if (trackWidth <= 0) {
        return;
      }

      const left = labelRef.current
        ? ((LABEL_OFFSET + labelRef.current.offsetWidth + HANDLE_BUFFER) /
            trackWidth) *
          100
        : 38;

      const right = valueRef.current
        ? ((trackWidth -
            VALUE_OFFSET -
            valueRef.current.offsetWidth -
            HANDLE_BUFFER) /
            trackWidth) *
          100
        : 72;

      setDodge((previous) =>
        previous.left === left && previous.right === right
          ? previous
          : { left, right }
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    if (labelRef.current) {
      observer.observe(labelRef.current);
    }
    if (valueRef.current) {
      observer.observe(valueRef.current);
    }

    return () => observer.disconnect();
  }, [label, displayValue]);

  const valueDodge = percentage < dodge.left || percentage > dodge.right;
  const handleOpacity = isActive
    ? valueDodge
      ? 0.1
      : isDragging
        ? 0.8
        : 0.5
    : 0;

  const discreteSteps = range / safeStep;
  const hashMarkCount =
    discreteSteps <= 10 ? Math.max(0, Math.floor(discreteSteps) - 1) : 9;
  const hashMarkPct = (index: number) =>
    discreteSteps <= 10
      ? (((index + 1) * safeStep) / range) * 100
      : (index + 1) * 10;

  return (
    <div
      className={cn(
        "[--elastic-slider-height:1.625rem] [--elastic-slider-radius:var(--radius-lg)]",
        "[--elastic-slider-bg:var(--muted)]",
        "[--elastic-slider-fill:var(--muted-foreground)]/10",
        "[--elastic-slider-fill-active:var(--muted-foreground)]/20",
        "[--elastic-slider-hash:var(--muted-foreground)]/30",
        "[--elastic-slider-handle:var(--foreground)]",
        "[--elastic-slider-label:var(--muted-foreground)]",
        "[--elastic-slider-focus:var(--foreground)]",
        "relative h-(--elastic-slider-height)",
        className
      )}
      data-slot="elastic-slider"
      ref={wrapperRef}
      {...props}
    >
      <motion.div
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel ?? label}
        aria-orientation="horizontal"
        aria-valuemax={safeMax}
        aria-valuemin={min}
        aria-valuenow={value}
        aria-valuetext={displayValue}
        className={cn(
          "group/elastic-slider absolute inset-0 cursor-pointer touch-none select-none overflow-hidden rounded-(--elastic-slider-radius) bg-(--elastic-slider-bg) outline-none",
          "data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50",
          "data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-ring/50 data-[focus-visible=true]:ring-offset-1 data-[focus-visible=true]:ring-offset-background"
        )}
        data-active={isActive}
        data-cuelume-hover="tick"
        data-cuelume-press=""
        data-cuelume-release=""
        data-disabled={disabled}
        data-focus-visible={keyboardFocusRing}
        data-slot="elastic-slider-track"
        onBlur={() => setKeyboardFocusRing(false)}
        onFocus={() => {
          if (!pendingPointerFocusRef.current) {
            setKeyboardFocusRing(true);
          }
        }}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={trackRef}
        role="slider"
        style={{ width: rubberWidth, x: rubberX }}
        tabIndex={disabled ? -1 : 0}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          data-slot="elastic-slider-hash-marks"
        >
          {Array.from({ length: hashMarkCount }, (_, index) => (
            <div
              className={cn(
                "absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-200",
                "bg-transparent group-data-[active=true]/elastic-slider:bg-(--elastic-slider-hash)"
              )}
              key={index}
              style={{ left: `${hashMarkPct(index)}%` }}
            />
          ))}
        </div>

        <motion.div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 transition-colors",
            "bg-(--elastic-slider-fill) group-data-[active=true]/elastic-slider:bg-(--elastic-slider-fill-active)"
          )}
          data-slot="elastic-slider-fill"
          style={{ width: fillWidth }}
        />

        <motion.div
          animate={{
            opacity: handleOpacity,
            scaleX: isActive ? 1 : 0.25,
            scaleY: isActive && valueDodge ? 0.75 : 1,
          }}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-3 w-1 rounded-full bg-(--elastic-slider-handle)"
          data-slot="elastic-slider-handle"
          style={{ left: handleLeft, y: "-50%" }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.15 },
                  scaleX: {
                    bounce: 0.15,
                    type: "spring",
                    visualDuration: 0.25,
                  },
                  scaleY: {
                    bounce: 0.1,
                    type: "spring",
                    visualDuration: 0.2,
                  },
                }
          }
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2 inline-flex -translate-y-1/2 items-center font-medium text-(--elastic-slider-label) text-[11px]/none transition-colors"
          data-slot="elastic-slider-label"
          ref={labelRef}
        >
          {label}
        </span>

        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-medium font-mono text-(--elastic-slider-label) text-[11px]/none transition-colors",
            "group-data-[active=true]/elastic-slider:text-(--elastic-slider-focus)"
          )}
          data-slot="elastic-slider-value"
          ref={valueRef}
        >
          {displayValue}
        </span>
      </motion.div>
    </div>
  );
}
