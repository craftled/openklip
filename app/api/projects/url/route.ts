import { loadProjectIngest } from "../post.ts";
import { createUrlProjectsPost } from "./post.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const POST = createUrlProjectsPost({
  loadIngest: loadProjectIngest,
});
