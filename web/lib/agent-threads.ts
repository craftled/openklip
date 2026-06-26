export interface ThreadMessage {
  content: string;
  createdAt: number;
  id: string;
  role: "assistant" | "user";
}

export interface AgentThread {
  id: string;
  messages: ThreadMessage[];
  slug: string;
  title: string;
  updatedAt: number;
}

const STORAGE_KEY = "openklip-agent-threads";

function readAll(): AgentThread[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as AgentThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(threads: AgentThread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    // ignore quota / private mode
  }
}

export function listThreads(slug: string): AgentThread[] {
  return readAll()
    .filter((t) => t.slug === slug)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getThread(id: string): AgentThread | undefined {
  return readAll().find((t) => t.id === id);
}

export function createThread(slug: string, title?: string): AgentThread {
  const now = Date.now();
  const thread: AgentThread = {
    id: `th${now}`,
    slug,
    title: title ?? "New chat",
    messages: [],
    updatedAt: now,
  };
  writeAll([thread, ...readAll()]);
  return thread;
}

export function appendMessage(
  threadId: string,
  role: ThreadMessage["role"],
  content: string
): AgentThread | undefined {
  const threads = readAll();
  const idx = threads.findIndex((t) => t.id === threadId);
  if (idx === -1) {
    return;
  }
  const thread = threads[idx];
  const message: ThreadMessage = {
    id: `m${Date.now()}`,
    role,
    content,
    createdAt: Date.now(),
  };
  const next: AgentThread = {
    ...thread,
    messages: [...thread.messages, message],
    updatedAt: message.createdAt,
    title:
      thread.messages.length === 0 && role === "user"
        ? content.slice(0, 48) || "New chat"
        : thread.title,
  };
  threads[idx] = next;
  writeAll(threads);
  return next;
}

export function deleteThread(threadId: string): void {
  writeAll(readAll().filter((t) => t.id !== threadId));
}

export function assistantHint(slug: string, userText: string): string {
  const lower = userText.toLowerCase();
  if (lower.includes("transcript") || lower.includes("read")) {
    return `Read the edit with:\n\nopenklip transcript ${slug}`;
  }
  if (lower.includes("cut") || lower.includes("remove")) {
    return `Cut by phrase:\n\nopenklip cut ${slug} --text "phrase here"\n\nOr cut every match:\n\nopenklip cut ${slug} --text "um" --all`;
  }
  if (lower.includes("status") || lower.includes("summary")) {
    return `Review the edit:\n\nopenklip status ${slug}`;
  }
  if (lower.includes("export")) {
    return `Render the cut:\n\nopenklip export ${slug}`;
  }
  return `OpenKlip agents edit via CLI on the same project.json as this editor. Try:\n\nopenklip transcript ${slug}\nopenklip status ${slug}\nopenklip cut ${slug} --text "filler phrase"\nopenklip export ${slug}`;
}
