import { trustGuard } from "@engine/local-trust";
import { listProjects } from "@engine/projectStore";
import type { NextRequest } from "next/server";
import { createProjectsPost, loadProjectIngest } from "./post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export function GET(): Response {
  return Response.json(listProjects());
}

const rawPost = createProjectsPost({
  loadIngest: loadProjectIngest,
});

export function POST(req: NextRequest): Promise<Response> | Response {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  return rawPost(req);
}
