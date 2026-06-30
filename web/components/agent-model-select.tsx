"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AGENT_GROUP_ICONS, agentProviderId } from "@/lib/agent-icons";
import { AGENT_MODEL_GROUPS, type AgentModelId } from "@/lib/agent-preferences";
import { APP_ICON_CLASS } from "@/lib/icon";
import { cn } from "@/lib/utils";
import { type AgentStatus, getAgentStatuses } from "../../app/agent-actions.ts";

function badgeState(status?: AgentStatus): {
  dot: string;
  text: string;
  label: string;
  title: string;
} {
  if (!status) {
    return {
      dot: "bg-foreground/30",
      text: "text-muted-foreground",
      label: "Checking…",
      title: "Checking…",
    };
  }
  if (!status.installed) {
    return {
      dot: "bg-foreground/40",
      text: "text-muted-foreground",
      label: "Not installed",
      title: `${status.cli} CLI not found on PATH`,
    };
  }
  if (status.connected) {
    return {
      dot: "bg-primary",
      text: "text-foreground",
      label: "Signed in",
      title: `${status.cli} signed in`,
    };
  }
  return {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    label: "Sign in",
    title: status.signInCmd
      ? `Not signed in : run: ${status.signInCmd}`
      : "Not signed in",
  };
}

function StatusDot({
  status,
  className,
}: {
  status?: AgentStatus;
  className?: string;
}) {
  const s = badgeState(status);
  return (
    <span
      aria-label={s.title}
      className={cn("size-1.5 shrink-0 rounded-full", s.dot, className)}
      role="img"
      title={s.title}
    />
  );
}

function StatusBadge({
  status,
  className,
}: {
  status?: AgentStatus;
  className?: string;
}) {
  const s = badgeState(status);
  return (
    <span
      className={cn(
        "flex items-center gap-1 font-medium text-xs normal-case tracking-normal",
        className
      )}
      title={s.title}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", s.dot)} />
      <span className={s.text}>{s.label}</span>
    </span>
  );
}

export interface AgentModelSelectProps {
  className?: string;
  /** Marks the global default model with a badge in the list. */
  defaultAgent?: AgentModelId;
  onValueChange: (value: AgentModelId) => void;
  /** When provided, skips the internal CLI status probe. */
  statuses?: Record<string, AgentStatus>;
  triggerClassName?: string;
  value: AgentModelId;
}

export function AgentModelSelect({
  value,
  onValueChange,
  defaultAgent,
  statuses: statusesProp,
  className,
  triggerClassName,
}: AgentModelSelectProps) {
  const [statusesState, setStatusesState] = useState<
    Record<string, AgentStatus>
  >({});

  useEffect(() => {
    if (statusesProp) {
      return;
    }
    let alive = true;
    getAgentStatuses()
      .then((list) => {
        if (alive) {
          setStatusesState(Object.fromEntries(list.map((s) => [s.id, s])));
        }
      })
      .catch(() => {
        // detection is best-effort; selector still works without badges
      });
    return () => {
      alive = false;
    };
  }, [statusesProp]);

  const statuses = statusesProp ?? statusesState;

  const providerId = agentProviderId(value);

  return (
    <Select
      onValueChange={(next) => onValueChange(next as AgentModelId)}
      value={value}
    >
      <SelectTrigger
        className={cn(
          "w-full border border-border bg-muted/50 text-xs focus:ring-0 data-popup-open:ring-0 [&_svg]:shrink-0",
          triggerClassName
        )}
      >
        <SelectValue />
        <StatusDot className="ml-auto" status={statuses[providerId]} />
      </SelectTrigger>
      <SelectContent className={className}>
        {AGENT_MODEL_GROUPS.map((group) => {
          const Icon = AGENT_GROUP_ICONS[group.id];
          return (
            <SelectGroup key={group.id}>
              <SelectLabel className="flex items-center gap-2 font-medium text-xs uppercase tracking-wide">
                <Icon className={APP_ICON_CLASS} />
                <span>{group.label}</span>
                <StatusBadge className="ml-auto" status={statuses[group.id]} />
              </SelectLabel>
              {group.models.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  <span className="flex w-full items-center gap-2">
                    <Icon className={APP_ICON_CLASS} />
                    <span className="min-w-0 flex-1 truncate">
                      {model.label}
                    </span>
                    {defaultAgent === model.value && (
                      <Badge
                        className="h-4 shrink-0 px-1.5 font-normal text-xs"
                        variant="secondary"
                      >
                        Default
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
