"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  toastProjectCompacted,
  toastProjectCompactFailed,
  toastProjectRebuildFailed,
  toastProjectRebuildStarted,
} from "@/lib/app-toast";
import { Archive, IconAlertTriangle, IconLoader, RotateCcw } from "@/lib/icon";
import {
  compactProjectApi,
  getProjectCompactStatusApi,
  rebuildProjectApi,
} from "@/lib/projects-client";

export interface ProjectDiskPanelViewProps {
  checkingStatus: boolean;
  compacted: boolean;
  compacting: boolean;
  confirmingCompact: boolean;
  onCancelCompact: () => void;
  onCompact: () => void;
  onRebuild: () => void;
  onRequestCompact: () => void;
  rebuilding: boolean;
}

/**
 * Pure presentational half of the disk-management panel (Config -> Project
 * tab). Compact deletes regenerable derived media (proxy, frames,
 * transcript, moment index, output) to reclaim disk; it never touches the
 * source video or the edit. Because app/media/proxy.mp4/route.ts and
 * app/media/frames/[name]/route.ts 404 on a missing file rather than lazily
 * rebuilding it, a compacted project needs an explicit Rebuild before it can
 * play again, so this always surfaces that state as a banner rather than
 * letting the editor show a silently broken player.
 */
export function ProjectDiskPanelView({
  checkingStatus,
  compacted,
  compacting,
  confirmingCompact,
  onCancelCompact,
  onCompact,
  onRebuild,
  onRequestCompact,
  rebuilding,
}: ProjectDiskPanelViewProps) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-muted-foreground">
        Compact removes the proxy, frames, and other regenerable media to free
        disk. The source video and your edit are never touched.
      </p>
      {compacted && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-700 dark:text-amber-400">
          <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            This project is compacted: playback is unavailable until you
            rebuild.
          </span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        {confirmingCompact ? (
          <>
            <span className="text-muted-foreground">Are you sure?</span>
            <Button
              className="text-destructive hover:bg-destructive/10"
              disabled={compacting}
              onClick={onCompact}
              size="sm"
              type="button"
              variant="outline"
            >
              {compacting && <IconLoader className="animate-spin" />}
              Confirm compact
            </Button>
            <Button
              disabled={compacting}
              onClick={onCancelCompact}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            disabled={checkingStatus || compacted || compacting}
            onClick={onRequestCompact}
            size="sm"
            type="button"
            variant="outline"
          >
            <Archive />
            Compact project
          </Button>
        )}
        <Button
          disabled={rebuilding}
          onClick={onRebuild}
          size="sm"
          type="button"
          variant="outline"
        >
          {rebuilding ? <IconLoader className="animate-spin" /> : <RotateCcw />}
          {rebuilding ? "Rebuilding…" : "Rebuild media"}
        </Button>
      </div>
    </div>
  );
}

export interface ProjectDiskPanelProps {
  slug: string;
}

/** Stateful wrapper: checks compacted status on mount, arms/confirms
 * Compact, and starts the Rebuild background job (visible in the Job
 * Center). See ProjectDiskPanelView for the presentational half. */
export function ProjectDiskPanel({ slug }: ProjectDiskPanelProps) {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [compacted, setCompacted] = useState(false);
  const [confirmingCompact, setConfirmingCompact] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const refreshStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const { compacted: isCompacted } = await getProjectCompactStatusApi(slug);
      setCompacted(isCompacted);
    } catch {
      // Status check is best-effort; leave the last known state.
    } finally {
      setCheckingStatus(false);
    }
  }, [slug]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const onRequestCompact = useCallback(() => setConfirmingCompact(true), []);
  const onCancelCompact = useCallback(() => setConfirmingCompact(false), []);

  const onCompact = useCallback(async () => {
    setCompacting(true);
    try {
      const { bytesFreed } = await compactProjectApi(slug);
      toastProjectCompacted(bytesFreed);
      setConfirmingCompact(false);
      await refreshStatus();
    } catch (e) {
      toastProjectCompactFailed((e as Error).message);
    } finally {
      setCompacting(false);
    }
  }, [slug, refreshStatus]);

  const onRebuild = useCallback(async () => {
    setRebuilding(true);
    try {
      await rebuildProjectApi(slug);
      toastProjectRebuildStarted();
    } catch (e) {
      toastProjectRebuildFailed((e as Error).message);
    } finally {
      setRebuilding(false);
      await refreshStatus();
    }
  }, [slug, refreshStatus]);

  return (
    <ProjectDiskPanelView
      checkingStatus={checkingStatus}
      compacted={compacted}
      compacting={compacting}
      confirmingCompact={confirmingCompact}
      onCancelCompact={onCancelCompact}
      onCompact={() => void onCompact()}
      onRebuild={() => void onRebuild()}
      onRequestCompact={onRequestCompact}
      rebuilding={rebuilding}
    />
  );
}
