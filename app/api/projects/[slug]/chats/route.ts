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
      return Response.json({ thread });
    }

    if (action === "rename" && body.threadId && body.title) {
      const thread = await renameProjectThread(slug, body.threadId, body.title);
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
      return Response.json({ thread });
    }

    if (action === "delete" && body.threadId) {
      await deleteProjectThread(slug, body.threadId);
      return Response.json(await loadProjectChats(slug));
    }

    if (action === "setActive") {
      await setActiveProjectThreadId(slug, body.threadId ?? null);
      return Response.json({ activeThreadId: body.threadId ?? null });
    }

    return Response.json({ error: "invalid action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
