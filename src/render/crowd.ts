// Every human (spies + civilians) is one InstancedMesh draw call. A small
// jointed rig (hips, knees, shoulders, elbows, neck, waist) is animated in the
// vertex shader from per-instance attributes: walk/run cycles, sitting,
// crouching, aiming, idle activities (talking, reading, phone, waiting),
// breathing and glances. Optional parts collapse to zero when their flag is off.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Agent, Appearance } from '../sim/types';
import type { Poi } from '../world/mapData';
import { softCircleTexture } from './textures';
import { CONFIG } from '../config';
import { SUIT_COLORS } from '../sim/appearance';

// Part ids (injected into the shader as constants, so they cannot drift).
const P = {
  PELVIS: 0, WAIST: 1, CHEST: 2, TAILS: 3, LONGCOAT: 4, SKIRT: 5,
  NECK: 6, HEAD: 7, NOSE: 8, HAIRCAP: 9, HAIRLONG: 10, HAIRBUN: 11, HAT: 12, GLASSES: 13,
  TIE: 14, COLLAR: 15, SCARF: 16,
  UARM_L: 17, UARM_R: 18, FARM_L: 19, FARM_R: 20, HAND_L: 21, HAND_R: 22,
  THIGH_L: 23, THIGH_R: 24, SHIN_L: 25, SHIN_R: 26, SHOE_L: 27, SHOE_R: 28,
  BRIEFCASE: 29, SHOULDERBAG: 30, BACKPACK: 31, GUN: 32, PAPER: 33, PHONE: 34, LAPEL: 35, BELT: 36,
  JAW: 37, BEANIE: 38, CAP: 39, SUITCASE: 40, PUFFER: 41, TRENCHBELT: 42,
} as const;

export const FLAG = {
  HAT: 1, GLASSES: 2, TIE: 4, GUN: 8, BRIEFCASE: 16, SHOULDERBAG: 32, BACKPACK: 64,
  SCARF: 128, SKIRT: 256, LONGCOAT: 512, PAPER: 1024, PHONE: 2048,
  // Render-only civilian variety (derived from the appearance seed; never on a suit).
  BEANIE: 4096, CAP: 8192, SUITCASE: 16384, SWEATER: 32768, PUFFER: 65536, ROLLED: 131072, TRENCHBELT: 262144,
} as const;

/** Idle activity codes (aStyle.z). */
const ACT = { NONE: 0, TALK: 1, READ: 2, PHONE: 3, WAIT: 4, LOOK_UP: 5 } as const;

function tag(g: THREE.BufferGeometry, id: number): THREE.BufferGeometry {
  if (g.index) g = g.toNonIndexed();
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(id), 1));
  return g;
}

function part(w: number, h: number, d: number, x: number, y: number, z: number, id: number): THREE.BufferGeometry {
  const g = tag(new THREE.BoxGeometry(w, h, d), id);
  g.translate(x, y, z);
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

/** Tapered elliptical cylinder (limbs, torso): widths are diameters in x and z. */
function limb(wTop: number, wBot: number, h: number, dTop: number, dBot: number, x: number, y: number, z: number, id: number, seg = 8, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, h, seg, 1, open);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > 0;
    pos.setX(i, pos.getX(i) * (top ? wTop : wBot));
    pos.setZ(i, pos.getZ(i) * (top ? dTop : dBot));
  }
  g.computeVertexNormals();
  const t = tag(g, id);
  t.translate(x, y, z);
  return t;
}

/** Ellipsoid (heads, hair, buns); `thetaLen` < π gives a cap. */
function blob(rx: number, ry: number, rz: number, x: number, y: number, z: number, id: number, ws = 10, hs = 7, thetaLen = Math.PI): THREE.BufferGeometry {
  const g = tag(new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, thetaLen), id);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

/** Parts both detail levels share (flat or small items where boxes are fine). */
function commonParts(): THREE.BufferGeometry[] {
  return [
    part(0.15, 0.15, 0.012, 0, 1.42, -0.118, P.COLLAR),
    taper(0.05, 0.068, 0.3, 0.014, 0.014, 0, 1.29, -0.125, P.TIE),
    taper(0.07, 0.11, 0.26, 0.015, 0.015, -0.085, 1.37, -0.122, P.LAPEL),
    taper(0.07, 0.11, 0.26, 0.015, 0.015, 0.085, 1.37, -0.122, P.LAPEL),
    part(0.035, 0.05, 0.035, 0, 1.655, -0.112, P.NOSE),
    // Glasses: a bolder frame so they read at 15–20 m (a dossier clue).
    part(0.21, 0.052, 0.022, 0, 1.69, -0.114, P.GLASSES),
    part(0.085, 0.24, 0.34, -0.265, 0.68, 0, P.BRIEFCASE),
    part(0.08, 0.22, 0.26, 0.255, 1.0, 0.02, P.SHOULDERBAG),
    part(0.32, 0.38, 0.14, 0, 1.27, 0.19, P.BACKPACK),
    part(0.04, 0.2, 0.055, 0.265, 0.79, -0.035, P.GUN),
    part(0.5, 0.32, 0.01, 0, 1.26, -0.44, P.PAPER),
    part(0.03, 0.11, 0.06, 0.265, 0.86, -0.04, P.PHONE),
    // Wheeled suitcase trailing behind the right hand, with its pull handle.
    part(0.26, 0.42, 0.17, 0.3, 0.25, 0.3, P.SUITCASE),
    part(0.03, 0.42, 0.03, 0.3, 0.66, 0.24, P.SUITCASE),
    part(0.13, 0.03, 0.03, 0.3, 0.86, 0.22, P.SUITCASE),
  ];
}

