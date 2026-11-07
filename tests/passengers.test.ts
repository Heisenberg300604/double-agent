import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { World } from '../src/sim/world';

const DT = 1 / CONFIG.sim.tickRate;

describe('civilian passengers', () => {
  it('step off arriving trains, board departing ones, and the agent count never changes', () => {
    const w = new World({ seed: 13, withPlayer: false });
    const total = w.agents.length;
    const riding = (): number => w.agents.filter((a) => a.civ && a.away).length;
    expect(riding()).toBe(CONFIG.trains.startPassengers * w.layout.tracks.length);
    let alighted = 0, boarded = 0;
    let prev = new Set(w.agents.filter((a) => a.away).map((a) => a.id));
    for (let t = 0; t < 240 * 60; t++) {
      w.step(DT);
      w.drainEvents();
      if (t % 30) continue;
      const now = new Set(w.agents.filter((a) => a.away).map((a) => a.id));
      for (const id of prev) if (!now.has(id)) {
        alighted++;
        // Stepped off onto a platform, not the tracks.
        const a = w.agents[id];
        expect(w.col.pitAt(a.x, a.z)).toBeNull();
        expect(a.y).toBe(0);
      }
      for (const id of now) if (!prev.has(id)) boarded++;
      prev = now;
      expect(w.agents.length).toBe(total);
    }
    expect(alighted).toBeGreaterThan(0);
    expect(boarded).toBeGreaterThan(0);
  });

  it('riding passengers are invisible and inactive', () => {
    const w = new World({ seed: 13, withPlayer: false });
    const rider = w.agents.find((a) => a.civ && a.away)!;
    const x = rider.x, z = rider.z;
    for (let t = 0; t < 120; t++) { w.step(DT); w.drainEvents(); }
    if (rider.away) {
      expect(rider.x).toBe(x);
      expect(rider.z).toBe(z);
      const near: number[] = [];
      w.hash.query(rider.x, rider.z, 50, near);
      expect(near).not.toContain(rider.id);
    }
  });
});
