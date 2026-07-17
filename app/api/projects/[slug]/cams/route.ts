import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { Cam, CamRole } from "@engine/cams";
import { startIngestJob } from "@engine/ingest-jobs";
import { trustGuard } from "@engine/local-trust";
import { assertValidSlug, projectPaths } from "@engine/paths";
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

export type IngestCamFn = (
  slug: string,
  videoArg: string,
  opts?: {
    id?: string;
    name?: string;
    role?: CamRole;
    offsetMs?: number;
    force?: boolean;
    signal?: AbortSignal;
  }
) => Promise<Cam>;

export interface CamsPostDeps {
  loadIngestCam: () => Promise<{
    ingestCam: IngestCamFn;
    listCams: (slug: string) => Promise<Cam[]>;
    nextCamId: (existing: Cam[]) => string;
  }>;
  tempRoot?: string;
}

export async function loadProjectIngestCam() {
  const mod = await import("@engine/cams");
  return {
    ingestCam: mod.ingestCam,
    listCams: mod.listCams,
    nextCamId: mod.nextCamId,
  };
}

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

function parseRole(raw: FormDataEntryValue | null): CamRole | undefined {
  if (raw === "speaker" || raw === "wide") {
    return raw;
  }
  if (raw !== null && raw !== "") {
    throw new Error("role must be speaker or wide");
  }
  return;
}

function parseOffsetMs(raw: FormDataEntryValue | null): number | undefined {
  if (raw === null || raw === "") {
    return;
  }
  const n = Number(raw);
  if (!(Number.isFinite(n) && Number.isInteger(n))) {
    throw new Error("offset must be an integer number of milliseconds");
  }
  return n;
}

// Ingest a new cam from an uploaded video into an EXISTING project's
// cams/<id>/, mirroring POST /api/projects/[slug]/takes: probe + proxy +
// audio is minutes-long, so this starts a background job and returns
// immediately; the GUI polls /api/projects/ingest/[jobId].
export function createCamsPost({ loadIngestCam, tempRoot }: CamsPostDeps) {
  return async function POST(
    req: NextRequest,
    { params }: RouteParams
  ): Promise<Response> {
    const denied = trustGuard(req);
    if (denied) {
      return denied;
    }
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
    const nameRaw = form.get("name");
    let role: CamRole | undefined;
    let offsetMs: number | undefined;
    try {
      role = parseRole(form.get("role"));
      offsetMs = parseOffsetMs(form.get("offsetMs"));
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }

    const filename = file.name.replace(/[^\w.-]+/g, "_") || "video.mp4";
    const id =
      typeof idRaw === "string" && idRaw.length > 0 ? idRaw : undefined;
    if (id !== undefined) {
      try {
        assertValidSlug(id);
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 400 });
      }
    }
    const name =
      typeof nameRaw === "string" && nameRaw.trim().length > 0
        ? nameRaw.trim()
        : undefined;

    const { ingestCam, listCams, nextCamId } = await loadIngestCam();
    const existing = await listCams(slug);
    const resolvedId = id ?? nextCamId(existing);

    const tmpDir = await mkdtemp(
      join(tempRoot ?? tmpdir(), "openklip-cam-ingest-")
    );
    const tmpPath = join(tmpDir, filename);
    try {
      await writeUploadToFile(tmpPath, file);

      const job = startIngestJob({
        filename: file.name,
        slug: `${slug}/cams/${resolvedId}`,
        // Not a whole-project sourcePath in the retryIngestJob sense (this
        // composite slug key is never assertValidSlug-retryable; see
        // src/ingest-jobs.ts's retryIngestJob doc), but still the best
        // "original source" value to record for this job's record shape.
        sourcePath: tmpPath,
        run: async (_onProgress, signal) => {
          const camsRoot = projectPaths(slug).cams;
          const durablePath = join(
            camsRoot,
            `${resolvedId}${extname(filename) || ".mp4"}`
          );
          try {
            await mkdir(camsRoot, { recursive: true });
            await copyFile(tmpPath, durablePath);
            const cam = await ingestCam(slug, durablePath, {
              id: resolvedId,
              name,
              role,
              offsetMs,
              force: true,
              signal,
            });
            return cam.id;
          } catch (error) {
            await rm(durablePath, { force: true });
            throw error;
          } finally {
            await rm(tmpDir, { recursive: true, force: true });
          }
        },
      });
      return Response.json({ jobId: job.id, slug, camId: resolvedId });
    } catch (error) {
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  };
}

export const POST = createCamsPost({ loadIngestCam: loadProjectIngestCam });