/**
 * Low-poly human, feet at y=0, facing -Z, ~1.8 m.
 * 'high': rounded limbs and torso, egg-shaped head with a jaw (≈1,100 triangles).
 * 'low': the box version (≈500 triangles) for people far away.
 */
export function buildHumanGeometry(detail: 'high' | 'low' = 'high'): THREE.BufferGeometry {
  const hi = detail === 'high';
  // Limb ends are buried in the next joint, hand or shoe: open-ended cylinders save their caps.
  const L2 = (wT: number, wB: number, h: number, dT: number, dB: number, x: number, y: number, z: number, id: number): THREE.BufferGeometry =>
    hi ? limb(wT, wB, h, dT, dB, x, y, z, id, 8, true) : taper(wT, wB, h, dT, dB, x, y, z, id);
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const L = s < 0;
    const x = 0.095 * s;
    parts.push(part(0.12, 0.075, 0.27, x, 0.037, -0.035, L ? P.SHOE_L : P.SHOE_R));
    parts.push(L2(0.125, 0.105, 0.43, 0.14, 0.12, x, 0.27, 0, L ? P.SHIN_L : P.SHIN_R));
    parts.push(L2(0.165, 0.13, 0.44, 0.18, 0.15, x, 0.68, 0, L ? P.THIGH_L : P.THIGH_R));
    const ax = 0.265 * s;
    parts.push(L2(0.12, 0.1, 0.32, 0.13, 0.11, ax, 1.32, 0, L ? P.UARM_L : P.UARM_R));
    parts.push(L2(0.1, 0.082, 0.28, 0.11, 0.09, ax, 1.04, 0, L ? P.FARM_L : P.FARM_R));
    parts.push(part(0.07, 0.1, 0.09, ax, 0.86, -0.005, L ? P.HAND_L : P.HAND_R));
  }
  if (hi) {
    parts.push(
      limb(0.36, 0.34, 0.17, 0.23, 0.22, 0, 0.92, 0, P.PELVIS),
      limb(0.355, 0.355, 0.035, 0.225, 0.225, 0, 0.99, 0, P.BELT, 8, true),
      limb(0.37, 0.35, 0.25, 0.235, 0.225, 0, 1.11, 0, P.WAIST),
      limb(0.47, 0.38, 0.32, 0.27, 0.235, 0, 1.35, 0, P.CHEST, 10),
      limb(0.38, 0.41, 0.15, 0.245, 0.255, 0, 0.94, 0, P.TAILS),
      limb(0.41, 0.48, 0.45, 0.26, 0.31, 0, 0.71, 0, P.LONGCOAT),
      limb(0.37, 0.52, 0.45, 0.25, 0.36, 0, 0.7, 0, P.SKIRT),
      limb(0.39, 0.39, 0.05, 0.25, 0.25, 0, 1.04, 0, P.TRENCHBELT, 8, true),
      limb(0.5, 0.48, 0.07, 0.31, 0.3, 0, 1.24, 0, P.PUFFER, 8, true),
      limb(0.49, 0.44, 0.07, 0.3, 0.28, 0, 1.08, 0, P.PUFFER, 8, true),
      limb(0.29, 0.27, 0.09, 0.29, 0.27, 0, 1.5, 0, P.SCARF),
      limb(0.095, 0.1, 0.1, 0.095, 0.1, 0, 1.53, 0.005, P.NECK, 7),
      blob(0.1, 0.122, 0.112, 0, 1.685, 0.002, P.HEAD, 10, 7),
      limb(0.15, 0.1, 0.07, 0.13, 0.1, 0, 1.585, -0.025, P.JAW, 7),
      blob(0.108, 0.105, 0.12, 0, 1.705, 0.01, P.HAIRCAP, 10, 4, Math.PI * 0.5),
      part(0.2, 0.13, 0.04, 0, 1.69, 0.1, P.HAIRCAP),
      part(0.22, 0.3, 0.05, 0, 1.6, 0.11, P.HAIRLONG),
      blob(0.05, 0.05, 0.045, 0, 1.73, 0.15, P.HAIRBUN, 6, 4),
      limb(0.38, 0.38, 0.02, 0.4, 0.4, 0, 1.8, 0, P.HAT, 10),
      limb(0.22, 0.24, 0.12, 0.23, 0.25, 0, 1.87, 0, P.HAT, 10),
      blob(0.115, 0.12, 0.125, 0, 1.72, 0.008, P.BEANIE, 8, 4, Math.PI * 0.55),
      limb(0.235, 0.235, 0.04, 0.255, 0.255, 0, 1.73, 0.008, P.BEANIE, 8),
      blob(0.112, 0.085, 0.12, 0, 1.745, 0.01, P.CAP, 8, 3, Math.PI * 0.5),
      part(0.17, 0.014, 0.1, 0, 1.75, -0.15, P.CAP),
    );
  } else {
    parts.push(
      part(0.34, 0.16, 0.21, 0, 0.92, 0, P.PELVIS),
      part(0.35, 0.035, 0.215, 0, 0.99, 0, P.BELT),
      taper(0.36, 0.34, 0.24, 0.22, 0.21, 0, 1.11, 0, P.WAIST),
      taper(0.46, 0.37, 0.31, 0.25, 0.22, 0, 1.35, 0, P.CHEST),
      taper(0.37, 0.4, 0.14, 0.225, 0.24, 0, 0.94, 0, P.TAILS),
      taper(0.4, 0.46, 0.44, 0.245, 0.29, 0, 0.71, 0, P.LONGCOAT),
      taper(0.36, 0.5, 0.44, 0.23, 0.34, 0, 0.7, 0, P.SKIRT),
      part(0.38, 0.05, 0.24, 0, 1.04, 0, P.TRENCHBELT),
      part(0.48, 0.2, 0.29, 0, 1.17, 0, P.PUFFER),
      part(0.27, 0.09, 0.27, 0, 1.5, 0, P.SCARF),
      part(0.1, 0.09, 0.1, 0, 1.53, 0.005, P.NECK),
      taper(0.2, 0.18, 0.24, 0.22, 0.2, 0, 1.67, 0, P.HEAD),
      part(0.215, 0.06, 0.235, 0, 1.78, 0.008, P.HAIRCAP),
      part(0.215, 0.15, 0.045, 0, 1.7, 0.1, P.HAIRCAP),
      part(0.225, 0.3, 0.05, 0, 1.6, 0.11, P.HAIRLONG),
      part(0.09, 0.09, 0.08, 0, 1.73, 0.15, P.HAIRBUN),
      part(0.37, 0.022, 0.39, 0, 1.8, 0, P.HAT),
      taper(0.22, 0.24, 0.12, 0.23, 0.25, 0, 1.87, 0, P.HAT),
      part(0.23, 0.1, 0.25, 0, 1.77, 0.008, P.BEANIE),
      part(0.22, 0.06, 0.24, 0, 1.78, 0.01, P.CAP),
      part(0.17, 0.014, 0.1, 0, 1.75, -0.15, P.CAP),
    );
  }
  parts.push(...commonParts());
  const g = mergeGeometries(parts, false)!;
  parts.forEach((q) => q.dispose());
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
attribute vec4 aAnim;   // walk phase, swing amplitude, flags, pose (0..1 sit blend, 2 dead)
attribute vec4 aExtra;  // skin tone, crouch, aim, run
attribute vec4 aStyle;  // hair style, build, activity, seed
// (No more attributes: the instance matrix takes 4 of the 16 slots.)
varying vec3 vCol;
varying vec3 vLocal;
varying float vPart;
varying float vFlags;
varying float vSeed;
varying vec3 vHairC;

