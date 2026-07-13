"use client";

import type { CleanupCandidate, CleanupReport } from "@engine/cleanup";
import { partitionSafeCandidates } from "@engine/cleanup";
import type {
  CropMode,
  CutSnap,
  Project as EngineProject,
  ExportAspect,
} from "@engine/edl";
import { ExportSettingsSchema } from "@engine/edl";
import { orientationToExportAspect } from "@engine/export-aspect";
import { useRouter } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import type { AudioMeasureView, AudioPatch } from "@/components/audio-controls";
import {
  DEFAULT_GRAPHIC_SPAN_SEC,
  type GraphicSpanMode,
  type GraphicTemplateOption,
} from "@/components/graphic-picker-controls";
import {
  DEFAULT_MUSIC_BED_SEC,
  type MusicPlacementPatch,
  type MusicPlacementView,
} from "@/components/music-controls";
import type { ExportPatch } from "@/components/reframe-controls";
import type { ProjectSaves } from "@/hooks/use-project-saves";
import { toastError } from "@/lib/app-toast";
import {
  buildBulkSilenceUndoSnapshot,
  chunkDeadAirSpans,
  deadAirCandidatesFromReport,
} from "@/lib/cleanup-silence";
import type {
  CleanupUndoSnapshot,
  ToggleableCleanupCategory,
} from "@/lib/cleanup-tab";
import { reconcileDeadAirItems } from "@/lib/dead-air-state";
import {
  createdDeadAirIdsFromTouches,
  type DeadAirTouch,
  deadAirItemsFromTouches,
} from "@/lib/dead-air-touch";
import {
  DEAD_AIR_ADD_BATCH_SIZE,
  DEFAULT_CUT_SNAP,
  type EditorProject,
  mergeAudioPatch,
} from "@/lib/editor-types";
import type { Orientation } from "@/lib/preview-layout";
import { reanchoredWordUpdate } from "@/lib/reanchored-word-update";
import {
  runGuiAction,
  runHighlightsDetect,
  runVisionFocus,
  saveBrief,
} from "../../app/actions.ts";

export interface UseProjectConfigActionsParams {
  chosenGraphicTemplate: string;
  chosenMusicAsset: string;
  cleanupReport: CleanupReport;
  curSec: number;
  enqueueSave: ProjectSaves["enqueueSave"];
  graphicBeatCount: number;
  graphicMusicAssetId: string;
  graphicParamDraft: Record<string, string | number | boolean>;
  graphicSpanMode: GraphicSpanMode;
  graphicTemplates: GraphicTemplateOption[];
  musicBpmByAsset: Record<string, { bpm: number; confidence: number }>;
  project: EditorProject;
  sampleRate: number;
  setChosenGraphicTemplate: Dispatch<SetStateAction<string>>;
  setGraphicParamDraft: Dispatch<
    SetStateAction<Record<string, string | number | boolean>>
  >;
  setMusicBpmByAsset: Dispatch<
    SetStateAction<Record<string, { bpm: number; confidence: number }>>
  >;
  setOrientation: Dispatch<SetStateAction<Orientation>>;
  setProject: Dispatch<SetStateAction<EditorProject>>;
  setSaveError: ProjectSaves["setSaveError"];
}

