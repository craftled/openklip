import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { projectPaths } from "./paths.ts";

export interface ThreadMessage {
  content: string;
  createdAt: number;
  id: string;
  role: "assistant" | "user";
}

export interface AgentThread {
  archived?: boolean;
  id: string;
  messages: ThreadMessage[];
  slug: string;
  title: string;
  updatedAt: number;
}

export interface ProjectChatsFile {
  activeThreadId: string | null;
  threads: AgentThread[];
}

const EMPTY: ProjectChatsFile = { activeThreadId: null, threads: [] };

let idSeq = 0;

export function nextChatId(prefix: string): string {
  idSeq += 1;
  return `${prefix}${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

export function resetChatIdSequenceForTests(): void {
  idSeq = 0;
}

export async function loadProjectChats(
  slug: string
): Promise<ProjectChatsFile> {
  const fp = projectPaths(slug).chats;
  if (!existsSync(fp)) {
    return { ...EMPTY };
  }
  let raw: string;
  try {
    raw = await readFile(fp, "utf8");
  } catch {
    return { ...EMPTY };
  }
  let parsed: ProjectChatsFile;
  try {
    parsed = JSON.parse(raw) as ProjectChatsFile;
  } catch (e) {
    // A corrupt chats.json must NOT be silently treated as empty: the next
    // mutation would persist {} and destroy every thread. Move the bad file
    // aside (recoverable) and surface a real error so the caller stops.
    await backupCorruptChats(fp);
    throw new Error(
      `chats.json is corrupt and was backed up: ${(e as Error).message}`
    );
  }
  if (!Array.isArray(parsed.threads)) {
    await backupCorruptChats(fp);
    throw new Error("chats.json is corrupt (threads is not an array)");
  }
  return {
    activeThreadId: parsed.activeThreadId ?? null,
    threads: parsed.threads,
  };
}

async function backupCorruptChats(fp: string): Promise<void> {
  try {
    await rename(fp, `${fp}.bad-${Date.now()}`);
  } catch {
    // A concurrent load may have already moved it; nothing to do.
  }
}

export async function saveProjectChats(
  slug: string,
  data: ProjectChatsFile
): Promise<void> {
  const p = projectPaths(slug);
  await mkdir(p.working, { recursive: true });
  // Atomic write: a crash mid-write leaves chats.json intact (the old file)
  // rather than a truncated half-file that the next load would treat as
  // corrupt. rename is atomic on POSIX; the temp name is pid-suffixed so two
  // processes can't collide on the tmp file.
  const tmp = `${p.chats}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, p.chats);
}

export async function listProjectThreads(slug: string): Promise<AgentThread[]> {
  const { threads } = await loadProjectChats(slug);
  return threads
    .filter((t) => t.archived !== true)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listArchivedProjectThreads(
  slug: string
): Promise<AgentThread[]> {
  const { threads } = await loadProjectChats(slug);
  return threads
    .filter((t) => t.archived === true)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getActiveProjectThreadId(
  slug: string
): Promise<string | null> {
  return (await loadProjectChats(slug)).activeThreadId;
}

export async function setActiveProjectThreadId(
  slug: string,
  threadId: string | null
): Promise<void> {
  const data = await loadProjectChats(slug);
  data.activeThreadId = threadId;
  await saveProjectChats(slug, data);
}

export async function createProjectThread(
  slug: string,
  title?: string
): Promise<AgentThread> {
  const data = await loadProjectChats(slug);
  const thread: AgentThread = {
    id: nextChatId("th"),
    slug,
    title: title ?? "New chat",
    messages: [],
    updatedAt: Date.now(),
  };
  data.threads = [thread, ...data.threads];
  await saveProjectChats(slug, data);
  return thread;
}

export async function appendProjectMessage(
  slug: string,
  threadId: string,
  role: ThreadMessage["role"],
  content: string
): Promise<AgentThread | undefined> {
  const data = await loadProjectChats(slug);
  const idx = data.threads.findIndex((t) => t.id === threadId);
  if (idx === -1) {
    return;
  }
  const thread = data.threads[idx];
  const message: ThreadMessage = {
    id: nextChatId("m"),
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
  data.threads[idx] = next;
  await saveProjectChats(slug, data);
  return next;
}

export async function deleteProjectThread(
  slug: string,
  threadId: string
): Promise<void> {
  const data = await loadProjectChats(slug);
  data.threads = data.threads.filter((t) => t.id !== threadId);
  if (data.activeThreadId === threadId) {
    data.activeThreadId =
      data.threads.find((t) => t.archived !== true)?.id ?? null;
  }
  await saveProjectChats(slug, data);
}

export async function renameProjectThread(
  slug: string,
  threadId: string,
  title: string
): Promise<AgentThread | undefined> {
  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }
  const data = await loadProjectChats(slug);
  const idx = data.threads.findIndex((t) => t.id === threadId);
  if (idx === -1) {
    return;
  }
  const next: AgentThread = {
    ...data.threads[idx],
    title: trimmed,
    updatedAt: Date.now(),
  };
  data.threads[idx] = next;
  await saveProjectChats(slug, data);
  return next;
}

export async function setProjectThreadArchived(
  slug: string,
  threadId: string,
  archived: boolean
): Promise<AgentThread | undefined> {
  const data = await loadProjectChats(slug);
  const idx = data.threads.findIndex((t) => t.id === threadId);
  if (idx === -1) {
    return;
  }
  const next: AgentThread = {
    ...data.threads[idx],
    archived,
    updatedAt: Date.now(),
  };
  data.threads[idx] = next;
  await saveProjectChats(slug, data);
  return next;
}
