"use client";

import type { HighlightClip, Highlights } from "@engine/edl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/lib/icon";
import { cn } from "@/lib/utils";

const MAX_ROWS = 50;

function fmtTimecode(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function HighlightRow({
  active,
  clip,
  disabled,
  onSeekClip,
}: {
  active: boolean;
  clip: HighlightClip;
  disabled: boolean;
  onSeekClip: (clip: HighlightClip) => void;
}) {
  return (
    <li>
      <button
        className={cn(
          "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50",
          active && "border-primary bg-muted/60"
        )}
        data-highlights-row
        disabled={disabled}
        onClick={() => onSeekClip(clip)}
        type="button"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-xs">{clip.title}</span>
          <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs tabular-nums">
            <span>
              {fmtTimecode(clip.fromSec)} – {fmtTimecode(clip.toSec)}
            </span>
            {clip.score == null ? null : (
              <span>{Math.round(clip.score * 100)}%</span>
            )}
          </div>
          {clip.reason ? (
            <span className="truncate text-muted-foreground text-xs">
              {clip.reason}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}

export interface HighlightsPanelProps {
  activeClipId?: string | null;
  applying?: boolean;
  detecting?: boolean;
  highlights: Highlights | null | undefined;
  onDetect?: () => void | Promise<void>;
  onSeekClip: (clip: HighlightClip) => void;
}

export function HighlightsPanel({
  activeClipId,
  applying = false,
  detecting = false,
  highlights,
  onDetect,
  onSeekClip,
}: HighlightsPanelProps) {
  const clips = highlights?.clips ?? [];
  const rows = clips.slice(0, MAX_ROWS);
  const hiddenCount = clips.length - rows.length;
  const busy = applying || detecting;

  return (
    <div className="flex flex-col gap-2" data-highlights-panel>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <Badge data-highlights-count variant="secondary">
          {clips.length} {clips.length === 1 ? "clip" : "clips"}
        </Badge>
        {onDetect ? (
          <Button
            data-highlights-detect
            disabled={busy}
            onClick={() => void onDetect()}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Sparkles data-icon="inline-start" />
            {detecting ? "Detecting…" : "Detect clips"}
          </Button>
        ) : null}
      </div>

      {clips.length === 0 ? (
        <p className="text-muted-foreground text-xs">No highlight clips yet.</p>
      ) : (
        <>
          <ul
            className="flex max-h-40 flex-col gap-1 overflow-y-auto"
            data-highlights-list
          >
            {rows.map((c) => (
              <HighlightRow
                active={activeClipId === c.id}
                clip={c}
                disabled={busy}
                key={c.id}
                onSeekClip={onSeekClip}
              />
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <p className="text-muted-foreground text-xs">{hiddenCount} more</p>
          ) : null}
        </>
      )}
    </div>
  );
}
