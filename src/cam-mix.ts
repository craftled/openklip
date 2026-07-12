import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { analyzeSilences } from "./audio-analysis.ts";
import {
  type ActivityCam,
  attributeWords,
  buildProgramAudio,
  loadCamActivity,
  speakingSpans,
} from "./cam-activity.ts";
import { autoMixPlan } from "./cam-automix.ts";
import {
  type CamSwitchSettings,
  CamSwitchSettingsSchema,
  followSpeakerPlan,
  type PlanSpan,
  PlanSpanSchema,
  validatePlan,
} from "./cam-plan.ts";
import type { Cam } from "./cams.ts";
import { listCams } from "./cams.ts";
import { type Project, ProjectSchema, SAMPLE_RATE, type Word } from "./edl.ts";
import { FFMPEG, probe, run } from "./ffmpeg.ts";
import { buildProxy, extractAudio, transcribeToWords } from "./ingest.ts";
import { camDir, projectPaths } from "./paths.ts";
import { defaultTemplateId } from "./templates.ts";

export interface MixCam
  extends Pick<Cam, "id" | "name" | "role" | "offsetMs"> {}

export interface CamMixResult {
  attributions: Array<{ wordId: string; camId: string | null }>;
  mode: "follow" | "auto";
  plan: PlanSpan[];
  slug: string;
  sourcePath: string;
}

const MulticamCamProvenanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["speaker", "wide"]),
  offsetMs: z.number(),
  source: z.string(),
});

export const MulticamProvenanceSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["follow", "auto"]),
  settings: CamSwitchSettingsSchema,
  plan: z.array(PlanSpanSchema),
  cams: z.array(MulticamCamProvenanceSchema),
  attributions: z.array(
    z.object({
      wordId: z.string(),
      camId: z.string().nullable(),
    })
  ),
  plannedBy: z.string(),
  plannedAt: z.string(),
  programAudio: z.object({
    masterMix: z.string().nullable(),
  }),
});

export type MulticamProvenance = z.infer<typeof MulticamProvenanceSchema>;

function samplesToSec(samples: number): string {
  return (samples / SAMPLE_RATE).toFixed(6).replace(/\.?0+$/, "") || "0";
}

function projectSecToCamLocalSec(projectSec: number, offsetMs: number): number {
  return Math.max(0, projectSec - offsetMs / 1000);
}

function camLocalTrimRange(
  fromSample: number,
  toSample: number,
  offsetMs: number
): { start: string; end: string } {
  const projectStart = fromSample / SAMPLE_RATE;
  const projectEnd = toSample / SAMPLE_RATE;
  return {
    start: samplesToSec(
      Math.round(projectSecToCamLocalSec(projectStart, offsetMs) * SAMPLE_RATE)
    ),
    end: samplesToSec(
      Math.round(projectSecToCamLocalSec(projectEnd, offsetMs) * SAMPLE_RATE)
    ),
  };
}

function speakerCams(cams: Cam[]): Cam[] {
  return cams.filter((c) => c.role === "speaker");
}

function physicalWideCam(cams: Cam[]): Cam | undefined {
  return cams.find((c) => c.role === "wide");
}

function speakerCamsForSyntheticWide(cams: Cam[]): Cam[] {
  const speakers = speakerCams(cams);
  if (speakers.length >= 5) {
    return speakers.slice(0, 4);
  }
  return speakers;
}

function collectInputCamIds(plan: PlanSpan[], cams: Cam[]): string[] {
  const needed = new Set<string>();
  const wideCam = physicalWideCam(cams);

  for (const span of plan) {
    if (span.shot === "wide") {
      if (wideCam) {
        needed.add(wideCam.id);
      } else {
        for (const sc of speakerCamsForSyntheticWide(cams)) {
          needed.add(sc.id);
        }
      }
    } else {
      needed.add(span.shot);
    }
  }

  return cams.filter((c) => needed.has(c.id)).map((c) => c.id);
}

