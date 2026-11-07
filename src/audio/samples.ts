// Recorded sound samples (CC0, see docs/CREDITS.md). Fetched lazily after the
// title screen appears and decoded once the AudioContext exists. Every sound
// that uses a sample falls back to the procedural synthesis when the sample
// isn't loaded (offline, blocked, still loading, or in tests).

export const SAMPLE_NAMES = [
  'shot_suppressed_1', 'shot_suppressed_2', 'shot_suppressed_3',
  'mag_out', 'mag_in', 'slide_release', 'dry_fire',
  'casing_drop_1', 'casing_drop_2', 'draw', 'holster',
  'impact_body', 'impact_stone', 'impact_metal',
] as const;

export type SampleName = (typeof SAMPLE_NAMES)[number];

/** Seconds from each clip's start to its loudest transient (measured when the clips were cut). */
export const SAMPLE_PEAK: Record<SampleName, number> = {
  shot_suppressed_1: 0.011, shot_suppressed_2: 0.01, shot_suppressed_3: 0.051,
  mag_out: 0.222, mag_in: 0.169, slide_release: 0.035, dry_fire: 0.007,
  casing_drop_1: 0.014, casing_drop_2: 0.111, draw: 0.426, holster: 0.116,
  impact_body: 0.111, impact_stone: 0.004, impact_metal: 0.004,
};

export class SampleBank {
  private readonly raw = new Map<SampleName, ArrayBuffer>();
  private readonly buffers = new Map<SampleName, AudioBuffer>();
  private ctx: BaseAudioContext | null = null;
  private fetching = false;

  /** Ogg Vorbis where supported, AAC (.m4a) otherwise (Safari). */
  private ext(): string {
    try {
      const a = document.createElement('audio');
      return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
    } catch {
      return 'm4a';
    }
  }

  /** Start downloading every clip (call after the title screen is up). Failures are ignored. */
  prefetch(base = 'audio/'): void {
    if (this.fetching || typeof fetch !== 'function') return;
    this.fetching = true;
    const ext = this.ext();
    for (const name of SAMPLE_NAMES) {
      fetch(`${base}${name}.${ext}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((buf) => {
          this.raw.set(name, buf);
          if (this.ctx) this.decode(name);
        })
        .catch(() => { /* procedural fallback */ });
    }
  }

  /** The audio context now exists: decode whatever has arrived (and future arrivals). */
  attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    for (const name of this.raw.keys()) this.decode(name);
  }

  private decode(name: SampleName): void {
    const raw = this.raw.get(name);
    if (!raw || !this.ctx || this.buffers.has(name)) return;
    this.raw.delete(name);
    this.ctx.decodeAudioData(raw).then((b) => this.buffers.set(name, b), () => { /* fallback */ });
  }

  get(name: SampleName): AudioBuffer | null {
    return this.buffers.get(name) ?? null;
  }

  get loaded(): number {
    return this.buffers.size;
  }
}

/**
 * When each reload sample starts (seconds after the reload begins), lined up with
 * the viewmodel's magazine animation: the release as the magazine starts to drop,
 * the click as the fresh one seats, then the slide release.
 */
export function reloadSchedule(reloadTime: number, anim: { dropStart: number; seated: number; slide: number }): Record<'mag_out' | 'mag_in' | 'slide_release', number> {
  return {
    mag_out: Math.max(0, anim.dropStart * reloadTime - 0.02),
    mag_in: Math.max(0, anim.seated * reloadTime - SAMPLE_PEAK.mag_in),
    slide_release: Math.max(0, anim.slide * reloadTime - SAMPLE_PEAK.slide_release),
  };
}
