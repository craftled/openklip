import catppuccin from "../../themes/catppuccin.json";
import dracula from "../../themes/dracula.json";
import github from "../../themes/github.json";
import nord from "../../themes/nord.json";
import openklip from "../../themes/openklip.json";
import tokyoNight from "../../themes/tokyo-night.json";
import { type ThemeFile, ThemeFileSchema } from "./theme-schema";

const RAW_THEMES = [
  openklip,
  catppuccin,
  github,
  nord,
  dracula,
  tokyoNight,
] as const;

function parseCatalog(): ThemeFile[] {
  const themes: ThemeFile[] = [];
  const seen = new Set<string>();
  for (const raw of RAW_THEMES) {
    const theme = ThemeFileSchema.parse(raw);
    if (seen.has(theme.id)) {
      throw new Error(`duplicate theme id: ${theme.id}`);
    }
    seen.add(theme.id);
    themes.push(theme);
  }
  return themes;
}

export const THEME_CATALOG = parseCatalog();

export const DEFAULT_APP_THEME = "openklip";

export type AppThemeId = ThemeFile["id"];

const THEME_BY_ID = new Map<string, ThemeFile>(
  THEME_CATALOG.map((theme) => [theme.id, theme])
);

export function getThemeById(id: string): ThemeFile | undefined {
  return THEME_BY_ID.get(id);
}

export function getThemeLabel(id: string): string {
  return getThemeById(id)?.name ?? id;
}

export function isAppThemeId(id: string): id is AppThemeId {
  return THEME_BY_ID.has(id);
}
