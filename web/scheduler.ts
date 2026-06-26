export interface Range {
  endSec: number;
  startSec: number;
}

export interface CutBoundaryTransition {
  from: Range;
  jump: () => void;
  resume: () => void;
  to: Range;
}

// Plays only the surviving ranges of the source proxy back to back. Because the
// proxy is all-intra, the currentTime jump at each cut boundary is a fast seek.
// A short gain duck masks the audio click at the jump.
export class CutScheduler {
  private video: HTMLVideoElement;
  private getRanges: () => Range[];
  private raf = 0;
  private idx = 0;
  private playing = false;
  private transitioning = false;
  private ctx?: AudioContext;
  private gain?: GainNode;
  onCutBoundary?: (transition: CutBoundaryTransition) => void;
  onTick?: (sourceSec: number) => void;
  onEnd?: () => void;

  constructor(video: HTMLVideoElement, getRanges: () => Range[]) {
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
    const inside = ranges.findIndex(
      (r) => t >= r.startSec - 0.05 && t <= r.endSec
    );
    if (inside === -1) {
      this.idx = 0;
      this.video.currentTime = ranges[0].startSec;
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

  private jumpToRange(range: Range): void {
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
    if (this.video.currentTime >= r.endSec - 0.02) {
      this.idx += 1;
      const next = ranges[this.idx];
      if (!next) {
        this.pause();
        this.onEnd?.();
        return;
      }
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
