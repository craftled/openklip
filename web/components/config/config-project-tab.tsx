"use client";

import type { CleanupCandidate, CleanupReport } from "@engine/cleanup";
import type {
  Audio,
  CutSnap,
  Project as EngineProject,
  Highlights,
} from "@engine/edl";
import { AudioSchema, CutSnapSchema } from "@engine/edl";
import {
  AudioControls,
  type AudioMeasureView,
  type AudioPatch,
} from "@/components/audio-controls";
import { BriefEditor } from "@/components/brief-editor";
import { CleanupPanel } from "@/components/cleanup-panel";
import { Section } from "@/components/config/config-section";
import { FrameBrowser } from "@/components/frame-browser";
import {
  GraphicSectionControls,
  type GraphicSpanMode,
  type GraphicTemplateOption,
} from "@/components/graphic-picker-controls";
import { HighlightsPanel } from "@/components/highlights-panel";
import {
  type MusicPlacementPatch,
  type MusicPlacementView,
  MusicSectionControls,
} from "@/components/music-controls";
import { TakesPanel } from "@/components/takes-panel";

const DEFAULT_AUDIO: Audio = AudioSchema.parse(undefined);
const DEFAULT_CUT_SNAP: CutSnap = CutSnapSchema.parse(undefined);

export interface ConfigProjectTabProps {
  applyingVision: boolean;
  assetName: (assetId: string) => string;
  assets: { id: string; kind?: string; name: string }[];
  audio: Audio | undefined;
  audioMeasure: AudioMeasureView | null;
  audioMeasuring: boolean;
  bpmByAssetId: Record<string, { bpm: number; confidence: number }>;
  bpmDetectingAssetId: string | null;
  brief: string;
  chosenGraphicTemplate: string;
  chosenMusicAsset: string;
  cleanupReport: CleanupReport;
  deadAirSpans: { endSec: number; id: string; startSec: number }[];
  detectingHighlights: boolean;
  durationSec: number;
  graphicBeatCount: number;
  graphicMusicAssetId: string;
  graphicParamDraft: Record<string, string | number | boolean>;
  graphicSpanMode: GraphicSpanMode;
  graphicTemplates: GraphicTemplateOption[];
  highlights: Highlights | undefined;
  musicAssets: { id: string; name: string }[];
  musicPlacements: MusicPlacementView[];
  onAddGraphic: () => void;
  onAddGraphicAtCuts: () => void;
  onAddMusic: () => void;
  onApplyAllSafeCleanup: () => void;
  onApplyCleanup: (candidate: CleanupCandidate) => void;
  onAssembled: (project: EngineProject) => void;
  onBeatCountChange: (count: number) => void;
  onChooseGraphicMusicAsset: (assetId: string) => void;
  onChooseGraphicTemplate: (templateId: string) => void;
  onChooseMusicAsset: (assetId: string) => void;
  onDetectBpm: (assetId: string) => Promise<void>;
  onDetectHighlights: () => Promise<void>;
  onGraphicParamChange: (key: string, value: string | number | boolean) => void;
  onGraphicSpanModeChange: (mode: GraphicSpanMode) => void;
  onMeasureAudio: () => Promise<void>;
  onPatchAudio: (patch: AudioPatch) => void;
  onPatchMusic: (id: string, patch: MusicPlacementPatch) => void;
  onPatchSnap: (patch: Partial<CutSnap>) => void;
  onReloadGraphicTemplates?: () => void;
  onRemoveDeadAirSpan: (id: string) => void;
  onRemoveMusic: (id: string) => void;
  onSaveBrief: (
    text: string
  ) => Promise<{ ok: true } | { ok: false; error?: string }>;
  onSeekHighlight: (fromSec: number) => void;
  pendingSaves: number;
  sampleRate: number;
  slug: string;
  snap: CutSnap | undefined;
}

