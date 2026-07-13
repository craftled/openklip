"use client";

import type { SilenceSpan } from "@engine/audio-analysis-core";
import {
  buildCleanupReport,
  type CleanupCandidate,
  type CleanupReport,
} from "@engine/cleanup";
import type { Project } from "@engine/edl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentModelSelect } from "@/components/agent-model-select";
import { CleanupSilenceCard } from "@/components/cleanup-silence-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCleanupAiPass } from "@/hooks/use-cleanup-ai-pass";
import type { CleanupPeaksResponse } from "@/hooks/use-cleanup-tab-data";
import { deadAirCandidatesFromReport } from "@/lib/cleanup-silence";
import {
  CATEGORY_CARD_META,
  CATEGORY_HEADING_LABELS,
  type CleanupUndoSnapshot,
  exampleSnippetsForCategory,
  groupCandidatesByCategory,
  type ToggleableCleanupCategory,
  undoItemCount,
} from "@/lib/cleanup-tab";
import { IconAlertTriangle, Scissors, Sparkles, Trash2, X } from "@/lib/icon";
import { cn } from "@/lib/utils";

const PENDING_HIGHLIGHT_DEBOUNCE_MS = 120;
const APPLY_BUTTON_CLASS =
  "size-10 min-h-10 min-w-10 shrink-0 transition-transform active:scale-[0.96]";

export interface RegisteredDeadAirSpan {
  endSec: number;
  id: string;
  startSec: number;
}

