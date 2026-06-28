"use client";

import { useAgentChat } from "@/components/agent-chat-context";
import { Button } from "@/components/ui/button";
import { ScanSearch } from "@/lib/icon";
import { cn } from "@/lib/utils";

// Triggers the per-asset subagent pass: one agent run per un-described b-roll /
// still writes an "asset card" (summary, tags, bestFor) so the editing agent can
// place media by meaning. Mirrors FindFillerButton: same agent gating + states.
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
      return `${providerLabel} is describing assets…`;
    }
    if (!agentUsable) {
      return activeStatus?.installed
        ? `Run \`${activeStatus.signInCmd}\` to connect`
        : `${providerLabel} : not installed`;
    }
    return `Describe assets with ${providerLabel}`;
  })();

  return (
    <Button
      className="w-full"
      disabled={analyzingAssets || !agentUsable}
      onClick={() => void onAnalyzeAssets()}
      size="sm"
      title={
        agentUsable
          ? "Describe b-roll and stills so the agent can place them by meaning"
          : activeStatus?.installed
            ? `Sign in first : run: ${activeStatus.signInCmd}`
            : `${providerLabel} CLI is not installed`
      }
      variant="outline"
    >
      <ScanSearch
        className={cn(
          "size-3.5",
          analyzingAssets && "animate-pulse text-tertiary"
        )}
      />
      {label}
    </Button>
  );
}
