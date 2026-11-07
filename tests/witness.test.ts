import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { dirToYaw } from '../src/core/vec';
import { emptyIntent, type Agent } from '../src/sim/types';
import { World } from '../src/sim/world';

const DT = 1 / CONFIG.sim.tickRate;
const S = CONFIG.suspicion;

/** Player in the open concourse; bot 1 six metres north, bot 2 six metres south. Bots idle. */
function scene(opts: { civilians?: number } = {}): { w: World; p: Agent; a: Agent; b: Agent } {
  const w = new World({ seed: 31, withPlayer: true, civilians: opts.civilians ?? 0 });
  w.brains.clear();
  const [p, a, b] = w.spies;
  for (const s of w.spies.slice(3)) { s.x = s.px = -60; s.z = s.pz = 0; }
  const put = (x: Agent, px: number, pz: number): void => { x.x = x.px = px; x.z = x.pz = pz; x.y = x.py = 0; };
  put(p, -6, 0);
  put(a, -6, -6);
  put(b, -6, 6);
  return { w, p, a, b };
}
const face = (o: Agent, t: Agent): void => { o.yaw = dirToYaw(t.x - o.x, t.z - o.z); };
const away = (o: Agent, t: Agent): void => { o.yaw = dirToYaw(o.x - t.x, o.z - t.z); };
function run(w: World, secs: number, f?: (it: ReturnType<typeof emptyIntent>) => void): void {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    const it = emptyIntent();
    it.yaw = w.player!.yaw;
    f?.(it);
    w.setPlayerIntent(it);
    w.step(DT);
    w.drainEvents();
  }
}

describe('suspicion is per observer', () => {
  it('drawing a gun where nobody can see it raises no suspicion at all', () => {
    const { w, p, a, b } = scene();
    away(a, p);
    away(b, p);
    run(w, 2, (it) => { it.aim = true; });
    expect(p.spy!.drawn).toBe(true);
    expect(w.suspicionOf(a, p)).toBe(0);
    expect(w.suspicionOf(b, p)).toBe(0);
    expect(p.spy!.suspicion).toBe(0);
    expect(p.spy!.watchers).toBe(0);
  });

  it('only the one who sees it becomes suspicious; nothing is shared', () => {
    const { w, p, a, b } = scene();
    face(a, p);
    away(b, p);
    run(w, 1, (it) => { it.aim = true; });
    expect(w.suspicionOf(a, p)).toBeGreaterThan(25);
    expect(w.suspicionOf(b, p)).toBe(0);
    // The meter shows the most suspicious witness.
    expect(p.spy!.suspicion).toBeCloseTo(w.suspicionOf(a, p), 3);
    expect(p.spy!.watchers).toBe(1);
  });

  it('a jump is noticed only by those watching', () => {
    const { w, p, a, b } = scene();
    face(a, p);
    away(b, p);
    run(w, 0.05, (it) => { it.jump = true; });
    expect(w.suspicionOf(a, p)).toBeGreaterThan(S.jump - 1);
    expect(w.suspicionOf(b, p)).toBe(0);
  });

  it('decays faster in each witness while you sit or read', () => {
    const rates: number[] = [];
    for (const mode of ['stand', 'sit'] as const) {
      const { w, p, a } = scene();
      face(a, p);
      if (mode === 'sit') {
        const seat = w.layout.pois.find((x) => x.seat && w.nav.poiNode[x.id] >= 0)!;
        p.x = p.px = seat.x; p.z = p.pz = seat.z;
        a.x = a.px = seat.x + 4; a.z = a.pz = seat.z;
        face(a, p);
        w.sitDown(p, seat.id);
      }
      a.sus[w.spyIndex[p.id]] = 100;
      run(w, 1);
      rates.push(100 - w.suspicionOf(a, p));
    }
    expect(rates[0]).toBeCloseTo(S.decay, 0);
    expect(rates[1]).toBeCloseTo(S.seatedDecay, 0);
  });

  it('a civilian who sees a drawn gun close by backs away on its own', () => {
    const { w, p } = scene({ civilians: 1 });
    const c = w.agents.find((x) => x.civ)!;
    c.x = c.px = p.x + 3; c.z = c.pz = p.z; c.y = 0;
    c.hasGoal = false;
    face(c, p);
    let panicked = false;
    for (let i = 0; i < 8 * 60 && !panicked; i++) {
      // Keep the civilian looking at the player (its brain would otherwise wander off).
      face(c, p);
      run(w, 1 / 60, (it) => { it.aim = true; });
      panicked = c.civ!.state === 'panic';
    }
    expect(panicked).toBe(true);
  });
});
