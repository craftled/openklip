"use client";

import { type CaptionStyleId, listCaptionStyles } from "@engine/caption-styles";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { captionStyleCss } from "@/lib/caption-style-css";

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
    <fieldset className="border-0 p-0">
      <legend className="sr-only">Caption style</legend>
      <ToggleGroup
        className="grid w-full grid-cols-2 gap-1"
        onValueChange={(value) => {
          const next = Array.isArray(value) ? value[0] : value;
          if (next) {
            onSelect(next as CaptionStyleId);
          }
        }}
        size="sm"
        spacing={0}
        value={[selected]}
        variant="outline"
      >
        {listCaptionStyles().map((def) => {
          const css = captionStyleCss(def);
          return (
            <ToggleGroupItem
              className="min-w-0 justify-between border-transparent bg-muted/45 px-2 text-xs hover:bg-muted/70 data-pressed:border-border data-pressed:bg-muted"
              key={def.id}
              title={def.summary}
              value={def.id}
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {def.label}
              </span>
              <span
                className="shrink-0 rounded px-1 py-0.5 text-[10px]"
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
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </fieldset>
  );
}
