"use client";

// frameNameForTime is pure (no node:fs) even though src/moment-search.ts
// re-exports it alongside fs-touching code, so importing the fs-free
// sibling module directly here keeps it out of that risk entirely (see
// that file's header). Mirrors how web/components/task-progress-panel.tsx
// imports @engine/agent-task-types.
import { frameNameForTime } from "@engine/moment-search-frame-name";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  type MomentSceneResult,
  type TranscriptWord,
  useMomentSearch,
} from "@/hooks/use-moment-search";
import { Search, X } from "@/lib/icon";
import {
  buildTextSnippet,
  countBadge,
  formatClock,
  MOMENT_SEARCH_RESULT_LIMIT,
  momentFrameThumbnailUrl,
} from "@/lib/moment-search-display";
import type { PhraseSearchMatch } from "@/lib/phrase-search";
import { cn } from "@/lib/utils";

interface MomentSearchPanelProps {
  onSeek: (sourceSec: number) => void;
  slug: string;
  words: TranscriptWord[];
}

// A moment result's thumbnail + timestamp badge + arbitrary detail line,
// shared by both tabs. Each card carries its own span (fromSec/toSec) as
// data attributes: slice 3 turns these into drag sources, so the span data
// needs to already live on the card rather than being threaded in later.
function MomentResultCard({
  children,
  fromSec,
  onSeek,
  slug,
  thumbnailName,
  toSec,
}: {
  children: ReactNode;
  fromSec: number;
  onSeek: (sourceSec: number) => void;
  slug: string;
  thumbnailName: string;
  toSec: number;
}) {
  return (
    <li>
      <button
        className="group/moment-card block w-full overflow-hidden rounded-md text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        data-moment-card
        data-moment-from-sec={fromSec}
        data-moment-to-sec={toSec}
        onClick={() => onSeek(fromSec)}
        type="button"
      >
        <span className="relative block aspect-video overflow-hidden rounded-md bg-muted">
          {/* biome-ignore lint/performance/noImgElement: local project frame thumbnail */}
          <img
            alt=""
            className="h-full w-full object-cover"
            height={108}
            src={momentFrameThumbnailUrl(slug, thumbnailName)}
            width={192}
          />
          <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 font-medium text-[11px] text-white tabular-nums leading-none">
            {formatClock(fromSec)}
          </span>
        </span>
        {children}
      </button>
    </li>
  );
}

function TextResultCard({
  match,
  onSeek,
  slug,
  words,
}: {
  match: PhraseSearchMatch;
  onSeek: (sourceSec: number) => void;
  slug: string;
  words: TranscriptWord[];
}) {
  const snippet = buildTextSnippet(words, match);
  return (
    <MomentResultCard
      fromSec={match.fromSec}
      onSeek={onSeek}
      slug={slug}
      thumbnailName={frameNameForTime(match.fromSec)}
      toSec={match.toSec}
    >
      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground leading-4">
        {snippet.before ? `${snippet.before} ` : ""}
        <strong className="font-semibold text-foreground">
          {snippet.match}
        </strong>
        {snippet.after ? ` ${snippet.after}` : ""}
      </p>
    </MomentResultCard>
  );
}

function SceneResultCard({
  onSeek,
  result,
  slug,
}: {
  onSeek: (sourceSec: number) => void;
  result: MomentSceneResult;
  slug: string;
}) {
  const thumbnailName = result.bestFrame ?? frameNameForTime(result.fromSec);
  return (
    <MomentResultCard
      fromSec={result.fromSec}
      onSeek={onSeek}
      slug={slug}
      thumbnailName={thumbnailName}
      toSec={result.toSec}
    >
      {result.summary ? (
        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground leading-4">
          {result.summary}
        </p>
      ) : null}
    </MomentResultCard>
  );
}

function HintBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-foreground/3 px-3 py-6 text-center text-muted-foreground text-xs">
      {children}
    </div>
  );
}

