// Every human (spies + civilians) is one InstancedMesh draw call. A small
// jointed rig (hips, knees, shoulders, elbows, neck, waist) is animated in the
// vertex shader from per-instance attributes: walk/run cycles, sitting,
// crouching, aiming, idle activities (talking, reading, phone, waiting),
// breathing and glances. Optional parts collapse to zero when their flag is off.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Agent } from '../sim/types';
import type { Poi } from '../world/mapData';
import { softCircleTexture } from './textures';
import { CONFIG } from '../config';

// Part ids (injected into the shader as constants, so they cannot drift).
const P = {
  PELVIS: 0, WAIST: 1, CHEST: 2, TAILS: 3, LONGCOAT: 4, SKIRT: 5,
  NECK: 6, HEAD: 7, NOSE: 8, HAIRCAP: 9, HAIRLONG: 10, HAIRBUN: 11, HAT: 12, GLASSES: 13,
  TIE: 14, COLLAR: 15, SCARF: 16,
  UARM_L: 17, UARM_R: 18, FARM_L: 19, FARM_R: 20, HAND_L: 21, HAND_R: 22,
  THIGH_L: 23, THIGH_R: 24, SHIN_L: 25, SHIN_R: 26, SHOE_L: 27, SHOE_R: 28,
  BRIEFCASE: 29, SHOULDERBAG: 30, BACKPACK: 31, GUN: 32, PAPER: 33, PHONE: 34, LAPEL: 35, BELT: 36,
} as const;

export const FLAG = {
  HAT: 1, GLASSES: 2, TIE: 4, GUN: 8, BRIEFCASE: 16, SHOULDERBAG: 32, BACKPACK: 64,
  SCARF: 128, SKIRT: 256, LONGCOAT: 512, PAPER: 1024, PHONE: 2048,
} as const;

/** Idle activity codes (aStyle.z). */
const ACT = { NONE: 0, TALK: 1, READ: 2, PHONE: 3, WAIT: 4, LOOK_UP: 5 } as const;

function part(w: number, h: number, d: number, x: number, y: number, z: number, id: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(id), 1));
  return g;
}

/** Tapered box: top and bottom widths differ (for torsos, coats, skirts). */
function taper(wTop: number, wBot: number, h: number, dTop: number, dBot: number, x: number, y: number, z: number, id: number): THREE.BufferGeometry {
  const g = part(1, h, 1, 0, 0, 0, id);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > 0;
    pos.setX(i, pos.getX(i) * (top ? wTop : wBot));
    pos.setZ(i, pos.getZ(i) * (top ? dTop : dBot));
  }
  g.translate(x, y, z);
  g.computeVertexNormals();
  return g;
}

