"use client";

import { authorDisplayLabel } from "@engine/provenance-display";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, RotateCcw, Scissors, X } from "@/lib/icon";
import {
  selectedWordStats,
  transcriptTextUnchanged,
} from "@/lib/transcript-edit";
import { cn } from "@/lib/utils";

interface TranscriptWord {
  authoredAt?: number;
  authoredBy?: string;
  authoredRevision?: number;
  authoredTaskId?: string;
  deleted: boolean;
  endSample: number;
  id: string;
  startSample: number;
  text: string;
}

interface EditorTranscriptPanelProps {
  activeMatchRange?: readonly [number, number] | null;
  cleanupPendingWordIds?: ReadonlySet<string>;
  curSample: number;
  inBroll: (word: TranscriptWord) => boolean;
  inZoom: (word: TranscriptWord) => boolean;
  matchRanges?: ReadonlyArray<readonly [number, number]>;
  onCutSelection: (range?: readonly [number, number] | null) => void;
  onRestoreSelection: (range?: readonly [number, number] | null) => void;
  onSelectRange: (range: readonly [number, number] | null) => void;
  onTextEdit: (text: string) => void;
  onViewInHistory?: (revisionAfter: number) => void;
  selRange: readonly [number, number] | null;
  /** Advanced: hover attribution and View in history on words. */
  showProvenance?: boolean;
  words: TranscriptWord[];
}

