// First-person silenced pistol with hands, rendered in its own pass so it
// never clips into walls. Procedural model (slide, frame, sights, grip
// panels, suppressor, two hands) with look-sway, walk bob, breathing, slide
// blowback, a small muzzle flash, ejected casings and a magazine-swap reload.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowTexture } from './textures';
import type { Activity } from '../sim/types';

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
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

interface Casing { active: boolean; t: number; mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 }

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
  private readonly casings: Casing[] = [];
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
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.85, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, metalness: 0.6, roughness: 0.45 });
    const supp = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.55, roughness: 0.55 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x3a2617, metalness: 0, roughness: 0.65 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc99d80, metalness: 0, roughness: 0.75 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0, roughness: 0.9 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0xdedcd4, metalness: 0, roughness: 0.8 });
    const sightDot = new THREE.MeshBasicMaterial({ color: 0xf2e2b0 });

    // Slide (moves on blowback).
    const slideParts = [
      box(0.031, 0.032, 0.195, 0, 0.028, -0.078),
      box(0.004, 0.007, 0.007, 0, 0.0475, -0.163), // front sight
      box(0.005, 0.008, 0.008, -0.006, 0.048, 0.008), // rear sight posts
      box(0.005, 0.008, 0.008, 0.006, 0.048, 0.008),
    ];
    this.slide = new THREE.Mesh(merge(slideParts), steel);
    const slideDetail = new THREE.Mesh(merge([
      ...[0, 1, 2, 3, 4, 5].map((i) => box(0.0325, 0.022, 0.0025, 0, 0.028, 0.012 - i * 0.006)), // serrations
      box(0.002, 0.014, 0.04, 0.0157, 0.033, -0.05), // ejection port
    ]), dark);
    this.slide.add(slideDetail);
    const dots = new THREE.Mesh(merge([box(0.0025, 0.0025, 0.002, 0, 0.0495, -0.1665), box(0.0018, 0.0018, 0.002, -0.006, 0.05, 0.0035), box(0.0018, 0.0018, 0.002, 0.006, 0.05, 0.0035)]), sightDot);
    this.slide.add(dots);

    const frame = new THREE.Mesh(merge([
      box(0.029, 0.016, 0.17, 0, 0.004, -0.065),
      box(0.022, 0.008, 0.06, 0, -0.008, -0.12), // accessory rail
      box(0.012, 0.02, 0.014, 0, 0.04, 0.028), // hammer
      box(0.028, 0.004, 0.05, 0, -0.03, -0.022), // trigger guard
      box(0.028, 0.03, 0.004, 0, -0.016, -0.047),
      box(0.006, 0.018, 0.006, 0, -0.016, -0.016), // trigger
    ]), dark);
    const gripGeo = merge([box(0.03, 0.105, 0.046, 0, -0.055, 0.027)]);
    gripGeo.rotateX(-0.24);
    const gripFrame = new THREE.Mesh(gripGeo, dark);
    const panelGeo = merge([box(0.034, 0.08, 0.036, 0, -0.058, 0.028)]);
    panelGeo.rotateX(-0.24);
    const panels = new THREE.Mesh(panelGeo, grip);
    const magGeo = merge([box(0.024, 0.1, 0.034, 0, -0.06, 0.028), box(0.032, 0.008, 0.05, 0, -0.112, 0.03)]);
    magGeo.rotateX(-0.24);
    this.mag = new THREE.Mesh(magGeo, steel);
    const suppressor = new THREE.Mesh(merge([
      cylZ(0.019, -0.173, MUZZLE_Z, 0.028),
      cylZ(0.0205, -0.2, -0.207, 0.028),
      cylZ(0.0205, -0.312, -0.319, 0.028),
      cylZ(0.0165, MUZZLE_Z, MUZZLE_Z - 0.004, 0.028),
    ]), supp);

    // Right hand wrapped around the grip, plus cuff and sleeve.
    const handR = new THREE.Mesh(merge([
      box(0.018, 0.085, 0.06, 0.024, -0.05, 0.035), // back of hand
      box(0.044, 0.016, 0.022, 0.003, -0.033, -0.006), // fingers wrapping the front strap
      box(0.044, 0.016, 0.022, 0.003, -0.052, -0.001),
      box(0.042, 0.015, 0.02, 0.003, -0.071, 0.004),
      box(0.012, 0.012, 0.05, 0.02, -0.014, -0.03), // index finger along the frame
      box(0.012, 0.014, 0.06, -0.022, -0.004, -0.01), // thumb on the left side
    ].map((g) => { g.rotateX(-0.1); return g; })), skin);
    const cuffR = new THREE.Mesh(merge([box(0.06, 0.06, 0.03, 0.02, -0.07, 0.078)]), cuff);
    const armRGeo = box(0.07, 0.072, 0.3, 0, 0, 0.15);
    armRGeo.rotateX(0.55);
    armRGeo.rotateY(0.38);
    armRGeo.translate(0.02, -0.075, 0.085);
    const armR = new THREE.Mesh(armRGeo, sleeve);

    // Left support hand (visible when aiming).
    const handL = new THREE.Mesh(merge([
      box(0.02, 0.07, 0.06, -0.03, -0.065, 0.03),
      box(0.05, 0.015, 0.02, -0.006, -0.088, 0.0),
      box(0.012, 0.012, 0.05, -0.026, -0.03, -0.012),
    ]), skin);
    const cuffL = new THREE.Mesh(merge([box(0.058, 0.058, 0.03, -0.04, -0.09, 0.068)]), cuff);
    const armLGeo = box(0.068, 0.07, 0.3, 0, 0, 0.15);
    armLGeo.rotateX(0.7);
    armLGeo.rotateY(-0.55);
    armLGeo.translate(-0.045, -0.095, 0.075);
    this.leftHand.add(handL, cuffL, new THREE.Mesh(armLGeo, sleeve));

    // Muzzle flash: a small additive star at the suppressor end.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.11),
      new THREE.MeshBasicMaterial({ map: glowTexture(1.4), color: 0xffd090, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flash.position.set(0, 0.028, MUZZLE_Z - 0.03);
    this.flash.visible = false;

    this.gun.add(this.slide, frame, gripFrame, panels, this.mag, suppressor, handR, cuffR, armR, this.flash);
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

    const casingGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 8).rotateZ(Math.PI / 2);
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(casingGeo, brass);
      m.visible = false;
      this.scene.add(m);
      this.casings.push({ active: false, t: 0, mesh: m, v: new THREE.Vector3(), spin: new THREE.Vector3() });
    }

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
    const c = this.casings.find((k) => !k.active) ?? this.casings[0];
    c.active = true;
    c.t = 0;
    c.mesh.visible = true;
    this.gun.updateWorldMatrix(true, false);
    c.mesh.position.set(0.017, 0.035, -0.05).applyMatrix4(this.gun.matrixWorld);
    c.v.set(0.9 + Math.random() * 0.4, 0.9 + Math.random() * 0.4, 0.25);
    c.spin.set(Math.random() * 20, Math.random() * 30, Math.random() * 20);
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
      r * 0.55 + this.runBlend * 0.4 + Math.sin(this.bob) * 0.01 * bobAmt,
    );
    this.root.visible = this.drawn > 0.02;

    this.slide.position.z = Math.sin(Math.min(1, this.slideKick) * Math.PI) * 0.026;
    // Magazine swap: drop out, then a fresh one slides in.
    const rp = this.reload;
    let magDrop = 0;
    if (rp > 0.1 && rp < 0.45) magDrop = (rp - 0.1) / 0.35;
    else if (rp >= 0.45 && rp < 0.75) magDrop = 1 - (rp - 0.45) / 0.3;
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
    for (const c of this.casings) {
      if (!c.active) continue;
      c.t += dt;
      c.v.y -= 5 * dt;
      c.mesh.position.addScaledVector(c.v, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.t > 0.7) {
        c.active = false;
        c.mesh.visible = false;
      }
    }
  }
}
