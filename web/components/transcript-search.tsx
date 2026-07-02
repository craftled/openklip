"use client";

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RotateCcw, Scan, Scissors, Search } from "@/lib/icon";
import type { PhraseSearchMatch, PhraseSearchMode } from "@/lib/phrase-search";
import { firstToggleValue } from "@/lib/toggle-value";
import { cn } from "@/lib/utils";

interface TranscriptSearchProps {
  activeMatchIndex: number | null;
  matches: PhraseSearchMatch[];
  mode: PhraseSearchMode;
  note: string;
  onCutMatches: (all: boolean) => void;
  onModeChange: (mode: PhraseSearchMode) => void;
  onNoteChange: (note: string) => void;
  onQueryChange: (query: string) => void;
  onRestoreMatches: (all: boolean) => void;
  onSearchClear: () => void;
  onSeekMatch: (match: PhraseSearchMatch, index: number) => void;
  onSeekNextMatch: () => void;
  onSelectMatch: (match: PhraseSearchMatch, index: number) => void;
  query: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  shortcutLabel?: string;
}

// Presentational phrase-search bar for the transcript panel: search input,
// kept/cut scope toggle, match rows (click seeks, the side affordance selects
// the match as an editable span), and batch cut/restore buttons that preview
// the affected-word count. All state and behavior live in the caller.
export function TranscriptSearch({
  activeMatchIndex,
  matches,
  mode,
  note,
  onCutMatches,
  onModeChange,
  onNoteChange,
  onQueryChange,
  onRestoreMatches,
  onSearchClear,
  onSeekMatch,
  onSeekNextMatch,
  onSelectMatch,
  query,
  searchInputRef,
  shortcutLabel,
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
    <div
      className="flex w-full flex-col gap-2 rounded-md border bg-background/95 p-2 shadow-sm"
      data-transcript-search
    >
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search transcript"
            className="h-8 pr-12 pl-7"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onQueryKeyDown}
            placeholder="Search transcript"
            ref={searchInputRef}
            value={query}
          />
          {shortcutLabel ? (
            <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">
              {shortcutLabel}
            </Kbd>
          ) : null}
        </div>
        <ToggleGroup
          aria-label="Search scope"
          onValueChange={(value) => {
            const next = firstToggleValue(value);
            if (next === "kept" || next === "cut") {
              onModeChange(next);
            }
          }}
          size="sm"
          value={mode}
          variant="outline"
        >
          <ToggleGroupItem aria-label="Search kept words" value="kept">
            Kept
          </ToggleGroupItem>
          <ToggleGroupItem aria-label="Search cut words" value="cut">
            Cut
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {searching ? (
        <>
          <div className="flex items-center gap-1.5">
            <Badge data-transcript-search-count variant="secondary">
              {plural(matches.length, "match", "matches")}
            </Badge>
            {matches.length > 0 ? (
              <span className="truncate text-muted-foreground text-xs">
                Enter jumps to the next match
              </span>
            ) : null}
          </div>

          {matches.length === 0 ? (
            <p
              className="px-1 pb-1 text-muted-foreground text-xs"
              data-transcript-search-empty
            >
              No matches in {mode} words. Matching ignores punctuation and case.
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
                      "flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted",
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
              className="h-7 min-w-24 flex-1 text-base md:text-xs"
              id="transcript-search-note"
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Note (optional)"
              value={note}
            />
            {mode === "kept" ? (
              <>
                <Button
                  data-transcript-search-cut-first
                  disabled={matches.length === 0}
                  onClick={() => onCutMatches(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Scissors />
                  Cut first ({plural(firstWordCount, "word", "words")})
                </Button>
                <Button
                  data-transcript-search-cut-all
                  disabled={matches.length === 0}
                  onClick={() => onCutMatches(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Scissors />
                  Cut all ({plural(allWordCount, "word", "words")})
                </Button>
              </>
            ) : (
              <>
                <Button
                  data-transcript-search-restore-first
                  disabled={matches.length === 0}
                  onClick={() => onRestoreMatches(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw />
                  Restore ({plural(firstWordCount, "word", "words")})
                </Button>
                <Button
                  data-transcript-search-restore-all
                  disabled={matches.length === 0}
                  onClick={() => onRestoreMatches(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw />
                  Restore all ({plural(allWordCount, "word", "words")})
                </Button>
              </>
            )}
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
