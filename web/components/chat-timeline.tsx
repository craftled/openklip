"use client";

import {
  type ActionLogEntry,
  isActionLogEntry,
} from "@engine/action-log-entry";
import type { AgentTask } from "@engine/agent-task-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { HelloLoading } from "@/components/hello-loading";
import {
  formatTaskRelativeTime,
  parseTasks,
  taskStatusBadgeClass,
  taskStatusLabel,
} from "@/components/task-progress-panel";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import { MessageScrollerItem } from "@/components/ui/message-scroller";
import type { AgentThread } from "@/lib/agent-threads";
import { buildThreadTimeline } from "@/lib/chat-timeline";
import { Check, IconLoader, X } from "@/lib/icon";
import { relativeTimeAgo } from "@/lib/relative-time";

function parseHistoryEntries(value: unknown): ActionLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isActionLogEntry);
}

function TaskStepRow({ step }: { step: AgentTask["steps"][number] }) {
  const failed = step.status === "failed";
  const running = step.status === "running";
  const done = step.status === "done";

  return (
    <li
      className={
        failed
          ? "flex flex-col gap-0.5 text-destructive"
          : "flex flex-col gap-0.5 text-muted-foreground"
      }
      data-task-step={step.id}
    >
      <div className="flex items-center gap-1.5 text-[11px] leading-snug">
        {done ? (
          <Check aria-hidden className="size-3 shrink-0 text-foreground" />
        ) : null}
        {running ? (
          <IconLoader
            aria-hidden
            className="size-3 shrink-0 animate-spin text-primary"
          />
        ) : null}
        {step.status === "pending" ? (
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full border border-border"
          />
        ) : null}
        {failed ? <X aria-hidden className="size-3 shrink-0" /> : null}
        <span
          className={
            running
              ? "min-w-0 flex-1 animate-pulse text-foreground"
              : "min-w-0 flex-1"
          }
        >
          {step.title}
        </span>
      </div>
      {step.note ? (
        <p className="pl-4 text-[11px] text-muted-foreground leading-snug">
          {step.note}
        </p>
      ) : null}
    </li>
  );
}

