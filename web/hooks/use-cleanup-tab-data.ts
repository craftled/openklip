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

const silencesCache = new Map<string, SilenceSpan[] | null>();
const peaksCache = new Map<string, CleanupPeaksResponse>();

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

  useEffect(() => {
    if (projectSilences != null) {
      setHydrated(projectSilences);
      return;
    }
    if (!enabled) {
      return;
    }
    if (silencesCache.has(slug)) {
      setHydrated(silencesCache.get(slug) ?? []);
      return;
    }
    let cancelled = false;
    setHydrated("loading");
    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(slug)}/silences`
        );
        if (!res.ok) {
          silencesCache.set(slug, null);
          if (!cancelled) {
            setHydrated(null);
          }
          return;
        }
        const data = (await res.json()) as { silences: SilenceSpan[] };
        silencesCache.set(slug, data.silences);
        if (!cancelled) {
          setHydrated(data.silences);
        }
      } catch {
        silencesCache.set(slug, null);
        if (!cancelled) {
          setHydrated(null);
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