export function ConfigProjectTab({
  assets,
  assetName,
  audio,
  audioMeasure,
  audioMeasuring,
  brief,
  bpmByAssetId,
  bpmDetectingAssetId,
  chosenGraphicTemplate,
  chosenMusicAsset,
  cleanupReport,
  deadAirSpans,
  detectingHighlights,
  durationSec,
  graphicBeatCount,
  graphicMusicAssetId,
  graphicParamDraft,
  graphicSpanMode,
  graphicTemplates,
  highlights,
  musicAssets,
  musicPlacements,
  onAddGraphic,
  onAddGraphicAtCuts,
  onAddMusic,
  onApplyAllSafeCleanup,
  onApplyCleanup,
  onAssembled,
  onBeatCountChange,
  onChooseGraphicMusicAsset,
  onChooseGraphicTemplate,
  onChooseMusicAsset,
  onDetectBpm,
  onDetectHighlights,
  onGraphicParamChange,
  onGraphicSpanModeChange,
  onMeasureAudio,
  onPatchAudio,
  onPatchMusic,
  onPatchSnap,
  onReloadGraphicTemplates,
  onRemoveDeadAirSpan,
  onRemoveMusic,
  onSaveBrief,
  onSeekHighlight,
  pendingSaves,
  sampleRate,
  slug,
  snap,
}: ConfigProjectTabProps) {
  return (
    <>
      <Section title="Brief">
        <BriefEditor initialBrief={brief} onSave={onSaveBrief} slug={slug} />
      </Section>
      <Section title="Frames">
        <FrameBrowser slug={slug} />
      </Section>
      <Section title="Cleanup">
        <CleanupPanel
          applying={pendingSaves > 0}
          onApply={onApplyCleanup}
          onApplyAllSafe={onApplyAllSafeCleanup}
          onRemoveSpan={onRemoveDeadAirSpan}
          registeredSpans={deadAirSpans}
          report={cleanupReport}
        />
      </Section>
      <Section title="Highlights">
        <HighlightsPanel
          applying={pendingSaves > 0}
          detecting={detectingHighlights}
          highlights={highlights}
          onDetect={onDetectHighlights}
          onSeekClip={(clip) => onSeekHighlight(clip.fromSec)}
        />
      </Section>
      <Section title="Takes">
        <TakesPanel onAssembled={onAssembled} slug={slug} />
      </Section>
      <Section title="Graphics">
        <GraphicSectionControls
          assets={assets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            kind: asset.kind ?? "broll",
          }))}
          beatCount={graphicBeatCount}
          bpmByAssetId={bpmByAssetId}
          bpmDetectingAssetId={bpmDetectingAssetId}
          chosenMusicAssetId={graphicMusicAssetId}
          chosenTemplateId={
            graphicTemplates.some(
              (template) => template.id === chosenGraphicTemplate
            )
              ? chosenGraphicTemplate
              : ""
          }
          durationSec={durationSec}
          musicAssets={musicAssets}
          onAdd={onAddGraphic}
          onAddAtCuts={onAddGraphicAtCuts}
          onBeatCountChange={onBeatCountChange}
          onChooseMusicAsset={onChooseGraphicMusicAsset}
          onChooseTemplate={onChooseGraphicTemplate}
          onDetectBpm={onDetectBpm}
          onParamChange={onGraphicParamChange}
          onSpanModeChange={onGraphicSpanModeChange}
          onTemplatesReload={onReloadGraphicTemplates}
          paramDraft={graphicParamDraft}
          slug={slug}
          spanMode={graphicSpanMode}
          templates={graphicTemplates}
        />
      </Section>
      <Section title="Music">
        <MusicSectionControls
          assetName={assetName}
          assets={musicAssets}
          bpmByAssetId={bpmByAssetId}
          bpmDetectingAssetId={bpmDetectingAssetId}
          chosenAssetId={
            musicAssets.some((asset) => asset.id === chosenMusicAsset)
              ? chosenMusicAsset
              : ""
          }
          onAdd={onAddMusic}
          onChooseAsset={onChooseMusicAsset}
          onDetectBpm={onDetectBpm}
          onPatch={onPatchMusic}
          onRemove={onRemoveMusic}
          placements={musicPlacements}
          sampleRate={sampleRate}
        />
      </Section>
      <Section title="Audio">
        <AudioControls
          applying={pendingSaves > 0}
          audio={audio ?? DEFAULT_AUDIO}
          measure={audioMeasure}
          measuring={audioMeasuring}
          onMeasure={onMeasureAudio}
          onPatchAudio={onPatchAudio}
          onPatchSnap={onPatchSnap}
          snap={snap ?? DEFAULT_CUT_SNAP}
        />
      </Section>
    </>
  );
}