export function EditorTranscriptPanel({
  activeMatchRange,
  cleanupPendingWordIds,
  curSample,
  inBroll,
  inZoom,
  matchRanges,
  onCutSelection,
  onRestoreSelection,
  onSelectRange,
  onTextEdit,
  onViewInHistory,
  showProvenance = false,
  selRange,
  words,
}: EditorTranscriptPanelProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [editorMounted, setEditorMounted] = useState(false);
  const paragraphs = transcriptParagraphs(words);
  const minuteMarkers = useMemo(() => transcriptMinuteMarkers(words), [words]);
  const selection = selectedWordStats(words, selRange);
  const matchedWordIndices = rangeIndexSet(matchRanges);
  const activeMatchIndices = rangeIndexSet(
    activeMatchRange ? [activeMatchRange] : undefined
  );
  const pendingScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    setEditorMounted(true);
  }, []);

  useEffect(() => {
    if (pendingScrollTimerRef.current) {
      clearTimeout(pendingScrollTimerRef.current);
    }
    if (!cleanupPendingWordIds || cleanupPendingWordIds.size === 0) {
      return;
    }
    pendingScrollTimerRef.current = setTimeout(() => {
      const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']"
      );
      if (!viewport) {
        return;
      }
      const firstIndex = words.findIndex((word) =>
        cleanupPendingWordIds.has(word.id)
      );
      if (firstIndex < 0) {
        return;
      }
      const target = viewport.querySelector<HTMLElement>(
        `[data-word-index="${firstIndex}"]`
      );
      target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 120);
    return () => {
      if (pendingScrollTimerRef.current) {
        clearTimeout(pendingScrollTimerRef.current);
      }
    };
  }, [cleanupPendingWordIds, words]);

  useEffect(() => {
    if (!selRange) {
      return;
    }
    const onDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (shouldIgnoreTranscriptShortcut(event.target, editorRef.current)) {
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        onCutSelection(selRange);
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        onRestoreSelection(selRange);
      } else if (event.key === "Escape") {
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        onSelectRange(null);
      }
    };
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [onCutSelection, onRestoreSelection, onSelectRange, selRange]);

  useEffect(() => {
    const syncSelection = () => {
      const root = editorRef.current;
      const selection = window.getSelection();
      if (!(root && selection && selection.rangeCount > 0)) {
        return;
      }
      const range = selection.getRangeAt(0);
      if (
        root.contains(range.startContainer) ||
        root.contains(range.endContainer)
      ) {
        onSelectRange(readNativeWordRange(root));
      }
    };
    document.addEventListener("selectionchange", syncSelection);
    return () => document.removeEventListener("selectionchange", syncSelection);
  }, [onSelectRange]);

  const commitEditedText = () => {
    const text = editorRef.current?.innerText ?? "";
    // Every word (including struck-through deleted ones) lives in this one
    // contentEditable, so a blur with no real edit extracts the same text
    // every time. Skip the save entirely rather than reconcile a no-op.
    if (transcriptTextUnchanged(words, text)) {
      return;
    }
    onTextEdit(text);
  };

  const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const nativeRange = readNativeWordRange(editorRef.current);
    if (nativeRange) {
      onSelectRange(nativeRange);
    }
    // A caret-only Backspace/Delete (no selection range) intentionally falls
    // through to native contentEditable editing below rather than being
    // preventDefault()'d, so character-level typing corrections keep
    // working. This is safe only because of two guards downstream:
    // reconcileTranscriptText preserves each word's existing deleted flag on
    // match/replace ops (a word merely being present, or having edited
    // text, is not evidence of restoration), and commitEditedText no-ops
    // when the extracted text is token-identical to the current words. A
    // stray edit therefore costs at most one word's text, which is logged
    // and revertible, never a mass resurrection of cut words.
    if (event.key === "Backspace" || event.key === "Delete") {
      const range = nativeRange ?? selRange;
      if (range) {
        event.preventDefault();
        onCutSelection(range);
      }
    } else if (event.key.toLowerCase() === "r") {
      if (nativeRange || selRange) {
        event.preventDefault();
        onRestoreSelection(nativeRange ?? selRange);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      onSelectRange(null);
    }
  };

  const copySelection = () => {
    const selectedText = window.getSelection()?.toString().trim();
    const text =
      selectedText ||
      (selRange
        ? words
            .slice(selRange[0], selRange[1] + 1)
            .map((word) => word.text)
            .join(" ")
        : "");
    if (text) {
      void navigator.clipboard?.writeText(text);
    }
  };

  return (
    <TooltipProvider>
      <ScrollArea className="h-full min-h-0" ref={scrollAreaRef}>
        <div className="flex min-h-full flex-col px-4 pt-4 pb-12 sm:px-6">
          {selection.total > 0 ? (
            <TranscriptSelectionToolbar
              copySelection={copySelection}
              cutSelection={() => onCutSelection(selRange)}
              onClear={() => {
                window.getSelection()?.removeAllRanges();
                onSelectRange(null);
              }}
              restoreSelection={() => onRestoreSelection(selRange)}
              selection={selection}
            />
          ) : null}

          {words.length === 0 ? (
            <Empty className="min-h-48 border border-dashed bg-muted/20">
              <EmptyHeader>
                <EmptyTitle>No script yet</EmptyTitle>
                <EmptyDescription>
                  After ingest, your spoken words appear here. Edit text to
                  shape the cut; deleted words are removed from the video.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            // biome-ignore lint/a11y/useSemanticElements: contenteditable keeps per-word timing spans; a textarea cannot carry word ids.
            <div
              aria-label="Transcript editor"
              aria-multiline="true"
              className="mx-auto w-full max-w-2xl rounded-md text-left font-[450] text-[15px] text-foreground/90 leading-6 outline-none selection:bg-primary/15 focus-visible:ring-0"
              contentEditable={editorMounted ? true : undefined}
              onBlur={commitEditedText}
              onKeyDown={onEditorKeyDown}
              ref={editorRef}
              role="textbox"
              suppressContentEditableWarning
              tabIndex={0}
            >
              {paragraphs.map((paragraph) => (
                <p className="mb-2 last:mb-0" key={paragraph[0]?.word.id}>
                  {paragraph.map(({ index, word }) => (
                    <TranscriptWordButton
                      active={
                        curSample >= word.startSample &&
                        curSample < word.endSample &&
                        !word.deleted
                      }
                      inBroll={inBroll(word)}
                      index={index}
                      inZoom={inZoom(word)}
                      isActiveMatch={activeMatchIndices.has(index)}
                      isMatch={matchedWordIndices.has(index)}
                      isPendingCut={
                        !word.deleted &&
                        (cleanupPendingWordIds?.has(word.id) ?? false)
                      }
                      isSelected={
                        selRange != null &&
                        index >= selRange[0] &&
                        index <= selRange[1]
                      }
                      key={word.id}
                      onSelect={() => {
                        editorRef.current?.focus();
                        onSelectRange([index, index]);
                      }}
                      onViewInHistory={
                        showProvenance ? onViewInHistory : undefined
                      }
                      showProvenance={showProvenance}
                      word={word}
                    />
                  ))}
                </p>
              ))}
            </div>
          )}
        </div>
        <TranscriptMinuteRail
          markers={minuteMarkers}
          scrollAreaRef={scrollAreaRef}
        />
        <TranscriptScrollFades scrollAreaRef={scrollAreaRef} />
      </ScrollArea>
    </TooltipProvider>
  );
}

