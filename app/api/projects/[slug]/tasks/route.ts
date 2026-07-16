import { existsSync } from "node:fs";
import { killAgentRun } from "@engine/agent-run-registry";
import {
  cancelAgentTask,
  getAgentTask,
  listAgentTasks,
} from "@engine/agent-tasks";
import { trustGuard } from "@engine/local-trust";
import { assertValidSlug, projectPaths } from "@engine/paths";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// The panel only ever shows the recent past: bounded like the history
// route's cap, but tighter, since the panel only ever shows about 5 rows.
const TASKS_LIMIT = 20;

function assertProject(slug: string): Response | undefined {
  // 1. Reject hostile slugs before any path is built.
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  // 2. Project must exist.
  if (!existsSync(projectPaths(slug).project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }
}

// Per-project agent task list, newest first. Mirrors the history route's
// error ladder: invalid slug -> 400, missing project -> 404.
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const err = assertProject(slug);
  if (err) {
    return err;
  }
  return Response.json({
    tasks: await listAgentTasks(slug, { limit: TASKS_LIMIT }),
  });
}

// POST { action: "cancel", taskId } best-effort kills any live process
// registered for the task, then marks the stored task cancelled.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const { slug } = await params;
  const err = assertProject(slug);
  if (err) {
    return err;
  }

  let body: { action?: string; taskId?: string };
  try {
    body = (await req.json()) as { action?: string; taskId?: string };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { action, taskId } = body;

  if (action === "cancel" && taskId) {
    // Confirm the task belongs to THIS slug before touching the process
    // registry: killAgentRun is keyed only by taskId (not slug), so killing
    // first would let a cancel request against the wrong project's URL kill
    // a live process belonging to a DIFFERENT project's task.
    const existing = await getAgentTask(slug, taskId);
    if (!existing) {
      return Response.json({ error: "task not found" }, { status: 404 });
    }
    killAgentRun(taskId);
    const task = await cancelAgentTask(slug, taskId);
    if (!task) {
      return Response.json({ error: "task not found" }, { status: 404 });
    }
    return Response.json({ task });
  }

  return Response.json({ error: "invalid action" }, { status: 400 });
}
