"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { clampLoopRegion } from "@/lib/preview-layout";

export function PlaybackLoopControls({
  curSec,
  fmtTime,
  fullDurationSec,
  keptDurationSec,
  loop,
  onClearLoop,
  onSetLoop,
  outPos,
}: {
  curSec: number;
  fmtTime: (sec: number) => string;
  fullDurationSec: number;
  keptDurationSec: number;
  loop: { inSec: number; outSec: number } | null;
  onClearLoop: () => void;
  onSetLoop: (loop: { inSec: number; outSec: number }) => void;
  outPos: number;
}) {
  const [loopInPending, setLoopInPending] = useState<number | null>(null);

  useEffect(() => {
    if (!loop) {
      setLoopInPending(null);
    }
  }, [loop]);

  return (
    <div
      className="flex flex-col gap-2 border-border/80 border-t px-2 py-2.5"
      data-playback-loop-section
    >
      <div className="text-muted-foreground text-xs tabular-nums">
        {fmtTime(outPos)} / {fmtTime(keptDurationSec)}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          aria-label="Set loop in-point"
          className="flex-1"
          onClick={() => setLoopInPending(curSec)}
          size="sm"
          variant="outline"
        >
          In
        </Button>
        <Button
          aria-label="Set loop out-point"
          className="flex-1"
          onClick={() => {
            const region = clampLoopRegion(
              loopInPending ?? 0,
              curSec,
              fullDurationSec
            );
            if (region) {
              onSetLoop(region);
            }
          }}
          size="sm"
          variant="outline"
        >
          Out
        </Button>
      </div>
      {loop ? (
        <Button
          aria-label="Clear loop region"
          className="justify-start text-muted-foreground text-xs"
          onClick={onClearLoop}
          size="sm"
          variant="ghost"
        >
          Loop {fmtTime(loop.inSec)}–{fmtTime(loop.outSec)} ✕
        </Button>
      ) : null}
    </div>
  );
}
