// Vision: 110° cone, 35 m range, blocked by static geometry (AABB grid) and smoke.

import { CONFIG } from '../config';
import { eyeHeight } from '../sim/movement';
import type { Agent } from '../sim/types';
import type { World } from '../sim/world';

const HALF_FOV_COS = Math.cos(((CONFIG.perception.fovDeg / 2) * Math.PI) / 180);
const RANGE = CONFIG.perception.range;

/** Is `target` inside observer's view cone and range (ignores occlusion)? */
export function inViewCone(obs: Agent, target: Agent, range: number = RANGE): boolean {
  const dx = target.x - obs.x, dz = target.z - obs.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > range * range) return false;
  if (d2 < 1) return true;
  const d = Math.sqrt(d2);
  const fx = -Math.sin(obs.yaw), fz = -Math.cos(obs.yaw);
  return (dx * fx + dz * fz) / d >= HALF_FOV_COS;
}

export function lineOfSight(w: World, obs: Agent, target: Agent): boolean {
  const ex = obs.x, ey = obs.y + eyeHeight(obs), ez = obs.z;
  const tx = target.x, ty = target.y + (target.pose === 'dead' ? 0.2 : 1.2), tz = target.z;
  if (!w.col.clearLine(ex, ey, ez, tx, ty, tz)) return false;
  return !w.smokeBlocks(ex, ey, ez, tx, ty, tz);
}

export function canSee(w: World, obs: Agent, target: Agent, range: number = RANGE): boolean {
  if (!target.alive && target.pose !== 'dead') return false;
  return inViewCone(obs, target, range) && lineOfSight(w, obs, target);
}
