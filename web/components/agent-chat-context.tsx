"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { agentProviderId } from "@/lib/agent-icons";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getDefaultAgentModel,
  setDefaultAgentModel,
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
  toastChatArchiveFailed,
  toastChatDeleteFailed,
  toastChatEnsureFailed,
  toastChatRenameFailed,
  toastChatSendFailed,
  toastChatUnarchiveFailed,
  toastPromise,
} from "@/lib/app-toast";
import { resolveThreadAfterRemove } from "@/lib/chat-list";
import {
  analyzeAssetsPromiseMessages,
  findFillerPromiseMessages,
} from "@/lib/toast-notifications";
import {
  type AgentStatus,
  analyzeProjectAssets,
  chatWithAgent,
  getAgentStatuses,
  suggestFillerCuts,
} from "../../app/agent-actions.ts";
import type { EditorChatsSnapshot } from "../../app/lib/editor-chats.ts";

interface AgentChatContextValue {
  activeSlug: string;
  activeStatus: AgentStatus | undefined;
  activeThread: AgentThread | undefined;
  activeThreadId: string | null;
  agent: AgentModelId;
  agentUsable: boolean;
  analyzingAssets: boolean;
  archivedThreads: AgentThread[];
  chatsLoading: boolean;
  defaultAgent: AgentModelId;
  onAnalyzeAssets: () => Promise<void>;
  onArchiveThread: (threadId: string) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
  onFindFiller: () => Promise<void>;
  onNewChat: () => void;
  onRenameThread: (threadId: string, title: string) => Promise<void>;
  onUnarchiveThread: (threadId: string) => Promise<void>;
  providerLabel: string;
  refreshThreads: () => Promise<void>;
  runningThreadId: string | null;
  selectThread: (threadId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  setAgent: (agent: AgentModelId) => void;
  threads: AgentThread[];
}

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

export function AgentChatProvider({
  activeSlug,
  children,
  initialChats,
  projectTemplate,
}: {
  activeSlug: string;
  children: ReactNode;
  initialChats?: EditorChatsSnapshot;
  projectTemplate?: string;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<AgentThread[]>(
    () => initialChats?.threads ?? []
  );
  const [archivedThreads, setArchivedThreads] = useState<AgentThread[]>(
    () => initialChats?.archived ?? []
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    () => initialChats?.activeThreadId ?? null
  );
  const [chatsLoading, setChatsLoading] = useState(() => initialChats == null);
  const [defaultAgent, setDefaultAgent] =
    useState<AgentModelId>(DEFAULT_AGENT_MODEL);
  const [runningThreadId, setRunningThreadId] = useState<string | null>(null);
  const [analyzingAssets, setAnalyzingAssets] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});

  useEffect(() => {
    setDefaultAgent(getDefaultAgentModel());
    return subscribeDefaultAgent(setDefaultAgent);
  }, []);

  useEffect(() => {
    setDefaultAgent(getDefaultAgentModel());
  }, [activeSlug]);

  const setAgent = useCallback((model: AgentModelId) => {
    setDefaultAgentModel(model);
  }, []);

