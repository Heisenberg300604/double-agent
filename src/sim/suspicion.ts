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
  /** Seated or busy with an idle activity: suspicion cools off faster. */
  blend?: 'none' | 'seated' | 'activity';
  /** Down on a track bed. */
  onTracks?: boolean;
}

/**
 * Suspicion gain per second for what a spy is visibly doing (0 when acting human).
 * `proximityActive` is true once the spy has lingered near another spy past the delay.
 */
export function suspicionGain(inp: SuspicionInput, proximityActive: boolean): number {
  const c = CONFIG.suspicion;
  let gain = 0;
  if (inp.running) gain += c.run * (inp.cover ? c.runCoverFactor : 1);
  if (inp.drawn) gain += c.drawn;
  if (inp.aiming) gain += c.aim;
  if (inp.onTracks) gain += c.onTracks;
  if (proximityActive) gain += c.proximity;
  return gain;
}

/** Decay per second while an observer sees nothing suspicious (faster while the spy blends in). */
export function suspicionDecay(blend: SuspicionInput['blend']): number {
  const c = CONFIG.suspicion;
  return blend === 'seated' ? c.seatedDecay : blend === 'activity' ? c.activityDecay : c.decay;
}

/** One observer's suspicion of one spy, stepped by dt (seen: the observer can see the spy right now). */
export function stepObserved(value: number, gain: number, decay: number, seen: boolean, dt: number): number {
  const v = seen && gain > 0 ? value + gain * dt : value - decay * dt;
  return v < 0 ? 0 : v > CONFIG.suspicion.max ? CONFIG.suspicion.max : v;
}

/** Single-observer reference model (what one witness who sees everything would think). */
export function updateSuspicion(s: SpyState, inp: SuspicionInput, dt: number): void {
  const c = CONFIG.suspicion;
  let gain = 0;
  if (inp.running) gain += c.run * (inp.cover ? c.runCoverFactor : 1);
  if (inp.drawn) gain += c.drawn;
  if (inp.aiming) gain += c.aim;
  if (inp.onTracks) gain += c.onTracks;
  if (inp.nearSpy) {
    s.proximityTimer += dt;
    if (s.proximityTimer > c.proximityDelay) gain += c.proximity;
  } else {
    s.proximityTimer = 0;
  }
  const decay = inp.blend === 'seated' ? c.seatedDecay : inp.blend === 'activity' ? c.activityDecay : c.decay;
  if (gain > 0) s.suspicion += gain * dt;
  else s.suspicion -= decay * dt;
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
