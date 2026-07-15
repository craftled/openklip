import type { Keyframe } from "@engine/keyframes";

/** Lightweight type for graphics on the timeline (no paper/maplibre runtime). */
export interface GraphicItem {
  catalog?: string;
  endSample: number;
  id: string;
  keyframes?: Keyframe[];
  params: Record<string, string | number | boolean>;
  spec?: unknown;
  startSample: number;
  template: string;
  track: string;
  type?: "template" | "json-render";
}
