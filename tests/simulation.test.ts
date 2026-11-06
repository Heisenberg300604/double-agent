import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { bodyHeight } from '../src/sim/movement';
import { emptyIntent } from '../src/sim/types';
import { World } from '../src/sim/world';

const DT = 1 / CONFIG.sim.tickRate;

interface MatchStats {
  kills: number;
  targetKills: number;
  civKills: number;
  playerDeaths: number;
  violations: string[];
  ticks: number;
}

function runMatch(seed: number, withPlayer: boolean): { w: World; stats: MatchStats } {
  const w = new World({ seed, withPlayer });
  const b = w.layout.bounds;
  const stats: MatchStats = { kills: 0, targetKills: 0, civKills: 0, playerDeaths: 0, violations: [], ticks: 0 };
  const idle = emptyIntent();
  while (!w.over) {
    if (withPlayer) w.setPlayerIntent(idle);
    w.step(DT);
    stats.ticks++;
    for (const e of w.drainEvents()) {
      if (e.type !== 'kill') continue;
      stats.kills++;
      if (e.relation === 'target') stats.targetKills++;
      if (e.relation === 'civilian') stats.civKills++;
      if (w.player && e.victim === w.player.id) stats.playerDeaths++;
    }
    if (!w.contracts.isValid()) stats.violations.push(`chain invalid at tick ${stats.ticks}`);
    if (stats.ticks % 30 !== 0) continue;
    for (const a of w.agents) {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)) stats.violations.push(`NaN agent ${a.id}`);
      if (a.x < b.minX || a.x > b.maxX || a.z < b.minZ || a.z > b.maxZ || a.y < -0.01 || a.y > 6) stats.violations.push(`out of bounds ${a.id} ${a.x},${a.y},${a.z}`);
      if (a.alive && a.pose === 'stand' && !w.col.circleFree(a.x, a.z, a.y, 0.12, bodyHeight(a))) {
        stats.violations.push(`inside wall ${a.id} ${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`);
      }
    }
    if (stats.violations.length > 20) break;
  }
  return { w, stats };
}

describe('headless simulation', () => {
  it('plays a full 8-minute match with 8 bots: kills happen, nobody leaves the map or enters walls, chain stays valid', () => {
    const { w, stats } = runMatch(12345, false);
    expect(stats.violations).toEqual([]);
    expect(w.over).toBe(true);
    expect(stats.ticks).toBe(CONFIG.match.roundSeconds * CONFIG.sim.tickRate);
    expect(stats.kills).toBeGreaterThan(0);
    expect(stats.targetKills).toBeGreaterThan(0);
    // Scores add up: every spy's score is consistent with the ranking order.
    const ranked = w.spyRanking();
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].spy!.score).toBeGreaterThanOrEqual(ranked[i].spy!.score);
  });

  it('is deterministic for a given seed', () => {
    const a = runMatch(777, false).w;
    const b = runMatch(777, false).w;
    expect(a.spies.map((s) => s.spy!.score)).toEqual(b.spies.map((s) => s.spy!.score));
    expect(a.agents.map((s) => s.x.toFixed(4))).toEqual(b.agents.map((s) => s.x.toFixed(4)));
  });

  it('bots hunt the player: a passive player gets eliminated', () => {
    let deaths = 0;
    for (const seed of [3, 4]) {
      const { stats } = runMatch(seed, true);
      expect(stats.violations).toEqual([]);
      deaths += stats.playerDeaths;
    }
    expect(deaths).toBeGreaterThan(0);
  });
});

describe('player movement', () => {
  /** Drive the player with real intents along the nav path to a goal. */
  function walkTo(w: World, gx: number, gy: number, gz: number, maxSeconds: number): boolean {
    const p = w.player!;
    const intent = emptyIntent();
    const from = w.nav.nearestNode(p.x, p.y, p.z, w.col);
    const path = w.nav.findPath(from, w.nav.nearestNode(gx, gy, gz))!;
    let i = 0;
    for (let t = 0; t < maxSeconds * 60; t++) {
      const n = i < path.length ? w.nav.nodes[path[i]] : { x: gx, y: gy, z: gz };
      const dx = n.x - p.x, dz = n.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) {
        if (i >= path.length) return Math.abs(p.y - gy) < 0.3;
        i++;
        continue;
      }
      intent.moveX = dx / d;
      intent.moveZ = dz / d;
      intent.mode = 'run';
      w.setPlayerIntent(intent);
      w.step(DT);
      w.drainEvents();
    }
    return false;
  }

  it('can walk from the café, up the west stairs onto the balcony, across and down to the platforms', () => {
    const w = new World({ seed: 5, withPlayer: true, civilians: 0, spies: 8 });
    for (const s of w.spies) if (!s.isPlayer) { s.x = 39; s.z = 24; } // keep bots out of the way
    const p = w.player!;
    p.x = p.px = -33; p.z = p.pz = -9; p.y = 0;
    expect(walkTo(w, -10, 5, 12, 60)).toBe(true);
    expect(p.y).toBeCloseTo(5, 1);
    expect(walkTo(w, 6, 5, 12, 60)).toBe(true);
    expect(walkTo(w, 30, 0, -20, 90)).toBe(true);
    expect(p.y).toBeCloseTo(0, 1);
  });

  it('cannot walk through a wall', () => {
    const w = new World({ seed: 6, withPlayer: true, civilians: 0 });
    const p = w.player!;
    p.x = -5; p.z = 13.5; p.y = 0; // under the balcony, facing the north inner wall (no arch here)
    const intent = emptyIntent();
    intent.moveZ = 1;
    for (let t = 0; t < 180; t++) {
      w.setPlayerIntent(intent);
      w.step(DT);
    }
    expect(p.z).toBeLessThan(14.5 - CONFIG.body.radius + 0.01);
  });

  it('jumping raises suspicion by 10', () => {
    const w = new World({ seed: 8, withPlayer: true, civilians: 0 });
    const intent = emptyIntent();
    intent.jump = true;
    w.setPlayerIntent(intent);
    w.step(DT);
    expect(w.player!.spy!.suspicion).toBeGreaterThan(9);
  });
});
