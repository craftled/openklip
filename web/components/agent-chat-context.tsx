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
import { resolveThreadAfterRemove } from "@/lib/chat-list";
import {
  type AgentStatus,
  getAgentStatuses,
  suggestFillerCuts,
} from "../../app/agent-actions.ts";

interface AgentChatContextValue {
  activeSlug: string;
  activeStatus: AgentStatus | undefined;
  activeThread: AgentThread | undefined;
  activeThreadId: string | null;
  agent: AgentModelId;
  agentUsable: boolean;
  archivedThreads: AgentThread[];
  chatsLoading: boolean;
  defaultAgent: AgentModelId;
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
}: {
  activeSlug: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<AgentThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [defaultAgent, setDefaultAgent] =
    useState<AgentModelId>(DEFAULT_AGENT_MODEL);
  const [runningThreadId, setRunningThreadId] = useState<string | null>(null);
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
        await appendMessageApi(
          activeSlug,
          threadId,
          "assistant",
          assistantHint(activeSlug, trimmed)
        );
        await refreshThreads();
      } finally {
        setRunningThreadId(null);
      }
    },
    [activeSlug, activeThreadId, refreshThreads]
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
      } catch {
        return;
      }
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

  const value = useMemo(
    () => ({
      activeSlug,
      activeThread,
      activeThreadId,
      activeStatus,
      agent,
      agentUsable,
      archivedThreads,
      chatsLoading,
      defaultAgent,
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
      archivedThreads,
      chatsLoading,
      defaultAgent,
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
