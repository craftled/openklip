// Color grades: the finishing look applied to the whole picture at export. The
// deck's "log in, picture out" : footage renders flat off the camera, and a
// grade is what makes it watchable. Each named grade expands to a deterministic
// ffmpeg filter chain (eq + colorbalance), inserted into the export filtergraph
// in the same slot as the vignette. Pure and unit tested : no filter strings
// drift without a failing test.
import type { Grade } from "./edl.ts";

// Filter chain per grade. Record keyed by Grade, so adding a grade to the enum
// without a chain here is a compile error. "none" is the no-op.
//   eq          contrast / saturation / gamma
//   colorbalance per-zone RGB shift (rm/bm = midtones, rh/bh = highlights)
const GRADE_FILTERS: Record<Grade, string> = {
  none: "",
  neutral: "eq=contrast=1.06:saturation=1.00:gamma=0.98",
  warm: "eq=contrast=1.06:saturation=1.06,colorbalance=rm=0.06:bm=-0.05:rh=0.04:bh=-0.04",
  cool: "eq=contrast=1.06:saturation=1.02,colorbalance=rm=-0.04:bm=0.06:bh=0.05",
  cool_desat:
    "eq=contrast=1.08:saturation=0.85,colorbalance=rm=-0.04:bm=0.06:bh=0.05",
  filmic:
    "eq=contrast=1.04:saturation=0.92:gamma=1.03,colorbalance=rh=0.03:bh=-0.02",
  punchy: "eq=contrast=1.18:saturation=1.20:gamma=0.97",
};

// Human label per grade, for the CLI list and the GUI dropdown.
const GRADE_LABELS: Record<Grade, string> = {
  none: "None",
  neutral: "Neutral",
  warm: "Warm",
  cool: "Cool",
  cool_desat: "Cool desat",
  filmic: "Filmic",
  punchy: "Punchy",
};

export const GRADE_NAMES = Object.keys(GRADE_FILTERS) as Grade[];

export interface GradeOption {
  id: Grade;
  label: string;
}

export const GRADE_OPTIONS: GradeOption[] = GRADE_NAMES.map((id) => ({
  id,
  label: GRADE_LABELS[id],
}));

export function isGrade(value: string): value is Grade {
  return Object.hasOwn(GRADE_FILTERS, value);
}

// The ffmpeg filter chain for a grade, or "" for "none" / an unknown value.
// The export filtergraph wraps this with input/output pad labels.
export function gradeFilter(grade: Grade): string {
  return GRADE_FILTERS[grade] ?? "";
}

export function gradeLabel(grade: Grade): string {
  return GRADE_LABELS[grade] ?? grade;
}
