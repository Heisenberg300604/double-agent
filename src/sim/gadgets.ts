// Scanner, disguise and smoke. Cooldown based.

import { CONFIG } from '../config';
import { lookDir, v3 } from '../core/vec';
import { disguisedAppearance } from './appearance';
import { eyeHeight } from './movement';
import type { Agent, Smoke } from './types';
import type { World } from './world';

const G = CONFIG.gadgets;
const tmp = v3();

export type DistanceBand = 'near' | 'mid' | 'far';

export interface ScanInfo {
  dx: number;
  dz: number;
  dist: number;
  band: DistanceBand;
  dy: number;
}

export function bandOf(d: number): DistanceBand {
  return d < G.scanner.near ? 'near' : d < G.scanner.mid ? 'mid' : 'far';
}

/** Direction + band toward the spy's current target (null if none). */
export function scanInfo(w: World, a: Agent): ScanInfo | null {
  const t = w.contracts.targetOf(a.id);
  if (t < 0) return null;
  const b = w.agents[t];
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz) || 1e-6;
  return { dx: dx / d, dz: dz / d, dist: d, band: bandOf(d), dy: b.y - a.y };
}

export function useScanner(w: World, a: Agent): boolean {
  const s = a.spy!;
  if (!a.alive || s.cdScanner > 0) return false;
  s.cdScanner = G.scanner.cooldown;
  s.scanTimer = G.scanner.duration;
  w.witnessAct(a, G.scanner.suspicion);
  w.emit({ type: 'scanner', spy: a.id, x: a.x, y: a.y, z: a.z });
  return true;
}

export function useDisguise(w: World, a: Agent): boolean {
  const s = a.spy!;
  if (!a.alive || s.cdDisguise > 0) return false;
  s.cdDisguise = G.disguise.cooldown;
  s.disguiseTimer = G.disguise.duration;
  a.appearance = disguisedAppearance(w.rng, a.baseAppearance);
  w.emit({ type: 'disguise', spy: a.id, on: true });
  w.onDisguise(a.id);
  return true;
}

export function endDisguise(w: World, a: Agent): void {
  const s = a.spy!;
  s.disguiseTimer = 0;
  a.appearance = a.baseAppearance;
  w.emit({ type: 'disguise', spy: a.id, on: false });
}

export function useSmoke(w: World, a: Agent): boolean {
  const s = a.spy!;
  if (!a.alive || s.cdSmoke > 0) return false;
  const sm = w.acquireSmoke();
  if (!sm) return false;
  s.cdSmoke = G.smoke.cooldown;
  lookDir(a.yaw, Math.min(1.2, a.pitch + 0.25), tmp);
  sm.active = true;
  sm.phase = 'flying';
  sm.x = a.x + tmp.x * 0.4;
  sm.y = a.y + eyeHeight(a) - 0.2;
  sm.z = a.z + tmp.z * 0.4;
  sm.vx = tmp.x * G.smoke.throwSpeed + a.vx;
  sm.vy = tmp.y * G.smoke.throwSpeed + 1.5;
  sm.vz = tmp.z * G.smoke.throwSpeed + a.vz;
  sm.timer = 0;
  sm.radius = 0.1;
  sm.owner = a.id;
  w.emit({ type: 'smokeThrow', spy: a.id });
  return true;
}

export function updateSmoke(w: World, sm: Smoke, dt: number): void {
  if (sm.phase === 'flying') {
    sm.timer += dt;
    sm.vy -= CONFIG.movement.gravity * dt;
    const nx = sm.x + sm.vx * dt, ny = sm.y + sm.vy * dt, nz = sm.z + sm.vz * dt;
    const g = w.col.groundHeight(nx, nz, sm.y);
    if (w.col.pointSolid(nx, ny, nz) || ny <= g + 0.1 || sm.timer > G.smoke.fuse) {
      // Deploy at the last free position.
      sm.phase = 'cloud';
      sm.timer = 0;
      sm.y = Math.max(sm.y, g) + 1.2;
      w.emit({ type: 'smokeDeploy', x: sm.x, y: sm.y, z: sm.z });
      w.addNoise(sm.x, sm.y, sm.z, 'body', sm.owner);
      return;
    }
    sm.x = nx;
    sm.y = ny;
    sm.z = nz;
  } else {
    sm.timer += dt;
    const grow = Math.min(1, sm.timer / 0.6);
    const fade = sm.timer > G.smoke.duration - 1 ? Math.max(0, G.smoke.duration - sm.timer) : 1;
    sm.radius = G.smoke.radius * grow * (0.6 + 0.4 * fade);
    if (sm.timer >= G.smoke.duration) sm.active = false;
  }
}

/** Does any smoke cloud block the segment a→b? */
export function segmentInSmoke(smokes: readonly Smoke[], ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  for (const sm of smokes) {
    if (!sm.active || sm.phase !== 'cloud' || sm.radius < 0.5) continue;
    const r = sm.radius * 0.92;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = len2 > 0 ? ((sm.x - ax) * dx + (sm.y - ay) * dy + (sm.z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t - sm.x, cy = ay + dy * t - sm.y, cz = az + dz * t - sm.z;
    if (cx * cx + cy * cy + cz * cz < r * r) return true;
  }
  return false;
}
