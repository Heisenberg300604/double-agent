import { describe, expect, it } from 'vitest';
import { QualityScaler } from '../src/render/quality';
import { FixedStep } from '../src/core/loop';

describe('auto-quality scaler', () => {
  it('steps render scale down when FPS stays below 50 and back up above 58', () => {
    const q = new QualityScaler();
    expect(q.scale).toBe(1);
    for (let i = 0; i < 40 * 3; i++) q.update(1 / 40);
    expect(q.scale).toBe(0.85);
    for (let i = 0; i < 40 * 4; i++) q.update(1 / 40);
    expect(q.scale).toBe(0.7);
    for (let i = 0; i < 40 * 4; i++) q.update(1 / 40);
    expect(q.scale).toBe(0.7); // floor
    for (let i = 0; i < 60 * 9; i++) q.update(1 / 60);
    expect(q.scale).toBe(0.85);
  });

  it('holds steady around 55 FPS', () => {
    const q = new QualityScaler();
    for (let i = 0; i < 55 * 20; i++) q.update(1 / 55);
    expect(q.scale).toBe(1);
  });
});

describe('fixed timestep', () => {
  it('runs 60 ticks per simulated second regardless of frame rate', () => {
    for (const fps of [30, 60, 144]) {
      const loop = new FixedStep(60);
      let ticks = 0;
      for (let f = 0; f < fps * 10; f++) ticks += loop.advance(1 / fps);
      expect(Math.abs(ticks - 600)).toBeLessThanOrEqual(1);
      expect(loop.alpha).toBeGreaterThanOrEqual(0);
      expect(loop.alpha).toBeLessThan(1);
    }
  });
});
