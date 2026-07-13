"use client";

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scan, Scissors, Search } from "@/lib/icon";
import type { PhraseSearchMatch } from "@/lib/phrase-search";
import { cn } from "@/lib/utils";

interface TranscriptSearchProps {
  activeMatchIndex: number | null;
  matches: PhraseSearchMatch[];
  note: string;
  onCutMatches: (all: boolean) => void;
  onNoteChange: (note: string) => void;
  onQueryChange: (query: string) => void;
  onSearchClear: () => void;
  onSeekMatch: (match: PhraseSearchMatch, index: number) => void;
  onSeekNextMatch: () => void;
  onSelectMatch: (match: PhraseSearchMatch, index: number) => void;
  query: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

// Presentational phrase-search bar for the transcript panel: a compact search
// input, match rows (click seeks, the side affordance selects the match as an
// editable span), and batch cut buttons that preview affected-word counts. All
// state and behavior live in the caller.
export function TranscriptSearch({
  activeMatchIndex,
  matches,
  note,
  onCutMatches,
  onNoteChange,
  onQueryChange,
  onSearchClear,
  onSeekMatch,
  onSeekNextMatch,
  onSelectMatch,
  query,
  searchInputRef,
}: TranscriptSearchProps) {
  const searching = query.trim().length > 0;
  const firstWordCount = matches[0]?.ids.length ?? 0;
  const allWordCount = matches.reduce((n, m) => n + m.ids.length, 0);

  const onQueryKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSeekNextMatch();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onSearchClear();
    }
  };

  return (
    <div className="flex w-full flex-col gap-2" data-transcript-search>
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search transcript"
          className="h-9 rounded-md border-border/55 bg-background pl-7 font-[450] text-[13px] leading-normal shadow-none transition-colors placeholder:font-[450] hover:bg-muted/25 focus-visible:bg-background sm:h-8"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onQueryKeyDown}
          placeholder="Search transcript"
          ref={searchInputRef}
          value={query}
        />
      </div>

      {searching ? (
        <>
          <div className="flex items-center gap-1.5">
            <Badge data-transcript-search-count variant="secondary">
              {plural(matches.length, "match", "matches")}
            </Badge>
            {matches.length > 0 ? (
              <span className="truncate font-[450] text-[12px] text-muted-foreground leading-normal">
                Enter jumps to the next match
              </span>
            ) : null}
          </div>

          {matches.length === 0 ? (
            <p
              className="px-1 pb-1 font-[450] text-[12px] text-muted-foreground leading-normal"
              data-transcript-search-empty
            >
              No matches. Matching ignores punctuation and case.
            </p>
          ) : (
            <ul
              className="flex max-h-40 flex-col gap-0.5 overflow-y-auto"
              data-transcript-search-matches
            >
              {matches.map((match, index) => (
                <li
                  className="flex items-center gap-1"
                  key={`${match.range[0]}-${match.range[1]}`}
                >
                  <button
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 py-1 text-left font-[450] text-[12px] leading-normal transition-[color,background-color,scale] hover:bg-muted active:scale-[0.98]",
                      index === activeMatchIndex && "bg-accent"
                    )}
                    data-transcript-search-match
                    onClick={() => onSeekMatch(match, index)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {match.text}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatMatchTimecode(match.fromSec)}
                    </span>
                  </button>
                  <Button
                    aria-label={`Select match ${index + 1} as span`}
                    data-transcript-search-select
                    onClick={() => onSelectMatch(match, index)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Scan />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <label className="sr-only" htmlFor="transcript-search-note">
              Cut note
            </label>
            <Input
              className="h-7 min-w-24 flex-1 font-[450] text-[12px] leading-normal placeholder:font-[450]"
              id="transcript-search-note"
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Note (optional)"
              value={note}
            />
            <Button
              className="font-medium text-[13px] leading-normal"
              data-transcript-search-cut-first
              disabled={matches.length === 0}
              onClick={() => onCutMatches(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Scissors data-icon="inline-start" />
              Cut first ({plural(firstWordCount, "word", "words")})
            </Button>
            <Button
              className="font-medium text-[13px] leading-normal"
              data-transcript-search-cut-all
              disabled={matches.length === 0}
              onClick={() => onCutMatches(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Scissors data-icon="inline-start" />
              Cut all ({plural(allWordCount, "word", "words")})
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// m:ss timecode for match rows (source time).
export function formatMatchTimecode(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
