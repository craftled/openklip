import { listProjects } from "@engine/projectStore";
import { createProjectsPost, loadProjectIngest } from "./post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export function GET(): Response {
  return Response.json(listProjects());
}

export const POST = createProjectsPost({
  loadIngest: loadProjectIngest,
});