/** Low-poly human, feet at y=0, facing -Z, ~1.8 m. */
export function buildHumanGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const L = s < 0;
    const x = 0.095 * s;
    parts.push(part(0.12, 0.075, 0.27, x, 0.037, -0.035, L ? P.SHOE_L : P.SHOE_R));
    parts.push(taper(0.125, 0.11, 0.42, 0.145, 0.13, x, 0.27, 0, L ? P.SHIN_L : P.SHIN_R));
    parts.push(taper(0.16, 0.13, 0.43, 0.18, 0.15, x, 0.68, 0, L ? P.THIGH_L : P.THIGH_R));
    const ax = 0.265 * s;
    parts.push(taper(0.12, 0.1, 0.31, 0.13, 0.11, ax, 1.32, 0, L ? P.UARM_L : P.UARM_R));
    parts.push(taper(0.1, 0.085, 0.27, 0.11, 0.095, ax, 1.04, 0, L ? P.FARM_L : P.FARM_R));
    parts.push(part(0.07, 0.1, 0.09, ax, 0.86, -0.005, L ? P.HAND_L : P.HAND_R));
  }
  parts.push(
    part(0.34, 0.16, 0.21, 0, 0.92, 0, P.PELVIS),
    part(0.35, 0.035, 0.215, 0, 0.99, 0, P.BELT),
    taper(0.36, 0.34, 0.24, 0.22, 0.21, 0, 1.11, 0, P.WAIST),
    taper(0.46, 0.37, 0.31, 0.25, 0.22, 0, 1.35, 0, P.CHEST),
    taper(0.37, 0.4, 0.14, 0.225, 0.24, 0, 0.94, 0, P.TAILS),
    taper(0.4, 0.46, 0.44, 0.245, 0.29, 0, 0.71, 0, P.LONGCOAT),
    taper(0.36, 0.5, 0.44, 0.23, 0.34, 0, 0.7, 0, P.SKIRT),
    part(0.15, 0.15, 0.012, 0, 1.42, -0.118, P.COLLAR),
    taper(0.05, 0.065, 0.3, 0.012, 0.012, 0, 1.29, -0.123, P.TIE),
    taper(0.07, 0.11, 0.26, 0.015, 0.015, -0.085, 1.37, -0.122, P.LAPEL),
    taper(0.07, 0.11, 0.26, 0.015, 0.015, 0.085, 1.37, -0.122, P.LAPEL),
    part(0.27, 0.09, 0.27, 0, 1.5, 0, P.SCARF),
    part(0.1, 0.09, 0.1, 0, 1.53, 0.005, P.NECK),
    taper(0.2, 0.18, 0.24, 0.22, 0.2, 0, 1.67, 0, P.HEAD),
    part(0.035, 0.05, 0.035, 0, 1.655, -0.112, P.NOSE),
    part(0.215, 0.06, 0.235, 0, 1.78, 0.008, P.HAIRCAP),
    part(0.215, 0.15, 0.045, 0, 1.7, 0.1, P.HAIRCAP),
    part(0.225, 0.3, 0.05, 0, 1.6, 0.11, P.HAIRLONG),
    part(0.09, 0.09, 0.08, 0, 1.73, 0.15, P.HAIRBUN),
    part(0.37, 0.022, 0.39, 0, 1.8, 0, P.HAT),
    taper(0.22, 0.24, 0.12, 0.23, 0.25, 0, 1.87, 0, P.HAT),
    part(0.2, 0.04, 0.02, 0, 1.69, -0.112, P.GLASSES),
    part(0.085, 0.24, 0.34, -0.265, 0.68, 0, P.BRIEFCASE),
    part(0.08, 0.22, 0.26, 0.255, 1.0, 0.02, P.SHOULDERBAG),
    part(0.32, 0.38, 0.14, 0, 1.27, 0.19, P.BACKPACK),
    part(0.04, 0.2, 0.055, 0.265, 0.79, -0.035, P.GUN),
    part(0.5, 0.32, 0.01, 0, 1.26, -0.44, P.PAPER),
    part(0.03, 0.11, 0.06, 0.265, 0.86, -0.04, P.PHONE),
  );
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

const DEFINES = Object.entries(P).map(([k, v]) => `#define P_${k} ${v}.0`).join('\n');

