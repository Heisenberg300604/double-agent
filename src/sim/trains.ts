// Terminus train service. Deterministic per seed: each track cycles
// away → arriving (decelerating to the buffers) → dwell (doors open) →
// departing (accelerating out of the trainshed). The world turns the car shells
// into sight/bullet blockers each tick (CollisionWorld.trainRays).

import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { Track } from '../world/mapData';
import type { SimEvent } from './types';

const T = CONFIG.trains;

export type TrainPhase = 'away' | 'arriving' | 'dwell' | 'departing';

export interface TrainState {
  track: number;
  phase: TrainPhase;
  /** Seconds spent in the current phase. */
  t: number;
  /** Duration of the current phase. */
  duration: number;
  /** x of the train's front (west end). */
  frontX: number;
  /** frontX at the previous tick, for render interpolation. */
  prevFrontX: number;
  /** 0 closed .. 1 fully open. */
  doors: number;
  /** Increments per visit, used to name services. */
  service: number;
  closingAnnounced: boolean;
  /** Seconds until the horn may sound again at someone on the bed. */
  hornCooldown: number;
}

export const TRAIN_LENGTH = T.cars * T.carLength + (T.cars - 1) * T.carGap;

/** Current speed of a train along the track (m/s, always ≥ 0). */
export function trainSpeed(s: TrainState): number {
  const k = Math.min(1, s.t / s.duration);
  if (s.phase === 'arriving') return (2 * T.approachDistance * (1 - k)) / s.duration;
  if (s.phase === 'departing') return (2 * T.approachDistance * k) / s.duration;
  return 0;
}

/** Car body footprint (XZ) on its track; null if the car is outside the station. */
export interface CarBox { minX: number; maxX: number; minZ: number; maxZ: number }

/** x offset of each car's front from the train front. */
export function carOffset(i: number): number {
  return i * (T.carLength + T.carGap);
}

export class TrainSystem {
  readonly trains: TrainState[];
  private readonly tracks: readonly Track[];
  private readonly rng: Rng;

  constructor(tracks: readonly Track[], rng: Rng) {
    this.tracks = tracks;
    this.rng = rng;
    this.trains = tracks.map((tr, i) => {
      // One train starts at the platform mid-dwell, the other is a little way out.
      const s: TrainState = {
        track: i, phase: i === 0 ? 'dwell' : 'away', t: 0, duration: i === 0 ? T.dwell : rng.range(18, 30),
        frontX: tr.stopX, prevFrontX: tr.stopX, doors: i === 0 ? 1 : 0, service: i * 3, closingAnnounced: false, hornCooldown: 0,
      };
      if (i === 0) s.t = T.dwell * 0.35;
      return s;
    });
    for (const s of this.trains) {
      this.place(s);
      s.prevFrontX = s.frontX;
    }
  }

  private place(s: TrainState): void {
    const stop = this.tracks[s.track].stopX;
    const k = Math.min(1, s.t / s.duration);
    switch (s.phase) {
      case 'away':
        s.frontX = stop + T.approachDistance + 80;
        s.doors = 0;
        break;
      case 'arriving': {
        // Constant deceleration to a stop exactly at the buffers.
        const u = 1 - k;
        s.frontX = stop + T.approachDistance * u * u;
        s.doors = 0;
        break;
      }
      case 'dwell': {
        s.frontX = stop;
        const open = Math.min(1, Math.max(0, (s.t - T.doorsOpenAfter) / T.doorTime));
        const close = Math.min(1, Math.max(0, (s.t - (s.duration - T.doorsCloseBefore)) / T.doorTime));
        s.doors = open * (1 - close);
        break;
      }
      case 'departing':
        // Constant acceleration away from the buffers.
        s.frontX = stop + T.approachDistance * k * k;
        s.doors = 0;
        break;
    }
  }

  step(dt: number, emit: (e: SimEvent) => void): void {
    for (const s of this.trains) {
      s.prevFrontX = s.frontX;
      s.t += dt;
      s.hornCooldown = Math.max(0, s.hornCooldown - dt);
      if (s.phase === 'dwell' && !s.closingAnnounced && s.t >= s.duration - T.doorsCloseBefore - 4) {
        s.closingAnnounced = true;
        emit({ type: 'train', track: s.track, phase: 'closing', service: s.service });
      }
      if (s.t >= s.duration) {
        s.t = 0;
        switch (s.phase) {
          case 'away':
            s.phase = 'arriving';
            s.duration = T.arriveTime;
            s.service++;
            emit({ type: 'train', track: s.track, phase: 'arriving', service: s.service });
            break;
          case 'arriving':
            s.phase = 'dwell';
            s.duration = T.dwell;
            s.closingAnnounced = false;
            emit({ type: 'train', track: s.track, phase: 'arrived', service: s.service });
            break;
          case 'dwell':
            s.phase = 'departing';
            s.duration = T.departTime;
            emit({ type: 'train', track: s.track, phase: 'departing', service: s.service });
            break;
          case 'departing':
            s.phase = 'away';
            s.duration = this.rng.range(T.awayMin, T.awayMax);
            break;
        }
      }
      this.place(s);
    }
  }

  /**
   * Jump a train to a phase and time (used to compress a ride with the player aboard).
   * The render interpolation restarts from the new position, so nothing sweeps across.
   */
  setPhase(track: number, phase: TrainPhase, t: number, duration: number): void {
    const s = this.trains[track];
    s.phase = phase;
    s.t = t;
    s.duration = duration;
    this.place(s);
    s.prevFrontX = s.frontX;
  }
}
