"use client";

import type { SilenceSpan } from "@engine/audio-analysis-core";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_WAVEFORM_BUCKETS,
  type PeakWindow,
  peaksCacheKey,
} from "@/lib/cleanup-silence";

export interface CleanupPeaksResponse {
  buckets: [number, number][];
  fromSec: number;
  sampleRate: number;
  toSec: number;
}

export interface CleanupSilencesProgress {
  message: string;
  phase: "analyzing" | "reading" | "writing";
  step: number;
  total: number;
}

interface SilencesStartResponse {
  jobId?: string;
  progress?: CleanupSilencesProgress;
  silences?: SilenceSpan[];
  status?: "running";
}

interface SilencesJobResponse {
  error?: string;
  progress?: CleanupSilencesProgress;
  silences?: SilenceSpan[];
  status: "done" | "error" | "running";
}

const POLL_MS = 700;

const silencesCache = new Map<string, SilenceSpan[] | null>();
const peaksCache = new Map<string, CleanupPeaksResponse>();

async function pollSilencesJob(
  slug: string,
  jobId: string,
  onProgress?: (p: CleanupSilencesProgress) => void
): Promise<SilenceSpan[] | null> {
  for (;;) {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(slug)}/silences/${encodeURIComponent(jobId)}`
    );
    if (!res.ok) {
      return null;
    }
    const job = (await res.json()) as SilencesJobResponse;
    if (job.progress) {
      onProgress?.(job.progress);
    }
    if (job.status === "done") {
      return job.silences ?? [];
    }
    if (job.status === "error") {
      return null;
    }
    await new Promise((r) => {
      setTimeout(r, POLL_MS);
    });
  }
}

export function useCleanupSilences({
  enabled,
  projectSilences,
  slug,
}: {
  enabled: boolean;
  projectSilences: SilenceSpan[] | null | undefined;
  slug: string;
}) {
  const [hydrated, setHydrated] = useState<
    SilenceSpan[] | null | undefined | "loading"
  >(() => {
    if (projectSilences != null) {
      return projectSilences;
    }
    if (silencesCache.has(slug)) {
      return silencesCache.get(slug) ?? [];
    }
    return;
  });
  const [silencesProgress, setSilencesProgress] =
    useState<CleanupSilencesProgress | null>(null);

  useEffect(() => {
    if (projectSilences != null) {
      setHydrated(projectSilences);
      setSilencesProgress(null);
      return;
    }
    if (!enabled) {
      return;
    }
    if (silencesCache.has(slug)) {
      setHydrated(silencesCache.get(slug) ?? []);
      setSilencesProgress(null);
      return;
    }
    let cancelled = false;
    setHydrated("loading");
    setSilencesProgress(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(slug)}/silences`
        );
        if (!res.ok) {
          silencesCache.set(slug, null);
          if (!cancelled) {
            setHydrated(null);
            setSilencesProgress(null);
          }
          return;
        }
        const data = (await res.json()) as SilencesStartResponse;
        if (data.silences) {
          silencesCache.set(slug, data.silences);
          if (!cancelled) {
            setHydrated(data.silences);
            setSilencesProgress(null);
          }
          return;
        }
        if (!data.jobId) {
          silencesCache.set(slug, null);
          if (!cancelled) {
            setHydrated(null);
            setSilencesProgress(null);
          }
          return;
        }
        if (data.progress && !cancelled) {
          setSilencesProgress(data.progress);
        }
        const silences = await pollSilencesJob(slug, data.jobId, (p) => {
          if (!cancelled) {
            setSilencesProgress(p);
          }
        });
        silencesCache.set(slug, silences);
        if (!cancelled) {
          setHydrated(silences);
          setSilencesProgress(null);
        }
      } catch {
        silencesCache.set(slug, null);
        if (!cancelled) {
          setHydrated(null);
          setSilencesProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, projectSilences, slug]);

  const effectiveSilences =
    projectSilences == null
      ? hydrated === "loading"
        ? undefined
        : hydrated
      : projectSilences;

  return {
    silences: effectiveSilences,
    silencesLoading: hydrated === "loading",
    silencesProgress,
  };
}

export function useCleanupPeaks({
  buckets = DEFAULT_WAVEFORM_BUCKETS,
  slug,
  window,
}: {
  buckets?: number;
  slug: string;
  window: PeakWindow | null;
}) {
  const [peaks, setPeaks] = useState<CleanupPeaksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!window) {
      setPeaks(null);
      setLoading(false);
      return;
    }
    const key = peaksCacheKey(slug, window.fromSec, window.toSec, buckets);
    const cached = peaksCache.get(key);
    if (cached) {
      setPeaks(cached);
      setLoading(false);
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          fromSec: String(window.fromSec),
          toSec: String(window.toSec),
          buckets: String(buckets),
        });
        const res = await fetch(
          `/api/projects/${encodeURIComponent(slug)}/peaks?${params.toString()}`
        );
        if (!res.ok) {
          if (!cancelled && requestId === requestRef.current) {
            setPeaks(null);
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as CleanupPeaksResponse;
        peaksCache.set(key, data);
        if (!cancelled && requestId === requestRef.current) {
          setPeaks(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled && requestId === requestRef.current) {
          setPeaks(null);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buckets, slug, window?.fromSec, window?.toSec]);

  return { loading, peaks };
}

/** Test-only reset for module-level caches. */
export function resetCleanupTabDataCachesForTests(): void {
  silencesCache.clear();
  peaksCache.clear();
}