function buildCamTrimChain(
  inputIndex: number,
  cam: Cam,
  fromSample: number,
  toSample: number,
  target: { width: number; height: number; fps: number },
  outLabel: string
): string {
  const { start, end } = camLocalTrimRange(fromSample, toSample, cam.offsetMs);
  return (
    `[${inputIndex}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,` +
    `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,` +
    `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
    `fps=${target.fps}${outLabel}`
  );
}

function buildSyntheticWideChain(
  span: PlanSpan,
  cams: Cam[],
  inputIndexById: Map<string, number>,
  target: { width: number; height: number; fps: number },
  spanLabel: string,
  parts: string[]
): void {
  const speakers = speakerCamsForSyntheticWide(cams);
  // spanLabel arrives bracketed ("[seg2]"); cell labels must stay bracket-free
  // inside their own brackets or ffmpeg rejects the filterchain.
  const bare = spanLabel.replace(/[^A-Za-z0-9]/g, "");
  const durationSec = ((span.toSample - span.fromSample) / SAMPLE_RATE).toFixed(
    6
  );

  if (speakers.length === 2) {
    const halfW = Math.floor(target.width / 2);
    const labels: string[] = [];
    speakers.forEach((cam, i) => {
      const idx = inputIndexById.get(cam.id);
      if (idx === undefined) {
        throw new Error(`missing input for cam ${cam.id}`);
      }
      const trim = camLocalTrimRange(
        span.fromSample,
        span.toSample,
        cam.offsetMs
      );
      const cell = `w${bare}x${i}`;
      parts.push(
        `[${idx}:v]trim=start=${trim.start}:end=${trim.end},setpts=PTS-STARTPTS,` +
          `scale=${halfW}:${target.height}:force_original_aspect_ratio=decrease,` +
          `pad=${halfW}:${target.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
          `fps=${target.fps}[${cell}]`
      );
      labels.push(`[${cell}]`);
    });
    parts.push(`${labels.join("")}hstack=inputs=2${spanLabel}`);
    return;
  }

  const halfW = Math.floor(target.width / 2);
  const halfH = Math.floor(target.height / 2);
  const gridLabels: string[] = [];
  const gridCount = 4;

  for (let i = 0; i < gridCount; i++) {
    const cam = speakers[i];
    const cell = `w${bare}x${i}`;
    if (cam) {
      const idx = inputIndexById.get(cam.id);
      if (idx === undefined) {
        throw new Error(`missing input for cam ${cam.id}`);
      }
      const trim = camLocalTrimRange(
        span.fromSample,
        span.toSample,
        cam.offsetMs
      );
      parts.push(
        `[${idx}:v]trim=start=${trim.start}:end=${trim.end},setpts=PTS-STARTPTS,` +
          `scale=${halfW}:${halfH}:force_original_aspect_ratio=decrease,` +
          `pad=${halfW}:${halfH}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
          `fps=${target.fps}[${cell}]`
      );
      gridLabels.push(`[${cell}]`);
    } else {
      parts.push(
        `color=black:s=${halfW}x${halfH}:r=${target.fps}:d=${durationSec},` +
          `setsar=1[${cell}]`
      );
      gridLabels.push(`[${cell}]`);
    }
  }

  parts.push(
    `${gridLabels.join("")}xstack=inputs=4:layout=0_0|${halfW}_0|0_${halfH}|${halfW}_${halfH}${spanLabel}`
  );
}

export function buildCamMixVideoFilter(
  plan: PlanSpan[],
  cams: Cam[],
  opts: { width: number; height: number; fps: number }
): { filter: string; inputOrder: string[] } {
  const inputOrder = collectInputCamIds(plan, cams);
  const inputIndexById = new Map(inputOrder.map((id, i) => [id, i]));
  const camById = new Map(cams.map((c) => [c.id, c]));
  const wideCam = physicalWideCam(cams);
  const parts: string[] = [];
  const spanLabels: string[] = [];

  plan.forEach((span, i) => {
    const spanLabel = `[seg${i}]`;
    spanLabels.push(spanLabel);

    if (span.shot === "wide") {
      if (wideCam) {
        const idx = inputIndexById.get(wideCam.id);
        if (idx === undefined) {
          throw new Error(`missing input for wide cam ${wideCam.id}`);
        }
        parts.push(
          buildCamTrimChain(
            idx,
            wideCam,
            span.fromSample,
            span.toSample,
            opts,
            spanLabel
          )
        );
      } else {
        buildSyntheticWideChain(
          span,
          cams,
          inputIndexById,
          opts,
          spanLabel,
          parts
        );
      }
      return;
    }

    const cam = camById.get(span.shot);
    if (!cam) {
      throw new Error(`unknown cam shot: ${span.shot}`);
    }
    const idx = inputIndexById.get(cam.id);
    if (idx === undefined) {
      throw new Error(`missing input for cam ${cam.id}`);
    }
    parts.push(
      buildCamTrimChain(
        idx,
        cam,
        span.fromSample,
        span.toSample,
        opts,
        spanLabel
      )
    );
  });

  const n = plan.length;
  const concatIn = spanLabels.join("");
  parts.push(`${concatIn}concat=n=${n}:v=1:a=0[vout]`);

  return { filter: parts.join(";"), inputOrder };
}

export function buildCamMixArgs(
  plan: PlanSpan[],
  cams: Cam[],
  opts: {
    out: string;
    programWav: string;
    width: number;
    height: number;
    fps: number;
  }
): string[] {
  const { filter, inputOrder } = buildCamMixVideoFilter(plan, cams, {
    width: opts.width,
    height: opts.height,
    fps: opts.fps,
  });
  const camById = new Map(cams.map((c) => [c.id, c]));

  const args: string[] = ["-y"];
  for (const id of inputOrder) {
    const cam = camById.get(id);
    if (!cam) {
      throw new Error(`unknown cam ${id}`);
    }
    args.push("-i", cam.source);
  }
  const wavInputIndex = inputOrder.length;
  args.push("-i", opts.programWav);

  args.push(
    "-filter_complex",
    filter,
    "-map",
    "[vout]",
    "-map",
    `${wavInputIndex}:a`,
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
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-y",
    opts.out
  );
  return args;
}

function formatClock(samples: number): string {
  const totalSec = Math.floor(samples / SAMPLE_RATE);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function planTimelineSummary(plan: PlanSpan[], cams: Cam[]): string {
  const nameById = new Map(cams.map((c) => [c.id, c.name]));
  return plan
    .map((span) => {
      const from = formatClock(span.fromSample);
      const to = formatClock(span.toSample);
      const label =
        span.shot === "wide" ? "Wide" : (nameById.get(span.shot) ?? span.shot);
      return `${from}-${to} ${label}`;
    })
    .join(" | ");
}

function projectDurationSamples(cams: Cam[]): number {
  let max = 0;
  for (const cam of cams) {
    const end = Math.round(
      (cam.offsetMs / 1000 + cam.durationSamples / SAMPLE_RATE) * SAMPLE_RATE
    );
    if (end > max) {
      max = end;
    }
  }
  return max;
}

function toActivityCam(slug: string, cam: Cam): ActivityCam {
  return {
    id: cam.id,
    role: cam.role,
    offsetMs: cam.offsetMs,
    audioPath: join(camDir(slug, cam.id), cam.audio),
  };
}

function wordsMatchTranscript(existing: Word[], fresh: Word[]): boolean {
  if (existing.length !== fresh.length) {
    return false;
  }
  for (let i = 0; i < fresh.length; i++) {
    if (existing[i]?.text !== fresh[i]?.text) {
      return false;
    }
  }
  return true;
}

// Re-mix word preservation: keep existing words (including deletions) only when
// word count and text sequence match the fresh transcript; otherwise replace.
function resolveWords(existing: Word[] | undefined, fresh: Word[]): Word[] {
  if (existing && wordsMatchTranscript(existing, fresh)) {
    return existing;
  }
  return fresh;
}

function resolveSettings(
  partial?: Partial<CamSwitchSettings>
): CamSwitchSettings {
  return CamSwitchSettingsSchema.parse(partial ?? {});
}

export async function camMix(
  slug: string,
  opts?: {
    mode?: "follow" | "auto";
    settings?: Partial<CamSwitchSettings>;
    masterMix?: string;
    plan?: PlanSpan[];
    agent?: string;
  }
): Promise<CamMixResult> {
  const mode = opts?.mode ?? "follow";
  const settings = resolveSettings(opts?.settings);
  let plannedBy = mode === "follow" ? "follow" : "rules";

  const cams = await listCams(slug);
  const speakers = speakerCams(cams);
  if (speakers.length < 2) {
    throw new Error(
      "cam mix requires at least 2 speaker cams (found " +
        String(speakers.length) +
        ")"
    );
  }

  const durationSamples = projectDurationSamples(cams);
  const firstSpeaker = speakers.at(0);
  if (!firstSpeaker) {
    throw new Error("cam mix requires at least 2 speaker cams (found 0)");
  }
  const target = {
    width: firstSpeaker.width,
    height: firstSpeaker.height,
    fps: firstSpeaker.fps,
  };

  const activityCams = cams.map((c) => toActivityCam(slug, c));
  const paths = projectPaths(slug);
  await mkdir(paths.working, { recursive: true });
  const { wav: programWav, pcm16k: programPcm } = await buildProgramAudio(
    slug,
    activityCams,
    { masterMix: opts?.masterMix }
  );

  const activities = await Promise.all(
    activityCams.map((c) => loadCamActivity(slug, c))
  );
  const spans = speakingSpans(activities, activityCams);

  await mkdir(paths.output, { recursive: true });

  const rawJson = join(paths.working, "transcript.raw.json");
  const freshWords = await transcribeToWords(programPcm, rawJson);
  const attributions = attributeWords(freshWords, activities, activityCams);

  const planCams = cams.map((c) => ({ id: c.id, role: c.role }));

  const followPlan = followSpeakerPlan(spans, {
    cams: planCams,
    durationSamples,
    settings,
  });

  const pcmBuf = await readFile(programPcm);
  const pcm = new Float32Array(
    pcmBuf.buffer,
    pcmBuf.byteOffset,
    pcmBuf.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  const silences = analyzeSilences(pcm);

  let rawPlan: PlanSpan[];
  if (opts?.plan) {
    rawPlan = opts.plan;
  } else if (mode === "follow") {
    rawPlan = followPlan;
  } else {
    const autoResult = await autoMixPlan(
      {
        attributions,
        cams: cams.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
        })),
        durationSamples,
        settings,
        silences,
        spans,
        words: freshWords,
      },
      { agent: opts?.agent }
    );
    rawPlan = autoResult.plan;
    plannedBy = autoResult.plannedBy;
  }

  const plan = validatePlan(rawPlan, {
    cams: planCams,
    durationSamples,
    settings,
    silences,
    fallback: followPlan,
  });

  const sourceOut = join(paths.dir, "source.mp4");
  await run(
    FFMPEG,
    buildCamMixArgs(plan, cams, {
      out: sourceOut,
      programWav,
      ...target,
    }),
    "ffmpeg(cam-mix-source)"
  );

  await buildProxy(sourceOut, paths.proxy);
  try {
    await extractAudio(sourceOut, paths.audioRaw);
  } catch {
    await rm(paths.audioRaw, { force: true });
  }
  // Sample frames for the agent layer (scene-log/analyze), mirroring ingest.
  await mkdir(paths.frames, { recursive: true });
  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      paths.proxy,
      "-vf",
      "fps=1/3",
      "-q:v",
      "4",
      `${paths.frames}/%04d.jpg`,
    ],
    "ffmpeg(frames)"
  ).catch((e: Error) => console.warn(`[cam-mix] frames skipped: ${e.message}`));
  await rm(join(paths.working, "audio-analysis.json"), { force: true });

  const meta = await probe(sourceOut);
  const renderedDurationSamples = Math.round(meta.durationSec * SAMPLE_RATE);

  let existingWords: Word[] | undefined;
  if (existsSync(paths.project)) {
    try {
      const existing = ProjectSchema.parse(
        JSON.parse(await readFile(paths.project, "utf8"))
      );
      existingWords = existing.words;
    } catch {
      existingWords = undefined;
    }
  }

  const attrByWordId = new Map(
    attributions.map((a) => [a.wordId, a.camId] as const)
  );
  const resolvedWords = resolveWords(existingWords, freshWords);
  const words = resolvedWords.map((w) => {
    const camId = attrByWordId.get(w.id);
    if (!camId) {
      return w;
    }
    return { ...w, speaker: camId };
  });

  const multicam: MulticamProvenance = {
    version: 1,
    mode,
    settings,
    plan,
    cams: cams.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      offsetMs: c.offsetMs,
      source: c.source,
    })),
    attributions,
    plannedBy,
    plannedAt: new Date().toISOString(),
    programAudio: { masterMix: opts?.masterMix ?? null },
  };

  const project: Project = ProjectSchema.parse({
    version: 1,
    slug,
    source: sourceOut,
    proxy: "working/proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: meta.fps,
    width: meta.width,
    height: meta.height,
    durationSamples: renderedDurationSamples,
    padMs: 50,
    template: defaultTemplateId(),
    captions: { enabled: true, maxWords: 6 },
    words,
    multicam,
  });

  await Bun.write(paths.project, JSON.stringify(project, null, 2));
  await Bun.write(paths.transcript, JSON.stringify({ words }, null, 2));

  return {
    slug,
    plan,
    mode,
    sourcePath: sourceOut,
    attributions,
  };
}
