// Appearance generation. Spies wear charcoal suits; many civilians are
// commuters in near-identical suits so the dossier alone never identifies a spy.

import type { Rng } from '../core/rng';
import type { Appearance, BagKind, HairStyle } from './types';

export const SUIT_COLORS = [0x2a2c30, 0x2f3135, 0x26282c];
export const COAT_COLORS = [
  0x8a6a45, 0x2a3550, 0x4c5233, 0x5a4030, 0x4a5560, 0x9b8c74,
  0x2f4a3a, 0x4a3c48, 0x8a7030, 0x2d5558, 0x6b6b6b, 0x3d3a33,
  0x6e5a7a, 0x7c6a52, 0x34465e, 0x56604a, 0xa08e6a, 0x5d4a3e,
];
export const PANTS_COLORS = [0x1e1f22, 0x2b2b2e, 0x3a3328, 0x24303f, 0x4a4438, 0x5b5348, 0x2e3a30];
export const TIE_COLORS = [0x24345e, 0x1f6b4a, 0xb08a2a, 0x5e2d5a, 0xa3a9b0, 0x1f7075, 0x6f97c0, 0x141414];
export const TIE_NAMES = ['navy', 'emerald', 'mustard', 'plum', 'silver', 'teal', 'sky-blue', 'black'];
export const HAT_COLORS = [0x1a1a1c, 0x3a3026, 0x2b2f38];
export const HAIR_COLORS = [0x15110e, 0x3b2616, 0x6b4a2b, 0xb59a6a, 0x8d8a86];
export const HAIR_NAMES = ['black', 'dark brown', 'light brown', 'fair', 'grey'];
const HAIR_STYLE_NAMES: Record<HairStyle, string> = { 0: 'short', 1: 'long', 2: 'tied back', 3: 'shaved' };

function hair(rng: Rng): { hair: number; hairName: number; hairStyle: HairStyle } {
  const h = rng.int(HAIR_COLORS.length);
  const r = rng.next();
  const style: HairStyle = r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.9 ? 2 : 3;
  return { hair: HAIR_COLORS[h], hairName: h, hairStyle: style };
}

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
      pants: 0x1f2023,
      tie: TIE_COLORS[t],
      tieName: t,
      hat: h,
      hatColor: rng.pick(HAT_COLORS),
      glasses: g,
      ...hair(rng),
      bag: 'none',
      scarf: false,
      skirt: false,
      longCoat: false,
      build: rng.range(0.35, 0.75),
      skin: rng.next(),
      scale: rng.range(0.96, 1.04),
      seed: rng.next(),
    });
  }
  return out;
}

export function civilianAppearance(rng: Rng): Appearance {
  const commuter = rng.chance(0.42);
  const t = rng.int(TIE_COLORS.length);
  const skirt = !commuter && rng.chance(0.28);
  const bagRoll = rng.next();
  const bag: BagKind = commuter
    ? (bagRoll < 0.32 ? 'briefcase' : bagRoll < 0.42 ? 'shoulder' : 'none')
    : (bagRoll < 0.08 ? 'briefcase' : bagRoll < 0.3 ? 'shoulder' : bagRoll < 0.45 ? 'backpack' : 'none');
  const hairInfo = hair(rng);
  if (skirt && hairInfo.hairStyle === 3) hairInfo.hairStyle = 1;
  return {
    coat: commuter ? rng.pick(SUIT_COLORS) : rng.pick(COAT_COLORS),
    pants: commuter ? 0x1f2023 : rng.pick(PANTS_COLORS),
    tie: commuter || rng.chance(0.25) ? TIE_COLORS[t] : -1,
    tieName: t,
    hat: rng.chance(commuter ? 0.5 : 0.25),
    hatColor: rng.pick(HAT_COLORS),
    glasses: rng.chance(0.4),
    ...hairInfo,
    bag,
    scarf: !commuter && rng.chance(0.3),
    skirt,
    longCoat: !commuter && !skirt && rng.chance(0.4),
    build: skirt ? rng.range(0, 0.35) : rng.range(0.2, 1),
    skin: rng.next(),
    scale: rng.range(0.92, 1.06) * (skirt ? 0.96 : 1),
    seed: rng.next(),
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

/** Dossier lines, generated from the target's real (undisguised) appearance. */
export function describeAppearance(a: Appearance): string[] {
  const lines = ['Charcoal suit'];
  lines.push(a.tie >= 0 ? `${cap(TIE_NAMES[a.tieName])} tie` : 'No tie');
  lines.push(a.hat ? 'Wears a hat' : 'No hat');
  lines.push(a.glasses ? 'Glasses' : 'No glasses');
  lines.push(a.hairStyle === 3 ? 'Shaved head' : `${cap(HAIR_NAMES[a.hairName])} hair, ${HAIR_STYLE_NAMES[a.hairStyle]}`);
  return lines;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
