export interface Range {
  startSec: number;
  endSec: number;
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
  private ctx?: AudioContext;
  private gain?: GainNode;
  onTick?: (sourceSec: number) => void;
  onEnd?: () => void;

  constructor(video: HTMLVideoElement, getRanges: () => Range[]) {
    this.video = video;
    this.getRanges = getRanges;
  }

  private ensureAudio(): void {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      const src = this.ctx.createMediaElementSource(this.video);
      this.gain = this.ctx.createGain();
      src.connect(this.gain).connect(this.ctx.destination);
    } catch {
      // a MediaElementSource can only be created once per element; ignore re-attach
    }
  }

  private duck(ms = 10): void {
    if (!this.gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(1, now + ms / 1000);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  async play(): Promise<void> {
    const ranges = this.getRanges();
    if (ranges.length === 0) return;
    this.ensureAudio();
    if (this.ctx?.state === "suspended") await this.ctx.resume();

    const t = this.video.currentTime;
    const inside = ranges.findIndex((r) => t >= r.startSec - 0.05 && t <= r.endSec);
    if (inside === -1) {
      this.idx = 0;
      this.video.currentTime = ranges[0].startSec;
    } else {
      this.idx = inside;
    }
    this.playing = true;
    await this.video.play();
    this.raf = requestAnimationFrame(this.loop);
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.video.pause();
  }

  private loop = (): void => {
    if (!this.playing) return;
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
      this.duck();
      this.video.currentTime = next.startSec;
      r = next;
    }
    this.onTick?.(this.video.currentTime);
    this.raf = requestAnimationFrame(this.loop);
  };
}
