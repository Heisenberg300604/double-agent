import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { canSee } from '../src/ai/perception';
import { dirToYaw } from '../src/core/vec';
import { emptyIntent, type SimEvent } from '../src/sim/types';
import { World } from '../src/sim/world';
import { CAR_FLOOR_Y } from '../src/world/trainCars';

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
    // Walk around inside: stays within the car body.
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
  it('rides out with the train, is off the map for at most 40 s, and returns with the hunter lock cleared', () => {
    const w = new World({ seed: 4, withPlayer: true });
    const p = w.player!;
    const s = w.trains.trains[0];
    s.phase = 'dwell'; s.t = 10; s.duration = T.dwell; s.frontX = w.layout.tracks[0].stopX;
    w.board(p, 0, 0);
    // The player's hunter is sure about them.
    const hunterId = w.spies.find((x) => w.contracts.targetOf(x.id) === p.id)!.id;
    const brain = w.brains.get(hunterId)!;
    brain.belief.set(p.id, 5);
    p.spy!.suspicion = 80;

    const events: SimEvent[] = [];
    let awayAt = -1, backAt = -1;
    let invisibleWhileAway = true;
    for (let i = 0; i < 200 * 60 && backAt < 0; i++) {
      step(w, undefined, events);
      if (p.away && awayAt < 0) awayAt = w.time;
      if (awayAt >= 0 && !p.away) backAt = w.time;
      if (p.away) {
        // Nobody can see them, and they're not in the spatial hash.
        for (const o of w.spies) if (o !== p && o.alive && canSee(w, o, p, 1e6)) invisibleWhileAway = false;
        const near: number[] = [];
        w.hash.query(p.x, p.z, 400, near);
        if (near.includes(p.id)) invisibleWhileAway = false;
        expect(p.alive).toBe(true);
      }
      // Riders stay on their train.
      if (p.aboard >= 0) expect(p.x).toBeCloseTo(w.trains.trains[0].frontX + p.localX, 6);
    }
    expect(awayAt).toBeGreaterThan(0);
    expect(backAt).toBeGreaterThan(awayAt);
    expect(backAt - awayAt).toBeLessThanOrEqual(T.rideMaxOffMap + 0.1);
    expect(invisibleWhileAway).toBe(true);
    expect(events.filter((e) => e.type === 'ride').map((e) => (e as Extract<SimEvent, { type: 'ride' }>).phase)).toEqual(['board', 'away', 'return']);
    expect(p.spy!.suspicion).toBeLessThan(5);
    expect(brain.belief.get(p.id) ?? 0).toBeLessThan(1);
    // Back in the station, aboard the arriving train; doors open at dwell, then step off.
    expect(p.aboard).toBe(0);
    expect(p.x).toBeLessThan(w.layout.bounds.maxX + T.offMapBeyond + 0.5);
  });

  it('caps the off-map time for a rider in the rear car too', () => {
    const w = new World({ seed: 9, withPlayer: true, civilians: 0 });
    w.brains.clear();
    const p = w.player!;
    const s = w.trains.trains[1];
    s.phase = 'dwell'; s.t = 10; s.duration = T.dwell; s.frontX = w.layout.tracks[1].stopX;
    const doors = w.carLayouts[1].doors;
    w.board(p, 1, doors.length - 1);
    s.duration = T.dwell;
    let awayAt = -1, backAt = -1;
    for (let i = 0; i < 200 * 60 && backAt < 0; i++) {
      step(w);
      if (p.away && awayAt < 0) awayAt = w.time;
      if (awayAt >= 0 && !p.away) backAt = w.time;
    }
    expect(backAt - awayAt).toBeGreaterThan(5);
    expect(backAt - awayAt).toBeLessThanOrEqual(T.rideMaxOffMap + 0.1);
  });
});
