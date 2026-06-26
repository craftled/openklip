import { routeIntent } from "./skill-router.ts";

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

// Monotonic id generator: Date.now() alone collides when two messages are
// appended in the same millisecond (e.g. the user + assistant pair in one
// action), producing duplicate React keys. The counter guarantees uniqueness.
let idSeq = 0;
export function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

export function createThread(slug: string, title?: string): AgentThread {
  const thread: AgentThread = {
    id: nextId("th"),
    slug,
    title: title ?? "New chat",
    messages: [],
    updatedAt: Date.now(),
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
    id: nextId("m"),
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
  const match = routeIntent(userText, slug);
  return `**${match.title}** — run this loop on the same project.json:\n\n${match.steps
    .map((s) => `  ${s}`)
    .join("\n")}`;
}
