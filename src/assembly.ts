// Multi-take assembly ffmpeg/Whisper shell (Feature 3). The pure layout math
// lives in src/assembly-plan.ts (planAssembly); this module is the IO/ffmpeg
// boundary around it: it ingests individual takes into takes/<id>/, and it
// splices an agent-supplied selection into a brand-new single-source project
// (originals parked in takes/, the engine untouched: it still reads one
// project.source/project.proxy). The shared probe → 720p proxy → 16k PCM →
// Whisper core is reused from src/ingest.ts so the two ingest paths cannot drift.
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { z } from "zod";
import type { Actor } from "./action-log.ts";
import { planAssembly } from "./assembly-plan.ts";
import {
  AssemblySelectionSchema,
  type Project,
  ProjectSchema,
  SAMPLE_RATE,
  type Take,
  TakeSchema,
} from "./edl.ts";
import { FFMPEG, probe, run } from "./ffmpeg.ts";
import { extractAudio, runTakeMediaPhases } from "./ingest.ts";
import { assertProjectCanBeIngested } from "./ingest-guard.ts";
import type { IngestPhase, IngestProgress } from "./ingest-types.ts";
import { projectPaths, slugify, takeDir, takeFile } from "./paths.ts";
import { mutateProject } from "./projectStore.ts";
import { cwdPath } from "./repo-paths.ts";
import { defaultTemplateId } from "./templates.ts";

// The pre-default selection shape an agent supplies (padMs optional before the
// schema fills its default). assembleFromSelection re-parses it internally.
type AssemblySelectionInput = z.input<typeof AssemblySelectionSchema>;

// Convert an integer sample count to the fractional seconds ffmpeg's trim/atrim
// filters expect. Source-of-truth conversion stays the planner's job; here we
// only feed the resolved sample spans to ffmpeg.
function samplesToSecExact(samples: number): number {
  return samples / SAMPLE_RATE;
}

const TAKE_INGEST_STEPS: ReadonlyArray<{
  phase: IngestPhase;
  message: string;
}> = [
  { phase: "probe", message: "Probing take" },
  { phase: "proxy", message: "Building take proxy" },
  { phase: "audio", message: "Extracting take audio" },
  { phase: "transcribe", message: "Transcribing take" },
];

