"use client";

import type { SilenceSpan } from "@engine/audio-analysis-core";
import {
  type CleanupCandidate,
  type CleanupReport,
  cleanupReport,
  fillerOnlyCleanupReport,
} from "@engine/cleanup";
import type { Project } from "@engine/edl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle, Scissors } from "@/lib/icon";

const MAX_ROWS = 200;

// M1: buildCleanupCandidates delegates to the shared src/cleanup.ts fallback
// (fillerOnlyCleanupReport) that also backs src/agent-tools.ts's
// cleanup_report tool and src/cli.ts's `openklip cleanup`, previously three
// independent copies. cleanup.ts stays node-free (pure), so it's safe to
// import from this client component. Mirrors cleanupReport (src/cleanup.ts),
// but degrades gracefully to filler-only when silences haven't been computed
// yet for this project (no working/audio16k.f32, or this page hasn't loaded
// the analysis): dead-air detection needs the VAD silence spans
// loadAudioAnalysis produces, filler detection does not.
export function buildCleanupCandidates(
  project: Project,
  silences: SilenceSpan[] | null | undefined
): CleanupReport {
  return silences
    ? cleanupReport(project, silences)
    : fillerOnlyCleanupReport(project);
}

// m:ss timecode, matching web/components/transcript-search.tsx's
// formatMatchTimecode.
function fmtTimecode(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function kindLabel(kind: CleanupCandidate["kind"]): string {
  return kind === "filler" ? "Filler" : "Dead air";
}

// D1: Title-case both risk labels via one helper (was the raw lowercase
// "safe"/"review" risk value).
function riskLabel(risk: CleanupCandidate["risk"]): string {
  return risk === "safe" ? "Safe" : "Review";
}

function CleanupRow({
  applying,
  candidate,
  onApply,
}: {
  applying: boolean;
  candidate: CleanupCandidate;
  onApply: (candidate: CleanupCandidate) => void;
}) {
  return (
    <li
      className="flex items-start gap-2 rounded-md border bg-background/50 px-2 py-1.5"
      data-cleanup-row
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={candidate.kind === "filler" ? "outline" : "secondary"}
          >
            {kindLabel(candidate.kind)}
          </Badge>
          <Badge
            variant={candidate.risk === "review" ? "secondary" : "outline"}
          >
            {riskLabel(candidate.risk)}
          </Badge>
          <span className="text-muted-foreground text-xs tabular-nums">
            {fmtTimecode(candidate.startSec)}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            ~{candidate.estSavedSec.toFixed(1)}s
          </span>
        </div>
        {candidate.text ? (
          <span className="truncate text-xs">"{candidate.text}"</span>
        ) : null}
        <span className="truncate text-muted-foreground text-xs">
          {candidate.reason}
        </span>
      </div>
      <Button
        aria-label={`Apply cleanup for ${kindLabel(candidate.kind).toLowerCase()} at ${fmtTimecode(candidate.startSec)}`}
        data-cleanup-apply
        disabled={applying}
        onClick={() => onApply(candidate)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Scissors />
      </Button>
    </li>
  );
}

export interface CleanupPanelProps {
  applying?: boolean;
  onApply: (candidate: CleanupCandidate) => void;
  onApplyAllSafe: () => void;
  report: CleanupReport;
}

// Presentational cleanup review list for the Config panel: filler-word and
// dead-air candidates with counts, a batch "apply all safe" action, and a
// per-row apply button. All state and behavior live in the caller (app.tsx),
// matching the transcript-search.tsx / music-controls.tsx split.
export function CleanupPanel({
  applying = false,
  onApply,
  onApplyAllSafe,
  report,
}: CleanupPanelProps) {
  const safeCandidates = report.candidates.filter((c) => c.risk === "safe");
  const safeSavedSec = safeCandidates.reduce(
    (sum, c) => sum + c.estSavedSec,
    0
  );
  const rows = report.candidates.slice(0, MAX_ROWS);
  const hiddenCount = report.candidates.length - rows.length;

  return (
    <div className="flex flex-col gap-2" data-cleanup-panel>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5" data-cleanup-count>
          <Badge variant="secondary">
            {plural(report.fillerCount, "filler", "fillers")}
          </Badge>
          <Badge variant="secondary">
            {plural(report.deadAirCount, "dead-air gap", "dead-air gaps")}
          </Badge>
        </div>
        <Button
          data-cleanup-apply-safe
          disabled={safeCandidates.length === 0 || applying}
          onClick={onApplyAllSafe}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Scissors data-icon="inline-start" />
          Apply all safe ({safeCandidates.length}, saves ~
          {safeSavedSec.toFixed(1)}s)
        </Button>
      </div>

      {report.warnings.length > 0 ? (
        <ul className="flex flex-col gap-0.5" data-cleanup-warnings>
          {report.warnings.map((warning) => (
            <li
              className="flex items-start gap-1.5 text-muted-foreground text-xs"
              key={warning}
            >
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {report.candidates.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nothing to clean up.</p>
      ) : (
        <>
          <ul
            className="flex max-h-40 flex-col gap-1 overflow-y-auto"
            data-cleanup-list
          >
            {rows.map((candidate) => (
              <CleanupRow
                applying={applying}
                candidate={candidate}
                key={candidate.id}
                onApply={onApply}
              />
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <p className="text-muted-foreground text-xs">{hiddenCount} more</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
