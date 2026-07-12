import type { PlanSpan } from "@engine/cam-plan";
import { SAMPLE_RATE } from "@engine/edl";
import {
  indexClassForCam,
  legendLabelForCam,
  segmentClassForShot,
} from "@/lib/cam-colors";
import { cn } from "@/lib/utils";

function planDurationSamples(plan: PlanSpan[]): number {
  if (plan.length === 0) {
    return 0;
  }
  return plan.at(-1)?.toSample ?? 0;
}

function spanWidthPercent(span: PlanSpan, totalSamples: number): number {
  if (totalSamples <= 0) {
    return 0;
  }
  const spanSamples = Math.max(0, span.toSample - span.fromSample);
  return Math.round((spanSamples / totalSamples) * 1000) / 10;
}

export function CamMixTimeline({
  cams,
  plan,
}: {
  cams: { id: string; name: string; role: "speaker" | "wide" }[];
  plan: PlanSpan[];
}) {
  const totalSamples = planDurationSamples(plan);
  const legendCams = [
    ...cams.filter((cam) => cam.role === "speaker"),
    ...cams.filter((cam) => cam.role === "wide"),
  ];
  // Synthetic wide has no cam record but still needs a legend entry when the
  // plan cuts to it.
  const hasSyntheticWide =
    plan.some((span) => span.shot === "wide") &&
    !cams.some((cam) => cam.role === "wide");

  return (
    <div className="flex flex-col gap-1.5" data-cam-mix-timeline>
      <div
        aria-hidden="true"
        className="flex h-5 w-full overflow-hidden rounded-md border bg-muted/30"
      >
        {plan.map((span, index) => {
          const widthPct = spanWidthPercent(span, totalSamples);
          return (
            <div
              className={cn(
                "h-full min-w-0 border-border/40 border-r last:border-r-0",
                segmentClassForShot(span.shot, cams)
              )}
              data-cam-mix-span
              data-cam-mix-span-width={String(Math.round(widthPct))}
              key={`${span.fromSample}-${span.toSample}-${span.shot}-${index}`}
              style={{ width: `${widthPct}%` }}
              title={`${(span.fromSample / SAMPLE_RATE).toFixed(1)}s – ${(span.toSample / SAMPLE_RATE).toFixed(1)}s`}
            />
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-2" data-cam-legend>
        {legendCams.map((cam) => (
          <li
            className="flex items-center gap-1 text-muted-foreground text-xs"
            key={cam.id}
          >
            <span
              className={cn(
                "inline-flex size-3 shrink-0 rounded-sm",
                indexClassForCam(cam, cams)
              )}
            />
            {legendLabelForCam(cam, cams)}
          </li>
        ))}
        {hasSyntheticWide ? (
          <li
            className="flex items-center gap-1 text-muted-foreground text-xs"
            key="wide"
          >
            <span
              className={cn(
                "inline-flex size-3 shrink-0 rounded-sm",
                segmentClassForShot("wide", cams)
              )}
            />
            Wide
          </li>
        ) : null}
      </ul>
    </div>
  );
}
