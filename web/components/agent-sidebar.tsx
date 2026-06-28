"use client";

import {
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
import { AgentModelSelect } from "@/components/agent-model-select";
import { AssetBin, type AssetBinUpdate, type BinAsset } from "@/components/asset-bin";
import { ChatListItem } from "@/components/chat-list-item";
import { KeyboardHint } from "@/components/keyboard-hint";
import { ProjectInlineFolderAction } from "@/components/project-folder-action";
import { ProjectSwitcher } from "@/components/project-switcher";
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useModShortcut } from "@/hooks/use-mod-shortcut";
import { agentProviderId } from "@/lib/agent-icons";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getDefaultAgentModel,
  subscribeDefaultAgent,
} from "@/lib/agent-preferences";
import { type AgentThread, assistantHint } from "@/lib/agent-threads";
import {
  appendMessageApi,
  archiveThreadApi,
  createThreadApi,
  deleteThreadApi,
  ensureThreadApi,
  fetchProjectChats,
  renameThreadApi,
  setActiveThreadApi,
} from "@/lib/agent-threads-client";
import {
  chatListEmptyLabel,
  filterThreadsByQuery,
  resolveThreadAfterRemove,
} from "@/lib/chat-list";
import type { ProjectHoverContext } from "@/lib/project-context";
import type { ProjectListing } from "@/lib/project-list";
import { deleteProjectApi } from "@/lib/projects-client";
import { cn } from "@/lib/utils";
import {
  type AgentStatus,
  getAgentStatuses,
  suggestFillerCuts,
} from "../../app/agent-actions.ts";

