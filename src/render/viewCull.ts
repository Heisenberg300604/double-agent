// View culling with look-ahead. Each frame we build two slightly widened view
// frusta: where the camera is looking now, and where it will be looking a
// moment from now, extrapolated from how fast the view is turning (mouse) and
// moving (WASD). Anything outside both is skipped: crowd instances and map
// chunks. Predicting ahead means things are already drawn when a fast flick
// brings them on screen, instead of popping in a frame late.

import * as THREE from 'three';
import { CONFIG } from '../config';

export interface CullPose { x: number; y: number; z: number; yaw: number; pitch: number }

const R = CONFIG.render;

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class ViewCull {
  private readonly now = new THREE.Frustum();
  private readonly ahead = new THREE.Frustum();
  private readonly cam = new THREE.PerspectiveCamera();
  private readonly m = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private prev: CullPose | null = null;
  /** Smoothed view velocities (rad/s, m/s). */
  yawVel = 0;
  pitchVel = 0;
  vx = 0;
  vz = 0;
  enabled = true;

  /** Call once per frame with the camera pose (before culling anything). */
  update(p: CullPose, dt: number, fovDeg: number, aspect: number, far: number): void {
    if (this.prev && dt > 0) {
      const jump = Math.hypot(p.x - this.prev.x, p.z - this.prev.z);
      if (jump > 3) {
        // Teleport (respawn, ride): no meaningful velocity.
        this.yawVel = this.pitchVel = this.vx = this.vz = 0;
      } else {
        const k = 1 - Math.exp(-dt / R.cullSmoothing);
        const clampA = (v: number): number => Math.max(-R.cullMaxTurn, Math.min(R.cullMaxTurn, v));
        this.yawVel += (clampA(wrap(p.yaw - this.prev.yaw) / dt) - this.yawVel) * k;
        this.pitchVel += (clampA((p.pitch - this.prev.pitch) / dt) - this.pitchVel) * k;
        this.vx += ((p.x - this.prev.x) / dt - this.vx) * k;
        this.vz += ((p.z - this.prev.z) / dt - this.vz) * k;
      }
    }
    this.prev = { ...p };
    const fov = Math.min(170, fovDeg + R.cullMarginDeg);
    this.build(this.now, p.x, p.y, p.z, p.yaw, p.pitch, fov, aspect, far);
    const t = R.cullLookahead;
    this.build(this.ahead, p.x + this.vx * t, p.y, p.z + this.vz * t, p.yaw + this.yawVel * t, Math.max(-1.5, Math.min(1.5, p.pitch + this.pitchVel * t)), fov, aspect, far);
  }

  private build(f: THREE.Frustum, x: number, y: number, z: number, yaw: number, pitch: number, fov: number, aspect: number, far: number): void {
    const c = this.cam;
    c.fov = fov;
    c.aspect = aspect;
    c.near = 0.05;
    c.far = far;
    c.position.set(x, y, z);
    c.rotation.order = 'YXZ';
    c.rotation.set(pitch, yaw, 0);
    c.updateMatrixWorld(true);
    c.updateProjectionMatrix();
    this.m.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    f.setFromProjectionMatrix(this.m);
  }

  /** Is a sphere visible now or about to be? Anything within nearRadius of the camera always is. */
  sphereVisible(x: number, y: number, z: number, r: number): boolean {
    if (!this.enabled || !this.prev) return true;
    const p = this.prev;
    if (Math.abs(x - p.x) + Math.abs(z - p.z) < R.cullNearRadius) return true;
    this.sphere.center.set(x, y, z);
    this.sphere.radius = r;
    return this.now.intersectsSphere(this.sphere) || this.ahead.intersectsSphere(this.sphere);
  }

  boxVisible(b: THREE.Box3): boolean {
    if (!this.enabled || !this.prev) return true;
    return this.now.intersectsBox(b) || this.ahead.intersectsBox(b);
  }
}
