// Civilian state machine (thinks at 10 Hz): Wander → Idle at a POI → Wander,
// interrupted by Panic when a shot or a body drops nearby.

import { CONFIG } from '../config';
import type { Agent } from '../sim/types';
import type { World } from '../sim/world';
import { clearGoal, setGoal } from './steering';

const C = CONFIG.civilian;

/** Choose a free POI and path to it. Shared with blending spies. */
export function pickPoi(w: World, a: Agent, preferNear = 0): boolean {
  for (let tries = 0; tries < 8; tries++) {
    const p = w.nav.pois[w.rng.int(w.nav.pois.length)];
    if (w.poiOccupant[p.id] >= 0) continue;
    if (p.kind === 'chat' && !w.rng.chance(C.chatChance * 2)) continue;
    if (preferNear > 0 && Math.hypot(p.x - a.x, p.z - a.z) > preferNear) continue;
    if (setGoal(w, a, p.x, p.y, p.z, w.nav.poiNode[p.id])) {
      w.claimPoi(a, p.id);
      return true;
    }
  }
  // Fallback: a random node.
  const node = w.nav.nodes[w.rng.int(w.nav.nodes.length)];
  return setGoal(w, a, node.x, node.y, node.z);
}

export function standUp(w: World, a: Agent): void {
  if (a.pose === 'sit') {
    a.pose = 'stand';
    const p = a.occupiedPoi >= 0 ? w.layout.pois[a.occupiedPoi] : null;
    if (p) {
      a.x = p.x;
      a.y = p.y;
      a.z = p.z;
    }
  }
}

/** Arrived at the claimed POI: start the activity. Returns idle duration. */
export function startActivity(w: World, a: Agent, minT: number, maxT: number): number {
  const p = a.occupiedPoi >= 0 ? w.layout.pois[a.occupiedPoi] : null;
  a.faceYaw = p ? p.yaw : NaN;
  if (p && p.seat && w.rng.chance(C.sitChance)) {
    a.pose = 'sit';
    a.seatX = p.seat.x;
    a.seatY = p.seat.y;
    a.seatZ = p.seat.z;
  }
  return w.rng.range(minT, maxT);
}

export function civilianThink(w: World, a: Agent, dt: number): void {
  const c = a.civ!;
  if (!a.alive) return;
  c.timer -= dt;
  switch (c.state) {
    case 'wander':
      if (!a.hasGoal) {
        if (a.occupiedPoi >= 0 && Math.hypot(a.x - w.layout.pois[a.occupiedPoi].x, a.z - w.layout.pois[a.occupiedPoi].z) < 1.2) {
          c.state = 'idle';
          c.timer = startActivity(w, a, C.idleMin, C.idleMax);
        } else {
          w.releasePoi(a);
          a.faceYaw = NaN;
          pickPoi(w, a);
        }
      }
      break;
    case 'idle':
      if (c.timer <= 0) {
        standUp(w, a);
        w.releasePoi(a);
        a.faceYaw = NaN;
        c.state = 'wander';
        pickPoi(w, a);
      }
      break;
    case 'panic':
      if (c.timer <= 0 || !a.hasGoal) {
        c.state = 'wander';
        a.maxSpeed = w.rng.range(C.minSpeed, C.maxSpeed);
        clearGoal(a);
      }
      break;
  }
}

/** Run away from a noise source. */
export function panic(w: World, a: Agent, sx: number, sz: number): void {
  const c = a.civ!;
  if (!a.alive) return;
  standUp(w, a);
  w.releasePoi(a);
  a.faceYaw = NaN;
  c.state = 'panic';
  c.timer = w.rng.range(C.panicMin, C.panicMax);
  a.maxSpeed = C.panicSpeed;
  // Choose the reachable node that best moves us away from the source.
  let best = -1, bestScore = -Infinity;
  for (let i = 0; i < 14; i++) {
    const ni = w.rng.int(w.nav.nodes.length);
    const n = w.nav.nodes[ni];
    const dSelf = Math.hypot(n.x - a.x, n.z - a.z);
    if (dSelf > 28 || Math.abs(n.y - a.y) > 2) continue;
    const away = Math.hypot(n.x - sx, n.z - sz);
    const score = away - dSelf * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = ni;
    }
  }
  if (best >= 0) {
    const n = w.nav.nodes[best];
    setGoal(w, a, n.x, n.y, n.z, best);
  }
}
