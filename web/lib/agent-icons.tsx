import type { ComponentType, SVGProps } from "react";
import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon";
import { CursorLight } from "@/components/ui/svgs/cursorLight";
import { GrokLight } from "@/components/ui/svgs/grokLight";
import { Openai } from "@/components/ui/svgs/openai";

export type AgentProviderId = "claude" | "codex" | "cursor" | "grok";

export const AGENT_GROUP_ICONS: Record<
  AgentProviderId,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  claude: ClaudeAiIcon,
  codex: Openai,
  cursor: CursorLight,
  grok: GrokLight,
};

export function agentProviderId(value: string): AgentProviderId {
  if (value.startsWith("claude")) {
    return "claude";
  }
  if (value.startsWith("gpt")) {
    return "codex";
  }
  if (value.startsWith("composer")) {
    return "cursor";
  }
  return "grok";
}

export function AgentProviderIcon({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const Icon = AGENT_GROUP_ICONS[agentProviderId(value)];
  return <Icon className={className} />;
}
