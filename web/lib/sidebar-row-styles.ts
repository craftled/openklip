import { cn } from "@/lib/utils";

/** Shared horizontal inset for sidebar chrome. */
export const SIDEBAR_CONTENT_INSET_CLASS = "px-1.5";

export const SIDEBAR_HEADER_ICON_CLASS = "size-4 shrink-0";

export const SIDEBAR_LEADING_GLYPH_CLASS = "size-4 shrink-0";

export const SIDEBAR_ROW_LABEL_TEXT_CLASS = "font-medium";

export const SIDEBAR_SECTION_LABEL_CLASS =
  "text-xs font-medium text-muted-foreground";

export const SIDEBAR_NESTED_LIST_GAP_CLASS = "gap-0.5";

export const SIDEBAR_NESTED_LIST_OFFSET_CLASS = "pt-0.5";

export const SIDEBAR_ROW_HOVER_CLASS =
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export const SIDEBAR_ROW_IDLE_TEXT_CLASS = "text-sidebar-foreground";

export const SIDEBAR_ROW_ACTIVE_CLASS =
  "bg-sidebar-accent text-sidebar-accent-foreground";

export const SIDEBAR_HEADER_ROW_CLASS = cn(
  "flex w-full min-w-0 cursor-pointer select-none items-center text-left",
  "h-8 gap-2 rounded-md px-2 text-sm",
  "outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
);

/**
 * Minimal overrides for `SidebarMenuButton` header rows.
 * Active/hover colors come from the button variant + `isActive`.
 */
export const SIDEBAR_MENU_HEADER_CLASS =
  "min-w-0 h-8 px-2 text-sm text-sidebar-foreground";

/**
 * Minimal overrides for `SidebarMenuButton` chat/thread rows.
 * Active colors come from `isActive` on `SidebarMenuButton`.
 */
export const SIDEBAR_MENU_THREAD_CLASS =
  "h-8 justify-start pl-2 text-sm text-sidebar-foreground";

/** Primary nav rows: project switcher, New chat, Search. */
export function sidebarHeaderRowClass(isActive = false): string {
  return cn(
    SIDEBAR_HEADER_ROW_CLASS,
    isActive
      ? SIDEBAR_ROW_ACTIVE_CLASS
      : cn(SIDEBAR_ROW_IDLE_TEXT_CLASS, SIDEBAR_ROW_HOVER_CLASS)
  );
}