#define IS(id) (abs(aPart - (id)) < 0.5)

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
float flagBit(float flags, float b) { return mod(floor(flags / b + 0.001), 2.0); }
void pivot(inout vec3 p, inout vec3 n, vec3 pv, mat3 r) { p = r * (p - pv) + pv; n = r * n; }
float hseed(float s, float k) { return fract(sin(s * k * 127.1 + k * 311.7) * 43758.5453); }

void animate(inout vec3 p, inout vec3 n) {
  vLocal = p;
  vPart = aPart;
  vFlags = aAnim.z;
  vSeed = aStyle.w;
  vHairC = aHair;
  float ph = aAnim.x, amp = aAnim.y, flags = aAnim.z, pose = aAnim.w;
  float crouch = aExtra.y, aim = aExtra.z, run = aExtra.w;
  float hairStyle = aStyle.x, build = aStyle.y, act = aStyle.z, seed = aStyle.w;
  // Per-person body and gait, from the appearance seed.
  float belly = build > 0.55 ? (build - 0.55) / 0.45 * hseed(seed, 2.2) : 0.0;
  float stride = hseed(seed, 7.7), bounce = hseed(seed, 5.3);
  // Sitting blends in and out (no snapping); dead overrides.
  float sitK = pose > 1.5 ? 0.0 : clamp(pose, 0.0, 1.0);
  bool sitting = sitK > 0.5;
  bool dead = pose > 1.5;
  float t = uTime + seed * 61.0;
  float still = 1.0 - clamp(amp * 4.0, 0.0, 1.0);
  float suitcase = flagBit(flags, 16384.0);

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
  else if (IS(P_BEANIE)) vis = flagBit(flags, 4096.0);
  else if (IS(P_CAP)) vis = flagBit(flags, 8192.0);
  else if (IS(P_SUITCASE)) vis = suitcase * (sitting ? 0.0 : 1.0);
  else if (IS(P_PUFFER)) vis = flagBit(flags, 65536.0);
  else if (IS(P_TRENCHBELT)) vis = flagBit(flags, 262144.0) * flagBit(flags, 512.0);
  else if (IS(P_HAIRCAP)) vis = (hairStyle < 2.5 && flagBit(flags, 4096.0) < 0.5) ? 1.0 : 0.0;
  else if (IS(P_HAIRLONG)) vis = (hairStyle > 0.5 && hairStyle < 1.5) ? 1.0 : 0.0;
  else if (IS(P_HAIRBUN)) vis = (hairStyle > 1.5 && hairStyle < 2.5 && flagBit(flags, 4096.0) < 0.5) ? 1.0 : 0.0;
  else if (IS(P_LAPEL) || IS(P_TAILS)) vis = (1.0 - flagBit(flags, 256.0)) * (1.0 - flagBit(flags, 32768.0)) * (1.0 - flagBit(flags, 65536.0)) * (1.0 - flagBit(flags, 131072.0));

  // ---------------- body shape: shoulders, belly, puffer bulk
  float wide = 0.9 + 0.2 * build;
  if (IS(P_CHEST) || IS(P_WAIST) || IS(P_BACKPACK) || IS(P_SCARF) || IS(P_PUFFER)) p.x *= wide;
  if (flagBit(flags, 65536.0) > 0.5 && (IS(P_CHEST) || IS(P_WAIST) || IS(P_UARM_L) || IS(P_UARM_R))) { p.x *= 1.08; p.z *= 1.12; }
  if ((IS(P_WAIST) || IS(P_BELT) || IS(P_TRENCHBELT) || IS(P_PUFFER) || IS(P_TIE)) && p.z < 0.0) p.z -= belly * 0.06;
  if ((IS(P_PELVIS) || IS(P_TAILS)) && p.z < 0.0) p.z -= belly * 0.03;
  bool armL = IS(P_UARM_L) || IS(P_FARM_L) || IS(P_HAND_L) || IS(P_BRIEFCASE);
  bool armR = IS(P_UARM_R) || IS(P_FARM_R) || IS(P_HAND_R) || IS(P_GUN) || IS(P_PHONE);
  float shoulderX = 0.265 + 0.05 * (build - 0.5);
  if (armL) p.x -= 0.05 * (build - 0.5);
  if (armR) p.x += 0.05 * (build - 0.5);

  // ---------------- legs (stride varies per person)
  float sw = sin(ph) * amp * (0.88 + 0.24 * stride);
  float hipL = sw, hipR = -sw;
  float kneeL = amp * (0.12 + 1.25 * max(0.0, cos(ph)));
  float kneeR = amp * (0.12 + 1.25 * max(0.0, -cos(ph)));
  // Idle weight shift: heavier builds rock more.
  float shift = sin(t * 0.45) * (0.04 + 0.04 * build) * still;
  hipL += shift; hipR -= shift * 0.5;
  hipL += crouch * 1.0; hipR += crouch * 1.0;
  kneeL += crouch * 1.8; kneeR += crouch * 1.8;
  hipL = mix(hipL, 1.55, sitK); hipR = mix(hipR, 1.5, sitK);
  kneeL = mix(kneeL, 1.5, sitK); kneeR = mix(kneeR, 1.45, sitK);
  bool legL = IS(P_THIGH_L) || IS(P_SHIN_L) || IS(P_SHOE_L);
  bool legR = IS(P_THIGH_R) || IS(P_SHIN_R) || IS(P_SHOE_R);
  if (IS(P_SHIN_L) || IS(P_SHOE_L)) pivot(p, n, vec3(-0.095, 0.47, 0.0), rotX(-kneeL));
  if (IS(P_SHIN_R) || IS(P_SHOE_R)) pivot(p, n, vec3(0.095, 0.47, 0.0), rotX(-kneeR));
  if (legL) pivot(p, n, vec3(-0.095, 0.89, 0.0), rotX(hipL));
  if (legR) pivot(p, n, vec3(0.095, 0.89, 0.0), rotX(hipR));
  // Long coats and skirts swing a little with the stride.
  if (IS(P_LONGCOAT) || IS(P_SKIRT)) pivot(p, n, vec3(0.0, 0.95, 0.0), rotX(abs(sw) * 0.12 + 1.3 * sitK + crouch * 0.8));

  // ---------------- arms (swing scales with stride and build)
  float swing = 0.8 * (0.75 + 0.35 * stride + 0.2 * build);
  float upL = -sw * swing, upR = sw * swing;
  float elL = 0.2 + amp * 0.3 + max(0.0, upL) * 0.7 + run * 1.0;
  float elR = 0.2 + amp * 0.3 + max(0.0, upR) * 0.7 + run * 1.0;
  float spreadL = 0.05, spreadR = 0.05;
  // Pulling a wheeled suitcase: right arm back and low, steady.
  if (suitcase > 0.5) { upR = mix(upR, -0.28, 0.85); elR = 0.08; spreadR = 0.06; }
  // Idle activities blend in when standing still.
  float k = still * (1.0 - sitK);
  if (k > 0.01) {
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
  if (sitK > 0.0) {
    bool rd = act > 1.5 && act < 2.5;
    upL = mix(upL, rd ? 0.5 : 0.35, sitK); upR = mix(upR, rd ? 0.5 : 0.35, sitK);
    elL = mix(elL, rd ? 1.3 : 0.95, sitK); elR = mix(elR, rd ? 1.3 : 0.95, sitK);
    spreadL = mix(spreadL, rd ? -0.12 : -0.05, sitK); spreadR = mix(spreadR, rd ? -0.12 : -0.05, sitK);
  }
  // Aim: two-handed grip, arms forward.
  upR = mix(upR, 1.52, aim); elR = mix(elR, 0.05, aim); spreadR = mix(spreadR, -0.18, aim);
  upL = mix(upL, 1.4, aim); elL = mix(elL, 0.25, aim); spreadL = mix(spreadL, -0.55, aim);

  if (IS(P_FARM_L) || IS(P_HAND_L) || IS(P_BRIEFCASE)) pivot(p, n, vec3(-shoulderX, 1.175, 0.0), rotX(IS(P_BRIEFCASE) ? 0.0 : elL));
  if (IS(P_FARM_R) || IS(P_HAND_R) || IS(P_GUN) || IS(P_PHONE)) pivot(p, n, vec3(shoulderX, 1.175, 0.0), rotX(elR));
  if (armL) pivot(p, n, vec3(-shoulderX, 1.46, 0.0), rotZ(-spreadL) * rotX(IS(P_BRIEFCASE) ? upL * 0.6 : upL));
  if (armR) pivot(p, n, vec3(shoulderX, 1.46, 0.0), rotZ(spreadR) * rotX(upR));
  // The suitcase rolls behind, tilted toward the hand.
  if (IS(P_SUITCASE)) { pivot(p, n, vec3(0.3, 0.0, 0.3), rotX(-0.22)); p.y += abs(sin(ph * 2.0)) * 0.006 * amp; }

  // ---------------- head: idle glances, talking nods
  bool head = IS(P_HEAD) || IS(P_JAW) || IS(P_NOSE) || IS(P_HAIRCAP) || IS(P_HAIRLONG) || IS(P_HAIRBUN) || IS(P_HAT) || IS(P_GLASSES) || IS(P_BEANIE) || IS(P_CAP);
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
  bool lower = legL || legR || IS(P_PELVIS) || IS(P_SKIRT) || IS(P_LONGCOAT) || IS(P_TAILS) || IS(P_BELT) || IS(P_SUITCASE);
  if (!lower) {
    float lean = 0.05 * amp + 0.12 * run + 0.3 * crouch - 0.06 * sitK + 0.04 * suitcase * amp;
    float twist = -sw * 0.14;
    pivot(p, n, vec3(0.0, 0.99, 0.0), rotY(twist) * rotX(-lean));
    p.y += sin(t * 1.7) * 0.004 * still; // breathing
  }

  // ---------------- whole-body offsets (bounce varies per person)
  p.y += (abs(cos(ph)) - 0.6) * 0.06 * amp * (0.6 + 0.8 * bounce);
  p.y -= 0.38 * crouch;
  p.y -= 0.43 * sitK;
  if (dead) {
    mat3 r = rotX(-1.5708);
    p = r * p; n = r * n;
    p.y += 0.12;
  }
  p *= vis;
}

vec3 partColor() {
  vec3 skin = mix(vec3(0.93, 0.76, 0.62), vec3(0.36, 0.24, 0.17), aExtra.x);
  float flags = aAnim.z;
  vec3 col = aCoat;
  // Ties are a dossier clue: a little extra saturation keeps the colour readable at range.
  float tl = dot(aTie, vec3(0.299, 0.587, 0.114));
  vec3 tie = clamp(mix(vec3(tl), aTie, 1.3), 0.0, 1.0);
  bool rolled = flagBit(flags, 131072.0) > 0.5;
  if (IS(P_PELVIS) || IS(P_SKIRT) || IS(P_THIGH_L) || IS(P_THIGH_R) || IS(P_SHIN_L) || IS(P_SHIN_R)) col = aPants;
  else if (IS(P_NECK) || IS(P_HEAD) || IS(P_JAW) || IS(P_HAND_L) || IS(P_HAND_R)) col = skin;
  else if (IS(P_NOSE)) col = skin * 0.9;
  else if (IS(P_HAIRCAP) || IS(P_HAIRLONG) || IS(P_HAIRBUN)) col = aHair;
  else if (IS(P_HAT)) col = aHat;
  else if (IS(P_BEANIE)) col = mix(aTie, aCoat, 0.35);
  else if (IS(P_CAP)) col = mix(aHat, aCoat, 0.5);
  else if (IS(P_GLASSES)) col = vec3(0.02);
  else if (IS(P_TIE) || IS(P_SCARF)) col = tie;
  else if (IS(P_COLLAR)) col = vec3(0.86, 0.86, 0.83);
  else if (IS(P_SHOE_L) || IS(P_SHOE_R)) col = vec3(0.05, 0.04, 0.035);
  else if (IS(P_BELT)) col = vec3(0.06, 0.05, 0.04);
  else if (IS(P_TRENCHBELT)) col = aCoat * 0.7;
  else if (IS(P_PUFFER)) col = aCoat * 1.15;
  else if (IS(P_LAPEL)) col = aCoat * 0.72;
  else if (IS(P_BRIEFCASE)) col = vec3(0.22, 0.13, 0.07);
  else if (IS(P_SHOULDERBAG)) col = mix(aHat, vec3(0.3, 0.2, 0.12), 0.6);
  else if (IS(P_BACKPACK)) col = vec3(0.17, 0.19, 0.15);
  else if (IS(P_SUITCASE)) col = mix(aTie, vec3(0.12), 0.55);
  else if (IS(P_GUN) || IS(P_PHONE)) col = vec3(0.04);
  else if (IS(P_PAPER)) col = vec3(0.78, 0.76, 0.7);
  // Rolled sleeves: a light shirt with bare forearms.
  if (rolled) {
    if (IS(P_CHEST) || IS(P_WAIST) || IS(P_UARM_L) || IS(P_UARM_R)) col = mix(vec3(0.58, 0.56, 0.51), aCoat, 0.3);
    if (IS(P_FARM_L) || IS(P_FARM_R)) col = skin;
  }
  return col;
}
`;

/**
 * Per-pixel detail for the crowd (Lambert fragment): faces drawn on the head,
 * fabric patterns on clothes (pinstripe, tweed, knit), so nobody is pixel-identical.
 */
const SURFACE_GLSL = /* glsl */ `
${DEFINES}
varying vec3 vLocal;
varying float vPart;
varying float vFlags;
varying float vSeed;
varying vec3 vHairC;
#define ISF(id) (abs(vPart - (id)) < 0.5)
float fbit(float flags, float b) { return mod(floor(flags / b + 0.001), 2.0); }
float h13(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 surfaceDetail(vec3 base) {
  vec3 c = base;
  float pick = fract(vSeed * 7.31);
  if (ISF(P_HEAD) || ISF(P_JAW)) {
    // Face on the front of the head (local -z), centred at head height.
    vec2 f = vec2(vLocal.x, vLocal.y - 1.685);
    if (vLocal.z < -0.055) {
      float eyes = min(length((f - vec2(-0.04, 0.012)) * vec2(1.0, 1.6)), length((f - vec2(0.04, 0.012)) * vec2(1.0, 1.6)));
      c = mix(c, vec3(0.05, 0.04, 0.04), 1.0 - smoothstep(0.009, 0.014, eyes));
      float brow = max(abs(f.y - 0.04) - 0.006, min(abs(f.x - 0.042), abs(f.x + 0.042)) - 0.024);
      c = mix(c, vHairC * 0.75, 1.0 - smoothstep(0.0, 0.004, brow));
      float mouth = max(abs(f.y + 0.058) - 0.004, abs(f.x) - 0.028);
      bool lips = fbit(vFlags, 256.0) > 0.5 && pick < 0.6;
      c = mix(c, lips ? vec3(0.55, 0.16, 0.18) : c * 0.55, 1.0 - smoothstep(0.0, 0.003, mouth));
    }
    // Stubble on some faces.
    if (fbit(vFlags, 256.0) < 0.5 && pick > 0.7 && vLocal.y < 1.655 && vLocal.z < 0.02) c *= 0.82;
    return c;
  }
  bool coat = ISF(P_CHEST) || ISF(P_WAIST) || ISF(P_TAILS) || ISF(P_LONGCOAT) || ISF(P_UARM_L) || ISF(P_UARM_R) || ISF(P_FARM_L) || ISF(P_FARM_R) || ISF(P_LAPEL) || ISF(P_PUFFER);
  bool legs = ISF(P_PELVIS) || ISF(P_THIGH_L) || ISF(P_THIGH_R) || ISF(P_SHIN_L) || ISF(P_SHIN_R);
  if (!(coat || legs)) return c;
  if (fbit(vFlags, 32768.0) > 0.5 && coat) {
    // Knit sweater: horizontal ribs.
    return c * (0.9 + 0.12 * smoothstep(0.3, 0.7, abs(fract(vLocal.y * 55.0) - 0.5) * 2.0));
  }
  if (fbit(vFlags, 65536.0) > 0.5 && coat) {
    // Quilted puffer: soft horizontal channels.
    return c * (0.86 + 0.2 * sin(fract(vLocal.y * 9.0) * 3.14159));
  }
  // Suits and coats: plain, pinstripe or tweed (spies draw from the same pool as commuters).
  if (pick < 0.33) {
    float stripe = abs(fract(vLocal.x * 30.0 + vLocal.z * 30.0) - 0.5);
    c *= 1.0 + 0.22 * (1.0 - smoothstep(0.02, 0.07, stripe));
  } else if (pick < 0.62) {
    float n = h13(floor(vLocal * 140.0));
    c *= 0.9 + 0.2 * n;
  }
  return c;
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
const rp = { x: 0, z: 0 };

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const SUITS = new Set<number>(SUIT_COLORS);

/**
 * Render-only clothing variety from the appearance seed (no simulation data).
 * Suits — spies and suit-wearing commuters alike — never get any of it, so they
 * keep sharing one silhouette and the dossier stays the only way to tell them apart.
 * Spies never carry luggage either (they never carry bags at all).
 */
export function varietyFlags(ap: Appearance, isSpy: boolean): number {
  const s = ap.seed;
  const suit = SUITS.has(ap.coat);
  let flags = 0;
  if (!suit && !isSpy) {
    const o = hash(s * 13.7 + 1.1);
    if (!ap.longCoat && !ap.skirt) {
      if (o < 0.16 && ap.tie < 0 && !ap.scarf) flags |= FLAG.SWEATER;
      else if (o < 0.3) flags |= FLAG.PUFFER;
      else if (o < 0.42 && !ap.scarf) flags |= FLAG.ROLLED;
    }
    if (ap.longCoat && hash(s * 5.9) < 0.65) flags |= FLAG.TRENCHBELT;
    if (!ap.hat) {
      const hw = hash(s * 3.3 + 2.0);
      if (hw < 0.16) flags |= FLAG.BEANIE;
      else if (hw < 0.27) flags |= FLAG.CAP;
    }
  }
  if (!isSpy && ap.bag === 'none' && hash(s * 9.1 + 0.4) < (suit ? 0.1 : 0.18)) flags |= FLAG.SUITCASE;
  return flags;
}

export class CrowdRenderer {
  readonly mesh: THREE.InstancedMesh;
  /** Far people: the box body (one more draw call, roughly half the triangles). */
  readonly far: THREE.InstancedMesh;
  private readonly fbuf: InstanceBuffers;
  /** Per agent: sit blend (0 standing .. 1 seated) and the transition's start position. */
  private readonly sitK: Float32Array;
  private readonly sitTarget: Uint8Array;
  private readonly fromX: Float32Array;
  private readonly fromZ: Float32Array;
  private readonly lastX: Float32Array;
  private readonly lastZ: Float32Array;
  private lastTime = -1;
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
    const geo = buildHumanGeometry('high');
    this.buf = addInstanceAttributes(geo, capacity);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uTime;
      shader.vertexShader = ANIM_GLSL + shader.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normal; vec3 animP = position; animate(animP, objectNormal); vCol = partColor();')
        .replace('#include <begin_vertex>', 'vec3 transformed = animP;');
      shader.fragmentShader = 'varying vec3 vCol;\n' + SURFACE_GLSL + shader.fragmentShader
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( surfaceDetail( diffuse * vCol ), opacity );')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Fresnel: a warm rim light plus slight edge darkening separates figures
          // from the busy background, especially on the dim platforms.
          float facing = abs(dot(normal, normalize(vViewPosition)));
          float rim = pow(1.0 - facing, 4.0);
          diffuseColor.rgb *= 0.8 + 0.2 * smoothstep(0.0, 0.45, facing);
          totalEmissiveRadiance += vec3(0.1, 0.085, 0.065) * rim + diffuseColor.rgb * 0.08;`);
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'crowd';

    const fgeo = buildHumanGeometry('low');
    this.fbuf = addInstanceAttributes(fgeo, capacity);
    this.far = new THREE.InstancedMesh(fgeo, mat, capacity);
    this.far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.far.frustumCulled = false;
    this.far.count = 0;
    this.far.name = 'crowd-far';
    this.sitK = new Float32Array(capacity);
    this.sitTarget = new Uint8Array(capacity);
    this.fromX = new Float32Array(capacity);
    this.fromZ = new Float32Array(capacity);
    this.lastX = new Float32Array(capacity).fill(NaN);
    this.lastZ = new Float32Array(capacity).fill(NaN);

    // Outline pass: same animation, expanded along normals, back faces, red.
    const ogeo = buildHumanGeometry('high');
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

  /** Render position: interpolated, and eased in and out of seats. */
  private renderPos(a: Agent, alpha: number, out: { x: number; z: number }): void {
    const id = a.id;
    const target = a.pose === 'sit' ? 1 : 0;
    const simX = target ? a.seatX : a.px + (a.x - a.px) * alpha;
    const simZ = target ? a.seatZ : a.pz + (a.z - a.pz) * alpha;
    const k = this.sitK[id];
    const q = target ? k : 1 - k; // transition progress 0..1
    let x = simX, z = simZ;
    if (q < 1 && Math.hypot(this.fromX[id] - simX, this.fromZ[id] - simZ) < 2) {
      const e = q * q * (3 - 2 * q);
      x = this.fromX[id] + (simX - this.fromX[id]) * e;
      z = this.fromZ[id] + (simZ - this.fromZ[id]) * e;
    }
    this.lastX[id] = x;
    this.lastZ[id] = z;
    out.x = x;
    out.z = z;
  }

  /** Advance every agent's sit blend; remember where a sit-down or stand-up starts from. */
  private stepSit(agents: readonly Agent[], dt: number): void {
    const rate = dt / CONFIG.render.sitBlendSeconds;
    for (const a of agents) {
      const id = a.id;
      const target = a.alive && a.pose === 'sit' ? 1 : 0;
      if (!a.alive) {
        this.sitK[id] = 0;
        this.sitTarget[id] = 0;
        continue;
      }
      if (target !== this.sitTarget[id]) {
        this.sitTarget[id] = target;
        // Start from wherever we were last drawn (or the seat, when standing up).
        this.fromX[id] = Number.isNaN(this.lastX[id]) ? (target ? a.x : a.seatX) : this.lastX[id];
        this.fromZ[id] = Number.isNaN(this.lastZ[id]) ? (target ? a.z : a.seatZ) : this.lastZ[id];
      }
      const k = this.sitK[id];
      this.sitK[id] = target ? Math.min(1, k + rate) : Math.max(0, k - rate);
    }
  }

  private looks(a: Agent): { flags: number } {
    return { flags: varietyFlags(a.appearance, !!a.spy) };
  }

  private writeInstance(buf: InstanceBuffers, mesh: THREE.InstancedMesh, i: number, a: Agent, alpha: number, x: number, z: number): void {
    const ap = a.appearance;
    const y = a.py + (a.y - a.py) * alpha;
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
    const look = this.looks(a);
    let flags = look.flags;
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
    // Pose: the sit blend (0 standing .. 1 seated), or 2 for dead.
    const pose = a.pose === 'dead' ? 2 : this.sitK[a.id];
    const walk = Math.min(1, a.speed / 2.2);
    const run = Math.max(0, Math.min(1, (a.speed - 2.8) / 2));
    const amp = pose < 0.5 ? (0.5 * walk + 0.25 * run) * (1 - pose * 2) : 0;
    buf.anim.setXYZW(i, a.animPhase, amp, flags, pose);
    const aim = a.spy && a.spy.aiming ? 1 : drawn ? 0.5 : 0;
    buf.extra.setXYZW(i, ap.skin, a.crouch ? 1 : 0, aim, run);
    buf.style.setXYZW(i, ap.hairStyle, ap.build, act, ap.seed);
  }

  /**
   * Write all visible humans. `outlined` lists agent ids that get the red outline.
   * `hideId` is the first-person player.
   */
  update(agents: readonly Agent[], alpha: number, hideId: number, outlined: readonly number[], time: number, visible?: (x: number, y: number, z: number, r: number) => boolean, cam?: THREE.Vector3): void {
    this.uTime.value = time;
    const dt = this.lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    this.stepSit(agents, dt);
    const lod2 = CONFIG.render.crowdLodDistance ** 2;
    let n = 0;
    let f = 0;
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
      this.renderPos(a, alpha, rp);
      const x = rp.x, z = rp.z;
      const far = !!cam && (x - cam.x) ** 2 + (z - cam.z) ** 2 > lod2;
      if (far) {
        this.writeInstance(this.fbuf, this.far, f++, a, alpha, x, z);
      } else {
        this.writeInstance(this.buf, this.mesh, n, a, alpha, x, z);
        this.instanceOf[a.id] = n;
        n++;
      }
      const sit = this.sitK[a.id] > 0.5;
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
    this.far.count = f;
    this.far.visible = f > 0;
    if (f) {
      this.far.instanceMatrix.needsUpdate = true;
      for (const k of BUF_KEYS) this.fbuf[k].needsUpdate = true;
    }
    this.shadows.count = s;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    for (const k of BUF_KEYS) this.buf[k].needsUpdate = true;

    let o = 0;
    for (const id of outlined) {
      if (o >= MAX_OUTLINES) break;
      const a = agents[id];
      if (!a || !a.alive || a.id === hideId) continue;
      this.renderPos(a, alpha, rp);
      this.writeInstance(this.obuf, this.outline, o++, a, alpha, rp.x, rp.z);
    }
    this.outline.count = o;
    if (o > 0) {
      this.outline.instanceMatrix.needsUpdate = true;
      for (const k of BUF_KEYS) this.obuf[k].needsUpdate = true;
    }
  }
}
