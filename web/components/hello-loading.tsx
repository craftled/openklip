"use client";

import { AppleHelloEffectEnglish } from "@/components/apple-hello-effect/apple-hello-effect-english";
import {
  type HelloLoadingContext,
  helloLoadingLabel,
} from "@/lib/hello-loading-labels";
import { cn } from "@/lib/utils";

export interface HelloLoadingProps {
  className?: string;
  context: HelloLoadingContext;
  /** Fill the viewport and center the animation. */
  fullScreen?: boolean;
  size?: "compact" | "default";
}

export function HelloLoading({
  className,
  context,
  fullScreen = false,
  size = "default",
}: HelloLoadingProps) {
  const label = helloLoadingLabel(context);
  const iconClass =
    size === "compact"
      ? "h-8 w-auto max-w-[8rem] sm:h-9"
      : "h-10 w-auto max-w-[10rem] sm:h-12 sm:max-w-[12rem]";

  return (
    <div
      aria-live="polite"
      className={cn(
        "flex flex-col items-center gap-2 text-foreground",
        fullScreen && "grid h-screen place-items-center bg-background px-6",
        className
      )}
      data-hello-loading=""
      data-hello-loading-context={context}
      role="status"
    >
      <AppleHelloEffectEnglish className={iconClass} durationScale={0.85} />
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
