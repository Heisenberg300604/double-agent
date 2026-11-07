// First-person suppressed pistol with hands, rendered in its own pass so it
// never clips into walls. Procedural model: bevelled parkerised slide with
// serrations and tritium sights, polymer frame with a stippled grip, knurled
// suppressor, rounded fingers with knuckles, suit sleeves over white shirt
// cuffs. Look-sway, walk bob, breathing, slide blowback, recoil with a little
// random roll, small varied muzzle flashes, smoke wisps after rapid fire and
// a magazine-swap reload. Spent casings are world-space effects (effects.ts).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { glowTexture, gunWearTexture, muzzleFlashTextures, stippleTexture } from './textures';
import type { Activity } from '../sim/types';
import { CONFIG } from '../config';

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  return g;
}

/** Box with rounded (bevelled) edges. */
function rbox(w: number, h: number, d: number, x: number, y: number, z: number, r: number): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, 2, r).toNonIndexed();
  g.translate(x, y, z);
  return g;
}

function cylZ(r: number, z0: number, z1: number, y: number, seg = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), seg).toNonIndexed();
  g.rotateX(Math.PI / 2);
  g.translate(0, y, (z0 + z1) / 2);
  return g;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list, false)!;
  list.forEach((x) => x.dispose());
  return g;
}

/** Height of the sight line above the gun origin. */
const SIGHT_Y = 0.051;
const MUZZLE_Z = -0.345;

const HIP = new THREE.Vector3(0.125, -0.13, -0.3);
const ADS = new THREE.Vector3(0, -SIGHT_Y * 0.85, -0.42);

