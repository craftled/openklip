"use client";

import type { MouseEvent } from "react";
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
  onWordClick: (index: number, event: MouseEvent<HTMLSpanElement>) => void;
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
  return (
    <ScrollArea className="h-full">
      <div className="px-6 pt-4 pb-12">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Transcript
          </span>
          <span className="ml-auto text-muted-foreground text-xs">
            Click to cut · shift-click to select
          </span>
        </div>
        <p className="max-w-[60ch] text-sm leading-relaxed">
          {words.map((w, i) => {
            const active =
              curSample >= w.startSample &&
              curSample < w.endSample &&
              !w.deleted;
            const isSel =
              selRange != null && i >= selRange[0] && i <= selRange[1];
            return (
              <span
                className={cn(
                  "cursor-pointer rounded px-0.5 py-px transition-colors fine-hover:hover:bg-muted active:bg-muted/80",
                  w.deleted &&
                    "text-muted-foreground line-through decoration-1",
                  active && "bg-live/15 text-live",
                  inBroll(w) &&
                    "underline decoration-2 decoration-broll/70 underline-offset-4",
                  inZoom(w) && "bg-zoom/10",
                  isSel && "bg-live/10 ring-1 ring-live/40 ring-inset"
                )}
                key={w.id}
                onClick={(e) => onWordClick(i, e)}
              >
                {w.text}{" "}
              </span>
            );
          })}
        </p>
      </div>
    </ScrollArea>
  );
}
