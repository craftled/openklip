import {
  type AgentThread,
  createProjectThread,
  getActiveProjectThreadId,
  listArchivedProjectThreads,
  listProjectThreads,
  setActiveProjectThreadId,
} from "@engine/chats";

export interface EditorChatsSnapshot {
  activeThreadId: string | null;
  archived: AgentThread[];
  threads: AgentThread[];
}

/** Server-side mirror of ensureThreadApi + GET /api/projects/:slug/chats. */
export async function loadEditorChats(
  slug: string
): Promise<EditorChatsSnapshot> {
  let [threads, archived, activeThreadId] = await Promise.all([
    listProjectThreads(slug),
    listArchivedProjectThreads(slug),
    getActiveProjectThreadId(slug),
  ]);

  if (threads.length === 0) {
    const thread = await createProjectThread(slug);
    await setActiveProjectThreadId(slug, thread.id);
    threads = await listProjectThreads(slug);
    activeThreadId = thread.id;
    return { threads, archived, activeThreadId };
  }

  const validActive =
    activeThreadId !== null && threads.some((t) => t.id === activeThreadId);
  if (!validActive) {
    activeThreadId = threads[0]?.id ?? null;
    if (activeThreadId !== null) {
      await setActiveProjectThreadId(slug, activeThreadId);
    }
  }

  return { threads, archived, activeThreadId };
}
