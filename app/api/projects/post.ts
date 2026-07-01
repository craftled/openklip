import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startIngestJob } from "@engine/ingest-jobs";
import type { IngestProgress } from "@engine/ingest-types";
import { projectPaths, slugFromVideo } from "@engine/paths";
import type { NextRequest } from "next/server";

export type IngestFn = (
  videoArg: string,
  opts?: { force?: boolean; onProgress?: (p: IngestProgress) => void }
) => Promise<string>;

export interface ProjectsPostDeps {
  loadIngest: () => Promise<IngestFn>;
  tempRoot?: string;
}

export async function loadProjectIngest(): Promise<IngestFn> {
  const { ingest } = await import("@engine/ingest");
  return ingest;
}

export function createProjectsPost({ loadIngest, tempRoot }: ProjectsPostDeps) {
  return async function POST(req: NextRequest): Promise<Response> {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "missing file field" }, { status: 400 });
    }
    const force = new URL(req.url).searchParams.get("force") === "1";
    const filename = file.name.replace(/[^\w.-]+/g, "_") || "video.mp4";
    const slug = slugFromVideo(filename);
    if (!force && existsSync(projectPaths(slug).project)) {
      return Response.json(
        {
          error: `project already exists: ${slug} (re-ingest would wipe it; confirm to overwrite)`,
        },
        { status: 409 }
      );
    }

    const tmpDir = await mkdtemp(
      join(tempRoot ?? tmpdir(), "openklip-ingest-")
    );
    const tmpPath = join(tmpDir, filename);
    try {
      await writeFile(tmpPath, new Uint8Array(await file.arrayBuffer()));
      const ingest = await loadIngest();

      const job = startIngestJob({
        filename: file.name,
        slug,
        run: async (onProgress) => {
          try {
            return await ingest(tmpPath, { force, onProgress });
          } finally {
            await rm(tmpDir, { recursive: true, force: true });
          }
        },
      });
      return Response.json({ jobId: job.id, slug });
    } catch (error) {
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  };
}
