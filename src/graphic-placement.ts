import type { Project } from "./edl.ts";
import { measureMusicBpm, readCachedMusicBpm } from "./bpm.ts";
import {
  extendGraphicSpanForEntrance,
  spanForBeats,
  validateBpm,
} from "./graphic-span.ts";

export async function finalizeGraphicSpan(input: {
  slug: string;
  project: Project;
  template: string;
  fromSec: number;
  toSec: number;
  params: Record<string, string | number | boolean>;
  beats?: number;
  bpm?: number;
  musicAssetId?: string;
}): Promise<{ fromSec: number; toSec: number }> {
  const projectDurationSec = input.project.durationSamples / input.project.sampleRate;
  const fromSec = input.fromSec;
  let toSec = extendGraphicSpanForEntrance({
    template: input.template,
    params: input.params,
    fromSec,
    toSec: input.toSec,
    projectDurationSec,
  });

  if (input.beats !== undefined) {
    let bpm = input.bpm;
    if (bpm === undefined) {
      if (!input.musicAssetId) {
        throw new Error(
          "graphic beats span requires bpm or musicAssetId (run openklip bpm first)"
        );
      }
      const cached = await readCachedMusicBpm(input.slug, input.musicAssetId);
      const measured =
        cached ?? (await measureMusicBpm(input.slug, input.musicAssetId));
      bpm = measured.bpm;
    }
    toSec = spanForBeats(
      fromSec,
      input.beats,
      validateBpm(bpm),
      projectDurationSec
    );
  }

  if (toSec <= fromSec) {
    throw new Error("graphic span is empty after timing adjustment");
  }

  return { fromSec, toSec };
}
