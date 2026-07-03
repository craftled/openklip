"use client";

import { SuccessCheck } from "@/components/success-check";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const pct = progress ? Math.round((progress.step / progress.total) * 100) : 0;

  return (
    <Dialog disablePointerDismissal modal open>
      <DialogContent
        aria-busy={phase === "creating"}
        className="max-w-xs border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-xs"
        data-project-create-overlay=""
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          {phase === "creating" ? "Creating project" : "Project created"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {phase === "creating"
            ? progress
              ? `${progress.message} (${progress.step} of ${progress.total})`
              : "Creating project"
            : slug
              ? `Project ${slug} created`
              : "Project created"}
        </DialogDescription>
        <div
          aria-live="polite"
          className="flex w-full flex-col items-center gap-4 px-6 text-center"
          role="status"
        >
          {phase === "creating" ? (
            <>
              <Spinner />
              <div className="flex w-full flex-col items-center gap-2">
                <p className="text-muted-foreground text-sm">
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
              <SuccessCheck />
              {slug ? <p className="font-medium text-sm">{slug}</p> : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
