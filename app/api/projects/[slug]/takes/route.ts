import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { Take } from "@engine/edl";
import { startIngestJob } from "@engine/ingest-jobs";
import type { IngestProgress } from "@engine/ingest-types";
import { assertValidSlug, projectPaths, slugFromVideo } from "@engine/paths";
import {
  MAX_ASSET_UPLOAD_BYTES,
  uploadTooLargeMessage,
} from "@engine/upload-limits";
import { writeUploadToFile } from "@engine/upload-stream";
import {
  isSupportedVideoFilename,
  unsupportedVideoMessage,
} from "@engine/video-formats";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export type IngestTakeFn = (
  slug: string,
  videoArg: string,
  opts?: {
    id?: string;
    label?: string;
    onProgress?: (progress: IngestProgress) => void;
  }
) => Promise<Take>;

export interface TakesPostDeps {
  loadIngestTake: () => Promise<IngestTakeFn>;
  tempRoot?: string;
}

export async function loadProjectIngestTake(): Promise<IngestTakeFn> {
  const { ingestTake } = await import("@engine/assembly");
  return ingestTake;
}

// Mirrors tasks/route.ts's assertProject: invalid slug -> 400, missing
// project -> 404, checked before any form/disk work.
function assertProject(slug: string): Response | undefined {
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (!existsSync(projectPaths(slug).project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }
}

// Ingest a new take from an uploaded video into an EXISTING project's
// takes/<id>/, mirroring POST /api/projects' upload-then-background-job
// shape (app/api/projects/post.ts): ingestTake is minutes-long (probe + 720p
// proxy + Whisper), so this starts a job and returns immediately; the GUI
// polls the SAME generic /api/projects/ingest/[jobId] route used for
// whole-project ingest. src/ingest-jobs.ts's registry is keyed by jobId
// only (not by the job's `slug` field), so reusing it here is safe; the
// resolved value just happens to be a take id instead of a project slug.
//
// Unlike whole-project ingest, ingestTake never touches project.json (only
// takes/<id>/), so this route deliberately does NOT reserve/release the
// project's ingest slug the way createProjectsPost does: that guard exists
// to stop two concurrent ingests from racing over the SAME project
// directory, which cannot happen here. A composite job key
// (`${slug}/takes/${id}`) is passed to startIngestJob instead of the bare
// project slug so a running take upload is never mistaken for an in-flight
// WHOLE-PROJECT ingest of the same slug (inFlightSlugs is one Set shared
// process-wide, keyed by string value).
export function createTakesPost({ loadIngestTake, tempRoot }: TakesPostDeps) {
  return async function POST(
    req: NextRequest,
    { params }: RouteParams
  ): Promise<Response> {
    const { slug } = await params;
    const err = assertProject(slug);
    if (err) {
      return err;
    }

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
    if (file.size > MAX_ASSET_UPLOAD_BYTES) {
      return Response.json(
        {
          error: uploadTooLargeMessage(
            file.name,
            file.size,
            MAX_ASSET_UPLOAD_BYTES
          ),
        },
        { status: 413 }
      );
    }

    const idRaw = form.get("id");
    const labelRaw = form.get("label");
    const filename = file.name.replace(/[^\w.-]+/g, "_") || "video.mp4";
    // Same default id CLI `take-add` uses (slugify of the filename, stripped
    // of extension), computed from the sanitized upload filename rather than
    // any filesystem path so it never picks up temp-dir segments.
    const id =
      typeof idRaw === "string" && idRaw.length > 0
        ? idRaw
        : slugFromVideo(filename);
    const label = typeof labelRaw === "string" ? labelRaw : undefined;
    // The id becomes a path segment (takes/<id>/ and the durable source copy
    // below); validate before any join, same reasoning as [slug].
    try {
      assertValidSlug(id);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }

    const tmpDir = await mkdtemp(
      join(tempRoot ?? tmpdir(), "openklip-take-ingest-")
    );
    const tmpPath = join(tmpDir, filename);
    try {
      await writeUploadToFile(tmpPath, file);
      const ingestTake = await loadIngestTake();

      const job = startIngestJob({
        filename: file.name,
        slug: `${slug}/takes/${id}`,
        run: async (onProgress) => {
          // ingestTake records whatever path it is given as the take's
          // `source`, and the temp upload dir is deleted once this job
          // settles. Copy into the project's takes/ parking lot FIRST (a
          // durable location ingestTake never wipes: it only rm/recreates
          // takes/<id>/, one level down) so the recorded source outlives
          // this request, the same problem persistUploadedSource solves for
          // project.json's `source` in the whole-project upload path.
          const takesRoot = projectPaths(slug).takes;
          const durablePath = join(
            takesRoot,
            `${id}${extname(filename) || ".mp4"}`
          );
          try {
            await mkdir(takesRoot, { recursive: true });
            await copyFile(tmpPath, durablePath);
            const take = await ingestTake(slug, durablePath, {
              id,
              label,
              onProgress,
            });
            return take.id;
          } catch (error) {
            await rm(durablePath, { force: true });
            throw error;
          } finally {
            await rm(tmpDir, { recursive: true, force: true });
          }
        },
      });
      return Response.json({ jobId: job.id, slug, takeId: id });
    } catch (error) {
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  };
}

export const POST = createTakesPost({ loadIngestTake: loadProjectIngestTake });