interface TranscriptMinuteMarker {
  index: number;
  label: string;
  minute: number;
}

interface VisibleTranscriptMinuteMarker extends TranscriptMinuteMarker {
  top: number;
}

const TRANSCRIPT_SAMPLE_RATE = 48_000;
const TRANSCRIPT_MINUTE_RAIL_INSET_PX = 16;

function TranscriptMinuteRail({
  markers,
  scrollAreaRef,
}: {
  markers: TranscriptMinuteMarker[];
  scrollAreaRef: RefObject<HTMLDivElement | null>;
}) {
  const [visibleMarkers, setVisibleMarkers] = useState<
    VisibleTranscriptMinuteMarker[]
  >([]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']"
    );
    if (!(viewport && markers.length > 0)) {
      setVisibleMarkers([]);
      return;
    }

    const update = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const viewportTop = viewportRect.top + TRANSCRIPT_MINUTE_RAIL_INSET_PX;
      const viewportBottom =
        viewportRect.bottom - TRANSCRIPT_MINUTE_RAIL_INSET_PX;
      const next = markers.flatMap((marker) => {
        const word = viewport.querySelector<HTMLElement>(
          `[data-word-index="${marker.index}"]`
        );
        if (!word) {
          return [];
        }
        const wordRect = word.getBoundingClientRect();
        const top = wordRect.top - viewportRect.top;
        if (wordRect.top < viewportTop || wordRect.top > viewportBottom) {
          return [];
        }
        return [{ ...marker, top }];
      });
      setVisibleMarkers(next);
    };

    update();
    viewport.addEventListener("scroll", update, { passive: true });

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver.observe(viewport.firstElementChild);
    }

    return () => {
      viewport.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, [markers, scrollAreaRef]);

  if (markers.length === 0 || visibleMarkers.length === 0) {
    return null;
  }

  const scrollToMarker = (marker: TranscriptMinuteMarker) => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']"
    );
    const word = viewport?.querySelector<HTMLElement>(
      `[data-word-index="${marker.index}"]`
    );
    word?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <nav
      aria-label="Transcript minute markers"
      className="pointer-events-none absolute inset-y-4 right-3 z-20 w-12"
    >
      {visibleMarkers.map((marker) => (
        <button
          aria-label={`Jump to transcript at ${marker.minute} minute${marker.minute === 1 ? "" : "s"}`}
          className="group pointer-events-auto absolute right-0 flex h-5 w-8 -translate-y-1/2 items-center justify-end gap-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
          key={marker.minute}
          onClick={() => scrollToMarker(marker)}
          style={{ top: marker.top }}
          type="button"
        >
          <span className="font-medium text-[10px] leading-none opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {marker.minute}m
          </span>
          <span className="h-px w-3 rounded-full bg-current transition-all group-hover:w-4 group-focus-visible:w-4" />
        </button>
      ))}
    </nav>
  );
}

