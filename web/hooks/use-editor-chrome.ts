"use client";

import type {
  ColorAdjust,
  Project as EngineProject,
  Filter,
} from "@engine/edl";
import { ExportSettingsSchema } from "@engine/edl";
import { exportAspectToOrientation } from "@engine/export-aspect";
import type { SafeAreaPlatform } from "@engine/safe-areas";
import { useCallback, useEffect, useState } from "react";
import {
  CHAT_WIDTH_DEFAULT,
  readStoredChatWidth,
} from "@/components/chat-resize-handle";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getDefaultAgentModel,
  subscribeDefaultAgent,
} from "@/lib/agent-preferences";
import type { ConfigTabId } from "@/lib/config-tabs";
import type { EditorProject } from "@/lib/editor-types";
import type { Orientation } from "@/lib/preview-layout";
import {
  readProvenanceDisplayEnabled,
  subscribeProvenanceDisplay,
} from "@/lib/provenance-preferences";
import { visibleChatWidth } from "@/lib/right-rail-layout";
import {
  getSafeAreaGuidePlatform,
  setSafeAreaGuidePlatform,
} from "@/lib/safe-area-preferences";
import type { SettingsSectionId } from "@/lib/settings-navigation";
import {
  applyColorScheme,
  type ColorScheme,
  getColorScheme,
  setColorScheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";

export interface HistoryReseedSetters {
  setCaptionsOn: (on: boolean) => void;
  setChosenAsset: (id: string) => void;
  setChosenMusicAsset: (id: string) => void;
  setChosenStillAsset: (id: string) => void;
  setColorState: (color: ColorAdjust | null) => void;
  setFilterState: (filter: Filter) => void;
  setMotionSpeed: (speed: number) => void;
  setOrientation: (orientation: Orientation) => void;
  setProject: React.Dispatch<React.SetStateAction<EditorProject>>;
  setVignetteOn: (on: boolean) => void;
}

export interface UseEditorChromeParams extends HistoryReseedSetters {}

export function useEditorChrome({
  setCaptionsOn,
  setChosenAsset,
  setChosenMusicAsset,
  setChosenStillAsset,
  setColorState,
  setFilterState,
  setMotionSpeed,
  setOrientation,
  setProject,
  setVignetteOn,
}: UseEditorChromeParams) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>("appearance");
  const [defaultAgent, setDefaultAgent] =
    useState<AgentModelId>(DEFAULT_AGENT_MODEL);
  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTabId>("look");
  const [mobileRightPanel, setMobileRightPanel] = useState<
    "chat" | "config" | null
  >(null);
  const [historyFocusRevision, setHistoryFocusRevision] = useState<
    number | null
  >(null);
  const [chatWidth, setChatWidth] = useState(CHAT_WIDTH_DEFAULT);
  const [cinema, setCinema] = useState(false);
  const [safeAreaGuide, setSafeAreaGuide] = useState<SafeAreaPlatform>("off");
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");
  const [provenanceDisplay, setProvenanceDisplay] = useState(false);

  useEffect(() => {
    setChatWidth(readStoredChatWidth());
  }, []);

  useEffect(() => {
    setSafeAreaGuide(getSafeAreaGuidePlatform());
  }, []);

  useEffect(() => {
    const storedColorScheme = getColorScheme();
    setColorSchemeState(storedColorScheme);
    applyColorScheme(storedColorScheme);
    return subscribeColorScheme(setColorSchemeState);
  }, []);

  useEffect(() => {
    setProvenanceDisplay(readProvenanceDisplayEnabled());
    return subscribeProvenanceDisplay(setProvenanceDisplay);
  }, []);

  useEffect(() => {
    setDefaultAgent(getDefaultAgentModel());
    return subscribeDefaultAgent(setDefaultAgent);
  }, []);

  const focusWordInHistory = useCallback((revisionAfter: number) => {
    setConfigOpen(true);
    setMobileRightPanel("config");
    setConfigTab("history");
    setHistoryFocusRevision(revisionAfter);
  }, []);

  const onHistoryReverted = useCallback(
    (restored: EngineProject) => {
      // G1: HistoryPanel onReverted is the only server path that rewrites an
      // already-open project revision. Reseed project plus client state derived
      // at mount; leave brief/dirPath/mediaVersion/silences untouched.
      setProject((prev) => ({
        ...prev,
        ...(restored as unknown as EditorProject),
        brief: prev.brief,
        dirPath: prev.dirPath,
        mediaVersion: prev.mediaVersion,
        silences: prev.silences,
      }));
      setCaptionsOn(restored.captions?.enabled ?? true);
      setVignetteOn(restored.look?.vignette ?? false);
      setFilterState(restored.look?.filter ?? "none");
      setColorState(restored.look?.color ?? null);
      setMotionSpeed(restored.motion?.speed ?? 1);
      setOrientation(
        exportAspectToOrientation(
          ExportSettingsSchema.parse(restored.export ?? {}).aspect
        )
      );
      setChosenAsset(
        restored.assets?.find((a) => (a.kind ?? "broll") === "broll")?.id ?? ""
      );
      setChosenStillAsset(
        restored.assets?.find((a) => a.kind === "still")?.id ?? ""
      );
      setChosenMusicAsset(
        restored.assets?.find((a) => a.kind === "music")?.id ?? ""
      );
    },
    [
      setCaptionsOn,
      setChosenAsset,
      setChosenMusicAsset,
      setChosenStillAsset,
      setColorState,
      setFilterState,
      setMotionSpeed,
      setOrientation,
      setProject,
      setVignetteOn,
    ]
  );

  const onSafeAreaGuideChange = useCallback((platform: SafeAreaPlatform) => {
    setSafeAreaGuide(platform);
    setSafeAreaGuidePlatform(platform);
  }, []);

  const toggleColorScheme = useCallback(() => {
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  }, [colorScheme]);

  const onCloseConfig = useCallback(() => {
    if (mobileRightPanel === "config") {
      setMobileRightPanel(null);
      return;
    }
    setConfigOpen(false);
  }, [mobileRightPanel]);

  const resolvedChatWidth = visibleChatWidth(chatWidth, configOpen);

  return {
    cinema,
    colorScheme,
    configOpen,
    configTab,
    defaultAgent,
    focusWordInHistory,
    historyFocusRevision,
    mobileRightPanel,
    onCloseConfig,
    onHistoryReverted,
    onSafeAreaGuideChange,
    provenanceDisplay,
    resolvedChatWidth,
    safeAreaGuide,
    chatWidth,
    setCinema,
    setConfigOpen,
    setConfigTab,
    setHistoryFocusRevision,
    setMobileRightPanel,
    setChatWidth,
    setSettingsOpen,
    setSettingsSection,
    settingsOpen,
    settingsSection,
    toggleColorScheme,
  };
}
