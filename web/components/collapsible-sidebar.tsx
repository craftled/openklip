"use client";

import type { ComponentType, ReactNode } from "react";
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
import { ChevronRight, FolderClosed, FolderOpen } from "@/lib/icon";
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
    <Collapsible asChild defaultOpen={defaultOpen}>
      <SidebarMenuItem>
        <SidebarMenuButton size="sm" tooltip={tooltip}>
          {icon}
          <span>{label}</span>
        </SidebarMenuButton>
        {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
        <CollapsibleTrigger asChild>
          <SidebarMenuAction className="data-[state=open]:rotate-90">
            <ChevronRight />
            <span className="sr-only">Toggle {label}</span>
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>{children}</SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
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
      <Collapsible asChild defaultOpen={defaultOpen}>
        <div>
          <div className="group/section-header relative my-1">
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  "group flex h-7 w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-left outline-hidden transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset [&[data-state=open]>svg.chevron]:rotate-90",
                  SIDEBAR_SECTION_LABEL_CLASS
                )}
                type="button"
              >
                {showFolderIcon ? (
                  <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center">
                    <FolderClosed className="size-3.5 shrink-0 opacity-60 group-data-[state=open]:hidden" />
                    <FolderOpen className="hidden size-3.5 shrink-0 opacity-60 group-data-[state=open]:block" />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <ChevronRight className="chevron size-3.5 shrink-0 opacity-60 transition-transform duration-200" />
              </button>
            </CollapsibleTrigger>
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
        </div>
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
    <div className="flex h-7 items-center gap-2 px-2 text-[12px] text-sidebar-foreground">
      <Icon className="size-4 shrink-0 text-inherit opacity-70" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-tertiary/70 tabular-nums">{value}</span>
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
        "mb-1 h-7 px-2 font-normal text-tertiary/58",
        SIDEBAR_SECTION_LABEL_CLASS
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0 opacity-70" /> : null}
      <span>{children}</span>
    </SidebarGroupLabel>
  );
}
