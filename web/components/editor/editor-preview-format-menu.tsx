"use client";

import {
  SAFE_AREA_PLATFORMS,
  type SafeAreaPlatform,
  safeAreaGuideLabel,
} from "@engine/safe-areas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ORIENTATION_LABEL, type Orientation } from "@/lib/preview-layout";
import { cn } from "@/lib/utils";

const ORIENTATIONS: Orientation[] = ["landscape", "portrait", "square"];

export interface EditorPreviewFormatMenuProps {
  className?: string;
  onOrientationChange: (orientation: Orientation) => void;
  onSafeAreaGuideChange: (platform: SafeAreaPlatform) => void;
  orientation: Orientation;
  safeAreaGuide: SafeAreaPlatform;
}

export function EditorPreviewFormatMenu({
  className,
  onOrientationChange,
  onSafeAreaGuideChange,
  orientation,
  safeAreaGuide,
}: EditorPreviewFormatMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Preview format ${ORIENTATION_LABEL[orientation]}`}
        className={cn(
          "relative shrink-0 rounded-full bg-muted px-1 py-px text-[10px] text-muted-foreground leading-none transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className
        )}
      >
        {ORIENTATION_LABEL[orientation]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[9rem]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
            Format
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              if (value) {
                onOrientationChange(value as Orientation);
              }
            }}
            value={orientation}
          >
            {ORIENTATIONS.map((item) => (
              <DropdownMenuRadioItem
                className="text-xs"
                key={item}
                value={item}
              >
                {ORIENTATION_LABEL[item]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {orientation === "portrait" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
                Safe areas
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                onValueChange={(value) => {
                  if (value) {
                    onSafeAreaGuideChange(value as SafeAreaPlatform);
                  }
                }}
                value={safeAreaGuide}
              >
                {SAFE_AREA_PLATFORMS.map((platform) => (
                  <DropdownMenuRadioItem
                    className="text-xs"
                    key={platform}
                    value={platform}
                  >
                    {safeAreaGuideLabel(platform)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
