"use client";

import { cn } from "@/lib/utils";

export type SidebarSegmentView = "threads" | "workspace";

const SIDEBAR_SEGMENTED_PICKER_ACTIVE_CLASS = "relative z-[1] text-foreground";

export function SidebarSegmentedPicker({
  activeView,
  onSelectView,
  views = ["threads", "workspace"],
}: {
  activeView: SidebarSegmentView;
  onSelectView: (view: SidebarSegmentView) => void;
  views?: ReadonlyArray<SidebarSegmentView>;
}) {
  if (views.length < 2) {
    return null;
  }

  return (
    <div className="px-1.5 pb-2.5">
      <div className="sidebar-segmented-picker inline-flex w-full rounded-lg p-0.5">
        {views.map((view) => {
          const active = activeView === view;
          return (
            <button
              className={cn(
                "flex-1 rounded-md px-2.5 py-1 font-medium text-[11.5px] transition-colors",
                active
                  ? SIDEBAR_SEGMENTED_PICKER_ACTIVE_CLASS
                  : "text-secondary hover:bg-foreground/5 hover:text-foreground"
              )}
              data-sidebar-segmented-active={active ? "true" : undefined}
              key={view}
              onClick={() => onSelectView(view)}
              type="button"
            >
              {view === "threads" ? "Threads" : "Workspace"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
