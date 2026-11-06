// Static collision: AABBs in a uniform grid plus ramp surfaces for stairs.
// Agents are vertical capsules approximated as circles in XZ with a height.

import type { Box, MapLayout, Ramp } from './mapData';
import { CONFIG } from '../config';

const CELL = 4;
const STEP = CONFIG.body.stepHeight;

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

export class CollisionWorld {
  readonly boxes: Box[];
  readonly ramps: Ramp[];
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly grid: number[][];
  private readonly stamps: Uint32Array;
  private stampId = 1;
  private readonly tmpCells: number[] = [];

  constructor(layout: MapLayout) {
    this.boxes = layout.boxes.filter((b) => b.collide);
    this.ramps = layout.ramps;
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

  /** Highest walkable surface under (x,z) reachable from feetY (within step height). */
  groundHeight(x: number, z: number, feetY: number, support = 0.12): number {
    let best = 0;
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

  /** Push a circle out of blocking boxes. Mutates pos. Returns true if any contact happened. */
  resolveCircle(pos: { x: number; y: number; z: number }, r: number, height: number): boolean {
    let hit = false;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      const ids = this.gather(pos.x - r, pos.z - r, pos.x + r, pos.z + r);
      for (let i = 0; i < ids.length; i++) {
        const b = this.boxes[ids[i]];
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
    return y < 0;
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
      const t = -oy / dy;
      if (t >= 0 && t < best) {
        best = t;
        ny = 1;
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