function IndexingRow() {
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border bg-foreground/3 px-3 py-2.5 text-muted-foreground text-xs"
      data-moment-indexing
    >
      <Spinner className="size-3.5 shrink-0" />
      Indexing footage - first run only
    </div>
  );
}

function ErrorRow({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-4 text-center text-xs"
      data-moment-error
    >
      <p className="text-destructive">Couldn't build the visual index.</p>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">
        Retry
      </Button>
    </div>
  );
}

export function MomentSearchPanel({
  onSeek,
  slug,
  words,
}: MomentSearchPanelProps) {
  const search = useMomentSearch({ slug, words });
  const {
    activeTab,
    buildErrored,
    clearQuery,
    hasWords,
    indexed,
    query,
    queryInputRef,
    retryBuild,
    sceneResults,
    setActiveTab,
    setQuery,
    textResults,
  } = search;

  const queryEmpty = query.trim().length === 0;
  const queryTooShortForScene = query.trim().length < 2;

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      clearQuery();
    }
  };

  let textBody: ReactNode;
  if (!hasWords) {
    textBody = <HintBlock>No transcript.</HintBlock>;
  } else if (queryEmpty) {
    textBody = <HintBlock>Find moments: try &apos;laughing&apos;</HintBlock>;
  } else if (textResults.length === 0) {
    textBody = <HintBlock>No transcript matches.</HintBlock>;
  } else {
    textBody = (
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
        {textResults.map((match) => (
          <TextResultCard
            key={`${match.range[0]}-${match.range[1]}`}
            match={match}
            onSeek={onSeek}
            slug={slug}
            words={words}
          />
        ))}
      </ul>
    );
  }

  let sceneBody: ReactNode;
  if (buildErrored) {
    sceneBody = <ErrorRow onRetry={retryBuild} />;
  } else if (!indexed) {
    sceneBody = <IndexingRow />;
  } else if (queryEmpty || queryTooShortForScene) {
    sceneBody = <HintBlock>Find moments: try &apos;laughing&apos;</HintBlock>;
  } else if (sceneResults.length === 0) {
    sceneBody = <HintBlock>No scene matches.</HintBlock>;
  } else {
    sceneBody = (
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
        {sceneResults.map((result) => (
          <SceneResultCard
            key={`${result.fromSec}-${result.toSec}-${result.source}`}
            onSeek={onSeek}
            result={result}
            slug={slug}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="px-1" data-moment-search-panel>
      <div className="sticky top-0 z-10 -mx-1 mb-2 bg-sidebar/95 px-1 pb-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search moments"
            className="h-9 w-full rounded-md border border-transparent bg-foreground/7 pr-8 pl-8 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:bg-background"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search moments"
            ref={queryInputRef}
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={clearQuery}
              type="button"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-1">
          <Button
            aria-pressed={activeTab === "text"}
            className={cn(
              "h-7 rounded-md px-2 text-xs",
              activeTab === "text"
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "text-muted-foreground hover:bg-foreground/5"
            )}
            onClick={() => setActiveTab("text")}
            size="sm"
            type="button"
            variant="ghost"
          >
            Text
            <span className="ml-1 text-[10px] opacity-65">
              {countBadge(textResults.length, MOMENT_SEARCH_RESULT_LIMIT)}
            </span>
          </Button>
          <Button
            aria-pressed={activeTab === "scene"}
            className={cn(
              "h-7 rounded-md px-2 text-xs",
              activeTab === "scene"
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "text-muted-foreground hover:bg-foreground/5"
            )}
            onClick={() => setActiveTab("scene")}
            size="sm"
            type="button"
            variant="ghost"
          >
            Scene
            <span className="ml-1 text-[10px] opacity-65">
              {countBadge(sceneResults.length, MOMENT_SEARCH_RESULT_LIMIT)}
            </span>
          </Button>
        </div>
      </div>

      <div className="pb-1">{activeTab === "text" ? textBody : sceneBody}</div>
    </div>
  );
}