export function useProjectConfigActions({
  cleanupReport,
  chosenGraphicTemplate,
  chosenMusicAsset,
  curSec,
  enqueueSave,
  graphicBeatCount,
  graphicMusicAssetId,
  graphicParamDraft,
  graphicSpanMode,
  graphicTemplates,
  musicBpmByAsset,
  project,
  sampleRate: sr,
  setChosenGraphicTemplate,
  setGraphicParamDraft,
  setMusicBpmByAsset,
  setOrientation,
  setProject,
  setSaveError,
}: UseProjectConfigActionsParams) {
  const router = useRouter();
  const [bpmDetectingAssetId, setBpmDetectingAssetId] = useState<string | null>(
    null
  );
  const [audioMeasure, setAudioMeasure] = useState<AudioMeasureView | null>(
    null
  );
  const [audioMeasuring, setAudioMeasuring] = useState(false);
  const [applyingVision, setApplyingVision] = useState(false);
  const [detectingHighlights, setDetectingHighlights] = useState(false);
  const [lastCleanupUndo, setLastCleanupUndo] =
    useState<CleanupUndoSnapshot | null>(null);

  useEffect(() => {
    setLastCleanupUndo(null);
  }, [project.slug]);

  const addGraphicPlacement = useCallback(() => {
    if (!chosenGraphicTemplate) {
      return;
    }
    const durationSec = project.durationSamples / project.sampleRate;
    const fromSec = curSec;
    const toSec = Math.min(curSec + DEFAULT_GRAPHIC_SPAN_SEC, durationSec);
    const beatsPayload =
      graphicSpanMode === "beats" &&
      graphicMusicAssetId &&
      musicBpmByAsset[graphicMusicAssetId]
        ? {
            beats: graphicBeatCount,
            musicAssetId: graphicMusicAssetId,
          }
        : undefined;
    if (toSec - fromSec <= 0.05 && !beatsPayload) {
      return;
    }
    const optimisticId = `g${Date.now()}`;
    const item = {
      id: optimisticId,
      template: chosenGraphicTemplate,
      type: "template" as const,
      track: "broll",
      startSample: Math.round(fromSec * sr),
      endSample: Math.round(toSec * sr),
      params: { ...graphicParamDraft },
    };
    setProject((prev) => ({
      ...prev,
      graphics: [...(prev.graphics ?? []), item],
    }));
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "graphic-add", {
        template: item.template,
        fromSec,
        toSec,
        params: item.params,
        track: item.track,
        ...beatsPayload,
      });
      if (r.ok) {
        const saved = r.data.result as typeof item;
        setProject((prev) => ({
          ...prev,
          graphics: (prev.graphics ?? []).map((g) =>
            g.id === optimisticId ? { ...g, ...saved } : g
          ),
        }));
      }
      return r;
    });
  }, [
    chosenGraphicTemplate,
    curSec,
    enqueueSave,
    graphicBeatCount,
    graphicMusicAssetId,
    graphicParamDraft,
    graphicSpanMode,
    musicBpmByAsset,
    project.durationSamples,
    project.sampleRate,
    project.slug,
    setProject,
    sr,
  ]);

  const addGraphicAtCutSeams = useCallback(() => {
    if (!chosenGraphicTemplate) {
      return;
    }
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "graphic-add-cuts", {
        template: chosenGraphicTemplate,
        track: "title",
        params:
          Object.keys(graphicParamDraft).length > 0
            ? graphicParamDraft
            : undefined,
      });
      if (r.ok) {
        const data = r.data.result as {
          items?: Array<{
            id: string;
            template: string;
            startSample: number;
            endSample: number;
            track: string;
            params: Record<string, string | number | boolean>;
          }>;
        };
        const placed = data.items ?? [];
        if (placed.length > 0) {
          setProject((prev) => ({
            ...prev,
            graphics: [
              ...(prev.graphics ?? []),
              ...placed.map((g) => ({
                id: g.id,
                template: g.template,
                type: "template" as const,
                track: g.track,
                startSample: g.startSample,
                endSample: g.endSample,
                params: g.params,
              })),
            ],
          }));
        }
      }
      return r;
    });
  }, [
    chosenGraphicTemplate,
    enqueueSave,
    graphicParamDraft,
    project.slug,
    setProject,
  ]);

  const addMusicPlacement = useCallback(() => {
    if (!chosenMusicAsset) {
      return;
    }
    const durationSec = project.durationSamples / project.sampleRate;
    const fromSec = curSec;
    const toSec = Math.min(curSec + DEFAULT_MUSIC_BED_SEC, durationSec);
    if (toSec - fromSec <= 0.05) {
      return;
    }
    const optimisticId = `m${Date.now()}`;
    const item: MusicPlacementView = {
      id: optimisticId,
      assetId: chosenMusicAsset,
      startSample: Math.round(fromSec * sr),
      endSample: Math.round(toSec * sr),
      srcInSample: 0,
      gain: 1,
      fadeInSec: 0,
      fadeOutSec: 0,
      mode: "trim",
    };
    setProject((prev) => ({ ...prev, music: [...(prev.music ?? []), item] }));
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "music-add", {
        assetId: item.assetId,
        fromSec,
        toSec,
      });
      if (r.ok) {
        const saved = r.data.result as MusicPlacementView;
        setProject((prev) => ({
          ...prev,
          music: (prev.music ?? []).map((m) =>
            m.id === optimisticId ? { ...m, ...saved } : m
          ),
        }));
      }
      return r;
    });
  }, [
    chosenMusicAsset,
    curSec,
    enqueueSave,
    project.durationSamples,
    project.sampleRate,
    project.slug,
    setProject,
    sr,
  ]);

  const patchMusicPlacement = useCallback(
    (id: string, rawPatch: MusicPlacementPatch) => {
      const current = (project.music ?? []).find((m) => m.id === id);
      if (!current) {
        return;
      }
      const clamp = (n: number, min: number, max: number) =>
        Math.max(min, Math.min(max, n));
      const durationSec = project.durationSamples / project.sampleRate;
      const patch: MusicPlacementPatch = {
        ...rawPatch,
        ...(rawPatch.fromSec === undefined
          ? {}
          : { fromSec: clamp(rawPatch.fromSec, 0, durationSec) }),
        ...(rawPatch.toSec === undefined
          ? {}
          : { toSec: clamp(rawPatch.toSec, 0, durationSec) }),
        ...(rawPatch.gain === undefined
          ? {}
          : { gain: clamp(rawPatch.gain, 0, 2) }),
        ...(rawPatch.fadeInSec === undefined
          ? {}
          : { fadeInSec: clamp(rawPatch.fadeInSec, 0, 10) }),
        ...(rawPatch.fadeOutSec === undefined
          ? {}
          : { fadeOutSec: clamp(rawPatch.fadeOutSec, 0, 10) }),
      };
      const nextFromSec = patch.fromSec ?? current.startSample / sr;
      const nextToSec = patch.toSec ?? current.endSample / sr;
      if (nextToSec <= nextFromSec) {
        return;
      }
      const music = (project.music ?? []).map((m) => {
        if (m.id !== id) {
          return m;
        }
        return {
          ...m,
          ...(patch.fromSec === undefined
            ? {}
            : { startSample: Math.round(patch.fromSec * sr) }),
          ...(patch.toSec === undefined
            ? {}
            : { endSample: Math.round(patch.toSec * sr) }),
          ...(patch.gain === undefined ? {} : { gain: patch.gain }),
          ...(patch.fadeInSec === undefined
            ? {}
            : { fadeInSec: patch.fadeInSec }),
          ...(patch.fadeOutSec === undefined
            ? {}
            : { fadeOutSec: patch.fadeOutSec }),
          ...(patch.mode === undefined ? {} : { mode: patch.mode }),
        };
      });
      setProject({ ...project, music });
      enqueueSave(async () => {
        const r = await runGuiAction(project.slug, "music-set", {
          id,
          ...patch,
        });
        if (r.ok) {
          const saved = r.data.result as MusicPlacementView;
          setProject((prev) => ({
            ...prev,
            music: (prev.music ?? []).map((m) =>
              m.id === id ? { ...m, ...saved } : m
            ),
          }));
        }
        return r;
      });
    },
    [enqueueSave, project, setProject, sr]
  );

  const removeMusicPlacement = useCallback(
    (id: string) => {
      const music = (project.music ?? []).filter((m) => m.id !== id);
      setProject({ ...project, music });
      enqueueSave(() => runGuiAction(project.slug, "music-rm", { id }));
    },
    [enqueueSave, project, setProject]
  );

  const applyCleanupCandidate = useCallback(
    (candidate: CleanupCandidate) => {
      if (candidate.kind === "filler") {
        setLastCleanupUndo({
          wordIds: candidate.wordIds,
          deadAirSpanIds: [],
        });
        setProject(
          (prev) =>
            reanchoredWordUpdate(
              prev as unknown as EngineProject,
              new Set(candidate.wordIds),
              true
            ) as unknown as EditorProject
        );
        enqueueSave(() =>
          runGuiAction(project.slug, "cut", {
            ids: candidate.wordIds,
            deleted: true,
            note: candidate.reason,
          })
        );
        return;
      }
      const optimisticId = `da${Date.now()}`;
      setProject((prev) => ({
        ...prev,
        cuts: {
          ...prev.cuts,
          deadAir: [
            ...(prev.cuts?.deadAir ?? []),
            {
              id: optimisticId,
              startSample: Math.round(candidate.startSec * prev.sampleRate),
              endSample: Math.round(candidate.endSec * prev.sampleRate),
            },
          ],
        },
      }));
      enqueueSave(async () => {
        const r = await runGuiAction(project.slug, "dead-air-add", {
          spans: [{ fromSec: candidate.startSec, toSec: candidate.endSec }],
        });
        if (r.ok) {
          const touches = r.data.result as DeadAirTouch[];
          const created = deadAirItemsFromTouches(touches);
          setLastCleanupUndo({
            wordIds: [],
            deadAirSpanIds: createdDeadAirIdsFromTouches(touches),
          });
          setProject((prev) => ({
            ...prev,
            cuts: {
              ...prev.cuts,
              deadAir: reconcileDeadAirItems(
                prev.cuts?.deadAir ?? [],
                created,
                (deadAirId) => deadAirId === optimisticId
              ),
            },
          }));
        }
        return r;
      });
    },
    [enqueueSave, project.slug, setProject]
  );

  const applyAllSilences = useCallback(() => {
    const deadAirSpans = deadAirCandidatesFromReport(
      cleanupReport.candidates
    ).map((candidate) => ({
      fromSec: candidate.startSec,
      toSec: candidate.endSec,
    }));
    if (deadAirSpans.length === 0) {
      return;
    }
    const optimisticId = `da${Date.now()}`;
    setProject((prev) => ({
      ...prev,
      cuts: {
        ...prev.cuts,
        deadAir: [
          ...(prev.cuts?.deadAir ?? []),
          ...deadAirSpans.map((span, index) => ({
            id: `${optimisticId}-${index}`,
            startSample: Math.round(span.fromSec * project.sampleRate),
            endSample: Math.round(span.toSec * project.sampleRate),
          })),
        ],
      },
    }));
    enqueueSave(async () => {
      const touchBatches: DeadAirTouch[] = [];
      for (const batch of chunkDeadAirSpans(
        deadAirSpans,
        DEAD_AIR_ADD_BATCH_SIZE
      )) {
        const r = await runGuiAction(project.slug, "dead-air-add", {
          spans: batch,
        });
        if (!r.ok) {
          router.refresh();
          return r;
        }
        touchBatches.push(...(r.data.result as DeadAirTouch[]));
      }
      const created = deadAirItemsFromTouches(touchBatches);
      setLastCleanupUndo(
        buildBulkSilenceUndoSnapshot(createdDeadAirIdsFromTouches(touchBatches))
      );
      setProject((prev) => ({
        ...prev,
        cuts: {
          ...prev.cuts,
          deadAir: reconcileDeadAirItems(
            prev.cuts?.deadAir ?? [],
            created,
            (id) => id.startsWith(optimisticId)
          ),
        },
      }));
      router.refresh();
      return { ok: true } as const;
    });
  }, [
    cleanupReport.candidates,
    enqueueSave,
    project.sampleRate,
    project.slug,
    router,
    setProject,
  ]);

  const patchCleanupThreshold = useCallback(
    (field: "keepPadSec" | "minSec", value: number) => {
      setProject((prev) => ({
        ...prev,
        cuts: {
          ...prev.cuts,
          cleanup: {
            minSec:
              field === "minSec"
                ? value
                : (prev.cuts?.cleanup?.minSec ?? cleanupReport.config.minSec),
            keepPadSec:
              field === "keepPadSec"
                ? value
                : (prev.cuts?.cleanup?.keepPadSec ??
                  cleanupReport.config.keepPadSec),
            categories: {
              hesitation:
                prev.cuts?.cleanup?.categories?.hesitation ??
                cleanupReport.config.categories.hesitation,
              hedging:
                prev.cuts?.cleanup?.categories?.hedging ??
                cleanupReport.config.categories.hedging,
              repeat:
                prev.cuts?.cleanup?.categories?.repeat ??
                cleanupReport.config.categories.repeat,
            },
          },
        },
      }));
      enqueueSave(() =>
        runGuiAction(project.slug, "cleanup-config", { [field]: value })
      );
    },
    [cleanupReport.config, enqueueSave, project.slug, setProject]
  );

  const applyAllSafeCleanup = useCallback(() => {
    const { fillerIds, deadAirSpans } = partitionSafeCandidates(
      cleanupReport.candidates
    );
    if (fillerIds.length === 0 && deadAirSpans.length === 0) {
      return;
    }
    if (fillerIds.length > 0) {
      setProject(
        (prev) =>
          reanchoredWordUpdate(
            prev as unknown as EngineProject,
            new Set(fillerIds),
            true
          ) as unknown as EditorProject
      );
      enqueueSave(async () => {
        const r = await runGuiAction(project.slug, "cut", {
          ids: fillerIds,
          deleted: true,
          note: "cleanup: apply all safe",
        });
        if (r.ok) {
          setLastCleanupUndo({
            wordIds: fillerIds,
            deadAirSpanIds: [],
          });
        }
        return r;
      });
    }
    if (deadAirSpans.length > 0) {
      const optimisticId = `da${Date.now()}`;
      setProject((prev) => ({
        ...prev,
        cuts: {
          ...prev.cuts,
          deadAir: [
            ...(prev.cuts?.deadAir ?? []),
            ...deadAirSpans.map((span, index) => ({
              id: `${optimisticId}-${index}`,
              startSample: Math.round(span.fromSec * project.sampleRate),
              endSample: Math.round(span.toSec * project.sampleRate),
            })),
          ],
        },
      }));
      enqueueSave(async () => {
        const touchBatches: DeadAirTouch[] = [];
        for (let i = 0; i < deadAirSpans.length; i += DEAD_AIR_ADD_BATCH_SIZE) {
          const batch = deadAirSpans.slice(i, i + DEAD_AIR_ADD_BATCH_SIZE);
          const r = await runGuiAction(project.slug, "dead-air-add", {
            spans: batch,
          });
          if (!r.ok) {
            router.refresh();
            return r;
          }
          touchBatches.push(...(r.data.result as DeadAirTouch[]));
        }
        const created = deadAirItemsFromTouches(touchBatches);
        setLastCleanupUndo({
          wordIds: fillerIds,
          deadAirSpanIds: createdDeadAirIdsFromTouches(touchBatches),
        });
        setProject((prev) => ({
          ...prev,
          cuts: {
            ...prev.cuts,
            deadAir: reconcileDeadAirItems(
              prev.cuts?.deadAir ?? [],
              created,
              (id) => id.startsWith(optimisticId)
            ),
          },
        }));
        router.refresh();
        return { ok: true } as const;
      });
    }
  }, [
    cleanupReport.candidates,
    enqueueSave,
    project.sampleRate,
    project.slug,
    router,
    setProject,
  ]);

  const toggleCleanupCategory = useCallback(
    (category: ToggleableCleanupCategory, enabled: boolean) => {
      setProject((prev) => ({
        ...prev,
        cuts: {
          ...prev.cuts,
          cleanup: {
            minSec: prev.cuts?.cleanup?.minSec ?? cleanupReport.config.minSec,
            keepPadSec:
              prev.cuts?.cleanup?.keepPadSec ?? cleanupReport.config.keepPadSec,
            categories: {
              hesitation:
                prev.cuts?.cleanup?.categories?.hesitation ??
                cleanupReport.config.categories.hesitation,
              hedging:
                prev.cuts?.cleanup?.categories?.hedging ??
                cleanupReport.config.categories.hedging,
              repeat:
                prev.cuts?.cleanup?.categories?.repeat ??
                cleanupReport.config.categories.repeat,
              [category]: enabled,
            },
          },
        },
      }));
      enqueueSave(async () => {
        const r = await runGuiAction(project.slug, "cleanup-config", {
          [category]: enabled,
        });
        if (r.ok) {
          router.refresh();
        }
        return r;
      });
    },
    [cleanupReport.config, enqueueSave, project.slug, router, setProject]
  );

  const applyEnabledCleanup = useCallback(() => {
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "cleanup-apply", {
        mode: "enabled",
      });
      if (!r.ok) {
        return r;
      }
      const result = r.data.result as {
        deadAirSpanIds: string[];
        wordIds: string[];
      };
      setLastCleanupUndo(result);
      if (result.wordIds.length > 0) {
        setProject(
          (prev) =>
            reanchoredWordUpdate(
              prev as unknown as EngineProject,
              new Set(result.wordIds),
              true
            ) as unknown as EditorProject
        );
      }
      router.refresh();
      return r;
    });
  }, [enqueueSave, project.slug, router, setProject]);

  const undoLastCleanup = useCallback(() => {
    if (!lastCleanupUndo) {
      return;
    }
    const undo = lastCleanupUndo;
    if (undo.wordIds.length > 0) {
      setProject(
        (prev) =>
          reanchoredWordUpdate(
            prev as unknown as EngineProject,
            new Set(undo.wordIds),
            false
          ) as unknown as EditorProject
      );
    }
    if (undo.deadAirSpanIds.length > 0) {
      setProject((prev) => ({
        ...prev,
        cuts: {
          ...prev.cuts,
          deadAir: (prev.cuts?.deadAir ?? []).filter(
            (span) => !undo.deadAirSpanIds.includes(span.id)
          ),
        },
      }));
    }
    enqueueSave(async () => {
      if (undo.wordIds.length > 0) {
        const cutResult = await runGuiAction(project.slug, "cut", {
          ids: undo.wordIds,
          deleted: false,
        });
        if (!cutResult.ok) {
          toastError(cutResult.error ?? "Undo cleanup failed");
          router.refresh();
          return cutResult;
        }
      }
      for (const id of undo.deadAirSpanIds) {
        const rmResult = await runGuiAction(project.slug, "dead-air-rm", {
          id,
        });
        if (!rmResult.ok) {
          toastError(rmResult.error ?? "Undo cleanup failed");
          router.refresh();
          return rmResult;
        }
      }
      setLastCleanupUndo(null);
      router.refresh();
      return { ok: true as const };
    });
  }, [enqueueSave, lastCleanupUndo, project.slug, router, setProject]);

  const removeDeadAirSpan = useCallback(
    (id: string) => {
      setProject((prev) => ({
        ...prev,
        cuts: {
          ...prev.cuts,
          deadAir: (prev.cuts?.deadAir ?? []).filter((s) => s.id !== id),
        },
      }));
      enqueueSave(() => runGuiAction(project.slug, "dead-air-rm", { id }));
    },
    [enqueueSave, project.slug, setProject]
  );

  const patchAudio = useCallback(
    (patch: AudioPatch) => {
      setProject((prev) => ({
        ...prev,
        audio: mergeAudioPatch(prev.audio, patch),
      }));
      enqueueSave(() => runGuiAction(project.slug, "audio", patch));
    },
    [enqueueSave, project.slug, setProject]
  );

  const detectMusicBpm = useCallback(
    async (assetId: string) => {
      setBpmDetectingAssetId(assetId);
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(project.slug)}/bpm?assetId=${encodeURIComponent(assetId)}`
        );
        const data = (await res.json()) as {
          bpm?: number;
          confidence?: number;
          error?: string;
        };
        if (
          !(
            res.ok &&
            typeof data.bpm === "number" &&
            typeof data.confidence === "number"
          )
        ) {
          throw new Error(data.error ?? "BPM detection failed");
        }
        const { bpm, confidence } = data;
        setMusicBpmByAsset((prev) => ({
          ...prev,
          [assetId]: { bpm, confidence },
        }));
      } catch (e) {
        toastError((e as Error).message);
      } finally {
        setBpmDetectingAssetId(null);
      }
    },
    [project.slug, setMusicBpmByAsset]
  );

  const measureAudioLoudness = useCallback(async () => {
    setAudioMeasuring(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project.slug)}/audio-measure`
      );
      const data = (await res.json()) as AudioMeasureView & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Loudness measure failed");
      }
      setAudioMeasure({
        integratedLufs: data.integratedLufs,
        truePeakDbtp: data.truePeakDbtp,
        lra: data.lra,
        source: data.source,
      });
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setAudioMeasuring(false);
    }
  }, [project.slug]);

  const patchExport = useCallback(
    (patch: ExportPatch) => {
      setProject((prev) => {
        const current = ExportSettingsSchema.parse(prev.export ?? {});
        const layout = patch.layout ?? current.layout ?? "fill";
        const splitVertical =
          patch.splitVertical === undefined
            ? current.splitVertical
            : {
                ...(current.splitVertical ?? {
                  ratio: 0.45,
                  speakerPosition: "top" as const,
                }),
                ...patch.splitVertical,
              };
        return {
          ...prev,
          export: {
            aspect: patch.aspect ?? current.aspect,
            crop: patch.crop
              ? { ...current.crop, ...patch.crop }
              : current.crop,
            cropMode: patch.cropMode ?? current.cropMode,
            layout,
            ...(splitVertical === undefined ? {} : { splitVertical }),
          },
        };
      });
      const input: {
        aspect?: ExportAspect;
        crop?: ExportPatch["crop"];
        cropMode?: CropMode;
        layout?: ExportPatch["layout"];
        splitVertical?: ExportPatch["splitVertical"];
      } = {};
      if (patch.aspect !== undefined) {
        input.aspect = patch.aspect;
      }
      if (patch.crop !== undefined) {
        input.crop = patch.crop;
      }
      if (patch.cropMode !== undefined) {
        input.cropMode = patch.cropMode;
      }
      if (patch.layout !== undefined) {
        input.layout = patch.layout;
      }
      if (patch.splitVertical !== undefined) {
        input.splitVertical = patch.splitVertical;
      }
      enqueueSave(() => runGuiAction(project.slug, "export-set", input));
    },
    [enqueueSave, project.slug, setProject]
  );

  const onRunVisionFocus = useCallback(async () => {
    setApplyingVision(true);
    try {
      const r = await runVisionFocus(project.slug);
      if (!r.ok) {
        setSaveError(r.error);
        return;
      }
      setProject((prev) => ({
        ...prev,
        ...(r.data.project as unknown as EditorProject),
        brief: prev.brief,
        dirPath: prev.dirPath,
        mediaVersion: prev.mediaVersion,
        silences: prev.silences,
      }));
      patchExport({ cropMode: "scene" });
      router.refresh();
    } finally {
      setApplyingVision(false);
    }
  }, [patchExport, project.slug, router, setProject, setSaveError]);

  const onDetectHighlights = useCallback(async () => {
    setDetectingHighlights(true);
    try {
      const r = await runHighlightsDetect(project.slug);
      if (!r.ok) {
        setSaveError(r.error);
        return;
      }
      setProject((prev) => ({
        ...prev,
        ...(r.data.project as unknown as EditorProject),
        brief: prev.brief,
        dirPath: prev.dirPath,
        mediaVersion: prev.mediaVersion,
        silences: prev.silences,
      }));
      router.refresh();
    } finally {
      setDetectingHighlights(false);
    }
  }, [project.slug, router, setProject, setSaveError]);

  const changeOrientation = useCallback(
    (next: Orientation) => {
      setOrientation(next);
      patchExport({ aspect: orientationToExportAspect(next) });
    },
    [patchExport, setOrientation]
  );

  const patchSnap = useCallback(
    (patch: Partial<CutSnap>) => {
      setProject((prev) => ({
        ...prev,
        cuts: {
          ...prev.cuts,
          snap: { ...(prev.cuts?.snap ?? DEFAULT_CUT_SNAP), ...patch },
        },
      }));
      enqueueSave(async () => {
        const r = await runGuiAction(project.slug, "cuts-snap", patch);
        if (r.ok && (patch.enabled !== undefined || patch.mode !== undefined)) {
          router.refresh();
        }
        return r;
      });
    },
    [enqueueSave, project.slug, router, setProject]
  );

  const onChooseGraphicTemplate = useCallback(
    (id: string) => {
      setChosenGraphicTemplate(id);
      const template = graphicTemplates.find((entry) => entry.id === id);
      if (!template) {
        setGraphicParamDraft({});
        return;
      }
      const defaults: Record<string, string | number | boolean> = {};
      for (const [key, spec] of Object.entries(template.params)) {
        defaults[key] = spec.default;
      }
      setGraphicParamDraft(defaults);
    },
    [graphicTemplates, setChosenGraphicTemplate, setGraphicParamDraft]
  );

  const onSaveBrief = useCallback(
    async (text: string) => {
      const r = await saveBrief(project.slug, text);
      if (r.ok) {
        setProject((prev) => ({ ...prev, brief: text }));
        return { ok: true as const };
      }
      return { ok: false as const, error: r.error };
    },
    [project.slug, setProject]
  );

  return {
    addGraphicAtCutSeams,
    addGraphicPlacement,
    addMusicPlacement,
    applyAllSafeCleanup,
    applyAllSilences,
    applyCleanupCandidate,
    applyEnabledCleanup,
    applyingVision,
    audioMeasure,
    audioMeasuring,
    bpmDetectingAssetId,
    changeOrientation,
    detectMusicBpm,
    detectingHighlights,
    lastCleanupUndo,
    measureAudioLoudness,
    onChooseGraphicTemplate,
    onDetectHighlights,
    onRunVisionFocus,
    onSaveBrief,
    patchAudio,
    patchCleanupThreshold,
    patchExport,
    patchMusicPlacement,
    patchSnap,
    removeDeadAirSpan,
    removeMusicPlacement,
    toggleCleanupCategory,
    undoLastCleanup,
  };
}
