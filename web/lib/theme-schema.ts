import { z } from "zod";

export const ThemeColorsSchema = z
  .object({
    background: z.string().min(1),
    foreground: z.string().min(1),
    accent: z.string().min(1),
    info: z.string().min(1),
    success: z.string().min(1),
    destructive: z.string().min(1),
  })
  .strict();

export type ThemeColors = z.infer<typeof ThemeColorsSchema>;

export const EditorColorsSchema = z
  .object({
    live: z.string().min(1).optional(),
    broll: z.string().min(1).optional(),
    zoom: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
  })
  .strict();

export type EditorColors = z.infer<typeof EditorColorsSchema>;

export const DEFAULT_EDITOR_COLORS: Required<
  Record<keyof EditorColors, string>
> = {
  live: "var(--success)",
  broll: "oklch(0.623 0.178 210)",
  zoom: "oklch(0.676 0.184 75)",
  title: "oklch(0.657 0.183 25)",
};

export const EDITOR_COLOR_KEYS = [
  "live",
  "broll",
  "zoom",
  "title",
] as const satisfies ReadonlyArray<keyof EditorColors>;

export const ThemeFileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    description: z.string().optional(),
    author: z.string().optional(),
    license: z.string().optional(),
    source: z.string().optional(),
    supportedModes: z.array(z.enum(["light", "dark"])).min(1),
    background: z.string().min(1),
    foreground: z.string().min(1),
    accent: z.string().min(1),
    info: z.string().min(1),
    success: z.string().min(1),
    destructive: z.string().min(1),
    dark: ThemeColorsSchema.optional(),
    editor: EditorColorsSchema.optional(),
  })
  .strict();

export type ThemeFile = z.infer<typeof ThemeFileSchema>;

export type ColorScheme = "light" | "dark";

export const SEMANTIC_COLOR_KEYS = [
  "background",
  "foreground",
  "accent",
  "info",
  "success",
  "destructive",
] as const satisfies ReadonlyArray<keyof ThemeColors>;
