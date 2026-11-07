// Pooled visual effects. Each effect type is a single draw call (or a tiny
// fixed pool of meshes) and nothing allocates per frame.

import * as THREE from 'three';
import { Pool } from '../core/pool';
import type { Smoke } from '../sim/types';
import { smokePuffTexture } from './textures';

interface Tracer { active: boolean; life: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number }
interface Particle { active: boolean; life: number; maxLife: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }
interface Ripple { active: boolean; t: number; mesh: THREE.Mesh }
interface Casing { active: boolean; t: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; floor: number; rx: number; ry: number; spin: number; resting: boolean }

const TRACERS = 24;
const PARTICLES = 160;
const PUFFS_PER_SMOKE = 26;
const MAX_SMOKES = 8;
const RIPPLES = 6;
const MARKERS = 10;
const CASINGS = 12;
/** Seconds a spent casing lies on the floor before it's recycled. */
const CASING_LIFE = 6;

export class Effects {
  readonly group = new THREE.Group();
  private readonly tracers = new Pool<Tracer>(TRACERS, () => ({ active: false, life: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 }));
  private readonly tracerGeo = new THREE.BufferGeometry();
  private readonly tracerPos = new Float32Array(TRACERS * 6);
  private readonly tracerCol = new Float32Array(TRACERS * 6);

