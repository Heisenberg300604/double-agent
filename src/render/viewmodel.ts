// First-person silenced pistol + sleeve, rendered in its own pass so it never
// clips into walls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  return g;
}

const HIP = new THREE.Vector3(0.17, -0.18, -0.42);
const ADS = new THREE.Vector3(0, -0.062, -0.34);

export class Viewmodel {
  private readonly tmp = new THREE.Vector3();
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();
  private drawn = 0;
  private aim = 0;
  private recoil = 0;
  private reload = 0;
  private bob = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    const metal = new THREE.MeshLambertMaterial({ color: 0x1b1c1f });
    const dark = new THREE.MeshLambertMaterial({ color: 0x0c0c0d });
    const sleeve = new THREE.MeshLambertMaterial({ color: 0x2a2c30 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9b293 });
    const cuff = new THREE.MeshLambertMaterial({ color: 0xd8d8d2 });

    const gun = new THREE.Mesh(mergeGeometries([
      box(0.032, 0.036, 0.19, 0, 0.02, -0.02), // slide
      box(0.03, 0.09, 0.045, 0, -0.035, 0.045), // grip
      box(0.012, 0.03, 0.04, 0, -0.01, 0.0), // trigger guard
    ])!, metal);
    const supp = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 12).rotateX(Math.PI / 2).translate(0, 0.022, -0.19), dark);
    const hand = new THREE.Mesh(box(0.05, 0.06, 0.08, 0, -0.04, 0.05), skin);
    const cuffM = new THREE.Mesh(box(0.065, 0.07, 0.03, 0, -0.045, 0.105), cuff);
    // Forearm angles down and to the right from the hand so it never reaches the near plane.
    const armGeo = box(0.07, 0.075, 0.3, 0, 0, 0.15);
    armGeo.rotateX(0.55);
    armGeo.rotateY(0.45);
    armGeo.translate(0, -0.05, 0.1);
    const arm = new THREE.Mesh(armGeo, sleeve);
    this.root.add(gun, supp, hand, cuffM, arm);
    this.root.scale.setScalar(0.85);
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0xffe2bf, 0x202024, 1.6));
    const d = new THREE.DirectionalLight(0xffd7a8, 1.6);
    d.position.set(0.5, 1, 0.3);
    this.scene.add(d);
  }

  kick(): void {
    this.recoil = 1;
  }

  update(dt: number, drawn: boolean, aiming: boolean, reloading: boolean, moveSpeed: number, aspect: number, fov: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    const k = 1 - Math.exp(-14 * dt);
    this.drawn += ((drawn ? 1 : 0) - this.drawn) * k;
    this.aim += ((aiming ? 1 : 0) - this.aim) * k;
    this.reload += ((reloading ? 1 : 0) - this.reload) * (1 - Math.exp(-10 * dt));
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.bob += dt * moveSpeed * 2.6;

    const p = this.tmp.copy(HIP).lerp(ADS, this.aim);
    p.y -= (1 - this.drawn) * 0.45;
    p.y -= this.reload * 0.12;
    const bobAmt = (1 - this.aim * 0.8) * Math.min(1, moveSpeed / 2.2);
    p.x += Math.sin(this.bob) * 0.008 * bobAmt;
    p.y += Math.abs(Math.cos(this.bob)) * 0.01 * bobAmt;
    p.z += this.recoil * 0.05;
    this.root.position.copy(p);
    this.root.rotation.set(this.recoil * 0.25 - this.reload * 0.6, 0, this.reload * 0.4);
    this.root.visible = this.drawn > 0.02;
  }
}
