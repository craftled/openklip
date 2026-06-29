"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { SIDEBAR_SEGMENTED_PICKER_WRAP_CLASS } from "@/lib/sidebar-row-styles";

export type SidebarSegmentView = "chats" | "assets";

const VIEW_LABELS: Record<SidebarSegmentView, string> = {
  chats: "Chats",
  assets: "Assets",
};

function syncPillToTab(
  pill: HTMLSpanElement,
  tab: HTMLButtonElement,
  animate: boolean
) {
  if (!animate) {
    pill.style.transition = "none";
  }
  pill.style.width = `${tab.offsetWidth}px`;
  pill.style.transform = `translateX(${tab.offsetLeft}px)`;
  if (!animate) {
    void pill.offsetWidth;
    pill.style.transition = "";
  }
}

export function SidebarSegmentedPicker({
  activeView,
  onSelectView,
  views = ["chats", "assets"],
}: {
  activeView: SidebarSegmentView;
  onSelectView: (view: SidebarSegmentView) => void;
  views?: ReadonlyArray<SidebarSegmentView>;
}) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<
    Partial<Record<SidebarSegmentView, HTMLButtonElement>>
  >({});
  const hasPaintedRef = useRef(false);

  const movePill = useCallback(
    (animate: boolean) => {
      const pill = pillRef.current;
      const tab = tabRefs.current[activeView];
      if (!(pill && tab)) {
        return;
      }
      syncPillToTab(pill, tab, animate);
    },
    [activeView]
  );

  useLayoutEffect(() => {
    movePill(hasPaintedRef.current);
    hasPaintedRef.current = true;
  }, [movePill]);

  useLayoutEffect(() => {
    const container = tabsRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(() => {
      movePill(false);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [movePill]);

  if (views.length < 2) {
    return null;
  }

  return (
    <div className={SIDEBAR_SEGMENTED_PICKER_WRAP_CLASS}>
      <div className="sidebar-sliding-tabs" ref={tabsRef} role="tablist">
        <span
          aria-hidden="true"
          className="sidebar-sliding-tabs-pill"
          ref={pillRef}
        />
        {views.map((view) => {
          const selected = activeView === view;
          return (
            <button
              aria-selected={selected}
              className="sidebar-sliding-tab"
              key={view}
              onClick={() => {
                onSelectView(view);
              }}
              ref={(node) => {
                if (node) {
                  tabRefs.current[view] = node;
                } else {
                  delete tabRefs.current[view];
                }
              }}
              role="tab"
              type="button"
            >
              {VIEW_LABELS[view]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
