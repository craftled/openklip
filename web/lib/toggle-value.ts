// Base UI ToggleGroup reports its selection as either a bare string or an
// array of selected values depending on multiple-selection mode. Every
// single-select consumer wants just the first value; this is the one shared
// unwrap so the coercion cannot drift between panels.
export function firstToggleValue(
  value: string | readonly string[]
): string | undefined {
  return typeof value === "string" ? value : value[0];
}
