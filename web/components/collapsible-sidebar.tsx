"use client";

import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import {
  APP_ICON_CLASS,
  ChevronRight,
  FolderClosed,
  FolderOpen,
} from "@/lib/icon";
import {
  SIDEBAR_NESTED_LIST_GAP_CLASS,
  SIDEBAR_NESTED_LIST_OFFSET_CLASS,
  SIDEBAR_SECTION_LABEL_CLASS,
} from "@/lib/sidebar-row-styles";
import { cn } from "@/lib/utils";

/** sidebar-08 nav-main pattern: menu row + chevron action + collapsible sub panel. */
export function CollapsibleSidebarMenuItem({
  badge,
  children,
  defaultOpen = false,
  icon,
  label,
  tooltip,
}: {
  badge?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  icon: ReactNode;
  label: string;
  tooltip?: string;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} render={<SidebarMenuItem />}>
      <SidebarMenuButton size="sm" tooltip={tooltip}>
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
      {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
      <CollapsibleTrigger
        render={
          <SidebarMenuAction className="data-panel-open:rotate-90">
            <ChevronRight />
            <span className="sr-only">Toggle {label}</span>
          </SidebarMenuAction>
        }
      />
      <CollapsibleContent>
        <SidebarMenuSub>{children}</SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** synara-style section: muted label row + chevron, no icon, no hover fill on header. */
export function CollapsibleSidebarSection({
  action,
  children,
  className,
  defaultOpen = true,
  showFolderIcon = false,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  showFolderIcon?: boolean;
  title: ReactNode;
}) {
  return (
    <SidebarGroup className={cn("py-1.5", className)}>
      <Collapsible defaultOpen={defaultOpen} render={<div />}>
        <div className="group/section-header relative my-1">
          <CollapsibleTrigger
            render={
              <Button
                className={cn(
                  "group h-7 w-full min-w-0 justify-start gap-1 px-2 py-0.5 text-left focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&[data-panel-open]>svg.chevron]:rotate-90",
                  SIDEBAR_SECTION_LABEL_CLASS
                )}
                type="button"
                variant="ghost"
              >
                {showFolderIcon ? (
                  <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
                    <FolderClosed
                      className={cn(
                        APP_ICON_CLASS,
                        "group-data-panel-open:hidden"
                      )}
                    />
                    <FolderOpen
                      className={cn(
                        "hidden group-data-panel-open:block",
                        APP_ICON_CLASS
                      )}
                    />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <ChevronRight
                  className={cn(
                    "chevron transition-transform duration-200",
                    APP_ICON_CLASS
                  )}
                />
              </Button>
            }
          />
          {action ? (
            <div className="absolute top-1/2 right-7 z-10 -translate-y-1/2">
              {action}
            </div>
          ) : null}
        </div>
        <CollapsibleContent>
          <SidebarGroupContent
            className={cn(
              SIDEBAR_NESTED_LIST_OFFSET_CLASS,
              SIDEBAR_NESTED_LIST_GAP_CLASS,
              "flex flex-col px-0"
            )}
          >
            {children}
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

export function CollapsibleSidebarMetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex h-7 items-center gap-2 px-2 text-sidebar-foreground text-xs">
      <Icon className={APP_ICON_CLASS} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-muted-foreground/70 tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** Small label inside an expanded settings/inspector panel. */
export function SidebarSettingsLabel({
  children,
  icon: Icon,
}: {
  children: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <SidebarGroupLabel
      className={cn(
        "mb-1 h-7 px-2 font-normal text-muted-foreground/58",
        SIDEBAR_SECTION_LABEL_CLASS
      )}
    >
      {Icon ? <Icon className={APP_ICON_CLASS} /> : null}
      <span>{children}</span>
    </SidebarGroupLabel>
  );
}
