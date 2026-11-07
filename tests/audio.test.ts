import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { SAMPLE_NAMES, SAMPLE_PEAK, SampleBank, reloadSchedule } from '../src/audio/samples';

describe('recorded samples', () => {
  it('reload sounds hit within ±50 ms of the viewmodel animation marks', () => {
    const W = CONFIG.weapon;
    const at = reloadSchedule(W.reloadTime, W.reloadAnim);
    // Magazine release as it starts to drop; the seating click as the new one goes home; then the slide.
    expect(Math.abs(at.mag_out - W.reloadAnim.dropStart * W.reloadTime)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(at.mag_in + SAMPLE_PEAK.mag_in - W.reloadAnim.seated * W.reloadTime)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(at.slide_release + SAMPLE_PEAK.slide_release - W.reloadAnim.slide * W.reloadTime)).toBeLessThanOrEqual(0.05);
    // And the whole sequence finishes inside the reload.
    expect(at.slide_release + SAMPLE_PEAK.slide_release).toBeLessThan(W.reloadTime);
  });

  it('ships every clip in both formats, within the 400 KB budget per format', async () => {
    // No @types/node in this project: load fs untyped.
    const fsName = 'node:fs';
    const { existsSync, statSync } = (await import(/* @vite-ignore */ fsName)) as { existsSync(p: string): boolean; statSync(p: string): { size: number } };
    for (const ext of ['ogg', 'm4a']) {
      let total = 0;
      for (const n of SAMPLE_NAMES) {
        const f = `public/audio/${n}.${ext}`;
        expect(existsSync(f), f).toBe(true);
        total += statSync(f).size;
      }
      expect(total).toBeLessThan(400 * 1024);
    }
  });

  it('a bank with nothing loaded returns null, so every sound falls back to synthesis', () => {
    const bank = new SampleBank();
    for (const n of SAMPLE_NAMES) expect(bank.get(n)).toBeNull();
    expect(bank.loaded).toBe(0);
  });
});
