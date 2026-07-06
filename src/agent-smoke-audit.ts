// Deterministic agent-loop smoke audit: bootstrap a tiny fixture project,
// apply brief-driven cleanup, export, and verify export health. No LLM.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addTitle, cutWords } from "./actions.ts";
import { loadBrief, saveBrief } from "./brief.ts";
import { buildCleanupReport, partitionSafeCandidates } from "./cleanup.ts";
import { runDoctor } from "./doctor.ts";
import { type Project, ProjectSchema, SAMPLE_RATE, type Word } from "./edl.ts";
import { exportCut } from "./exporter.ts";
import { FFMPEG, probe, run } from "./ffmpeg.ts";
import { projectPaths, projectsRoot } from "./paths.ts";
import { auditProjectForShip } from "./project-brief-audit.ts";
import { loadProject, mutateProject } from "./projectStore.ts";
import { revertProject } from "./revert.ts";
import { summarize } from "./summary.ts";
import { verifyCut } from "./verify.ts";

export const SMOKE_SLUG = "agent-smoke-fixture";
export const REAL_SMOKE_SLUG = "edgaras-raw";

export interface SmokeAuditStep {
  detail: string;
  name: string;
  ok: boolean;
}

export interface SmokeAuditResult {
  ok: boolean;
  slug: string;
  steps: SmokeAuditStep[];
}

const SMOKE_BRIEF = `Goal: Agent loop smoke audit fixture.

Always cut: um.
Never cut: OpenKlip demo.
`;

const samples = (n: number) => Math.round(n * SAMPLE_RATE);

function word(
  id: string,
  text: string,
  startSec: number,
  endSec: number
): Word {
  return {
    id,
    text,
    startSample: samples(startSec),
    endSample: samples(endSec),
    deleted: false,
  };
}

function smokeProject(sourcePath: string): Project {
  return ProjectSchema.parse({
    version: 1,
    slug: SMOKE_SLUG,
    source: sourcePath,
    proxy: "working/proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 320,
    height: 240,
    durationSamples: samples(4),
    padMs: 0,
    captions: { enabled: false, maxWords: 6, style: "boxed" },
    assets: [],
    broll: [],
    look: {
      vignette: false,
      filter: "none",
      transition: { type: "none", durationMs: 500 },
    },
    zooms: [],
    titles: [],
    stills: [],
    graphics: [],
    music: [],
    words: [
      word("w0", "Welcome", 0, 0.8),
      word("w1", "um", 0.8, 1.6),
      word("w2", "to", 1.6, 2.4),
      word("w3", "OpenKlip", 2.4, 3.2),
      word("w4", "demo", 3.2, 4),
    ],
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
    },
  });
}

async function renderSmokeClip(
  sourceAbs: string,
  proxyAbs: string
): Promise<void> {
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=4:size=320x240:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=4",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    sourceAbs,
  ];
  await run(FFMPEG, args, "ffmpeg(smoke-fixture)");
  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      sourceAbs,
      "-vf",
      "scale=320:240",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-an",
      proxyAbs,
    ],
    "ffmpeg(smoke-proxy)"
  );
}

