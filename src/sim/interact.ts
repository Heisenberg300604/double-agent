// Interactables: what the player can do with the G key. Runs once per tick
// for the player only. Plain data, no rendering. Train doors and platform
// edges are added by the tracks/trains workstreams through the same function.

import { CONFIG } from '../config';
import type { PoiKind } from '../world/mapData';
import type { Activity, Agent } from './types';
import type { World } from './world';

export type InteractKind = 'sit' | 'activity' | 'stand' | 'stop';

export interface Interactable {
  kind: InteractKind;
  /** POI index for seats and activity spots; -1 otherwise. */
  poi: number;
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
  return best;
}
