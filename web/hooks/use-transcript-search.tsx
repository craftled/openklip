"use client";

import type { Project as EngineProject } from "@engine/edl";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TranscriptSearch } from "@/components/transcript-search";
import { useModShortcut } from "@/hooks/use-mod-shortcut";
import { isModKeyOnly, isTypingTarget } from "@/lib/keyboard-shortcuts";
import {
  type PhraseSearchMatch,
  type PhraseSearchMode,
  phraseSearchMatches,
} from "@/lib/phrase-search";
import { reanchoredWordUpdate } from "@/lib/reanchored-word-update";
import type { ActionResult } from "../../app/actions.ts";
import { runGuiAction } from "../../app/actions.ts";

interface TranscriptWord {
  deleted: boolean;
  endSample: number;
  id: string;
  startSample: number;
  text: string;
}

export interface UseTranscriptSearchParams {
  enqueueSave: (task: () => Promise<ActionResult>) => void;
  onSeek: (sourceSec: number) => void;
  selectTranscriptRange: (range: readonly [number, number] | null) => void;
  setProject: Dispatch<SetStateAction<EngineProject>>;
  slug: string;
  words: TranscriptWord[];
}

export function useTranscriptSearch({
  enqueueSave,
  onSeek,
  selectTranscriptRange,
  setProject,
  slug,
  words,
}: UseTranscriptSearchParams) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<PhraseSearchMode>("kept");
  const [searchNote, setSearchNote] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null);
  const transcriptSearchInputRef = useRef<HTMLInputElement>(null);
  const searchShortcutLabel = useModShortcut("f");

  const searchMatches = phraseSearchMatches({ words }, searchQuery, {
    mode: searchMode,
  });
  const activeSearchIndex =
    activeMatchIndex != null && activeMatchIndex < searchMatches.length
      ? activeMatchIndex
      : null;
  const activeSearchRange =
    activeSearchIndex == null ? null : searchMatches[activeSearchIndex].range;
  const searchMatchRanges = searchMatches.map((m) => m.range);

  const changeSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setActiveMatchIndex(null);
  }, []);

  const changeSearchMode = useCallback((mode: PhraseSearchMode) => {
    setSearchMode(mode);
    setActiveMatchIndex(null);
  }, []);

  const clearTranscriptSearch = useCallback(() => {
    setSearchQuery("");
    setActiveMatchIndex(null);
  }, []);

  const seekSearchMatch = useCallback(
    (match: PhraseSearchMatch, index: number) => {
      setActiveMatchIndex(index);
      onSeek(match.fromSec);
    },
    [onSeek]
  );

  const seekNextSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) {
      return;
    }
    const next =
      activeSearchIndex == null
        ? 0
        : (activeSearchIndex + 1) % searchMatches.length;
    setActiveMatchIndex(next);
    onSeek(searchMatches[next].fromSec);
  }, [activeSearchIndex, onSeek, searchMatches]);

  const selectSearchMatch = useCallback(
    (match: PhraseSearchMatch, index: number) => {
      setActiveMatchIndex(index);
      selectTranscriptRange(match.range);
    },
    [selectTranscriptRange]
  );

  const cutSearchMatches = useCallback(
    (all: boolean) => {
      const phrase = searchQuery.trim();
      const targets = all ? searchMatches : searchMatches.slice(0, 1);
      if (!phrase || targets.length === 0) {
        return;
      }
      const ids = targets.flatMap((m) => m.ids);
      const note = searchNote.trim();
      setProject((prev) =>
        reanchoredWordUpdate(prev as EngineProject, new Set(ids), true)
      );
      setActiveMatchIndex(null);
      enqueueSave(() =>
        runGuiAction(slug, "cut", {
          ids,
          deleted: true,
          note: note === "" ? undefined : note,
        })
      );
    },
    [enqueueSave, searchMatches, searchNote, searchQuery, setProject, slug]
  );

  const restoreSearchMatches = useCallback(
    (all: boolean) => {
      const targets = all ? searchMatches : searchMatches.slice(0, 1);
      const ids = targets.flatMap((m) => m.ids);
      if (ids.length === 0) {
        return;
      }
      setProject((prev) =>
        reanchoredWordUpdate(prev as EngineProject, new Set(ids), false)
      );
      setActiveMatchIndex(null);
      enqueueSave(() => runGuiAction(slug, "cut", { ids, deleted: false }));
    },
    [enqueueSave, searchMatches, setProject, slug]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModKeyOnly(event) || event.key.toLowerCase() !== "f") {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      transcriptSearchInputRef.current?.focus();
      transcriptSearchInputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const searchField = (
    <TranscriptSearch
      activeMatchIndex={activeSearchIndex}
      matches={searchMatches}
      mode={searchMode}
      note={searchNote}
      onCutMatches={cutSearchMatches}
      onModeChange={changeSearchMode}
      onNoteChange={setSearchNote}
      onQueryChange={changeSearchQuery}
      onRestoreMatches={restoreSearchMatches}
      onSearchClear={clearTranscriptSearch}
      onSeekMatch={seekSearchMatch}
      onSeekNextMatch={seekNextSearchMatch}
      onSelectMatch={selectSearchMatch}
      query={searchQuery}
      searchInputRef={transcriptSearchInputRef}
      shortcutLabel={searchShortcutLabel}
    />
  );

  return {
    activeSearchIndex,
    activeSearchRange,
    searchField,
    searchMatchRanges,
    searchMatches,
  };
}
