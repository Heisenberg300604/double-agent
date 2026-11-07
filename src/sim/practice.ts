// Practice mode: the same station with no hunters. Every other spy wanders like
// a commuter, except the player's target, who stands still at their spawn. The
// session ends at the player's first target kill (handled by the game shell).

import type { World } from './world';

export const PRACTICE_SECONDS = 15 * 60;

export function setupPractice(w: World): void {
  const target = w.contracts.targetOf(w.player!.id);
  w.brains.clear();
  for (const s of w.spies) {
    if (s.isPlayer || s.id === target) continue;
    s.civ = { state: 'wander', timer: 0, poi: -1 };
  }
  w.timeLeft = PRACTICE_SECONDS;
}