  private readonly particles = new Pool<Particle>(PARTICLES, () => ({ active: false, life: 0, maxLife: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  private readonly partGeo = new THREE.BufferGeometry();
  private readonly partPos = new Float32Array(PARTICLES * 3);
  private readonly partCol = new Float32Array(PARTICLES * 3);

  private readonly smokeGeo = new THREE.BufferGeometry();
  private readonly smokePos = new Float32Array(MAX_SMOKES * PUFFS_PER_SMOKE * 3);
  private readonly smokeCol = new Float32Array(MAX_SMOKES * PUFFS_PER_SMOKE * 3);
  private readonly puffOffsets: Float32Array;
  private readonly grenades: THREE.InstancedMesh;

  private readonly ripples: Pool<Ripple>;
  private readonly casings = new Pool<Casing>(CASINGS, () => ({ active: false, t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, floor: 0, rx: 0, ry: 0, spin: 0, resting: false }));
  private readonly casingMesh: THREE.InstancedMesh;
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v3 = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3(1, 1, 1);
  private readonly markers: THREE.Mesh[] = [];
  private time = 0;
  private readonly m4 = new THREE.Matrix4();
  /** 0..1 multiplier from the quality level. */
  particleScale = 1;

  constructor() {
    // Tracers.
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    const tracerLines = new THREE.LineSegments(
      this.tracerGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    tracerLines.frustumCulled = false;
    this.group.add(tracerLines);

    // Impact dust.
    this.partGeo.setAttribute('position', new THREE.BufferAttribute(this.partPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.partGeo.setAttribute('color', new THREE.BufferAttribute(this.partCol, 3).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(this.partGeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    this.group.add(pts);

    // Smoke puffs (one Points cloud for every grenade).
    this.smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.smokeGeo.setAttribute('color', new THREE.BufferAttribute(this.smokeCol, 3).setUsage(THREE.DynamicDrawUsage));
    const smokePts = new THREE.Points(this.smokeGeo, new THREE.PointsMaterial({
      size: 3.4, map: smokePuffTexture(), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.85,
    }));
    smokePts.frustumCulled = false;
    smokePts.renderOrder = 3;
    this.group.add(smokePts);
    this.puffOffsets = new Float32Array(PUFFS_PER_SMOKE * 4);
    for (let i = 0; i < PUFFS_PER_SMOKE; i++) {
      // Points distributed inside a unit sphere + a phase.
      let x, y, z;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
      } while (x * x + y * y + z * z > 1);
      this.puffOffsets.set([x * 0.75, y * 0.55, z * 0.75, Math.random() * 6.28], i * 4);
    }

    const gg = new THREE.SphereGeometry(0.07, 8, 6);
    this.grenades = new THREE.InstancedMesh(gg, new THREE.MeshBasicMaterial({ color: 0x8a8f96 }), MAX_SMOKES);
    this.grenades.count = 0;
    this.grenades.frustumCulled = false;
    this.group.add(this.grenades);

    // Spent brass: one instanced draw call, hidden when there is none. Shiny metal
    // so the station's environment map gives it a glint.
    const cg = new THREE.CylinderGeometry(0.0048, 0.0048, 0.019, 8);
    cg.rotateZ(Math.PI / 2);
    this.casingMesh = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xd2a650, metalness: 0.95, roughness: 0.22, envMapIntensity: 1.6 }), CASINGS);
    this.casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.casingMesh.frustumCulled = false;
    this.casingMesh.count = 0;
    this.casingMesh.visible = false;
    this.group.add(this.casingMesh);

    // Scanner ripples.
    const ringGeo = new THREE.RingGeometry(0.92, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.ripples = new Pool<Ripple>(RIPPLES, () => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      this.group.add(m);
      return { active: false, t: 0, mesh: m };
    });

    // Red reveal markers (visible through walls).
    const mg = new THREE.OctahedronGeometry(0.22, 0);
    mg.scale(1, 1.6, 1);
    const mm = new THREE.MeshBasicMaterial({ color: 0xff2a2a, depthTest: false, transparent: true, opacity: 0.9, fog: false });
    for (let i = 0; i < MARKERS; i++) {
      const m = new THREE.Mesh(mg, mm);
      m.visible = false;
      m.renderOrder = 10;
      this.group.add(m);
      this.markers.push(m);
    }
  }

  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const t = this.tracers.acquire();
    t.life = 0.14;
    t.ax = ax; t.ay = ay; t.az = az;
    t.bx = bx; t.by = by; t.bz = bz;
  }

  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, count = 10): void {
    const n = Math.max(2, Math.round(count * this.particleScale));
    for (let i = 0; i < n; i++) {
      const p = this.particles.acquire();
      p.x = x + nx * 0.02;
      p.y = y + ny * 0.02;
      p.z = z + nz * 0.02;
      p.vx = nx * 1.6 + (Math.random() - 0.5) * 2;
      p.vy = ny * 1.6 + Math.random() * 1.6;
      p.vz = nz * 1.6 + (Math.random() - 0.5) * 2;
      p.life = p.maxLife = 0.35 + Math.random() * 0.35;
    }
  }

  /** Eject a spent casing at a world position; it bounces and skitters on the floor at floorY. */
  casing(x: number, y: number, z: number, vx: number, vy: number, vz: number, floorY: number): void {
    const c = this.casings.acquire();
    c.t = 0;
    c.x = x; c.y = y; c.z = z;
    c.vx = vx; c.vy = vy; c.vz = vz;
    c.floor = floorY + 0.005;
    c.rx = Math.random() * 6.28;
    c.ry = Math.random() * 6.28;
    c.spin = 18 + Math.random() * 14;
    c.resting = false;
  }

  private updateCasings(dt: number): void {
    let n = 0;
    for (const c of this.casings.items) {
      if (!c.active) continue;
      c.t += dt;
      if (c.t > CASING_LIFE) {
        c.active = false;
        continue;
      }
      if (!c.resting) {
        c.vy -= 9.8 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.rx += c.spin * dt;
        c.ry += c.spin * 0.6 * dt;
        if (c.y <= c.floor) {
          // Bounce off the stone, lose energy, skitter sideways.
          c.y = c.floor;
          c.vy = -c.vy * 0.38;
          c.vx = c.vx * 0.55 + (Math.random() - 0.5) * 0.5;
          c.vz = c.vz * 0.55 + (Math.random() - 0.5) * 0.5;
          c.spin *= 0.6;
          if (Math.abs(c.vy) < 0.25) {
            c.vy = 0;
            c.spin *= 0.9;
            const sp = Math.hypot(c.vx, c.vz);
            if (sp < 0.05) c.resting = true;
          }
        }
        if (c.y <= c.floor + 1e-3 && c.vy === 0) {
          // Rolling friction.
          c.vx *= Math.max(0, 1 - 3 * dt);
          c.vz *= Math.max(0, 1 - 3 * dt);
          c.rx = Math.PI / 2;
        }
      }
      this.e.set(c.rx, c.ry, 0);
      this.q.setFromEuler(this.e);
      this.v3.set(c.x, c.y, c.z);
      this.m4.compose(this.v3, this.q, this.s3);
      this.casingMesh.setMatrixAt(n++, this.m4);
    }
    this.casingMesh.count = n;
    this.casingMesh.visible = n > 0;
    if (n) this.casingMesh.instanceMatrix.needsUpdate = true;
  }

  ripple(x: number, y: number, z: number): void {
    const r = this.ripples.acquire();
    r.t = 0;
    r.mesh.position.set(x, y + 0.08, z);
    r.mesh.visible = true;
  }

  update(dt: number, smokes: readonly Smoke[], revealed: readonly { x: number; y: number; z: number }[], cam: THREE.Vector3): void {
    this.time += dt;
    this.updateCasings(dt);
    // Tracers.
    let i = 0;
    for (const t of this.tracers.items) {
      const o = i * 6;
      if (t.active) {
        t.life -= dt;
        if (t.life <= 0) t.active = false;
      }
      if (t.active) {
        const k = t.life / 0.14;
        this.tracerPos[o] = t.ax; this.tracerPos[o + 1] = t.ay; this.tracerPos[o + 2] = t.az;
        this.tracerPos[o + 3] = t.bx; this.tracerPos[o + 4] = t.by; this.tracerPos[o + 5] = t.bz;
        this.tracerCol[o] = 0.25 * k; this.tracerCol[o + 1] = 0.22 * k; this.tracerCol[o + 2] = 0.18 * k;
        this.tracerCol[o + 3] = 0.9 * k; this.tracerCol[o + 4] = 0.8 * k; this.tracerCol[o + 5] = 0.6 * k;
      } else {
        this.tracerPos.fill(0, o, o + 6);
        this.tracerCol.fill(0, o, o + 6);
      }
      i++;
    }
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;

    // Particles.
    i = 0;
    for (const p of this.particles.items) {
      const o = i * 3;
      if (p.active) {
        p.life -= dt;
        if (p.life <= 0) p.active = false;
        p.vy -= 9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      if (p.active) {
        const k = p.life / p.maxLife;
        this.partPos[o] = p.x; this.partPos[o + 1] = p.y; this.partPos[o + 2] = p.z;
        this.partCol[o] = 0.75 * k; this.partCol[o + 1] = 0.68 * k; this.partCol[o + 2] = 0.55 * k;
      } else {
        this.partPos[o] = 0; this.partPos[o + 1] = -100; this.partPos[o + 2] = 0;
      }
      i++;
    }
    this.partGeo.attributes.position.needsUpdate = true;
    this.partGeo.attributes.color.needsUpdate = true;

    // Smoke.
    const puffs = Math.max(8, Math.round(PUFFS_PER_SMOKE * this.particleScale));
    let g = 0;
    for (let si = 0; si < MAX_SMOKES; si++) {
      const sm = smokes[si];
      for (let pi = 0; pi < PUFFS_PER_SMOKE; pi++) {
        const o = (si * PUFFS_PER_SMOKE + pi) * 3;
        if (!sm || !sm.active || sm.phase !== 'cloud' || pi >= puffs) {
          this.smokePos[o + 1] = -100;
          continue;
        }
        const q = pi * 4;
        const ph = this.puffOffsets[q + 3];
        const drift = 0.18 * Math.sin(this.time * 0.6 + ph);
        this.smokePos[o] = sm.x + (this.puffOffsets[q] + drift) * sm.radius;
        this.smokePos[o + 1] = sm.y + this.puffOffsets[q + 1] * sm.radius + 0.1 * Math.sin(this.time * 0.4 + ph * 2);
        this.smokePos[o + 2] = sm.z + (this.puffOffsets[q + 2] - drift) * sm.radius;
        const shade = 0.55 + 0.12 * Math.sin(ph * 3);
        this.smokeCol[o] = shade; this.smokeCol[o + 1] = shade; this.smokeCol[o + 2] = shade * 1.02;
      }
      if (sm && sm.active && sm.phase === 'flying') {
        this.grenades.setMatrixAt(g++, this.m4.makeTranslation(sm.x, sm.y, sm.z));
      }
    }
    this.grenades.count = g;
    if (g) this.grenades.instanceMatrix.needsUpdate = true;
    this.smokeGeo.attributes.position.needsUpdate = true;
    this.smokeGeo.attributes.color.needsUpdate = true;

    // Ripples.
    this.ripples.forEachActive((r) => {
      r.t += dt;
      const k = r.t / 1.3;
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
        return;
      }
      const s = 0.5 + k * 7;
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    });

    // Markers.
    for (let m = 0; m < MARKERS; m++) {
      const mk = this.markers[m];
      const p = revealed[m];
      if (!p) {
        mk.visible = false;
        continue;
      }
      mk.visible = true;
      mk.position.set(p.x, p.y + 2.35 + Math.sin(this.time * 4) * 0.08, p.z);
      mk.rotation.y = this.time * 2;
      // Keep the marker readable at range.
      mk.scale.setScalar(Math.max(1, mk.position.distanceTo(cam) / 12));
    }
  }

  /** Reflections for the brass. */
  setEnvironment(env: THREE.Texture): void {
    const m = this.casingMesh.material as THREE.MeshStandardMaterial;
    m.envMap = env;
    m.needsUpdate = true;
  }

  clear(): void {
    this.tracers.clear();
    this.particles.clear();
    this.casings.clear();
    this.casingMesh.count = 0;
    this.casingMesh.visible = false;
    this.ripples.forEachActive((r) => {
      r.active = false;
      r.mesh.visible = false;
    });
  }
}
