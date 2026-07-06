"use client";

import { type FeatureDef, featureGroups, features } from "@engine/features";
import { useMemo, useState } from "react";
import {
  SETTINGS_CARD_CLASS,
  SETTINGS_CARD_ROW_CLASS,
  SETTINGS_CARD_ROW_DESCRIPTION_CLASS,
  SETTINGS_CARD_ROW_TITLE_CLASS,
  SETTINGS_PANEL_SECTION_CLASS,
} from "@/components/settings/settings-panel-primitives";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ChevronRight, Search } from "@/lib/icon";
import {
  SIDEBAR_HEADER_ICON_CLASS,
  SIDEBAR_SECTION_LABEL_CLASS,
} from "@/lib/sidebar-row-styles";
import { cn } from "@/lib/utils";

const SURFACE_LABELS: Record<string, string> = {
  cli: "CLI",
  gui: "GUI",
  mcp: "MCP",
};

function matchesFeatureQuery(feature: FeatureDef, query: string): boolean {
  const groupTitle =
    featureGroups.find((g) => g.id === feature.group)?.title ?? feature.group;
  const haystack =
    `${feature.title} ${feature.description} ${groupTitle}`.toLowerCase();
  return haystack.includes(query);
}

function FeatureSurfaceBadges({ feature }: { feature: FeatureDef }) {
  return (
    <div className="flex flex-wrap gap-1">
      {feature.surfaces.map((surface) => (
        <Badge key={surface} variant="secondary">
          {SURFACE_LABELS[surface] ?? surface}
        </Badge>
      ))}
      {feature.requires?.platform === "darwin" ? (
        <Badge variant="outline">macOS</Badge>
      ) : null}
      {feature.since ? (
        <Badge variant="outline">since {feature.since}</Badge>
      ) : null}
    </div>
  );
}

function FeatureGroupSection({
  groupTitle,
  items,
}: {
  groupTitle: string;
  items: FeatureDef[];
}) {
  const [open, setOpen] = useState(true);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className={SETTINGS_PANEL_SECTION_CLASS}>
      <Collapsible onOpenChange={setOpen} open={open} render={<div />}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left",
            SIDEBAR_SECTION_LABEL_CLASS,
            "hover:bg-muted/40"
          )}
          type="button"
        >
          <ChevronRight
            className={cn(
              SIDEBAR_HEADER_ICON_CLASS,
              "transition-transform",
              open && "rotate-90"
            )}
          />
          <span className="min-w-0 flex-1 truncate">{groupTitle}</span>
          <Badge className="font-normal" variant="secondary">
            {items.length}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn(SETTINGS_CARD_CLASS, "mt-1")}>
            {items.map((feature) => (
              <div className={SETTINGS_CARD_ROW_CLASS} key={feature.id}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={SETTINGS_CARD_ROW_TITLE_CLASS}>
                      {feature.title}
                    </h3>
                    <FeatureSurfaceBadges feature={feature} />
                  </div>
                  <p className={SETTINGS_CARD_ROW_DESCRIPTION_CLASS}>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

export function SettingsFeaturesPanel() {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim().toLowerCase();

  const filteredByGroup = useMemo(() => {
    const filtered = trimmedQuery
      ? features.filter((feature) => matchesFeatureQuery(feature, trimmedQuery))
      : [...features];

    return featureGroups.map((group) => ({
      ...group,
      items: filtered.filter((feature) => feature.group === group.id),
    }));
  }, [trimmedQuery]);

  const totalVisible = filteredByGroup.reduce(
    (sum, group) => sum + group.items.length,
    0
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative px-0.5">
        <Search
          className={cn(
            "pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2",
            SIDEBAR_HEADER_ICON_CLASS
          )}
        />
        <Input
          aria-label="Search features"
          className="h-8 rounded-[min(var(--radius-md),12px)] border-border bg-background px-2 pl-8 text-xs shadow-none"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search features..."
          value={query}
        />
      </div>

      {totalVisible === 0 ? (
        <p className={cn("px-2", SIDEBAR_SECTION_LABEL_CLASS)}>
          No matching features.
        </p>
      ) : (
        filteredByGroup.map((group) => (
          <FeatureGroupSection
            groupTitle={group.title}
            items={group.items}
            key={group.id}
          />
        ))
      )}
    </div>
  );
}
