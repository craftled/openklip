"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type SidebarSegmentView = "chats" | "assets";

const VIEW_LABELS: Record<SidebarSegmentView, string> = {
  chats: "Chats",
  assets: "Assets",
};

export function SidebarSegmentedPicker({
  activeView,
  onSelectView,
  views = ["chats", "assets"],
}: {
  activeView: SidebarSegmentView;
  onSelectView: (view: SidebarSegmentView) => void;
  views?: ReadonlyArray<SidebarSegmentView>;
}) {
  if (views.length < 2) {
    return null;
  }

  return (
    <div className="w-full px-2 pt-0 pb-1.5">
      <ToggleGroup
        aria-label="Sidebar view"
        className={cn(
          "grid w-full",
          views.length === 2 ? "grid-cols-2" : "grid-cols-3"
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