const TRANSCRIPT_FADE_HEIGHT_PX = 64;
const TRANSCRIPT_TOP_THRESHOLD_PX = 8;
const TRANSCRIPT_BOTTOM_THRESHOLD_PX = TRANSCRIPT_FADE_HEIGHT_PX * 0.5;

const transcriptBottomFadeGradientStyle = {
  background:
    "linear-gradient(to top, var(--background) 0%, color-mix(in srgb, var(--background) 72%, transparent) 45%, transparent 100%)",
} satisfies CSSProperties;

const transcriptTopFadeGradientStyle = {
  background:
    "linear-gradient(to bottom, var(--background) 0%, color-mix(in srgb, var(--background) 72%, transparent) 45%, transparent 100%)",
} satisfies CSSProperties;

const transcriptBottomFadeBlurStyle = {
  backdropFilter: "blur(4px)",
  maskImage:
    "linear-gradient(to top, rgb(0 0 0 / 1) 0%, rgb(0 0 0 / 0.55) 40%, transparent 100%)",
  WebkitBackdropFilter: "blur(4px)",
  WebkitMaskImage:
    "linear-gradient(to top, rgb(0 0 0 / 1) 0%, rgb(0 0 0 / 0.55) 40%, transparent 100%)",
} satisfies CSSProperties;

const transcriptTopFadeBlurStyle = {
  backdropFilter: "blur(4px)",
  maskImage:
    "linear-gradient(to bottom, rgb(0 0 0 / 1) 0%, rgb(0 0 0 / 0.55) 40%, transparent 100%)",
  WebkitBackdropFilter: "blur(4px)",
  WebkitMaskImage:
    "linear-gradient(to bottom, rgb(0 0 0 / 1) 0%, rgb(0 0 0 / 0.55) 40%, transparent 100%)",
} satisfies CSSProperties;

function TranscriptScrollFades({
  scrollAreaRef,
}: {
  scrollAreaRef: RefObject<HTMLDivElement | null>;
}) {
  const [activeEdges, setActiveEdges] = useState({
    bottom: false,
    top: false,
  });

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']"
    );
    if (!viewport) {
      return;
    }

    const update = () => {
      const canScroll = viewport.scrollHeight > viewport.clientHeight + 1;
      const remainingScroll =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const atTop = viewport.scrollTop <= TRANSCRIPT_TOP_THRESHOLD_PX;
      const atBottom = remainingScroll <= TRANSCRIPT_BOTTOM_THRESHOLD_PX;
      const nextActiveEdges = {
        bottom: canScroll && !atBottom,
        top: canScroll && !atTop,
      };
      setActiveEdges((current) =>
        current.bottom === nextActiveEdges.bottom &&
        current.top === nextActiveEdges.top
          ? current
          : nextActiveEdges
      );
    };

    update();
    viewport.addEventListener("scroll", update, { passive: true });

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver.observe(viewport.firstElementChild);
    }

    return () => {
      viewport.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, [scrollAreaRef]);

  return (
    <>
      <TranscriptScrollFadeEdge
        active={activeEdges.top}
        blurStyle={transcriptTopFadeBlurStyle}
        edge="top"
        gradientStyle={transcriptTopFadeGradientStyle}
      />
      <TranscriptScrollFadeEdge
        active={activeEdges.bottom}
        blurStyle={transcriptBottomFadeBlurStyle}
        edge="bottom"
        gradientStyle={transcriptBottomFadeGradientStyle}
      />
    </>
  );
}

function TranscriptScrollFadeEdge({
  active,
  blurStyle,
  edge,
  gradientStyle,
}: {
  active: boolean;
  blurStyle: CSSProperties;
  edge: "bottom" | "top";
  gradientStyle: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-2.5 left-0 z-10 h-16 opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none",
        edge === "top" ? "top-0" : "bottom-0",
        active && "opacity-100 duration-0"
      )}
      data-active={active ? "true" : "false"}
      data-edge={edge}
      data-slot="transcript-scroll-fade"
    >
      <div className="absolute inset-0" style={gradientStyle} />
      <div
        className="absolute inset-0 motion-reduce:hidden"
        style={blurStyle}
      />
    </div>
  );
}

