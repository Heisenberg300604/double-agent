import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Contracts } from '../src/sim/contracts';

describe('target chain', () => {
  it('starts as a valid cycle where everyone has exactly one target and one hunter', () => {
    const c = new Contracts(new Rng(1));
    c.init([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(c.isValid()).toBe(true);
    const targets = new Set<number>();
    for (const id of c.order) {
      const t = c.targetOf(id);
      expect(t).not.toBe(id);
      targets.add(t);
      expect(c.targetOf(c.hunterOf(id))).toBe(id);
    }
    expect(targets.size).toBe(8);
  });

  it('killer inherits the victim target', () => {
    const c = new Contracts(new Rng(2));
    c.order = [0, 1, 2, 3];
    c.onKill(0, 1); // 0 hunted 1
    expect(c.targetOf(0)).toBe(2);
    expect(c.isValid()).toBe(true);
  });

  it('a non-hunter killer also inherits the victim target', () => {
    const c = new Contracts(new Rng(3));
    c.order = [0, 1, 2, 3, 4];
    c.onKill(3, 1); // 3 targets 4, kills 1 (whose target is 2)
    expect(c.targetOf(3)).toBe(2);
    expect(c.isValid()).toBe(true);
  });

  it('reshuffles when the killer would target themselves (killed their own hunter)', () => {
    const c = new Contracts(new Rng(4));
    c.order = [0, 1, 2, 3];
    c.onKill(1, 0); // 0 hunted 1
    expect(c.targetOf(1)).not.toBe(1);
    expect(c.has(0)).toBe(false);
    expect(c.isValid()).toBe(true);
  });

  it('stays a valid cycle through thousands of random kills and respawns', () => {
    const rng = new Rng(99);
    for (const n of [8, 9, 10]) {
      const c = new Contracts(new Rng(n));
      const ids = Array.from({ length: n }, (_, i) => i);
      c.init(ids);
      const dead = new Set<number>();
      for (let step = 0; step < 5000; step++) {
        const alive = ids.filter((i) => !dead.has(i));
        if (alive.length > 1 && rng.chance(0.6)) {
          const victim = rng.pick(alive);
          const killer = rng.chance(0.1) ? -1 : rng.pick(alive.filter((a) => a !== victim));
          c.onKill(killer, victim);
          dead.add(victim);
        } else if (dead.size) {
          const back = rng.pick([...dead]);
          dead.delete(back);
          c.insertRandom(back);
        }
        expect(c.isValid()).toBe(true);
        expect(c.order.length).toBe(n - dead.size);
        if (c.order.length >= 2) for (const id of c.order) expect(c.targetOf(id)).not.toBe(id);
      }
    }
  });
});
