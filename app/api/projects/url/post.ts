import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  releaseIngestSlug,
  reserveIngestSlug,
  startIngestJob,
} from "@engine/ingest-jobs";
import { IngestPersistError } from "@engine/ingest-persist-error";
import { projectPaths, slugFromVideo } from "@engine/paths";
import {
  downloadVideoFromUrl,
  UrlIngesterUnavailableError,
} from "@engine/url-ingest";
import type { NextRequest } from "next/server";
import type { IngestFn } from "../post.ts";
import { persistUploadedSource } from "../post.ts";

export interface UrlProjectsPostDeps {
  loadIngest: () => Promise<IngestFn>;
  tempRoot?: string;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, "_") || "video.mp4";
}

export function createUrlProjectsPost({
  loadIngest,
  tempRoot,
}: UrlProjectsPostDeps) {
  return async function POST(req: NextRequest): Promise<Response> {
    const body = (await req.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return Response.json({ error: "missing url field" }, { status: 400 });
    }

    const force = new URL(req.url).searchParams.get("force") === "1";
    let tmpDir: string;
    tmpDir = await mkdtemp(join(tempRoot ?? tmpdir(), "openklip-url-"));

    let slug = "";
    try {
      const downloaded = await downloadVideoFromUrl(url, tmpDir);
      const filename = sanitizeFilename(basename(downloaded));
      slug = slugFromVideo(filename);

      if (!reserveIngestSlug(slug)) {
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

      const ingest = await loadIngest();
      const job = startIngestJob({
        filename,
        slug,
        sourcePath: downloaded,
        force,
        run: async (onProgress, signal) => {
          try {
            const createdSlug = await ingest(downloaded, {
              force,
              onProgress,
              signal,
            });
            try {
              await persistUploadedSource(createdSlug, filename, downloaded);
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
      if (slug) {
        releaseIngestSlug(slug);
      }
      await rm(tmpDir, { recursive: true, force: true });
      if (error instanceof UrlIngesterUnavailableError) {
        return Response.json({ error: error.message }, { status: 503 });
      }
      throw error;
    }
  };
}
