import type { ExportAspect, Project } from "./edl.ts";

export interface CropSuggestion {
  focusX: number;
  focusY: number;
}

/**
 * Suggest a crop focus point from the project's sceneLog speaker segments.
 * Returns null when:
 *   - aspect is "source" (no reframe applied)
 *   - project has no sceneLog
 * Returns { focusX: 0.5, focusY: 0.5 } (center) when:
 *   - sceneLog exists but contains no speaker segments
 *   - all speaker segments have zero duration
 * Speaker segments are weighted by duration; currently all default to 0.5/0.5
 * because SceneSegment carries no per-segment focus coordinate.
 */
export function suggestCropFromSceneLog(
  project: Project,
  aspect: ExportAspect
): CropSuggestion | null {
  if (aspect === "source") {
    return null;
  }
  if (!project.sceneLog) {
    return null;
  }

  const speakerSegs = project.sceneLog.segments.filter(
    (s) => s.onScreen === "speaker"
  );

  if (speakerSegs.length === 0) {
    return { focusX: 0.5, focusY: 0.5 };
  }

  let totalWeight = 0;
  let sumX = 0;
  let sumY = 0;

  for (const seg of speakerSegs) {
    const dur = Math.max(0, seg.toSec - seg.fromSec);
    totalWeight += dur;
    sumX += 0.5 * dur;
    sumY += 0.5 * dur;
  }

  if (totalWeight === 0) {
    return { focusX: 0.5, focusY: 0.5 };
  }

  return {
    focusX: sumX / totalWeight,
    focusY: sumY / totalWeight,
  };
}
