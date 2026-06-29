import { cn } from "@/lib/utils";

/** Compact sidebar row height (synara: 1.75rem / 28px). */
export const SIDEBAR_ROW_HEIGHT_CLASS = "min-h-7 h-7";

export const SIDEBAR_ROW_RADIUS_CLASS = "rounded-md";

export const SIDEBAR_ROW_PADDING_CLASS = "px-2 py-0.5";

export const SIDEBAR_ROW_GAP_CLASS = "gap-2";

/** Primary nav rows: project switcher, New chat, Search. */
export const SIDEBAR_ROW_TEXT_CLASS = "text-[12px] font-normal";

export const SIDEBAR_ROW_FOCUS_CLASS =
  "outline-hidden transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

export const SIDEBAR_ROW_HOVER_CLASS =
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export const SIDEBAR_ROW_ACTIVE_CLASS =
  "bg-[var(--sidebar-accent-active)] text-sidebar-accent-foreground hover:bg-[var(--sidebar-accent-active)] hover:text-sidebar-accent-foreground";

export const SIDEBAR_ROW_IDLE_TEXT_CLASS = "text-foreground/89";

export const SIDEBAR_ROW_LABEL_TEXT_CLASS = "text-foreground/95";

/** Section labels: Chats, Assets, Settings, Archived. */
export const SIDEBAR_SECTION_LABEL_CLASS =
  "text-[12px] font-normal text-tertiary/58";

/** Project/header rows and primary sidebar actions. */
export const SIDEBAR_HEADER_ROW_CLASS = cn(
  "flex w-full min-w-0 cursor-pointer select-none items-center text-left",
  SIDEBAR_ROW_HEIGHT_CLASS,
  SIDEBAR_ROW_GAP_CLASS,
  SIDEBAR_ROW_RADIUS_CLASS,
  SIDEBAR_ROW_PADDING_CLASS,
  SIDEBAR_ROW_TEXT_CLASS,
  SIDEBAR_ROW_FOCUS_CLASS
);

/** Chat/thread rows nested under a section. */
export const SIDEBAR_THREAD_ROW_BASE_CLASS = cn(
  "w-full translate-x-0 cursor-pointer select-none justify-start text-left",
  SIDEBAR_ROW_HEIGHT_CLASS,
  SIDEBAR_ROW_RADIUS_CLASS,
  "pl-2 text-[13px]",
  SIDEBAR_ROW_FOCUS_CLASS
);

export const SIDEBAR_NESTED_LIST_GAP_CLASS = "gap-0.5";

export const SIDEBAR_NESTED_LIST_OFFSET_CLASS = "pt-0.5";

export const SIDEBAR_HEADER_ICON_CLASS = "size-4 shrink-0 text-inherit";

/** Primary nav leading glyphs (Synara: 15px in a 16px slot). */
export const SIDEBAR_LEADING_GLYPH_CLASS = "size-[15px] shrink-0 text-inherit";

/** Shared horizontal inset for sidebar chrome (rows, picker, sections). */
export const SIDEBAR_CONTENT_INSET_CLASS = "px-1.5";

/** Chats / Assets sliding tabs wrapper spacing. */
export const SIDEBAR_SEGMENTED_PICKER_WRAP_CLASS = cn(
  SIDEBAR_CONTENT_INSET_CLASS,
  "w-full pt-0.5 pb-1"
);

export function sidebarThreadRowClass(isActive: boolean): string {
  if (isActive) {
    return cn(SIDEBAR_THREAD_ROW_BASE_CLASS, SIDEBAR_ROW_ACTIVE_CLASS);
  }
  return cn(
    SIDEBAR_THREAD_ROW_BASE_CLASS,
    SIDEBAR_ROW_IDLE_TEXT_CLASS,
    SIDEBAR_ROW_HOVER_CLASS
  );
}

export function sidebarHeaderRowClass(isActive = false): string {
  if (isActive) {
    return cn(SIDEBAR_HEADER_ROW_CLASS, SIDEBAR_ROW_ACTIVE_CLASS);
  }
  return cn(
    SIDEBAR_HEADER_ROW_CLASS,
    SIDEBAR_ROW_IDLE_TEXT_CLASS,
    SIDEBAR_ROW_HOVER_CLASS
  );
}
