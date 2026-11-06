// Procedural Web Audio: every sound is synthesised from noise and oscillators.
// Positional sounds use distance-based gain + stereo pan relative to the listener.

export interface Listener {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private volume = 0.8;
  private listener: Listener = { x: 0, y: 0, z: 0, yaw: 0 };
  private ambient: GainNode | null = null;
  private chimeTimer = 30;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  suspend(on: boolean): void {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  setListener(l: Listener): void {
    this.listener = l;
  }

  update(dt: number): void {
    if (!this.ready) return;
    this.chimeTimer -= dt;
    if (this.chimeTimer <= 0) {
      this.chimeTimer = 90;
      this.chime();
    }
  }

  // ---------------------------------------------------------------- helpers
  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  /** Output node for a sound at a world position (or non-positional if pos omitted). */
  private out(pos?: { x: number; y: number; z: number }, range = 30, gain = 1): AudioNode | null {
    if (!this.ready) return null;
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let vol = gain;
    let pan = 0;
    if (pos) {
      const l = this.listener;
      const dx = pos.x - l.x, dy = pos.y - l.y, dz = pos.z - l.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > range) return null;
      vol *= Math.pow(1 - d / range, 1.6) / (1 + d * 0.06);
      // Listener right vector for yaw (camera looks toward -Z at yaw 0).
      const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw);
      pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.85 : 0;
    }
    if (vol < 0.005) return null;
    g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    return g;
  }

  private env(g: GainNode, t: number, a: number, peak: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  // ---------------------------------------------------------------- sounds
  shot(pos?: { x: number; y: number; z: number }, own = false): void {
    const o = this.out(pos, 40, own ? 0.75 : 1);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.9, 0.14);
    n.connect(bp).connect(g).connect(o);
    n.start(t);
    n.stop(t + 0.2);
    // Thump.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.09);
    const og = ctx.createGain();
    this.env(og, t, 0.002, 0.6, 0.1);
    osc.connect(og).connect(o);
    osc.start(t);
    osc.stop(t + 0.15);
    // Mechanical clack.
    this.click(t + 0.03, 3200, 0.25, o);
  }

  private click(t: number, freq: number, vol: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const n = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = freq;
    hp.Q.value = 4;
    const g = ctx.createGain();
    this.env(g, t, 0.001, vol, 0.035);
    n.connect(hp).connect(g).connect(dest);
    n.start(t);
    n.stop(t + 0.06);
  }

  reload(): void {
    const o = this.out(undefined, 0, 0.8);
    if (!o) return;
    const t = this.ctx!.currentTime;
    this.click(t + 0.1, 1800, 0.5, o);
    this.click(t + 0.55, 1400, 0.5, o);
    this.click(t + 1.25, 2600, 0.7, o);
    this.click(t + 1.33, 2000, 0.5, o);
  }

  footstep(pos: { x: number; y: number; z: number } | undefined, loud: boolean): void {
    const o = this.out(pos, loud ? 14 : 6, loud ? 0.5 : 0.18);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = loud ? 900 : 600;
    const g = ctx.createGain();
    this.env(g, t, 0.004, 1, loud ? 0.09 : 0.06);
    n.connect(lp).connect(g).connect(o);
    n.start(t);
    n.stop(t + 0.15);
  }

  ping(): void {
    const o = this.out(undefined, 0, 0.5);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    for (const [delay, f] of [[0, 1320], [0.18, 990]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      this.env(g, t + delay, 0.005, 0.6, 0.5);
      osc.connect(g).connect(o);
      osc.start(t + delay);
      osc.stop(t + delay + 0.6);
    }
  }

  hiss(pos?: { x: number; y: number; z: number }): void {
    const o = this.out(pos, 30, 0.7);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const n = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    n.connect(hp).connect(g).connect(o);
    n.start(t);
    n.stop(t + 1.9);
  }

  hitTick(headshot: boolean): void {
    const o = this.out(undefined, 0, 0.45);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = headshot ? 2600 : 1900;
    const g = ctx.createGain();
    this.env(g, t, 0.001, 0.35, 0.05);
    osc.connect(g).connect(o);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  killSting(good: boolean): void {
    const o = this.out(undefined, 0, 0.5);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const notes = good ? [392, 494, 587] : [330, 311, 233];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      this.env(g, t + i * 0.09, 0.01, 0.35, 0.6);
      osc.connect(g).connect(o);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.7);
    });
  }

  hurt(): void {
    const o = this.out(undefined, 0, 0.6);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const g = ctx.createGain();
    this.env(g, t, 0.005, 1, 0.25);
    n.connect(lp).connect(g).connect(o);
    n.start(t);
    n.stop(t + 0.3);
  }

  chime(): void {
    const o = this.out(undefined, 0, 0.32);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    [659, 523, 784, 659].forEach((f, i) => {
      for (const [mult, amp] of [[1, 1], [2.01, 0.3], [3.02, 0.12]] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f * mult;
        const g = ctx.createGain();
        this.env(g, t + i * 0.45, 0.01, 0.4 * amp, 1.6);
        osc.connect(g).connect(o);
        osc.start(t + i * 0.45);
        osc.stop(t + i * 0.45 + 1.8);
      }
    });
  }

  private startAmbient(): void {
    const ctx = this.ctx!;
    this.ambient = ctx.createGain();
    this.ambient.gain.value = 0.0001;
    this.ambient.connect(this.master);
    // Low station hum.
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 55;
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 120;
    const humG = ctx.createGain();
    humG.gain.value = 0.05;
    hum.connect(humLp).connect(humG).connect(this.ambient);
    hum.start();
    // Room tone.
    const room = this.noiseSrc();
    const roomLp = ctx.createBiquadFilter();
    roomLp.type = 'lowpass';
    roomLp.frequency.value = 220;
    const roomG = ctx.createGain();
    roomG.gain.value = 0.12;
    room.connect(roomLp).connect(roomG).connect(this.ambient);
    room.start();
    // Crowd murmur: band-passed noise with slow amplitude wobble.
    const crowd = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 1.4;
    const cg = ctx.createGain();
    cg.gain.value = 0.07;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.03;
    lfo.connect(lfoG).connect(cg.gain);
    lfo.start();
    crowd.connect(bp).connect(cg).connect(this.ambient);
    crowd.start();
    this.ambient.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
  }
}
