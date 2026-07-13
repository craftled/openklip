"use client";

import type { CleanupCandidate, CleanupReport } from "@engine/cleanup";
import { CleanupPanel } from "@/components/cleanup-panel";
import { Section } from "@/components/config/config-section";
import type { CleanupSilencesProgress } from "@/hooks/use-cleanup-tab-data";
import type {
  CleanupUndoSnapshot,
  ToggleableCleanupCategory,
} from "@/lib/cleanup-tab";

export interface ConfigCleanupTabProps {
  aiPassEnabled?: boolean;
  applying?: boolean;
  lastUndo: CleanupUndoSnapshot | null;
  onApply: (candidate: CleanupCandidate) => void;
  onApplyAllSafe: () => void;
  onApplyAllSilences: () => void;
  onApplyEnabled: () => void;
  onPatchCleanupThreshold: (
    field: "keepPadSec" | "minSec",
    value: number
  ) => void;
  onPendingHighlightChange?: (wordIds: readonly string[]) => void;
  onRemoveSpan: (id: string) => void;
  onToggleCategory: (
    category: ToggleableCleanupCategory,
    enabled: boolean
  ) => void;
  onUndoLast: () => void;
  registeredSpans: { endSec: number; id: string; startSec: number }[];
  report: CleanupReport;
  silencesLoading?: boolean;
  silencesProgress?: CleanupSilencesProgress | null;
  slug: string;
}

export function ConfigCleanupTab({
  aiPassEnabled = true,
  applying = false,
  lastUndo,
  onPendingHighlightChange,
  onApply,
  onApplyAllSafe,
  onApplyAllSilences,
  onApplyEnabled,
  onPatchCleanupThreshold,
  onRemoveSpan,
  onToggleCategory,
  onUndoLast,
  registeredSpans,
  report,
  silencesLoading,
  silencesProgress,
  slug,
}: ConfigCleanupTabProps) {
  return (
    <Section defaultOpen title="Cleanup">
      <CleanupPanel
        aiPassEnabled={aiPassEnabled}
        applying={applying}
        lastUndo={lastUndo}
        onApply={onApply}
        onApplyAllSafe={onApplyAllSafe}
        onApplyAllSilences={onApplyAllSilences}
        onApplyEnabled={onApplyEnabled}
        onPatchCleanupThreshold={onPatchCleanupThreshold}
        onPendingHighlightChange={onPendingHighlightChange}
        onRemoveSpan={onRemoveSpan}
        onToggleCategory={onToggleCategory}
        onUndoLast={onUndoLast}
        registeredSpans={registeredSpans}
        report={report}
        silencesLoading={silencesLoading}
        silencesProgress={silencesProgress}
        slug={slug}
      />
    </Section>
  );
}
