// Suspicion: acting like a killer raises it; acting human lets it decay.

import { CONFIG } from '../config';
import type { SpyState } from './types';

export interface SuspicionInput {
  running: boolean;
  drawn: boolean;
  aiming: boolean;
  /** Within proximity radius of another spy this tick. */
  nearSpy: boolean;
  /** Surrounded by panicking civilians (noise covers running). */
  cover?: boolean;
}

export function updateSuspicion(s: SpyState, inp: SuspicionInput, dt: number): void {
  const c = CONFIG.suspicion;
  let gain = 0;
  if (inp.running) gain += c.run * (inp.cover ? c.runCoverFactor : 1);
  if (inp.drawn) gain += c.drawn;
  if (inp.aiming) gain += c.aim;
  if (inp.nearSpy) {
    s.proximityTimer += dt;
    if (s.proximityTimer > c.proximityDelay) gain += c.proximity;
  } else {
    s.proximityTimer = 0;
  }
  if (gain > 0) s.suspicion += gain * dt;
  else s.suspicion -= c.decay * dt;
  s.suspicion = Math.max(0, Math.min(c.max, s.suspicion));
}

export function addSuspicion(s: SpyState, amount: number): void {
  s.suspicion = Math.max(0, Math.min(CONFIG.suspicion.max, s.suspicion + amount));
}

export function onFired(s: SpyState): void {
  s.suspicion = CONFIG.suspicion.max;
}

export function isExposed(s: SpyState): boolean {
  return s.suspicion >= CONFIG.suspicion.exposed;
}