const ANIM_GLSL = /* glsl */ `
${DEFINES}
uniform float uTime;
attribute float aPart;
attribute vec3 aCoat;
attribute vec3 aTie;
attribute vec3 aHat;
attribute vec3 aHair;
attribute vec3 aPants;
attribute vec4 aAnim;   // walk phase, swing amplitude, flags, pose (0 stand, 1 sit, 2 dead)
attribute vec4 aExtra;  // skin tone, crouch, aim, run
attribute vec4 aStyle;  // hair style, build, activity, seed
varying vec3 vCol;

#define IS(id) (abs(aPart - (id)) < 0.5)

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
float flagBit(float flags, float b) { return mod(floor(flags / b + 0.001), 2.0); }
void pivot(inout vec3 p, inout vec3 n, vec3 pv, mat3 r) { p = r * (p - pv) + pv; n = r * n; }

void animate(inout vec3 p, inout vec3 n) {
  float ph = aAnim.x, amp = aAnim.y, flags = aAnim.z, pose = aAnim.w;
  float crouch = aExtra.y, aim = aExtra.z, run = aExtra.w;
  float hairStyle = aStyle.x, build = aStyle.y, act = aStyle.z, seed = aStyle.w;
  bool sit = pose > 0.5 && pose < 1.5;
  bool dead = pose > 1.5;
  float t = uTime + seed * 61.0;
  float still = 1.0 - clamp(amp * 4.0, 0.0, 1.0);

  // ---------------- visibility
  float vis = 1.0;
  if (IS(P_HAT)) vis = flagBit(flags, 1.0);
  else if (IS(P_GLASSES)) vis = flagBit(flags, 2.0);
  else if (IS(P_TIE) || IS(P_COLLAR)) vis = flagBit(flags, 4.0);
  else if (IS(P_GUN)) vis = flagBit(flags, 8.0);
  else if (IS(P_BRIEFCASE)) vis = flagBit(flags, 16.0);
  else if (IS(P_SHOULDERBAG)) vis = flagBit(flags, 32.0);
  else if (IS(P_BACKPACK)) vis = flagBit(flags, 64.0);
  else if (IS(P_SCARF)) vis = flagBit(flags, 128.0);
  else if (IS(P_SKIRT)) vis = flagBit(flags, 256.0);
  else if (IS(P_LONGCOAT)) vis = flagBit(flags, 512.0);
  else if (IS(P_PAPER)) vis = flagBit(flags, 1024.0);
  else if (IS(P_PHONE)) vis = flagBit(flags, 2048.0);
  else if (IS(P_HAIRCAP)) vis = hairStyle < 2.5 ? 1.0 : 0.0;
  else if (IS(P_HAIRLONG)) vis = (hairStyle > 0.5 && hairStyle < 1.5) ? 1.0 : 0.0;
  else if (IS(P_HAIRBUN)) vis = (hairStyle > 1.5 && hairStyle < 2.5) ? 1.0 : 0.0;
  else if (IS(P_LAPEL)) vis = 1.0 - flagBit(flags, 256.0);

  // ---------------- build (shoulder width)
  float wide = 0.9 + 0.2 * build;
  if (IS(P_CHEST) || IS(P_WAIST) || IS(P_BACKPACK) || IS(P_SCARF)) p.x *= wide;
  bool armL = IS(P_UARM_L) || IS(P_FARM_L) || IS(P_HAND_L) || IS(P_BRIEFCASE);
  bool armR = IS(P_UARM_R) || IS(P_FARM_R) || IS(P_HAND_R) || IS(P_GUN) || IS(P_PHONE);
  float shoulderX = 0.265 + 0.05 * (build - 0.5);
  if (armL) p.x -= 0.05 * (build - 0.5);
  if (armR) p.x += 0.05 * (build - 0.5);

  // ---------------- legs
  float sw = sin(ph) * amp;
  float hipL = sw, hipR = -sw;
  float kneeL = amp * (0.12 + 1.25 * max(0.0, cos(ph)));
  float kneeR = amp * (0.12 + 1.25 * max(0.0, -cos(ph)));
  // Idle weight shift.
  float shift = sin(t * 0.45) * 0.06 * still;
  hipL += shift; hipR -= shift * 0.5;
  hipL += crouch * 1.0; hipR += crouch * 1.0;
  kneeL += crouch * 1.8; kneeR += crouch * 1.8;
  if (sit) { hipL = 1.55; hipR = 1.5; kneeL = 1.5; kneeR = 1.45; }
  bool legL = IS(P_THIGH_L) || IS(P_SHIN_L) || IS(P_SHOE_L);
  bool legR = IS(P_THIGH_R) || IS(P_SHIN_R) || IS(P_SHOE_R);
  if (IS(P_SHIN_L) || IS(P_SHOE_L)) pivot(p, n, vec3(-0.095, 0.47, 0.0), rotX(-kneeL));
  if (IS(P_SHIN_R) || IS(P_SHOE_R)) pivot(p, n, vec3(0.095, 0.47, 0.0), rotX(-kneeR));
  if (legL) pivot(p, n, vec3(-0.095, 0.89, 0.0), rotX(hipL));
  if (legR) pivot(p, n, vec3(0.095, 0.89, 0.0), rotX(hipR));
  // Long coats and skirts swing a little with the stride.
  if (IS(P_LONGCOAT) || IS(P_SKIRT)) pivot(p, n, vec3(0.0, 0.95, 0.0), rotX(abs(sw) * 0.12 + (sit ? 1.3 : 0.0) + crouch * 0.8));

  // ---------------- arms
  float upL = -sw * 0.8, upR = sw * 0.8;
  float elL = 0.2 + amp * 0.3 + max(0.0, upL) * 0.7 + run * 1.0;
  float elR = 0.2 + amp * 0.3 + max(0.0, upR) * 0.7 + run * 1.0;
  float spreadL = 0.05, spreadR = 0.05;
  // Idle activities blend in when standing still.
  if (!sit && still > 0.01) {
    float k = still;
    if (act > 0.5 && act < 1.5) { // talk: gesturing right hand
      upR = mix(upR, 0.3 + 0.18 * sin(t * 1.9), k); elR = mix(elR, 1.1 + 0.45 * sin(t * 3.1), k);
      upL = mix(upL, 0.08, k); elL = mix(elL, 0.35 + 0.2 * sin(t * 1.3), k);
    } else if (act > 1.5 && act < 2.5) { // read a newspaper
      upL = mix(upL, 0.45, k); upR = mix(upR, 0.45, k); elL = mix(elL, 1.45, k); elR = mix(elR, 1.45, k);
      spreadL = mix(spreadL, -0.12, k); spreadR = mix(spreadR, -0.12, k);
    } else if (act > 2.5 && act < 3.5) { // phone to ear
      upR = mix(upR, 0.2, k); elR = mix(elR, 2.55, k); spreadR = mix(spreadR, -0.35, k);
      upL = mix(upL, 0.05, k); elL = mix(elL, 0.3, k);
    } else if (act > 3.5 && act < 4.5) { // waiting, hands in pockets
      upL = mix(upL, -0.1, k); upR = mix(upR, -0.1, k); elL = mix(elL, 0.45, k); elR = mix(elR, 0.45, k);
      spreadL = mix(spreadL, 0.14, k); spreadR = mix(spreadR, 0.14, k);
    } else { // relaxed: slight sway
      upL = mix(upL, 0.04 * sin(t * 0.7), k); upR = mix(upR, 0.04 * sin(t * 0.7 + 1.0), k);
    }
  }
  if (sit) {
    upL = 0.35; upR = 0.35; elL = 0.95; elR = 0.95; spreadL = -0.05; spreadR = -0.05;
    if (act > 1.5 && act < 2.5) { upL = 0.5; upR = 0.5; elL = 1.3; elR = 1.3; spreadL = -0.12; spreadR = -0.12; }
  }
  // Aim: two-handed grip, arms forward.
  upR = mix(upR, 1.52, aim); elR = mix(elR, 0.05, aim); spreadR = mix(spreadR, -0.18, aim);
  upL = mix(upL, 1.4, aim); elL = mix(elL, 0.25, aim); spreadL = mix(spreadL, -0.55, aim);

  if (IS(P_FARM_L) || IS(P_HAND_L) || IS(P_BRIEFCASE)) pivot(p, n, vec3(-shoulderX, 1.175, 0.0), rotX(IS(P_BRIEFCASE) ? 0.0 : elL));
  if (IS(P_FARM_R) || IS(P_HAND_R) || IS(P_GUN) || IS(P_PHONE)) pivot(p, n, vec3(shoulderX, 1.175, 0.0), rotX(elR));
  if (armL) pivot(p, n, vec3(-shoulderX, 1.46, 0.0), rotZ(-spreadL) * rotX(IS(P_BRIEFCASE) ? upL * 0.6 : upL));
  if (armR) pivot(p, n, vec3(shoulderX, 1.46, 0.0), rotZ(spreadR) * rotX(upR));

  // ---------------- head: idle glances, talking nods
  bool head = IS(P_HEAD) || IS(P_NOSE) || IS(P_HAIRCAP) || IS(P_HAIRLONG) || IS(P_HAIRBUN) || IS(P_HAT) || IS(P_GLASSES);
  if (head) {
    float look = (0.5 * sin(t * 0.31) * sin(t * 0.17 + 1.3)) * (0.35 + 0.65 * still);
    float nod = (act > 0.5 && act < 1.5) ? 0.06 * sin(t * 3.7) : 0.0;
    if (act > 1.5 && act < 2.5) nod = 0.3; // looking down at the paper
    if (act > 4.5) nod = -0.25; // looking up at the board
    nod = mix(nod, -0.05, aim);
    look *= 1.0 - aim;
    pivot(p, n, vec3(0.0, 1.54, 0.0), rotY(look) * rotX(nod));
  }

  // ---------------- upper body: twist, lean, breathing
  bool lower = legL || legR || IS(P_PELVIS) || IS(P_SKIRT) || IS(P_LONGCOAT) || IS(P_TAILS) || IS(P_BELT);
  if (!lower) {
    float lean = 0.05 * amp + 0.12 * run + 0.3 * crouch - (sit ? 0.06 : 0.0);
    float twist = -sw * 0.14;
    pivot(p, n, vec3(0.0, 0.99, 0.0), rotY(twist) * rotX(-lean));
    p.y += sin(t * 1.7) * 0.004 * still; // breathing
  }

  // ---------------- whole-body offsets
  p.y += (abs(cos(ph)) - 0.6) * 0.06 * amp;
  p.y -= 0.38 * crouch;
  if (sit) p.y -= 0.43;
  if (dead) {
    mat3 r = rotX(-1.5708);
    p = r * p; n = r * n;
    p.y += 0.12;
  }
  p *= vis;
}

vec3 partColor() {
  vec3 skin = mix(vec3(0.93, 0.76, 0.62), vec3(0.36, 0.24, 0.17), aExtra.x);
  vec3 col = aCoat;
  if (IS(P_PELVIS) || IS(P_SKIRT) || IS(P_THIGH_L) || IS(P_THIGH_R) || IS(P_SHIN_L) || IS(P_SHIN_R)) col = aPants;
  else if (IS(P_NECK) || IS(P_HEAD) || IS(P_NOSE) || IS(P_HAND_L) || IS(P_HAND_R)) col = skin;
  else if (IS(P_NOSE)) col = skin * 0.9;
  else if (IS(P_HAIRCAP) || IS(P_HAIRLONG) || IS(P_HAIRBUN)) col = aHair;
  else if (IS(P_HAT)) col = aHat;
  else if (IS(P_GLASSES)) col = vec3(0.03);
  else if (IS(P_TIE) || IS(P_SCARF)) col = aTie;
  else if (IS(P_COLLAR)) col = vec3(0.86, 0.86, 0.83);
  else if (IS(P_SHOE_L) || IS(P_SHOE_R)) col = vec3(0.05, 0.04, 0.035);
  else if (IS(P_BELT)) col = vec3(0.06, 0.05, 0.04);
  else if (IS(P_LAPEL)) col = aCoat * 0.72;
  else if (IS(P_BRIEFCASE)) col = vec3(0.22, 0.13, 0.07);
  else if (IS(P_SHOULDERBAG)) col = mix(aHat, vec3(0.3, 0.2, 0.12), 0.6);
  else if (IS(P_BACKPACK)) col = vec3(0.17, 0.19, 0.15);
  else if (IS(P_GUN) || IS(P_PHONE)) col = vec3(0.04);
  else if (IS(P_PAPER)) col = vec3(0.78, 0.76, 0.7);
  return col;
}
`;

