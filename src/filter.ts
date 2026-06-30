// Built-in filters applied to the whole picture at export. These are
// deterministic ffmpeg chains (eq + colorbalance), not external LUT files.
import type { Filter } from "./edl.ts";

// Filter chain per option. Record keyed by Filter, so adding a filter to
// the schema without a chain here is a compile error. "none" is the no-op.
//   eq           contrast / saturation / gamma
//   colorbalance per-zone RGB shift (rm/bm = midtones, rh/bh = highlights)
const FILTER_CHAINS: Record<Filter, string> = {
  none: "",
  natural: "eq=contrast=1.06:saturation=1.00:gamma=0.98",
  warm: "eq=contrast=1.06:saturation=1.06,colorbalance=rm=0.06:bm=-0.05:rh=0.04:bh=-0.04",
  cool: "eq=contrast=1.06:saturation=1.02,colorbalance=rm=-0.04:bm=0.06:bh=0.05",
  muted:
    "eq=contrast=1.08:saturation=0.85,colorbalance=rm=-0.04:bm=0.06:bh=0.05",
  cinematic:
    "eq=contrast=1.04:saturation=0.92:gamma=1.03,colorbalance=rh=0.03:bh=-0.02",
  dramatic: "eq=contrast=1.18:saturation=1.20:gamma=0.97",
};

const FILTER_LABELS: Record<Filter, string> = {
  none: "None",
  natural: "Natural",
  warm: "Warm",
  cool: "Cool",
  muted: "Muted",
  cinematic: "Cinematic",
  dramatic: "Dramatic",
};

export const FILTER_NAMES = Object.keys(FILTER_CHAINS) as Filter[];

export interface FilterOption {
  id: Filter;
  label: string;
}

export const FILTER_OPTIONS: FilterOption[] = FILTER_NAMES.map((id) => ({
  id,
  label: FILTER_LABELS[id],
}));

export function isFilter(value: string): value is Filter {
  return Object.hasOwn(FILTER_CHAINS, value);
}

export function filterChain(filter: Filter): string {
  return FILTER_CHAINS[filter] ?? "";
}

export function filterLabel(filter: Filter): string {
  return FILTER_LABELS[filter] ?? filter;
}
