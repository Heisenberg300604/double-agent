// Static collision: AABBs in a uniform grid plus ramp surfaces for stairs.
// Agents are vertical capsules approximated as circles in XZ with a height.

import type { Box, MapLayout, Ramp } from './mapData';
import { CONFIG } from '../config';

const CELL = 4;
const STEP = CONFIG.body.stepHeight;

let slabAxis = -1;
let slabSign = 0;

/** Ray vs AABB; returns entry distance or Infinity. Sets slabAxis/slabSign for the hit normal. */
function rayAabb(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, maxT: number): number {
  let tmin = 0, tmax = maxT;
  slabAxis = -1;
  slabSign = 0;
  for (let k = 0; k < 3; k++) {
    const o = k === 0 ? ox : k === 1 ? oy : oz;
    const d = k === 0 ? dx : k === 1 ? dy : dz;
    const lo = k === 0 ? x0 : k === 1 ? y0 : z0;
    const hi = k === 0 ? x1 : k === 1 ? y1 : z1;
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; slabAxis = k; slabSign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

type Aabb = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };

export interface TrainRayShape {
  /** World x of the train front (train-local x = world x - frontX). */
  frontX: number;
  doorsClosed: boolean;
  carBounds: readonly Aabb[];
  boxes: readonly Aabb[];
  doorBoxes: readonly Aabb[];
}

/** A sunken floor area (a track bed) where the ground is below 0. */
export interface Pit {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}

export class CollisionWorld {
  readonly boxes: Box[];
  readonly ramps: Ramp[];
  readonly pits: Pit[];
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly grid: number[][];
  private readonly stamps: Uint32Array;
  private stampId = 1;
  private readonly tmpCells: number[] = [];
  /**
   * Train shells for sight and bullets (walls, floor, roof; window holes open, doorways
   * open while the doors are). Boxes are train-local in x; updated by the simulation each tick.
   */
  trainRays: TrainRayShape[] = [];

  constructor(layout: MapLayout) {
    this.boxes = layout.boxes.filter((b) => b.collide);
    this.ramps = layout.ramps;
    this.pits = layout.tracks.map((t) => ({ minX: t.x0, maxX: 400, minZ: t.z0, maxZ: t.z1, y: t.bedY }));
    this.minX = layout.bounds.minX - 2;
    this.minZ = layout.bounds.minZ - 2;
    this.cols = Math.ceil((layout.bounds.maxX + 2 - this.minX) / CELL);
    this.rows = Math.ceil((layout.bounds.maxZ + 2 - this.minZ) / CELL);
    this.grid = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.grid.push([]);
    this.stamps = new Uint32Array(this.boxes.length);
    this.boxes.forEach((b, i) => {
      const x0 = this.cellX(b.minX), x1 = this.cellX(b.maxX);
      const z0 = this.cellZ(b.minZ), z1 = this.cellZ(b.maxZ);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.grid[z * this.cols + x].push(i);
    });
  }

  private cellX(x: number): number {
    const c = Math.floor((x - this.minX) / CELL);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private cellZ(z: number): number {
    const c = Math.floor((z - this.minZ) / CELL);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  /** Box indices in cells overlapping the XZ rectangle (deduplicated). */
  private gather(x0: number, z0: number, x1: number, z1: number): number[] {
    const out = this.tmpCells;
    out.length = 0;
    const stamp = this.nextStamp();
    const cx0 = this.cellX(x0), cx1 = this.cellX(x1);
    const cz0 = this.cellZ(z0), cz1 = this.cellZ(z1);
    for (let z = cz0; z <= cz1; z++) {
      for (let x = cx0; x <= cx1; x++) {
        const cell = this.grid[z * this.cols + x];
        for (let k = 0; k < cell.length; k++) {
          const bi = cell[k];
          if (this.stamps[bi] !== stamp) {
            this.stamps[bi] = stamp;
            out.push(bi);
          }
        }
      }
    }
    return out;
  }

  private nextStamp(): number {
    this.stampId++;
    if (this.stampId >= 0xffffffff) {
      this.stamps.fill(0);
      this.stampId = 1;
    }
    return this.stampId;
  }

  /** A box blocks a body whose feet are at feetY if it overlaps the body above step height. */
  static blocks(b: Box, feetY: number, height: number): boolean {
    return b.maxY > feetY + STEP && b.minY < feetY + height;
  }

  rampHeightAt(r: Ramp, x: number, z: number): number {
    const t = r.axis === 'x' ? (x - r.minX) / (r.maxX - r.minX) : (z - r.minZ) / (r.maxZ - r.minZ);
    return r.y0 + (r.y1 - r.y0) * (t < 0 ? 0 : t > 1 ? 1 : t);
  }

  /** The pit at (x,z), if any. */
  pitAt(x: number, z: number): Pit | null {
    for (const p of this.pits) if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) return p;
    return null;
  }

  /** Base floor height at (x,z): 0, or the bed top inside a track pit. */
  floorAt(x: number, z: number): number {
    const p = this.pitAt(x, z);
    return p ? p.y : 0;
  }

  /** Highest walkable surface under (x,z) reachable from feetY (within step height). */
  groundHeight(x: number, z: number, feetY: number, support = 0.12): number {
    let best = this.floorAt(x, z);
    const reach = feetY + STEP + 0.01;
    const ids = this.gather(x - support, z - support, x + support, z + support);
    for (let i = 0; i < ids.length; i++) {
      const b = this.boxes[ids[i]];
      if (b.maxY > reach || b.maxY <= best) continue;
      if (x >= b.minX - support && x <= b.maxX + support && z >= b.minZ - support && z <= b.maxZ + support) best = b.maxY;
    }
    for (const r of this.ramps) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        const h = this.rampHeightAt(r, x, z);
        if (h <= reach && h > best) best = h;
      }
    }
    return best;
  }

  /**
   * Push a circle out of blocking boxes. Mutates pos. Returns true if any contact happened.
   * `ignoreBedGuards` lets the player step down onto the track beds.
   */
  resolveCircle(pos: { x: number; y: number; z: number }, r: number, height: number, ignoreBedGuards = false): boolean {
    let hit = false;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      const ids = this.gather(pos.x - r, pos.z - r, pos.x + r, pos.z + r);
      for (let i = 0; i < ids.length; i++) {
        const b = this.boxes[ids[i]];
        if (ignoreBedGuards && b.bedGuard) continue;
        if (!CollisionWorld.blocks(b, pos.y, height)) continue;
        const px = pos.x < b.minX ? b.minX : pos.x > b.maxX ? b.maxX : pos.x;
        const pz = pos.z < b.minZ ? b.minZ : pos.z > b.maxZ ? b.maxZ : pos.z;
        const dx = pos.x - px, dz = pos.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d + 1e-4;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // Centre inside the box: exit through the nearest face.
          const l = pos.x - b.minX, rr = b.maxX - pos.x, n = pos.z - b.minZ, f = b.maxZ - pos.z;
          const m = Math.min(l, rr, n, f);
          if (m === l) pos.x = b.minX - r - 1e-4;
          else if (m === rr) pos.x = b.maxX + r + 1e-4;
          else if (m === n) pos.z = b.minZ - r - 1e-4;
          else pos.z = b.maxZ + r + 1e-4;
        }
        moved = true;
        hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  circleFree(x: number, z: number, feetY: number, r: number, height: number): boolean {
    const ids = this.gather(x - r, z - r, x + r, z + r);
    for (let i = 0; i < ids.length; i++) {
      const b = this.boxes[ids[i]];
      if (!CollisionWorld.blocks(b, feetY, height)) continue;
      const px = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const pz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - px, dz = z - pz;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  }

  /** True if a point is inside any solid box. */
  pointSolid(x: number, y: number, z: number): boolean {
    const ids = this.gather(x, z, x, z);
    for (let i = 0; i < ids.length; i++) {
      const b = this.boxes[ids[i]];
      if (x > b.minX && x < b.maxX && y > b.minY && y < b.maxY && z > b.minZ && z < b.maxZ) return true;
    }
    return y < this.floorAt(x, z);
  }

  /**
   * Can a body walk straight from a to b? Samples the segment, interpolating the
   * expected feet height, and requires both clearance and matching ground.
   */
  segmentWalkable(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(len / 0.35));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      const g = this.groundHeight(x, z, y + 0.1);
      if (Math.abs(g - y) > 0.5) return false;
      if (!this.circleFree(x, z, g, r, 1.7)) return false;
    }
    return true;
  }

  /**
   * Ray against static boxes and the floor. Direction must be normalized.
   * Returns distance to first hit (or maxT). Fills `hit` normal if given.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, hit?: RayHit): number {
    let best = maxT;
    let nx = 0, ny = 0, nz = 0;
    if (dy < -1e-6) {
      // The floor plane at 0, open over the track pits; their floors are lower planes.
      const t = -oy / dy;
      if (t >= 0 && t < best && !this.pitAt(ox + dx * t, oz + dz * t)) {
        best = t;
        ny = 1;
      }
      for (const p of this.pits) {
        const tp = (p.y - oy) / dy;
        if (tp < 0 || tp >= best) continue;
        const hx = ox + dx * tp, hz = oz + dz * tp;
        if (hx >= p.minX && hx <= p.maxX && hz >= p.minZ && hz <= p.maxZ) {
          best = tp;
          nx = nz = 0;
          ny = 1;
        }
      }
    }
    const stamp = this.nextStamp();
    let cx = this.cellX(ox), cz = this.cellZ(oz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const invDx = Math.abs(dx) > 1e-9 ? 1 / dx : Infinity;
    const invDz = Math.abs(dz) > 1e-9 ? 1 / dz : Infinity;
    const nextBX = this.minX + (cx + (stepX > 0 ? 1 : 0)) * CELL;
    const nextBZ = this.minZ + (cz + (stepZ > 0 ? 1 : 0)) * CELL;
    let tMaxX = invDx === Infinity ? Infinity : (nextBX - ox) * invDx;
    let tMaxZ = invDz === Infinity ? Infinity : (nextBZ - oz) * invDz;
    const tDeltaX = invDx === Infinity ? Infinity : CELL * Math.abs(invDx);
    const tDeltaZ = invDz === Infinity ? Infinity : CELL * Math.abs(invDz);
    const invDy = Math.abs(dy) > 1e-9 ? 1 / dy : Infinity;

    for (let guard = 0; guard < 256; guard++) {
      const cell = this.grid[cz * this.cols + cx];
      for (let k = 0; k < cell.length; k++) {
        const bi = cell[k];
        if (this.stamps[bi] === stamp) continue;
        this.stamps[bi] = stamp;
        const b = this.boxes[bi];
        if (b.rayIgnore) continue;
        // Slab test.
        let tmin = 0, tmax = best;
        let axis = -1, sign = 0;
        // X
        if (invDx === Infinity) {
          if (ox < b.minX || ox > b.maxX) continue;
        } else {
          let t1 = (b.minX - ox) * invDx, t2 = (b.maxX - ox) * invDx;
          let s = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        // Y
        if (invDy === Infinity) {
          if (oy < b.minY || oy > b.maxY) continue;
        } else {
          let t1 = (b.minY - oy) * invDy, t2 = (b.maxY - oy) * invDy;
          let s = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        // Z
        if (invDz === Infinity) {
          if (oz < b.minZ || oz > b.maxZ) continue;
        } else {
          let t1 = (b.minZ - oz) * invDz, t2 = (b.maxZ - oz) * invDz;
          let s = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        if (tmin < best) {
          best = tmin;
          nx = axis === 0 ? sign : 0;
          ny = axis === 1 ? sign : 0;
          nz = axis === 2 ? sign : 0;
        }
      }
      const tExit = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      if (best <= tExit) break;
      if (tMaxX < tMaxZ) {
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        cz += stepZ;
        tMaxZ += tDeltaZ;
      }
      if (cx < 0 || cx >= this.cols || cz < 0 || cz >= this.rows) break;
    }
    // Trains: per-car broad phase in train-local space, then the shell boxes (allocation-free).
    for (const tr of this.trainRays) {
      const lx = ox - tr.frontX;
      for (const cb of tr.carBounds) {
        // Origin inside the car counts as a hit at t=0 for the AABB, so it is still tested.
        if (rayAabb(lx, oy, oz, dx, dy, dz, cb.minX, cb.minY, cb.minZ, cb.maxX, cb.maxY, cb.maxZ, best) === Infinity) continue;
        for (let pass = 0; pass < 2; pass++) {
          const list = pass === 0 ? tr.boxes : tr.doorsClosed ? tr.doorBoxes : null;
          if (!list) continue;
          for (const b of list) {
            if (b.maxX < cb.minX || b.minX > cb.maxX) continue;
            const t = rayAabb(lx, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, best);
            if (t < best) {
              best = t;
              nx = slabAxis === 0 ? slabSign : 0;
              ny = slabAxis === 1 ? slabSign : 0;
              nz = slabAxis === 2 ? slabSign : 0;
            }
          }
        }
      }
    }
    if (hit) {
      hit.t = best;
      hit.nx = nx;
      hit.ny = ny;
      hit.nz = nz;
    }
    return best;
  }

  /** Line of sight between two points against static geometry only. */
  clearLine(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return true;
    const t = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len);
    return t >= len - 1e-3;
  }
}
