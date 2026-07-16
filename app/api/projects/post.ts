import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  releaseIngestSlug,
  reserveIngestSlug,
  startIngestJob,
} from "@engine/ingest-jobs";
import { IngestPersistError } from "@engine/ingest-persist-error";
import type { IngestProgress } from "@engine/ingest-types";
import { projectPaths, slugFromVideo } from "@engine/paths";
import { withProjectLock } from "@engine/project-lock";
import {
  MAX_PROJECT_UPLOAD_BYTES,
  uploadTooLargeMessage,
} from "@engine/upload-limits";
import { writeUploadToFile } from "@engine/upload-stream";
import {
  isSupportedVideoFilename,
  unsupportedVideoMessage,
} from "@engine/video-formats";
import type { NextRequest } from "next/server";

export type IngestFn = (
  videoArg: string,
  opts?: {
    force?: boolean;
    onProgress?: (p: IngestProgress) => void;
    signal?: AbortSignal;
  }
) => Promise<string>;

export interface ProjectsPostDeps {
  loadIngest: () => Promise<IngestFn>;
  tempRoot?: string;
}

export async function loadProjectIngest(): Promise<IngestFn> {
  const { ingest } = await import("@engine/ingest");
  return ingest;
}

// The temp upload dir is deleted once ingest settles, but project.json
// `source` must keep pointing at a real absolute file: the exporter renders
// full-res from source and silently degrades to the 720p proxy when it is
// gone (src/exporter.ts, src/doctor.ts). Persist the upload at the project
// root next to project.json (NOT assets/, which folder-sync would register
// as b-roll) and repoint source at that absolute path.
export async function persistUploadedSource(
  slug: string,
  filename: string,
  tmpPath: string
): Promise<void> {
  const paths = projectPaths(slug);
  const storedSource = join(paths.dir, filename);
  await copyFile(tmpPath, storedSource);
  // Serialize under the same per-slug lock mutateProject uses: in the ?force=1
  // overwrite path the editor may already be autosaving this slug, and an
  // unlocked read-patch-write could drop that concurrent edit. mutateProject
  // itself is deliberately not used; this internal repoint must not bump the
  // revision or add a history entry.
  await withProjectLock(slug, async () => {
    const project = JSON.parse(await readFile(paths.project, "utf8")) as {
      source?: string;
    };
    project.source = storedSource;
    await writeFile(paths.project, JSON.stringify(project, null, 2));
  });
}

export function createProjectsPost({ loadIngest, tempRoot }: ProjectsPostDeps) {
  return async function POST(req: NextRequest): Promise<Response> {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "missing file field" }, { status: 400 });
    }
    // Fail fast on non-video uploads instead of minutes later in ffprobe.
    if (!isSupportedVideoFilename(file.name)) {
      return Response.json(
        { error: unsupportedVideoMessage(file.name) },
        { status: 400 }
      );
    }
    if (file.size > MAX_PROJECT_UPLOAD_BYTES) {
      return Response.json(
        {
          error: uploadTooLargeMessage(
            "Upload",
            file.size,
            MAX_PROJECT_UPLOAD_BYTES
          ),
        },
        { status: 413 }
      );
    }
    const force = new URL(req.url).searchParams.get("force") === "1";
    const filename = file.name.replace(/[^\w.-]+/g, "_") || "video.mp4";
    const slug = slugFromVideo(filename);
    // Ingest wipes the project dir FIRST and writes project.json LAST, so the
    // existsSync guard below cannot see a half-done ingest. Claim the slug
    // ATOMICALLY here (force included; scan-inbox applies the same guard):
    // the awaits below (temp write, arrayBuffer, loadIngest) would otherwise
    // let two same-name uploads both pass a bare in-flight check and race two
    // ingests over one directory. Every early exit after this point must
    // release the claim; startIngestJob takes ownership and releases when the
    // job settles.
    if (!reserveIngestSlug(slug)) {
      // `code` disambiguates the two 409s: only "exists" may offer the
      // destructive replace flow client-side; an in-flight conflict must
      // surface as a plain failure (confirming a replace after the running
      // ingest finished would wipe the just-created project).
      return Response.json(
        {
          code: "in-flight",
          error: `ingest already in progress for ${slug}`,
        },
        { status: 409 }
      );
    }
    if (!force && existsSync(projectPaths(slug).project)) {
      releaseIngestSlug(slug);
      return Response.json(
        {
          code: "exists",
          error: `project already exists: ${slug} (re-ingest would wipe it; confirm to overwrite)`,
        },
        { status: 409 }
      );
    }

    let tmpDir: string;
    try {
      tmpDir = await mkdtemp(join(tempRoot ?? tmpdir(), "openklip-ingest-"));
    } catch (error) {
      releaseIngestSlug(slug);
      throw error;
    }
    const tmpPath = join(tmpDir, filename);
    try {
      await writeUploadToFile(tmpPath, file);
      const ingest = await loadIngest();

      const job = startIngestJob({
        filename: file.name,
        slug,
        sourcePath: tmpPath,
        run: async (onProgress, signal) => {
          try {
            const createdSlug = await ingest(tmpPath, {
              force,
              onProgress,
              signal,
            });
            // Copy after ingest resolves (ingest wipes the project dir at
            // start) and before temp cleanup; a failed copy surfaces as a
            // partial-success job so the GUI can open the project with a warning.
            try {
              await persistUploadedSource(createdSlug, filename, tmpPath);
            } catch (persistError) {
              throw new IngestPersistError(createdSlug, persistError);
            }
            return createdSlug;
          } finally {
            await rm(tmpDir, { recursive: true, force: true });
          }
        },
      });
      return Response.json({ jobId: job.id, slug });
    } catch (error) {
      releaseIngestSlug(slug);
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  };
}
