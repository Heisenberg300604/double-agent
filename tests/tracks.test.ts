import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { lineOfSight } from '../src/ai/perception';
import { findEdge, onTrackBed } from '../src/sim/interact';
import { emptyIntent, type SimEvent } from '../src/sim/types';
import { World } from '../src/sim/world';

const DT = 1 / CONFIG.sim.tickRate;

/** Player alone (bots idle and parked), on the bed of track 1 at x, facing north (+z, toward platform 2's edge at z1). */
function onBed(x = 60, seed = 7): World {
  const w = new World({ seed, withPlayer: true, civilians: 0 });
  w.brains.clear();
  for (const s of w.spies) if (!s.isPlayer) { s.x = s.px = 0; s.z = s.pz = -24; }
  const tr = w.layout.tracks[1];
  const p = w.player!;
  p.x = p.px = x;
  p.z = p.pz = (tr.z0 + tr.z1) / 2;
  p.y = p.py = tr.bedY;
  p.yaw = Math.PI; // facing +z
  // Keep trains out of the way unless a test wants them.
  for (const s of w.trains.trains) { s.phase = 'away'; s.t = 0; s.duration = 1e6; s.frontX = 400; }
  return w;
}

function step(w: World, f?: (it: ReturnType<typeof emptyIntent>) => void, events?: SimEvent[]): void {
  const it = emptyIntent();
  it.yaw = w.player!.yaw;
  f?.(it);
  w.setPlayerIntent(it);
  w.step(DT);
  const ev = w.drainEvents();
  events?.push(...ev);
}

describe('track bed', () => {
  it('a plain jump cannot reach the platform', () => {
    const w = onBed();
    const p = w.player!;
    const tr = w.layout.tracks[1];
    // Walk to the north edge, then jump repeatedly into it.
    for (let i = 0; i < 90; i++) step(w, (it) => { it.moveZ = 1; });
    // Jumping into the wall (Space with no climb target is a jump; here it climbs, so test the raw jump height).
    expect(CONFIG.movement.jumpVelocity ** 2 / (2 * CONFIG.movement.gravity)).toBeLessThan(-tr.bedY - CONFIG.body.stepHeight);
    expect(onTrackBed(w, p)).toBe(true);
    expect(p.z).toBeLessThan(tr.z1);
  });

  it('mantles up at the edge with Space or G, at any point along the platform', () => {
    for (const x of [32, 45, 60, 75, 90]) {
      const w = onBed(x);
      const p = w.player!;
      const tr = w.layout.tracks[1];
      for (let i = 0; i < 60; i++) step(w, (it) => { it.moveZ = 1; });
      const edge = findEdge(w, p);
      expect(edge?.kind, `edge at x=${x}`).toBe('climb');
      expect(w.playerInteractable?.kind).toBe('climb');
      step(w, (it) => { it.jump = true; });
      expect(p.mantleT).toBeGreaterThan(0);
      for (let i = 0; i < CONFIG.tracks.mantleTime * 60 + 5; i++) step(w);
      expect(p.y).toBeCloseTo(0, 3);
      expect(p.z).toBeGreaterThan(tr.z1);
      expect(onTrackBed(w, p)).toBe(false);
    }
  });

  it('drops down from the platform edge with G', () => {
    const w = onBed();
    const p = w.player!;
    const tr = w.layout.tracks[1];
    p.z = p.pz = tr.z1 + 0.6;
    p.y = p.py = 0;
    p.yaw = 0; // facing -z, toward the bed
    step(w);
    expect(w.playerInteractable?.kind).toBe('drop');
    step(w, (it) => { it.interact = true; });
    for (let i = 0; i < 40; i++) step(w);
    expect(onTrackBed(w, p)).toBe(true);
    expect(p.y).toBeCloseTo(tr.bedY, 2);
  });

  it('raises suspicion while on the tracks', () => {
    const w = onBed();
    for (let i = 0; i < 60; i++) step(w);
    expect(w.player!.spy!.suspicion).toBeCloseTo(CONFIG.suspicion.onTracks, 0);
  });

  it('a crouched player on the bed is hidden from people on the platform; standing, they are seen', () => {
    const w = onBed(60);
    const p = w.player!;
    const tr = w.layout.tracks[1];
    const obs = w.spies[1];
    obs.x = 60; obs.z = tr.z1 + 12; obs.y = 0;
    p.crouch = true;
    expect(lineOfSight(w, obs, p)).toBe(false);
    p.crouch = false;
    expect(lineOfSight(w, obs, p)).toBe(true);
    // Someone right at the edge looking down still sees a crouched body.
    p.crouch = true;
    obs.z = tr.z1 + 0.8;
    expect(lineOfSight(w, obs, p)).toBe(true);
  });
});

describe('trains on the bed', () => {
  it('a moving train kills an agent on its bed (no points), and respawn follows', () => {
    const w = onBed(40);
    const p = w.player!;
    const s = w.trains.trains[1];
    s.phase = 'arriving'; s.t = 0; s.duration = CONFIG.trains.arriveTime;
    const events: SimEvent[] = [];
    let died = -1;
    for (let i = 0; i < CONFIG.trains.arriveTime * 60 && died < 0; i++) {
      step(w, undefined, events);
      if (!p.alive) died = i;
    }
    expect(died).toBeGreaterThan(0);
    const kill = events.find((e) => e.type === 'kill');
    expect(kill).toMatchObject({ type: 'kill', cause: 'train', victim: p.id, killer: -1, points: 0 });
    expect(events.some((e) => e.type === 'trainHorn')).toBe(true);
    expect(w.spies.every((x) => x.spy!.score === 0)).toBe(true);
    for (let i = 0; i < (CONFIG.match.respawnSeconds + 0.2) * 60; i++) step(w);
    expect(p.alive).toBe(true);
  });

  it('a stationary (dwell) train is solid and harmless', () => {
    const w = onBed(60);
    const p = w.player!;
    const s = w.trains.trains[1];
    s.phase = 'dwell'; s.t = 10; s.duration = 1e6; s.frontX = w.layout.tracks[1].stopX;
    // Start just east of the train's rear end and walk west into it.
    const rear = s.frontX + 4 * CONFIG.trains.carLength + 3 * CONFIG.trains.carGap;
    p.x = p.px = rear + 2;
    for (let i = 0; i < 120; i++) step(w, (it) => { it.moveX = -1; });
    expect(p.alive).toBe(true);
    expect(p.x).toBeGreaterThan(rear);
    // No drop prompt where the train stands.
    p.x = p.px = 50; p.z = p.pz = w.layout.tracks[1].z1 + 0.6; p.y = p.py = 0; p.yaw = 0;
    step(w);
    expect(w.playerInteractable?.kind).not.toBe('drop');
  });
});
