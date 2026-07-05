// Pure BPM estimation from mono PCM. Used by src/bpm.ts after ffmpeg extracts
// audio from a music asset. No IO, no ffmpeg: safe to unit test.

export interface BpmDetection {
  bpm: number;
  confidence: number;
}

const MIN_BPM = 60;
const MAX_BPM = 180;
const ANALYSIS_HZ = 200;
const MAX_ANALYSIS_SEC = 45;

/** Estimate tempo from mono float PCM (any sample rate). */
export function detectBpm(
  pcm: Float32Array,
  sampleRate: number
): BpmDetection {
  if (pcm.length < sampleRate) {
    throw new Error("audio too short for BPM detection (need at least 1 second)");
  }
  const blockSize = Math.max(1, Math.floor(sampleRate / ANALYSIS_HZ));
  const envLen = Math.floor(pcm.length / blockSize);
  const env = new Float32Array(envLen);
  for (let i = 0; i < envLen; i++) {
    let sum = 0;
    const base = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(pcm[base + j] ?? 0);
    }
    env[i] = sum / blockSize;
  }

  const onset = new Float32Array(envLen);
  for (let i = 1; i < envLen; i++) {
    onset[i] = Math.max(0, env[i] - env[i - 1]);
  }

  const minLag = Math.floor((ANALYSIS_HZ * 60) / MAX_BPM);
  const maxLag = Math.floor((ANALYSIS_HZ * 60) / MIN_BPM);
  const maxSamples = Math.min(envLen, ANALYSIS_HZ * MAX_ANALYSIS_SEC);

  let bestLag = minLag;
  let bestCorr = -Number.POSITIVE_INFINITY;
  let secondCorr = -Number.POSITIVE_INFINITY;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < maxSamples - lag; i++) {
      corr += onset[i] * onset[i + lag];
    }
    if (corr > bestCorr) {
      secondCorr = bestCorr;
      bestCorr = corr;
      bestLag = lag;
    } else if (corr > secondCorr) {
      secondCorr = corr;
    }
  }

  const bpm = Math.round((ANALYSIS_HZ * 60) / bestLag);
  const confidence =
    bestCorr <= 0
      ? 0
      : Math.max(0, Math.min(1, (bestCorr - secondCorr) / bestCorr));

  return { bpm, confidence: Math.round(confidence * 100) / 100 };
}
