// Waypoint graph built from the authored nav regions, extra nodes (stairs,
// arches) and POIs. Edges connect nearby nodes with a clear walkable segment.
// A* with a binary heap; results are cached per (from,to) pair.

import type { MapLayout, Poi } from './mapData';
import type { CollisionWorld } from './collision';

export interface NavNode {
  x: number;
  y: number;
  z: number;
  poi: number;
}

const LINK_RADIUS = 4.9;
const CLEARANCE = 0.34;

export class NavGraph {
  readonly nodes: NavNode[] = [];
  readonly adj: number[][] = [];
  /** POIs reachable from the main component. */
  readonly pois: Poi[] = [];
  readonly poiNode: number[] = [];
  private readonly cache = new Map<number, number[] | null>();
  // A* scratch
  private gScore = new Float64Array(0);
  private came = new Int32Array(0);
  private closed = new Uint8Array(0);
  private heap: number[] = [];
  private fHeap: number[] = [];

  constructor(layout: MapLayout, col: CollisionWorld) {
    const add = (x: number, y: number, z: number, poi = -1): number => {
      this.nodes.push({ x, y, z, poi });
      this.adj.push([]);
      return this.nodes.length - 1;
    };

    for (const r of layout.navRegions) {
      const nx = Math.max(1, Math.round((r.maxX - r.minX) / r.spacing));
      const nz = Math.max(1, Math.round((r.maxZ - r.minZ) / r.spacing));
      for (let i = 0; i <= nx; i++) {
        for (let j = 0; j <= nz; j++) {
          const x = r.minX + ((r.maxX - r.minX) * i) / nx;
          const z = r.minZ + ((r.maxZ - r.minZ) * j) / nz;
          const y = col.groundHeight(x, z, r.y + 0.1);
          if (Math.abs(y - r.y) > 0.5) continue;
          if (!col.circleFree(x, z, y, 0.5, 1.7)) continue;
          add(x, y, z);
        }
      }
    }
    for (const p of layout.navExtra) {
      const y = col.groundHeight(p.x, p.z, p.y + 0.1);
      if (col.circleFree(p.x, p.z, y, CLEARANCE, 1.7)) add(p.x, y, p.z);
    }
    const poiNodes: number[] = [];
    for (const p of layout.pois) {
      const y = col.groundHeight(p.x, p.z, p.y + 0.1);
      if (Math.abs(y - p.y) > 0.5 || !col.circleFree(p.x, p.z, y, 0.28, 1.7)) {
        poiNodes.push(-1);
        continue;
      }
      poiNodes.push(add(p.x, y, p.z, p.id));
    }

    // Link nodes.
    const n = this.nodes.length;
    for (let a = 0; a < n; a++) {
      const na = this.nodes[a];
      for (let b = a + 1; b < n; b++) {
        const nb = this.nodes[b];
        const dx = na.x - nb.x, dz = na.z - nb.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > LINK_RADIUS * LINK_RADIUS) continue;
        if (Math.abs(na.y - nb.y) > Math.sqrt(d2) * 0.8 + 0.3) continue;
        // POI-to-POI links only when very close, to keep the graph tidy.
        if (na.poi >= 0 && nb.poi >= 0 && d2 > 2.5 * 2.5) continue;
        if (!col.segmentWalkable(na.x, na.y, na.z, nb.x, nb.y, nb.z, CLEARANCE)) continue;
        this.adj[a].push(b);
        this.adj[b].push(a);
      }
    }

