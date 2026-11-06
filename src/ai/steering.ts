// Path following along the waypoint graph, shared by civilians and AI spies.

import type { Agent } from '../sim/types';
import type { World } from '../sim/world';

/** Plan a path to a world position. Returns false if unreachable. */
export function setGoal(w: World, a: Agent, x: number, y: number, z: number, goalNode = -1): boolean {
  const from = w.nav.nearestNode(a.x, a.y, a.z, w.col);
  const to = goalNode >= 0 ? goalNode : w.nav.nearestNode(x, y, z);
  if (from < 0 || to < 0) {
    a.hasGoal = false;
    return false;
  }
  const path = w.nav.findPath(from, to);
  if (!path) {
    a.hasGoal = false;
    return false;
  }
  a.path = path;
  a.pathIndex = 0;
  // A goal point that isn't standable (e.g. a scanner estimate inside a wall) or
  // can't be reached in a straight line from the last waypoint is replaced by
  // that waypoint; otherwise the final approach would push into geometry forever.
  const last = w.nav.nodes[path[path.length - 1]];
  const gy = w.col.groundHeight(x, z, y + 0.1);
  if (!w.col.circleFree(x, z, gy, 0.32, 1.7) || !w.col.segmentWalkable(last.x, last.y, last.z, x, gy, z, 0.3)) {
    x = last.x;
    y = last.y;
    z = last.z;
  }
  // Skip the first node if we're already past it toward the second.
  if (path.length > 1) {
    const n0 = w.nav.nodes[path[0]], n1 = w.nav.nodes[path[1]];
    const d0 = (n1.x - a.x) ** 2 + (n1.z - a.z) ** 2;
    const d1 = (n1.x - n0.x) ** 2 + (n1.z - n0.z) ** 2;
    if (d0 < d1 && Math.abs(n1.y - a.y) < 0.6 && w.col.segmentWalkable(a.x, a.y, a.z, n1.x, n1.y, n1.z, 0.25)) a.pathIndex = 1;
  }
  a.goalX = x;
  a.goalY = y;
  a.goalZ = z;
  a.hasGoal = true;
  a.stuckTimer = 0;
  a.stuckCount = 0;
  a.progressX = a.x;
  a.progressZ = a.z;
  return true;
}

export function clearGoal(a: Agent): void {
  a.hasGoal = false;
  a.path = null;
  a.wantX = 0;
  a.wantZ = 0;
}

/**
 * Sets wantX/wantZ toward the next waypoint. Returns true when the final goal
 * is reached (and stops the agent).
 */
export function followPath(w: World, a: Agent, speed: number, dt: number): boolean {
  if (!a.hasGoal || !a.path) {
    a.wantX = a.wantZ = 0;
    return true;
  }
  const path = a.path;
  let tx: number, tz: number;
  const last = a.pathIndex >= path.length;
  if (!last) {
    const n = w.nav.nodes[path[a.pathIndex]];
    tx = n.x;
    tz = n.z;
    // Lane offset perpendicular to the approach so crowds don't walk single file.
    if (a.pathIndex < path.length - 1 && a.pathIndex > 0) {
      const p = w.nav.nodes[path[a.pathIndex - 1]];
      const ex = n.x - p.x, ez = n.z - p.z;
      const el = Math.hypot(ex, ez) || 1;
      const ox = tx + (-ez / el) * a.laneOffset, oz = tz + (ex / el) * a.laneOffset;
      // Only use the lane offset where it stays clear of rails, corners and walls.
      if (w.col.circleFree(ox, oz, n.y, 0.34, 1.7)) {
        tx = ox;
        tz = oz;
      }
    }
    const d = Math.hypot(tx - a.x, tz - a.z);
    const reach = a.pathIndex === path.length - 1 ? 0.5 : 0.9;
    if (d < reach && Math.abs(n.y - a.y) < 1.2) {
      a.pathIndex++;
      return followPath(w, a, speed, dt);
    }
  } else {
    tx = a.goalX;
    tz = a.goalZ;
    const d = Math.hypot(tx - a.x, tz - a.z);
    if (d < 0.3) {
      a.wantX = a.wantZ = 0;
      a.hasGoal = false;
      return true;
    }
  }
  const dx = tx - a.x, dz = tz - a.z;
  const d = Math.hypot(dx, dz) || 1;
  // Slow down for the final approach.
  const sp = last ? Math.min(speed, 0.6 + d * 1.5) : speed;
  a.wantX = (dx / d) * sp;
  a.wantZ = (dz / d) * sp;

  // Stuck detection: repath if we haven't moved for a while.
  a.stuckTimer += dt;
  if (a.stuckTimer > 1.5) {
    const moved = Math.hypot(a.x - a.progressX, a.z - a.progressZ);
    a.progressX = a.x;
    a.progressZ = a.z;
    a.stuckTimer = 0;
    if (moved >= 0.4) a.stuckCount = 0;
    if (moved < 0.4) {
      const tries = a.stuckCount + 1;
      // After a few failed repaths give up: the brain picks a new destination.
      if (tries >= 3 || !setGoal(w, a, a.goalX, a.goalY, a.goalZ)) {
        clearGoal(a);
        return true;
      }
      a.stuckCount = tries;
      a.laneOffset = -a.laneOffset * 0.5;
      // Nudge sideways to break symmetric deadlocks.
      a.wantX += (w.rng.next() - 0.5) * 2;
      a.wantZ += (w.rng.next() - 0.5) * 2;
    }
  }
  return false;
}
