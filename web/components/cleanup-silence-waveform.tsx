import type { CleanupCandidate } from "@engine/cleanup";
import {
  mapBucketsToBars,
  type PeakWindow,
  silenceOverlayRegions,
} from "@/lib/cleanup-silence";

export interface CleanupSilenceWaveformProps {
  buckets: [number, number][];
  candidate: CleanupCandidate;
  keepPadSec: number;
  minSec: number;
  window: PeakWindow;
}

const SVG_WIDTH = 280;
const SVG_HEIGHT = 48;

export function CleanupSilenceWaveform({
  buckets,
  candidate,
  keepPadSec,
  minSec,
  window,
}: CleanupSilenceWaveformProps) {
  const bars = mapBucketsToBars(buckets, SVG_WIDTH, SVG_HEIGHT);
  const overlay = silenceOverlayRegions(candidate, keepPadSec, window);
  const cutLeft = overlay.cutStartNorm * SVG_WIDTH;
  const cutWidth = Math.max(
    0,
    (overlay.cutEndNorm - overlay.cutStartNorm) * SVG_WIDTH
  );
  const leftPadWidth = Math.max(
    0,
    (overlay.leftPadEndNorm - overlay.leftPadStartNorm) * SVG_WIDTH
  );
  const rightPadWidth = Math.max(
    0,
    (overlay.rightPadEndNorm - overlay.rightPadStartNorm) * SVG_WIDTH
  );

  return (
    <div
      className="flex flex-col gap-1 rounded-md outline outline-1 outline-[var(--cleanup-waveform-outline)] [--cleanup-waveform-outline:oklch(0_0_0/0.1)] dark:[--cleanup-waveform-outline:oklch(1_0_0/0.1)]"
      data-cleanup-silence-waveform
    >
      <svg
        aria-hidden="true"
        className="w-full text-foreground"
        focusable="false"
        preserveAspectRatio="none"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      >
        <title>Silence waveform preview</title>
        <rect
          fill="var(--muted)"
          height={SVG_HEIGHT}
          opacity={0.35}
          width={SVG_WIDTH}
          x={0}
          y={0}
        />
        {bars.map((bar) => (
          <rect
            fill="var(--foreground)"
            height={bar.h}
            key={`${bar.x}-${bar.minY}`}
            opacity={0.55}
            width={bar.w}
            x={bar.x}
            y={Math.min(bar.minY, bar.maxY)}
          />
        ))}
        <rect
          fill="var(--destructive)"
          height={SVG_HEIGHT}
          opacity={0.18}
          width={cutWidth}
          x={cutLeft}
          y={0}
        />
        <line
          stroke="var(--muted-foreground)"
          strokeDasharray="2 2"
          strokeWidth={1}
          x1={cutLeft}
          x2={cutLeft}
          y1={0}
          y2={SVG_HEIGHT}
        />
        <line
          stroke="var(--muted-foreground)"
          strokeDasharray="2 2"
          strokeWidth={1}
          x1={cutLeft + cutWidth}
          x2={cutLeft + cutWidth}
          y1={0}
          y2={SVG_HEIGHT}
        />
      </svg>
      <div className="grid grid-cols-3 gap-1 text-[0.65rem] text-muted-foreground tabular-nums">
        <span className="truncate" data-cleanup-silence-label="left-pad">
          {leftPadWidth > 4 ? `${keepPadSec.toFixed(2)}s pad` : ""}
        </span>
        <span
          className="truncate text-center"
          data-cleanup-silence-label="threshold"
        >
          {`> ${minSec.toFixed(1)}s`}
        </span>
        <span
          className="truncate text-right"
          data-cleanup-silence-label="right-pad"
        >
          {rightPadWidth > 4 ? `${keepPadSec.toFixed(2)}s pad` : ""}
        </span>
      </div>
    </div>
  );
}
