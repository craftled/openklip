import type { AgentThread, ThreadMessage } from "./agent-threads.ts";

interface ChatsPayload {
  activeThreadId: string | null;
  archived: AgentThread[];
  threads: AgentThread[];
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok
        ? "Invalid response from chats API"
        : `Chats API failed (${res.status})`
    );
  }
}

function chatsUrl(slug: string): string {
  return `/api/projects/${encodeURIComponent(slug)}/chats`;
}

export async function fetchProjectChats(slug: string): Promise<ChatsPayload> {
  const res = await fetch(chatsUrl(slug));
  const data = await readJson<ChatsPayload & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error ?? `Chats fetch failed (${res.status})`);
  }
  return data;
}

export async function createThreadApi(
  slug: string,
  title?: string
): Promise<AgentThread> {
  const res = await fetch(chatsUrl(slug), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create", title }),
  });
  const data = await readJson<{ thread?: AgentThread; error?: string }>(res);
  if (!(res.ok && data.thread)) {
    throw new Error(data.error ?? `Create chat failed (${res.status})`);
  }
  return data.thread;
}

export async function appendMessageApi(
  slug: string,
  threadId: string,
  role: ThreadMessage["role"],
  content: string
): Promise<AgentThread | undefined> {
  const res = await fetch(chatsUrl(slug), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "append", threadId, role, content }),
  });
  const data = await readJson<{ thread?: AgentThread; error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error ?? `Append message failed (${res.status})`);
  }
  return data.thread;
}

export async function renameThreadApi(
  slug: string,
  threadId: string,
  title: string
): Promise<void> {
  const res = await fetch(chatsUrl(slug), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "rename", threadId, title }),
  });
  if (!res.ok) {
    const data = await readJson<{ error?: string }>(res);
    throw new Error(data.error ?? `Rename failed (${res.status})`);
  }
}

export async function archiveThreadApi(
  slug: string,
  threadId: string,
  archived: boolean
): Promise<void> {
  const res = await fetch(chatsUrl(slug), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "archive", threadId, archived }),
  });
  if (!res.ok) {
    const data = await readJson<{ error?: string }>(res);
    throw new Error(data.error ?? `Archive failed (${res.status})`);
  }
}

export async function deleteThreadApi(
  slug: string,
  threadId: string
): Promise<void> {
  const res = await fetch(chatsUrl(slug), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "delete", threadId }),
  });
  if (!res.ok) {
    const data = await readJson<{ error?: string }>(res);
    throw new Error(data.error ?? `Delete failed (${res.status})`);
  }
}

export async function setActiveThreadApi(
  slug: string,
  threadId: string | null
): Promise<void> {
  const res = await fetch(chatsUrl(slug), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "setActive", threadId }),
  });
  if (!res.ok) {
    const data = await readJson<{ error?: string }>(res);
    throw new Error(data.error ?? `Set active failed (${res.status})`);
  }
}

export async function ensureThreadApi(
  slug: string
): Promise<{ activeThreadId: string | null; threads: AgentThread[] }> {
  let payload = await fetchProjectChats(slug);
  if (payload.threads.length === 0) {
    const thread = await createThreadApi(slug);
    await setActiveThreadApi(slug, thread.id);
    payload = await fetchProjectChats(slug);
  }
  const activeThreadId =
    payload.activeThreadId &&
    payload.threads.some((t) => t.id === payload.activeThreadId)
      ? payload.activeThreadId
      : (payload.threads[0]?.id ?? null);
  if (activeThreadId !== payload.activeThreadId) {
    await setActiveThreadApi(slug, activeThreadId);
  }
  return { threads: payload.threads, activeThreadId };
}
