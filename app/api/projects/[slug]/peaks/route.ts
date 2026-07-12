import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { readPcmRange } from "@engine/audio-analysis";
import {
  computePeakBuckets,
  DEFAULT_PEAK_BUCKETS,
  DEFAULT_SAMPLE_RATE,
  PeakBucketsError,
} from "@engine/audio-analysis-core";
import { assertValidSlug, projectPaths } from "@engine/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PEAK_WINDOW_SEC = 120;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

function parseSec(value: string | null): number | undefined {
  if (value === null) {
    return;
  }
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseBuckets(value: string | null): number | undefined {
  if (value === null) {
    return;
  }
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { slug } = await params;
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  if (!existsSync(projectPaths(slug).project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const fromSec = parseSec(url.searchParams.get("fromSec"));
  const toSec = parseSec(url.searchParams.get("toSec"));
  if (fromSec === undefined || toSec === undefined) {
    return Response.json(
      { error: "fromSec and toSec query params are required" },
      { status: 400 }
    );
  }

  if (fromSec < 0) {
    return Response.json(
      { error: "fromSec must be greater than or equal to 0" },
      { status: 400 }
    );
  }

  if (toSec <= fromSec) {
    return Response.json(
      { error: "toSec must be greater than fromSec" },
      { status: 400 }
    );
  }

  const buckets = parseBuckets(url.searchParams.get("buckets"));
  if (
    url.searchParams.has("buckets") &&
    (buckets === undefined || !Number.isInteger(buckets) || buckets <= 0)
  ) {
    return Response.json(
      { error: "buckets must be a positive integer when provided" },
      { status: 400 }
    );
  }

  const paths = projectPaths(slug);
  if (!existsSync(paths.audioRaw)) {
    return Response.json(
      {
        error: `missing ${paths.audioRaw}: this project needs re-ingest (audio16k.f32 is written at ingest time by extractAudio)`,
      },
      { status: 404 }
    );
  }

  const sampleRate = DEFAULT_SAMPLE_RATE;
  const fileStat = await stat(paths.audioRaw);
  const totalSec = Math.floor(fileStat.size / 4) / sampleRate;
  const clampedFrom = Math.max(0, Math.min(fromSec, totalSec));
  const clampedTo = Math.max(clampedFrom, Math.min(toSec, totalSec));
  const bucketCount = buckets ?? DEFAULT_PEAK_BUCKETS;
  const clampedWindowSec = clampedTo - clampedFrom;

  if (clampedWindowSec > MAX_PEAK_WINDOW_SEC) {
    return Response.json(
      {
        error: `requested window exceeds the ${MAX_PEAK_WINDOW_SEC}s cap (clamped span is ${clampedWindowSec.toFixed(3)}s)`,
      },
      { status: 400 }
    );
  }

  if (clampedTo <= clampedFrom) {
    const peaks = computePeakBuckets(new Float32Array(0), {
      fromSec: 0,
      toSec: 1,
      buckets: bucketCount,
      sampleRate,
    });
    return Response.json({
      sampleRate,
      fromSec: clampedFrom,
      toSec: clampedTo,
      buckets: peaks.map((p) => [p.min, p.max] as [number, number]),
    });
  }

  try {
    const pcm = await readPcmRange(slug, clampedFrom, clampedTo, sampleRate);
    const peaks = computePeakBuckets(pcm, {
      fromSec: 0,
      toSec: clampedTo - clampedFrom,
      buckets: bucketCount,
      sampleRate,
    });
    return Response.json({
      sampleRate,
      fromSec: clampedFrom,
      toSec: clampedTo,
      buckets: peaks.map((p) => [p.min, p.max] as [number, number]),
    });
  } catch (e) {
    if (e instanceof PeakBucketsError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
