"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type SidebarSegmentView = "assets" | "chats" | "config" | "search";

const VIEW_LABELS: Record<SidebarSegmentView, string> = {
  chats: "Chats",
  assets: "Assets",
  config: "Config",
  search: "Search",
};

export function SidebarSegmentedPicker({
  activeView,
  className,
  onSelectView,
  views = ["chats", "assets"],
}: {
  activeView: SidebarSegmentView;
  className?: string;
  onSelectView: (view: SidebarSegmentView) => void;
  views?: ReadonlyArray<SidebarSegmentView>;
}) {
  if (views.length < 2) {
    return null;
  }

  return (
    <div className={cn("w-full", className)}>
      <ToggleGroup
        aria-label="Sidebar view"
        className={cn(
          "grid w-full",
          { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[
            views.length
          ] ?? "grid-cols-4"
        )}
        onValueChange={(value) => {
          const nextView = Array.isArray(value) ? value[0] : value;
          if (nextView) {
            onSelectView(nextView as SidebarSegmentView);
          }
        }}
        size="sm"
        spacing={0}
        type="single"
        value={activeView}
        variant="outline"
      >
        {views.map((view) => (
          <ToggleGroupItem
            className="h-7! w-full first:rounded-r-none! first:rounded-l-md! last:rounded-r-md! last:rounded-l-none!"
            data-sidebar-segment={view}
            key={view}
            value={view}
          >
            {VIEW_LABELS[view]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
