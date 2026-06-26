"use client";

import {
  Folder,
  MessageSquarePlus,
  PanelLeft,
  Scissors,
  Search,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  type AgentThread,
  appendMessage,
  assistantHint,
  createThread,
  listThreads,
} from "@/lib/agent-threads";
import { cn } from "@/lib/utils";

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
                <Scissors className="size-4" />
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
                  {activeThread.messages.map((m) => (
                    <div
                      className={cn(
                        "rounded-lg px-2.5 py-2 text-[12px] leading-relaxed",
                        m.role === "user"
                          ? "bg-muted/80 text-foreground"
                          : "bg-transparent text-muted-foreground"
                      )}
                      key={m.id}
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
