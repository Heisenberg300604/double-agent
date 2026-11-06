// Fixed-timestep accumulator. The caller runs `steps` simulation ticks and
// renders with `alpha` interpolation between the last two ticks.

export class FixedStep {
  readonly dt: number;
  private acc = 0;
  private readonly maxSteps: number;
  alpha = 0;

  constructor(hz: number, maxSteps = 5) {
    this.dt = 1 / hz;
    this.maxSteps = maxSteps;
  }

  /** Returns the number of ticks to run for this frame. */
  advance(frameSeconds: number): number {
    this.acc += Math.min(frameSeconds, 0.25);
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxSteps) {
      this.acc -= this.dt;
      steps++;
    }
    if (steps === this.maxSteps && this.acc > this.dt) this.acc = 0; // spiral-of-death guard
    this.alpha = this.acc / this.dt;
    return steps;
  }

  reset(): void {
    this.acc = 0;
    this.alpha = 0;
  }
}
