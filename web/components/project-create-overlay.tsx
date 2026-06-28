"use client";

import { createPortal } from "react-dom";
import { SuccessCheck } from "@/components/success-check";
import { Spinner } from "@/components/ui/spinner";

export type ProjectCreatePhase = "creating" | "success";

export function ProjectCreateOverlay({
  phase,
  slug,
}: {
  phase: ProjectCreatePhase;
  slug?: string;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-busy={phase === "creating"}
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        {phase === "creating" ? (
          <>
            <Spinner className="size-10 text-tertiary" />
            <p className="text-sm text-tertiary">Creating project…</p>
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
