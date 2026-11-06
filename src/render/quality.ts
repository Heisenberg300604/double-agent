// Auto-quality scaler: if the rolling FPS drops below the threshold, step the
// render scale down; step back up after sustained headroom.

import { CONFIG } from '../config';

export class QualityScaler {
  step = 0;
  private samples: number[] = [];
  private sampleTime = 0;
  private highTime = 0;
  private cooldown = 0;
  /** Seconds of headroom needed before raising quality; grows when a raise didn't stick. */
  private raiseAfter: number = CONFIG.quality.raiseAfter;
  private sinceRaise = Infinity;
  readonly scales: readonly number[] = CONFIG.quality.scales;

  get scale(): number {
    return this.scales[this.step];
  }

  /** Feed one frame. Returns true when the step changed. */
  update(frameSeconds: number): boolean {
    const Q = CONFIG.quality;
    this.samples.push(frameSeconds);
    this.sampleTime += frameSeconds;
    while (this.sampleTime > Q.window && this.samples.length > 1) this.sampleTime -= this.samples.shift()!;
    this.cooldown -= frameSeconds;
    this.sinceRaise += frameSeconds;
    if (this.sampleTime < Q.window * 0.9 || this.cooldown > 0) return false;
    const fps = this.samples.length / this.sampleTime;
    if (fps < Q.lowFps && this.step < this.scales.length - 1) {
      // Dropping right after a raise means we're oscillating: wait much longer next time.
      if (this.sinceRaise < 15) this.raiseAfter = Math.min(60, this.raiseAfter * 3);
      this.step++;
      this.reset();
      return true;
    }
    if (fps > Q.highFps) {
      this.highTime += frameSeconds;
      if (this.highTime > this.raiseAfter && this.step > 0) {
        this.step--;
        this.sinceRaise = 0;
        this.reset();
        return true;
      }
    } else {
      this.highTime = 0;
    }
    return false;
  }

  averageFps(): number {
    return this.sampleTime > 0 ? this.samples.length / this.sampleTime : 0;
  }

  private reset(): void {
    this.samples = [];
    this.sampleTime = 0;
    this.highTime = 0;
    this.cooldown = 1;
  }
}
