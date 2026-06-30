"use client";

import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  onWordClick: (index: number, event: MouseEvent<HTMLButtonElement>) => void;
  selRange: readonly [number, number] | null;
  words: TranscriptWord[];
}

export function EditorTranscriptPanel({
  curSample,
  inBroll,
  inZoom,
  onWordClick,
  selRange,
  words,
}: EditorTranscriptPanelProps) {
  const cutCount = words.filter((word) => word.deleted).length;
  const selectedCount = selRange ? selRange[1] - selRange[0] + 1 : 0;

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="flex min-h-full flex-col px-4 pt-4 pb-12 sm:px-6">
        <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
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
            {selectedCount > 0 ? (
              <Badge variant="secondary">{selectedCount} selected</Badge>
            ) : null}
          </div>
        </header>

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
          <div className="max-w-[72ch] text-pretty text-left text-sm leading-7 sm:text-[0.95rem]">
            {words.map((word, index) => (
              <TranscriptWordButton
                active={
                  curSample >= word.startSample &&
                  curSample < word.endSample &&
                  !word.deleted
                }
                inBroll={inBroll(word)}
                inZoom={inZoom(word)}
                isSelected={
                  selRange != null &&
                  index >= selRange[0] &&
                  index <= selRange[1]
                }
                key={word.id}
                onClick={(event) => onWordClick(index, event)}
                word={word}
              />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function TranscriptWordButton({
  active,
  inBroll,
  inZoom,
  isSelected,
  onClick,
  word,
}: {
  active: boolean;
  inBroll: boolean;
  inZoom: boolean;
  isSelected: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  word: TranscriptWord;
}) {
  return (
    <>
      <button
        aria-current={active ? "true" : undefined}
        aria-label={`${word.deleted ? "Restore" : "Cut"} word: ${word.text}`}
        aria-pressed={word.deleted}
        className={cn(
          "inline-flex cursor-pointer items-baseline rounded-md border border-transparent px-1.5 py-0.5 text-left leading-5 transition-colors hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/80",
          word.deleted &&
            "text-muted-foreground line-through decoration-1 hover:text-foreground",
          active &&
            "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15",
          inBroll &&
            "underline decoration-2 decoration-border underline-offset-4",
          inZoom && "bg-muted hover:bg-muted/80",
          isSelected && "bg-accent ring-1 ring-ring/40 ring-inset"
        )}
        onClick={onClick}
        title={word.deleted ? "Deleted word" : "Kept word"}
        type="button"
      >
        {word.text}
      </button>{" "}
    </>
  );
}

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}
