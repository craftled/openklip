"use client";

import type { Keyframe } from "@engine/keyframes";
import { useMemo } from "react";

interface TimelineWord {
  deleted: boolean;
  endSample: number;
  id: string;
  startSample: number;
}

interface TimelineClip {
  endSample: number;
  id: string;
  startSample: number;
}

interface TimelineBroll extends TimelineClip {
  assetId: string;
}

interface TimelineTitle {
  endSample: number;
  id: string;
  startSample: number;
  text: string;
}

interface TimelineZoom {
  endSample: number;
  id: string;
  rampSec: number;
  scale: number;
  startSample: number;
}

interface TimelineGraphic {
  endSample: number;
  id: string;
  keyframes?: Keyframe[];
  startSample: number;
  template?: string;
  type?: string;
}

interface TimelineStill {
  assetId: string;
  endSample: number;
  id: string;
  startSample: number;
}

interface TimelineMusicPlacement {
  assetId: string;
  endSample: number;
  id: string;
  startSample: number;
}

interface TimelineAsset {
  durationSamples: number;
  id: string;
  kind?: "broll" | "music" | "still";
  name: string;
}

export interface UseEditorTimelineParams {
  assetName: (id: string) => string;
  assets: TimelineAsset[];
  broll: TimelineBroll[];
  graphics?: TimelineGraphic[];
  music?: TimelineMusicPlacement[];
  sampleRate: number;
  stills?: TimelineStill[];
  titles: TimelineTitle[];
  words: TimelineWord[];
  zooms: TimelineZoom[];
}

export function useEditorTimeline({
  assetName,
  assets,
  broll,
  graphics,
  music,
  sampleRate: sr,
  stills,
  titles,
  words,
  zooms,
}: UseEditorTimelineParams) {
  const timelineWords = useMemo(
    () =>
      words.map((w, index) => ({
        id: w.id,
        index,
        startSample: w.startSample,
        endSample: w.endSample,
        startSec: w.startSample / sr,
        endSec: w.endSample / sr,
        deleted: w.deleted,
      })),
    [sr, words]
  );

  const timelineBroll = useMemo(
    () =>
      broll.map((b) => ({
        id: b.id,
        startSample: b.startSample,
        endSample: b.endSample,
        startSec: b.startSample / sr,
        endSec: b.endSample / sr,
        label: assetName(b.assetId),
      })),
    [assetName, broll, sr]
  );

  const timelineZooms = useMemo(
    () =>
      zooms.map((z) => ({
        id: z.id,
        startSample: z.startSample,
        endSample: z.endSample,
        startSec: z.startSample / sr,
        endSec: z.endSample / sr,
        label: `${z.scale.toFixed(2)}x`,
      })),
    [sr, zooms]
  );

  const timelineTitles = useMemo(
    () =>
      titles.map((t) => ({
        id: t.id,
        startSample: t.startSample,
        endSample: t.endSample,
        startSec: t.startSample / sr,
        endSec: t.endSample / sr,
        label: t.text.replace(/\n/g, " · "),
      })),
    [sr, titles]
  );

  const timelineGraphics = useMemo(
    () =>
      (graphics ?? []).map((g) => ({
        id: g.id,
        startSample: g.startSample,
        endSample: g.endSample,
        startSec: g.startSample / sr,
        endSec: g.endSample / sr,
        keyframes: g.keyframes,
        label:
          g.type === "json-render"
            ? "Announcement graphic"
            : `Graphic: ${g.template}`,
      })),
    [graphics, sr]
  );

  const timelinePlacedStills = useMemo(
    () =>
      (stills ?? []).map((s) => ({
        id: s.id,
        startSample: s.startSample,
        endSample: s.endSample,
        startSec: s.startSample / sr,
        endSec: s.endSample / sr,
        label: assetName(s.assetId),
      })),
    [assetName, sr, stills]
  );

  const timelineMusic = useMemo(
    () =>
      assets
        .filter((a) => a.kind === "music")
        .map((a) => ({
          id: a.id,
          startSample: 0,
          endSample: a.durationSamples,
          startSec: 0,
          endSec: a.durationSamples / sr,
          label: a.name,
        })),
    [assets, sr]
  );

  const timelinePlacedMusic = useMemo(
    () =>
      (music ?? []).map((m) => ({
        id: m.id,
        startSample: m.startSample,
        endSample: m.endSample,
        startSec: m.startSample / sr,
        endSec: m.endSample / sr,
        label: assetName(m.assetId),
      })),
    [assetName, music, sr]
  );

  const timelineLibraryStills = useMemo(
    () =>
      assets
        .filter((a) => a.kind === "still")
        .map((a) => ({
          id: a.id,
          startSample: 0,
          endSample: a.durationSamples,
          startSec: 0,
          endSec: a.durationSamples / sr,
          label: a.name,
        })),
    [assets, sr]
  );

  return {
    timelineBroll,
    timelineGraphics,
    timelineLibraryStills,
    timelineMusic,
    timelinePlacedMusic,
    timelinePlacedStills,
    timelineTitles,
    timelineWords,
    timelineZooms,
  };
}
