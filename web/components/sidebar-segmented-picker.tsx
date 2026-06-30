"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <div className="w-full px-1.5 pt-0.5 pb-1">
      <Tabs
        onValueChange={(value) => {
          onSelectView(value as SidebarSegmentView);
        }}
        value={activeView}
      >
        <TabsList
          className={cn(
            "grid h-8 w-full",
            views.length === 2 ? "grid-cols-2" : "grid-cols-3"
          )}
        >
          {views.map((view) => (
            <TabsTrigger key={view} value={view}>
              {VIEW_LABELS[view]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
