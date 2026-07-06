"use client";

import type { AssemblySegment, Project, Take } from "@engine/edl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Film, IconLoader, Upload, X } from "@/lib/icon";
import { selectDroppedVideo } from "@/lib/project-intake";
import { ingestTakeFromVideo } from "@/lib/take-create";
import { resolveWordRange } from "@/lib/take-word-range";
import { cn } from "@/lib/utils";
import {
  assembleFromSelectionAction,
  listTakesAction,
  loadTakeAction,
} from "../../app/actions.ts";
import { SUPPORTED_VIDEO_ACCEPT } from "../../src/video-formats.ts";

const MAX_ROWS = 50;
// assertProjectCanBeIngested's (src/ingest-guard.ts) exact wording for
// assembleFromSelection's re-use of the same guard: matched the same way
// history-panel.tsx's revertErrorNeedsForce matches src/revert.ts's phrasing.
const ASSEMBLE_FORCE_PHRASE = "pass --force to overwrite";

type TakeWord = Take["words"][number];

function fmtDuration(samples: number, sampleRate: number): string {
  const total = Math.max(0, Math.floor(samples / sampleRate));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function TakeRow({
  active,
  onSelect,
  take,
}: {
  active: boolean;
  onSelect: () => void;
  take: Take;
}) {
  return (
    <li>
      <button
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left transition-colors hover:bg-muted/50",
          active && "border-primary bg-muted/60"
        )}
        data-takes-row
        onClick={onSelect}
        type="button"
      >
        <Film className="size-4 shrink-0 opacity-70" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-xs">
            {take.label || take.id}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {fmtDuration(take.durationSamples, take.sampleRate)} ·{" "}
            {take.words.length} {take.words.length === 1 ? "word" : "words"}
          </span>
        </span>
      </button>
    </li>
  );
}

function SegmentRow({
  index,
  onRemove,
  segment,
  takeLabel,
}: {
  index: number;
  onRemove: (index: number) => void;
  segment: AssemblySegment;
  takeLabel: string;
}) {
  return (
    <li
      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
      data-takes-segment
    >
      <span className="min-w-0 flex-1 truncate">
        {takeLabel}: {segment.startWordId} → {segment.endWordId}
      </span>
      <Button
        aria-label={`Remove segment ${index + 1}`}
        onClick={() => onRemove(index)}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
    </li>
  );
}

export interface TakesPanelViewProps {
  addTakeBusy: boolean;
  addTakeError: string | null;
  addTakeLabel: string;
  addTakeProgress: string | null;
  anchorWordId: string | null;
  assembleError: string | null;
  assembling: boolean;
  forceArmed: boolean;
  loadingTakes: boolean;
  loadingWords: boolean;
  onAddTakeFile: (file: File) => void;
  onAddTakeLabelChange: (value: string) => void;
  onAssemble: () => void;
  onCancelForce: () => void;
  onClickWord: (wordId: string) => void;
  onRemoveSegment: (index: number) => void;
  onSelectTake: (takeId: string) => void;
  segments: AssemblySegment[];
  selectedTakeId: string | null;
  selectedWords: TakeWord[] | null;
  takes: Take[];
}

/** Upload a new take's source video. A plain file-input button (no
 * drag/drop): the panel already lives in a narrow sidebar column where a
 * drop target would fight with the transcript/word click surface above it. */
function AddTakeControl({
  busy,
  error,
  label,
  onFile,
  onLabelChange,
  progressMessage,
}: {
  busy: boolean;
  error: string | null;
  label: string;
  onFile: (file: File) => void;
  onLabelChange: (value: string) => void;
  progressMessage: string | null;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-dashed p-1.5"
      data-takes-add
    >
      <div className="flex items-center gap-1.5">
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs hover:bg-muted/50",
            busy && "pointer-events-none opacity-60"
          )}
        >
          {busy ? (
            <IconLoader
              aria-hidden
              className="size-3.5 shrink-0 animate-spin"
            />
          ) : (
            <Upload aria-hidden className="size-3.5 shrink-0" />
          )}
          <span>
            {busy ? (progressMessage ?? "Ingesting take…") : "Add take"}
          </span>
          <input
            accept={SUPPORTED_VIDEO_ACCEPT}
            className="hidden"
            data-takes-add-file
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                onFile(file);
              }
            }}
            type="file"
          />
        </label>
        <Input
          className="h-7! min-w-0 flex-1 rounded-md! px-2! py-1! text-[0.8rem]!"
          data-takes-add-label
          disabled={busy}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Label (optional)"
          type="text"
          value={label}
        />
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

/** Pure, prop-driven render (mirrors HistoryList/HistoryPanel's split in
 * web/components/history-panel.tsx): all state and server-action calls live
 * in TakesPanel below, so this piece stays fully testable with
 * renderToStaticMarkup. */
