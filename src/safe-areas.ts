// Conservative 9:16 safe-area insets for preview guides (normalized 0-1).

export const SAFE_AREA_PLATFORMS = [
  "off",
  "tiktok",
  "reels",
  "youtube-shorts",
  "generic",
] as const;

export type SafeAreaPlatform = (typeof SAFE_AREA_PLATFORMS)[number];

export interface SafeAreaInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Active guide platforms (excludes "off"). */
export type SafeAreaGuidePlatform = Exclude<SafeAreaPlatform, "off">;

/** Platforms available for export caption inset (same insets as preview guides). */
export const CAPTION_INSET_PLATFORMS = [
  "generic",
  "tiktok",
  "reels",
  "youtube-shorts",
] as const satisfies readonly SafeAreaGuidePlatform[];

export type CaptionInsetPlatform = (typeof CAPTION_INSET_PLATFORMS)[number];

const INSETS: Record<SafeAreaGuidePlatform, SafeAreaInsets> = {
  // Bottom-heavy: caption + like/comment stack on TikTok.
  tiktok: { top: 0.1, bottom: 0.22, left: 0.05, right: 0.05 },
  // Similar UI chrome to TikTok; slightly tighter sides.
  reels: { top: 0.1, bottom: 0.21, left: 0.04, right: 0.04 },
  // Shorts title/actions band; less bottom caption pressure than TikTok.
  "youtube-shorts": { top: 0.08, bottom: 0.18, left: 0.04, right: 0.04 },
  // Generic vertical short: room for captions without platform-specific chrome.
  generic: { top: 0.08, bottom: 0.15, left: 0.05, right: 0.05 },
};

/** Normalized inset fractions from each edge (0 = flush, 1 = full frame). */
export function getSafeAreaInsets(
  platform: SafeAreaGuidePlatform
): SafeAreaInsets {
  return { ...INSETS[platform] };
}

export function safeAreaGuideLabel(platform: SafeAreaPlatform): string {
  switch (platform) {
    case "off":
      return "Off";
    case "tiktok":
      return "TikTok";
    case "reels":
      return "Reels";
    case "youtube-shorts":
      return "YouTube Shorts";
    case "generic":
      return "Generic";
    default: {
      const _exhaustive: never = platform;
      return _exhaustive;
    }
  }
}

export function isSafeAreaGuidePlatform(
  value: string
): value is SafeAreaGuidePlatform {
  return value in INSETS;
}

export function parseSafeAreaPlatform(value: string): SafeAreaPlatform {
  if ((SAFE_AREA_PLATFORMS as readonly string[]).includes(value)) {
    return value as SafeAreaPlatform;
  }
  throw new Error(
    `invalid safe area platform "${value}" (expected one of: ${SAFE_AREA_PLATFORMS.join(", ")})`
  );
}
