"use client";

import type { Project as EngineProject } from "@engine/edl";
import { useEffect, useRef } from "react";
import { toastExternalEditSynced } from "@/lib/app-toast";
import {
  decideLiveSync,
  PROJECT_LIVE_SYNC_POLL_MS,
  revisionFromProject,
} from "@/lib/project-live-sync";
import {
  fetchProjectRevision,
  fetchProjectState,
} from "@/lib/project-live-sync-client";

export interface UseProjectLiveSyncParams {
  /** Disable polling (tests / future settings). Default true. */
  enabled?: boolean;
  /** Same reseed path as HistoryPanel onReverted. */
  onExternalProject: (project: EngineProject) => void;
  pendingSaves: number;
  pollMs?: number;
  /** Latest revision the editor has applied from disk / initial load. */
  revision: number | undefined;
  slug: string;
}

/**
 * Poll project revision; when CLI/MCP advances it past the editor's last
 * applied revision (and no GUI saves are in flight), reseed the open document.
 */
export function useProjectLiveSync({
  slug,
  revision,
  pendingSaves,
  onExternalProject,
  enabled = true,
  pollMs = PROJECT_LIVE_SYNC_POLL_MS,
}: UseProjectLiveSyncParams): void {
  const syncedRevisionRef = useRef(revisionFromProject({ revision }));
  const pendingSavesRef = useRef(pendingSaves);
  const fetchInFlightRef = useRef(false);
  const onExternalProjectRef = useRef(onExternalProject);
  const slugRef = useRef(slug);
  const enabledRef = useRef(enabled);
  const tickRef = useRef<(opts?: { silent?: boolean }) => Promise<void>>(
    async () => {
      // filled in effect
    }
  );

  pendingSavesRef.current = pendingSaves;
  onExternalProjectRef.current = onExternalProject;
  slugRef.current = slug;
  enabledRef.current = enabled;

  // When the open project slug changes (or SSR reseed with a higher rev),
  // reset the baseline without treating it as an external edit.
  useEffect(() => {
    syncedRevisionRef.current = revisionFromProject({ revision });
  }, [slug, revision]);

  useEffect(() => {
    if (!(enabled && slug)) {
      return;
    }

    let cancelled = false;

    const tick = async (opts?: { silent?: boolean }) => {
      if (cancelled || fetchInFlightRef.current || !enabledRef.current) {
        return;
      }
      const activeSlug = slugRef.current;
      if (!activeSlug) {
        return;
      }
      try {
        const remoteRevision = await fetchProjectRevision(activeSlug);
        if (cancelled) {
          return;
        }
        const decision = decideLiveSync({
          syncedRevision: syncedRevisionRef.current,
          remoteRevision,
          pendingSaves: pendingSavesRef.current,
          fetchInFlight: fetchInFlightRef.current,
        });
        if (decision.action !== "fetch-project") {
          return;
        }
        fetchInFlightRef.current = true;
        try {
          const { project, revision: loadedRevision } =
            await fetchProjectState(activeSlug);
          if (cancelled) {
            return;
          }
          // Re-check pending saves after the network round-trip.
          if (pendingSavesRef.current > 0) {
            return;
          }
          onExternalProjectRef.current(project);
          syncedRevisionRef.current = loadedRevision;
          // Silent after local save drain: those reseeds are usually our own
          // writes. Interval/focus polls toast for true external CLI/MCP edits.
          if (!opts?.silent) {
            toastExternalEditSynced(loadedRevision);
          }
        } finally {
          fetchInFlightRef.current = false;
        }
      } catch {
        // Live sync is best-effort; a failed poll must not surface as a save error.
      }
    };

    tickRef.current = tick;
    void tick();
    const id = setInterval(() => void tick(), pollMs);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, pollMs, slug]);

  // When the save queue drains, probe immediately so an external edit that
  // arrived mid-save is applied without waiting for the next interval.
  // Silent: avoid "Edit updated" after ordinary GUI saves that bump revision.
  useEffect(() => {
    if (!enabled || pendingSaves !== 0) {
      return;
    }
    void tickRef.current({ silent: true });
  }, [enabled, pendingSaves]);
}
