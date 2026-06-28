import { listTemplates, loadTemplateSkill } from "@engine/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    try {
      const skill = loadTemplateSkill(id);
      return Response.json({ id, skill });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 404 });
    }
  }
  return Response.json({ templates: listTemplates() });
}
