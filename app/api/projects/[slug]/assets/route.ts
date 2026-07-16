import { existsSync } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { listAssetsByKind, registerAsset } from "@engine/assets";
import { type Asset, type AssetKind, AssetKindSchema } from "@engine/edl";
import { trustGuard } from "@engine/local-trust";
import { projectPaths } from "@engine/paths";
import { loadProject } from "@engine/projectStore";
import {
  MAX_ASSET_UPLOAD_BYTES,
  uploadTooLargeMessage,
} from "@engine/upload-limits";
import { writeUploadToFile } from "@engine/upload-stream";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  try {
    const project = await loadProject(slug);
    return Response.json({
      assets: project.assets,
      byKind: listAssetsByKind(project.assets),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}

/**
 * Thrown when the bytes actually streamed to disk exceed the cap even
 * though the declared multipart size passed the earlier guard. Mapped to
 * 413, same as the declared-size check.
 */
class AssetTooLargeError extends Error {}

/**
 * Mirrors the unique-filename dedup that registerAssetBytes used to do
 * internally: sanitize the upload's name and, if it collides with an
 * existing file, append -2, -3, ... until it doesn't. Duplicated here
 * (rather than reusing registerAssetBytes) because that helper buffers the
 * whole file into a Uint8Array before writing; this route streams straight
 * to the destination path instead, so it needs the destination path picked
 * up front.
 */
function uniqueAssetDestination(assetsDir: string, filename: string): string {
  const safeName =
    basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
  let dest = resolve(assetsDir, safeName);
  if (!existsSync(dest)) {
    return dest;
  }
  const ext = extname(safeName);
  const stem = basename(safeName, ext) || "upload";
  let n = 2;
  while (existsSync(dest)) {
    dest = resolve(assetsDir, `${stem}-${n}${ext}`);
    n += 1;
  }
  return dest;
}

async function cleanupStoredFile(path: string | undefined): Promise<void> {
  if (!path) {
    return;
  }
  try {
    await unlink(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      throw e;
    }
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const { slug } = await params;
  let storedPath: string | undefined;
  let registered = false;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "missing file field" }, { status: 400 });
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
    const kindRaw = form.get("kind");
    let kind: AssetKind | undefined;
    if (typeof kindRaw === "string" && kindRaw.length > 0) {
      const parsed = AssetKindSchema.safeParse(kindRaw);
      if (!parsed.success) {
        return Response.json({ error: "invalid kind" }, { status: 400 });
      }
      kind = parsed.data;
    }

    const p = projectPaths(slug);
    await mkdir(p.assets, { recursive: true });
    storedPath = uniqueAssetDestination(p.assets, file.name);

    // Stream the upload straight to disk instead of buffering it through
    // the File's whole-body read: the route used to materialize the entire
    // (up to MAX_ASSET_UPLOAD_BYTES, 4 GB) upload as an in-memory Uint8Array
    // before writing it out, which OOMs the process on large files.
    // writeUploadToFile pumps the Blob's ReadableStream to an fs write
    // stream with backpressure instead.
    await writeUploadToFile(storedPath, file);

    // Defense in depth: the declared multipart size was already checked
    // above, but verify what actually landed on disk too, in case that
    // declaration didn't match reality. Abort and clean up rather than
    // register an asset that busts the cap.
    const written = await stat(storedPath);
    if (written.size > MAX_ASSET_UPLOAD_BYTES) {
      throw new AssetTooLargeError(
        uploadTooLargeMessage(file.name, written.size, MAX_ASSET_UPLOAD_BYTES)
      );
    }

    // registerAsset owns its own per-slug locking via mutateProject
    // (serializing against folder sync the same way this route used to with
    // an outer withProjectLock). Do NOT wrap this in withProjectLock here:
    // mutateProject acquires that same lock internally, and a second
    // acquisition from the same call stack before the first releases would
    // deadlock (see project-lock.ts).
    const asset = await registerAsset(slug, storedPath, kind, "human");
    registered = true;
    const project = await loadProject(slug);
    return Response.json({
      asset,
      assets: project.assets,
      byKind: listAssetsByKind(project.assets),
    } satisfies {
      asset: Asset;
      assets: Asset[];
      byKind: ReturnType<typeof listAssetsByKind>;
    });
  } catch (e) {
    // Clean up the streamed file on every failure path (streaming error,
    // oversize, proxy failure, registration failure). Once registerAsset
    // has actually succeeded, the stored path is a permanent asset source
    // referenced by project.json and must NOT be deleted here.
    if (!registered) {
      await cleanupStoredFile(storedPath);
    }
    if (e instanceof AssetTooLargeError) {
      return Response.json({ error: e.message }, { status: 413 });
    }
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
