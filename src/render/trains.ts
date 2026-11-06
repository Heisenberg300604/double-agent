// Visual trains: four-car sets built from the same merged-box pipeline as the
// station (sharing its materials), moved as whole groups each frame from the
// simulation's train state. Door leaves are instanced and slide open/closed
// following TrainState.doors.

import * as THREE from 'three';
import { CONFIG } from '../config';
import { carOffset, type TrainState } from '../sim/trains';
import type { Box, MapLayout, MatId, Shape } from '../world/mapData';
import { mergeBoxes, type MapMaterials } from './mapMesh';

const T = CONFIG.trains;

interface DoorDef { track: number; x: number; z: number; side: 1 | -1 }

function trainBoxes(z0: number, z1: number, railY: number, track: number, doors: DoorDef[]): Box[] {
  const boxes: Box[] = [];
  const box = (x0: number, x1: number, y0: number, y1: number, a: number, b: number, mat: MatId, shape: Shape = 'box'): void => {
    boxes.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: y0, maxY: y1, minZ: Math.min(a, b), maxZ: Math.max(a, b), mat, collide: false, shape });
  };
  const a = z0 + 0.06, b = z1 - 0.06, zc = (z0 + z1) / 2;
  const L = T.carLength;
  for (let c = 0; c < T.cars; c++) {
    const x0 = carOffset(c), x1 = x0 + L;
    box(x0, x1, 0.5, 1.72, a, b, 'trainBody');
    box(x0, x1, 1.72, 1.9, a - 0.01, b + 0.01, 'trainCream');
    box(x0, x1, 1.9, 3.25, a, b, 'trainBody');
    box(x0, x1, 3.05, 3.2, a - 0.01, b + 0.01, 'trainCream');
    box(x0 + 0.05, x1 - 0.05, 2.75, 4.05, a + 0.05, b - 0.05, 'trainRoof', 'cylX');
    box(x0, x1, 1.86, 1.89, a - 0.03, b + 0.03, 'brass');
    box(x0 + 0.1, x1 - 0.1, 0.05, 0.52, a + 0.15, b - 0.15, 'trainDark');
    // Bogies with wheels sitting on the rails.
    for (const bx of [x0 + 2.6, x1 - 2.6]) {
      box(bx - 1.4, bx + 1.4, railY + 0.25, 0.1, zc - 1.15, zc + 1.15, 'trainDark');
      for (const wx of [bx - 0.9, bx + 0.9]) {
        for (const wz of [zc - 0.72, zc + 0.72]) box(wx - 0.45, wx + 0.45, railY + 0.02, railY + 0.92, wz - 0.07, wz + 0.07, 'rubber', 'cylZ');
      }
    }
    // Windows with frames on both sides.
    for (let wx = x0 + 3.3; wx + 1.2 < x1 - 3.1; wx += 1.45) {
      for (const [zf, d] of [[a, -1], [b, 1]] as [number, number][]) {
        box(wx - 0.05, wx + 1.25, 2.05, 2.95, zf + d * 0.005, zf + d * 0.02, 'rubber');
        box(wx, wx + 1.2, 2.1, 2.9, zf + d * 0.015, zf + d * 0.03, 'glassWarm');
      }
    }
    // Door openings (dark recess + lit vestibule); leaves are instanced separately.
    for (const dx of [x0 + 1.9, x1 - 1.9]) {
      for (const [zf, d, side] of [[a, -1, -1], [b, 1, 1]] as [number, number, 1 | -1][]) {
        // Layering outward from the body: dark frame, lit vestibule (seen when the leaves open), leaves.
        box(dx - 0.72, dx + 0.72, 0.52, 3.0, zf + d * 0.005, zf + d * 0.02, 'rubber');
        box(dx - 0.62, dx + 0.62, 0.55, 2.92, zf + d * 0.021, zf + d * 0.03, 'glassWarm');
        doors.push({ track, x: dx, z: zf + d * 0.045, side });
      }
    }
    for (let vx = x0 + 1.6; vx < x1 - 1; vx += 2.8) box(vx, vx + 0.9, 3.95, 4.15, zc - 0.4, zc + 0.4, 'trainRoof');
    if (c === 1) {
      box(x0 + 5, x0 + 6.4, 4.05, 4.2, zc - 0.7, zc + 0.7, 'metal');
      box(x0 + 5.6, x0 + 5.68, 4.2, 5.0, zc - 0.03, zc + 0.03, 'metal');
      box(x0 + 5.1, x0 + 6.3, 5.0, 5.05, zc - 0.9, zc + 0.9, 'chrome');
    }
    // Gangway to the next car.
    if (c < T.cars - 1) box(x1 - 0.05, x1 + T.carGap + 0.05, 0.6, 3.3, zc - 1.1, zc + 1.1, 'trainDark');
  }
  // Driving cabs at both ends (trains leave the terminus the way they came).
  const total = carOffset(T.cars - 1) + L;
  for (const [xf, dir] of [[0, -1], [total, 1]] as [number, number][]) {
    const out = (d: number): number => xf + dir * d;
    box(out(0), out(0.18), 0.5, 3.25, a + 0.2, b - 0.2, 'trainBody');
    box(out(0.18), out(0.22), 2.05, 2.95, a + 0.45, b - 0.45, 'glass');
    box(out(0.18), out(0.22), 3.05, 3.3, a + 0.8, b - 0.8, 'led');
    box(out(0.17), out(0.2), 1.72, 1.9, a + 0.2, b - 0.2, 'trainCream');
    box(out(0.18), out(0.25), 0.5, 0.75, a + 0.3, b - 0.3, 'yellow');
    for (const hz of [a + 0.55, b - 0.55]) box(out(0.12), out(0.28), 0.96, 1.24, hz - 0.14, hz + 0.14, 'bulb', 'sph');
  }
  return boxes;
}

