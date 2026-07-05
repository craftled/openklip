interface MusicPreviewGraph {
  ctx: AudioContext;
  gain: GainNode;
}

const graphs = new WeakMap<HTMLMediaElement, MusicPreviewGraph>();

function createAudioContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    return new Ctx();
  } catch {
    return null;
  }
}

function ensureGraph(media: HTMLMediaElement): MusicPreviewGraph | null {
  const existing = graphs.get(media);
  if (existing) {
    return existing;
  }
  const ctx = createAudioContext();
  if (!ctx) {
    return null;
  }
  try {
    const gain = ctx.createGain();
    const source = ctx.createMediaElementSource(media);
    source.connect(gain);
    gain.connect(ctx.destination);
    const graph = { ctx, gain };
    graphs.set(media, graph);
    return graph;
  } catch {
    return null;
  }
}

/** Preview music gain matches export (0-2). Falls back to element volume when Web Audio is unavailable. */
export function setMusicPreviewGain(
  media: HTMLMediaElement,
  gain: number,
  muted: boolean
): void {
  const effective = muted ? 0 : Math.min(2, Math.max(0, gain));
  const graph = ensureGraph(media);
  if (!graph) {
    media.volume = Math.min(1, effective);
    return;
  }
  media.volume = 1;
  graph.gain.gain.value = effective;
  if (graph.ctx.state === "suspended" && effective > 0) {
    void graph.ctx.resume();
  }
}