    // Keep only the largest connected component reachable for POIs.
    const comp = new Int32Array(n).fill(-1);
    let bestComp = -1, bestSize = 0, c = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      let size = 0;
      const stack = [s];
      comp[s] = c;
      while (stack.length) {
        const u = stack.pop()!;
        size++;
        for (const v of this.adj[u]) if (comp[v] < 0) { comp[v] = c; stack.push(v); }
      }
      if (size > bestSize) { bestSize = size; bestComp = c; }
      c++;
    }
    this.mainComponent = comp;
    this.mainId = bestComp;
    for (const p of layout.pois) {
      const node = poiNodes[p.id];
      if (node >= 0 && comp[node] === bestComp) {
        this.pois.push(p);
        this.poiNode[p.id] = node;
      } else {
        this.poiNode[p.id] = -1;
      }
    }

    this.gScore = new Float64Array(n);
    this.came = new Int32Array(n);
    this.closed = new Uint8Array(n);
  }

  private readonly mainComponent: Int32Array;
  private readonly mainId: number;

  inMain(node: number): boolean {
    return this.mainComponent[node] === this.mainId;
  }

  /** Nearest main-component node with a clear walk from (x,y,z). Falls back to nearest overall. */
  nearestNode(x: number, y: number, z: number, col?: CollisionWorld): number {
    let best = -1, bestD = Infinity;
    let fallback = -1, fallbackD = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      if (!this.inMain(i)) continue;
      const n = this.nodes[i];
      const dy = Math.abs(n.y - y);
      if (dy > 1.5) continue;
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z) + dy * dy * 4;
      if (d < fallbackD) { fallbackD = d; fallback = i; }
      if (d < bestD && d < 64) {
        if (!col || col.segmentWalkable(x, y, z, n.x, n.y, n.z, 0.2)) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best >= 0) return best;
    if (fallback >= 0) return fallback;
    // Totally lost (e.g. mid-air): nearest by plain distance.
    for (let i = 0; i < this.nodes.length; i++) {
      if (!this.inMain(i)) continue;
      const n = this.nodes[i];
      const d = (n.x - x) ** 2 + (n.z - z) ** 2 + (n.y - y) ** 2;
      if (d < fallbackD) { fallbackD = d; fallback = i; }
    }
    return fallback;
  }

  /** Shortest node path (inclusive). The returned array is shared — do not mutate. */
  findPath(from: number, to: number): number[] | null {
    const key = from * 65536 + to;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const path = this.astar(from, to);
    if (this.cache.size > 20000) this.cache.clear();
    this.cache.set(key, path);
    return path;
  }

  private h(a: number, b: number): number {
    const na = this.nodes[a], nb = this.nodes[b];
    return Math.hypot(na.x - nb.x, (na.y - nb.y) * 1.5, na.z - nb.z);
  }

  private astar(from: number, to: number): number[] | null {
    if (from === to) return [from];
    const n = this.nodes.length;
    this.gScore.fill(Infinity);
    this.came.fill(-1);
    this.closed.fill(0);
    this.heap.length = 0;
    this.fHeap.length = 0;
    this.gScore[from] = 0;
    this.push(from, this.h(from, to));
    while (this.heap.length) {
      const u = this.pop();
      if (u === to) break;
      if (this.closed[u]) continue;
      this.closed[u] = 1;
      const nu = this.nodes[u];
      for (const v of this.adj[u]) {
        if (this.closed[v]) continue;
        const nv = this.nodes[v];
        const g = this.gScore[u] + Math.hypot(nu.x - nv.x, (nu.y - nv.y) * 1.5, nu.z - nv.z);
        if (g < this.gScore[v]) {
          this.gScore[v] = g;
          this.came[v] = u;
          this.push(v, g + this.h(v, to));
        }
      }
    }
    if (this.came[to] < 0 || n === 0) return null;
    const path: number[] = [];
    for (let c = to; c !== -1; c = this.came[c]) path.push(c);
    path.reverse();
    return path;
  }

  private push(node: number, f: number): void {
    const h = this.heap, fh = this.fHeap;
    h.push(node);
    fh.push(f);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fh[p] <= fh[i]) break;
      [h[p], h[i]] = [h[i], h[p]];
      [fh[p], fh[i]] = [fh[i], fh[p]];
      i = p;
    }
  }

  private pop(): number {
    const h = this.heap, fh = this.fHeap;
    const top = h[0];
    const lastN = h.pop()!, lastF = fh.pop()!;
    if (h.length) {
      h[0] = lastN;
      fh[0] = lastF;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < h.length && fh[l] < fh[m]) m = l;
        if (r < h.length && fh[r] < fh[m]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        [fh[m], fh[i]] = [fh[i], fh[m]];
        i = m;
      }
    }
    return top;
  }
}
