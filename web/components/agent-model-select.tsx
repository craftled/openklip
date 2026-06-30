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
import {
  AGENT_GROUP_ICONS,
  AgentProviderIcon,
  agentProviderId,
} from "@/lib/agent-icons";
import {
  AGENT_MODEL_GROUPS,
  type AgentModelId,
  getAgentModelLabel,
} from "@/lib/agent-preferences";
import { cn } from "@/lib/utils";
import { type AgentStatus, getAgentStatuses } from "../../app/agent-actions.ts";

export const AGENT_MODEL_ICON_CLASS = "size-3.5 shrink-0 opacity-70";

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

export function AgentModelTriggerValue({ value }: { value: AgentModelId }) {
  return (
    <>
      <AgentProviderIcon className={AGENT_MODEL_ICON_CLASS} value={value} />
      <span className="min-w-0 truncate">{getAgentModelLabel(value)}</span>
    </>
  );
}

export function AgentModelGroupLabel({
  groupId,
  label,
  status,
}: {
  groupId: keyof typeof AGENT_GROUP_ICONS;
  label: string;
  status?: AgentStatus;
}) {
  const Icon = AGENT_GROUP_ICONS[groupId];
  return (
    <SelectLabel className="flex items-center gap-2 pr-2 font-medium uppercase tracking-wide">
      <Icon className={cn(AGENT_MODEL_ICON_CLASS, "text-muted-foreground")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {status ? <StatusBadge status={status} /> : null}
    </SelectLabel>
  );
}

export function AgentModelOptionContent({
  defaultAgent,
  groupId,
  label,
  value,
}: {
  defaultAgent?: AgentModelId;
  groupId: keyof typeof AGENT_GROUP_ICONS;
  label: string;
  value: AgentModelId;
}) {
  const Icon = AGENT_GROUP_ICONS[groupId];
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Icon className={AGENT_MODEL_ICON_CLASS} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {defaultAgent === value ? (
        <Badge
          className="mr-4 h-4 shrink-0 px-1.5 font-normal text-xs"
          variant="secondary"
        >
          Default
        </Badge>
      ) : null}
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
          "w-full justify-start [&_svg]:shrink-0",
          triggerClassName
        )}
        size="sm"
      >
        <SelectValue>
          <AgentModelTriggerValue value={value} />
        </SelectValue>
        <StatusDot className="ml-auto" status={statuses[providerId]} />
      </SelectTrigger>
      <SelectContent className={cn("w-72", className)}>
        {AGENT_MODEL_GROUPS.map((group) => (
          <SelectGroup key={group.id}>
            <AgentModelGroupLabel
              groupId={group.id}
              label={group.label}
              status={statuses[group.id]}
            />
            {group.models.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                <AgentModelOptionContent
                  defaultAgent={defaultAgent}
                  groupId={group.id}
                  label={model.label}
                  value={model.value}
                />
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
