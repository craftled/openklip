"use client";

import {
  getSafeAreaInsets,
  type SafeAreaGuidePlatform,
} from "@engine/safe-areas";
import { cn } from "@/lib/utils";

export interface SafeAreaGuidesProps {
  className?: string;
  platform: SafeAreaGuidePlatform | "off";
}

export function SafeAreaGuides({ platform, className }: SafeAreaGuidesProps) {
  if (platform === "off") {
    return null;
  }

  const insets = getSafeAreaInsets(platform);
  const lineClass =
    "absolute border-yellow-400/70 mix-blend-difference pointer-events-none";

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 z-30", className)}
      data-safe-area-guides
      data-safe-area-platform={platform}
    >
      <div
        className={cn(lineClass, "inset-x-0 border-t")}
        style={{ top: `${insets.top * 100}%` }}
      />
      <div
        className={cn(lineClass, "inset-x-0 border-b")}
        style={{ bottom: `${insets.bottom * 100}%` }}
      />
      <div
        className={cn(lineClass, "inset-y-0 border-l")}
        style={{ left: `${insets.left * 100}%` }}
      />
      <div
        className={cn(lineClass, "inset-y-0 border-r")}
        style={{ right: `${insets.right * 100}%` }}
      />
    </div>
  );
}
