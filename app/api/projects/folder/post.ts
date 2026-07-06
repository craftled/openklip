import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncAssetsFromFolder } from "@engine/asset-scanner";
import { planFolderIntake } from "@engine/folder-ingest";
import {
  releaseIngestSlug,
  reserveIngestSlug,
  startIngestJob,
} from "@engine/ingest-jobs";
import { IngestPersistError } from "@engine/ingest-persist-error";
import { projectPaths, slugFromVideo } from "@engine/paths";
import {
  MAX_ASSET_UPLOAD_BYTES,
  MAX_PROJECT_UPLOAD_BYTES,
  uploadTooLargeMessage,
} from "@engine/upload-limits";
import { writeUploadToFile } from "@engine/upload-stream";
import type { NextRequest } from "next/server";
import type { IngestFn } from "../post.ts";
import { persistUploadedSource } from "../post.ts";

export interface FolderProjectsPostDeps {
  loadIngest: () => Promise<IngestFn>;
  tempRoot?: string;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, "_") || "video.mp4";
}

export function createFolderProjectsPost({
  loadIngest,
  tempRoot,
}: FolderProjectsPostDeps) {
  return async function POST(req: NextRequest): Promise<Response> {
    const form = await req.formData();
    const entries = form
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);
    if (entries.length === 0) {
      return Response.json({ error: "missing files field" }, { status: 400 });
    }

    const planned = planFolderIntake(
      entries.map((file) => ({ name: file.name, size: file.size }))
    );
    if ("error" in planned) {
      return Response.json({ error: planned.error }, { status: 400 });
    }

    const primaryFile =
      entries.find((file) => file.name === planned.plan.primary.name) ??
      entries[0];
    const assetFiles = entries.filter((file) =>
      planned.plan.assets.some((asset) => asset.name === file.name)
    );

    if (primaryFile.size > MAX_PROJECT_UPLOAD_BYTES) {
      return Response.json(
        {
          error: uploadTooLargeMessage(
            "Primary video",
            primaryFile.size,
            MAX_PROJECT_UPLOAD_BYTES
          ),
        },
        { status: 413 }
      );
    }
    for (const asset of assetFiles) {
      if (asset.size > MAX_ASSET_UPLOAD_BYTES) {
        return Response.json(
          {
            error: uploadTooLargeMessage(
              asset.name,
              asset.size,
              MAX_ASSET_UPLOAD_BYTES
            ),
          },
          { status: 413 }
        );
      }
    }

    const force = new URL(req.url).searchParams.get("force") === "1";
    const filename = sanitizeFilename(primaryFile.name);
    const slug = slugFromVideo(filename);

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

    let tmpDir: string;
    try {
      tmpDir = await mkdtemp(join(tempRoot ?? tmpdir(), "openklip-folder-"));
    } catch (error) {
      releaseIngestSlug(slug);
      throw error;
    }

    const tmpPrimary = join(tmpDir, filename);
    const tmpAssetsDir = join(tmpDir, "assets");
    try {
      await mkdir(tmpAssetsDir, { recursive: true });
      await writeUploadToFile(tmpPrimary, primaryFile);
      for (const asset of assetFiles) {
        const safeName = sanitizeFilename(asset.name);
        await writeUploadToFile(join(tmpAssetsDir, safeName), asset);
      }

      const ingest = await loadIngest();
      const job = startIngestJob({
        filename: primaryFile.name,
        slug,
        run: async (onProgress) => {
          try {
            const createdSlug = await ingest(tmpPrimary, { force, onProgress });
            try {
              await persistUploadedSource(createdSlug, filename, tmpPrimary);
            } catch (persistError) {
              throw new IngestPersistError(createdSlug, persistError);
            }
            const assetsDir = projectPaths(createdSlug).assets;
            await mkdir(assetsDir, { recursive: true });
            for (const asset of assetFiles) {
              const safeName = sanitizeFilename(asset.name);
              await copyFile(
                join(tmpAssetsDir, safeName),
                join(assetsDir, safeName)
              );
            }
            if (assetFiles.length > 0) {
              await syncAssetsFromFolder(createdSlug);
            }
            return createdSlug;
          } finally {
            await rm(tmpDir, { recursive: true, force: true });
          }
        },
      });
      return Response.json({
        assetCount: assetFiles.length,
        jobId: job.id,
        slug,
      });
    } catch (error) {
      releaseIngestSlug(slug);
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  };
}
