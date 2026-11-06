// Appearance generation. Spies wear charcoal suits; many civilians are
// commuters in near-identical suits so the dossier alone never identifies a spy.

import type { Rng } from '../core/rng';
import type { Appearance } from './types';

export const SUIT_COLORS = [0x2a2c30, 0x2f3135, 0x26282c];
export const COAT_COLORS = [
  0x8a6a45, 0x2a3550, 0x4c5233, 0x5a4030, 0x4a5560, 0x9b8c74,
  0x2f4a3a, 0x4a3c48, 0x8a7030, 0x2d5558, 0x6b6b6b, 0x3d3a33,
];
export const TIE_COLORS = [0x24345e, 0x1f6b4a, 0xb08a2a, 0x5e2d5a, 0xa3a9b0, 0x1f7075, 0x6f97c0, 0x141414];
export const TIE_NAMES = ['navy', 'emerald', 'mustard', 'plum', 'silver', 'teal', 'sky-blue', 'black'];
export const HAT_COLORS = [0x1a1a1c, 0x3a3026, 0x2b2f38];

/** Unique (tie, hat, glasses) combos so every spy has a distinct dossier. */
export function spyAppearances(rng: Rng, count: number): Appearance[] {
  const combos: [number, boolean, boolean][] = [];
  for (let t = 0; t < TIE_COLORS.length; t++) for (const h of [false, true]) for (const g of [false, true]) combos.push([t, h, g]);
  rng.shuffle(combos);
  const out: Appearance[] = [];
  for (let i = 0; i < count; i++) {
    const [t, h, g] = combos[i % combos.length];
    out.push({
      coat: rng.pick(SUIT_COLORS),
      tie: TIE_COLORS[t],
      tieName: t,
      hat: h,
      hatColor: rng.pick(HAT_COLORS),
      glasses: g,
      briefcase: false,
      skin: rng.next(),
      scale: rng.range(0.96, 1.04),
    });
  }
  return out;
}

export function civilianAppearance(rng: Rng): Appearance {
  const commuter = rng.chance(0.42);
  const t = rng.int(TIE_COLORS.length);
  return {
    coat: commuter ? rng.pick(SUIT_COLORS) : rng.pick(COAT_COLORS),
    tie: commuter || rng.chance(0.3) ? TIE_COLORS[t] : -1,
    tieName: t,
    hat: rng.chance(commuter ? 0.5 : 0.3),
    hatColor: rng.pick(HAT_COLORS),
    glasses: rng.chance(0.4),
    briefcase: rng.chance(commuter ? 0.3 : 0.12),
    skin: rng.next(),
    scale: rng.range(0.93, 1.06),
  };
}

export function disguisedAppearance(rng: Rng, base: Appearance): Appearance {
  return {
    ...base,
    coat: rng.pick(COAT_COLORS),
    hat: !base.hat,
    hatColor: rng.pick(HAT_COLORS),
  };
}

export function describeAppearance(a: Appearance): string[] {
  const lines = ['Charcoal suit'];
  lines.push(a.tie >= 0 ? `${cap(TIE_NAMES[a.tieName])} tie` : 'No tie');
  lines.push(a.hat ? 'Wears a hat' : 'No hat');
  lines.push(a.glasses ? 'Glasses' : 'No glasses');
  return lines;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
