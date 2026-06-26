import type { Range as TimelineRange } from "../src/edl.ts";
import {
  findPlayingRangeIndex,
  nextRangeIndex,
  playbackStartIndex,
  shouldJumpToNextRange,
} from "../src/schedulerLogic.ts";

export type Range = TimelineRange;

export interface CutBoundaryTransition {
  from: TimelineRange;
  jump: () => void;
  resume: () => void;
  to: TimelineRange;
}

// Plays only the surviving ranges of the source proxy back to back. Because the
// proxy is all-intra, the currentTime jump at each cut boundary is a fast seek.
// A short gain duck masks the audio click at the jump.
export class CutScheduler {
  private video: HTMLVideoElement;
  private getRanges: () => TimelineRange[];
  private raf = 0;
  private idx = 0;
  private playing = false;
  private transitioning = false;
  private ctx?: AudioContext;
  private gain?: GainNode;
  onCutBoundary?: (transition: CutBoundaryTransition) => void;
  onTick?: (sourceSec: number) => void;
  onEnd?: () => void;

  constructor(video: HTMLVideoElement, getRanges: () => TimelineRange[]) {
    this.video = video;
    this.getRanges = getRanges;
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

  private duck(ms = 10): void {
    if (!(this.gain && this.ctx)) {
      return;
    }
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(1, now + ms / 1000);
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
    this.raf = requestAnimationFrame(this.loop);
    return true;
  }

  pause(): void {
    this.playing = false;
    this.transitioning = false;
    cancelAnimationFrame(this.raf);
    this.video.pause();
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
    this.onTick?.(this.video.currentTime);
  }

  private resumeAfterTransition = (): void => {
    this.transitioning = false;
    if (!this.playing) {
      return;
    }
    void this.video
      .play()
      .then(() => {
        if (this.playing) {
          this.raf = requestAnimationFrame(this.loop);
        }
      })
      .catch(() => {
        this.playing = false;
        this.onEnd?.();
      });
  };

  private jumpToRange(range: TimelineRange): void {
    this.duck();
    this.video.currentTime = range.startSec;
    this.onTick?.(this.video.currentTime);
  }

  private loop = (): void => {
    if (!(this.playing && !this.transitioning)) {
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
      const jump = () => this.jumpToRange(next);
      if (this.onCutBoundary) {
        this.transitioning = true;
        this.video.pause();
        try {
          this.onCutBoundary({
            from: r,
            jump,
            resume: this.resumeAfterTransition,
            to: next,
          });
        } catch {
          jump();
          this.resumeAfterTransition();
        }
        return;
      }
      jump();
      r = next;
    }
    this.onTick?.(this.video.currentTime);
    this.raf = requestAnimationFrame(this.loop);
  };
}