interface Wisp { t: number; mesh: THREE.Mesh; vx: number }

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();
  private readonly gun = new THREE.Group();
  private readonly slide: THREE.Mesh;
  private readonly mag: THREE.Mesh;
  private readonly leftHand = new THREE.Group();
  /** Held item for standing activities (newspaper or phone) in the idle left hand. */
  private readonly item = new THREE.Group();
  private readonly paper: THREE.Group;
  private readonly phone: THREE.Group;
  private activity: Activity = 'none';
  private itemBlend = 0;
  private readonly flash: THREE.Mesh;
  private readonly flashTextures: THREE.CanvasTexture[];
  private readonly wisps: Wisp[] = [];
  /** Barrel heat from rapid fire: wisps appear above a threshold. */
  private heat = 0;
  private rollKick = 0;
  private readonly tmp = new THREE.Vector3();
  private drawn = 0;
  private aim = 0;
  private recoil = 0;
  private slideKick = 0;
  private flashT = 0;
  private reload = 0;
  private bob = 0;
  private time = 0;
  private runBlend = 0;
  private swayX = 0;
  private swayY = 0;
  private swayVX = 0;
  private swayVY = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    // Finishes: parkerised steel slide with handling wear, matte polymer frame,
    // stippled grip, blued suppressor. All pick up the station environment map.
    const wear = gunWearTexture();
    const stipple = stippleTexture();
    const steel = new THREE.MeshStandardMaterial({ color: 0x3c4046, metalness: 0.78, roughness: 0.55, roughnessMap: wear, envMapIntensity: 1.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.05, roughness: 0.72, roughnessMap: wear });
    const supp = new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0.6, roughness: 0.5, roughnessMap: wear });
    const grip = new THREE.MeshStandardMaterial({ color: 0x1e1f22, metalness: 0, roughness: 0.9, bumpMap: stipple, bumpScale: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc99d80, metalness: 0, roughness: 0.62 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0, roughness: 0.92 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0xe8e5dc, metalness: 0, roughness: 0.75 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb8914c, metalness: 0.9, roughness: 0.3 });
    const sightDot = new THREE.MeshBasicMaterial({ color: 0xa6ffb0 });
    const sightRing = new THREE.MeshBasicMaterial({ color: 0xf0ead8 });

    // Slide (moves on blowback): bevelled body, sights, front and rear serrations.
    this.slide = new THREE.Mesh(merge([
      rbox(0.031, 0.032, 0.195, 0, 0.028, -0.078, 0.004),
      rbox(0.004, 0.007, 0.008, 0, 0.0475, -0.163, 0.0012), // front sight
      rbox(0.006, 0.008, 0.008, -0.006, 0.048, 0.008, 0.0012), // rear sight posts
      rbox(0.006, 0.008, 0.008, 0.006, 0.048, 0.008, 0.0012),
    ]), steel);
    const slideDetail = new THREE.Mesh(merge([
      ...[0, 1, 2, 3, 4, 5].map((i) => box(0.0325, 0.022, 0.0022, 0, 0.026, 0.012 - i * 0.006)), // rear serrations
      ...[0, 1, 2, 3].map((i) => box(0.0325, 0.018, 0.002, 0, 0.026, -0.14 - i * 0.006)), // front serrations
      box(0.002, 0.013, 0.042, 0.0157, 0.034, -0.05), // ejection port
      box(0.0325, 0.0015, 0.17, 0, 0.0128, -0.075), // slide-to-frame seam
    ]), dark);
    this.slide.add(slideDetail);
    // Tritium: a green dot ringed in white on each sight.
    this.slide.add(new THREE.Mesh(merge([cylZ(0.0013, -0.1675, -0.1665, 0.0495, 8), cylZ(0.001, 0.0035, 0.0045, 0.05, 8).translate(-0.006, 0, 0), cylZ(0.001, 0.0035, 0.0045, 0.05, 8).translate(0.006, 0, 0)]), sightDot));
    this.slide.add(new THREE.Mesh(merge([cylZ(0.0021, -0.1672, -0.1667, 0.0495, 10), cylZ(0.0017, 0.0037, 0.0042, 0.05, 10).translate(-0.006, 0, 0), cylZ(0.0017, 0.0037, 0.0042, 0.05, 10).translate(0.006, 0, 0)]), sightRing));

    // Polymer frame: dust cover, rail, beavertail, trigger guard, trigger, slide stop.
    const frame = new THREE.Mesh(merge([
      rbox(0.029, 0.016, 0.17, 0, 0.004, -0.065, 0.003),
      rbox(0.022, 0.008, 0.06, 0, -0.008, -0.12, 0.002), // accessory rail
      ...[0, 1, 2].map((i) => box(0.0235, 0.003, 0.004, 0, -0.0125, -0.135 + i * 0.012)), // rail slots
      rbox(0.026, 0.012, 0.022, 0, 0.002, 0.03, 0.004), // beavertail
      rbox(0.026, 0.005, 0.05, 0, -0.031, -0.022, 0.002), // trigger guard (bottom)
      rbox(0.026, 0.03, 0.005, 0, -0.016, -0.047, 0.002), // trigger guard (front)
      rbox(0.006, 0.018, 0.007, 0, -0.016, -0.017, 0.002), // trigger
      box(0.002, 0.005, 0.016, -0.0155, 0.006, -0.03), // slide stop
    ]), dark);
    const gripGeo = merge([rbox(0.03, 0.105, 0.046, 0, -0.055, 0.027, 0.007)]);
    gripGeo.rotateX(-0.24);
    const gripFrame = new THREE.Mesh(gripGeo, dark);
    const panelGeo = merge([rbox(0.0325, 0.078, 0.036, 0, -0.058, 0.028, 0.006)]);
    panelGeo.rotateX(-0.24);
    const panels = new THREE.Mesh(panelGeo, grip);
    const magGeo = merge([box(0.024, 0.1, 0.034, 0, -0.06, 0.028), rbox(0.033, 0.009, 0.05, 0, -0.112, 0.03, 0.003)]);
    magGeo.rotateX(-0.24);
    this.mag = new THREE.Mesh(magGeo, steel);
    const suppressor = new THREE.Mesh(merge([
      cylZ(0.019, -0.173, MUZZLE_Z, 0.028, 20),
      cylZ(0.0205, -0.2, -0.207, 0.028, 20),
      ...[0, 1, 2, 3, 4, 5].map((i) => cylZ(0.0196, -0.222 - i * 0.012, -0.226 - i * 0.012, 0.028, 20)), // knurled grip rings
      cylZ(0.0205, -0.312, -0.319, 0.028, 20),
      cylZ(0.0165, MUZZLE_Z, MUZZLE_Z - 0.004, 0.028, 20),
    ]), supp);

    // Right hand around the grip: rounded fingers with knuckles, thumb along the frame.
    const fingerX = (r: number, len: number, x: number, y: number, z: number): THREE.BufferGeometry => {
      const g = new THREE.CapsuleGeometry(r, len, 3, 8).toNonIndexed();
      g.rotateZ(Math.PI / 2);
      g.translate(x, y, z);
      return g;
    };
    const fingerZ = (r: number, len: number, x: number, y: number, z: number): THREE.BufferGeometry => {
      const g = new THREE.CapsuleGeometry(r, len, 3, 8).toNonIndexed();
      g.rotateX(Math.PI / 2);
      g.translate(x, y, z);
      return g;
    };
    const knuckle = (x: number, y: number, z: number): THREE.BufferGeometry => {
      const g = new THREE.SphereGeometry(0.0085, 8, 6).toNonIndexed();
      g.translate(x, y, z);
      return g;
    };
    const handR = new THREE.Mesh(merge([
      rbox(0.022, 0.085, 0.062, 0.024, -0.05, 0.035, 0.009), // back of hand
      fingerX(0.0095, 0.03, 0.003, -0.033, -0.006), // fingers wrapping the front strap
      fingerX(0.0095, 0.03, 0.003, -0.052, -0.001),
      fingerX(0.009, 0.028, 0.003, -0.071, 0.004),
      knuckle(0.027, -0.03, 0.0), knuckle(0.027, -0.05, 0.004), knuckle(0.027, -0.069, 0.009),
      fingerZ(0.0065, 0.04, 0.02, -0.014, -0.03), // index finger along the frame
      fingerZ(0.0075, 0.045, -0.021, -0.004, -0.01), // thumb on the left side
    ].map((g) => { g.rotateX(-0.1); return g; })), skin);

    // Suit sleeve over a white shirt cuff with a brass cufflink, along the forearm.
    const forearm = (rx: number, ry: number, tx: number, ty: number, tz: number): { arm: THREE.BufferGeometry; cuff: THREE.BufferGeometry; link: THREE.BufferGeometry } => {
      const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
        g.rotateX(rx);
        g.rotateY(ry);
        g.translate(tx, ty, tz);
        return g;
      };
      const arm = new THREE.CylinderGeometry(0.039, 0.043, 0.28, 16, 1, true).toNonIndexed();
      arm.rotateX(Math.PI / 2);
      arm.translate(0, 0, 0.17);
      const c = new THREE.CylinderGeometry(0.034, 0.034, 0.034, 16).toNonIndexed();
      c.rotateX(Math.PI / 2);
      c.translate(0, 0, 0.018);
      const l = new THREE.SphereGeometry(0.0045, 8, 6).toNonIndexed();
      l.translate(0.033, 0, 0.02);
      return { arm: place(arm), cuff: place(c), link: place(l) };
    };
    const fr = forearm(0.55, 0.38, 0.02, -0.075, 0.07);
    const armR = new THREE.Mesh(fr.arm, sleeve);
    const cuffR = new THREE.Mesh(fr.cuff, cuff);
    const linkR = new THREE.Mesh(fr.link, brass);

    // Left support hand (visible when aiming).
    const handL = new THREE.Mesh(merge([
      rbox(0.02, 0.07, 0.06, -0.03, -0.065, 0.03, 0.008),
      fingerX(0.009, 0.03, -0.006, -0.088, 0.0),
      fingerX(0.0088, 0.028, -0.006, -0.07, -0.004),
      knuckle(-0.03, -0.088, 0.0), knuckle(-0.03, -0.07, -0.004),
      fingerZ(0.0065, 0.04, -0.026, -0.03, -0.012),
    ]), skin);
    const fl = forearm(0.7, -0.55, -0.045, -0.105, 0.07);
    this.leftHand.add(handL, new THREE.Mesh(fl.cuff, cuff), new THREE.Mesh(fl.arm, sleeve), new THREE.Mesh(fl.link, brass));

    // Muzzle flash: small (suppressed), one of a few ragged stars, random each shot.
    this.flashTextures = muzzleFlashTextures(3);
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.07),
      new THREE.MeshBasicMaterial({ map: this.flashTextures[0], color: 0xffc888, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flash.position.set(0, 0.028, MUZZLE_Z - 0.02);
    this.flash.visible = false;

    // Smoke wisps curling off the suppressor after rapid fire.
    const wispMat = new THREE.MeshBasicMaterial({ map: glowTexture(0.8), color: 0x9a9690, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), wispMat.clone());
      m.visible = false;
      this.scene.add(m);
      this.wisps.push({ t: 1, mesh: m, vx: 0 });
    }

    this.gun.add(this.slide, frame, gripFrame, panels, this.mag, suppressor, handR, cuffR, armR, linkR, this.flash);
    this.root.add(this.gun, this.leftHand);
    this.scene.add(this.root);

    // Activity items: a folded newspaper and a phone, each with the holding hand.
    const newsprint = new THREE.MeshStandardMaterial({ color: 0xd9d3c4, metalness: 0, roughness: 0.95 });
    const ink = new THREE.MeshStandardMaterial({ color: 0x3a3733, metalness: 0, roughness: 0.95 });
    const paperHand = new THREE.Mesh(merge([
      box(0.02, 0.07, 0.06, -0.09, -0.07, 0.03),
      box(0.05, 0.015, 0.02, -0.07, -0.035, -0.01),
      box(0.012, 0.012, 0.05, -0.086, -0.04, -0.03),
    ]), skin);
    const paperCuff = new THREE.Mesh(merge([box(0.058, 0.058, 0.03, -0.1, -0.1, 0.07)]), cuff);
    const paperArmGeo = box(0.068, 0.07, 0.3, 0, 0, 0.15);
    paperArmGeo.rotateX(0.75);
    paperArmGeo.rotateY(-0.5);
    paperArmGeo.translate(-0.11, -0.105, 0.075);
    const sheet = merge([box(0.3, 0.004, 0.22, 0.02, -0.03, -0.02)]);
    sheet.rotateX(0.55);
    const headlines = merge([
      box(0.11, 0.0015, 0.016, -0.06, -0.0265, -0.1),
      ...[0, 1, 2, 3, 4].map((i) => box(0.12, 0.0015, 0.004, -0.055, -0.0265, -0.07 + i * 0.016)),
      ...[0, 1, 2, 3, 4].map((i) => box(0.11, 0.0015, 0.004, 0.09, -0.0265, -0.095 + i * 0.016)),
      box(0.1, 0.0015, 0.05, 0.09, -0.0265, 0.03),
    ]);
    headlines.rotateX(0.55);
    this.paper = new THREE.Group();
    this.paper.add(new THREE.Mesh(sheet, newsprint), new THREE.Mesh(headlines, ink), paperHand, paperCuff, new THREE.Mesh(paperArmGeo, sleeve));

    const phoneBody = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.6, roughness: 0.35 });
    const screen = new THREE.MeshBasicMaterial({ color: 0xcfe3ff });
    const phoneHand = new THREE.Mesh(merge([
      box(0.02, 0.07, 0.06, -0.09, -0.085, 0.03),
      box(0.05, 0.015, 0.02, -0.07, -0.05, -0.01),
      box(0.012, 0.045, 0.012, -0.07, -0.03, -0.015),
    ]), skin);
    const phoneCuff = new THREE.Mesh(merge([box(0.058, 0.058, 0.03, -0.1, -0.11, 0.07)]), cuff);
    const phoneArmGeo = box(0.068, 0.07, 0.3, 0, 0, 0.15);
    phoneArmGeo.rotateX(0.75);
    phoneArmGeo.rotateY(-0.5);
    phoneArmGeo.translate(-0.11, -0.115, 0.075);
    const slab = merge([box(0.036, 0.075, 0.006, -0.07, -0.03, -0.012)]);
    slab.rotateX(-0.35);
    const glass = merge([box(0.031, 0.066, 0.001, -0.07, -0.03, -0.0155)]);
    glass.rotateX(-0.35);
    this.phone = new THREE.Group();
    this.phone.add(new THREE.Mesh(slab, phoneBody), new THREE.Mesh(glass, screen), phoneHand, phoneCuff, new THREE.Mesh(phoneArmGeo, sleeve));

    this.item.add(this.paper, this.phone);
    this.item.visible = false;
    this.scene.add(this.item);


    this.scene.add(new THREE.HemisphereLight(0xffe2bf, 0x1c1c22, 1.1));
    const key = new THREE.DirectionalLight(0xffd7a8, 2.2);
    key.position.set(0.6, 1, 0.4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fb8e0, 1.4);
    rim.position.set(-0.8, 0.4, -1);
    this.scene.add(rim);
  }

  setEnvironment(env: THREE.Texture): void {
    this.scene.environment = env;
  }

  /** Mouse movement this frame (pixels): the gun lags behind the view. */
  addLook(dx: number, dy: number): void {
    this.swayVX -= dx * 0.00012;
    this.swayVY -= dy * 0.00012;
  }

  /** Standing activity: raises the matching item into view when the gun is holstered. */
  setActivity(a: Activity): void {
    this.activity = a;
  }

  kick(): void {
    this.recoil = 1;
    this.slideKick = 1;
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    (this.flash.material as THREE.MeshBasicMaterial).map = this.flashTextures[Math.floor(Math.random() * this.flashTextures.length)];
    this.rollKick = (Math.random() - 0.5) * 0.16;
    this.heat = Math.min(4, this.heat + 1);
    if (this.heat > 2.2) {
      const w = this.wisps.find((x) => x.t >= 1) ?? this.wisps[0];
      w.t = 0;
      w.vx = (Math.random() - 0.5) * 0.04;
      this.gun.updateWorldMatrix(true, false);
      w.mesh.position.set(0, 0.028, MUZZLE_Z - 0.01).applyMatrix4(this.gun.matrixWorld);
      w.mesh.visible = true;
    }
  }

  /**
   * reloadProgress: 0..1 while reloading, -1 otherwise.
   * moveSpeed m/s; running when sprinting.
   */
  update(dt: number, drawn: boolean, aiming: boolean, reloadProgress: number, moveSpeed: number, running: boolean, aspect: number, fov: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.time += dt;
    const k = 1 - Math.exp(-14 * dt);
    this.drawn += ((drawn ? 1 : 0) - this.drawn) * (1 - Math.exp(-11 * dt));
    this.aim += ((aiming ? 1 : 0) - this.aim) * k;
    this.runBlend += ((running && !aiming ? 1 : 0) - this.runBlend) * (1 - Math.exp(-8 * dt));
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.slideKick = Math.max(0, this.slideKick - dt * 14);
    this.flashT -= dt;
    this.reload = reloadProgress >= 0 ? reloadProgress : 0;
    this.bob += dt * moveSpeed * 2.4;

    // Spring-damped look sway.
    const stiff = 90, damp = 12;
    this.swayVX += (-stiff * this.swayX - damp * this.swayVX) * dt;
    this.swayVY += (-stiff * this.swayY - damp * this.swayVY) * dt;
    this.swayX += this.swayVX * dt;
    this.swayY += this.swayVY * dt;

    const p = this.tmp.copy(HIP).lerp(ADS, this.aim);
    const bobAmt = (1 - this.aim * 0.85) * Math.min(1.3, moveSpeed / 2.2);
    p.x += Math.sin(this.bob) * 0.009 * bobAmt + this.swayX * (1 - this.aim * 0.6);
    p.y += -Math.abs(Math.cos(this.bob)) * 0.008 * bobAmt + this.swayY * (1 - this.aim * 0.6);
    p.y += Math.sin(this.time * 1.4) * 0.0012 * (1 - this.aim * 0.7);
    p.y -= (1 - this.drawn) * 0.3;
    p.y -= this.runBlend * 0.04;
    p.z += this.recoil * 0.03;
    const r = Math.sin(this.reload * Math.PI);
    p.y -= r * 0.04;
    this.root.position.copy(p);
    // Slightly smaller and lower-profile when sighting so the gun never hides targets.
    this.root.scale.setScalar(1 - this.aim * 0.15);
    this.root.rotation.set(
      this.recoil * 0.12 - (1 - this.drawn) * 0.9 - this.runBlend * 0.45 + r * 0.35 + this.swayY * 2,
      this.swayX * -2 + this.runBlend * 0.25,
      r * 0.55 + this.runBlend * 0.4 + Math.sin(this.bob) * 0.01 * bobAmt + this.rollKick * this.recoil,
    );
    this.root.visible = this.drawn > 0.02;

    this.slide.position.z = Math.sin(Math.min(1, this.slideKick) * Math.PI) * 0.026;
    // Magazine swap: drop out, then a fresh one slides in.
    const rp = this.reload;
    const RA = CONFIG.weapon.reloadAnim;
    let magDrop = 0;
    if (rp > RA.dropStart && rp < RA.dropEnd) magDrop = (rp - RA.dropStart) / (RA.dropEnd - RA.dropStart);
    else if (rp >= RA.dropEnd && rp < RA.seated) magDrop = 1 - (rp - RA.dropEnd) / (RA.seated - RA.dropEnd);
    this.mag.position.set(0, -magDrop * 0.16, magDrop * 0.04);
    this.mag.visible = magDrop < 0.95;
    // Left hand comes up to support the grip when aiming (or to swap the mag).
    const lh = Math.max(this.aim, r);
    this.leftHand.position.set(-0.02 * (1 - lh), -0.25 * (1 - lh), 0.05 * (1 - lh));
    this.leftHand.visible = lh > 0.02;

    // Held item eases up from below when an activity starts (and the gun is away).
    const wantItem = this.drawn < 0.05 && (this.activity === 'read' || this.activity === 'phone');
    this.itemBlend += ((wantItem ? 1 : 0) - this.itemBlend) * (1 - Math.exp(-7 * dt));
    this.item.visible = this.itemBlend > 0.02;
    if (this.item.visible) {
      this.paper.visible = this.activity === 'read';
      this.phone.visible = this.activity === 'phone';
      const breathe = Math.sin(this.time * 1.3) * 0.002;
      this.item.position.set(0.05 + this.swayX * 0.5, -0.1 - (1 - this.itemBlend) * 0.3 + breathe + this.swayY * 0.5, -0.3);
      this.item.rotation.set(-0.25 + this.swayY * 1.5, 0.12 + this.swayX * -1.5, 0.05);
    }

    this.flash.visible = this.flashT > 0;
    this.heat = Math.max(0, this.heat - dt * 1.1);
    for (const w of this.wisps) {
      if (w.t >= 1) continue;
      w.t = Math.min(1, w.t + dt / 1.3);
      w.mesh.position.y += dt * 0.05;
      w.mesh.position.x += w.vx * dt;
      w.mesh.scale.setScalar(1 + w.t * 1.8);
      w.mesh.rotation.z += dt * 0.6;
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.32 * Math.sin(w.t * Math.PI) * (1 - this.aim * 0.6);
      if (w.t >= 1) w.mesh.visible = false;
    }
  }
}
