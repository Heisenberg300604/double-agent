import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { addSuspicion, isExposed, onFired, updateSuspicion } from '../src/sim/suspicion';
import { emptyIntent, type SpyState } from '../src/sim/types';

function spy(): SpyState {
  return {
    name: 't', score: 0, kills: 0, deaths: 0, civKills: 0, targetKills: 0, suspicion: 0, proximityTimer: 0,
    drawn: false, drawTimer: 0, holsterTimer: 0, aiming: false, ammo: 8, reloadTimer: 0, fireCooldown: 0, firePending: false,
    cdScanner: 0, cdDisguise: 0, cdSmoke: 0, scanTimer: 0, disguiseTimer: 0, revealTimer: 0, respawnTimer: 0,
    seenBy: new Map(), lastAttacker: -1, lastAttackTime: 0, running: false, intent: emptyIntent(),
  };
}
const idle = { running: false, drawn: false, aiming: false, nearSpy: false };
const run = (s: SpyState, inp: typeof idle, secs: number): void => {
  for (let t = 0; t < secs; t += 1 / 60) updateSuspicion(s, inp, 1 / 60);
};

describe('suspicion', () => {
  it('running gains 25/s', () => {
    const s = spy();
    run(s, { ...idle, running: true }, 1);
    expect(s.suspicion).toBeCloseTo(25, 0);
  });

  it('drawn +15/s and aiming +30/s stack', () => {
    const s = spy();
    run(s, { ...idle, drawn: true }, 1);
    expect(s.suspicion).toBeCloseTo(15, 0);
    const s2 = spy();
    run(s2, { ...idle, drawn: true, aiming: true }, 1);
    expect(s2.suspicion).toBeCloseTo(45, 0);
  });

  it('decays 20/s while acting normal and clamps to 0..100', () => {
    const s = spy();
    s.suspicion = 50;
    run(s, idle, 1);
    expect(s.suspicion).toBeCloseTo(30, 0);
    run(s, idle, 5);
    expect(s.suspicion).toBe(0);
    run(s, { ...idle, running: true, aiming: true, drawn: true }, 10);
    expect(s.suspicion).toBe(100);
  });

  it('standing near another spy only counts after 3 s', () => {
    const s = spy();
    run(s, { ...idle, nearSpy: true }, 2.9);
    expect(s.suspicion).toBe(0);
    run(s, { ...idle, nearSpy: true }, 1.1);
    expect(s.suspicion).toBeGreaterThan(5);
    expect(s.suspicion).toBeLessThan(15);
  });

  it('jump adds 10, firing sets 100, exposed at 60', () => {
    const s = spy();
    addSuspicion(s, CONFIG.suspicion.jump);
    expect(s.suspicion).toBe(10);
    expect(isExposed(s)).toBe(false);
    onFired(s);
    expect(s.suspicion).toBe(100);
    expect(isExposed(s)).toBe(true);
  });
});