interface AgentSidebarProps {
  activeSlug: string;
  assets: BinAsset[];
  mediaVersion?: number;
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  projectHover: ProjectHoverContext;
  projects: ProjectListing[];
  sampleRate: number;
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
  assets,
  mediaVersion,
  onAssetsUpdated,
  projectHover,
  projects,
  sampleRate,
}: AgentSidebarProps) {
  const router = useRouter();
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<AgentThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [agent, setAgent] = useState<AgentModelId>(DEFAULT_AGENT_MODEL);
  const [defaultAgent, setDefaultAgent] =
    useState<AgentModelId>(DEFAULT_AGENT_MODEL);
  const [runningThreadId, setRunningThreadId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  useEffect(() => {
    const initial = getDefaultAgentModel();
    setAgent(initial);
    setDefaultAgent(initial);
    return subscribeDefaultAgent((model) => {
      setDefaultAgent(model);
      setAgent(model);
    });
  }, []);
  useEffect(() => {
    setAgent(getDefaultAgentModel());
  }, [activeSlug]);
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
  const activeStatus = statuses[agentProviderId(agent)];
  const agentUsable =
    !activeStatus || (activeStatus.installed && activeStatus.connected);
  const providerLabel = agent.startsWith("claude")
    ? "Claude"
    : agent.startsWith("gpt")
      ? "Codex"
      : agent.startsWith("composer")
        ? "Cursor"
        : "Grok";

  const refreshThreads = useCallback(async () => {
    const data = await fetchProjectChats(activeSlug);
    setThreads(data.threads);
    setArchivedThreads(data.archived);
    setActiveThreadId(data.activeThreadId);
  }, [activeSlug]);

  const selectThread = useCallback(
    async (threadId: string) => {
      setActiveThreadId(threadId);
      await setActiveThreadApi(activeSlug, threadId);
    },
    [activeSlug]
  );

  const focusThreadAfterRemoval = useCallback(
    async (removedId: string) => {
      const data = await fetchProjectChats(activeSlug);
      const nextId = resolveThreadAfterRemove(
        data.threads,
        removedId,
        activeThreadId
      );
      if (nextId) {
        await selectThread(nextId);
        await refreshThreads();
        return;
      }
      if (data.threads.length === 0) {
        const created = await createThreadApi(activeSlug);
        await selectThread(created.id);
        await refreshThreads();
        return;
      }
      const fallbackId = data.threads[0]?.id;
      if (fallbackId) {
        await selectThread(fallbackId);
        await refreshThreads();
      }
    },
    [activeSlug, activeThreadId, refreshThreads, selectThread]
  );

  const onRenameThread = useCallback(
    async (threadId: string, title: string) => {
      await renameThreadApi(activeSlug, threadId, title);
      await refreshThreads();
    },
    [activeSlug, refreshThreads]
  );

  const onArchiveThread = useCallback(
    async (threadId: string) => {
      await archiveThreadApi(activeSlug, threadId, true);
      await refreshThreads();
      await focusThreadAfterRemoval(threadId);
    },
    [activeSlug, focusThreadAfterRemoval, refreshThreads]
  );

  const onUnarchiveThread = useCallback(
    async (threadId: string) => {
      await archiveThreadApi(activeSlug, threadId, false);
      await refreshThreads();
    },
    [activeSlug, refreshThreads]
  );

  const onDeleteThread = useCallback(
    async (threadId: string) => {
      await deleteThreadApi(activeSlug, threadId);
      await refreshThreads();
      await focusThreadAfterRemoval(threadId);
    },
    [activeSlug, focusThreadAfterRemoval, refreshThreads]
  );

  const openProject = useCallback(
    (slug: string) => {
      if (slug !== activeSlug) {
        router.push(`/?slug=${encodeURIComponent(slug)}`);
      }
    },
    [activeSlug, router]
  );

  const onCreateProject = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/projects", { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string; slug?: string };
      if (!(res.ok && data.slug)) {
        throw new Error(data.error ?? `Create project failed (${res.status})`);
      }
      router.push(`/?slug=${encodeURIComponent(data.slug)}`);
      router.refresh();
    },
    [router]
  );

  const onDeleteProject = useCallback(
    async (slug: string) => {
      const { projects: remaining } = await deleteProjectApi(slug);
      if (slug === activeSlug) {
        const next = remaining[0]?.slug;
        router.push(next ? `/?slug=${encodeURIComponent(next)}` : "/");
      }
      router.refresh();
    },
    [activeSlug, router]
  );

  // Hydrate chats from working/chats.json via API after mount.
  useEffect(() => {
    let alive = true;
    setChatsLoading(true);
    void (async () => {
      try {
        await ensureThreadApi(activeSlug);
        const data = await fetchProjectChats(activeSlug);
        if (!alive) {
          return;
        }
        setThreads(data.threads);
        setArchivedThreads(data.archived);
        setActiveThreadId(data.activeThreadId);
      } finally {
        if (alive) {
          setChatsLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeSlug]);

  const activeThread = useMemo(
    () =>
      threads.find((t) => t.id === activeThreadId) ??
      archivedThreads.find((t) => t.id === activeThreadId),
    [threads, archivedThreads, activeThreadId]
  );

  const filteredChats = useMemo(
    () => filterThreadsByQuery(threads, search),
    [threads, search]
  );

  const filteredArchivedChats = useMemo(
    () => filterThreadsByQuery(archivedThreads, search),
    [archivedThreads, search]
  );

  const chatEmptyLabel = useMemo(
    () =>
      chatListEmptyLabel({
        loading: chatsLoading,
        totalCount: threads.length + archivedThreads.length,
        filteredActiveCount: filteredChats.length,
        filteredArchivedCount: filteredArchivedChats.length,
      }),
    [
      archivedThreads.length,
      chatsLoading,
      filteredArchivedChats.length,
      filteredChats.length,
      threads.length,
    ]
  );

  const onNewChat = () => {
    setAgent(getDefaultAgentModel());
    void (async () => {
      const thread = await createThreadApi(activeSlug);
      await refreshThreads();
      await selectThread(thread.id);
    })();
  };

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    const threadId = activeThreadId;
    if (!(text && threadId)) {
      return;
    }
    void (async () => {
      setRunningThreadId(threadId);
      try {
        await appendMessageApi(activeSlug, threadId, "user", text);
        await appendMessageApi(
          activeSlug,
          threadId,
          "assistant",
          assistantHint(activeSlug, text)
        );
        setDraft("");
        await refreshThreads();
      } finally {
        setRunningThreadId(null);
      }
    })();
  };

  // Real wiring: drive the selected Claude model (via `claude -p`) to find and
  // cut filler words on the live project.json, then refresh the editor.
  const onFindFiller = async () => {
    const threadId = activeThreadId;
    if (runningThreadId || !threadId) {
      return;
    }
    setRunningThreadId(threadId);
    try {
      const res = await suggestFillerCuts(activeSlug, agent);
      await appendMessageApi(
        activeSlug,
        threadId,
        "user",
        "Find and cut filler words"
      );
      await appendMessageApi(
        activeSlug,
        threadId,
        "assistant",
        res.ok
          ? `${providerLabel} cut ${res.cut} filler word(s)${
              res.words.length
                ? `: ${res.words.map((w) => `${w.id} "${w.text}"`).join(", ")}`
                : " : none found"
            }`
          : `Error: ${res.error}`
      );
      await refreshThreads();
      router.refresh();
    } finally {
      setRunningThreadId(null);
    }
  };

  return (
    <Sidebar className="bg-background" collapsible="offcanvas" side="left">
      <SidebarHeader className="gap-2 border-border border-b px-2 pt-2 pb-1.5">
        <ProjectSwitcher
          activeSlug={activeSlug}
          onCreateProject={onCreateProject}
          onDeleteProject={onDeleteProject}
          onSelectProject={openProject}
          projects={projects}
        />
        <div className="flex flex-col gap-1.5 px-1">
          <Button
            className="h-8 justify-start gap-2 px-2 text-ui"
            onClick={onNewChat}
            size="sm"
            variant="ghost"
          >
            <MessageSquarePlus className="size-4" />
            New chat
          </Button>
          <div className="relative rounded-lg border border-border bg-muted/50 has-[:focus-visible]:bg-background">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 border-0 bg-transparent pl-8 text-sm shadow-none focus-visible:ring-0"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats"
              value={search}
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="py-2">
          <SidebarGroupLabel className="px-3 text-section-label">
            Chats
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 px-1">
              {chatEmptyLabel && (
                <p className="px-3 py-2 text-muted-foreground text-xs">
                  {chatEmptyLabel}
                </p>
              )}
              {filteredChats.map((t) => (
                <ChatListItem
                  inProgress={runningThreadId === t.id}
                  isActive={t.id === activeThreadId}
                  key={t.id}
                  onArchive={() => onArchiveThread(t.id)}
                  onDelete={() => onDeleteThread(t.id)}
                  onRename={(title) => onRenameThread(t.id, title)}
                  onSelect={() => selectThread(t.id)}
                  project={projectHover}
                  thread={t}
                  timeLabel={relativeTime(t.updatedAt)}
                />
              ))}
            </SidebarMenu>
            {filteredArchivedChats.length > 0 && (
              <>
                <SidebarGroupLabel className="mt-2 px-3 text-section-label">
                  Archived
                </SidebarGroupLabel>
                <SidebarMenu className="gap-0.5 px-1">
                  {filteredArchivedChats.map((t) => (
                    <ChatListItem
                      archived
                      isActive={t.id === activeThreadId}
                      key={t.id}
                      onArchive={() => onArchiveThread(t.id)}
                      onDelete={() => onDeleteThread(t.id)}
                      onRename={(title) => onRenameThread(t.id, title)}
                      onSelect={() => selectThread(t.id)}
                      onUnarchive={() => onUnarchiveThread(t.id)}
                      project={projectHover}
                      thread={t}
                      timeLabel={relativeTime(t.updatedAt)}
                    />
                  ))}
                </SidebarMenu>
              </>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group/assets border-foreground/10 border-t py-2">
          <SidebarGroupLabel className="flex w-full items-center justify-between px-3 text-section-label">
            <span>Assets</span>
            <ProjectInlineFolderAction
              revealGroup="assets"
              slug={activeSlug}
              target="assets"
            />
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <AssetBin
              assets={assets}
              mediaVersion={mediaVersion}
              onAssetsUpdated={onAssetsUpdated}
              sampleRate={sampleRate}
              slug={activeSlug}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        {activeThread && activeThread.messages.length > 0 && (
          <SidebarGroup className="min-h-0 flex-1 border-foreground/10 border-t py-2">
            <SidebarGroupLabel className="px-3 text-section-label">
              Thread
            </SidebarGroupLabel>
            <SidebarGroupContent className="min-h-0 flex-1 px-2">
              <ScrollArea className="h-[min(240px,28vh)]">
                <div className="flex flex-col gap-2 pr-2 pb-2">
                  {activeThread.messages.map((m) => (
                    <div
                      className={cn(
                        "rounded-lg px-2.5 py-2 text-sm leading-relaxed",
                        m.role === "user"
                          ? "bg-user-message-bubble text-foreground"
                          : "bg-transparent text-muted-foreground"
                      )}
                      key={m.id}
                    >
                      <div className="mb-0.5 text-muted-foreground text-section-label">
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

      <SidebarFooter className="gap-2 border-border/50 border-t p-2">
        <AgentModelSelect
          defaultAgent={defaultAgent}
          onValueChange={setAgent}
          value={agent}
        />
        <Button
          className="h-8 w-full justify-start gap-2 px-2 text-sm"
          disabled={runningThreadId !== null || !agentUsable}
          onClick={onFindFiller}
          size="sm"
          title={
            agentUsable
              ? undefined
              : activeStatus?.installed
                ? `Sign in first : run: ${activeStatus.signInCmd}`
                : `${providerLabel} CLI is not installed`
          }
          variant="ghost"
        >
          <Sparkles
            className={cn(
              "size-3.5 text-accent",
              runningThreadId !== null && "animate-pulse"
            )}
          />
          {(() => {
            if (runningThreadId !== null) {
              return `${providerLabel} is reading…`;
            }
            if (!agentUsable) {
              return activeStatus?.installed
                ? `Run \`${activeStatus.signInCmd}\` to connect`
                : `${providerLabel} : not installed`;
            }
            return `Find filler with ${providerLabel}`;
          })()}
        </Button>
        <form className="flex gap-1.5" onSubmit={onSend}>
          <Input
            className="h-9 flex-1 text-sm"
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Ask about ${activeSlug}…`}
            value={draft}
          />
          <Button
            aria-label="Send message"
            disabled={!draft.trim() || runningThreadId !== null}
            size="icon-sm"
            type="submit"
            variant="secondary"
          >
            <Send className="size-4" />
          </Button>
        </form>
        <p className="px-1 text-caption text-muted-foreground leading-snug">
          Chats live in working/chats.json. Agents run CLI commands against the
          same <code className="text-caption">project.json</code>.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function AgentSidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();
  const shortcut = useModShortcut("b");
  const label = `Toggle agent sidebar (${shortcut})`;

  return (
    <Button
      aria-label={label}
      className={cn("h-8 shrink-0 gap-1 px-2", className)}
      onClick={toggleSidebar}
      title={label}
      variant="ghost"
    >
      <PanelLeft className="size-4" />
      <KeyboardHint shortcutKey="b" />
    </Button>
  );
}
