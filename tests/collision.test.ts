import { describe, expect, it } from 'vitest';
import { buildGrandStation, type MapLayout } from '../src/world/mapData';
import { CollisionWorld } from '../src/world/collision';

const tiny: MapLayout = {
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  boxes: [
    { minX: 0, maxX: 2, minY: 0, maxY: 3, minZ: -2, maxZ: 2, mat: 'wall', collide: true, shape: 'box' },
    { minX: -6, maxX: -4, minY: 0, maxY: 0.3, minZ: -1, maxZ: 1, mat: 'wood', collide: true, shape: 'box' },
    { minX: -9, maxX: -7, minY: 2.5, maxY: 2.8, minZ: -1, maxZ: 1, mat: 'wood', collide: true, shape: 'box' },
  ],
  ramps: [{ minX: 4, maxX: 8, minZ: 4, maxZ: 6, axis: 'x', y0: 0, y1: 2 }],
  pois: [], spawns: [], navRegions: [], navExtra: [], lights: [], glows: [], pools: [], tracks: [], landmarks: {},
};

describe('collision', () => {
  const col = new CollisionWorld(tiny);

  it('pushes a circle out of a wall along the shortest axis', () => {
    const p = { x: -0.1, y: 0, z: 0.5 };
    expect(col.resolveCircle(p, 0.3, 1.8)).toBe(true);
    expect(p.x).toBeCloseTo(-0.3, 3);
    expect(p.z).toBeCloseTo(0.5, 6);
  });

  it('resolves a centre inside a box', () => {
    const p = { x: 0.2, y: 0, z: 0 };
    col.resolveCircle(p, 0.3, 1.8);
    expect(col.circleFree(p.x, p.z, 0, 0.29, 1.8)).toBe(true);
  });

  it('ignores low steps (walk over) and high overhangs (walk under)', () => {
    expect(col.circleFree(-5, 0, 0, 0.3, 1.8)).toBe(true); // 0.3 m step
    expect(col.circleFree(-8, 0, 0, 0.3, 1.8)).toBe(true); // shelf at 2.5 m
    expect(col.circleFree(1, 0, 0, 0.3, 1.8)).toBe(false);
  });

  it('ground height follows steps and ramps', () => {
    expect(col.groundHeight(-5, 0, 0)).toBeCloseTo(0.3);
    expect(col.groundHeight(6, 5, 0.6)).toBeCloseTo(1);
    expect(col.groundHeight(8, 5, 1.8)).toBeCloseTo(2);
    // A ramp section above step reach from the floor is not ground.
    expect(col.groundHeight(8, 5, 0)).toBe(0);
  });

  it('raycasts hit walls and the floor', () => {
    expect(col.raycast(-5, 1, 0, 1, 0, 0, 100)).toBeCloseTo(5);
    expect(col.raycast(5, 1, 0, -1, 0, 0, 100)).toBeCloseTo(3);
    expect(col.raycast(5, 1, 5, 0, -1, 0, 100)).toBeCloseTo(1);
    expect(col.raycast(-5, 1, 5, 1, 0, 0, 100)).toBe(100);
    expect(col.clearLine(-5, 1, 0, 5, 1, 0)).toBe(false);
    expect(col.clearLine(-5, 1, 5, 5, 1, 5)).toBe(true);
  });

  it('every spawn point in Grand Station is free', () => {
    const L = buildGrandStation();
    const c = new CollisionWorld(L);
    expect(L.spawns.length).toBeGreaterThanOrEqual(12);
    for (const s of L.spawns) {
      const g = c.groundHeight(s.x, s.z, s.y + 0.1);
      expect(Math.abs(g - s.y)).toBeLessThan(0.3);
      expect(c.circleFree(s.x, s.z, g, 0.4, 1.8)).toBe(true);
    }
  });
});
