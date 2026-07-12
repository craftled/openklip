"use client";

import type { CleanupCandidate, CleanupReport } from "@engine/cleanup";
import { CleanupPanel } from "@/components/cleanup-panel";
import { Section } from "@/components/config/config-section";
import type {
  CleanupUndoSnapshot,
  ToggleableCleanupCategory,
} from "@/lib/cleanup-tab";

export interface ConfigCleanupTabProps {
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
  slug: string;
}

export function ConfigCleanupTab({
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
  slug,
}: ConfigCleanupTabProps) {
  return (
    <Section defaultOpen title="Cleanup">
      <CleanupPanel
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
        slug={slug}
      />
    </Section>
  );
}
