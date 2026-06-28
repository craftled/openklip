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
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import { ChevronRight } from "@/lib/icon";
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
        <SidebarMenuButton tooltip={tooltip}>
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

/** sidebar-08 section row: icon + title + optional action + chevron, with shadcn hover/active styles. */
export function CollapsibleSidebarSection({
  action,
  children,
  className,
  defaultOpen = true,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
}) {
  return (
    <SidebarGroup className={cn("py-2", className)}>
      <SidebarMenu>
        <Collapsible asChild defaultOpen={defaultOpen}>
          <SidebarMenuItem className="relative">
            <CollapsibleTrigger asChild>
              <SidebarMenuButton className="[&[data-state=open]>svg.chevron]:rotate-90">
                {Icon ? <Icon /> : null}
                <span className="flex-1 truncate text-left">{title}</span>
                <ChevronRight className="chevron size-4 shrink-0 transition-transform duration-200" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            {action ? (
              <div className="absolute top-1/2 right-7 z-10 -translate-y-1/2">
                {action}
              </div>
            ) : null}
            <CollapsibleContent>
              <SidebarGroupContent className="space-y-2 px-1 pt-2 pb-1">
                {children}
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      </SidebarMenu>
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
      <Icon className="size-4 shrink-0 text-sidebar-accent-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-tertiary tabular-nums">{value}</span>
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
    <SidebarGroupLabel className="mb-1 h-7 px-2">
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      <span>{children}</span>
    </SidebarGroupLabel>
  );
}
