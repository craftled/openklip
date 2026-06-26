"use client";

import {
  Folder,
  MessageSquarePlus,
  PanelLeft,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { OpenklipMark } from "@/components/openklip-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon";
import { CursorLight } from "@/components/ui/svgs/cursorLight";
import { GrokLight } from "@/components/ui/svgs/grokLight";
import { Openai } from "@/components/ui/svgs/openai";
import {
  type AgentThread,
  appendMessage,
  assistantHint,
  createThread,
  listThreads,
} from "@/lib/agent-threads";
import { cn } from "@/lib/utils";
import {
  type AgentStatus,
  getAgentStatuses,
  suggestFillerCuts,
} from "../../app/agent-actions.ts";

// Map a selector value to its provider id (the key detectAgents() returns).
function agentId(value: string): "claude" | "codex" | "cursor" | "grok" {
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

// Availability state → dot color + short label. green = signed in, amber =
// installed but not signed in, gray = not installed / still checking.
function badgeState(status?: AgentStatus): {
  dot: string;
  text: string;
  label: string;
  title: string;
} {
  if (!status) {
    return {
      dot: "bg-muted-foreground/30",
      text: "text-muted-foreground",
      label: "Checking…",
      title: "Checking…",
    };
  }
  if (!status.installed) {
    return {
      dot: "bg-muted-foreground/40",
      text: "text-muted-foreground",
      label: "Not installed",
      title: `${status.cli} CLI not found on PATH`,
    };
  }
  if (status.connected) {
    return {
      dot: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-500",
      label: "Signed in",
      title: `${status.cli} signed in`,
    };
  }
  return {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-500",
    label: "Sign in",
    title: status.signInCmd
      ? `Not signed in — run: ${status.signInCmd}`
      : "Not signed in",
  };
}

// Dot only — for the compact trigger.
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
      title={s.title}
    />
  );
}

// Dot + short text label — for the dropdown group headers.
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
        "flex items-center gap-1 font-medium text-[9px] normal-case tracking-normal",
        className
      )}
      title={s.title}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", s.dot)} />
      <span className={s.text}>{s.label}</span>
    </span>
  );
}

export interface ProjectListing {
  mtimeMs: number;
  slug: string;
}

interface AgentSidebarProps {
  activeSlug: string;
  initialProjects: ProjectListing[];
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) {
    return "now";
  }
  if (min < 60) {
    return `${min}m`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `${hr}h`;
  }
  return `${Math.floor(hr / 24)}d`;
}

