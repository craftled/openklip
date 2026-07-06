import { platform } from "node:os";
import { formatDisplayPath } from "@engine/display-path";
import { projectsRoot } from "@engine/paths";
import { pickFolder } from "@engine/pick-folder";
import { listProjects } from "@engine/projectStore";
import {
  isWorkspaceConfigured,
  writeConfiguredProjectsRoot,
} from "@engine/workspace-config";
import { z } from "zod";

function folderPickerSupported(): boolean {
  return platform() === "darwin" || process.env.OPENKLIP_TEST_PICK === "1";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WorkspaceRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("pick"),
    })
    .strict(),
  z
    .object({
      action: z.literal("set"),
      path: z.string().min(1),
    })
    .strict(),
]);

export function GET(): Response {
  const root = projectsRoot();
  return Response.json({
    configured: isWorkspaceConfigured(),
    displayRoot: formatDisplayPath(root),
    pickerSupported: folderPickerSupported(),
    root,
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

  if (parsed.data.action === "set") {
    try {
      writeConfiguredProjectsRoot(parsed.data.path);
      const root = projectsRoot();
      return Response.json({
        displayRoot: formatDisplayPath(root),
        projects: listProjects(),
        root,
      });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  try {
    const picked = await pickFolder("Choose a folder to work in");
    if (!picked) {
      const root = projectsRoot();
      return Response.json({
        cancelled: true,
        displayRoot: formatDisplayPath(root),
        root,
      });
    }
    writeConfiguredProjectsRoot(picked);
    const root = projectsRoot();
    return Response.json({
      displayRoot: formatDisplayPath(root),
      projects: listProjects(),
      root,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
