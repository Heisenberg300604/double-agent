import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { dirToYaw } from '../src/core/vec';
import { findInteractable, interactLabel } from '../src/sim/interact';
import { emptyIntent } from '../src/sim/types';
import { World } from '../src/sim/world';
import { pickPoi } from '../src/ai/civilianBrain';

const DT = 1 / CONFIG.sim.tickRate;

/** A world with the player alone (bots parked far away) in front of the given POI, looking at it. */
function setup(kind: 'bench' | 'news' | 'board', seed = 11): { w: World; poi: number } {
  const w = new World({ seed, withPlayer: true, civilians: 0 });
  for (const s of w.spies) if (!s.isPlayer) { s.x = s.px = 95; s.z = s.pz = 24; }
  const poi = w.layout.pois.findIndex((p) => p.kind === kind && w.nav.poiNode[p.id] >= 0);
  expect(poi).toBeGreaterThanOrEqual(0);
  const p = w.layout.pois[poi];
  const player = w.player!;
  player.x = player.px = p.x;
  player.y = player.py = p.y;
  player.z = player.pz = p.z;
  const tx = p.seat ? p.seat.x : p.x, tz = p.seat ? p.seat.z : p.z;
  player.yaw = dirToYaw(tx - p.x, tz - p.z);
  return { w, poi };
}

function tick(w: World, mutate?: (it: ReturnType<typeof emptyIntent>) => void): void {
  const it = emptyIntent();
  it.yaw = w.player!.yaw;
  mutate?.(it);
  w.setPlayerIntent(it);
  w.step(DT);
  w.drainEvents();
}

describe('interactables', () => {
  it('finds the seat in front of the player and nothing when facing away', () => {
    const { w, poi } = setup('bench');
    const p = w.player!;
    expect(findInteractable(w, p)).toEqual({ kind: 'sit', poi });
    expect(interactLabel({ kind: 'sit', poi }, w)).toBe('Sit');
    p.yaw += Math.PI;
    expect(findInteractable(w, p)).toBeNull();
  });

  it('ignores seats that are already taken', () => {
    const { w, poi } = setup('bench');
    w.poiOccupant[poi] = 3;
    expect(findInteractable(w, w.player!)).toBeNull();
    expect(w.sitDown(w.player!, poi)).toBe(false);
  });

  it('offers the newspaper stand as an activity', () => {
    const { w, poi } = setup('news');
    expect(findInteractable(w, w.player!)).toEqual({ kind: 'activity', poi });
    expect(interactLabel({ kind: 'activity', poi }, w)).toBe('Read the paper');
  });
});

describe('sitting', () => {
  it('claims the seat with G, so civilians never pick it, and releases it on standing up', () => {
    const { w, poi } = setup('bench');
    const p = w.player!;
    tick(w, (it) => { it.interact = true; });
    expect(p.pose).toBe('sit');
    expect(w.poiOccupant[poi]).toBe(p.id);
    expect(w.playerInteractable).toEqual({ kind: 'stand', poi });
    const seat = w.layout.pois[poi].seat!;
    expect(p.x).toBeCloseTo(seat.x, 3);
    expect(p.z).toBeCloseTo(seat.z, 3);

    // A civilian choosing a POI from anywhere never lands on the player's seat.
    const civ = w.agents.find((a) => a.civ);
    expect(civ).toBeUndefined(); // no civilians in this world; emulate with a bot
    const bot = w.spies[1];
    for (let i = 0; i < 40; i++) {
      pickPoi(w, bot);
      expect(bot.occupiedPoi).not.toBe(poi);
      w.releasePoi(bot);
    }

    tick(w, (it) => { it.interact = true; });
    expect(p.pose).toBe('stand');
    expect(w.poiOccupant[poi]).toBe(-1);
    expect(p.occupiedPoi).toBe(-1);
  });

  it('cannot move while seated; a movement key stands up with a short lock', () => {
    const { w } = setup('bench');
    const p = w.player!;
    tick(w, (it) => { it.interact = true; });
    const x0 = p.x, z0 = p.z;
    // Jump/strafe while seated: stands up, but the lock keeps them in place for 0.4 s.
    tick(w, (it) => { it.moveX = 1; });
    expect(p.pose).toBe('stand');
    expect(p.standLock).toBeGreaterThan(0);
    for (let i = 0; i < 12; i++) tick(w, (it) => { it.moveX = 1; });
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeLessThan(1.2);
    expect(p.speed).toBe(0);
    for (let i = 0; i < 40; i++) tick(w, (it) => { it.moveX = 1; });
    expect(p.speed).toBeGreaterThan(1);
  });

  it('lets a seated player draw and fire, but drawing cancels a standing activity', () => {
    const seated = setup('bench');
    tick(seated.w, (it) => { it.interact = true; });
    for (let i = 0; i < 20; i++) tick(seated.w, (it) => { it.aim = true; });
    expect(seated.w.player!.pose).toBe('sit');
    expect(seated.w.player!.spy!.drawn).toBe(true);

    const busy = setup('news');
    tick(busy.w, (it) => { it.interact = true; });
    expect(busy.w.player!.activity).toBe('read');
    tick(busy.w, (it) => { it.aim = true; });
    expect(busy.w.player!.activity).toBe('none');
    expect(busy.w.poiOccupant[busy.poi]).toBe(-1);
  });

  it('the blending bonus (faster decay) applies while seated or busy, then caps', () => {
    const sitting = setup('bench');
    const reading = setup('news');
    tick(sitting.w, (it) => { it.interact = true; });
    tick(reading.w, (it) => { it.interact = true; });
    expect(sitting.w.blendBonus(sitting.w.player!)).toBe('seated');
    expect(reading.w.blendBonus(reading.w.player!)).toBe('activity');
    for (let i = 0; i < CONFIG.interact.blendBonusSeconds * 60 + 10; i++) tick(sitting.w);
    expect(sitting.w.blendBonus(sitting.w.player!)).toBe('none');
    expect(sitting.w.player!.pose).toBe('sit');
  });
});

describe('bots blend in', () => {
  it('AI spies sit on seats and do standing activities during a match', () => {
    const w = new World({ seed: 21, withPlayer: false });
    let sat = 0, busy = 0;
    for (let t = 0; t < CONFIG.match.roundSeconds * 60; t++) {
      w.step(DT);
      w.drainEvents();
      if (t % 30) continue;
      for (const s of w.spies) {
        if (s.pose === 'sit') sat++;
        if (s.activity !== 'none') busy++;
      }
    }
    expect(sat).toBeGreaterThan(0);
    expect(busy).toBeGreaterThan(0);
  });
});