const MAX_ROWS = 200;
const TOGGLEABLE_CATEGORIES: ToggleableCleanupCategory[] = [
  "hesitation",
  "hedging",
  "repeat",
];

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
  silences: SilenceSpan[] | null | undefined,
  briefText?: string | null
): CleanupReport {
  return buildCleanupReport({
    project,
    silences,
    briefText: briefText ?? undefined,
  });
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

function truncateSnippet(text: string, maxLen = 28): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen - 1)}…`;
}

function useDebouncedPendingHighlight(
  onPendingHighlightChange?: (wordIds: readonly string[]) => void
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useCallback(
    (wordIds: readonly string[]) => {
      if (!onPendingHighlightChange) {
        return;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onPendingHighlightChange(wordIds);
      }, PENDING_HIGHLIGHT_DEBOUNCE_MS);
    },
    [onPendingHighlightChange]
  );

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onPendingHighlightChange?.([]);
  }, [onPendingHighlightChange]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  return { schedule, clear };
}

function CategoryCard({
  applying,
  category,
  categoryWordIds,
  count,
  enabled,
  examples,
  onPendingHighlightChange,
  onToggleCategory,
}: {
  applying: boolean;
  category: ToggleableCleanupCategory;
  categoryWordIds: readonly string[];
  count: number;
  enabled: boolean;
  examples: string[];
  onPendingHighlightChange?: (wordIds: readonly string[]) => void;
  onToggleCategory: (
    category: ToggleableCleanupCategory,
    next: boolean
  ) => void;
}) {
  const { schedule, clear } = useDebouncedPendingHighlight(
    onPendingHighlightChange
  );
  const meta = CATEGORY_CARD_META[category];
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1 rounded-xl border bg-background/50 p-2 transition-colors",
        enabled && "border-primary/35 bg-primary/5"
      )}
      data-cleanup-category-card={category}
      onMouseEnter={() => schedule(categoryWordIds)}
      onMouseLeave={clear}
    >
      <div className="flex items-center gap-2">
        <Checkbox
          aria-label={`Toggle ${meta.title}`}
          checked={enabled}
          data-cleanup-category-toggle={category}
          disabled={applying}
          onCheckedChange={(next) => {
            onToggleCategory(category, next === true);
          }}
        />
        <span className="min-w-0 flex-1 font-medium text-xs">{meta.title}</span>
        <Badge className="shrink-0 tabular-nums" variant="secondary">
          {count}
        </Badge>
      </div>
      <p className="pl-6 text-muted-foreground text-xs">{meta.subtitle}</p>
      {examples.length > 0 ? (
        <ul
          className="flex flex-col gap-0.5 pl-6"
          data-cleanup-category-examples
        >
          {examples.map((snippet) => (
            <li
              className="truncate text-muted-foreground text-xs"
              key={snippet}
            >
              "{truncateSnippet(snippet)}"
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CleanupRow({
  aiSuggestion,
  applying,
  candidate,
  onApply,
  onPendingHighlightChange,
  onSelect,
  selected,
}: {
  aiSuggestion?: boolean;
  applying: boolean;
  candidate: CleanupCandidate;
  onApply: (candidate: CleanupCandidate) => void;
  onPendingHighlightChange?: (wordIds: readonly string[]) => void;
  onSelect?: (candidate: CleanupCandidate) => void;
  selected?: boolean;
}) {
  const { schedule, clear } = useDebouncedPendingHighlight(
    onPendingHighlightChange
  );
  const selectable = candidate.kind === "dead-air" && onSelect != null;
  const highlight = () => schedule(candidate.wordIds);
  return (
    <li
      className={cn(
        "flex items-start gap-1.5 rounded border bg-background/50 px-2 py-1",
        selected && "ring-1 ring-ring",
        selectable && "cursor-pointer"
      )}
      data-cleanup-ai-row={aiSuggestion ? "" : undefined}
      data-cleanup-row
      data-cleanup-row-kind={candidate.kind}
      data-cleanup-row-selected={selected ? "" : undefined}
      onBlur={clear}
      onClick={
        selectable
          ? () => {
              onSelect(candidate);
            }
          : undefined
      }
      onFocus={highlight}
      onKeyDown={
        selectable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(candidate);
              }
            }
          : undefined
      }
      onMouseEnter={highlight}
      onMouseLeave={clear}
      role={selectable ? "button" : undefined}
      tabIndex={0}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {aiSuggestion ? (
            <Badge data-cleanup-ai-badge variant="secondary">
              AI
            </Badge>
          ) : null}
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
        className={APPLY_BUTTON_CLASS}
        data-cleanup-apply
        disabled={applying}
        onClick={(event) => {
          event.stopPropagation();
          onApply(candidate);
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Scissors />
      </Button>
    </li>
  );
}

function CleanupAiPassControls({
  applying,
  hasAiSuggestions,
  onClear,
  onResults,
  slug,
}: {
  applying: boolean;
  hasAiSuggestions: boolean;
  onClear: () => void;
  onResults: (candidates: CleanupCandidate[]) => void;
  slug: string;
}) {
  const {
    agent,
    agentUsable,
    disabledHint,
    onRunAiPass,
    providerLabel,
    running,
    setAgent,
  } = useCleanupAiPass({ applying, onClear, onResults, slug });

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border bg-background/50 p-2"
      data-cleanup-ai-pass
    >
      <div className="flex flex-col gap-0.5">
        <h4 className="font-medium text-xs">False starts & mistakes</h4>
        <p className="text-muted-foreground text-xs">
          AI review for repeats and false starts not caught by rules.
        </p>
      </div>
      <AgentModelSelect
        onValueChange={setAgent}
        triggerClassName="h-8"
        value={agent}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          className="transition-transform active:scale-[0.96]"
          data-cleanup-ai-run
          disabled={!agentUsable || running || applying}
          onClick={() => void onRunAiPass()}
          size="sm"
          title={disabledHint}
          type="button"
          variant="outline"
        >
          <Sparkles
            className={running ? "animate-pulse" : undefined}
            data-icon="inline-start"
          />
          {running
            ? `${providerLabel} is scanning…`
            : "Find false starts & mistakes (AI)"}
        </Button>
        {hasAiSuggestions ? (
          <Button
            className="h-8 px-2 text-xs transition-transform active:scale-[0.96]"
            data-cleanup-ai-clear
            disabled={applying || running}
            onClick={onClear}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X data-icon="inline-start" />
            Clear AI suggestions
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export interface CleanupPanelProps {
  aiPassEnabled?: boolean;
  applying?: boolean;
  initialAiCandidates?: CleanupCandidate[];
  initialSelectedDeadAirId?: string | null;
  lastUndo?: CleanupUndoSnapshot | null;
  onApply: (candidate: CleanupCandidate) => void;
  onApplyAllSafe: () => void;
  onApplyAllSilences: () => void;
  onApplyEnabled: () => void;
  onPatchCleanupThreshold: (
    field: "keepPadSec" | "minSec",
    value: number
  ) => void;
  onPendingHighlightChange?: (wordIds: readonly string[]) => void;
  onRemoveSpan?: (id: string) => void;
  onToggleCategory: (
    category: ToggleableCleanupCategory,
    enabled: boolean
  ) => void;
  onUndoLast: () => void;
  peaksOverride?: CleanupPeaksResponse | null;
  registeredSpans?: RegisteredDeadAirSpan[];
  report: CleanupReport;
  slug: string;
}

// Presentational cleanup review list for the Config panel: category toggle
// cards, bulk apply actions, undo-last, grouped filler/dead-air candidates,
// and registered dead-air spans with per-span remove buttons. All state and
// behavior live in the caller (app.tsx), matching the transcript-search.tsx /
// music-controls.tsx split.
export function CleanupPanel({
  aiPassEnabled = true,
  applying = false,
  initialAiCandidates = [],
  initialSelectedDeadAirId = null,
  lastUndo = null,
  onPendingHighlightChange,
  onApply,
  onApplyAllSafe,
  onApplyAllSilences,
  onApplyEnabled,
  onPatchCleanupThreshold,
  onRemoveSpan,
  onToggleCategory,
  onUndoLast,
  peaksOverride,
  registeredSpans,
  report,
  slug,
}: CleanupPanelProps) {
  const [aiCandidates, setAiCandidates] =
    useState<CleanupCandidate[]>(initialAiCandidates);
  const clearAiCandidates = useCallback(() => setAiCandidates([]), []);
  useEffect(() => {
    clearAiCandidates();
    onPendingHighlightChange?.([]);
  }, [clearAiCandidates, onPendingHighlightChange, slug]);

  const mergedCandidates = useMemo(() => {
    const baseWordIds = new Set(
      report.candidates.flatMap((candidate) => candidate.wordIds)
    );
    const aiOnly = aiCandidates.filter(
      (candidate) =>
        !candidate.wordIds.some((wordId) => baseWordIds.has(wordId))
    );
    return [...report.candidates, ...aiOnly];
  }, [aiCandidates, report.candidates]);

  const deadAirCandidates = useMemo(
    () => deadAirCandidatesFromReport(mergedCandidates),
    [mergedCandidates]
  );
  const [selectedDeadAirId, setSelectedDeadAirId] = useState<string | null>(
    initialSelectedDeadAirId
  );
  useEffect(() => {
    if (deadAirCandidates.length === 0) {
      setSelectedDeadAirId(null);
      return;
    }
    if (
      selectedDeadAirId == null ||
      !deadAirCandidates.some((candidate) => candidate.id === selectedDeadAirId)
    ) {
      setSelectedDeadAirId(deadAirCandidates[0]?.id ?? null);
    }
  }, [deadAirCandidates, selectedDeadAirId]);
  const selectedDeadAirCandidate =
    deadAirCandidates.find((candidate) => candidate.id === selectedDeadAirId) ??
    null;

  const safeCandidates = mergedCandidates.filter((c) => c.risk === "safe");
  const safeSavedSec = safeCandidates.reduce(
    (sum, c) => sum + c.estSavedSec,
    0
  );
  const grouped = groupCandidatesByCategory(mergedCandidates);
  const visibleCandidateIds = new Set(
    mergedCandidates.slice(0, MAX_ROWS).map((candidate) => candidate.id)
  );
  const hiddenCount = mergedCandidates.length - visibleCandidateIds.size;
  const undoCount = lastUndo ? undoItemCount(lastUndo) : 0;
  const aiSuggestionIds = useMemo(
    () => new Set(aiCandidates.map((candidate) => candidate.id)),
    [aiCandidates]
  );
  const categoryWordIds = useCallback(
    (category: ToggleableCleanupCategory) =>
      mergedCandidates
        .filter((candidate) => candidate.category === category)
        .flatMap((candidate) => candidate.wordIds),
    [mergedCandidates]
  );
  const handleApply = useCallback(
    (candidate: CleanupCandidate) => {
      if (aiSuggestionIds.has(candidate.id)) {
        setAiCandidates((prev) =>
          prev.filter((entry) => entry.id !== candidate.id)
        );
      }
      onApply(candidate);
    },
    [aiSuggestionIds, onApply]
  );

  return (
    <div className="flex flex-col gap-2" data-cleanup-panel>
      <div className="flex flex-col gap-1.5" data-cleanup-category-cards>
        {TOGGLEABLE_CATEGORIES.map((category) => (
          <CategoryCard
            applying={applying}
            category={category}
            categoryWordIds={categoryWordIds(category)}
            count={report.categoryCounts[category]}
            enabled={report.config.categories[category]}
            examples={exampleSnippetsForCategory(mergedCandidates, category)}
            key={category}
            onPendingHighlightChange={onPendingHighlightChange}
            onToggleCategory={onToggleCategory}
          />
        ))}
      </div>

      {aiPassEnabled ? (
        <CleanupAiPassControls
          applying={applying}
          hasAiSuggestions={aiCandidates.length > 0}
          onClear={clearAiCandidates}
          onResults={setAiCandidates}
          slug={slug}
        />
      ) : null}

      <CleanupSilenceCard
        applying={applying}
        onApplyAllSilences={onApplyAllSilences}
        onPatchThreshold={onPatchCleanupThreshold}
        peaksOverride={peaksOverride}
        report={report}
        selectedCandidate={selectedDeadAirCandidate}
        slug={slug}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          className="transition-transform active:scale-[0.96]"
          data-cleanup-apply-enabled
          disabled={applying}
          onClick={onApplyEnabled}
          size="sm"
          type="button"
        >
          <Scissors data-icon="inline-start" />
          Apply enabled categories
        </Button>
        <Button
          className="transition-transform active:scale-[0.96]"
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
        <Button
          aria-hidden={undoCount === 0}
          className={cn(
            "transition-[opacity,transform] active:scale-[0.96]",
            undoCount > 0
              ? "pointer-events-auto translate-y-0 opacity-100 duration-200 ease-out"
              : "pointer-events-none translate-y-0.5 opacity-0 duration-150 ease-in"
          )}
          data-cleanup-undo
          disabled={undoCount === 0 || applying}
          onClick={onUndoLast}
          size="sm"
          type="button"
          variant="ghost"
        >
          Undo last cleanup ({undoCount || 0})
        </Button>
      </div>

      {report.warnings.length > 0 ? (
        <ul className="flex flex-col gap-0.5" data-cleanup-warnings>
          {report.warnings.map((warning) => (
            <li
              className="flex items-start gap-1.5 text-muted-foreground text-xs"
              key={warning}
            >
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {mergedCandidates.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nothing to clean up.</p>
      ) : (
        <>
          <div
            className="flex max-h-40 flex-col gap-2 overflow-y-auto"
            data-cleanup-list
          >
            {grouped.map((group) => (
              <section data-cleanup-group={group.category} key={group.category}>
                <h4 className="mb-1 font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wide">
                  {CATEGORY_HEADING_LABELS[group.category]}
                </h4>
                <ul className="flex flex-col gap-1">
                  {group.candidates
                    .filter((candidate) =>
                      visibleCandidateIds.has(candidate.id)
                    )
                    .map((candidate) => (
                      <CleanupRow
                        aiSuggestion={aiSuggestionIds.has(candidate.id)}
                        applying={applying}
                        candidate={candidate}
                        key={candidate.id}
                        onApply={handleApply}
                        onPendingHighlightChange={onPendingHighlightChange}
                        onSelect={
                          candidate.kind === "dead-air"
                            ? (next) => setSelectedDeadAirId(next.id)
                            : undefined
                        }
                        selected={
                          candidate.kind === "dead-air" &&
                          candidate.id === selectedDeadAirId
                        }
                      />
                    ))}
                </ul>
              </section>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <p className="text-muted-foreground text-xs">{hiddenCount} more</p>
          ) : null}
        </>
      )}

      {registeredSpans && registeredSpans.length > 0 ? (
        <div className="flex flex-col gap-1" data-dead-air-registered>
          <p className="font-medium text-muted-foreground text-xs">
            Registered dead-air spans
          </p>
          <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
            {registeredSpans.map((span) => (
              <li
                className="flex items-center gap-1.5 rounded border bg-background/50 px-2 py-1"
                data-dead-air-span
                key={span.id}
              >
                <span className="min-w-0 flex-1 text-muted-foreground text-xs tabular-nums">
                  {fmtTimecode(span.startSec)}
                  {" – "}
                  {fmtTimecode(span.endSec)}
                  <span className="ml-1 text-muted-foreground/70">
                    ({(span.endSec - span.startSec).toFixed(1)}s)
                  </span>
                </span>
                <Button
                  aria-label={`Remove dead-air span at ${fmtTimecode(span.startSec)}`}
                  className={APPLY_BUTTON_CLASS}
                  data-dead-air-rm
                  disabled={applying}
                  onClick={() => onRemoveSpan?.(span.id)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
