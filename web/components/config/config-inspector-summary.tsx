"use client";

import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import type {
  ConfigInspectorIconId,
  ConfigInspectorSummary,
} from "@/lib/config-inspector";
import {
  APP_ICON_CLASS,
  Captions,
  Clock3,
  Film,
  ImageIcon,
  Scan,
  Sparkles,
  Type,
  Volume2,
  ZoomIn,
} from "@/lib/icon";

const ICONS: Record<
  ConfigInspectorIconId,
  ComponentType<{ className?: string }>
> = {
  zoom: ZoomIn,
  type: Type,
  film: Film,
  image: ImageIcon,
  sparkles: Sparkles,
  captions: Captions,
  clock: Clock3,
  scan: Scan,
  volume: Volume2,
};

export function ConfigInspectorHeader({
  summary,
}: {
  summary: ConfigInspectorSummary;
}) {
  const HeaderIcon = ICONS[summary.icon];

  return (
    <div
      className="shrink-0 border-border/80 border-b px-2 py-1.5"
      data-config-inspector-summary
    >
      <div className="flex h-7 items-center gap-2">
        <HeaderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium text-[0.82rem]">
          {summary.label}
        </span>
        <Badge className="shrink-0" variant="secondary">
          {summary.badge}
        </Badge>
      </div>
      {summary.meta.length > 0 ? (
        <div className="mt-1 ml-[0.42rem] border-border/70 border-l pl-2.5">
          {summary.meta.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <div
                className="flex h-5 min-w-0 items-center gap-1.5 text-[0.75rem]"
                key={item.label}
                title={`${item.label}: ${item.value}`}
              >
                <Icon className={APP_ICON_CLASS} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {item.label}
                </span>
                <span className="min-w-0 max-w-[55%] truncate text-muted-foreground tabular-nums">
                  {item.value}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