export function AgentSidebar({
  activeSlug,
  initialProjects,
}: AgentSidebarProps) {
  const router = useRouter();
  const [projects] = useState(initialProjects);
  const [threadsBySlug, setThreadsBySlug] = useState<
    Record<string, AgentThread[]>
  >({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(
    () => new Set([activeSlug])
  );
  // MOCKUP: static agent selector. OpenKlip ships no LLM — this picks which of
  // your existing subscription CLIs drives AI edits. Not wired to a backend yet.
  const [agent, setAgent] = useState("claude-opus-4-8");
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  useEffect(() => {
    let alive = true;
    getAgentStatuses()
      .then((list) => {
        if (alive) {
          setStatuses(Object.fromEntries(list.map((s) => [s.id, s])));
        }
      })
      .catch(() => {
        // detection is best-effort; selector still works without badges
      });
    return () => {
      alive = false;
    };
  }, []);
  const activeStatus = statuses[agentId(agent)];
  const agentUsable =
    !activeStatus || (activeStatus.installed && activeStatus.connected);
  const providerLabel = agent.startsWith("claude")
    ? "Claude"
    : agent.startsWith("gpt")
      ? "Codex"
      : agent.startsWith("composer")
        ? "Cursor"
        : "Grok";

  const refreshThreadsForSlug = useCallback((slug: string) => {
    setThreadsBySlug((prev) => ({ ...prev, [slug]: listThreads(slug) }));
  }, []);

  // Hydrate thread state from localStorage after mount — never during render (SSR-safe).
  useEffect(() => {
    const next: Record<string, AgentThread[]> = {};
    for (const p of projects) {
      next[p.slug] = listThreads(p.slug);
    }
    if (!next[activeSlug]?.length) {
      createThread(activeSlug);
      next[activeSlug] = listThreads(activeSlug);
    }
    setThreadsBySlug(next);
    setActiveThreadId(next[activeSlug]?.[0]?.id ?? null);
  }, [activeSlug, projects]);

  const activeThread = useMemo(() => {
    const list = threadsBySlug[activeSlug] ?? [];
    return list.find((t) => t.id === activeThreadId);
  }, [threadsBySlug, activeSlug, activeThreadId]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return projects;
    }
    return projects.filter((p) => p.slug.toLowerCase().includes(q));
  }, [projects, search]);

  const threadsForProject = useCallback(
    (slug: string) => {
      const q = search.trim().toLowerCase();
      const list = threadsBySlug[slug] ?? [];
      if (!q) {
        return list;
      }
      return list.filter((t) => t.title.toLowerCase().includes(q));
    },
    [search, threadsBySlug]
  );

  const openProject = (slug: string) => {
    setExpandedSlugs((prev) => new Set(prev).add(slug));
    router.push(`/?slug=${encodeURIComponent(slug)}`);
  };

  const onNewChat = () => {
    const thread = createThread(activeSlug);
    refreshThreadsForSlug(activeSlug);
    setActiveThreadId(thread.id);
  };

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!(text && activeThreadId)) {
      return;
    }
    appendMessage(activeThreadId, "user", text);
    appendMessage(activeThreadId, "assistant", assistantHint(activeSlug, text));
    setDraft("");
    refreshThreadsForSlug(activeSlug);
  };

  // Real wiring: drive the selected Claude model (via `claude -p`) to find and
  // cut filler words on the live project.json, then refresh the editor.
  const onFindFiller = async () => {
    if (running) {
      return;
    }
    setRunning(true);
    try {
      const res = await suggestFillerCuts(activeSlug, agent);
      if (activeThreadId) {
        appendMessage(activeThreadId, "user", "Find and cut filler words");
        appendMessage(
          activeThreadId,
          "assistant",
          res.ok
            ? `${providerLabel} cut ${res.cut} filler word(s)${
                res.words.length
                  ? `: ${res.words.map((w) => `${w.id} "${w.text}"`).join(", ")}`
                  : " — none found"
              }`
            : `Error: ${res.error}`
        );
        refreshThreadsForSlug(activeSlug);
      }
      router.refresh();
    } finally {
      setRunning(false);
    }
  };

  return (
    <Sidebar
      className="border-border bg-sidebar"
      collapsible="offcanvas"
      side="left"
    >
      <SidebarHeader className="gap-2 border-border border-b p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-10" size="lg" tooltip="OpenKlip">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-live/15 text-live">
                <OpenklipMark className="size-4" />
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-semibold text-[13px]">
                  OpenKlip
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  Agent editor
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex flex-col gap-1.5 px-1">
          <Button
            className="h-8 justify-start gap-2 px-2 font-normal text-[13px]"
            onClick={onNewChat}
            size="sm"
            variant="ghost"
          >
            <MessageSquarePlus className="size-4" />
            New chat
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 border-none bg-muted/60 pl-8 text-[13px] shadow-none"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects & chats"
              value={search}
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="py-2">
          <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-wide">
            Projects
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 px-1">
              {filteredProjects.length === 0 && (
                <p className="px-3 py-2 text-muted-foreground text-xs">
                  No projects yet. Run{" "}
                  <code className="text-[11px]">openklip ingest</code>
                </p>
              )}
              {filteredProjects.map((p) => {
                const open = expandedSlugs.has(p.slug);
                const slugThreads = threadsForProject(p.slug);
                const isActiveProject = p.slug === activeSlug;
                return (
                  <SidebarMenuItem key={p.slug}>
                    <SidebarMenuButton
                      className={cn(
                        "h-8 gap-2 text-[13px]",
                        isActiveProject && "bg-sidebar-accent"
                      )}
                      isActive={isActiveProject}
                      onClick={() => {
                        if (p.slug === activeSlug) {
                          setExpandedSlugs((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.slug)) {
                              next.delete(p.slug);
                            } else {
                              next.add(p.slug);
                            }
                            return next;
                          });
                        } else {
                          openProject(p.slug);
                        }
                      }}
                      tooltip={p.slug}
                    >
                      <Folder className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{p.slug}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {slugThreads.length}
                      </span>
                    </SidebarMenuButton>
                    {(open || isActiveProject) && slugThreads.length > 0 && (
                      <ul className="mt-0.5 mb-1 ml-6 flex flex-col gap-0.5 border-sidebar-border border-l pl-2">
                        {slugThreads.map((t) => (
                          <li key={t.id}>
                            <button
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-sidebar-accent",
                                t.id === activeThreadId &&
                                  isActiveProject &&
                                  "bg-sidebar-accent font-medium"
                              )}
                              onClick={() => {
                                if (p.slug !== activeSlug) {
                                  openProject(p.slug);
                                }
                                setActiveThreadId(t.id);
                              }}
                              type="button"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {t.title}
                              </span>
                              <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                                {relativeTime(t.updatedAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {activeThread && activeThread.messages.length > 0 && (
          <SidebarGroup className="min-h-0 flex-1 border-border border-t py-2">
            <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-wide">
              Thread
            </SidebarGroupLabel>
            <SidebarGroupContent className="min-h-0 flex-1 px-2">
              <ScrollArea className="h-[min(240px,28vh)]">
                <div className="flex flex-col gap-2 pr-2 pb-2">
                  {activeThread.messages.map((m, i) => (
                    <div
                      className={cn(
                        "rounded-lg px-2.5 py-2 text-[12px] leading-relaxed",
                        m.role === "user"
                          ? "bg-muted/80 text-foreground"
                          : "bg-transparent text-muted-foreground"
                      )}
                      // Composite key: index makes it unique even if old
                      // localStorage holds messages with colliding ids.
                      key={`${m.id}-${i}`}
                    >
                      <div className="mb-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                        {m.role === "user" ? "You" : "Agent"}
                      </div>
                      <pre className="whitespace-pre-wrap font-sans">
                        {m.content}
                      </pre>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-2 border-border border-t p-2">
        {/* MOCKUP — agent/model selector. Drives AI edits via your own subscription. */}
        <Select onValueChange={setAgent} value={agent}>
          <SelectTrigger className="h-8 w-full border-none bg-muted/60 text-[12px] shadow-none [&_svg.size-3\.5]:shrink-0">
            <SelectValue />
            <StatusDot className="ml-auto" status={activeStatus} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                <span>Claude · Max</span>
                <StatusBadge className="ml-auto" status={statuses.claude} />
              </SelectLabel>
              <SelectItem value="claude-opus-4-8">
                <span className="flex items-center gap-2">
                  <ClaudeAiIcon className="size-3.5" /> Opus 4.8
                </span>
              </SelectItem>
              <SelectItem value="claude-sonnet-4-6">
                <span className="flex items-center gap-2">
                  <ClaudeAiIcon className="size-3.5" /> Sonnet 4.6
                </span>
              </SelectItem>
              <SelectItem value="claude-haiku-4-5">
                <span className="flex items-center gap-2">
                  <ClaudeAiIcon className="size-3.5" /> Haiku 4.5
                </span>
              </SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                <span>Codex · ChatGPT</span>
                <StatusBadge className="ml-auto" status={statuses.codex} />
              </SelectLabel>
              <SelectItem value="gpt-5-5">
                <span className="flex items-center gap-2">
                  <Openai className="size-3.5" /> GPT-5.5
                </span>
              </SelectItem>
              <SelectItem value="gpt-5-4">
                <span className="flex items-center gap-2">
                  <Openai className="size-3.5" /> GPT-5.4
                </span>
              </SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                <span>Cursor</span>
                <StatusBadge className="ml-auto" status={statuses.cursor} />
              </SelectLabel>
              <SelectItem value="composer-2-5">
                <span className="flex items-center gap-2">
                  <CursorLight className="size-3.5" /> Composer 2.5
                </span>
              </SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                <span>xAI · SuperGrok</span>
                <StatusBadge className="ml-auto" status={statuses.grok} />
              </SelectLabel>
              <SelectItem value="grok-build">
                <span className="flex items-center gap-2">
                  <GrokLight className="size-3.5" /> Grok Build
                </span>
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          className="h-8 w-full justify-start gap-2 px-2 font-normal text-[12px]"
          disabled={running || !agentUsable}
          onClick={onFindFiller}
          size="sm"
          title={
            agentUsable
              ? undefined
              : activeStatus?.installed
                ? `Sign in first — run: ${activeStatus.signInCmd}`
                : `${providerLabel} CLI is not installed`
          }
          variant="ghost"
        >
          <Sparkles
            className={cn("size-3.5 text-live", running && "animate-pulse")}
          />
          {(() => {
            if (running) {
              return `${providerLabel} is reading…`;
            }
            if (!agentUsable) {
              return activeStatus?.installed
                ? `Run \`${activeStatus.signInCmd}\` to connect`
                : `${providerLabel} — not installed`;
            }
            return `Find filler with ${providerLabel}`;
          })()}
        </Button>
        <form className="flex gap-1.5" onSubmit={onSend}>
          <Input
            className="h-9 flex-1 text-[13px]"
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Ask about ${activeSlug}…`}
            value={draft}
          />
          <Button
            aria-label="Send message"
            disabled={!draft.trim()}
            size="icon-sm"
            type="submit"
            variant="secondary"
          >
            <Send className="size-4" />
          </Button>
        </form>
        <p className="px-1 text-[10px] text-muted-foreground leading-snug">
          Threads are local. Agents run CLI commands against the same{" "}
          <code className="text-[10px]">project.json</code>.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function AgentSidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      aria-label="Toggle agent sidebar"
      className={className}
      onClick={toggleSidebar}
      size="icon-sm"
      variant="ghost"
    >
      <PanelLeft className="size-4" />
    </Button>
  );
}
