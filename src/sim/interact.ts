// Interactables: what the player can do with the G key. Runs once per tick
// for the player only. Plain data, no rendering. Train doors and platform
// edges are added by the tracks/trains workstreams through the same function.

import { CONFIG } from '../config';
import type { PoiKind } from '../world/mapData';
import type { Activity, Agent } from './types';
import type { World } from './world';

export type InteractKind = 'sit' | 'activity' | 'stand' | 'stop' | 'climb' | 'drop';

export interface Interactable {
  kind: InteractKind;
  /** POI index for seats and activity spots; -1 otherwise. */
  poi: number;
  /** Landing spot for climb / drop. */
  x?: number;
  y?: number;
  z?: number;
}

const EDGE_COS = Math.cos((CONFIG.tracks.edgeConeDeg * Math.PI) / 180);

/** Is the agent down on a track bed? */
export function onTrackBed(w: World, a: Agent): boolean {
  const p = w.col.pitAt(a.x, a.z);
  return !!p && a.y < p.y + 0.5;
}

/**
 * A platform edge the agent can climb up (from the bed) or drop down (from the
 * platform) over: within edgeReach of the edge, facing it, and with a clear
 * landing spot. Train cars standing at the platform block the drop.
 */
export function findEdge(w: World, a: Agent): Interactable | null {
  const r = CONFIG.body.radius;
  const reach = CONFIG.tracks.edgeReach;
  const fz = -Math.cos(a.yaw);
  for (const t of w.layout.tracks) {
    if (a.x < t.x0 + 1.6 || a.x > w.layout.bounds.maxX - 0.6) continue;
    const pit = w.col.pitAt(a.x, a.z);
    if (pit && a.y < pit.y + 0.5) {
      if (a.z < t.z0 || a.z > t.z1) continue;
      // On this bed: climb toward whichever edge we face.
      for (const [ze, nz] of [[t.z0, -1], [t.z1, 1]] as const) {
        const gap = Math.abs(a.z - ze) - r;
        if (gap > reach || fz * nz < EDGE_COS) continue;
        const lz = ze + nz * (r + 0.3);
        if (!w.col.circleFree(a.x, lz, 0, r, CONFIG.body.height)) continue;
        if (Math.abs(w.col.groundHeight(a.x, lz, 0.1) - 0) > 0.05) continue;
        return { kind: 'climb', poi: -1, x: a.x, y: 0, z: lz };
      }
    } else if (Math.abs(a.y) < 0.3) {
      // On a platform next to this bed: drop down toward it.
      for (const [ze, nz] of [[t.z0, 1], [t.z1, -1]] as const) {
        const side = (a.z - ze) * -nz; // distance outside the bed, on the platform side
        if (side < -0.15 || side - r > reach || fz * nz < EDGE_COS) continue;
        const lz = ze + nz * (r + 0.35);
        if (w.trainCarAt(a.x, lz, 0.5)) continue;
        return { kind: 'drop', poi: -1, x: a.x, y: t.bedY, z: lz };
      }
    }
  }
  return null;
}

const CONE_COS = Math.cos((CONFIG.interact.coneDeg * Math.PI) / 180);

/** The standing activity a POI offers, or 'none' for spots that are only walked to. */
export function activityFor(kind: PoiKind): Activity {
  switch (kind) {
    case 'news': return 'read';
    case 'board': return 'look';
    case 'cafe': case 'kiosk': case 'shop': return 'phone';
    default: return 'none';
  }
}

/** Short HUD label for the prompt chip. */
export function interactLabel(t: Interactable, w: World): string {
  switch (t.kind) {
    case 'sit': return 'Sit';
    case 'stand': return 'Stand up';
    case 'stop': return 'Stop';
    case 'climb': return 'Climb up';
    case 'drop': return 'Drop to the tracks';
    case 'activity': {
      const act = t.poi >= 0 ? activityFor(w.layout.pois[t.poi].kind) : 'none';
      return act === 'read' ? 'Read the paper' : act === 'look' ? 'Check the board' : 'Wait here';
    }
  }
}

/**
 * The best free seat or activity spot within `interact.range` of the agent and
 * within the look cone. Score prefers close spots that are straight ahead.
 */
export function findInteractable(w: World, a: Agent): Interactable | null {
  const edge = findEdge(w, a);
  if (edge && edge.kind === 'climb') return edge;
  const R = CONFIG.interact.range;
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  let best: Interactable | null = null;
  let bestScore = Infinity;
  const pois = w.layout.pois;
  for (let i = 0; i < pois.length; i++) {
    const p = pois[i];
    const occ = w.poiOccupant[i];
    if (occ >= 0 && occ !== a.id) continue;
    let kind: InteractKind;
    let tx: number, tz: number;
    if (p.seat) {
      kind = 'sit';
      tx = p.seat.x;
      tz = p.seat.z;
    } else {
      if (activityFor(p.kind) === 'none') continue;
      kind = 'activity';
      tx = p.x;
      tz = p.z;
    }
    if (Math.abs(p.y - a.y) > 1) continue;
    const dx = tx - a.x, dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d > R) continue;
    // Standing right on the spot counts as facing it.
    const cos = d < 0.4 ? 1 : (dx * fx + dz * fz) / d;
    if (cos < CONE_COS) continue;
    const score = d + (1 - cos) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = { kind, poi: i };
    }
  }
  return best ?? edge;
}
