interface MediaAudioGraph {
  analyser: AnalyserNode;
  ctx: AudioContext;
}

const graphs = new WeakMap<HTMLMediaElement, MediaAudioGraph>();

export function getMediaAnalyser(media: HTMLMediaElement): AnalyserNode | null {
  const existing = graphs.get(media);
  if (existing) {
    return existing.analyser;
  }

  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.55;
    const source = ctx.createMediaElementSource(media);
    source.connect(analyser);
    analyser.connect(ctx.destination);
    graphs.set(media, { ctx, analyser });
    return analyser;
  } catch {
    return null;
  }
}

export function resumeMediaAudioContext(analyser: AnalyserNode): void {
  const ctx = analyser.context;
  if ("resume" in ctx && ctx.state === "suspended") {
    void (ctx as AudioContext).resume();
  }
}
