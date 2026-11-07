import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ViewCull } from '../src/render/viewCull';

const FOV = 75, ASPECT = 16 / 9, FAR = 200;
/** Yaw 0 looks toward -z. A point at angle a (radians, + = to the left) and distance d. */
const at = (a: number, d: number): [number, number, number] => [-Math.sin(a) * d, 1.6, -Math.cos(a) * d];

describe('predictive view culling', () => {
  it('draws what is in view and near you, skips what is behind', () => {
    const c = new ViewCull();
    c.update({ x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 }, 1 / 60, FOV, ASPECT, FAR);
    expect(c.sphereVisible(...at(0, 20), 1)).toBe(true);
    expect(c.sphereVisible(...at(Math.PI, 20), 1)).toBe(false);
    expect(c.sphereVisible(...at(Math.PI, 2), 1)).toBe(true); // right behind you: always drawn
    expect(c.boxVisible(new THREE.Box3(new THREE.Vector3(-2, 0, 10), new THREE.Vector3(2, 3, 14)))).toBe(false);
  });

  it('a fast turn brings things into view before the camera gets there', () => {
    const side = at(Math.PI * 0.62, 25); // well outside a 75° view to the left
    const still = new ViewCull();
    for (let i = 0; i < 10; i++) still.update({ x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 }, 1 / 60, FOV, ASPECT, FAR);
    expect(still.sphereVisible(...side, 1)).toBe(false);
    // Turning left at 6 rad/s (a quick mouse flick), ending at yaw 0.
    const turning = new ViewCull();
    for (let i = 10; i >= 0; i--) turning.update({ x: 0, y: 1.6, z: 0, yaw: -i * 0.1, pitch: 0 }, 1 / 60, FOV, ASPECT, FAR);
    expect(turning.yawVel).toBeGreaterThan(3);
    expect(turning.sphereVisible(...side, 1)).toBe(true);
    // ...but not things on the other side.
    expect(turning.sphereVisible(...at(-Math.PI * 0.62, 25), 1)).toBe(false);
  });

  it('a teleport resets the prediction', () => {
    const c = new ViewCull();
    c.update({ x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 }, 1 / 60, FOV, ASPECT, FAR);
    c.update({ x: 50, y: 1.6, z: 0, yaw: 0, pitch: 0 }, 1 / 60, FOV, ASPECT, FAR);
    expect(c.vx).toBe(0);
  });
});

describe('chunked map', () => {
  it('holds exactly the same geometry as the merged map, split into culling chunks', async () => {
    const { buildMapMeshes } = await import('../src/render/mapMesh');
    const { buildGrandStation } = await import('../src/world/mapData');
    const mat = new THREE.MeshBasicMaterial();
    const materials = { mats: new Proxy({}, { get: () => mat }) } as unknown as Parameters<typeof buildMapMeshes>[1];
    const L = buildGrandStation();
    const merged = buildMapMeshes(L, materials, false);
    const chunked = buildMapMeshes(L, materials, true);
    const count = (g: THREE.Group, batched: boolean): number => g.children.reduce((n, o) => {
      if (batched) {
        const b = o as THREE.BatchedMesh & { _geometryInfo?: { vertexCount: number }[] };
        return n + (b._geometryInfo ?? []).reduce((m, gi) => m + gi.vertexCount, 0);
      }
      return n + (o as THREE.Mesh).geometry.getAttribute('position').count;
    }, 0);
    expect(chunked.chunks.length).toBeGreaterThan(10);
    expect(count(chunked.group, true)).toBe(count(merged.group, false));
    // Same number of draw groups (one BatchedMesh per material group).
    expect(chunked.group.children.length).toBe(merged.group.children.length);
  });
});
