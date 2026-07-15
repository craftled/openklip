import type { SilenceSpan } from "@engine/audio-analysis-core";
import type { MulticamProvenance } from "@engine/cam-mix";
import type {
  Audio,
  CleanupSettings,
  ColorAdjust,
  CutSnap,
  CutTransition,
  ExportSettings,
  Filter,
  Highlights,
} from "@engine/edl";
import { AudioSchema, CutSnapSchema } from "@engine/edl";
import type { AudioPatch } from "@/components/audio-controls";
import type { TimelineClipKind } from "@/components/edit-timeline";
import type { GraphicItem } from "@/components/graphic-item";
import type { MusicPlacementView } from "@/components/music-controls";
import type { DeadAirItem } from "@/lib/dead-air-state";

export interface EditorWord {
  deleted: boolean;
  endSample: number;
  id: string;
  startSample: number;
  text: string;
}

export interface EditorAsset {
  card?: { bestFor?: string[]; summary: string; tags?: string[] };
  durationSamples: number;
  id: string;
  kind?: "broll" | "music" | "still";
  name: string;
  proxy: string;
}

export interface EditorBrollItem {
  assetId: string;
  audioMode?: "broll" | "duck-broll" | "duck-voice" | "mix" | "silent";
  authoredAt?: number;
  authoredBy?: string;
  authoredRevision?: number;
  authoredTaskId?: string;
  display?: "cover" | "pip" | "split";
  endSample: number;
  id: string;
  srcInSample: number;
  startSample: number;
}

export interface EditorZoomItem {
  endSample: number;
  id: string;
  rampSec: number;
  scale: number;
  startSample: number;
}

export interface EditorTitleItem {
  endSample: number;
  id: string;
  position: "callout" | "center" | "divider" | "hero" | "lower" | "quote";
  startSample: number;
  text: string;
}

export interface EditorStillItem {
  assetId: string;
  endSample: number;
  focusX: number;
  focusY: number;
  id: string;
  scale: number;
  startSample: number;
}

export interface EditorProject {
  assets: EditorAsset[];
  audio?: Audio;
  brief?: string | null;
  broll: EditorBrollItem[];
  captions?: { enabled: boolean; maxWords?: number; style?: string };
  cuts?: {
    cleanup?: CleanupSettings;
    deadAir?: DeadAirItem[];
    snap?: CutSnap;
  };
  dirPath: string;
  durationSamples: number;
  export?: ExportSettings;
  fps: number;
  graphics?: GraphicItem[];
  height: number;
  highlights?: Highlights;
  look?: {
    vignette: boolean;
    filter?: Filter;
    color?: ColorAdjust;
    transition?: CutTransition;
  };
  mediaVersion?: number;
  motion?: { speed?: number };
  multicam?: MulticamProvenance;
  music?: MusicPlacementView[];
  padMs: number;
  revision?: number;
  sampleRate: number;
  sceneLog?: { segments: unknown[]; analyzedAt: string; agent?: string } | null;
  silences?: SilenceSpan[] | null;
  slug: string;
  source: string;
  stills?: EditorStillItem[];
  template?: string;
  titles: EditorTitleItem[];
  width: number;
  words: EditorWord[];
  zooms: EditorZoomItem[];
}

export type EditorSelection = { kind: TimelineClipKind; id: string } | null;

export const DEAD_AIR_ADD_BATCH_SIZE = 50;

export const DEFAULT_AUDIO: Audio = AudioSchema.parse(undefined);
export const DEFAULT_CUT_SNAP: CutSnap = CutSnapSchema.parse(undefined);

export function mergeAudioPatch(
  current: Audio | undefined,
  patch: AudioPatch
): Audio {
  const base = current ?? DEFAULT_AUDIO;
  return {
    ducking: patch.ducking
      ? { ...base.ducking, ...patch.ducking }
      : base.ducking,
    loudness: patch.loudness
      ? { ...base.loudness, ...patch.loudness }
      : base.loudness,
    noiseReduction: patch.noiseReduction
      ? { ...base.noiseReduction, ...patch.noiseReduction }
      : base.noiseReduction,
    voiceHighpass: patch.voiceHighpass
      ? { ...base.voiceHighpass, ...patch.voiceHighpass }
      : base.voiceHighpass,
    deEsser: patch.deEsser
      ? { ...base.deEsser, ...patch.deEsser }
      : base.deEsser,
  };
}
