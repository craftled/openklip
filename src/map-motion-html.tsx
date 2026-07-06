import {
  assertMapMotionSpec,
  MAP_MOTION_FPS,
  MAP_MOTION_HEIGHT,
  MAP_MOTION_WIDTH,
  type MapMotionSpec,
} from "./map-motion.ts";

export function renderMapMotionHtml(spec: MapMotionSpec): string {
  const validated = assertMapMotionSpec(spec);
  const specJson = JSON.stringify(validated).replaceAll("<", "\\u003c");
  return `<div data-fps="${MAP_MOTION_FPS}" data-graphic-root data-height="${MAP_MOTION_HEIGHT}" data-map-motion="true" data-width="${MAP_MOTION_WIDTH}" style="position:relative;width:${MAP_MOTION_WIDTH}px;height:${MAP_MOTION_HEIGHT}px;overflow:hidden;background:transparent">
  <div id="map-motion-root" style="position:absolute;inset:0"></div>
  <script type="application/json" id="map-motion-spec">${specJson}</script>
</div>`;
}

export async function renderMapMotionHtmlFromUnknown(
  rawSpec: unknown
): Promise<string> {
  return Promise.resolve(renderMapMotionHtml(assertMapMotionSpec(rawSpec)));
}
