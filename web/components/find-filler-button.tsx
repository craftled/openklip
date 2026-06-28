"use client";

import { Sparkles } from "lucide-react";
import { useAgentChat } from "@/components/agent-chat-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      return "Loading chats…";
    }
    if (!agentUsable) {
      return activeStatus?.installed
        ? `Run \`${activeStatus.signInCmd}\` to connect`
        : `${providerLabel} : not installed`;
    }
    return `Find filler with ${providerLabel}`;
  })();

  return (
    <Button
      disabled={isRunning || !agentUsable || chatsLoading}
      onClick={() => void onFindFiller()}
      size="sm"
      title={
        chatsLoading
          ? "Loading chats…"
          : agentUsable
            ? undefined
            : activeStatus?.installed
              ? `Sign in first : run: ${activeStatus.signInCmd}`
              : `${providerLabel} CLI is not installed`
      }
      variant="outline"
    >
      <Sparkles
        className={cn("size-3.5", isRunning && "animate-pulse text-muted-foreground")}
      />
      {label}
    </Button>
  );
}
