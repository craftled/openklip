"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CONFIG_TAB_LABELS,
  CONFIG_TABS,
  type ConfigTabId,
} from "@/lib/config-tabs";
import { cn } from "@/lib/utils";

export function ConfigTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: ConfigTabId;
  onTabChange: (tab: ConfigTabId) => void;
}) {
  return (
    <div
      className="w-full shrink-0 border-border/80 border-b px-2 py-1.5"
      data-config-tab-bar
    >
      <ToggleGroup
        aria-label="Config section"
        className="grid w-full grid-cols-5"
        onValueChange={(value) => {
          const nextTab = Array.isArray(value) ? value[0] : value;
          if (nextTab) {
            onTabChange(nextTab as ConfigTabId);
          }
        }}
        size="sm"
        spacing={0}
        type="single"
        value={activeTab}
        variant="outline"
      >
        {CONFIG_TABS.map((tab, index) => (
          <ToggleGroupItem
            className={cn(
              "h-7! w-full px-1! text-[0.7rem]",
              index === 0 && "rounded-r-none! rounded-l-md!",
              index === CONFIG_TABS.length - 1 &&
                "rounded-r-md! rounded-l-none!",
              index > 0 && index < CONFIG_TABS.length - 1 && "rounded-none!"
            )}
            key={tab}
            value={tab}
          >
            {CONFIG_TAB_LABELS[tab]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