export class TrainRenderer {
  readonly group = new THREE.Group();
  private readonly sets: THREE.Group[] = [];
  private readonly doors: DoorDef[] = [];
  private readonly leaves: THREE.InstancedMesh;
  private readonly panes: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();

  constructor(layout: MapLayout, materials: MapMaterials) {
    layout.tracks.forEach((tr, i) => {
      const set = mergeBoxes(trainBoxes(tr.z0, tr.z1, tr.railY, i, this.doors), materials.mats, `train${i}`);
      this.sets.push(set);
      this.group.add(set);
    });
    const n = this.doors.length * 2;
    const leafGeo = new THREE.BoxGeometry(0.6, 2.36, 0.05);
    leafGeo.translate(0, 1.73, 0);
    this.leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2a405a, roughness: 0.3, metalness: 0.3 }), n);
    const paneGeo = new THREE.BoxGeometry(0.4, 0.75, 0.06);
    paneGeo.translate(0, 2.35, 0);
    this.panes = new THREE.InstancedMesh(paneGeo, new THREE.MeshBasicMaterial({ color: 0x8a6236 }), n);
    for (const mesh of [this.leaves, this.panes]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    materials.envMaterials.push(this.leaves.material as THREE.MeshStandardMaterial);
  }

  update(trains: readonly TrainState[], hideBeyondX: number): void {
    for (const s of trains) {
      const set = this.sets[s.track];
      set.position.x = s.frontX;
      set.visible = s.frontX < hideBeyondX;
    }
    let i = 0;
    for (const d of this.doors) {
      const s = trains[d.track];
      const o = s.doors;
      const ease = o * o * (3 - 2 * o);
      const plug = Math.min(1, ease * 4) * 0.07 * d.side;
      const visible = s.frontX < hideBeyondX;
      for (const sgn of [-1, 1]) {
        if (visible) this.m.makeTranslation(s.frontX + d.x + sgn * (0.31 + ease * 0.58), 0, d.z + plug);
        else this.m.makeScale(0, 0, 0);
        this.leaves.setMatrixAt(i, this.m);
        this.panes.setMatrixAt(i, this.m);
        i++;
      }
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    this.panes.instanceMatrix.needsUpdate = true;
  }
}
