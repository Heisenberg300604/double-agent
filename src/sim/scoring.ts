// Pure scoring rules.

import { CONFIG } from '../config';

export type KillRelation = 'target' | 'hunter' | 'other' | 'civilian';

export function killPoints(relation: KillRelation, headshot: boolean, unseen: boolean): number {
  const s = CONFIG.score;
  switch (relation) {
    case 'target':
      return s.target + (unseen ? s.unseenBonus : 0) + (headshot ? s.headshotBonus : 0);
    case 'hunter':
      return s.hunter;
    case 'other':
      return s.wrongSpy;
    case 'civilian':
      return s.civilian;
  }
}

/** Relation of a victim to the killer given the chain before the kill. */
export function killRelation(killerTarget: number, victimTarget: number, killer: number, victim: number, victimIsSpy: boolean): KillRelation {
  if (!victimIsSpy) return 'civilian';
  if (killerTarget === victim) return 'target';
  if (victimTarget === killer) return 'hunter';
  return 'other';
}

export interface RankEntry {
  id: number;
  score: number;
}

/** Rank (1-based) by score descending; ties share the better rank. */
export function rankOf(entries: readonly RankEntry[], id: number): number {
  const me = entries.find((e) => e.id === id);
  if (!me) return entries.length;
  let better = 0;
  for (const e of entries) if (e.score > me.score) better++;
  return better + 1;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