export async function bootstrapSmokeFixture(
  projectsRoot: string
): Promise<string> {
  if (!existsSync(FFMPEG)) {
    throw new Error("ffmpeg binary unavailable for smoke audit");
  }
  const slug = SMOKE_SLUG;
  const dir = join(projectsRoot, slug);
  mkdirSync(join(dir, "working"), { recursive: true });
  mkdirSync(join(dir, "output"), { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  const paths = projectPaths(slug);
  const sourceAbs = join(dir, "source.mp4");
  const proxyAbs = join(dir, "working", "proxy.mp4");
  await renderSmokeClip(sourceAbs, proxyAbs);
  writeFileSync(
    paths.project,
    JSON.stringify(smokeProject(sourceAbs), null, 2)
  );
  await saveBrief(slug, SMOKE_BRIEF);
  return slug;
}

export async function verifyExportStructural(
  slug: string,
  expectedSec: number,
  toleranceSec = 1.5
): Promise<SmokeAuditStep> {
  const out = projectPaths(slug).out;
  if (!existsSync(out)) {
    return {
      name: "export-structural",
      ok: false,
      detail: "output/out.mp4 missing",
    };
  }
  const probed = await probe(out);
  const delta = Math.abs(probed.durationSec - expectedSec);
  return {
    name: "export-structural",
    ok: delta <= toleranceSec && probed.durationSec > 0,
    detail: `export ${probed.durationSec.toFixed(2)}s vs kept ${expectedSec.toFixed(2)}s (delta ${delta.toFixed(2)}s)`,
  };
}

export async function runAgentSmokeAudit(input?: {
  fullVerify?: boolean;
  projectsRoot?: string;
}): Promise<SmokeAuditResult> {
  const steps: SmokeAuditStep[] = [];
  const tempRoot =
    input?.projectsRoot ?? mkdtempSync(join(tmpdir(), "openklip-smoke-"));
  const ownedRoot = input?.projectsRoot === undefined;
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = tempRoot;

  try {
    const slug = await bootstrapSmokeFixture(tempRoot);

    const doctor = await runDoctor(slug);
    steps.push({
      name: "doctor",
      ok: doctor.ok,
      detail: doctor.ok
        ? "environment ok"
        : doctor.checks
            .filter((c) => c.status === "fail")
            .map((c) => c.name)
            .join(", ") || "doctor failed",
    });
    if (!doctor.ok) {
      return { ok: false, slug, steps };
    }

    const briefText = (await loadBrief(slug)) ?? "";
    const projectBefore = await loadProject(slug);
    const report = buildCleanupReport({
      project: projectBefore,
      silences: null,
      briefText,
    });
    const { fillerIds } = partitionSafeCandidates(report.candidates);
    const umCut = fillerIds.includes("w1");
    steps.push({
      name: "cleanup-report",
      ok: umCut,
      detail: umCut
        ? `safe filler ids include w1 (${fillerIds.length} total)`
        : `expected w1 in safe filler ids, got: ${fillerIds.join(", ") || "(none)"}`,
    });
    if (!umCut) {
      return { ok: false, slug, steps };
    }

    await mutateProject(
      slug,
      (project) => {
        cutWords(project, fillerIds, true);
        return { ids: fillerIds };
      },
      { action: "cut", actor: "cli", input: { ids: fillerIds, deleted: true } }
    );

    const projectAfter = await loadProject(slug);
    const umDeleted = projectAfter.words.find((w) => w.id === "w1")?.deleted;
    const demoKept = projectAfter.words
      .filter((w) => !w.deleted)
      .map((w) => w.text)
      .join(" ")
      .toLowerCase()
      .includes("openklip demo");
    steps.push({
      name: "brief-phrases",
      ok: umDeleted === true && demoKept,
      detail: "always-cut removed um; never-cut kept OpenKlip demo",
    });
    if (!(umDeleted && demoKept)) {
      return { ok: false, slug, steps };
    }

    const exportResult = await exportCut(slug, {
      compression: "web",
      fps: 30,
    });
    steps.push({
      name: "export",
      ok: existsSync(exportResult.out),
      detail: `exported ${exportResult.durationSec.toFixed(2)}s to ${exportResult.out}`,
    });

    const keptSec = summarize(projectAfter).keptDurationSec;
    steps.push(await verifyExportStructural(slug, keptSec));

    if (input?.fullVerify) {
      try {
        const verify = await verifyCut(slug);
        steps.push({
          name: "verify-whisper",
          ok: verify.ok,
          detail: verify.ok
            ? "whisper verify passed"
            : `whisper verify drift (${verify.fillerSurvivors.join(", ")})`,
        });
      } catch (error) {
        steps.push({
          name: "verify-whisper",
          ok: false,
          detail: (error as Error).message,
        });
      }
    }

    const ok = steps.every((step) => step.ok);
    return { ok, slug, steps };
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    if (ownedRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

/**
 * Deterministic revise-draft loop on the lavfi fixture: cut filler, add a
 * title overlay, revert the title, confirm the cut survived.
 */
export async function runReviseDraftSmokeAudit(input?: {
  projectsRoot?: string;
}): Promise<SmokeAuditResult> {
  const steps: SmokeAuditStep[] = [];
  const tempRoot =
    input?.projectsRoot ?? mkdtempSync(join(tmpdir(), "openklip-revise-"));
  const ownedRoot = input?.projectsRoot === undefined;
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = tempRoot;

  try {
    const slug = await bootstrapSmokeFixture(tempRoot);
    const briefText = (await loadBrief(slug)) ?? "";
    const projectBefore = await loadProject(slug);
    const report = buildCleanupReport({
      project: projectBefore,
      silences: null,
      briefText,
    });
    const { fillerIds } = partitionSafeCandidates(report.candidates);

    await mutateProject(
      slug,
      (project) => {
        cutWords(project, fillerIds, true);
        return { ids: fillerIds };
      },
      { action: "cut", actor: "cli", input: { ids: fillerIds, deleted: true } }
    );

    await mutateProject(
      slug,
      (project) => {
        const title = addTitle(project, {
          fromSec: 0,
          toSec: 2,
          text: "Revise draft smoke",
          position: "lower",
        });
        return { titleId: title.id };
      },
      {
        action: "title-add",
        actor: "cli",
        input: { fromSec: 0, toSec: 2, text: "Revise draft smoke" },
      }
    );

    const withTitle = await loadProject(slug);
    const titleAdded = (withTitle.titles?.length ?? 0) === 1;
    steps.push({
      name: "targeted-edit",
      ok: titleAdded,
      detail: titleAdded
        ? "title overlay added after filler cut"
        : "expected one title overlay",
    });
    if (!titleAdded) {
      return { ok: false, slug, steps };
    }

    await revertProject(slug, { last: true }, { actor: "cli" });

    const afterRevert = await loadProject(slug);
    const titleRemoved = (afterRevert.titles?.length ?? 0) === 0;
    const umStillCut =
      afterRevert.words.find((word) => word.id === "w1")?.deleted === true;
    steps.push({
      name: "revert-last",
      ok: titleRemoved && umStillCut,
      detail: "revert removed the title but kept the earlier filler cut",
    });

    const ok = steps.every((step) => step.ok);
    return { ok, slug, steps };
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    if (ownedRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

/** Return a real smoke slug when its project.json exists under projectsRoot(). */
export function resolveRealSmokeSlug(root?: string): string | null {
  const slug = REAL_SMOKE_SLUG;
  const projectFile = join(root ?? projectsRoot(), slug, "project.json");
  return existsSync(projectFile) ? slug : null;
}

/**
 * Read-only-plus-export audit on a live fixture project (default edgaras-raw).
 * Does not mutate words or overlays; re-exports the current edit.
 */
export async function runRealFixtureSmokeAudit(input?: {
  fullVerify?: boolean;
  slug?: string;
}): Promise<SmokeAuditResult | null> {
  const slug = input?.slug ?? resolveRealSmokeSlug();
  if (!slug) {
    return null;
  }

  const steps: SmokeAuditStep[] = [];

  const doctor = await runDoctor(slug);
  steps.push({
    name: "doctor",
    ok: doctor.ok,
    detail: doctor.ok
      ? "environment ok"
      : doctor.checks
          .filter((c) => c.status === "fail")
          .map((c) => c.name)
          .join(", ") || "doctor failed",
  });
  if (!doctor.ok) {
    return { ok: false, slug, steps };
  }

  const project = await loadProject(slug);
  const summary = summarize(project);
  steps.push({
    name: "status",
    ok: summary.kept > 0 && summary.keptDurationSec > 0,
    detail: `${summary.kept} kept words, ${summary.keptDurationSec.toFixed(1)}s runtime`,
  });
  if (summary.kept === 0) {
    return { ok: false, slug, steps };
  }

  const briefPath = projectPaths(slug).brief;
  if (existsSync(briefPath)) {
    const briefText = await readFile(briefPath, "utf8");
    const briefAudit = auditProjectForShip({ briefText, project });
    steps.push({
      name: "brief-audit",
      ok: briefAudit.ok,
      detail: briefAudit.ok
        ? "brief ship audit passed"
        : briefAudit.issues.join("; ") || "brief ship audit failed",
    });
    if (!briefAudit.ok) {
      return { ok: false, slug, steps };
    }

    const report = buildCleanupReport({
      project,
      silences: null,
      briefText,
    });
    steps.push({
      name: "cleanup-report",
      ok: report.candidates.length >= 0,
      detail: `${report.candidates.length} cleanup candidates (${report.candidates.filter((c) => c.risk === "safe").length} safe)`,
    });
  } else {
    steps.push({
      name: "brief-audit",
      ok: true,
      detail: "no brief.md (skipped)",
    });
  }

  const exportResult = await exportCut(slug, { compression: "social" });
  steps.push({
    name: "export",
    ok: existsSync(exportResult.out),
    detail: `exported ${exportResult.durationSec.toFixed(2)}s to ${exportResult.out}`,
  });

  steps.push(await verifyExportStructural(slug, summary.keptDurationSec, 3));

  if (input?.fullVerify) {
    try {
      const verify = await verifyCut(slug);
      steps.push({
        name: "verify-whisper",
        ok: verify.ok,
        detail: verify.ok
          ? "whisper verify passed"
          : `whisper verify drift (${verify.fillerSurvivors.join(", ")})`,
      });
    } catch (error) {
      steps.push({
        name: "verify-whisper",
        ok: false,
        detail: (error as Error).message,
      });
    }
  }

  const ok = steps.every((step) => step.ok);
  return { ok, slug, steps };
}
