"use client";

import type { CleanupCandidate } from "@engine/cleanup";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentChat } from "@/components/agent-chat-context";
import { toastPromise } from "@/lib/app-toast";
import { aiCleanupWordsToCandidates } from "@/lib/cleanup-ai";
import { suggestCleanupCutsPromiseMessages } from "@/lib/toast-notifications";
import { suggestCleanupCuts } from "../../app/agent-actions.ts";

export interface CleanupAiFlight {
  requestId: number;
  slug: string;
}

export function shouldMergeCleanupAiResult(
  live: CleanupAiFlight,
  captured: CleanupAiFlight
): boolean {
  return live.slug === captured.slug && live.requestId === captured.requestId;
}

export function bumpCleanupAiFlightOnSlugChange(
  flight: CleanupAiFlight,
  nextSlug: string
): CleanupAiFlight {
  return { slug: nextSlug, requestId: flight.requestId + 1 };
}

export function startCleanupAiFlight(
  flight: CleanupAiFlight,
  slug: string
): { captured: CleanupAiFlight; nextFlight: CleanupAiFlight } {
  const requestId = flight.requestId + 1;
  const nextFlight = { slug, requestId };
  return { captured: nextFlight, nextFlight };
}

export function canStartCleanupAiPass(input: {
  agentUsable: boolean;
  applying: boolean;
  running: boolean;
}): boolean {
  return input.agentUsable && !input.running && !input.applying;
}

export function useCleanupAiPass({
  applying,
  onClear,
  onResults,
  slug,
}: {
  applying: boolean;
  onClear: () => void;
  onResults: (candidates: CleanupCandidate[]) => void;
  slug: string;
}) {
  const { activeStatus, agent, agentUsable, providerLabel, setAgent } =
    useAgentChat();
  const [running, setRunning] = useState(false);
  const flightRef = useRef<CleanupAiFlight>({ slug, requestId: 0 });

  useEffect(() => {
    onClear();
    flightRef.current = bumpCleanupAiFlightOnSlugChange(
      flightRef.current,
      slug
    );
    setRunning(false);
  }, [onClear, slug]);

  const disabledHint = (() => {
    if (!activeStatus) {
      return "Checking agent CLI…";
    }
    if (!activeStatus.installed) {
      return `${providerLabel} CLI is not installed`;
    }
    if (!activeStatus.connected) {
      return activeStatus.signInCmd
        ? `Sign in first : run: ${activeStatus.signInCmd}`
        : "Agent CLI is not signed in";
    }
  })();

  const onRunAiPass = useCallback(async () => {
    if (!canStartCleanupAiPass({ agentUsable, applying, running })) {
      return;
    }
    const { captured, nextFlight } = startCleanupAiFlight(
      flightRef.current,
      slug
    );
    flightRef.current = nextFlight;
    setRunning(true);
    try {
      const run = (async () => {
        const result = await suggestCleanupCuts(slug, agent);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result;
      })();
      void toastPromise(run, suggestCleanupCutsPromiseMessages(providerLabel));
      const res = await run;
      if (shouldMergeCleanupAiResult(flightRef.current, captured)) {
        onResults(aiCleanupWordsToCandidates(res.words));
      }
    } catch {
      // surfaced by toastPromise
    } finally {
      if (shouldMergeCleanupAiResult(flightRef.current, captured)) {
        setRunning(false);
      }
    }
  }, [agent, agentUsable, applying, onResults, providerLabel, running, slug]);

  return {
    agent,
    agentUsable,
    disabledHint,
    onRunAiPass,
    providerLabel,
    running,
    setAgent,
  };
}
