import { type RefObject, useEffect, useState } from "react";
import {
  getMediaAnalyser,
  resumeMediaAudioContext,
} from "@/lib/media-audio-analyser";

export function useMediaElementVolume(
  mediaRef: RefObject<HTMLMediaElement | null>,
  active: boolean
): number {
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    const media = mediaRef.current;
    if (!(media && active)) {
      setVolume(0);
      return;
    }

    const analyser = getMediaAnalyser(media);
    if (!analyser) {
      return;
    }

    resumeMediaAudioContext(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const sample of data) {
        sum += sample;
      }
      setVolume(sum / (data.length * 255));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [mediaRef, active]);

  return volume;
}
