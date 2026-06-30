"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CornerDownLeftIcon, Search } from "@/lib/icon";
import {
  SETTINGS_NAV_GROUPS,
  SETTINGS_NAV_ITEMS,
  type SettingsNavItem,
  type SettingsSectionId,
} from "@/lib/settings-navigation";
import {
  SIDEBAR_HEADER_ICON_CLASS,
  SIDEBAR_ROW_ACTIVE_CLASS,
  SIDEBAR_ROW_HOVER_CLASS,
  SIDEBAR_ROW_IDLE_TEXT_CLASS,
  SIDEBAR_ROW_LABEL_TEXT_CLASS,
  SIDEBAR_SECTION_LABEL_CLASS,
  sidebarHeaderRowClass,
} from "@/lib/sidebar-row-styles";
import { cn } from "@/lib/utils";

function matchesQuery(item: SettingsNavItem, query: string): boolean {
  const haystack = `${item.label} ${item.description}`.toLowerCase();
  return haystack.includes(query);
}

export function SettingsSidebarNav({
  activeSection,
  onBack,
  onSelectSection,
}: {
  activeSection: SettingsSectionId;
  onBack: () => void;
  onSelectSection: (section: SettingsSectionId) => void;
}) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const results = useMemo(
    () =>
      isSearching
        ? SETTINGS_NAV_ITEMS.filter((item) => matchesQuery(item, trimmedQuery))
        : SETTINGS_NAV_ITEMS,
    [isSearching, trimmedQuery]
  );

  return (
    <div className="px-1.5 py-1.5">
      <div className="mb-3">
        <Button
          className={cn(
            "h-auto justify-start",
            sidebarHeaderRowClass(),
            SIDEBAR_ROW_IDLE_TEXT_CLASS,
            SIDEBAR_ROW_HOVER_CLASS
          )}
          onClick={onBack}
          type="button"
          variant="ghost"
        >
          <CornerDownLeftIcon className={SIDEBAR_HEADER_ICON_CLASS} />
          <span className={SIDEBAR_ROW_LABEL_TEXT_CLASS}>Back to app</span>
        </Button>
      </div>

      <div className="mb-3 px-1">
        <div className="relative">
          <Search
            className={cn(
              "pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2",
              SIDEBAR_HEADER_ICON_CLASS
            )}
          />
          <Input
            aria-label="Search settings"
            className="h-7 rounded-[min(var(--radius-md),12px)] border-border bg-background px-2 pl-8 text-xs shadow-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings..."
            value={query}
          />
        </div>
      </div>

      {isSearching ? (
        results.length === 0 ? (
          <p className={cn("px-2", SIDEBAR_SECTION_LABEL_CLASS)}>
            No matching settings.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {results.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeSection;
              return (
                <li key={item.id}>
                  <Button
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "h-auto justify-start",
                      sidebarHeaderRowClass(isActive),
                      SIDEBAR_ROW_LABEL_TEXT_CLASS
                    )}
                    onClick={() => onSelectSection(item.id)}
                    type="button"
                    variant="ghost"
                  >
                    <Icon className={SIDEBAR_HEADER_ICON_CLASS} />
                    <span className="truncate">{item.label}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <nav aria-label="Settings sections" className="flex flex-col">
          {SETTINGS_NAV_GROUPS.map((group) => {
            const items = SETTINGS_NAV_ITEMS.filter(
              (item) => item.group === group.id
            );
            if (items.length === 0) {
              return null;
            }
            return (
              <section
                aria-labelledby={`settings-nav-${group.id}`}
                className="not-first:mt-3 flex flex-col"
                key={group.id}
              >
                <h2
                  className={cn("px-2 py-1", SIDEBAR_SECTION_LABEL_CLASS)}
                  id={`settings-nav-${group.id}`}
                >
                  {group.label}
                </h2>
                <ul className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.id === activeSection;
                    return (
                      <li key={item.id}>
                        <Button
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "h-auto justify-start",
                            sidebarHeaderRowClass(isActive),
                            isActive
                              ? SIDEBAR_ROW_ACTIVE_CLASS
                              : cn(
                                  SIDEBAR_ROW_LABEL_TEXT_CLASS,
                                  SIDEBAR_ROW_HOVER_CLASS
                                )
                          )}
                          onClick={() => onSelectSection(item.id)}
                          type="button"
                          variant="ghost"
                        >
                          <Icon className={SIDEBAR_HEADER_ICON_CLASS} />
                          <span className="truncate">{item.label}</span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </nav>
      )}
    </div>
  );
}
