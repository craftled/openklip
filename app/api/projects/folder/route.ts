import { trustGuard } from "@engine/local-trust";
import type { NextRequest } from "next/server";
import { loadProjectIngest } from "../post.ts";
import { createFolderProjectsPost } from "./post.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const rawPost = createFolderProjectsPost({
  loadIngest: loadProjectIngest,
});

export function POST(req: NextRequest): Promise<Response> | Response {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  return rawPost(req);
}
