"use client";

import { ActionStatusButton } from "@/components/action-status-button";
import { useAgentChat } from "@/components/agent-chat-context";
import { helloLoadingLabel } from "@/lib/hello-loading-labels";
import { Sparkles } from "@/lib/icon";

export function FindFillerButton() {
  const {
    activeStatus,
    agentUsable,
    chatsLoading,
    onFindFiller,
    providerLabel,
    runningThreadId,
  } = useAgentChat();

  const isRunning = runningThreadId !== null;

  const label = (() => {
    if (isRunning) {
      return `${providerLabel} is reading…`;
    }
    if (chatsLoading) {
      return helloLoadingLabel("chats");
    }
    if (!agentUsable) {
      return activeStatus?.installed
        ? `Run \`${activeStatus.signInCmd}\` to connect`
        : `${providerLabel} : not installed`;
    }
    return `Find filler with ${providerLabel}`;
  })();

  return (
    <ActionStatusButton
      busy={isRunning}
      disabled={isRunning || !agentUsable || chatsLoading}
      icon={Sparkles}
      label={label}
      onClick={() => void onFindFiller()}
      size="sm"
      title={
        chatsLoading
          ? helloLoadingLabel("chats")
          : agentUsable
            ? undefined
            : activeStatus?.installed
              ? `Sign in first : run: ${activeStatus.signInCmd}`
              : `${providerLabel} CLI is not installed`
      }
      variant="outline"
    />
  );
}
