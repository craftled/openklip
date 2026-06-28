import type { AgentThread } from "@engine/chats.ts";

export function filterThreadsByQuery(
  threads: AgentThread[],
  query: string
): AgentThread[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return threads;
  }
  return threads.filter((t) => t.title.toLowerCase().includes(q));
}

export function chatListEmptyLabel(input: {
  filteredActiveCount: number;
  filteredArchivedCount: number;
  loading: boolean;
  totalCount: number;
}): string | null {
  if (input.loading) {
    return "Loading chats…";
  }
  if (input.filteredActiveCount > 0 || input.filteredArchivedCount > 0) {
    return null;
  }
  if (input.totalCount === 0) {
    return "No chats yet. Start one with New chat.";
  }
  return "No chats match your search.";
}

export function resolveThreadAfterRemove(
  threads: AgentThread[],
  removedId: string,
  activeId: string | null
): string | null {
  if (activeId !== removedId) {
    return activeId;
  }
  const remaining = threads.filter(
    (t) => t.id !== removedId && t.archived !== true
  );
  return remaining[0]?.id ?? null;
}
