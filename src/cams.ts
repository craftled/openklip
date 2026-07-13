import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { SAMPLE_RATE } from "./edl.ts";
import { probe } from "./ffmpeg.ts";
import { buildProxy, extractAudio } from "./ingest.ts";
import { camDir, camFile, projectPaths } from "./paths.ts";
import { cwdPath } from "./repo-paths.ts";

export type CamRole = "speaker" | "wide";

const MAX_CAMS = 8;

export const CamSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  role: z.enum(["speaker", "wide"]).default("speaker"),
  source: z.string(),
  proxy: z.string(),
  audio: z.string(),
  sampleRate: z.literal(SAMPLE_RATE),
  fps: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSamples: z.number().int().positive(),
  offsetMs: z.number().default(0),
  ingestedAt: z.string(),
});
export type Cam = z.infer<typeof CamSchema>;

function assertCamId(camId: string): string {
  const parsed = CamSchema.shape.id.safeParse(camId);
  if (!parsed.success) {
    throw new Error(
      `invalid cam id: ${JSON.stringify(camId)} (use lowercase letters, digits, hyphens)`
    );
  }
  return camId;
}

export function nextCamId(existing: Cam[]): string {
  for (let n = 1; n <= MAX_CAMS; n++) {
    const id = `cam${n}`;
    if (!existing.some((cam) => cam.id === id)) {
      return id;
    }
  }
  throw new Error(`cam limit reached: max ${MAX_CAMS} cams per project`);
}

function speakerCount(cams: Cam[]): number {
  return cams.filter((cam) => cam.role === "speaker").length;
}

function defaultCamName(
  role: CamRole,
  existing: Cam[],
  replacingId?: string
): string {
  if (role === "wide") {
    return "Wide";
  }
  const others = replacingId
    ? existing.filter((cam) => cam.id !== replacingId)
    : existing;
  return `Speaker ${speakerCount(others) + 1}`;
}

/** Read one ingested cam's record. Throws if the cam folder is missing. */
export async function loadCam(slug: string, camId: string): Promise<Cam> {
  const fp = camFile(slug, camId);
  if (!existsSync(fp)) {
    throw new Error(`cam not found: ${camId}`);
  }
  return CamSchema.parse(JSON.parse(await Bun.file(fp).text()));
}

/** List every ingested cam for a project (empty when cams/ is absent). */
export async function listCams(slug: string): Promise<Cam[]> {
  const root = projectPaths(slug).cams;
  if (!existsSync(root)) {
    return [];
  }
  const cams: Cam[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const fp = camFile(slug, entry.name);
    if (existsSync(fp)) {
      cams.push(CamSchema.parse(JSON.parse(await Bun.file(fp).text())));
    }
  }
  return cams.sort((a, b) => {
    const byTime = a.ingestedAt.localeCompare(b.ingestedAt);
    if (byTime !== 0) {
      return byTime;
    }
    return a.id.localeCompare(b.id);
  });
}

// Ingest one cam: probe + 720p proxy + 16k PCM, written to cams/<id>/.
// Cams are not transcribed at ingest; they are raw material for cam-mix later.
export async function ingestCam(
  slug: string,
  videoArg: string,
  opts?: {
    id?: string;
    name?: string;
    role?: CamRole;
    offsetMs?: number;
    force?: boolean;
  }
): Promise<Cam> {
  const source = isAbsolute(videoArg) ? videoArg : cwdPath(videoArg);
  if (!existsSync(source)) {
    throw new Error(`cam video not found: ${source}`);
  }

  const existing = await listCams(slug);
  const camId = opts?.id ? assertCamId(opts.id) : nextCamId(existing);
  const dir = camDir(slug, camId);
  const dirExists = existsSync(dir);

  if (dirExists && !opts?.force) {
    throw new Error(`cam already exists: ${camId} (pass force to re-ingest)`);
  }
  if (!dirExists && existing.length >= MAX_CAMS) {
    throw new Error(`cam limit reached: max ${MAX_CAMS} cams per project`);
  }

  const role = opts?.role ?? "speaker";
  const name =
    opts?.name ??
    defaultCamName(role, existing, opts?.force ? camId : undefined);

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const proxyPath = join(dir, "proxy.mp4");
  const audioRaw = join(dir, "audio16k.f32");

  console.log(`[cam] ${camId} <- ${source}`);
  const meta = await probe(source);
  await buildProxy(source, proxyPath);
  await extractAudio(source, audioRaw);

  const cam: Cam = CamSchema.parse({
    id: camId,
    name,
    role,
    source,
    proxy: "proxy.mp4",
    audio: "audio16k.f32",
    sampleRate: SAMPLE_RATE,
    fps: meta.fps,
    width: meta.width,
    height: meta.height,
    durationSamples: Math.round(meta.durationSec * SAMPLE_RATE),
    offsetMs: opts?.offsetMs ?? 0,
    ingestedAt: new Date().toISOString(),
  });

  await Bun.write(camFile(slug, camId), JSON.stringify(cam, null, 2));
  console.log(`[cam] ${camId} ingested`);
  return cam;
}

export async function setCam(
  slug: string,
  camId: string,
  patch: { name?: string; role?: CamRole; offsetMs?: number }
): Promise<Cam> {
  const cam = await loadCam(slug, camId);
  const updated = CamSchema.parse({ ...cam, ...patch });
  await Bun.write(camFile(slug, camId), JSON.stringify(updated, null, 2));
  return updated;
}
