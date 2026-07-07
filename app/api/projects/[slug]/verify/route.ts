import { existsSync } from "node:fs";
import { buildExportVerificationReport } from "@engine/export-verification-report";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { loadProject } from "@engine/projectStore";
import { verifyCut, verifyVerdict } from "@engine/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { slug } = await params;
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const paths = projectPaths(slug);
  if (!existsSync(paths.project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }

  try {
    const project = await loadProject(slug);
    const report = await verifyCut(slug);
    const dashboard = buildExportVerificationReport(project, {
      slug,
      transcript: report,
    });
    return Response.json({
      ok: true,
      report,
      dashboard,
      verdict: verifyVerdict(report),
    });
  } catch (e) {
    const message = (e as Error).message;
    if (message.startsWith("no export found")) {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
