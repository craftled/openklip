/** Timeline / index colors aligned with edit-timeline clip tracks. */
export const CAM_WIDE_SEGMENT_CLASS = "bg-amber-700/80";
export const CAM_SPEAKER_SEGMENT_CLASSES = [
  "bg-sky-600/85",
  "bg-violet-600/80",
  "bg-emerald-700/80",
  "bg-fuchsia-700/80",
  "bg-cyan-700/80",
] as const;

export const CAM_WIDE_INDEX_CLASS = "bg-amber-700 text-white";
export const CAM_SPEAKER_INDEX_CLASSES = [
  "bg-sky-600 text-white",
  "bg-violet-600 text-white",
  "bg-emerald-700 text-white",
  "bg-fuchsia-700 text-white",
  "bg-cyan-700 text-white",
] as const;

export function speakerIndexForCam(
  cams: { id: string; role: "speaker" | "wide" }[],
  camId: string
): number {
  let index = 0;
  for (const cam of cams) {
    if (cam.role !== "speaker") {
      continue;
    }
    if (cam.id === camId) {
      return index;
    }
    index += 1;
  }
  return 0;
}

export function segmentClassForShot(
  shot: string,
  cams: { id: string; role: "speaker" | "wide" }[]
): string {
  if (shot === "wide") {
    return CAM_WIDE_SEGMENT_CLASS;
  }
  const index = speakerIndexForCam(cams, shot);
  return CAM_SPEAKER_SEGMENT_CLASSES[
    index % CAM_SPEAKER_SEGMENT_CLASSES.length
  ];
}

export function indexClassForCam(
  cam: { id: string; role: "speaker" | "wide" },
  cams: { id: string; role: "speaker" | "wide" }[]
): string {
  if (cam.role === "wide") {
    return CAM_WIDE_INDEX_CLASS;
  }
  const index = speakerIndexForCam(cams, cam.id);
  return CAM_SPEAKER_INDEX_CLASSES[index % CAM_SPEAKER_INDEX_CLASSES.length];
}

export function legendLabelForCam(
  cam: { id: string; role: "speaker" | "wide" },
  cams: { id: string; role: "speaker" | "wide" }[]
): string {
  if (cam.role === "wide") {
    return "Wide";
  }
  const index = speakerIndexForCam(cams, cam.id) + 1;
  return `Spk ${index}`;
}