export function ChatTimeline({
  agentLabel,
  chatsLoading,
  running,
  slug,
  thread,
}: {
  agentLabel: string;
  chatsLoading: boolean;
  running: boolean;
  slug: string;
  thread: AgentThread | undefined;
}) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [actions, setActions] = useState<ActionLogEntry[]>([]);
  const [anyRunning, setAnyRunning] = useState(false);
  const runningRef = useRef(false);

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(slug)}/tasks`
      );
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as unknown;
      const parsed = parseTasks(data);
      setTasks(parsed);
      const nowRunning = parsed.some((task) => task.status === "running");
      runningRef.current = nowRunning;
      setAnyRunning(nowRunning);
    } catch {
      // Best-effort: keep last list.
    }
  }, [slug]);

  const cancelTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(slug)}/tasks`,
          {
            body: JSON.stringify({ action: "cancel", taskId }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
        if (!res.ok) {
          return;
        }
        await refreshTasks();
      } catch {
        // Ignore cancel failures; user can retry.
      }
    },
    [refreshTasks, slug]
  );

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(slug)}/history`
      );
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as unknown;
      const entries = parseHistoryEntries(
        (data as { entries?: unknown }).entries ?? []
      );
      setActions(entries);
    } catch {
      // Best-effort: keep last list.
    }
  }, [slug]);

  useEffect(() => {
    void refreshTasks();
    void refreshHistory();
  }, [refreshTasks]);

  useEffect(() => {
    if (!(running || anyRunning)) {
      return;
    }
    void refreshTasks();
    void refreshHistory();
    const id = window.setInterval(() => {
      void refreshTasks();
      void refreshHistory();
    }, 2000);
    return () => {
      window.clearInterval(id);
    };
  }, [anyRunning, refreshHistory, refreshTasks, running]);

  const events = useMemo(
    () => buildThreadTimeline({ thread, tasks, actions }),
    [actions, thread, tasks]
  );

  if (chatsLoading) {
    return (
      <MessageScrollerItem className="flex flex-1 items-center justify-center py-8">
        <HelloLoading context="chats" size="compact" />
      </MessageScrollerItem>
    );
  }

  if (!thread) {
    return (
      <MessageScrollerItem className="px-1 py-1">
        <p className="text-[11px] text-muted-foreground/70 leading-snug">
          Start a chat. Type / for edit skills, or ask about cuts, filler, and
          overlays.
        </p>
      </MessageScrollerItem>
    );
  }

  if (events.length === 0) {
    return (
      <MessageScrollerItem className="px-1 py-1">
        <p className="text-[11px] text-muted-foreground/70 leading-snug">
          Start a chat. Type / for edit skills, or ask about cuts, filler, and
          overlays.
        </p>
      </MessageScrollerItem>
    );
  }

  return (
    <>
      {events.map((event) => {
        if (event.kind === "message") {
          const m = event.message;
          const isUser = m.role === "user";
          return (
            <MessageScrollerItem
              key={event.id}
              messageId={m.id}
              scrollAnchor={isUser}
            >
              <Message align={isUser ? "end" : "start"}>
                <MessageAvatar>
                  <span
                    className="text-[10px] text-muted-foreground"
                    title={isUser ? "You" : agentLabel}
                  >
                    {isUser ? "Y" : "A"}
                  </span>
                </MessageAvatar>
                <MessageContent>
                  <Bubble
                    align={isUser ? "end" : "start"}
                    variant={isUser ? "muted" : "outline"}
                  >
                    <BubbleContent
                      className={
                        isUser
                          ? "whitespace-pre-wrap text-[11px] leading-snug"
                          : "text-[11px] leading-snug"
                      }
                    >
                      {isUser ? (
                        m.content
                      ) : (
                        <ChatMarkdown>{m.content}</ChatMarkdown>
                      )}
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            </MessageScrollerItem>
          );
        }

        const task = event.task;
        const toolCalls = task.toolCalls ?? [];
        const hasDetails =
          task.steps.length > 0 ||
          Boolean(task.blockedQuestion) ||
          Boolean(task.summary) ||
          Boolean(task.remaining?.length) ||
          event.actions.length > 0 ||
          toolCalls.length > 0;

        return (
          <MessageScrollerItem
            className="px-1"
            key={event.id}
            messageId={`task:${task.id}`}
          >
            <Collapsible defaultOpen={false} render={<div />}>
              <div
                className="rounded-lg border border-sidebar-border/60 bg-sidebar/20 px-2 py-2"
                data-task-row={task.id}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[11px] text-foreground/90 leading-snug">
                      {task.request}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={taskStatusBadgeClass(task.status)}>
                        {taskStatusLabel(task.status)}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatTaskRelativeTime(task)}
                      </span>
                    </div>
                  </div>
                  {task.status === "running" ? (
                    <Button
                      className="h-6 px-2 text-[10px]"
                      data-task-cancel={task.id}
                      onClick={() => void cancelTask(task.id)}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  ) : null}
                  {hasDetails ? (
                    <CollapsibleTrigger
                      className="shrink-0 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
                      type="button"
                    >
                      Details
                    </CollapsibleTrigger>
                  ) : null}
                </div>

                {hasDetails ? (
                  <CollapsibleContent className="mt-2">
                    {task.steps.length > 0 ? (
                      <ul className="flex list-none flex-col gap-1.5 p-0">
                        {task.steps.map((step) => (
                          <TaskStepRow key={step.id} step={step} />
                        ))}
                      </ul>
                    ) : null}

                    {event.actions.length > 0 ? (
                      <div className="mt-2">
                        <Collapsible defaultOpen={false} render={<div />}>
                          <CollapsibleTrigger
                            className="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
                            type="button"
                          >
                            Actions ({event.actions.length})
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1">
                            <ul className="flex list-none flex-col gap-1 p-0">
                              {event.actions.map((entry) => (
                                <li
                                  className="flex flex-col gap-0.5 rounded-md border border-sidebar-border/60 bg-background/60 px-2 py-1"
                                  key={`${task.id}:${entry.at}:${entry.action}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-foreground/90 leading-snug">
                                      {entry.action}
                                    </span>
                                    <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground leading-none">
                                      {entry.actor}
                                    </span>
                                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                                      {relativeTimeAgo(entry.at)}
                                    </span>
                                  </div>
                                  {entry.input ? (
                                    <pre className="whitespace-pre-wrap break-words text-[10px] text-muted-foreground leading-snug">
                                      {entry.input}
                                    </pre>
                                  ) : null}
                                  {entry.result ? (
                                    <pre className="whitespace-pre-wrap break-words text-[10px] text-muted-foreground leading-snug">
                                      {entry.result}
                                    </pre>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    ) : null}

                    {toolCalls.length > 0 ? (
                      <div className="mt-2">
                        <Collapsible defaultOpen={false} render={<div />}>
                          <CollapsibleTrigger
                            className="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
                            type="button"
                          >
                            Tools ({toolCalls.length})
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1">
                            <ul className="flex list-none flex-col gap-1 p-0">
                              {toolCalls.map((call) => (
                                <li
                                  className="flex flex-col gap-0.5 rounded-md border border-sidebar-border/60 bg-background/60 px-2 py-1"
                                  key={call.id}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-foreground/90 leading-snug">
                                      {call.toolName}
                                    </span>
                                    <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground leading-none">
                                      {call.ok ? "ok" : "error"}
                                    </span>
                                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                                      {relativeTimeAgo(call.at)}
                                    </span>
                                  </div>
                                  {call.input ? (
                                    <pre className="whitespace-pre-wrap break-words text-[10px] text-muted-foreground leading-snug">
                                      {call.input}
                                    </pre>
                                  ) : null}
                                  {call.output ? (
                                    <pre className="whitespace-pre-wrap break-words text-[10px] text-muted-foreground leading-snug">
                                      {call.output}
                                    </pre>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    ) : null}

                    {task.blockedQuestion ? (
                      <p className="mt-2 text-[11px] text-foreground leading-snug">
                        {task.blockedQuestion}
                      </p>
                    ) : null}
                    {task.summary ? (
                      <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
                        {task.summary}
                      </p>
                    ) : null}
                    {task.remaining && task.remaining.length > 0 ? (
                      <ul className="mt-2 list-disc pl-4 text-[11px] text-muted-foreground leading-snug">
                        {task.remaining.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </CollapsibleContent>
                ) : null}
              </div>
            </Collapsible>
          </MessageScrollerItem>
        );
      })}
    </>
  );
}
