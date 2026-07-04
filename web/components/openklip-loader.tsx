"use client";

import { ShimmeringText } from "@/components/shimmering-text";
import { cn } from "@/lib/utils";

export interface OpenKlipLoaderProps {
  className?: string;
  /** Optional status line under the wordmark. */
  label?: string;
}

export function OpenKlipLoader({ className, label }: OpenKlipLoaderProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-50 flex h-screen w-screen items-center justify-center overflow-hidden bg-background px-6 text-foreground",
        className
      )}
      data-openklip-loader=""
      role="status"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="block h-8 w-8 shrink-0 bg-current"
            style={{
              WebkitMask: "url('/openklip.svg') center / contain no-repeat",
              mask: "url('/openklip.svg') center / contain no-repeat",
            }}
          />
          <ShimmeringText
            className="font-semibold text-lg tracking-tight"
            duration={1.2}
            text="OpenKlip"
          />
        </div>
        {label ? (
          <p className="text-muted-foreground text-sm">{label}</p>
        ) : null}
      </div>
    </div>
  );
}
