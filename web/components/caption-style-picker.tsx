"use client";

import { type CaptionStyleId, listCaptionStyles } from "@engine/caption-styles";
import { captionStyleCss } from "@/lib/caption-style-css";
import { cn } from "@/lib/utils";

// Compact chip-per-preset picker for the Captions config sidebar. Each chip
// shows the preset's label plus a mini sample ("Aa" / "AA") rendered in that
// preset's own weight/case/colors via the same captionStyleCss mapper the
// live caption box uses, so the sample never drifts from the real look.
export function CaptionStylePicker({
  onSelect,
  selected,
}: {
  onSelect: (id: CaptionStyleId) => void;
  selected: string;
}) {
  return (
    <fieldset className="grid grid-cols-1 gap-1.5 border-0 p-0">
      <legend className="sr-only">Caption style</legend>
      {listCaptionStyles().map((def) => {
        const css = captionStyleCss(def);
        const isSelected = selected === def.id;
        return (
          <button
            aria-pressed={isSelected}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
              isSelected
                ? "border-foreground/50 bg-muted"
                : "border-border/70 hover:bg-muted/50"
            )}
            key={def.id}
            onClick={() => onSelect(def.id)}
            title={def.summary}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate font-medium text-foreground/85">
              {def.label}
            </span>
            <span
              className="shrink-0 rounded px-2 py-0.5 text-[11px]"
              style={{
                background:
                  css.background === "transparent"
                    ? "rgba(0, 0, 0, 0.35)"
                    : css.background,
                color: css.activeColor,
                fontFamily: css.fontFamily,
                fontWeight: css.fontWeight,
                textShadow:
                  css.textShadow === "none" ? undefined : css.textShadow,
                textTransform: css.textTransform,
              }}
            >
              {def.allCaps ? "AA" : "Aa"}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
