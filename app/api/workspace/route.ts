import { platform } from "node:os";
import { projectsRoot } from "@engine/paths";
import { pickFolder } from "@engine/pick-folder";
import { listProjects } from "@engine/projectStore";
import { writeConfiguredProjectsRoot } from "@engine/workspace-config";
import { z } from "zod";

function folderPickerSupported(): boolean {
  return platform() === "darwin" || process.env.OPENKLIP_TEST_PICK === "1";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WorkspaceRequestSchema = z
  .object({
    action: z.literal("pick"),
  })
  .strict();

export function GET(): Response {
  return Response.json({
    pickerSupported: folderPickerSupported(),
    root: projectsRoot(),
  });
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = WorkspaceRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: `invalid workspace request: ${parsed.error.message}` },
      { status: 400 }
    );
  }

  try {
    const picked = await pickFolder("Choose a folder to work in");
    if (!picked) {
      return Response.json({ cancelled: true, root: projectsRoot() });
    }
    writeConfiguredProjectsRoot(picked);
    return Response.json({
      root: projectsRoot(),
      projects: listProjects(),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