function TranscriptSelectionToolbar({
  copySelection,
  cutSelection,
  onClear,
  restoreSelection,
  selection,
}: {
  copySelection: () => void;
  cutSelection: () => void;
  onClear: () => void;
  restoreSelection: () => void;
  selection: { cut: number; kept: number; total: number };
}) {
  return (
    <TooltipProvider>
      <div
        className="mx-auto mb-3 flex w-full max-w-2xl items-center gap-1.5 rounded-md border bg-background/95 p-1 shadow-sm"
        data-transcript-selection-toolbar
      >
        <Badge className="shrink-0" variant="secondary">
          {selection.total} selected
        </Badge>
        <div className="min-w-0 flex-1 truncate px-1 text-muted-foreground text-xs">
          {selection.kept} kept, {selection.cut} cut
        </div>
        <TranscriptSelectionTool
          disabled={selection.kept === 0}
          icon={<Scissors />}
          label="Cut selected"
          onClick={cutSelection}
          shortcut="Del"
        />
        <TranscriptSelectionTool
          disabled={selection.cut === 0}
          icon={<RotateCcw />}
          label="Restore selected"
          onClick={restoreSelection}
          shortcut="R"
        />
        <TranscriptSelectionTool
          icon={<Copy />}
          label="Copy text"
          onClick={copySelection}
          shortcut="Mod+C"
        />
        <TranscriptSelectionTool
          icon={<X />}
          label="Clear selection"
          onClick={onClear}
        />
      </div>
    </TooltipProvider>
  );
}

function TranscriptSelectionTool({
  disabled = false,
  icon,
  label,
  onClick,
  shortcut,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {icon}
          </Button>
        }
      />
      <TooltipContent>
        {label}
        {shortcut ? <span className="opacity-70">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function TranscriptWordButton({
  active,
  inBroll,
  inZoom,
  index,
  isActiveMatch,
  isMatch,
  isPendingCut,
  isSelected,
  onSelect,
  onViewInHistory,
  showProvenance = false,
  word,
}: {
  active: boolean;
  inBroll: boolean;
  inZoom: boolean;
  index: number;
  isActiveMatch: boolean;
  isMatch: boolean;
  isPendingCut: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onViewInHistory?: (revisionAfter: number) => void;
  showProvenance?: boolean;
  word: TranscriptWord;
}) {
  const provenanceTitle =
    showProvenance && word.authoredBy
      ? `${authorDisplayLabel(word.authoredBy)}${word.authoredRevision === undefined ? "" : ` · rev ${word.authoredRevision}`}`
      : word.deleted
        ? "Cut from video"
        : undefined;

  const span = (
    <span
      aria-current={active ? "true" : undefined}
      className={cn(
        "transcript-word cursor-text text-left leading-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
        word.deleted &&
          "text-muted-foreground/65 line-through decoration-1 decoration-muted-foreground/45",
        isPendingCut &&
          "underline decoration-2 decoration-primary/55 decoration-dashed underline-offset-[0.2em]",
        active && !word.deleted && "text-foreground",
        inBroll &&
          "underline decoration-1 decoration-border/60 underline-offset-[0.2em] opacity-95",
        inZoom && !word.deleted && "rounded-sm bg-muted/25",
        isMatch && "bg-primary/10",
        isActiveMatch && "bg-primary/12 ring-1 ring-primary/35 ring-inset"
      )}
      data-search-match={
        isMatch ? (isActiveMatch ? "active" : "true") : undefined
      }
      data-word-active={active && !word.deleted ? "true" : undefined}
      data-word-index={index}
      data-word-pending-cut={isPendingCut ? "true" : undefined}
      data-word-selected={isSelected ? "true" : undefined}
      onDoubleClick={onSelect}
      onMouseDown={(event) => {
        if (event.detail === 2) {
          event.preventDefault();
          onSelect();
        }
      }}
      title={provenanceTitle}
    >
      {word.text}
    </span>
  );

  if (!(showProvenance && word.authoredBy)) {
    return <>{span} </>;
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger render={span} />
        <TooltipContent className="flex flex-col gap-1" side="top">
          <span>{provenanceTitle}</span>
          {word.authoredRevision !== undefined && onViewInHistory ? (
            <Button
              className="h-auto self-start px-0 text-xs"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onViewInHistory(word.authoredRevision as number);
              }}
              type="button"
              variant="link"
            >
              View in history
            </Button>
          ) : null}
        </TooltipContent>
      </Tooltip>{" "}
    </>
  );
}

