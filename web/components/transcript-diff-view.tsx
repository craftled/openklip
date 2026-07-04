"use client";

import { FileDiff } from "@pierre/diffs/react";
import { type CSSProperties, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  buildTranscriptFileDiff,
  type TranscriptDiffWord,
  transcriptDiffSummary,
} from "@/lib/transcript-diff";
import {
  commitTranscriptDiffLayoutChange,
  readStoredTranscriptDiffLayout,
  TRANSCRIPT_DIFF_LAYOUT_LABELS,
  type TranscriptDiffLayout,
  transcriptDiffFileOptions,
  transcriptDiffUnsafeCss,
} from "@/lib/transcript-diff-layout";
import { cn } from "@/lib/utils";

const TRANSCRIPT_DIFF_FONT_FAMILY =
  'var(--font-sans), "Inter", "Inter Fallback", ui-sans-serif, system-ui, sans-serif';

export function transcriptDiffSurfaceStyle(compact = false): CSSProperties {
  return {
    "--diffs-font-family": TRANSCRIPT_DIFF_FONT_FAMILY,
    "--diffs-header-font-family": TRANSCRIPT_DIFF_FONT_FAMILY,
    "--diffs-font-size": compact ? "0.875rem" : "1rem",
    "--diffs-line-height": "1.625",
    "--diffs-bg": "var(--card)",
    color: "var(--foreground)",
    fontWeight: 500,
    width: "100%",
  } as CSSProperties;
}

export function transcriptDiffCaption(summary: {
  additions: number;
  deletions: number;
  hunks: number;
}): string {
  if (summary.hunks === 0) {
    return "No transcript changes";
  }
  return `${summary.hunks} hunks · ${summary.additions} added · ${summary.deletions} removed`;
}

function transcriptDiffBadges(summary: {
  additions: number;
  deletions: number;
  hunks: number;
}) {
  if (summary.hunks === 0) {
    return (
      <Badge className="font-normal" variant="secondary">
        No changes
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {summary.deletions > 0 ? (
        <Badge
          className="border-destructive/20 bg-destructive/10 font-normal text-destructive"
          variant="outline"
        >
          {summary.deletions} removed
        </Badge>
      ) : null}
      {summary.additions > 0 ? (
        <Badge
          className="border-primary/20 bg-primary/10 font-normal text-foreground"
          variant="outline"
        >
          {summary.additions} added
        </Badge>
      ) : null}
    </div>
  );
}

export function TranscriptDiffHeader({
  caption,
  className,
  compact = false,
  layout,
  onLayoutChange,
  summary,
  title,
}: {
  caption: string;
  className?: string;
  compact?: boolean;
  layout: TranscriptDiffLayout;
  onLayoutChange: (layout: TranscriptDiffLayout) => void;
  summary?: { additions: number; deletions: number; hunks: number };
  title?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-2",
        !compact && "border-border border-b pb-2",
        className
      )}
      data-transcript-diff-header
    >
      <div
        className={cn(
          "flex flex-col gap-2",
          !compact && "sm:flex-row sm:items-start sm:justify-between"
        )}
      >
        <div className="min-w-0 space-y-1">
          {title ? (
            <h3
              className={cn(
                "font-medium text-foreground",
                compact ? "text-xs" : "text-sm"
              )}
            >
              {title}
            </h3>
          ) : null}
          {compact && summary ? (
            transcriptDiffBadges(summary)
          ) : (
            <p className="text-muted-foreground text-xs">{caption}</p>
          )}
        </div>
        <TranscriptDiffLayoutPicker
          className={compact ? "w-full" : "w-full sm:w-auto"}
          layout={layout}
          onLayoutChange={onLayoutChange}
        />
      </div>
    </header>
  );
}

export function TranscriptDiffLayoutPicker({
  className,
  layout,
  onLayoutChange,
}: {
  className?: string;
  layout: TranscriptDiffLayout;
  onLayoutChange: (layout: TranscriptDiffLayout) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Transcript diff layout"
      className={cn("grid shrink-0 grid-cols-2", className)}
      onValueChange={(value) => {
        const next = Array.isArray(value) ? value[0] : value;
        if (next === "inline" || next === "classic") {
          onLayoutChange(next);
        }
      }}
      size="sm"
      spacing={0}
      type="single"
      value={layout}
      variant="outline"
    >
      {(
        Object.keys(TRANSCRIPT_DIFF_LAYOUT_LABELS) as TranscriptDiffLayout[]
      ).map((id) => (
        <ToggleGroupItem
          className="h-7! w-full px-2.5 text-xs first:rounded-r-none! first:rounded-l-md! last:rounded-r-md! last:rounded-l-none!"
          key={id}
          value={id}
        >
          {TRANSCRIPT_DIFF_LAYOUT_LABELS[id]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function TranscriptDiffView({
  className,
  compact = false,
  defaultLayout = "inline",
  layout: controlledLayout,
  newWords,
  oldWords,
  onLayoutChange,
  title,
}: {
  className?: string;
  compact?: boolean;
  defaultLayout?: TranscriptDiffLayout;
  layout?: TranscriptDiffLayout;
  newWords: readonly TranscriptDiffWord[];
  oldWords: readonly TranscriptDiffWord[];
  onLayoutChange?: (layout: TranscriptDiffLayout) => void;
  title?: string;
}) {
  const [uncontrolledLayout, setUncontrolledLayout] =
    useState<TranscriptDiffLayout>(() => {
      if (typeof window === "undefined") {
        return defaultLayout;
      }
      return readStoredTranscriptDiffLayout();
    });
  const layout = controlledLayout ?? uncontrolledLayout;

  const setLayout = (next: TranscriptDiffLayout) => {
    commitTranscriptDiffLayoutChange(next, {
      controlledLayout,
      onLayoutChange,
      setUncontrolledLayout,
    });
  };

  const diff = useMemo(
    () => buildTranscriptFileDiff(oldWords, newWords),
    [newWords, oldWords]
  );
  const caption = transcriptDiffCaption(transcriptDiffSummary(diff.fileDiff));
  const summary = transcriptDiffSummary(diff.fileDiff);
  const fileOptions = useMemo(
    () => ({
      ...transcriptDiffFileOptions(layout),
      unsafeCSS: transcriptDiffUnsafeCss(layout),
    }),
    [layout]
  );
  const surfaceStyle = useMemo(
    () => transcriptDiffSurfaceStyle(compact),
    [compact]
  );
  const hasChanges = summary.hunks > 0;

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col",
        compact ? "gap-2" : "gap-3",
        className
      )}
      data-transcript-diff-layout={layout}
      data-transcript-diff-view
    >
      <TranscriptDiffHeader
        caption={caption}
        compact={compact}
        layout={layout}
        onLayoutChange={setLayout}
        summary={summary}
        title={title}
      />
      {hasChanges ? (
        <div
          className={cn(
            "overflow-auto rounded-md border bg-card font-medium font-sans text-foreground selection:bg-primary/20",
            compact ? "max-h-56 px-2 py-1.5 text-sm" : "min-h-32 px-3 py-2"
          )}
        >
          <FileDiff
            fileDiff={diff.fileDiff}
            key={layout}
            options={fileOptions}
            style={surfaceStyle}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No kept-word changes in this edit.
        </p>
      )}
    </section>
  );
}
