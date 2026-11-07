// Visual trains: four-car sets built from the same merged-box pipeline as the
// station (sharing its materials), moved as whole groups each frame from the
// simulation's train state. Door leaves are instanced and slide open/closed
// following TrainState.doors.

import * as THREE from 'three';
import type { TrainState } from '../sim/trains';
import type { MapLayout } from '../world/mapData';
import { buildTrainLayout } from '../world/trainCars';
import { mergeBoxes, type MapMaterials } from './mapMesh';


interface DoorDef { track: number; x: number; z: number; side: 1 | -1 }

export class TrainRenderer {
  readonly group = new THREE.Group();
  private readonly sets: THREE.Group[] = [];
  private readonly doors: DoorDef[] = [];
  private readonly leaves: THREE.InstancedMesh;
  private readonly panes: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();

  constructor(layout: MapLayout, materials: MapMaterials) {
    layout.tracks.forEach((tr, i) => {
      const car = buildTrainLayout(tr.z0, tr.z1, tr.railY);
      // Door leaves sit just outside the skin.
      for (const d of car.doors) this.doors.push({ track: i, x: d.x, z: d.z + d.side * 0.045, side: d.side });
      const set = mergeBoxes(car.visual, materials.mats, `train${i}`);
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

  /**
   * alpha: render interpolation between the last two simulation ticks. Moving
   * trains must be interpolated exactly like the (interpolated) camera, or a
   * rider sees the car judder and flicker against the view.
   */
  update(trains: readonly TrainState[], hideBeyondX: number, alpha = 1): void {
    for (const s of trains) {
      const set = this.sets[s.track];
      set.position.x = s.prevFrontX + (s.frontX - s.prevFrontX) * alpha;
      set.visible = s.frontX < hideBeyondX;
    }
    let i = 0;
    for (const d of this.doors) {
      const s = trains[d.track];
      const o = s.doors;
      const ease = o * o * (3 - 2 * o);
      const plug = Math.min(1, ease * 4) * 0.07 * d.side;
      const visible = s.frontX < hideBeyondX;
      const fx = s.prevFrontX + (s.frontX - s.prevFrontX) * alpha;
      for (const sgn of [-1, 1]) {
        if (visible) this.m.makeTranslation(fx + d.x + sgn * (0.31 + ease * 0.58), 0, d.z + plug);
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
