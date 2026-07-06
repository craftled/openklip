"use client";

import type { ComponentProps, ReactNode } from "react";
import { useCallback, useMemo } from "react";
import type { ConfigEditTabProps } from "@/components/config/config-edit-tab";
import {
  type ConfigHistoryTabProps,
  ConfigPanel,
  type ConfigPanelProps,
  type ConfigToolsTabProps,
} from "@/components/config/config-panel";
import type { ConfigProjectTabProps } from "@/components/config/config-project-tab";
import type { LookTabPanelProps } from "@/components/config/look-tab-panel";
import type {
  TimelineClipKind,
  TimelineTiming,
} from "@/components/edit-timeline";
import type { EditorToolsControls } from "@/components/editor-tools-controls";
import {
  type UseEditorTimelineParams,
  useEditorTimeline,
} from "@/hooks/use-editor-timeline";
import {
  buildConfigInspectorSummary,
  type ConfigInspectorSummaryInput,
} from "@/lib/config-inspector";
import type { ConfigTabId } from "@/lib/config-tabs";
import { formatEditorTime } from "@/lib/format-time";

export interface UseConfigPanelPlayback {
  curSec: number;
  fullDurationSec: number;
  keptDurationSec: number;
  loop: { inSec: number; outSec: number } | null;
  onClearLoop: () => void;
  onSetLoop: (loop: { inSec: number; outSec: number }) => void;
  outPos: number;
}

export interface UseConfigPanelTimelineCallbacks {
  curSec: number;
  durationSamples: number;
  durationSec: number;
  onClipTiming: (
    kind: TimelineClipKind,
    id: string,
    timing: TimelineTiming,
    commit: boolean
  ) => void;
  onSeek: (sec: number) => void;
  onSelect: (kind: TimelineClipKind, id: string) => void;
  onWordClick: (index: number, shiftKey: boolean) => void;
  ranges: { endSec: number; startSec: number }[];
  sampleRate: number;
  selected: { kind: TimelineClipKind; id: string } | null;
  selRange: readonly [number, number] | null;
}

export interface UseConfigPanelParams {
  activeTab: ConfigTabId;
  edit: ConfigEditTabProps;
  embedded?: boolean;
  history: ConfigHistoryTabProps;
  inspector: ConfigInspectorSummaryInput;
  look: LookTabPanelProps;
  onCloseConfig: () => void;
  onTabChange: (tab: ConfigTabId) => void;
  playback: UseConfigPanelPlayback;
  project: ConfigProjectTabProps;
  timeline: UseEditorTimelineParams;
  timelineCallbacks: UseConfigPanelTimelineCallbacks;
}

export function useConfigPanel({
  activeTab,
  edit,
  embedded = false,
  history,
  inspector,
  look,
  onCloseConfig,
  onTabChange,
  playback,
  project,
  timeline,
  timelineCallbacks,
}: UseConfigPanelParams): ReactNode {
  const {
    timelineBroll,
    timelineGraphics,
    timelineLibraryStills,
    timelineMusic,
    timelinePlacedMusic,
    timelinePlacedStills,
    timelineTitles,
    timelineWords,
    timelineZooms,
  } = useEditorTimeline(timeline);

  const inspectorSummary = useMemo(
    () => buildConfigInspectorSummary(inspector),
    [inspector]
  );

  const closeLabel = embedded ? "Back to chats" : "Hide config";

  const handleClose = useCallback(() => {
    onCloseConfig();
  }, [onCloseConfig]);

  const tools: ConfigToolsTabProps = useMemo(
    () => ({
      curSec: playback.curSec,
      fmtTime: formatEditorTime,
      fullDurationSec: playback.fullDurationSec,
      keptDurationSec: playback.keptDurationSec,
      loop: playback.loop,
      onClearLoop: playback.onClearLoop,
      onSetLoop: playback.onSetLoop,
      outPos: playback.outPos,
      timeline: {
        broll: timelineBroll,
        curSec: timelineCallbacks.curSec,
        durationSamples: timelineCallbacks.durationSamples,
        durationSec: timelineCallbacks.durationSec,
        fmtTime: formatEditorTime,
        graphics: timelineGraphics,
        libraryMusic: timelineMusic,
        libraryStills: timelineLibraryStills,
        music: timelinePlacedMusic,
        onClipTiming: timelineCallbacks.onClipTiming,
        onSeek: timelineCallbacks.onSeek,
        onSelect: timelineCallbacks.onSelect,
        onWordClick: timelineCallbacks.onWordClick,
        ranges: timelineCallbacks.ranges,
        sampleRate: timelineCallbacks.sampleRate,
        selected: timelineCallbacks.selected,
        selRange: timelineCallbacks.selRange,
        stills: timelinePlacedStills,
        titles: timelineTitles,
        wordSpans: timelineWords,
        zooms: timelineZooms,
      } satisfies ComponentProps<typeof EditorToolsControls>["timeline"],
    }),
    [
      playback,
      timelineBroll,
      timelineCallbacks,
      timelineGraphics,
      timelineLibraryStills,
      timelineMusic,
      timelinePlacedMusic,
      timelinePlacedStills,
      timelineTitles,
      timelineWords,
      timelineZooms,
    ]
  );

  const panelProps: ConfigPanelProps = {
    activeTab,
    closeLabel,
    edit,
    embedded,
    history,
    inspectorSummary,
    look,
    onClose: handleClose,
    onTabChange,
    project,
    tools,
  };

  return <ConfigPanel {...panelProps} />;
}
