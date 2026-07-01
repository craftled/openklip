"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
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
import { selectedWordStats } from "@/lib/transcript-edit";
import { cn } from "@/lib/utils";

interface TranscriptWord {
  deleted: boolean;
  endSample: number;
  id: string;
  startSample: number;
  text: string;
}

interface EditorTranscriptPanelProps {
  curSample: number;
  inBroll: (word: TranscriptWord) => boolean;
  inZoom: (word: TranscriptWord) => boolean;
  onCutSelection: (range?: readonly [number, number] | null) => void;
  onRestoreSelection: (range?: readonly [number, number] | null) => void;
  onSelectRange: (range: readonly [number, number] | null) => void;
  onTextEdit: (text: string) => void;
  selRange: readonly [number, number] | null;
  words: TranscriptWord[];
}

export function EditorTranscriptPanel({
  curSample,
  inBroll,
  inZoom,
  onCutSelection,
  onRestoreSelection,
  onSelectRange,
  onTextEdit,
  selRange,
  words,
}: EditorTranscriptPanelProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorMounted, setEditorMounted] = useState(false);
  const cutCount = words.filter((word) => word.deleted).length;
  const paragraphs = transcriptParagraphs(words);
  const selection = selectedWordStats(words, selRange);

  useEffect(() => {
    setEditorMounted(true);
  }, []);

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
    <ScrollArea className="h-full min-h-0">
      <div className="flex min-h-full flex-col px-4 pt-4 pb-12 sm:px-6">
        <header className="mx-auto mb-4 flex w-full max-w-[78ch] flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Transcript
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto sm:justify-end">
            <Badge variant="outline">{plural(words.length, "word")}</Badge>
            {cutCount > 0 ? (
              <Badge variant="secondary">{cutCount} cut</Badge>
            ) : null}
            {selection.total > 0 ? (
              <Badge variant="secondary">{selection.total} selected</Badge>
            ) : null}
          </div>
        </header>

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
              <EmptyTitle>No transcript yet</EmptyTitle>
              <EmptyDescription>
                Ingested projects show their word-level transcript here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          // biome-ignore lint/a11y/useSemanticElements: contenteditable keeps per-word timing spans; a textarea cannot carry word ids.
          <div
            aria-label="Transcript editor"
            aria-multiline="true"
            className="mx-auto w-full max-w-[80ch] rounded-md text-left text-foreground text-sm leading-7 tracking-normal outline-none selection:bg-primary/20 focus-visible:ring-3 focus-visible:ring-ring/30 sm:text-[0.95rem]"
            contentEditable={editorMounted ? true : undefined}
            onBlur={commitEditedText}
            onKeyDown={onEditorKeyDown}
            ref={editorRef}
            role="textbox"
            suppressContentEditableWarning
            tabIndex={0}
          >
            {paragraphs.map((paragraph) => (
              <p
                className="text-pretty [&:not(:first-child)]:mt-4"
                key={paragraph[0]?.word.id}
              >
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
                    word={word}
                  />
                ))}
              </p>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
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
        className="mx-auto mb-3 flex w-full max-w-[80ch] items-center gap-1.5 rounded-md border bg-background/95 p-1 shadow-sm"
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
  icon: React.ReactNode;
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
  isSelected,
  onSelect,
  word,
}: {
  active: boolean;
  inBroll: boolean;
  inZoom: boolean;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  word: TranscriptWord;
}) {
  return (
    <span
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline cursor-text rounded-[2px] border border-transparent px-0.5 py-0 text-left align-baseline leading-[inherit] transition-colors hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/80",
        word.deleted &&
          "text-muted-foreground line-through decoration-1 hover:text-foreground",
        active &&
          "bg-transparent text-primary underline decoration-primary/50 underline-offset-4 hover:bg-primary/5",
        inBroll &&
          "underline decoration-2 decoration-border underline-offset-4",
        inZoom && "bg-muted hover:bg-muted/80",
        isSelected && "bg-accent ring-1 ring-ring/40 ring-inset"
      )}
      data-word-index={index}
      onDoubleClick={onSelect}
      onMouseDown={(event) => {
        if (event.detail === 2) {
          event.preventDefault();
          onSelect();
        }
      }}
      title={word.deleted ? "Deleted word" : "Kept word"}
    >
      {word.text}{" "}
    </span>
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

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}
