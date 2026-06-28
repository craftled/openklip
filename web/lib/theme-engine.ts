import {
  type AppThemeId,
  DEFAULT_APP_THEME,
  getThemeById,
  THEME_CATALOG,
} from "./theme-catalog";
import {
  type ColorScheme,
  DEFAULT_EDITOR_COLORS,
  EDITOR_COLOR_KEYS,
  SEMANTIC_COLOR_KEYS,
  type ThemeColors,
  type ThemeFile,
} from "./theme-schema";

export const THEME_VARS_STYLE_ID = "openklip-theme-vars";

export function resolveThemeColors(
  theme: ThemeFile,
  scheme: ColorScheme
): ThemeColors {
  const useDark = scheme === "dark" || !theme.supportedModes.includes("light");
  if (useDark) {
    return { ...theme, ...theme.dark };
  }
  return {
    background: theme.background,
    foreground: theme.foreground,
    accent: theme.accent,
    info: theme.info,
    success: theme.success,
    destructive: theme.destructive,
  };
}

export function themeSupportsScheme(
  theme: ThemeFile,
  scheme: ColorScheme
): boolean {
  return theme.supportedModes.includes(scheme);
}

export function preferredColorScheme(
  theme: ThemeFile,
  scheme: ColorScheme
): ColorScheme {
  if (themeSupportsScheme(theme, scheme)) {
    return scheme;
  }
  if (theme.supportedModes.includes("dark")) {
    return "dark";
  }
  return "light";
}

function colorsToDeclarations(colors: ThemeColors): string {
  return SEMANTIC_COLOR_KEYS.map((key) => `--${key}: ${colors[key]};`).join(
    "\n  "
  );
}

function editorToDeclarations(theme: ThemeFile): string {
  const editor = { ...DEFAULT_EDITOR_COLORS, ...theme.editor };
  return EDITOR_COLOR_KEYS.map((key) => `--${key}: ${editor[key]};`).join(
    "\n  "
  );
}

/** CSS that sets light palette on :root and dark palette on .dark */
export function themePresetToCSS(theme: ThemeFile): string {
  const light: ThemeColors = {
    background: theme.background,
    foreground: theme.foreground,
    accent: theme.accent,
    info: theme.info,
    success: theme.success,
    destructive: theme.destructive,
  };
  const dark: ThemeColors = theme.dark ?? light;
  const editor = editorToDeclarations(theme);
  return `:root {\n  ${colorsToDeclarations(light)}\n  ${editor}\n}\n.dark {\n  ${colorsToDeclarations(dark)}\n}`;
}

export function injectThemePreset(
  themeId: AppThemeId,
  scheme: ColorScheme
): void {
  if (typeof document === "undefined") {
    return;
  }
  const theme = getThemeById(themeId) ?? getThemeById(DEFAULT_APP_THEME);
  if (!theme) {
    return;
  }

  const root = document.documentElement;
  root.dataset.colorTheme = theme.id;

  const mismatch = scheme === "light" && !themeSupportsScheme(theme, "light");
  if (mismatch) {
    root.dataset.themeMismatch = "true";
  } else {
    delete root.dataset.themeMismatch;
  }

  let style = document.getElementById(THEME_VARS_STYLE_ID) as
    | HTMLStyleElement
    | undefined;
  if (!style) {
    style = document.createElement("style");
    style.id = THEME_VARS_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = themePresetToCSS(theme);
}

function themeNoFlashEntry(theme: ThemeFile): {
  l: ThemeColors;
  d: ThemeColors;
  m: ColorScheme[];
} {
  const light: ThemeColors = {
    background: theme.background,
    foreground: theme.foreground,
    accent: theme.accent,
    info: theme.info,
    success: theme.success,
    destructive: theme.destructive,
  };
  const dark: ThemeColors = theme.dark ?? light;
  return { l: light, d: dark, m: [...theme.supportedModes] };
}

/** Inline script for layout.tsx — color scheme + preset vars before first paint */
export function buildThemeNoFlashScript(
  colorSchemeKey: string,
  appThemeKey: string,
  defaultThemeId: string
): string {
  const presets = Object.fromEntries(
    THEME_CATALOG.map((theme) => [theme.id, themeNoFlashEntry(theme)])
  );
  const presetsJson = JSON.stringify(presets);
  const semanticKeys = JSON.stringify(SEMANTIC_COLOR_KEYS);

  return `(function(){
try{
var cs=localStorage.getItem("${colorSchemeKey}")||"light";
document.documentElement.classList.toggle("dark",cs==="dark");
var tid=localStorage.getItem("${appThemeKey}")||"${defaultThemeId}";
var presets=${presetsJson};
var p=presets[tid]||presets["${defaultThemeId}"];
if(!p)return;
var keys=${semanticKeys};
var css=":root{"+keys.map(function(k){return"--"+k+":"+p.l[k]+";"}).join("")+"}";
css+=".dark{"+keys.map(function(k){return"--"+k+":"+p.d[k]+";"}).join("")+"}";
var el=document.createElement("style");
el.id="${THEME_VARS_STYLE_ID}";
el.textContent=css;
document.head.appendChild(el);
document.documentElement.dataset.colorTheme=tid;
if(cs==="light"&&p.m.indexOf("light")===-1){
  document.documentElement.dataset.themeMismatch="true";
}
}catch(e){}
})();`;
}
