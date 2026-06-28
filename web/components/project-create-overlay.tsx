"use client";

import { createPortal } from "react-dom";
import { SuccessCheck } from "@/components/success-check";
import { Spinner } from "@/components/ui/spinner";
import type { IngestProgressView } from "@/lib/project-create";

export type ProjectCreatePhase = "creating" | "success";

export function ProjectCreateOverlay({
  phase,
  progress,
  slug,
}: {
  phase: ProjectCreatePhase;
  progress?: IngestProgressView | null;
  slug?: string;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const pct = progress ? Math.round((progress.step / progress.total) * 100) : 0;

  return createPortal(
    <div
      aria-busy={phase === "creating"}
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-4 px-6 text-center">
        {phase === "creating" ? (
          <>
            <Spinner className="size-10 text-tertiary" />
            <div className="flex w-full flex-col items-center gap-2">
              <p className="text-sm text-tertiary">
                {progress
                  ? `${progress.message}… (${progress.step}/${progress.total})`
                  : "Creating project…"}
              </p>
              {progress ? (
                <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full bg-foreground/40 transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <SuccessCheck className="text-success" size={64} />
            {slug ? <p className="font-medium text-sm">{slug}</p> : null}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
