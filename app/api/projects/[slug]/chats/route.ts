import {
  appendProjectMessage,
  createProjectThread,
  deleteProjectThread,
  getActiveProjectThreadId,
  listArchivedProjectThreads,
  listProjectThreads,
  loadProjectChats,
  renameProjectThread,
  setActiveProjectThreadId,
  setProjectThreadArchived,
} from "@engine/chats";
import { trustGuard } from "@engine/local-trust";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  try {
    const [threads, archived, activeThreadId] = await Promise.all([
      listProjectThreads(slug),
      listArchivedProjectThreads(slug),
      getActiveProjectThreadId(slug),
    ]);
    return Response.json({ threads, archived, activeThreadId });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const { slug } = await params;
  try {
    const body = (await req.json()) as {
      action?: string;
      archived?: boolean;
      content?: string;
      role?: "assistant" | "user";
      threadId?: string;
      title?: string;
    };
    const { action } = body;

    if (action === "create") {
      const thread = await createProjectThread(slug, body.title);
      return Response.json({ thread, ...(await loadProjectChats(slug)) });
    }

    if (action === "append" && body.threadId && body.content && body.role) {
      const thread = await appendProjectMessage(
        slug,
        body.threadId,
        body.role,
        body.content
      );
      if (!thread) {
        return Response.json({ error: "thread not found" }, { status: 404 });
      }
      return Response.json({ thread });
    }

    if (action === "rename" && body.threadId && body.title) {
      const thread = await renameProjectThread(slug, body.threadId, body.title);
      if (!thread) {
        return Response.json({ error: "thread not found" }, { status: 404 });
      }
      return Response.json({ thread });
    }

    if (
      action === "archive" &&
      body.threadId &&
      typeof body.archived === "boolean"
    ) {
      const thread = await setProjectThreadArchived(
        slug,
        body.threadId,
        body.archived
      );
      if (!thread) {
        return Response.json({ error: "thread not found" }, { status: 404 });
      }
      return Response.json({ thread });
    }

    if (action === "delete" && body.threadId) {
      await deleteProjectThread(slug, body.threadId);
      return Response.json(await loadProjectChats(slug));
    }

    if (action === "setActive") {
      const threadId = body.threadId ?? null;
      if (threadId !== null) {
        const { threads } = await loadProjectChats(slug);
        if (!threads.some((t) => t.id === threadId)) {
          return Response.json({ error: "thread not found" }, { status: 404 });
        }
      }
      await setActiveProjectThreadId(slug, threadId);
      return Response.json({ activeThreadId: threadId });
    }

    return Response.json({ error: "invalid action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
