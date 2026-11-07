import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { setupPractice } from '../src/sim/practice';
import { emptyIntent } from '../src/sim/types';
import { World } from '../src/sim/world';

describe('practice mode', () => {
  it('nobody hunts the player and the target stands still', () => {
    const w = new World({ seed: 3, withPlayer: true });
    setupPractice(w);
    const target = w.agents[w.contracts.targetOf(w.player!.id)];
    const x0 = target.x, z0 = target.z;
    let shots = 0;
    for (let t = 0; t < 120 * CONFIG.sim.tickRate; t++) {
      w.setPlayerIntent(emptyIntent());
      w.step(1 / CONFIG.sim.tickRate);
      for (const e of w.drainEvents()) if (e.type === 'shot') shots++;
    }
    expect(shots).toBe(0);
    expect(w.player!.alive).toBe(true);
    // It may be jostled by passers-by, but it never walks off anywhere.
    expect(Math.hypot(target.x - x0, target.z - z0)).toBeLessThan(2);
    expect(target.hasGoal).toBe(false);
    // Other spies wander like commuters.
    const others = w.spies.filter((s) => !s.isPlayer && s !== target);
    expect(others.some((s) => Math.hypot(s.x - s.px, s.z - s.pz) > 0 || s.hasGoal)).toBe(true);
  });
});