// Ingest one take: probe + 720p proxy + 16k PCM + Whisper, written to
// takes/<id>/. Takes never enter project.json; they are the raw material an
// assemble call splices from. The take id defaults to a slug of the file name,
// validated by takeDir/takeFile before any path join.
export async function ingestTake(
  slug: string,
  videoArg: string,
  opts?: {
    id?: string;
    label?: string;
    onProgress?: (progress: IngestProgress) => void;
  }
): Promise<Take> {
  const total = TAKE_INGEST_STEPS.length;
  const emit = (phase: IngestPhase) => {
    if (!opts?.onProgress) {
      return;
    }
    const index = TAKE_INGEST_STEPS.findIndex((step) => step.phase === phase);
    if (index >= 0) {
      opts.onProgress({
        phase,
        message: TAKE_INGEST_STEPS[index].message,
        step: index + 1,
        total,
      });
    }
  };
  const source = isAbsolute(videoArg) ? videoArg : cwdPath(videoArg);
  if (!existsSync(source)) {
    throw new Error(`take video not found: ${source}`);
  }

  const takeId = opts?.id ?? slugify(videoArg.replace(/\.[^.]+$/, ""));
  const dir = takeDir(slug, takeId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const proxyPath = join(dir, "proxy.mp4");
  const audioRaw = join(dir, "audio16k.f32");
  const rawJson = join(dir, "transcript.raw.json");

  console.log(`[take] ${takeId} <- ${source}`);
  emit("probe");
  const meta = await probe(source);
  // proxy ∥ audio, then Whisper (CRAFT-6170).
  const words = await runTakeMediaPhases({
    source,
    paths: {
      proxy: proxyPath,
      audioRaw,
      transcriptRawJson: rawJson,
    },
    emit,
  });

  const take: Take = TakeSchema.parse({
    id: takeId,
    label: opts?.label ?? "",
    source,
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: meta.fps,
    width: meta.width,
    height: meta.height,
    durationSamples: Math.round(meta.durationSec * SAMPLE_RATE),
    words,
    ingestedAt: new Date().toISOString(),
  });

  await Bun.write(takeFile(slug, takeId), JSON.stringify(take, null, 2));
  console.log(`[take] ${takeId} ingested: ${words.length} words`);
  return take;
}

/** Read one ingested take's record. Throws if the take folder is missing. */
export async function loadTake(slug: string, takeId: string): Promise<Take> {
  const fp = takeFile(slug, takeId);
  if (!existsSync(fp)) {
    throw new Error(`take not found: ${takeId}`);
  }
  return TakeSchema.parse(JSON.parse(await Bun.file(fp).text()));
}

/** List every ingested take for a project (empty when takes/ is absent). */
export async function listTakes(slug: string): Promise<Take[]> {
  const root = projectPaths(slug).takes;
  if (!existsSync(root)) {
    return [];
  }
  const takes: Take[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const fp = takeFile(slug, entry.name);
    if (existsSync(fp)) {
      takes.push(TakeSchema.parse(JSON.parse(await Bun.file(fp).text())));
    }
  }
  return takes;
}

// Build the concat-FILTER argv that splices the planned source spans from each
// take's media into one continuous stream. Every segment is normalized to the
// first take's width/height/fps (concat requires matching geometry) and the
// audio rebased to SAMPLE_RATE. `inputFor` picks the per-take input file (the
// originals for source.mp4, the proxies for proxy.mp4).
function buildConcatArgs(
  plan: ReturnType<typeof planAssembly>,
  takes: Map<string, Take>,
  inputFor: (take: Take) => string,
  out: string,
  target: { width: number; height: number; fps: number }
): string[] {
  const args: string[] = ["-y"];
  for (const seg of plan.segments) {
    const take = takes.get(seg.takeId);
    if (!take) {
      throw new Error(`unknown take "${seg.takeId}"`);
    }
    args.push("-i", inputFor(take));
  }

  const parts: string[] = [];
  const labels: string[] = [];
  plan.segments.forEach((seg, i) => {
    const start = samplesToSecExact(seg.srcStartSample);
    const end = samplesToSecExact(seg.srcEndSample);
    // Video: trim → reset PTS → normalize geometry/fps to the target.
    parts.push(
      `[${i}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,` +
        `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,` +
        `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
        `fps=${target.fps}[v${i}]`
    );
    // Audio: atrim → reset PTS → normalize to SAMPLE_RATE stereo.
    parts.push(
      `[${i}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,` +
        `aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo[a${i}]`
    );
    labels.push(`[v${i}][a${i}]`);
  });
  const n = plan.segments.length;
  const filter = `${parts.join(";")};${labels.join("")}concat=n=${n}:v=1:a=1[outv][outa]`;

  args.push(
    "-filter_complex",
    filter,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    String(SAMPLE_RATE),
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    out
  );
  return args;
}

// Splice an agent-supplied selection of take runs into a NEW single-source
// project. The planner lays the runs end-to-end (integer samples, no seam gap);
// ffmpeg concat-FILTERs the corresponding media into source.mp4 + the 720p
// proxy; project.json is written with the re-id'd words and an `assembly`
// provenance block. Gated through assertProjectCanBeIngested so it cannot
// silently clobber an existing edit.
export async function assembleFromSelection(
  slug: string,
  rawSelection: AssemblySelectionInput,
  opts?: { force?: boolean; actor?: Actor }
): Promise<{
  slug: string;
  durationSec: number;
  segments: number;
  words: number;
}> {
  const selection = AssemblySelectionSchema.parse(rawSelection);

  // Load every referenced take.
  const takes = new Map<string, Take>();
  for (const seg of selection.segments) {
    if (!takes.has(seg.takeId)) {
      takes.set(seg.takeId, await loadTake(slug, seg.takeId));
    }
  }

  const plan = planAssembly(selection, takes);

  // Normalize every segment to the first take's geometry/fps (concat needs it).
  const firstTake = takes.get(selection.segments[0].takeId);
  if (!firstTake) {
    throw new Error(`unknown take "${selection.segments[0].takeId}"`);
  }
  const target = {
    width: firstTake.width,
    height: firstTake.height,
    fps: firstTake.fps,
  };

  assertProjectCanBeIngested(slug, opts?.force);
  const p = projectPaths(slug);
  await mkdir(p.working, { recursive: true });
  await mkdir(p.output, { recursive: true });
  await mkdir(p.takes, { recursive: true });
  // Re-write the records of the takes we just consumed under takes/ so the
  // assembled project keeps its raw material alongside the new source. (The
  // takes loaded above are the same on-disk records; this is idempotent.)
  for (const take of takes.values()) {
    await mkdir(takeDir(slug, take.id), { recursive: true });
    await Bun.write(takeFile(slug, take.id), JSON.stringify(take, null, 2));
  }

  const sourceOut = join(p.dir, "source.mp4");
  await run(
    FFMPEG,
    buildConcatArgs(plan, takes, (t) => t.source, sourceOut, target),
    "ffmpeg(assemble-source)"
  );
  await run(
    FFMPEG,
    buildConcatArgs(
      plan,
      takes,
      (t) => join(takeDir(slug, t.id), t.proxy),
      p.proxy,
      target
    ),
    "ffmpeg(assemble-proxy)"
  );

  // R4: the assembly replaces source/proxy/project.json, so the ingest-time
  // analysis inputs MUST follow. Left alone, the PREVIOUS recording's
  // working/audio16k.f32 keeps a valid mtime and working/audio-analysis.json
  // stays cache-fresh against it, so snap and dead-air cleanup would silently
  // analyze the WRONG audio. Regenerate the PCM from the assembled source; if
  // extraction fails, drop the stale PCM instead - no analysis (the honest
  // degraded path: loadAudioAnalysis throws, cleanup goes filler-only) beats
  // analysis of the wrong recording. The derived cache is stale either way.
  try {
    await extractAudio(sourceOut, p.audioRaw);
  } catch {
    await rm(p.audioRaw, { force: true });
  }
  await rm(join(p.working, "audio-analysis.json"), { force: true });

  const project: Project = ProjectSchema.parse({
    version: 1,
    slug,
    source: sourceOut,
    proxy: "working/proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: target.fps,
    width: target.width,
    height: target.height,
    durationSamples: plan.durationSamples,
    padMs: 50,
    template: defaultTemplateId(),
    captions: { enabled: true, maxWords: 6 },
    words: plan.words,
    assembly: {
      assembledAt: new Date().toISOString(),
      segments: plan.segments.map((s) => ({
        takeId: s.takeId,
        startWordId: s.startWordId,
        endWordId: s.endWordId,
        srcStartSample: s.srcStartSample,
        srcEndSample: s.srcEndSample,
        outStartSample: s.outStartSample,
        outEndSample: s.outEndSample,
        ...(s.note === undefined ? {} : { note: s.note }),
      })),
    },
  });

  // Write through mutateProject (locked, logged) instead of a direct
  // Bun.write: the fn replaces the loaded project's contents wholesale but
  // must NOT set revision itself, so mutateProject continues the previous
  // project's revision counter instead of silently resetting it.
  await mutateProject(
    slug,
    (loaded) => {
      for (const key of Object.keys(loaded)) {
        delete (loaded as Record<string, unknown>)[key];
      }
      Object.assign(loaded, project);
    },
    {
      action: "assemble",
      actor: opts?.actor,
      input: {
        segments: selection.segments,
        padMs: selection.padMs,
      },
    }
  );
  await Bun.write(p.transcript, JSON.stringify({ words: plan.words }, null, 2));

  return {
    slug,
    durationSec: plan.durationSamples / SAMPLE_RATE,
    segments: plan.segments.length,
    words: plan.words.length,
  };
}
