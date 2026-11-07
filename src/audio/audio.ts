// Web Audio engine. Gunshots, reloads, impacts, casings and holster sounds use
// recorded CC0 samples when they have loaded (see samples.ts); everything else,
// and every sample-backed sound before or without its samples, is synthesised
// from noise and oscillators. Positional sounds use distance-based gain + stereo
// pan relative to the listener; far gunshots and impacts are also low-passed and
// delayed. Two procedural station reverbs (the vaulted concourse and the
// shorter platforms) crossfade with where the listener is.

import { CONFIG } from '../config';
import { SampleBank, reloadSchedule, type SampleName } from './samples';

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
  /** Wet input for sounds that should ring in the station (shots, impacts). */
  private wetIn!: GainNode;
  private hallGain!: GainNode;
  private platformGain!: GainNode;
  readonly samples = new SampleBank();
  private crowdGain: GainNode | null = null;
  private crowdLayers: { gain: GainNode; rate: number; phase: number }[] = [];
  private patterTimer = 0;
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
    // Station reverb from procedurally generated impulse responses: a long, bright
    // tail under the concourse vault and a shorter, darker one on the platforms.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2, 2.0, 0);
    const platformVerb = this.ctx.createConvolver();
    platformVerb.buffer = this.impulse(1.2, 2.8, 0.55);
    this.hallGain = this.ctx.createGain();
    this.platformGain = this.ctx.createGain();
    this.platformGain.gain.value = 0;
    this.wetIn = this.ctx.createGain();
    this.wetIn.connect(this.reverb).connect(this.hallGain).connect(this.master);
    this.wetIn.connect(platformVerb).connect(this.platformGain).connect(this.master);
    // Everything gets a little room; shots and impacts send much more through out(…, wet).
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.2;
    this.sfx.connect(this.reverbSend).connect(this.wetIn);
    this.samples.attach(this.ctx);
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
    this.hallGain.gain.setTargetAtTime(1 - this.platformness, ctx.currentTime, 0.5);
    this.platformGain.gain.setTargetAtTime(this.platformness, ctx.currentTime, 0.5);
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
  }

  /** darkness 0..1: one-pole low-pass on the tail (stone platforms absorb highs sooner). */
  private impulse(seconds: number, decay: number, darkness: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections + diffuse tail that darkens as it decays.
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? 0.8 : 0;
        const n = Math.random() * 2 - 1;
        const k = Math.min(0.97, darkness * (0.4 + 0.6 * t));
        lp = lp * k + n * (1 - k);
        d[i] = (lp * Math.pow(1 - t, decay) + early) * 0.6;
      }
    }
    return buf;
  }

  /** Begin fetching the recorded samples (call once the title screen is up). */
  preloadSamples(): void {
    this.samples.prefetch();
  }

  /** Play a sample into `dest`; false if it isn't loaded (caller falls back). */
  private sample(name: SampleName, dest: AudioNode, when: number, gain = 1, rate = 1): boolean {
    const buf = this.samples.get(name);
    if (!buf) return false;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(when);
    return true;
  }

  // ---------------------------------------------------------------- helpers
  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  /**
   * Output node for a sound at a world position (or non-positional if pos omitted).
   * `wet` sends extra signal into the station reverb. `far` muffles and delays the
   * sound with distance (a far shot is a dull pop that echoes off the vault).
   */
  private out(pos?: { x: number; y: number; z: number }, range = 30, gain = 1, wet = 0, far = false): AudioNode | null {
    if (!this.ready) return null;
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let vol = gain;
    let pan = 0;
    let d = 0;
    if (pos) {
      const l = this.listener;
      const dx = pos.x - l.x, dy = pos.y - l.y, dz = pos.z - l.z;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > range) return null;
      vol *= Math.pow(1 - d / range, 1.6) / (1 + d * 0.06);
      // Listener right vector for yaw (camera looks toward -Z at yaw 0).
      const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw);
      pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.85 : 0;
    }
    // Far sounds keep more of their reverb than their direct sound.
    const wetVol = wet * gain * (pos ? Math.pow(1 - d / range, 0.7) : 1);
    if (vol < 0.005 && wetVol < 0.005) return null;
    g.gain.value = vol;
    let head: AudioNode = g;
    if (far && d > 3) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(650, 14000 * Math.exp(-d / 9));
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = Math.min(0.45, d / 343 + 0.01);
      lp.connect(delay).connect(g);
      head = lp;
    }
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    if (wetVol > 0.005) {
      const w = ctx.createGain();
      w.gain.value = wetVol;
      head.connect(w).connect(this.wetIn);
    }
    return head;
  }

  private env(g: GainNode, t: number, a: number, peak: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  // ---------------------------------------------------------------- sounds
  shot(pos?: { x: number; y: number; z: number }, own = false): void {
    const o = this.out(pos, 40, own ? 0.75 : 1, own ? 0.55 : 0.8, !own);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    // Recorded suppressed pistol: one of three takes with a ±4% pitch spread
    // (Math.random is the audio RNG; the simulation's RNG is never touched here).
    const take = (['shot_suppressed_1', 'shot_suppressed_2', 'shot_suppressed_3'] as const)[Math.floor(Math.random() * 3)];
    if (this.sample(take, o, t, own ? 0.95 : 1.1, 0.96 + Math.random() * 0.08)) {
      if (own) this.casing();
      return;
    }
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
    const W = CONFIG.weapon;
    const at = reloadSchedule(W.reloadTime, W.reloadAnim);
    // Each step falls back to a synthesised click at the same moment.
    if (!this.sample('mag_out', o, t + at.mag_out, 0.8)) this.click(t + W.reloadAnim.dropStart * W.reloadTime, 1800, 0.5, o);
    if (!this.sample('mag_in', o, t + at.mag_in, 0.9)) this.click(t + W.reloadAnim.seated * W.reloadTime, 1400, 0.5, o);
    if (!this.sample('slide_release', o, t + at.slide_release, 0.9)) {
      this.click(t + W.reloadAnim.slide * W.reloadTime - 0.05, 2600, 0.7, o);
      this.click(t + W.reloadAnim.slide * W.reloadTime + 0.03, 2000, 0.5, o);
    }
  }

  /** Brass casing hitting the stone floor after an own shot. */
  private casing(): void {
    const o = this.out(undefined, 0, 0.35);
    if (!o) return;
    const t = this.ctx!.currentTime + 0.42 + Math.random() * 0.12;
    const take = Math.random() < 0.5 ? 'casing_drop_1' : 'casing_drop_2';
    if (!this.sample(take, o, t, 1, 0.95 + Math.random() * 0.1)) {
      this.click(t, 5200, 0.12, o);
      this.click(t + 0.09, 4800, 0.07, o);
    }
  }

  /** Pulling the trigger on an empty or reloading gun. */
  dryFire(): void {
    const o = this.out(undefined, 0, 0.7);
    if (!o) return;
    const t = this.ctx!.currentTime;
    if (!this.sample('dry_fire', o, t)) this.click(t, 2200, 0.4, o);
  }

  /** Drawing or holstering the pistol (leather and cloth). */
  holster(draw: boolean): void {
    const o = this.out(undefined, 0, draw ? 0.45 : 0.35);
    if (!o) return;
    const t = this.ctx!.currentTime;
    if (this.sample(draw ? 'draw' : 'holster', o, t)) return;
    const n = this.noiseSrc();
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.7;
    const g = this.ctx!.createGain();
    this.env(g, t, 0.03, 0.25, 0.18);
    n.connect(bp).connect(g).connect(o);
    n.start(t);
    n.stop(t + 0.25);
  }

  /** A bullet hitting something: stone (walls, floors), metal (trains, rails) or a body. */
  impact(pos: { x: number; y: number; z: number }, kind: 'stone' | 'metal' | 'body'): void {
    const o = this.out(pos, 35, kind === 'body' ? 0.7 : 0.55, kind === 'body' ? 0.2 : 0.5, true);
    if (!o) return;
    const t = this.ctx!.currentTime;
    const name = kind === 'body' ? 'impact_body' : kind === 'metal' ? 'impact_metal' : 'impact_stone';
    if (this.sample(name, o, t, 1, 0.94 + Math.random() * 0.12)) return;
    if (kind === 'body') {
      const n = this.noiseSrc();
      const lp = this.ctx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const g = this.ctx!.createGain();
      this.env(g, t, 0.002, 0.8, 0.08);
      n.connect(lp).connect(g).connect(o);
      n.start(t);
      n.stop(t + 0.12);
    } else {
      this.click(t, kind === 'metal' ? 4200 : 2600, 0.5, o);
    }
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

  /** Low rumble swell (used for trains moving in and out). */
  private rumble(o: AudioNode, t: number, rise: number, hold: number, fall: number, peak: number): void {
    const ctx = this.ctx!;
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + rise);
    g.gain.setValueAtTime(peak, t + rise + hold);
    g.gain.linearRampToValueAtTime(0.0001, t + rise + hold + fall);
    n.connect(lp).connect(g).connect(o);
    n.start(t);
    n.stop(t + rise + hold + fall + 0.1);
    // Rail joints: rhythmic clacks that slow down with the train.
    const clacks = Math.floor((rise + hold) * 2.2);
    for (let i = 0; i < clacks; i++) {
      const ti = t + (i / clacks) * (rise + hold) * (0.6 + 0.4 * (i / clacks));
      this.click(ti, 380, 0.18 * peak * 2, o);
    }
  }

  private horn(o: AudioNode, t: number, len: number): void {
    const ctx = this.ctx!;
    for (const f of [311, 370]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.2;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.linearRampToValueAtTime(0.05, t + 0.12);
      hg.gain.setValueAtTime(0.05, t + len);
      hg.gain.linearRampToValueAtTime(0.0001, t + len + 0.35);
      osc.connect(bp).connect(hg).connect(o);
      osc.start(t);
      osc.stop(t + len + 0.4);
    }
  }

  /** A train pulling in: rumble that fades as it brakes, then a brake squeal. */
  trainArrive(pos: { x: number; y: number; z: number }, seconds: number): void {
    const o = this.out(pos, 90, 1);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    this.rumble(o, t, 2, seconds - 6, 4, 0.4);
    const sq = ctx.createOscillator();
    sq.type = 'sawtooth';
    sq.frequency.setValueAtTime(2900, t + seconds - 4);
    sq.frequency.linearRampToValueAtTime(2300, t + seconds);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + seconds - 4);
    g.gain.linearRampToValueAtTime(0.03, t + seconds - 3);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    sq.connect(bp).connect(g).connect(o);
    sq.start(t + seconds - 4);
    sq.stop(t + seconds + 0.1);
  }

  /** A train leaving: horn, then a rumble that builds and fades into the distance. */
  trainDepart(pos: { x: number; y: number; z: number }, seconds: number): void {
    const o = this.out(pos, 90, 1);
    if (!o) return;
    const t = this.ctx!.currentTime;
    this.horn(o, t, 0.9);
    this.rumble(o, t + 1, 5, 4, seconds - 9, 0.35);
  }

  /** A warning horn from a moving train (someone is on the tracks). */
  trainHorn(pos: { x: number; y: number; z: number }): void {
    const o = this.out(pos, 120, 1.2);
    if (!o) return;
    const t = this.ctx!.currentTime;
    this.horn(o, t, 0.6);
    this.horn(o, t + 0.85, 1.4);
  }

  /** Brakes locking up: a long metallic screech. */
  screech(pos: { x: number; y: number; z: number }): void {
    const o = this.out(pos, 80, 1);
    if (!o) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const sq = ctx.createOscillator();
    sq.type = 'sawtooth';
    sq.frequency.setValueAtTime(3200, t);
    sq.frequency.linearRampToValueAtTime(2100, t + 2.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2700;
    bp.Q.value = 7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + 2.4);
    sq.connect(bp).connect(g).connect(o);
    sq.start(t);
    sq.stop(t + 2.5);
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

    this.ambient.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
  }
}
