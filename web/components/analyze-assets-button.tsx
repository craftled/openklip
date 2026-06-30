"use client";

import { useAgentChat } from "@/components/agent-chat-context";
import { Button } from "@/components/ui/button";
import { ScanSearch } from "@/lib/icon";
import { cn } from "@/lib/utils";

// Triggers the "understand my media" subagent pass: one agent run per
// un-described b-roll / still writes an "asset card", and one run over the main
// video's frames logs what is on screen. The editing agent then places media by
// meaning and targets b-roll opportunities. Mirrors FindFillerButton's gating.
export function AnalyzeAssetsButton() {
  const {
    activeStatus,
    agentUsable,
    analyzingAssets,
    onAnalyzeAssets,
    providerLabel,
  } = useAgentChat();

  const label = (() => {
    if (analyzingAssets) {
      return `${providerLabel} is reading your media…`;
    }
    if (!agentUsable) {
      return activeStatus?.installed
        ? `Run \`${activeStatus.signInCmd}\` to connect`
        : `${providerLabel} : not installed`;
    }
    return `Describe media with ${providerLabel}`;
  })();

  return (
    <Button
      className="w-full"
      disabled={analyzingAssets || !agentUsable}
      onClick={() => void onAnalyzeAssets()}
      size="sm"
      title={
        agentUsable
          ? "Describe b-roll and stills and log the video's scenes so the agent can place media by meaning"
          : activeStatus?.installed
            ? `Sign in first : run: ${activeStatus.signInCmd}`
            : `${providerLabel} CLI is not installed`
      }
      variant="outline"
    >
      <ScanSearch
        className={cn(analyzingAssets && "animate-pulse")}
        data-icon="inline-start"
      />
      {label}
    </Button>
  );
}
