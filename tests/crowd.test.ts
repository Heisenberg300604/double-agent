import { describe, expect, it } from 'vitest';
import { FLAG, buildHumanGeometry, varietyFlags } from '../src/render/crowd';
import { civilianAppearance, spyAppearances, SUIT_COLORS } from '../src/sim/appearance';
import { Rng } from '../src/core/rng';

describe('crowd figures', () => {
  it('stay within the triangle budget (≤ 1,200 near; the far version is cheaper)', () => {
    const near = buildHumanGeometry('high').getAttribute('position').count / 3;
    const far = buildHumanGeometry('low').getAttribute('position').count / 3;
    expect(near).toBeLessThanOrEqual(1200);
    expect(far).toBeLessThan(near * 0.6);
  });

  it('spies and suit-wearing commuters never get render-only variety, so they share a silhouette', () => {
    const rng = new Rng(5);
    const garments = FLAG.BEANIE | FLAG.CAP | FLAG.SWEATER | FLAG.PUFFER | FLAG.ROLLED | FLAG.TRENCHBELT;
    for (const ap of spyAppearances(rng, 10)) expect(varietyFlags(ap, true)).toBe(0);
    let suits = 0, varied = 0;
    for (let i = 0; i < 2000; i++) {
      const ap = civilianAppearance(rng);
      const f = varietyFlags(ap, false);
      if ((SUIT_COLORS as readonly number[]).includes(ap.coat)) {
        suits++;
        expect(f & garments).toBe(0);
      } else if (f & garments) {
        varied++;
      }
    }
    expect(suits).toBeGreaterThan(500);
    expect(varied).toBeGreaterThan(200);
  });
});
