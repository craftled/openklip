// Deterministic cam CLI/engine devex smoke: lavfi twin-cam mix + override.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateMulticamFixture,
  runMulticamAcceptanceProgram,
} from "../scripts/generate-multicam-fixture.ts";
import { camRemix } from "./cam-remix.ts";
import { FFMPEG } from "./ffmpeg.ts";

export interface CamDevexSmokeStep {
  detail: string;
  name: string;
  ok: boolean;
}

export interface CamDevexSmokeResult {
  ok: boolean;
  steps: CamDevexSmokeStep[];
}

export async function runCamDevexSmoke(): Promise<CamDevexSmokeResult> {
  const steps: CamDevexSmokeStep[] = [];

  if (typeof FFMPEG !== "string") {
    steps.push({
      name: "ffmpeg",
      ok: false,
      detail: "ffmpeg binary unavailable",
    });
    return { ok: false, steps };
  }

  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  const tempRoot = mkdtempSync(join(tmpdir(), "openklip-cam-devex-"));
  process.env.OPENKLIP_PROJECTS_ROOT = tempRoot;

  try {
    const fixtureDir = join(tempRoot, "fixture-media");
    const files = await generateMulticamFixture({
      outDir: fixtureDir,
      durationSec: 8,
      segments: 4,
    });
    const slug = "cam-devex-smoke";
    const acceptance = await runMulticamAcceptanceProgram({
      slug,
      files,
      force: true,
    });
    steps.push({
      name: "cam-mix",
      ok:
        acceptance.planSpanCount >= 2 &&
        acceptance.shots.includes("a") &&
        acceptance.shots.includes("b"),
      detail: `planSpans=${acceptance.planSpanCount} duration=${acceptance.durationSec.toFixed(2)}s`,
    });

    const override = await camRemix(slug, {
      overrides: [{ fromSec: 0.5, toSec: 1.5, shot: "a" }],
    });
    const locked = override.plan.some((span) => span.locked);
    steps.push({
      name: "cam-override",
      ok: locked,
      detail: locked
        ? `locked spans=${override.plan.filter((s) => s.locked).length}`
        : "no locked span after override",
    });

    const ok = steps.every((step) => step.ok);
    return { ok, steps };
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
