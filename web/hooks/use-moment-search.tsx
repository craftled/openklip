"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type MomentTextMatch,
  mergeMomentTextMatches,
} from "@/lib/moment-keep";
import {
  defaultMomentSearchTab,
  MOMENT_SEARCH_RESULT_LIMIT,
  type MomentSearchTab,
} from "@/lib/moment-search-display";

const DEBOUNCE_MS = 250;
const POLL_MS = 2000;

export interface TranscriptWord {
  deleted: boolean;
  endSample: number;
  id: string;
  startSample: number;
  text: string;
}

export interface MomentSceneResult {
  bestAtSec?: number;
  bestFrame?: string;
  fromSec: number;
  score: number;
  source: "both" | "embedding" | "summary";
  summary?: string;
  toSec: number;
}

interface MomentSearchApiResponse {
  building: boolean;
  error?: string;
  indexed: boolean;
  results: MomentSceneResult[];
}

export interface UseMomentSearchParams {
  slug: string;
  words: TranscriptWord[];
}

// Stateful orchestration for the Search sidebar panel: debounces the query,
// runs the Text tab's phrase search over `words` client-side, and drives
// the Scene tab's server search (GET) plus the visual-index build
// lifecycle (POST to start, poll to watch it finish). Kept separate from
// the presentational panel (web/components/moment-search-panel.tsx) so the
// panel stays a thin render of this hook's return value.
export function useMomentSearch({ slug, words }: UseMomentSearchParams) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [explicitTab, setExplicitTab] = useState<MomentSearchTab | null>(null);
  const [sceneResults, setSceneResults] = useState<MomentSceneResult[]>([]);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [indexed, setIndexed] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildErrorMessage, setBuildErrorMessage] = useState<string | null>(
    null
  );
  const [statusChecked, setStatusChecked] = useState(false);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const requestedBuildRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Focus the query input once, when the panel mounts (it only mounts when
  // the sidebar switches to the "search" view).
  useEffect(() => {
    queryInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // A new query gets a fresh default-tab decision and a fresh chance to
  // auto-retry a build; a manual tab click or a failed build only sticks
  // for the query that was active at the time.
  useEffect(() => {
    setExplicitTab(null);
    requestedBuildRef.current = false;
  }, [debouncedQuery]);

  const applyStatus = useCallback((data: MomentSearchApiResponse) => {
    if (!mountedRef.current) {
      return;
    }
    setIndexed(data.indexed);
    setBuilding(data.building);
    setBuildErrorMessage(data.error ?? null);
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(slug)}/moment-search`
      );
      const data = (await res.json()) as MomentSearchApiResponse;
      applyStatus(data);
    } catch {
      // best-effort; the next poll tick (or user action) retries
    } finally {
      if (mountedRef.current) {
        setStatusChecked(true);
      }
    }
  }, [applyStatus, slug]);

  const startBuild = useCallback(async () => {
    requestedBuildRef.current = true;
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(slug)}/moment-search`,
        { method: "POST" }
      );
      const data = (await res.json()) as { building: boolean };
      if (mountedRef.current) {
        setBuilding(data.building);
        setBuildErrorMessage(null);
      }
    } catch {
      // best-effort; the status poll below keeps checking
    }
  }, [slug]);

  const retryBuild = useCallback(() => {
    setBuildErrorMessage(null);
    requestedBuildRef.current = false;
    void startBuild();
  }, [startBuild]);

  // Initial status probe on mount (and if the slug ever changes): learn
  // whether we are already indexed BEFORE ever deciding to kick off a
  // build, so an already-indexed project never flashes "Indexing footage".
  useEffect(() => {
    setStatusChecked(false);
    void checkStatus();
  }, [checkStatus]);

  // Auto-POST once per "confirmed not indexed" streak: on the initial
  // status check, or again for a fresh query if a prior build genuinely
  // never converged. Never while a build is already running, and never
  // again after a build has failed without an explicit Retry.
  useEffect(() => {
    if (
      !statusChecked ||
      indexed ||
      building ||
      buildErrorMessage !== null ||
      requestedBuildRef.current
    ) {
      return;
    }
    void startBuild();
  }, [statusChecked, indexed, building, buildErrorMessage, startBuild]);

  // Poll status every 2s while a build is confirmed running.
  useEffect(() => {
    if (!building) {
      return;
    }
    const id = setInterval(() => void checkStatus(), POLL_MS);
    return () => clearInterval(id);
  }, [building, checkStatus]);

  // Scene fetch on the debounced query, once the index is known current.
  // Aborts the previous request on every re-run (a fresh query, or slug
  // change): the embed worker processes one request at a time, so a
  // superseded fetch left running would still occupy its turn and push
  // later, still-relevant queries toward the server's request timeout.
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!indexed || trimmed.length < 2) {
      setSceneResults([]);
      return;
    }
    const controller = new AbortController();
    setSceneLoading(true);
    fetch(
      `/api/projects/${encodeURIComponent(slug)}/moment-search?q=${encodeURIComponent(trimmed)}&limit=${MOMENT_SEARCH_RESULT_LIMIT}`,
      { signal: controller.signal }
    )
      .then((res) => res.json() as Promise<MomentSearchApiResponse>)
      .then((data) => {
        applyStatus(data);
        setSceneResults(data.results);
      })
      .catch((e) => {
        if ((e as { name?: string }).name !== "AbortError") {
          setSceneResults([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSceneLoading(false);
        }
      });
    return () => {
      controller.abort();
    };
  }, [applyStatus, debouncedQuery, indexed, slug]);

  const textResults = useMemo<MomentTextMatch[]>(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      return [];
    }
    return mergeMomentTextMatches(
      { words },
      trimmed,
      MOMENT_SEARCH_RESULT_LIMIT
    );
  }, [words, debouncedQuery]);

  const activeTab = explicitTab ?? defaultMomentSearchTab(textResults.length);

  const clearQuery = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  return {
    activeTab,
    buildErrorMessage,
    building,
    clearQuery,
    hasWords: words.length > 0,
    indexed,
    query,
    queryInputRef,
    retryBuild,
    sceneLoading,
    sceneResults,
    setActiveTab: setExplicitTab,
    setQuery,
    textResults,
  };
}
