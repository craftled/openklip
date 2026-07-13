import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzeSilences } from "./audio-analysis.ts";
import {
  type ActivityCam,
  buildProgramAudio,
  loadCamActivity,
  speakingSpans,
} from "./cam-activity.ts";
import { autoMixPlan } from "./cam-automix.ts";
import {
  type CamMixResult,
  camMix,
  type MulticamProvenance,
  MulticamProvenanceSchema,
} from "./cam-mix.ts";
import {
  applyOverrides,
  type CamSwitchSettings,
  CamSwitchSettingsSchema,
  followSpeakerPlan,
  type PlanSpan,
  validatePlan,
} from "./cam-plan.ts";
import type { Cam } from "./cams.ts";
import { listCams } from "./cams.ts";
import { SAMPLE_RATE } from "./edl.ts";
import { camDir } from "./paths.ts";
import { loadProject } from "./projectStore.ts";

function secToSamples(sec: number): number {
  return Math.round(sec * SAMPLE_RATE);
}

function toActivityCam(slug: string, cam: Cam): ActivityCam {
  return {
    id: cam.id,
    role: cam.role,
    offsetMs: cam.offsetMs,
    audioPath: join(camDir(slug, cam.id), cam.audio),
  };
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

function resolveSettings(
  base: CamSwitchSettings,
  partial?: Partial<CamSwitchSettings>
): CamSwitchSettings {
  return CamSwitchSettingsSchema.parse({ ...base, ...partial });
}

async function loadMulticamProvenance(
  slug: string
): Promise<MulticamProvenance> {
  const project = await loadProject(slug);
  const raw = (project as Record<string, unknown>).multicam;
  if (raw === undefined || raw === null) {
    throw new Error(
      `no multicam mix on project "${slug}"; run openklip cam-mix first`
    );
  }
  return MulticamProvenanceSchema.parse(raw);
}

async function replanWithLocks(
  slug: string,
  opts: {
    mode: "follow" | "auto";
    settings: CamSwitchSettings;
    locked: PlanSpan[];
    masterMix?: string;
    agent?: string;
    cams: Cam[];
    provenance: MulticamProvenance;
  }
): Promise<PlanSpan[]> {
  const activityCams = opts.cams.map((c) => toActivityCam(slug, c));
  const { pcm16k: programPcm } = await buildProgramAudio(slug, activityCams, {
    masterMix: opts.masterMix,
  });

  const activities = await Promise.all(
    activityCams.map((c) => loadCamActivity(slug, c))
  );
  const spans = speakingSpans(activities, activityCams);
  const durationSamples = projectDurationSamples(opts.cams);
  const planCams = opts.cams.map((c) => ({ id: c.id, role: c.role }));

  const pcmBuf = await readFile(programPcm);
  const pcm = new Float32Array(
    pcmBuf.buffer,
    pcmBuf.byteOffset,
    pcmBuf.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  const silences = analyzeSilences(pcm);

  const followPlan = followSpeakerPlan(spans, {
    cams: planCams,
    durationSamples,
    settings: opts.settings,
  });

  let rawPlan: PlanSpan[];
  if (opts.mode === "follow") {
    rawPlan = followPlan;
  } else {
    const project = await loadProject(slug);
    const autoResult = await autoMixPlan(
      {
        attributions: opts.provenance.attributions,
        cams: opts.cams.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
        })),
        durationSamples,
        settings: opts.settings,
        silences,
        spans,
        words: project.words,
      },
      { agent: opts.agent }
    );
    rawPlan = autoResult.plan;
  }

  return validatePlan(rawPlan, {
    cams: planCams,
    durationSamples,
    settings: opts.settings,
    silences,
    locked: opts.locked,
    fallback: followPlan,
  });
}

export interface CamRemixResolved {
  agent?: string;
  masterMix?: string;
  mode: "follow" | "auto";
  plan: PlanSpan[];
  settings: CamSwitchSettings;
}

export async function resolveCamRemixPlan(
  slug: string,
  opts?: {
    overrides?: Array<{ fromSec: number; toSec: number; shot: string }>;
    mode?: "follow" | "auto";
    settings?: Partial<CamSwitchSettings>;
    agent?: string;
  }
): Promise<CamRemixResolved> {
  const provenance = await loadMulticamProvenance(slug);
  const cams = await listCams(slug);
  const mode = opts?.mode ?? provenance.mode;
  const settings = resolveSettings(provenance.settings, opts?.settings);
  const masterMix = provenance.programAudio.masterMix ?? undefined;

  let plan = [...provenance.plan];

  if (opts?.overrides && opts.overrides.length > 0) {
    // Fail fast on impossible overrides instead of silently dropping them in
    // the validator (inverted span) or dying at ffmpeg (unknown shot).
    const validShots = new Set([...cams.map((c) => c.id), "wide"]);
    for (const o of opts.overrides) {
      if (!(o.toSec > o.fromSec)) {
        throw new Error(
          `bad override span ${o.fromSec}-${o.toSec} (toSec must be greater than fromSec)`
        );
      }
      if (!validShots.has(o.shot)) {
        throw new Error(
          `unknown shot "${o.shot}" (use one of: ${[...validShots].join(", ")})`
        );
      }
    }
    const overrideSpans: PlanSpan[] = opts.overrides.map((o) => ({
      fromSample: secToSamples(o.fromSec),
      toSample: secToSamples(o.toSec),
      shot: o.shot,
    }));
    plan = applyOverrides(plan, overrideSpans);
  }

  const locked = plan.filter((s) => s.locked);
  const modeChanged = opts?.mode !== undefined && opts.mode !== provenance.mode;
  const settingsChanged =
    opts?.settings !== undefined && Object.keys(opts.settings).length > 0;

  if (modeChanged || settingsChanged) {
    plan = await replanWithLocks(slug, {
      mode,
      settings,
      locked,
      masterMix,
      agent: opts?.agent,
      cams,
      provenance,
    });
  }

  return {
    plan,
    mode,
    settings,
    masterMix,
    agent: opts?.agent,
  };
}

export async function camRemix(
  slug: string,
  opts?: {
    overrides?: Array<{ fromSec: number; toSec: number; shot: string }>;
    mode?: "follow" | "auto";
    settings?: Partial<CamSwitchSettings>;
    agent?: string;
    masterMix?: string;
  }
): Promise<CamMixResult> {
  const resolved = await resolveCamRemixPlan(slug, opts);
  return camMix(slug, {
    plan: resolved.plan,
    mode: resolved.mode,
    settings: resolved.settings,
    masterMix: opts?.masterMix ?? resolved.masterMix,
    agent: resolved.agent,
  });
}

/** True when the project exists and carries a multicam provenance block. */
export async function hasMulticamProvenance(slug: string): Promise<boolean> {
  const project = await loadProject(slug).catch(() => null);
  return Boolean((project as Record<string, unknown> | null)?.multicam);
}

// Every re-mix surface (CLI cam-mix, MCP cam_mix, GUI re-mix) must preserve
// locked plan spans. Route through camRemix whenever provenance exists; only
// the very first mix of a project plans from scratch.
export async function camMixOrRemix(
  slug: string,
  opts?: {
    mode?: "follow" | "auto";
    settings?: Partial<CamSwitchSettings>;
    masterMix?: string;
    agent?: string;
  }
): Promise<CamMixResult> {
  if (await hasMulticamProvenance(slug)) {
    return camRemix(slug, opts);
  }
  return camMix(slug, opts);
}
