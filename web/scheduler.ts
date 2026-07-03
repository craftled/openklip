import type { CutTransition, Range as TimelineRange } from "../src/edl.ts";
import {
  findPlayingRangeIndex,
  nextRangeIndex,
  playbackStartIndex,
  rangeBoundaryAudioDelaySec,
  shouldJumpToNextRange,
} from "../src/schedulerLogic.ts";

export type Range = TimelineRange;

const AUDIO_MUTE_RAMP_SEC = 0.012;
const AUDIO_RESUME_FADE_MS = 10;
// Matches the CutTransitionSchema default in src/edl.ts (a hard cut, no
// sweep) so a caller that does not supply getTransition sees the exact same
// behavior as before this feature existed.
const DEFAULT_CUT_TRANSITION: CutTransition = {
  type: "none",
  durationMs: 500,
};

// Plays only the surviving ranges of the source proxy back to back. Because the
// proxy is all-intra, the currentTime jump at each cut boundary is a fast seek.
// The gain is muted at the exact source boundary so deleted words do not leak
// while the browser catches up to the seek.
export class CutScheduler {
  private video: HTMLVideoElement;
  private getRanges: () => TimelineRange[];
  private getTransition?: () => CutTransition;
  private raf = 0;
  private idx = 0;
  private playing = false;
  private ctx?: AudioContext;
  private gain?: GainNode;
  onTick?: (sourceSec: number) => void;
  onEnd?: () => void;
  /** Fires when playback auto-advances past a kept-range boundary (not on a
   * manual seek/scrub via seek()), so a caller can play a decorative sweep
   * overlay matching project.look.transition. */
  onCutBoundary?: (transition: CutTransition) => void;

  constructor(
    video: HTMLVideoElement,
    getRanges: () => TimelineRange[],
    getTransition?: () => CutTransition
  ) {
    this.video = video;
    this.getRanges = getRanges;
    this.getTransition = getTransition;
  }

  private ensureAudio(): void {
    if (this.ctx) {
      return;
    }
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctx();
      const src = this.ctx.createMediaElementSource(this.video);
      this.gain = this.ctx.createGain();
      src.connect(this.gain).connect(this.ctx.destination);
    } catch {
      // a MediaElementSource can only be created once per element; ignore re-attach
    }
  }

  private resetGain(): void {
    if (!(this.gain && this.ctx)) {
      return;
    }
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(1, now);
  }

  private primeRangeAudio(range: TimelineRange, fadeInMs = 0): void {
    if (!(this.gain && this.ctx)) {
      return;
    }
    const now = this.ctx.currentTime;
    const boundaryAt =
      now +
      rangeBoundaryAudioDelaySec(
        this.video.currentTime,
        range.endSec,
        this.video.playbackRate || 1
      );
    const fadeDoneAt = now + fadeInMs / 1000;
    const rampStart = Math.max(now, boundaryAt - AUDIO_MUTE_RAMP_SEC);

    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0, now);
    if (boundaryAt <= fadeDoneAt) {
      return;
    }
    if (fadeInMs > 0) {
      this.gain.gain.linearRampToValueAtTime(1, fadeDoneAt);
    } else {
      this.gain.gain.setValueAtTime(1, now);
    }

    if (boundaryAt <= now) {
      this.gain.gain.setValueAtTime(0, now);
      return;
    }
    if (rampStart > fadeDoneAt) {
      this.gain.gain.setValueAtTime(1, rampStart);
    }
    this.gain.gain.linearRampToValueAtTime(0, boundaryAt);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  async play(): Promise<boolean> {
    const ranges = this.getRanges();
    if (ranges.length === 0) {
      return false;
    }
    this.ensureAudio();
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }

    const t = this.video.currentTime;
    const inside = findPlayingRangeIndex(ranges, t);
    if (inside === -1) {
      this.idx = playbackStartIndex(ranges, t);
      this.video.currentTime = ranges[this.idx].startSec;
    } else {
      this.idx = inside;
    }
    await this.video.play();
    this.playing = true;
    this.primeRangeAudio(ranges[this.idx]);
    this.raf = requestAnimationFrame(this.loop);
    return true;
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.video.pause();
    this.resetGain();
  }

  seek(sourceSec: number): void {
    const ranges = this.getRanges();
    const maxSec = this.video.duration || ranges.at(-1)?.endSec || sourceSec;
    const t = Math.max(0, Math.min(sourceSec, maxSec));
    const inside = findPlayingRangeIndex(ranges, t);
    if (inside === -1) {
      this.idx = playbackStartIndex(ranges, t);
      const range = ranges[this.idx];
      this.video.currentTime = range?.startSec ?? t;
    } else {
      this.idx = inside;
      this.video.currentTime = t;
    }
    if (this.playing) {
      this.primeRangeAudio(ranges[this.idx]);
    }
    this.onTick?.(this.video.currentTime);
  }

  private jumpToRange(range: TimelineRange): void {
    this.onCutBoundary?.(this.getTransition?.() ?? DEFAULT_CUT_TRANSITION);
    this.video.currentTime = range.startSec;
    this.primeRangeAudio(range, AUDIO_RESUME_FADE_MS);
    this.onTick?.(this.video.currentTime);
  }

  private loop = (): void => {
    if (!this.playing) {
      return;
    }
    const ranges = this.getRanges();
    let r = ranges[this.idx];
    if (!r) {
      this.pause();
      this.onEnd?.();
      return;
    }
    if (shouldJumpToNextRange(this.video.currentTime, r.endSec)) {
      const nextIdx = nextRangeIndex(this.idx, ranges.length);
      if (nextIdx === null) {
        this.pause();
        this.onEnd?.();
        return;
      }
      this.idx = nextIdx;
      const next = ranges[this.idx];
      this.jumpToRange(next);
      r = next;
    }
    this.onTick?.(this.video.currentTime);
    this.raf = requestAnimationFrame(this.loop);
  };
}
