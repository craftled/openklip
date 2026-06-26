import { listProjects } from "@engine/projectStore";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(listProjects());
}