function readNativeWordRange(
  root: HTMLElement | null
): readonly [number, number] | null {
  if (!root) {
    return null;
  }
  const selection = window.getSelection();
  if (!(selection && selection.rangeCount > 0 && !selection.isCollapsed)) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (
    !(root.contains(range.startContainer) && root.contains(range.endContainer))
  ) {
    return null;
  }
  const start = closestWordIndex(range.startContainer);
  const end = closestWordIndex(range.endContainer);
  if (start === null || end === null) {
    return null;
  }
  return [Math.min(start, end), Math.max(start, end)];
}

function closestWordIndex(node: Node): number | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  const word = element?.closest("[data-word-index]");
  const raw = word?.getAttribute("data-word-index");
  if (raw === undefined || raw === null) {
    return null;
  }
  const index = Number(raw);
  return Number.isInteger(index) ? index : null;
}

function shouldIgnoreTranscriptShortcut(
  target: EventTarget | null,
  root: HTMLElement | null
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (root?.contains(target)) {
    return true;
  }
  if (target.closest("[data-transcript-selection-toolbar]")) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

// Expand inclusive [lo, hi] word-index ranges into a Set for O(1) lookups while
// rendering match highlights.
function rangeIndexSet(
  ranges?: ReadonlyArray<readonly [number, number]>
): Set<number> {
  const set = new Set<number>();
  for (const [lo, hi] of ranges ?? []) {
    for (let i = lo; i <= hi; i++) {
      set.add(i);
    }
  }
  return set;
}

function transcriptParagraphs(words: TranscriptWord[]) {
  const paragraphs: { index: number; word: TranscriptWord }[][] = [];
  let current: { index: number; word: TranscriptWord }[] = [];
  let sentenceCount = 0;

  for (const [index, word] of words.entries()) {
    current.push({ index, word });
    if (/[.!?]$/.test(word.text)) {
      sentenceCount += 1;
    }

    if (shouldEndParagraph(current.length, sentenceCount)) {
      paragraphs.push(current);
      current = [];
      sentenceCount = 0;
    }
  }

  if (current.length > 0) {
    paragraphs.push(current);
  }

  return paragraphs;
}

function shouldEndParagraph(paragraphLength: number, sentenceCount: number) {
  return sentenceCount >= 3 || paragraphLength >= 90;
}

function transcriptMinuteMarkers(
  words: TranscriptWord[]
): TranscriptMinuteMarker[] {
  const lastSample = words.at(-1)?.endSample ?? 0;
  const lastMinute = Math.floor(lastSample / (60 * TRANSCRIPT_SAMPLE_RATE));
  const markers: TranscriptMinuteMarker[] = [];
  let wordIndex = 0;

  for (let minute = 0; minute <= lastMinute; minute++) {
    const targetSample = minute * 60 * TRANSCRIPT_SAMPLE_RATE;
    while (
      wordIndex < words.length - 1 &&
      words[wordIndex].startSample < targetSample
    ) {
      wordIndex += 1;
    }
    if (words[wordIndex]) {
      markers.push({
        index: wordIndex,
        label: `${minute}:00`,
        minute,
      });
    }
  }

  return markers;
}
