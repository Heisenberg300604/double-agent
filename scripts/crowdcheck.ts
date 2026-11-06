// Navigation health on the full map: how much of the crowd is moving, stuck, or spread across areas.
import { World } from '../src/sim/world';
const w = new World({ seed: 4, withPlayer: false });
const last = new Map<number, { x: number; z: number; still: number }>();
let maxStuck = 0;
const areas: Record<string, number> = { wing: 0, hall: 0, corridors: 0, platforms: 0, balcony: 0 };
for (let i = 0; i < 60 * 240; i++) {
  w.step(1 / 60); w.drainEvents();
  if (i % 60 !== 0) continue;
  for (const a of w.agents) {
    if (!a.alive || a.pose !== 'stand') continue;
    const l = last.get(a.id) ?? { x: a.x, z: a.z, still: 0 };
    // Count seconds an agent wants to move but doesn't.
    const wants = a.hasGoal;
    l.still = wants && Math.hypot(a.x - l.x, a.z - l.z) < 0.2 ? l.still + 1 : 0;
    l.x = a.x; l.z = a.z;
    last.set(a.id, l);
    maxStuck = Math.max(maxStuck, l.still);
    if (l.still === 8) console.log('stuck', a.kind, a.id, a.x.toFixed(1), a.y.toFixed(1), a.z.toFixed(1), 'goal', a.goalX.toFixed(1), a.goalZ.toFixed(1), 'civ', a.civ?.state, 'spd', a.speed.toFixed(2));
    if (i % (60 * 30) === 0) {
      const k = a.y > 3 ? 'balcony' : a.x < -44 ? 'wing' : a.x > 24.5 ? 'platforms' : Math.abs(a.z) > 16 ? 'corridors' : 'hall';
      areas[k]++;
    }
  }
}
console.log('longest stuck (s, wanting to move):', maxStuck);
console.log('crowd distribution samples:', areas);
