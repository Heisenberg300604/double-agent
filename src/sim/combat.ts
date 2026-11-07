// Hitscan pistol: raycast against per-agent hitboxes (head sphere + body box)
// and the static AABB grid. Never touches render meshes.

import { CONFIG } from '../config';
import { lookDir, v3 } from '../core/vec';
import type { RayHit } from '../world/collision';
import { bodyHeight, eyeHeight } from './movement';
import type { Agent } from './types';
import type { World } from './world';

const B = CONFIG.body;
const dir = v3();
const wallHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };

export interface AgentRayHit {
  agent: number;
  t: number;
  headshot: boolean;
}

function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  let tmin = 0, tmax = Infinity;
  const axes: [number, number, number, number][] = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/** Head centre height above feet for the agent's current pose. */
export function headCenterY(a: Agent): number {
  return a.y + bodyHeight(a) - 0.16 * a.appearance.scale;
}

/** Nearest agent hit along a ray (excluding `ignore`), within maxT. */
export function raycastAgents(w: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, ignore: number): AgentRayHit | null {
  let best: AgentRayHit | null = null;
  let bestT = maxT;
  for (const a of w.agents) {
    if (!a.alive || a.away || a.id === ignore) continue;
    // Quick reject: distance from agent axis to the ray in XZ.
    const px = a.x - ox, pz = a.z - oz;
    const along = px * dx + pz * dz;
    if (along < -1) continue;
    const hl = Math.hypot(dx, dz) || 1e-6;
    const perp = Math.abs(px * dz - pz * dx) / hl;
    if (perp > 1.2) continue;
    const hy = headCenterY(a);
    const th = raySphere(ox, oy, oz, dx, dy, dz, a.x, hy, a.z, B.headRadius * a.appearance.scale);
    const hw = B.bodyHalfWidth;
    const tb = rayBox(ox, oy, oz, dx, dy, dz, a.x - hw, a.y, a.z - hw, a.x + hw, hy - B.headRadius, a.z + hw);
    const t = Math.min(th, tb);
    if (t < bestT) {
      bestT = t;
      best = { agent: a.id, t, headshot: th <= tb };
    }
  }
  return best;
}

/** Fire the shooter's pistol along their yaw/pitch. */
export function fireShot(w: World, shooter: Agent): void {
  // Everyone who sees the shot knows; nobody else learns anything.
  w.witnessAct(shooter, CONFIG.suspicion.max);
  const ox = shooter.x, oy = shooter.y + eyeHeight(shooter), oz = shooter.z;
  lookDir(shooter.yaw, shooter.pitch, dir);
  const range = CONFIG.weapon.range;
  const tWall = w.col.raycast(ox, oy, oz, dir.x, dir.y, dir.z, range, wallHit);
  const hit = raycastAgents(w, ox, oy, oz, dir.x, dir.y, dir.z, tWall, shooter.id);
  const t = hit ? hit.t : tWall;
  const hx = ox + dir.x * t, hy = oy + dir.y * t, hz = oz + dir.z * t;
  // Tracer starts slightly in front of the shooter (muzzle).
  w.emit({
    type: 'shot', shooter: shooter.id,
    fromX: ox + dir.x * 0.6, fromY: oy - 0.12 + dir.y * 0.6, fromZ: oz + dir.z * 0.6,
    toX: hx, toY: hy, toZ: hz,
    hitAgent: hit ? hit.agent : -1, headshot: hit ? hit.headshot : false,
  });
  w.addNoise(shooter.x, shooter.y, shooter.z, 'shot', shooter.id);
  if (hit) {
    applyDamage(w, w.agents[hit.agent], shooter, hit.headshot);
  } else if (tWall < range) {
    w.emit({ type: 'impact', x: hx, y: hy, z: hz, nx: wallHit.nx, ny: wallHit.ny, nz: wallHit.nz });
  }
}

export function applyDamage(w: World, victim: Agent, attacker: Agent, headshot: boolean): void {
  if (!victim.alive) return;
  const amount = headshot ? CONFIG.health.head : CONFIG.health.body;
  victim.health -= amount;
  w.emit({ type: 'damage', victim: victim.id, attacker: attacker.id, amount, headshot });
  if (victim.spy) {
    victim.spy.lastAttacker = attacker.id;
    victim.spy.lastAttackTime = w.time;
  }
  if (victim.health <= 0) {
    w.killAgent(victim, attacker, headshot);
  } else if (victim.civ) {
    w.panicCivilian(victim, attacker.x, attacker.z);
  }
}
