import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type TransitionExportPreview,
  transitionExportPreview,
} from "./cut-transition-gate.ts";
import {
  effectiveRanges,
  type Graphic,
  type PhraseAnchor,
  type Project,
} from "./edl.ts";
import {
  isJsonRenderCatalogId,
  type JsonRenderCatalogId,
  validateJsonRenderSpec,
} from "./json-render-catalogs.ts";
import { projectPaths } from "./paths.ts";
import { listFrameSamples } from "./scene-log.ts";
import type { VerifyReport } from "./verify.ts";

export interface VerificationMissingAsset {
  id: string;
  reason: "missing-registration" | "missing-file";
  referencedBy: string[];
}

export interface VerificationStaleAnchor {
  kind: "broll" | "still" | "zoom" | "title" | "graphic";
  overlayId: string;
  phrase: string;
}

export interface VerificationInvalidGraphic {
  id: string;
  issues: string[];
}

export interface VerificationFrameSample {
  atSec: number;
  name: string;
  url: string;
}

export interface ExportVerificationReport {
  checks: {
    frameSamples: VerificationFrameSample[];
    invalidGraphics: VerificationInvalidGraphic[];
    missingAssets: VerificationMissingAsset[];
    staleAnchors: VerificationStaleAnchor[];
    transition: TransitionExportPreview;
  };
  ok: boolean;
  transcript?: VerifyReport;
  warnings: string[];
}

interface BuildExportVerificationReportOptions {
  slug: string;
  transcript?: VerifyReport;
}

function assetPathExists(slug: string, src: string, proxy: string): boolean {
  const p = projectPaths(slug);
  return existsSync(src) || existsSync(join(p.dir, proxy));
}

function appendAssetRef(
  refs: Map<string, string[]>,
  assetId: string,
  ref: string
): void {
  const existing = refs.get(assetId) ?? [];
  existing.push(ref);
  refs.set(assetId, existing);
}

function missingAssetChecks(
  project: Project,
  slug: string
): VerificationMissingAsset[] {
  const refs = new Map<string, string[]>();
  for (const item of project.broll ?? []) {
    appendAssetRef(refs, item.assetId, `broll:${item.id}`);
  }
  for (const item of project.stills ?? []) {
    appendAssetRef(refs, item.assetId, `still:${item.id}`);
  }
  for (const item of project.music ?? []) {
    appendAssetRef(refs, item.assetId, `music:${item.id}`);
  }

  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const missing: VerificationMissingAsset[] = [];
  for (const [assetId, referencedBy] of refs) {
    const asset = assets.get(assetId);
    if (!asset) {
      missing.push({
        id: assetId,
        referencedBy,
        reason: "missing-registration",
      });
      continue;
    }
    if (!assetPathExists(slug, asset.src, asset.proxy)) {
      missing.push({ id: assetId, referencedBy, reason: "missing-file" });
    }
  }
  return missing;
}

function staleAnchorChecks(project: Project): VerificationStaleAnchor[] {
  const stale: VerificationStaleAnchor[] = [];
  const add = (
    kind: VerificationStaleAnchor["kind"],
    overlayId: string,
    anchor?: PhraseAnchor
  ) => {
    if (anchor?.stale) {
      stale.push({ kind, overlayId, phrase: anchor.phrase });
    }
  };
  for (const item of project.broll ?? []) {
    add("broll", item.id, item.anchor);
  }
  for (const item of project.stills ?? []) {
    add("still", item.id, item.anchor);
  }
  for (const item of project.zooms ?? []) {
    add("zoom", item.id, item.anchor);
  }
  for (const item of project.titles ?? []) {
    add("title", item.id, item.anchor);
  }
  for (const item of project.graphics ?? []) {
    add("graphic", item.id, item.anchor);
  }
  return stale;
}

function invalidGraphicChecks(project: Project): VerificationInvalidGraphic[] {
  const invalid: VerificationInvalidGraphic[] = [];
  for (const graphic of project.graphics ?? []) {
    const issues = invalidGraphicIssues(graphic);
    if (issues.length > 0) {
      invalid.push({ id: graphic.id, issues });
    }
  }
  return invalid;
}

function invalidGraphicIssues(graphic: Graphic): string[] {
  if (graphic.type !== "json-render") {
    return [];
  }
  if (!(graphic.catalog && isJsonRenderCatalogId(graphic.catalog))) {
    return [`unknown json-render catalog: ${String(graphic.catalog)}`];
  }
  const validation = validateJsonRenderSpec(
    graphic.catalog as JsonRenderCatalogId,
    graphic.spec
  );
  return validation.success ? [] : validation.issues;
}

function frameSamples(slug: string): VerificationFrameSample[] {
  return listFrameSamples(slug, 8).map((frame) => {
    const name = frame.path.split("/").at(-1) ?? frame.path;
    return {
      name,
      atSec: frame.atSec,
      url: `/media/frames/${name}?slug=${encodeURIComponent(slug)}`,
    };
  });
}

function warningsFor(report: Omit<ExportVerificationReport, "warnings">) {
  const warnings: string[] = [];
  if (report.transcript && !report.transcript.ok) {
    warnings.push("transcript drift detected");
  }
  if (report.checks.missingAssets.length > 0) {
    warnings.push(`${report.checks.missingAssets.length} missing asset(s)`);
  }
  if (report.checks.staleAnchors.length > 0) {
    warnings.push(`${report.checks.staleAnchors.length} stale anchor(s)`);
  }
  if (report.checks.invalidGraphics.length > 0) {
    warnings.push(`${report.checks.invalidGraphics.length} invalid graphic(s)`);
  }
  const transition = report.checks.transition;
  if (transition.type !== "none" && !transition.wouldApply) {
    warnings.push(
      `transition fallback: ${transition.fallbackReason ?? "not supported"}`
    );
  }
  return warnings;
}

export function buildExportVerificationReport(
  project: Project,
  opts: BuildExportVerificationReportOptions
): ExportVerificationReport {
  const ranges = effectiveRanges(project);
  const base = {
    transcript: opts.transcript,
    checks: {
      missingAssets: missingAssetChecks(project, opts.slug),
      staleAnchors: staleAnchorChecks(project),
      invalidGraphics: invalidGraphicChecks(project),
      transition: transitionExportPreview(project, ranges),
      frameSamples: frameSamples(opts.slug),
    },
    ok: true,
  };
  const warnings = warningsFor(base);
  return {
    ...base,
    warnings,
    ok: warnings.length === 0,
  };
}