const MAX_OUTLINES = 12;

interface InstanceBuffers {
  coat: THREE.InstancedBufferAttribute;
  tie: THREE.InstancedBufferAttribute;
  hat: THREE.InstancedBufferAttribute;
  hair: THREE.InstancedBufferAttribute;
  pants: THREE.InstancedBufferAttribute;
  anim: THREE.InstancedBufferAttribute;
  extra: THREE.InstancedBufferAttribute;
  style: THREE.InstancedBufferAttribute;
}
const BUF_KEYS = ['coat', 'tie', 'hat', 'hair', 'pants', 'anim', 'extra', 'style'] as const;

function addInstanceAttributes(g: THREE.BufferGeometry, n: number): InstanceBuffers {
  const mk = (name: string, size: number): THREE.InstancedBufferAttribute => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
    return a;
  };
  return {
    coat: mk('aCoat', 3), tie: mk('aTie', 3), hat: mk('aHat', 3), hair: mk('aHair', 3), pants: mk('aPants', 3),
    anim: mk('aAnim', 4), extra: mk('aExtra', 4), style: mk('aStyle', 4),
  };
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class CrowdRenderer {
  readonly mesh: THREE.InstancedMesh;
  readonly outline: THREE.InstancedMesh;
  readonly shadows: THREE.InstancedMesh;
  private readonly buf: InstanceBuffers;
  private readonly obuf: InstanceBuffers;
  private readonly uTime = { value: 0 };
  private readonly pois: readonly Poi[];
  /** agent id → instance index (or -1), for the current frame. */
  readonly instanceOf: Int32Array;

  constructor(capacity: number, pois: readonly Poi[]) {
    this.pois = pois;
    const geo = buildHumanGeometry();
    this.buf = addInstanceAttributes(geo, capacity);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uTime;
      shader.vertexShader = ANIM_GLSL + shader.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normal; vec3 animP = position; animate(animP, objectNormal); vCol = partColor();')
        .replace('#include <begin_vertex>', 'vec3 transformed = animP;');
      shader.fragmentShader = 'varying vec3 vCol;\n' + shader.fragmentShader
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vCol, opacity );')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Warm rim light keeps silhouettes readable against the dark station.
          float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 4.0);
          totalEmissiveRadiance += vec3(0.08, 0.07, 0.055) * rim + vCol * 0.08;`);
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
      shader.uniforms.uTime = this.uTime;
      shader.vertexShader = ANIM_GLSL + shader.vertexShader.replace(
        '#include <begin_vertex>',
        'vec3 animP = position; vec3 animN = normal; animate(animP, animN); vCol = partColor(); vec3 transformed = animP + normalize(animN) * 0.03 * step(0.001, length(animP));',
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
      map: softCircleTexture('rgba(0,0,0,0.8)'), transparent: true, depthWrite: false, opacity: 0.85,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.shadows = new THREE.InstancedMesh(sgeo, smat, capacity);
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    this.shadows.renderOrder = 1;

    this.instanceOf = new Int32Array(capacity).fill(-1);
  }

  /** Visual-only idle activity derived from what the agent is doing in the sim. */
  private activity(a: Agent): number {
    if (!a.alive || (a.spy && a.spy.drawn)) return ACT.NONE;
    const h = hash(a.id * 7.3 + Math.floor(a.appearance.seed * 100));
    if (a.pose === 'sit') return h < 0.3 ? ACT.READ : ACT.NONE;
    if (a.speed > 0.3) return ACT.NONE;
    const p = a.occupiedPoi >= 0 ? this.pois[a.occupiedPoi] : null;
    if (p && Math.abs(p.x - a.x) + Math.abs(p.z - a.z) < 1.5) {
      switch (p.kind) {
        case 'chat': return ACT.TALK;
        case 'news': return ACT.READ;
        case 'board': return ACT.LOOK_UP;
        case 'clock': return h < 0.5 ? ACT.LOOK_UP : ACT.PHONE;
        case 'platform': return h < 0.35 ? ACT.PHONE : h < 0.55 ? ACT.READ : ACT.WAIT;
        case 'kiosk': case 'shop': case 'cafe': return h < 0.25 ? ACT.PHONE : ACT.WAIT;
        case 'rail': return ACT.WAIT;
        default: return ACT.NONE;
      }
    }
    return h < 0.3 ? ACT.PHONE : ACT.WAIT;
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
    col.setHex(ap.hair).convertSRGBToLinear();
    buf.hair.setXYZ(i, col.r, col.g, col.b);
    col.setHex(ap.pants).convertSRGBToLinear();
    buf.pants.setXYZ(i, col.r, col.g, col.b);

    const drawn = !!(a.spy && a.spy.drawn);
    const act = this.activity(a);
    let flags = 0;
    if (ap.hat) flags |= FLAG.HAT;
    if (ap.glasses) flags |= FLAG.GLASSES;
    if (ap.tie >= 0) flags |= FLAG.TIE;
    if (drawn) flags |= FLAG.GUN;
    if (ap.bag === 'briefcase' && !drawn) flags |= FLAG.BRIEFCASE;
    if (ap.bag === 'shoulder') flags |= FLAG.SHOULDERBAG;
    if (ap.bag === 'backpack') flags |= FLAG.BACKPACK;
    if (ap.scarf) flags |= FLAG.SCARF;
    if (ap.skirt) flags |= FLAG.SKIRT;
    if (ap.longCoat) flags |= FLAG.LONGCOAT;
    if (act === ACT.READ) flags |= FLAG.PAPER;
    if (act === ACT.PHONE) flags |= FLAG.PHONE;
    const pose = a.pose === 'sit' ? 1 : a.pose === 'dead' ? 2 : 0;
    const walk = Math.min(1, a.speed / 2.2);
    const run = Math.max(0, Math.min(1, (a.speed - 2.8) / 2));
    const amp = pose === 0 ? 0.5 * walk + 0.25 * run : 0;
    buf.anim.setXYZW(i, a.animPhase, amp, flags, pose);
    const aim = a.spy && a.spy.aiming ? 1 : drawn ? 0.5 : 0;
    buf.extra.setXYZW(i, ap.skin, a.crouch ? 1 : 0, aim, run);
    buf.style.setXYZW(i, ap.hairStyle, ap.build, act, ap.seed);
  }

  /**
   * Write all visible humans. `outlined` lists agent ids that get the red outline.
   * `hideId` is the first-person player.
   */
  update(agents: readonly Agent[], alpha: number, hideId: number, outlined: readonly number[], time: number, visible?: (x: number, y: number, z: number, r: number) => boolean): void {
    this.uTime.value = time;
    let n = 0;
    let s = 0;
    const linger = CONFIG.match.bodyLingerSeconds;
    const civLinger = CONFIG.match.civilianBodyLingerSeconds;
    for (const a of agents) {
      this.instanceOf[a.id] = -1;
      if (a.id === hideId) continue;
      if (!a.alive && a.deadTime > (a.spy ? linger : civLinger)) continue;
      if (a.away) continue;
      // Outside the (predicted) view: skip the instance and its shadow.
      if (visible && !visible(a.x, a.y + 0.9, a.z, 1.3)) continue;
      this.writeInstance(this.buf, this.mesh, n, a, alpha);
      this.instanceOf[a.id] = n;
      n++;
      const sit = a.pose === 'sit';
      const x = sit ? a.seatX : a.px + (a.x - a.px) * alpha;
      const z = sit ? a.seatZ : a.pz + (a.z - a.pz) * alpha;
      const y = a.py + (a.y - a.py) * alpha;
      tmpP.set(x, y + 0.03, z);
      if (!a.alive) tmpP.set(x - Math.sin(a.yaw) * 0.85, y + 0.03, z - Math.cos(a.yaw) * 0.85);
      tmpQ.setFromAxisAngle(UP, a.yaw);
      if (a.alive) tmpS.set(0.85, 1, sit ? 1.3 : 0.95);
      else tmpS.set(0.9, 1, 2.1);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.shadows.setMatrixAt(s++, tmpM);
    }
    this.mesh.count = n;
    this.shadows.count = s;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    for (const k of BUF_KEYS) this.buf[k].needsUpdate = true;

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
      for (const k of BUF_KEYS) this.obuf[k].needsUpdate = true;
    }
  }
}
