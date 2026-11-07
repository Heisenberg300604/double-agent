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
      for (const tr of w.layout.tracks) {
        if (a.alive && a.z > tr.z0 + 0.05 && a.z < tr.z1 - 0.05 && a.x > w.layout.tracks[0].stopX - 2) stats.violations.push(`on the tracks ${a.id} ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
      }
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

  it('can walk from the café, up the stairs onto the balcony, across, down to the far platform and back to the waiting room', () => {
    const w = new World({ seed: 5, withPlayer: true, civilians: 0, spies: 8 });
    const L = w.layout.landmarks;
    for (const s of w.spies) if (!s.isPlayer) { s.x = 90; s.z = 24; } // keep bots out of the way
    w.brains.clear(); // and idle: this test is about movement, not about surviving a hunt
    const p = w.player!;
    p.x = p.px = L.cafe.x; p.z = p.pz = L.cafe.z; p.y = 0;
    expect(walkTo(w, L.balcony.x, L.balcony.y, L.balcony.z, 60)).toBe(true);
    expect(p.y).toBeCloseTo(5, 1);
    expect(walkTo(w, 6, 5, 12.5, 60)).toBe(true);
    expect(walkTo(w, L.platformFar.x, 0, L.platformFar.z, 120)).toBe(true);
    expect(p.y).toBeCloseTo(0, 1);
    expect(walkTo(w, L.waitingRoom.x, 0, L.waitingRoom.z, 150)).toBe(true);
  });

  it('walks at the configured speeds regardless of how ticks are batched into frames', () => {
    for (const [mode, speed] of [['walk', CONFIG.movement.walkSpeed], ['run', CONFIG.movement.runSpeed]] as const) {
      const w = new World({ seed: 9, withPlayer: true, civilians: 0 });
      const p = w.player!;
      p.x = p.px = 0; p.z = p.pz = -2; p.y = 0;
      const intent = emptyIntent();
      intent.moveX = -1;
      intent.mode = mode;
      for (let t = 0; t < 60; t++) { w.setPlayerIntent(intent); w.step(DT); }
      const x0 = p.x;
      for (let t = 0; t < 120; t++) { w.setPlayerIntent(intent); w.step(DT); }
      expect(Math.abs(p.x - x0) / 2).toBeCloseTo(speed, 1);
    }
  });

  it('cannot step onto the track beds', () => {
    const w = new World({ seed: 7, withPlayer: true, civilians: 0 });
    const p = w.player!;
    const tr = w.layout.tracks[1];
    p.x = p.px = 60; p.z = p.pz = tr.z1 + 1.5; p.y = 0;
    const intent = emptyIntent();
    intent.moveZ = -1;
    for (let t = 0; t < 240; t++) { w.setPlayerIntent(intent); w.step(DT); }
    expect(p.z).toBeGreaterThan(tr.z1);
  });

  it('cannot walk through a wall', () => {
    const w = new World({ seed: 6, withPlayer: true, civilians: 0 });
    const p = w.player!;
    const probe = w.layout.landmarks.wallProbe; // under the balcony, facing the north inner wall (no arch here)
    p.x = probe.x; p.z = probe.z; p.y = 0;
    const wallZ = probe.z + 1.5;
    const intent = emptyIntent();
    intent.moveZ = 1;
    for (let t = 0; t < 180; t++) {
      w.setPlayerIntent(intent);
      w.step(DT);
    }
    expect(p.z).toBeLessThan(wallZ - CONFIG.body.radius + 0.01);
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
