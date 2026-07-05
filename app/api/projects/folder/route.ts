import { loadProjectIngest } from "../post.ts";
import { createFolderProjectsPost } from "./post.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const POST = createFolderProjectsPost({
  loadIngest: loadProjectIngest,
});
