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
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private crowdGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private crowdLayers: { gain: GainNode; rate: number; phase: number }[] = [];
  private patterTimer = 0;
  private rumbleTimer = 40;
  private density = 0.5;
  private platformness = 0;
  private time = 0;

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
    // Big-hall reverb from a procedurally generated impulse response.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.2);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.sfx.connect(this.reverbSend).connect(this.reverb).connect(this.master);
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

  /** density: 0..1 how crowded the listener's surroundings are; platform: 0..1 how far onto the platforms. */
  setSurroundings(density: number, platform: number): void {
    this.density = density;
    this.platformness = platform;
  }

  update(dt: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    this.time += dt;
    // Crowd chatter: formant bands with syllable-rate amplitude modulation.
    const crowdLevel = (0.35 + 0.65 * this.density) * (1 - 0.55 * this.platformness);
    if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(crowdLevel, ctx.currentTime, 0.4);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.03 + 0.12 * this.platformness, ctx.currentTime, 0.6);
    for (const l of this.crowdLayers) {
      l.phase += dt * l.rate * (0.7 + Math.random() * 0.6);
      const syll = Math.max(0, Math.sin(l.phase)) * (0.5 + 0.5 * Math.sin(l.phase * 0.13 + 1));
      l.gain.gain.setTargetAtTime(0.02 + syll * 0.06, ctx.currentTime, 0.05);
    }
    // Soft footsteps of the crowd around you.
    this.patterTimer -= dt;
    if (this.patterTimer <= 0) {
      this.patterTimer = 0.12 + Math.random() * (0.6 - 0.45 * this.density);
      this.patter();
    }
    // Distant trains.
    this.rumbleTimer -= dt;
    if (this.rumbleTimer <= 0) {
      this.rumbleTimer = 45 + Math.random() * 50;
      this.distantTrain();
    }
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections + diffuse tail.
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? 0.8 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early) * 0.6;
      }
    }
    return buf;
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
    const o = this.out(undefined, 0, 0.42);
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

  private patter(): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 + Math.random() * 900;
    bp.Q.value = 2;
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.env(g, t, 0.003, 0.05 * (0.4 + this.density) * (1 - 0.6 * this.platformness), 0.05);
    n.connect(bp).connect(g);
    if (pan) {
      pan.pan.value = Math.random() * 2 - 1;
      g.connect(pan).connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    n.start(t);
    n.stop(t + 0.08);
  }

  private distantTrain(): void {
    if (!this.ready) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    // Low rumble swell.
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 3);
    g.gain.linearRampToValueAtTime(0.0001, t + 8);
    n.connect(lp).connect(g).connect(this.sfx);
    n.start(t);
    n.stop(t + 8.2);
    // Far-off two-tone horn.
    if (Math.random() < 0.6) {
      for (const f of [311, 370]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900;
        bp.Q.value = 1.2;
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.0001, t + 2);
        hg.gain.linearRampToValueAtTime(0.022, t + 2.15);
        hg.gain.setValueAtTime(0.022, t + 3.1);
        hg.gain.linearRampToValueAtTime(0.0001, t + 3.5);
        o.connect(bp).connect(hg).connect(this.sfx);
        o.start(t + 2);
        o.stop(t + 3.6);
      }
    }
  }

  /** Door-closing warning beeps from a train. */
  doorBeeps(pos: { x: number; y: number; z: number }): void {
    const o = this.out(pos, 45, 0.5);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 2350;
      const g = ctx.createGain();
      this.env(g, t + i * 0.32, 0.01, 0.25, 0.16);
      osc.connect(g).connect(o);
      osc.start(t + i * 0.32);
      osc.stop(t + i * 0.32 + 0.2);
    }
  }

  /**
   * Station announcement: the chime, then the voice. Uses the browser's speech
   * synthesiser when available, otherwise a procedural PA babble.
   */
  announce(text: string): void {
    if (!this.ready) return;
    this.chime();
    window.setTimeout(() => this.speak(text), 2100);
  }

  private speak(text: string): void {
    if (!this.ready) return;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    this.paHiss(text.length * 0.07);
    if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.92;
        u.pitch = 0.85;
        u.volume = Math.min(1, this.volume * 0.55);
        const voices = synth.getVoices();
        const v = voices.find((x) => /en-GB/i.test(x.lang)) ?? voices.find((x) => /^en/i.test(x.lang));
        if (v) u.voice = v;
        synth.cancel();
        synth.speak(u);
        return;
      } catch {
        /* fall back to babble */
      }
    }
    this.babble(text.length * 0.07);
  }

  stopSpeech(): void {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }

  /** Band-limited PA hiss under the voice. */
  private paHiss(seconds: number): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.012, t + 0.2);
    g.gain.setValueAtTime(0.012, t + seconds);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds + 0.4);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start(t);
    n.stop(t + seconds + 0.5);
  }

  /** Procedural "voice over a tannoy": formant-filtered pulses in syllables. */
  private babble(seconds: number): void {
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 125;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 8;
    const radio = ctx.createBiquadFilter();
    radio.type = 'highpass';
    radio.frequency.value = 350;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(f1).connect(radio);
    osc.connect(f2).connect(radio);
    radio.connect(g).connect(this.sfx);
    let t = t0;
    while (t < t0 + seconds) {
      const len = 0.09 + Math.random() * 0.14;
      f1.frequency.setValueAtTime(300 + Math.random() * 500, t);
      f2.frequency.setValueAtTime(900 + Math.random() * 1500, t);
      osc.frequency.setValueAtTime(110 + Math.random() * 40, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      t += len + (Math.random() < 0.15 ? 0.25 : 0.03);
    }
    osc.start(t0);
    osc.stop(t + 0.1);
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
    // Chatter: three formant bands, each with its own syllable rhythm.
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.6;
    this.crowdGain.connect(this.ambient);
    this.crowdGain.connect(this.reverbSend);
    for (const [f, q, rate] of [[420, 3, 4.2], [1150, 4, 5.1], [2400, 5, 3.6]] as const) {
      const src = this.noiseSrc();
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = f;
      filt.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0.03;
      src.connect(filt).connect(g).connect(this.crowdGain);
      src.start();
      this.crowdLayers.push({ gain: g, rate, phase: Math.random() * 6 });
    }
    // Platform wind: airy high band, louder out by the tracks.
    const wind = this.noiseSrc();
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 900;
    wf.Q.value = 0.4;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.03;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.09;
    const wlg = ctx.createGain();
    wlg.gain.value = 400;
    wl.connect(wlg).connect(wf.frequency);
    wl.start();
    wind.connect(wf).connect(this.windGain).connect(this.ambient);
    wind.start();
    this.ambient.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
  }
}
