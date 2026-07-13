"use client";

import type { CleanupCandidate, CleanupReport } from "@engine/cleanup";
import { useMemo } from "react";
import { CleanupSilenceWaveform } from "@/components/cleanup-silence-waveform";
import { ElasticSlider } from "@/components/elastic-slider";
import { Button } from "@/components/ui/button";
import {
  type CleanupPeaksResponse,
  useCleanupPeaks,
} from "@/hooks/use-cleanup-tab-data";
import {
  deadAirCandidatesFromReport,
  deadAirSavedSec,
  formatSilenceThresholdSubtitle,
  peakWindowForCandidate,
} from "@/lib/cleanup-silence";

function ThresholdSlider({
  disabled,
  field,
  formatValue,
  label,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  disabled?: boolean;
  field: "keepPadSec" | "minSec";
  formatValue: (value: number) => string;
  label: string;
  max: number;
  min: number;
  onCommit: (field: "keepPadSec" | "minSec", value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <ElasticSlider
      aria-label={label}
      data-cleanup-threshold={field}
      disabled={disabled}
      formatValue={formatValue}
      label={label}
      max={max}
      min={min}
      onValueCommit={(nextValue) => onCommit(field, nextValue)}
      step={step}
      value={value}
    />
  );
}

export interface CleanupSilenceCardProps {
  applying?: boolean;
  onApplyAllSilences: () => void;
  onPatchThreshold: (field: "keepPadSec" | "minSec", value: number) => void;
  peaksOverride?: CleanupPeaksResponse | null;
  report: CleanupReport;
  selectedCandidate: CleanupCandidate | null;
  slug: string;
}

export function CleanupSilenceCard({
  applying = false,
  onApplyAllSilences,
  onPatchThreshold,
  peaksOverride,
  report,
  selectedCandidate,
  slug,
}: CleanupSilenceCardProps) {
  const deadAirCandidates = useMemo(
    () => deadAirCandidatesFromReport(report.candidates),
    [report.candidates]
  );
  const savedSec = deadAirSavedSec(report.candidates);
  const peakWindow = useMemo(
    () =>
      selectedCandidate ? peakWindowForCandidate(selectedCandidate) : null,
    [selectedCandidate]
  );
  const { peaks: fetchedPeaks } = useCleanupPeaks({ slug, window: peakWindow });
  const peaks = peaksOverride ?? fetchedPeaks;

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border bg-background/50 p-2"
      data-cleanup-selected-dead-air-id={selectedCandidate?.id}
      data-cleanup-silence-card
    >
      <div className="flex flex-col gap-0.5">
        <h4 className="font-medium text-xs">Remove silence</h4>
        <p className="text-muted-foreground text-xs">
          {formatSilenceThresholdSubtitle(
            report.config.minSec,
            report.config.keepPadSec
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <ThresholdSlider
          disabled={applying}
          field="minSec"
          formatValue={(value) => `${value.toFixed(1)}s`}
          label="Min gap"
          max={5}
          min={0.2}
          onCommit={onPatchThreshold}
          step={0.1}
          value={report.config.minSec}
        />
        <ThresholdSlider
          disabled={applying}
          field="keepPadSec"
          formatValue={(value) => `${value.toFixed(2)}s`}
          label="Keep padding"
          max={1}
          min={0}
          onCommit={onPatchThreshold}
          step={0.05}
          value={report.config.keepPadSec}
        />
      </div>

      {selectedCandidate && peaks ? (
        <CleanupSilenceWaveform
          buckets={peaks.buckets}
          candidate={selectedCandidate}
          keepPadSec={report.config.keepPadSec}
          minSec={report.config.minSec}
          window={peakWindowForCandidate(selectedCandidate)}
        />
      ) : (
        <div
          className="flex h-12 items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs"
          data-cleanup-silence-waveform-empty
        >
          {deadAirCandidates.length === 0
            ? "No silence candidates"
            : "Loading waveform…"}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {deadAirCandidates.length} silence
          {deadAirCandidates.length === 1 ? "" : "s"} · saves ~
          {savedSec.toFixed(1)}s
        </span>
        <Button
          className="transition-transform active:scale-[0.96]"
          data-cleanup-apply-all-silences
          disabled={deadAirCandidates.length === 0 || applying}
          onClick={onApplyAllSilences}
          size="sm"
          type="button"
        >
          Remove all silences
        </Button>
      </div>
    </div>
  );
}
