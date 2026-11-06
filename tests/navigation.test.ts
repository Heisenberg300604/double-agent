import { describe, expect, it } from 'vitest';
import { buildGrandStation, type MapLayout } from '../src/world/mapData';
import { CollisionWorld } from '../src/world/collision';
import { NavGraph } from '../src/world/navGraph';

const layout = buildGrandStation();
const col = new CollisionWorld(layout);
const nav = new NavGraph(layout, col);

describe('waypoint graph + A*', () => {
  it('builds a single connected graph covering the station', () => {
    expect(nav.nodes.length).toBeGreaterThan(300);
    for (let i = 0; i < nav.nodes.length; i++) expect(nav.inMain(i)).toBe(true);
    expect(nav.nodes.some((n) => n.y > 4.5)).toBe(true); // balcony
    expect(nav.nodes.some((n) => n.x > 24)).toBe(true); // platforms
    expect(nav.pois.length).toBeGreaterThan(layout.pois.length * 0.95);
  });

  it('finds a path from the café to the balcony that uses the stairs', () => {
    const a = nav.nearestNode(-34, 0, -9);
    const b = nav.nearestNode(-6, 5, 12);
    const path = nav.findPath(a, b)!;
    expect(path).not.toBeNull();
    expect(path[0]).toBe(a);
    expect(path[path.length - 1]).toBe(b);
    const mids = path.map((i) => nav.nodes[i].y).filter((y) => y > 0.5 && y < 4.5);
    expect(mids.length).toBeGreaterThan(0);
    // Consecutive nodes are adjacent and walkable.
    for (let i = 1; i < path.length; i++) expect(nav.adj[path[i - 1]]).toContain(path[i]);
  });

  it('every POI is reachable from every other region', () => {
    const start = nav.nearestNode(0, 0, 0);
    for (const p of nav.pois) expect(nav.findPath(start, nav.poiNode[p.id])).not.toBeNull();
  });

  it('A* returns the optimal path on a small synthetic graph', () => {
    const tiny: MapLayout = {
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      boxes: [{ minX: -1, maxX: 1, minY: 0, maxY: 3, minZ: -9.9, maxZ: 6, mat: 'wall', collide: true, shape: 'box' }],
      ramps: [], pois: [], spawns: [], lights: [], glows: [], pools: [], shafts: [], doors: [],
      navRegions: [],
      navExtra: [
        { x: -3, y: 0, z: 0 }, { x: -3, y: 0, z: 4 }, { x: -3, y: 0, z: 8 }, { x: 0, y: 0, z: 8.5 },
        { x: 3, y: 0, z: 8 }, { x: 3, y: 0, z: 4 }, { x: 3, y: 0, z: 0 },
        { x: -1.8, y: 0, z: -3 }, { x: 1.8, y: 0, z: -3 },
      ],
    };
    const c = new CollisionWorld(tiny);
    const g = new NavGraph(tiny, c);
    // The wall blocks the short cut, so the only route goes around its north end.
    expect(g.adj[7]).not.toContain(8);
    expect(g.findPath(0, 6)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(g.findPath(6, 0)).toEqual([6, 5, 4, 3, 2, 1, 0]);
  });
});
