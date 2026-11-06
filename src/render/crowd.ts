// Every human (spies + civilians) is one InstancedMesh draw call. The walk
// cycle, sitting, crouching, aiming and death poses run in the vertex shader
// from per-instance attributes. Optional parts (hat, glasses, tie, briefcase,
// gun) are collapsed to zero size when the instance flag is off.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Agent } from '../sim/types';
import { softCircleTexture } from './textures';
import { CONFIG } from '../config';

// Part ids (must match the shader).
const P = {
  torso: 0, legL: 1, legR: 2, armL: 3, armR: 4, head: 5, hat: 6, glasses: 7,
  tie: 8, shirt: 9, briefcase: 10, gun: 11, handL: 12, handR: 13,
} as const;

export const FLAG_HAT = 1, FLAG_GLASSES = 2, FLAG_BRIEFCASE = 4, FLAG_GUN = 8, FLAG_TIE = 16;

function part(w: number, h: number, d: number, x: number, y: number, z: number, id: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(id), 1));
  return g;
}

/** Low-poly human, feet at y=0, facing -Z. */
export function buildHumanGeometry(): THREE.BufferGeometry {
  const parts = [
    part(0.46, 0.72, 0.26, 0, 1.13, 0, P.torso),
    part(0.17, 0.86, 0.19, -0.11, 0.43, 0, P.legL),
    part(0.17, 0.86, 0.19, 0.11, 0.43, 0, P.legR),
    part(0.12, 0.6, 0.14, -0.3, 1.17, 0, P.armL),
    part(0.12, 0.6, 0.14, 0.3, 1.17, 0, P.armR),
    part(0.1, 0.1, 0.12, -0.3, 0.83, 0, P.handL),
    part(0.1, 0.1, 0.12, 0.3, 0.83, 0, P.handR),
    part(0.22, 0.27, 0.24, 0, 1.65, 0, P.head),
    part(0.38, 0.03, 0.38, 0, 1.8, 0, P.hat),
    part(0.25, 0.13, 0.25, 0, 1.86, 0, P.hat),
    part(0.21, 0.05, 0.02, 0, 1.68, -0.125, P.glasses),
    part(0.065, 0.36, 0.02, 0, 1.3, -0.137, P.tie),
    part(0.15, 0.2, 0.012, 0, 1.38, -0.131, P.shirt),
    part(0.34, 0.25, 0.08, -0.3, 0.68, 0, P.briefcase),
    part(0.05, 0.26, 0.07, 0.3, 0.72, -0.02, P.gun),
  ];
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

const ANIM_GLSL = /* glsl */ `
attribute float aPart;
attribute vec3 aCoat;
attribute vec3 aTie;
attribute vec3 aHat;
attribute vec4 aAnim;   // phase, swing amplitude, flags, pose (0 stand, 1 sit, 2 dead)
attribute vec4 aExtra;  // skin tone, crouch, aim, unused
varying vec3 vCol;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
float flagBit(float flags, float b) { return mod(floor(flags / b + 0.001), 2.0); }
bool isPart(float id) { return abs(aPart - id) < 0.5; }

void animate(inout vec3 p, inout vec3 n) {
  float flags = aAnim.z;
  float pose = aAnim.w;
  float sw = sin(aAnim.x) * aAnim.y;
  float crouch = aExtra.y;
  float aim = aExtra.z;
  bool sit = pose > 0.5 && pose < 1.5;
  bool dead = pose > 1.5;

  float vis = 1.0;
  if (isPart(6.0)) vis = flagBit(flags, 1.0);
  if (isPart(7.0)) vis = flagBit(flags, 2.0);
  if (isPart(10.0)) vis = flagBit(flags, 4.0);
  if (isPart(11.0)) vis = flagBit(flags, 8.0);
  if (isPart(8.0) || isPart(9.0)) vis = flagBit(flags, 16.0);

  // Limbs swing around hip / shoulder pivots.
  if (isPart(1.0) || isPart(2.0)) {
    float a = isPart(1.0) ? sw : -sw;
    if (sit) a = 1.45;
    vec3 pv = vec3(0.0, 0.86, 0.0);
    mat3 r = rotX(a);
    p = r * (p - pv) + pv;
    n = r * n;
  } else if (isPart(3.0) || isPart(10.0) || isPart(12.0)) {
    float a = sit ? 0.35 : -sw * 0.8;
    vec3 pv = vec3(0.0, 1.45, 0.0);
    mat3 r = rotX(a);
    p = r * (p - pv) + pv;
    n = r * n;
  } else if (isPart(4.0) || isPart(11.0) || isPart(13.0)) {
    float a = sit ? 0.35 : sw * 0.8;
    a = mix(a, 1.5, aim);
    vec3 pv = vec3(0.0, 1.45, 0.0);
    mat3 r = rotX(a);
    p = r * (p - pv) + pv;
    n = r * n;
  }

  // Crouch: compress legs, lower everything else.
  if (isPart(1.0) || isPart(2.0)) p.y *= 1.0 - 0.48 * crouch;
  else p.y -= 0.42 * crouch;

  if (sit) p.y -= 0.4;

  if (dead) {
    mat3 r = rotX(-1.5708);
    p = r * p;
    n = r * n;
    p.y += 0.14;
  }
  p *= vis;
}

vec3 partColor() {
  vec3 skin = mix(vec3(0.93, 0.76, 0.62), vec3(0.40, 0.27, 0.19), aExtra.x);
  vec3 col = aCoat;
  if (isPart(1.0) || isPart(2.0)) col = aCoat * 0.55 + vec3(0.025);
  else if (isPart(5.0) || isPart(12.0) || isPart(13.0)) col = skin;
  else if (isPart(6.0)) col = aHat;
  else if (isPart(7.0)) col = vec3(0.04);
  else if (isPart(8.0)) col = aTie;
  else if (isPart(9.0)) col = vec3(0.82, 0.82, 0.79);
  else if (isPart(10.0)) col = vec3(0.24, 0.15, 0.08);
  else if (isPart(11.0)) col = vec3(0.05);
  return col;
}
`;

const MAX_OUTLINES = 12;

interface InstanceBuffers {
  coat: THREE.InstancedBufferAttribute;
  tie: THREE.InstancedBufferAttribute;
  hat: THREE.InstancedBufferAttribute;
  anim: THREE.InstancedBufferAttribute;
  extra: THREE.InstancedBufferAttribute;
}

function addInstanceAttributes(g: THREE.BufferGeometry, n: number): InstanceBuffers {
  const mk = (size: number): THREE.InstancedBufferAttribute => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const b = { coat: mk(3), tie: mk(3), hat: mk(3), anim: mk(4), extra: mk(4) };
  g.setAttribute('aCoat', b.coat);
  g.setAttribute('aTie', b.tie);
  g.setAttribute('aHat', b.hat);
  g.setAttribute('aAnim', b.anim);
  g.setAttribute('aExtra', b.extra);
  return b;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();

export class CrowdRenderer {
  readonly mesh: THREE.InstancedMesh;
  readonly outline: THREE.InstancedMesh;
  readonly shadows: THREE.InstancedMesh;
  private readonly buf: InstanceBuffers;
  private readonly obuf: InstanceBuffers;
  /** agent id → instance index (or -1), for the current frame. */
  readonly instanceOf: Int32Array;

  constructor(capacity: number) {
    const geo = buildHumanGeometry();
    this.buf = addInstanceAttributes(geo, capacity);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = ANIM_GLSL + shader.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normal; vec3 animP = position; animate(animP, objectNormal); vCol = partColor();')
        .replace('#include <begin_vertex>', 'vec3 transformed = animP;');
      shader.fragmentShader = 'varying vec3 vCol;\n' + shader.fragmentShader
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vCol, opacity );');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'crowd';

    // Outline pass: same animation, expanded along normals, back faces, red.
    const ogeo = buildHumanGeometry();
    this.obuf = addInstanceAttributes(ogeo, MAX_OUTLINES);
    const omat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, side: THREE.BackSide, transparent: true, opacity: 0.85, fog: false });
    omat.onBeforeCompile = (shader) => {
      shader.vertexShader = ANIM_GLSL + shader.vertexShader.replace(
        '#include <begin_vertex>',
        'vec3 animP = position; vec3 animN = normal; animate(animP, animN); vCol = partColor(); vec3 transformed = animP + normalize(animN) * 0.035 * step(0.001, length(animP));',
      );
    };
    this.outline = new THREE.InstancedMesh(ogeo, omat, MAX_OUTLINES);
    this.outline.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.outline.frustumCulled = false;
    this.outline.count = 0;
    this.outline.renderOrder = 2;

    const sgeo = new THREE.PlaneGeometry(1, 1);
    sgeo.rotateX(-Math.PI / 2);
    const smat = new THREE.MeshBasicMaterial({
      map: softCircleTexture('rgba(0,0,0,0.75)'), transparent: true, depthWrite: false, opacity: 0.8,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.shadows = new THREE.InstancedMesh(sgeo, smat, capacity);
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    this.shadows.renderOrder = 1;

    this.instanceOf = new Int32Array(capacity).fill(-1);
  }

  private writeInstance(buf: InstanceBuffers, mesh: THREE.InstancedMesh, i: number, a: Agent, alpha: number): void {
    const ap = a.appearance;
    const x = a.px + (a.x - a.px) * alpha;
    const y = a.py + (a.y - a.py) * alpha;
    const z = a.pz + (a.z - a.pz) * alpha;
    tmpP.set(x, y, z);
    tmpQ.setFromAxisAngle(UP, a.yaw);
    tmpS.setScalar(ap.scale);
    tmpM.compose(tmpP, tmpQ, tmpS);
    mesh.setMatrixAt(i, tmpM);

    col.setHex(ap.coat).convertSRGBToLinear();
    buf.coat.setXYZ(i, col.r, col.g, col.b);
    if (ap.tie >= 0) col.setHex(ap.tie).convertSRGBToLinear();
    buf.tie.setXYZ(i, col.r, col.g, col.b);
    col.setHex(ap.hatColor).convertSRGBToLinear();
    buf.hat.setXYZ(i, col.r, col.g, col.b);

    let flags = 0;
    if (ap.hat) flags |= FLAG_HAT;
    if (ap.glasses) flags |= FLAG_GLASSES;
    if (ap.briefcase && !(a.spy && a.spy.drawn)) flags |= FLAG_BRIEFCASE;
    if (a.spy && a.spy.drawn) flags |= FLAG_GUN;
    if (ap.tie >= 0) flags |= FLAG_TIE;
    const pose = a.pose === 'sit' ? 1 : a.pose === 'dead' ? 2 : 0;
    const walk = Math.min(1, a.speed / 2.2);
    const amp = pose === 0 ? 0.55 * walk + 0.12 * Math.max(0, Math.min(1, (a.speed - 2.4) / 2.6)) : 0;
    buf.anim.setXYZW(i, a.animPhase, amp, flags, pose);
    const aim = a.spy && a.spy.aiming ? 1 : a.spy && a.spy.drawn ? 0.55 : 0;
    buf.extra.setXYZW(i, ap.skin, a.crouch ? 1 : 0, aim, 0);
  }

  /**
   * Write all visible humans. `outlined` lists agent ids that get the red outline.
   * `hideId` is the first-person player.
   */
  update(agents: readonly Agent[], alpha: number, hideId: number, outlined: readonly number[]): void {
    let n = 0;
    let s = 0;
    const linger = CONFIG.match.bodyLingerSeconds;
    const civLinger = CONFIG.match.civilianBodyLingerSeconds;
    for (const a of agents) {
      this.instanceOf[a.id] = -1;
      if (a.id === hideId) continue;
      if (!a.alive && a.deadTime > (a.spy ? linger : civLinger)) continue;
      this.writeInstance(this.buf, this.mesh, n, a, alpha);
      this.instanceOf[a.id] = n;
      n++;
      if (a.alive) {
        const x = a.pose === 'sit' ? a.seatX : a.px + (a.x - a.px) * alpha;
        const z = a.pose === 'sit' ? a.seatZ : a.pz + (a.z - a.pz) * alpha;
        const y = a.py + (a.y - a.py) * alpha;
        tmpP.set(x, y + 0.03, z);
        tmpQ.identity();
        tmpS.set(0.95, 1, 0.95);
        tmpM.compose(tmpP, tmpQ, tmpS);
        this.shadows.setMatrixAt(s++, tmpM);
      }
    }
    this.mesh.count = n;
    this.shadows.count = s;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    for (const k of ['coat', 'tie', 'hat', 'anim', 'extra'] as const) this.buf[k].needsUpdate = true;

    let o = 0;
    for (const id of outlined) {
      if (o >= MAX_OUTLINES) break;
      const a = agents[id];
      if (!a || !a.alive || a.id === hideId) continue;
      this.writeInstance(this.obuf, this.outline, o++, a, alpha);
    }
    this.outline.count = o;
    if (o > 0) {
      this.outline.instanceMatrix.needsUpdate = true;
      for (const k of ['coat', 'tie', 'hat', 'anim', 'extra'] as const) this.obuf[k].needsUpdate = true;
    }
  }
}
