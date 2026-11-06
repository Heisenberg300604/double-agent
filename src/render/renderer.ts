// Renderer setup and per-frame drawing. Reads simulation state; never mutates it.

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { World } from '../sim/world';
import { CrowdRenderer } from './crowd';
import { Effects } from './effects';
import { buildMapMeshes } from './mapMesh';
import { QualityScaler } from './quality';
import { Viewmodel } from './viewmodel';

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityLevel;

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface FrameOptions {
  dt: number;
  alpha: number;
  hideId: number;
  outlined: readonly number[];
  revealed: readonly { x: number; y: number; z: number }[];
  aiming: boolean;
  drawn: boolean;
  reloading: boolean;
  moveSpeed: number;
  showViewmodel: boolean;
}

const FOG_COLOR = 0x0d0c0f;

export class GameRenderer {
  renderer!: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly crowd: CrowdRenderer;
  readonly effects = new Effects();
  readonly viewmodel = new Viewmodel();
  readonly scaler = new QualityScaler();
  private readonly container: HTMLElement;
  private antialias = true;
  level: QualityLevel = 'high';
  setting: QualitySetting = 'auto';
  baseFov: number = CONFIG.weapon.fovNormal;
  private fov: number = CONFIG.weapon.fovNormal;
  drawCalls = 0;
  triangles = 0;

  constructor(container: HTMLElement, world: World) {
    this.container = container;
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.05, CONFIG.render.viewDistance);
    this.camera.rotation.order = 'YXZ';
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 24, 115);

    this.scene.add(new THREE.HemisphereLight(0xc9bca6, 0x2a2a31, 2.0));
    const sun = new THREE.DirectionalLight(0xffe2bd, 0.65);
    sun.position.set(-20, 40, 10);
    this.scene.add(sun);
    for (const l of world.layout.lights) {
      const p = new THREE.PointLight(l.color, l.intensity, l.distance, 2);
      p.position.set(l.x, l.y, l.z);
      this.scene.add(p);
    }

    this.scene.add(buildMapMeshes(world.layout));
    this.crowd = new CrowdRenderer(world.agents.length + 4);
    this.scene.add(this.crowd.shadows, this.crowd.mesh, this.crowd.outline);
    this.scene.add(this.effects.group);

    this.createRenderer(true);
    window.addEventListener('resize', () => this.resize());
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private createRenderer(antialias: boolean): void {
    const old = this.renderer;
    this.antialias = antialias;
    this.renderer = new THREE.WebGLRenderer({ antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.id = 'game-canvas';
    if (old) {
      this.container.replaceChild(this.renderer.domElement, old.domElement);
      old.dispose();
    } else {
      this.container.prepend(this.renderer.domElement);
    }
    this.resize();
  }

  /** Apply a quality setting ('auto' starts at high and lets the scaler adapt). */
  setQuality(setting: QualitySetting): void {
    this.setting = setting;
    this.level = setting === 'auto' ? 'high' : setting;
    const wantAA = this.level !== 'low';
    if (wantAA !== this.antialias) this.createRenderer(wantAA);
    if (setting !== 'auto') this.scaler.step = 0;
    this.applyScale();
  }

  private applyScale(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);
    const levelScale = this.level === 'low' ? 0.75 : this.level === 'medium' ? 0.9 : 1;
    const scale = this.scaler.scale;
    this.renderer.setPixelRatio(dpr * levelScale * scale);
    const partLevel = this.level === 'low' ? 0.4 : this.level === 'medium' ? 0.7 : 1;
    this.effects.particleScale = partLevel * (scale < 1 ? scale * 0.8 : 1);
    const fogFar = this.level === 'low' ? 85 : 115;
    (this.scene.fog as THREE.Fog).far = fogFar;
    this.camera.far = fogFar + 10;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  get renderScale(): number {
    return this.scaler.scale;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Feed frame time to the auto-quality scaler. */
  tickQuality(frameSeconds: number): void {
    if (this.setting !== 'auto') return;
    if (this.scaler.update(frameSeconds)) this.applyScale();
  }

  render(world: World, cam: CameraPose, o: FrameOptions): void {
    const targetFov = o.aiming ? CONFIG.weapon.fovAim : this.baseFov;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-12 * o.dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(cam.x, cam.y, cam.z);
    this.camera.rotation.set(cam.pitch, cam.yaw, cam.roll);

    this.crowd.update(world.agents, o.alpha, o.hideId, o.outlined);
    this.effects.update(o.dt, world.smokes, o.revealed);
    this.viewmodel.update(o.dt, o.drawn && o.showViewmodel, o.aiming, o.reloading, o.moveSpeed, this.camera.aspect, this.fov * 0.85);

    const r = this.renderer;
    r.info.reset();
    r.clear();
    r.render(this.scene, this.camera);
    if (o.showViewmodel) {
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
    }
    this.drawCalls = r.info.render.calls;
    this.triangles = r.info.render.triangles;
  }
}