  const agent = defaultAgent;

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
      try {
        await renameThreadApi(activeSlug, threadId, title);
        await refreshThreads();
      } catch (e) {
        toastChatRenameFailed((e as Error).message);
      }
    },
    [activeSlug, refreshThreads]
  );

  const onArchiveThread = useCallback(
    async (threadId: string) => {
      try {
        await archiveThreadApi(activeSlug, threadId, true);
        await refreshThreads();
        await focusThreadAfterRemoval(threadId);
      } catch (e) {
        toastChatArchiveFailed((e as Error).message);
      }
    },
    [activeSlug, focusThreadAfterRemoval, refreshThreads]
  );

  const onUnarchiveThread = useCallback(
    async (threadId: string) => {
      try {
        await archiveThreadApi(activeSlug, threadId, false);
        await refreshThreads();
      } catch (e) {
        toastChatUnarchiveFailed((e as Error).message);
      }
    },
    [activeSlug, refreshThreads]
  );

  const onDeleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteThreadApi(activeSlug, threadId);
        await refreshThreads();
        await focusThreadAfterRemoval(threadId);
      } catch (e) {
        toastChatDeleteFailed((e as Error).message);
      }
    },
    [activeSlug, focusThreadAfterRemoval, refreshThreads]
  );

  useEffect(() => {
    let alive = true;
    const hydrated = initialChats != null;
    if (!hydrated) {
      setChatsLoading(true);
    }
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
  }, [activeSlug, initialChats]);

  const activeThread = useMemo(
    () =>
      threads.find((t) => t.id === activeThreadId) ??
      archivedThreads.find((t) => t.id === activeThreadId),
    [threads, archivedThreads, activeThreadId]
  );

  const onNewChat = useCallback(() => {
    setDefaultAgent(getDefaultAgentModel());
    void (async () => {
      const thread = await createThreadApi(activeSlug);
      await refreshThreads();
      await selectThread(thread.id);
    })();
  }, [activeSlug, refreshThreads, selectThread]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const threadId = activeThreadId;
      if (!(trimmed && threadId)) {
        return;
      }
      setRunningThreadId(threadId);
      try {
        await appendMessageApi(activeSlug, threadId, "user", trimmed);
        // Drive the selected agent when it's installed + connected; otherwise
        // fall back to the deterministic "run this CLI loop" hint.
        let reply: string;
        let edited = false;
        if (agentUsable) {
          const res = await chatWithAgent(activeSlug, agent, trimmed);
          if (res.ok) {
            reply = res.text;
            edited = res.edited;
          } else {
            reply = `${providerLabel} could not respond: ${res.error}\n\n${assistantHint(
              activeSlug,
              trimmed,
              projectTemplate
            )}`;
          }
        } else {
          reply = assistantHint(activeSlug, trimmed, projectTemplate);
        }
        await appendMessageApi(activeSlug, threadId, "assistant", reply);
        await refreshThreads();
        // The agent may have edited project.json; pull the new edit into the
        // player/timeline.
        if (edited) {
          router.refresh();
        }
      } catch (e) {
        toastChatSendFailed((e as Error).message);
      } finally {
        setRunningThreadId(null);
      }
    },
    [
      activeSlug,
      activeThreadId,
      agent,
      agentUsable,
      providerLabel,
      router,
      projectTemplate,
      refreshThreads,
    ]
  );

  const onFindFiller = useCallback(async () => {
    if (runningThreadId || !agentUsable || chatsLoading) {
      return;
    }
    let threadId = activeThreadId;
    if (!threadId) {
      try {
        const ensured = await ensureThreadApi(activeSlug);
        threadId = ensured.activeThreadId;
        if (!threadId) {
          return;
        }
        setThreads(ensured.threads);
        setActiveThreadId(threadId);
      } catch (e) {
        toastChatEnsureFailed((e as Error).message);
        return;
      }
    }
    setRunningThreadId(threadId);
    try {
      const run = (async () => {
        const result = await suggestFillerCuts(activeSlug, agent);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result;
      })();
      void toastPromise(run, findFillerPromiseMessages(providerLabel));
      const res = await run;
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
        `${providerLabel} cut ${res.cut} filler word(s)${
          res.words.length
            ? `: ${res.words.map((w) => `${w.id} "${w.text}"`).join(", ")}`
            : " : none found"
        }`
      );
      await refreshThreads();
      router.refresh();
    } finally {
      setRunningThreadId(null);
    }
  }, [
    activeSlug,
    activeThreadId,
    agent,
    agentUsable,
    chatsLoading,
    providerLabel,
    refreshThreads,
    router,
    runningThreadId,
  ]);

  const onAnalyzeAssets = useCallback(async () => {
    if (analyzingAssets || !agentUsable) {
      return;
    }
    setAnalyzingAssets(true);
    try {
      const run = (async () => {
        const result = await analyzeProjectAssets(activeSlug, agent);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result;
      })();
      void toastPromise(run, analyzeAssetsPromiseMessages(providerLabel));
      await run;
      // Cards now live on project.json; pull them into the editor so chat and
      // overlays can use the descriptions.
      router.refresh();
    } catch {
      // surfaced by the toast above
    } finally {
      setAnalyzingAssets(false);
    }
  }, [activeSlug, agent, agentUsable, analyzingAssets, providerLabel, router]);

  const value = useMemo(
    () => ({
      activeSlug,
      activeThread,
      activeThreadId,
      activeStatus,
      agent,
      agentUsable,
      analyzingAssets,
      archivedThreads,
      chatsLoading,
      defaultAgent,
      onAnalyzeAssets,
      onArchiveThread,
      onDeleteThread,
      onFindFiller,
      onNewChat,
      onRenameThread,
      onUnarchiveThread,
      providerLabel,
      refreshThreads,
      runningThreadId,
      selectThread,
      sendMessage,
      setAgent,
      threads,
    }),
    [
      activeSlug,
      activeThread,
      activeThreadId,
      activeStatus,
      agent,
      agentUsable,
      analyzingAssets,
      archivedThreads,
      chatsLoading,
      defaultAgent,
      onAnalyzeAssets,
      onArchiveThread,
      onDeleteThread,
      onFindFiller,
      onNewChat,
      onRenameThread,
      onUnarchiveThread,
      providerLabel,
      refreshThreads,
      runningThreadId,
      selectThread,
      sendMessage,
      setAgent,
      threads,
    ]
  );

  return (
    <AgentChatContext.Provider value={value}>
      {children}
    </AgentChatContext.Provider>
  );
}

export function useAgentChat(): AgentChatContextValue {
  const ctx = useContext(AgentChatContext);
  if (!ctx) {
    throw new Error("useAgentChat must be used within AgentChatProvider");
  }
  return ctx;
}
