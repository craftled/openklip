"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle, RotateCcw } from "@/lib/icon";
import type { SaveMutationRecord } from "@/lib/save-queue";
import { cn } from "@/lib/utils";

export interface SaveRecoveryBannerProps {
  className?: string;
  dirtyCount: number;
  failedSaves: readonly SaveMutationRecord[];
  onReload: () => void;
  onRetry: () => void;
  reloading?: boolean;
  retrying?: boolean;
}

/**
 * Persistent (not a toast) surface for a failed optimistic save. Stays
 * mounted for as long as `failedSaves` is non-empty, so closing the config
 * panel or letting other saves succeed cannot hide the fact that an earlier
 * edit is still unpersisted.
 */
export function SaveRecoveryBanner({
  className,
  dirtyCount,
  failedSaves,
  onReload,
  onRetry,
  reloading = false,
  retrying = false,
}: SaveRecoveryBannerProps) {
  const [confirmingReload, setConfirmingReload] = useState(false);

  if (failedSaves.length === 0) {
    return null;
  }

  const latestError = failedSaves.at(-1)?.error ?? "save failed";
  const failedLabel =
    failedSaves.length === 1
      ? "1 change failed to save"
      : `${failedSaves.length} changes failed to save`;

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs shadow-md dark:bg-destructive/20",
        className
      )}
      data-testid="save-recovery-banner"
      role="alert"
    >
      <div className="flex items-start gap-1.5">
        <IconAlertTriangle className="mt-0.5 size-3.5! shrink-0 opacity-100" />
        <div className="min-w-0 flex-1">
          <p className="font-medium" data-testid="save-recovery-dirty-count">
            {failedLabel}
            {dirtyCount > failedSaves.length
              ? ` (${dirtyCount} unsaved in total)`
              : ""}
          </p>
          <p className="truncate text-destructive/80">{latestError}</p>
        </div>
      </div>
      {confirmingReload ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[0.7rem] text-destructive/80">
            Discard failed changes and reload from disk?
          </span>
          <Button
            aria-busy={reloading ? true : undefined}
            className="h-6 px-2 text-[0.7rem]"
            data-testid="save-recovery-reload-confirm"
            disabled={reloading}
            onClick={() => {
              setConfirmingReload(false);
              onReload();
            }}
            size="xs"
            variant="destructive"
          >
            {reloading ? "Reloading…" : "Reload"}
          </Button>
          <Button
            className="h-6 px-2 text-[0.7rem]"
            disabled={reloading}
            onClick={() => setConfirmingReload(false)}
            size="xs"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button
            aria-busy={retrying ? true : undefined}
            className="h-6 gap-1 px-2 text-[0.7rem]"
            data-testid="save-recovery-retry"
            disabled={retrying}
            onClick={onRetry}
            size="xs"
            variant="destructive"
          >
            <RotateCcw className="size-3! opacity-100" />
            {retrying ? "Retrying…" : "Retry"}
          </Button>
          <Button
            className="h-6 px-2 text-[0.7rem]"
            data-testid="save-recovery-reload"
            onClick={() => setConfirmingReload(true)}
            size="xs"
            variant="outline"
          >
            Reload from disk
          </Button>
        </div>
      )}
    </div>
  );
}