export function TakesPanelView({
  addTakeBusy,
  addTakeProgress,
  addTakeError,
  addTakeLabel,
  anchorWordId,
  assembleError,
  assembling,
  forceArmed,
  loadingTakes,
  loadingWords,
  onAddTakeFile,
  onAddTakeLabelChange,
  onAssemble,
  onCancelForce,
  onClickWord,
  onRemoveSegment,
  onSelectTake,
  segments,
  selectedTakeId,
  selectedWords,
  takes,
}: TakesPanelViewProps) {
  const rows = takes.slice(0, MAX_ROWS);
  const hiddenCount = takes.length - rows.length;
  const takeLabel = (takeId: string) =>
    takes.find((t) => t.id === takeId)?.label || takeId;

  return (
    <div className="flex flex-col gap-1.5" data-takes-panel>
      <AddTakeControl
        busy={addTakeBusy}
        error={addTakeError}
        label={addTakeLabel}
        onFile={onAddTakeFile}
        onLabelChange={onAddTakeLabelChange}
        progressMessage={addTakeProgress}
      />

      {takes.length === 0 ? (
        <p className="text-muted-foreground text-xs" data-takes-empty>
          {loadingTakes
            ? "Loading takes…"
            : "No takes ingested yet. Ingest one with `openklip take-add`."}
        </p>
      ) : (
        <>
          <ul
            className="flex max-h-40 flex-col gap-1 overflow-y-auto"
            data-takes-list
          >
            {rows.map((take) => (
              <TakeRow
                active={selectedTakeId === take.id}
                key={take.id}
                onSelect={() => onSelectTake(take.id)}
                take={take}
              />
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <p className="text-muted-foreground text-xs">{hiddenCount} more</p>
          ) : null}
        </>
      )}

      {selectedTakeId ? (
        <div
          className="flex flex-col gap-1 rounded-md border p-1.5"
          data-takes-transcript
        >
          <span className="text-muted-foreground text-xs">
            Click a start word, then an end word, to add a segment.
          </span>
          {loadingWords || !selectedWords ? (
            <p className="text-muted-foreground text-xs">Loading transcript…</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selectedWords.map((word) => (
                <button
                  className={cn(
                    "rounded px-1 py-0.5 text-xs hover:bg-muted",
                    anchorWordId === word.id && "bg-primary/20"
                  )}
                  data-takes-word
                  key={word.id}
                  onClick={() => onClickWord(word.id)}
                  type="button"
                >
                  {word.text}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <Badge variant="secondary">
          {segments.length} {segments.length === 1 ? "segment" : "segments"}
        </Badge>
        {segments.length > 0 ? (
          <ul className="flex flex-col gap-1" data-takes-seglist>
            {segments.map((segment, index) => (
              <SegmentRow
                index={index}
                key={`${segment.takeId}-${segment.startWordId}-${segment.endWordId}-${index}`}
                onRemove={onRemoveSegment}
                segment={segment}
                takeLabel={takeLabel(segment.takeId)}
              />
            ))}
          </ul>
        ) : null}
      </div>

      {assembleError ? (
        <p className="text-destructive text-xs">{assembleError}</p>
      ) : null}

      {forceArmed ? (
        <div className="flex items-center gap-1.5" data-takes-force-confirm>
          <span className="text-muted-foreground text-xs">
            Overwrite existing edit?
          </span>
          <Button
            aria-label="Confirm overwrite"
            className="rounded-sm text-destructive hover:bg-destructive/10"
            disabled={assembling}
            onClick={onAssemble}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Check />
          </Button>
          <Button
            aria-label="Cancel overwrite"
            className="rounded-sm text-muted-foreground hover:bg-muted"
            disabled={assembling}
            onClick={onCancelForce}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      ) : (
        <Button
          data-takes-assemble
          disabled={segments.length === 0 || assembling}
          onClick={onAssemble}
          size="sm"
          type="button"
          variant="secondary"
        >
          {assembling ? "Assembling…" : "Assemble"}
        </Button>
      )}
    </div>
  );
}

export interface TakesPanelProps {
  /** Reseed the open editor's client Project state after a successful
   * assemble: assemble replaces project.json wholesale (source, proxy,
   * words, durationSamples, template, captions...), the same
   * whole-project-replace shape as a GUI revert. Callers should reuse the
   * exact reseed App already does for HistoryPanel's onReverted. */
  onAssembled?: (project: Project) => void;
  slug: string;
}

export function TakesPanel({ onAssembled, slug }: TakesPanelProps) {
  const router = useRouter();
  const [takes, setTakes] = useState<Take[]>([]);
  const [loadingTakes, setLoadingTakes] = useState(true);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [selectedWords, setSelectedWords] = useState<TakeWord[] | null>(null);
  const [loadingWords, setLoadingWords] = useState(false);
  const [anchorWordId, setAnchorWordId] = useState<string | null>(null);
  const [segments, setSegments] = useState<AssemblySegment[]>([]);
  const [assembling, setAssembling] = useState(false);
  const [forceArmed, setForceArmed] = useState(false);
  const [assembleError, setAssembleError] = useState<string | null>(null);
  const [addTakeBusy, setAddTakeBusy] = useState(false);
  const [addTakeProgress, setAddTakeProgress] = useState<string | null>(null);
  const [addTakeError, setAddTakeError] = useState<string | null>(null);
  const [addTakeLabel, setAddTakeLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingTakes(true);
    void listTakesAction(slug).then((result) => {
      if (cancelled) {
        return;
      }
      setLoadingTakes(false);
      if (result.ok) {
        setTakes(result.data.takes);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Reload the take list after a successful add, without flashing the
  // initial "Loading takes…" empty state over an already-populated list.
  const reloadTakes = useCallback(async () => {
    const result = await listTakesAction(slug);
    if (result.ok) {
      setTakes(result.data.takes);
    }
  }, [slug]);

  const onAddTakeFile = useCallback(
    (file: File) => {
      const picked = selectDroppedVideo([file]);
      if ("error" in picked) {
        setAddTakeError(picked.error);
        return;
      }
      setAddTakeError(null);
      setAddTakeProgress(null);
      setAddTakeBusy(true);
      void ingestTakeFromVideo(
        slug,
        picked.file,
        {
          label: addTakeLabel.trim() || undefined,
        },
        (progress) => {
          setAddTakeProgress(progress.message);
        }
      )
        .then(async () => {
          setAddTakeLabel("");
          await reloadTakes();
        })
        .catch((e: unknown) => {
          setAddTakeError((e as Error).message);
        })
        .finally(() => {
          setAddTakeBusy(false);
          setAddTakeProgress(null);
        });
    },
    [addTakeLabel, reloadTakes, slug]
  );

  const onAddTakeLabelChange = useCallback((value: string) => {
    setAddTakeLabel(value);
  }, []);

  const onSelectTake = useCallback(
    (takeId: string) => {
      setSelectedTakeId(takeId);
      setSelectedWords(null);
      setAnchorWordId(null);
      setLoadingWords(true);
      void loadTakeAction(slug, takeId).then((result) => {
        setLoadingWords(false);
        if (result.ok) {
          setSelectedWords(result.data.take.words);
        }
      });
    },
    [slug]
  );

  const onClickWord = useCallback(
    (wordId: string) => {
      if (!(selectedWords && selectedTakeId)) {
        return;
      }
      if (anchorWordId === null) {
        setAnchorWordId(wordId);
        return;
      }
      const range = resolveWordRange(selectedWords, anchorWordId, wordId);
      setAnchorWordId(null);
      if (!range) {
        return;
      }
      setSegments((prev) => [...prev, { takeId: selectedTakeId, ...range }]);
      setForceArmed(false);
      setAssembleError(null);
    },
    [anchorWordId, selectedTakeId, selectedWords]
  );

  const onRemoveSegment = useCallback((index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
    setForceArmed(false);
  }, []);

  const onCancelForce = useCallback(() => {
    setForceArmed(false);
  }, []);

  const onAssemble = useCallback(async () => {
    if (segments.length === 0) {
      return;
    }
    setAssembling(true);
    try {
      const result = await assembleFromSelectionAction(
        slug,
        { segments },
        { force: forceArmed }
      );
      if (!result.ok) {
        if (!forceArmed && result.error.includes(ASSEMBLE_FORCE_PHRASE)) {
          // Escalate to a second, explicit confirmation instead of failing
          // outright, same idea as history-panel.tsx's revertErrorNeedsForce
          // escalation to forceConfirmKey.
          setForceArmed(true);
          return;
        }
        setAssembleError(result.error);
        setForceArmed(false);
        return;
      }
      setSegments([]);
      setForceArmed(false);
      setAssembleError(null);
      onAssembled?.(result.data.project);
      router.refresh();
    } finally {
      setAssembling(false);
    }
  }, [forceArmed, onAssembled, router, segments, slug]);

  return (
    <TakesPanelView
      addTakeBusy={addTakeBusy}
      addTakeError={addTakeError}
      addTakeLabel={addTakeLabel}
      addTakeProgress={addTakeProgress}
      anchorWordId={anchorWordId}
      assembleError={assembleError}
      assembling={assembling}
      forceArmed={forceArmed}
      loadingTakes={loadingTakes}
      loadingWords={loadingWords}
      onAddTakeFile={onAddTakeFile}
      onAddTakeLabelChange={onAddTakeLabelChange}
      onAssemble={() => void onAssemble()}
      onCancelForce={onCancelForce}
      onClickWord={onClickWord}
      onRemoveSegment={onRemoveSegment}
      onSelectTake={onSelectTake}
      segments={segments}
      selectedTakeId={selectedTakeId}
      selectedWords={selectedWords}
      takes={takes}
    />
  );
}
