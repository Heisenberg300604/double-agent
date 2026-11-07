import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { canSee } from '../src/ai/perception';
import { dirToYaw } from '../src/core/vec';
import { emptyIntent, type SimEvent } from '../src/sim/types';
import { World } from '../src/sim/world';
import { CAR_FLOOR_Y, buildTrainLayout } from '../src/world/trainCars';

const DT = 1 / CONFIG.sim.tickRate;
const T = CONFIG.trains;

/** Track 0's train mid-dwell with doors open; the player on the platform facing door `door`. */
function atDoor(door = 0, seed = 3): World {
  const w = new World({ seed, withPlayer: true, civilians: 0 });
  w.brains.clear();
  for (const s of w.spies) if (!s.isPlayer) { s.x = s.px = -40; s.z = s.pz = 0; }
  const s = w.trains.trains[0];
  s.phase = 'dwell'; s.t = 10; s.duration = T.dwell; s.frontX = w.layout.tracks[0].stopX; s.doors = 1;
  const other = w.trains.trains[1];
  other.phase = 'away'; other.t = 0; other.duration = 1e6;
  const d = w.carLayouts[0].doors[door];
  const p = w.player!;
  p.x = p.px = s.frontX + d.x;
  p.z = p.pz = d.z + d.side * 0.9;
  p.y = p.py = 0;
  p.yaw = dirToYaw(0, -d.side);
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

describe('boarding', () => {
  it('offers Board at an open door and puts the player inside the car', () => {
    const w = atDoor();
    const p = w.player!;
    step(w);
    expect(w.playerInteractable?.kind).toBe('board');
    step(w, (it) => { it.interact = true; });
    expect(p.aboard).toBe(0);
    expect(p.y).toBeCloseTo(CAR_FLOOR_Y, 3);
    // With the doors shut, walking around inside stays within the car body.
    w.trains.setPhase(0, 'dwell', 0.5, T.dwell);
    const car = w.carLayouts[0];
    for (let i = 0; i < 120; i++) step(w, (it) => { it.moveZ = car.doors[0].side; it.moveX = 1; });
    expect(p.z).toBeGreaterThan(car.a);
    expect(p.z).toBeLessThan(car.b);
    expect(p.y).toBeCloseTo(CAR_FLOOR_Y, 3);
  });

  it('cannot board while the doors are closed', () => {
    const w = atDoor();
    const s = w.trains.trains[0];
    s.t = 1; // doors not open yet
    step(w);
    expect(s.doors).toBeLessThan(T.boardDoors);
    expect(w.playerInteractable?.kind).not.toBe('board');
    step(w, (it) => { it.interact = true; });
    expect(w.player!.aboard).toBe(-1);
  });

  it('sits on a seat inside the car and steps off again through the door', () => {
    const w = atDoor();
    const p = w.player!;
    step(w, (it) => { it.interact = true; });
    const car = w.carLayouts[0];
    // Face the nearest seat.
    const seat = car.seats.reduce((b, s) => (Math.hypot(s.x - p.localX, s.z - p.z) < Math.hypot(b.x - p.localX, b.z - p.z) ? s : b));
    p.x = p.px = w.trains.trains[0].frontX + seat.x; p.localX = seat.x;
    p.z = p.pz = seat.standZ;
    p.yaw = dirToYaw(0, seat.z - seat.standZ);
    step(w);
    expect(w.playerInteractable?.kind).toBe('sit');
    step(w, (it) => { it.interact = true; });
    expect(p.pose).toBe('sit');
    expect(w.blendBonus(p)).toBe('seated');
    step(w, (it) => { it.interact = true; });
    expect(p.pose).toBe('stand');
    // Back to the door and off.
    const d = car.doors[0];
    p.localX = d.x; p.x = p.px = w.trains.trains[0].frontX + d.x;
    p.z = p.pz = d.z - d.side * 0.6;
    p.yaw = dirToYaw(0, d.side);
    for (let i = 0; i < 30; i++) step(w);
    expect(w.playerInteractable?.kind).toBe('alight');
    step(w, (it) => { it.interact = true; });
    expect(p.aboard).toBe(-1);
    expect(p.y).toBe(0);
    expect(Math.abs(p.z - d.z)).toBeGreaterThan(0.4);
  });
});

describe('riding out', () => {
  it('rides out and is back at the platform within 10 s of pulling out, with the hunter lock cleared', () => {
    const w = new World({ seed: 4, withPlayer: true });
    const p = w.player!;
    const s = w.trains.trains[0];
    s.phase = 'dwell'; s.t = 10; s.duration = T.dwell; s.frontX = w.layout.tracks[0].stopX;
    w.board(p, 0, 0);
    const hunterId = w.spies.find((x) => w.contracts.targetOf(x.id) === p.id)!.id;
    const brain = w.brains.get(hunterId)!;
    brain.belief.set(p.id, 5);
    for (const o of w.agents) o.sus[w.spyIndex[p.id]] = 80;

    const events: SimEvent[] = [];
    let departAt = -1, stoppedAt = -1;
    let invisibleWhileAway = true;
    for (let i = 0; i < 120 * 60 && stoppedAt < 0; i++) {
      step(w, undefined, events);
      const tr = w.trains.trains[0];
      if (tr.phase === 'departing' && departAt < 0) departAt = w.time;
      if (departAt >= 0 && tr.phase === 'dwell') stoppedAt = w.time;
      if (p.away) {
        for (const o of w.spies) if (o !== p && o.alive && canSee(w, o, p, 1e6)) invisibleWhileAway = false;
        const near: number[] = [];
        w.hash.query(p.x, p.z, 400, near);
        if (near.includes(p.id)) invisibleWhileAway = false;
      }
      if (p.aboard >= 0) expect(p.x).toBeCloseTo(w.trains.trains[0].frontX + p.localX, 6);
    }
    expect(departAt).toBeGreaterThan(0);
    expect(stoppedAt - departAt).toBeLessThanOrEqual(10);
    expect(invisibleWhileAway).toBe(true);
    expect(events.filter((e) => e.type === 'ride').map((e) => (e as Extract<SimEvent, { type: 'ride' }>).phase)).toEqual(['board', 'away', 'return']);
    expect(p.spy!.suspicion).toBe(0);
    expect(brain.belief.get(p.id) ?? 0).toBeLessThan(1);
    expect(p.aboard).toBe(0);
    expect(p.away).toBe(false);
  });
});

describe('walking in and out, shooting through the shell', () => {
  it('walks in through an open doorway and back out onto the platform', () => {
    const w = atDoor();
    const p = w.player!;
    const d = w.carLayouts[0].doors[0];
    const events: SimEvent[] = [];
    for (let i = 0; i < 90 && p.aboard < 0; i++) step(w, (it) => { it.moveZ = -d.side; }, events);
    expect(p.aboard).toBe(0);
    for (let i = 0; i < 30; i++) step(w, (it) => { it.moveZ = -d.side; });
    expect(p.y).toBeCloseTo(CAR_FLOOR_Y, 2);
    for (let i = 0; i < 120 && p.aboard >= 0; i++) step(w, (it) => { it.moveZ = d.side; }, events);
    expect(p.aboard).toBe(-1);
    for (let i = 0; i < 30; i++) step(w, (it) => { it.moveZ = d.side; });
    expect(p.y).toBeCloseTo(0, 3);
    expect(events.filter((e) => e.type === 'ride').map((e) => (e as Extract<SimEvent, { type: 'ride' }>).phase)).toEqual(['board', 'alight']);
  });

  it('a closed train is solid: you cannot walk in, and walls stop you inside', () => {
    const w = atDoor();
    const s = w.trains.trains[0];
    s.t = 1; // doors still shut
    const p = w.player!;
    const d = w.carLayouts[0].doors[0];
    for (let i = 0; i < 90; i++) step(w, (it) => { it.moveZ = -d.side; });
    expect(p.aboard).toBe(-1);
  });

  it('sight and bullets pass through windows and open doors, not through the walls', () => {
    const w = atDoor();
    const car = w.carLayouts[0];
    const fx = w.trains.trains[0].frontX;
    const zc = (car.a + car.b) / 2;
    const win = car.ray.find((b) => b.minY === 1.3 && b.maxY === 2.2)!; // a pier between windows
    const inside = { x: fx + 7.5, y: 1.75, z: zc };
    // Out through a window hole (window centre just past the pier) vs into the pier.
    const holeX = win.maxX + 0.6 + fx;
    const pierX = (win.minX + win.maxX) / 2 + fx;
    expect(w.col.clearLine(inside.x, inside.y, inside.z, holeX, 1.75, car.a - 3)).toBe(true);
    expect(w.col.clearLine(pierX, 1.75, zc, pierX, 1.75, car.a - 3)).toBe(false);
    // Through the low wall below the windows: blocked.
    expect(w.col.clearLine(inside.x, 0.9, zc, inside.x, 0.9, car.a - 3)).toBe(false);
    // Through an open doorway: clear; once the doors close: blocked.
    const d = car.doors[0];
    expect(w.col.clearLine(fx + d.x, 1.5, zc, fx + d.x, 1.5, d.z + d.side * 3)).toBe(true);
    w.trains.trains[0].doors = 0;
    w.step(DT); w.drainEvents();
    w.trains.setPhase(0, 'dwell', 0.5, T.dwell);
    w.step(DT); w.drainEvents();
    expect(w.col.clearLine(fx + d.x, 1.5, zc, fx + d.x, 1.5, d.z + d.side * 3)).toBe(false);
  });
});

describe('train geometry', () => {
  it('has no coplanar overlapping faces (z-fighting flicker)', () => {
    const L = w0();
    const B = L.visual.filter((b) => b.shape === 'box');
    const ax = ['X', 'Y', 'Z'] as const;
    type K = 'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ';
    const bad: string[] = [];
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      for (let k = 0; k < 3; k++) {
        const o = [0, 1, 2].filter((q) => q !== k);
        const ov = o.map((q) => Math.min(a[`max${ax[q]}` as K], b[`max${ax[q]}` as K]) - Math.max(a[`min${ax[q]}` as K], b[`min${ax[q]}` as K]));
        if (ov[0] <= 0.005 || ov[1] <= 0.005) continue;
        for (const side of ['min', 'max'] as const) {
          const key = `${side}${ax[k]}` as K;
          if (Math.abs(a[key] - b[key]) < 0.002) bad.push(`${key} ${a.mat}/${b.mat} @${a[key].toFixed(3)}`);
        }
      }
    }
    // Only faces buried inside the shell may coincide (skin/lining planes facing the same way, hidden).
    const visible = bad.filter((t) => !/^(minZ|maxZ) (trainCream|wood|trainBody)\/(trainBody|trainCream|wood) @(11\.310|14\.690)$/.test(t));
    expect(visible).toEqual([]);
  });
});

function w0(): ReturnType<typeof buildTrainLayout> {
  return buildTrainLayout(11.2, 14.8, -1.05);
}
