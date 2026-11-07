// Renderer setup and per-frame drawing. Reads simulation state; never mutates it.

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { World } from '../sim/world';
import { CrowdRenderer } from './crowd';
import { Effects } from './effects';
import { buildEnvironment, buildMapMeshes, createMapMaterials, cullMapChunks, supportsMultiDraw, type MapVisuals } from './mapMesh';
import { ViewCull } from './viewCull';
import { TrainRenderer } from './trains';
import { Atmosphere } from './atmosphere';
import { QualityScaler } from './quality';
import { Viewmodel } from './viewmodel';
import type { Activity } from '../sim/types';

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
  /** 0..1 while reloading, -1 otherwise. */
  reloadProgress: number;
  moveSpeed: number;
  running: boolean;
  showViewmodel: boolean;
  /** The player's standing activity: shows the item (paper, phone) in the left hand. */
  activity: Activity;
}

const FOG_COLOR = 0x0d0c0f;

export class GameRenderer {
  renderer!: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly crowd: CrowdRenderer;
  readonly effects = new Effects();
  readonly map: MapVisuals;
  readonly atmosphere: Atmosphere;
  readonly trains: TrainRenderer;
  private readonly hideTrainsBeyond: number;
  private env: THREE.Texture | null = null;
  /** Station clock: minutes since midnight. */
  stationMinutes = 8 * 60 + 3;
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
  readonly cull = new ViewCull();
  /** For the F3 overlay: map chunks and crowd instances actually drawn. */
  chunksDrawn = 0;
  agentsDrawn = 0;

  constructor(container: HTMLElement, world: World) {
    this.container = container;
    // Near 0.1 (the body radius keeps walls ≥ 0.3 m away; the gun has its own pass) gives the
    // depth buffer 2× more precision than 0.05 over the larger station.
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.1, CONFIG.render.viewDistance);
    this.camera.rotation.order = 'YXZ';
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 30, 160);

    this.scene.add(new THREE.HemisphereLight(0xc9bca6, 0x2a2a31, 2.0));
    const sun = new THREE.DirectionalLight(0xffe2bd, 0.65);
    sun.position.set(-20, 40, 10);
    this.scene.add(sun);
    for (const l of world.layout.lights) {
      const p = new THREE.PointLight(l.color, l.intensity, l.distance, 2);
      p.position.set(l.x, l.y, l.z);
      this.scene.add(p);
    }

    this.map = buildMapMeshes(world.layout, createMapMaterials(), supportsMultiDraw());
    this.scene.add(this.map.group);
    this.trains = new TrainRenderer(world.layout, this.map);
    this.scene.add(this.trains.group);
    this.hideTrainsBeyond = world.layout.bounds.maxX + 70;
    this.atmosphere = new Atmosphere(world.layout);
    this.scene.add(this.atmosphere.group);
    this.crowd = new CrowdRenderer(world.agents.length + 4, world.layout.pois);
    this.scene.add(this.crowd.shadows, this.crowd.mesh, this.crowd.far, this.crowd.outline);
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
    // Reflections come from a tiny procedural environment rendered once per renderer.
    this.env?.dispose();
    this.env = buildEnvironment(this.renderer);
    for (const m of this.map.envMaterials) {
      m.envMap = this.env;
      m.needsUpdate = true;
    }
    this.viewmodel.setEnvironment(this.env);
    this.effects.setEnvironment(this.env);
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
    // Geometry must fade fully into the fog *before* the far plane clips it,
    // otherwise distant walls pop out of existence while turning.
    const fogFar = this.level === 'low' ? 120 : 160;
    (this.scene.fog as THREE.Fog).far = fogFar;
    this.camera.far = Math.min(CONFIG.render.viewDistance, fogFar + 40);
    // The polished (PBR) floor covers most of the screen; use the cheap one below High.
    const floorMesh = this.map.group.children.find((c) => c.userData.group === 'floor') as THREE.Mesh | undefined;
    if (floorMesh) floorMesh.material = this.level === 'high' ? this.map.floorRich : this.map.floorCheap;
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

    // Predictive view culling: only the map chunks and people in (or about to enter) the view.
    this.cull.update(cam, o.dt, this.camera.fov, this.camera.aspect, this.camera.far);
    this.chunksDrawn = cullMapChunks(this.map.chunks, (b) => this.cull.boxVisible(b));
    this.crowd.update(world.agents, o.alpha, o.hideId, o.outlined, performance.now() / 1000, (x, y, z, r) => this.cull.sphereVisible(x, y, z, r), this.camera.position);
    this.agentsDrawn = this.crowd.mesh.count + this.crowd.far.count;
    this.effects.update(o.dt, world.smokes, o.revealed, this.camera.position);
    this.stationMinutes += o.dt / 60;
    this.map.board.update(this.stationMinutes, o.dt);
    this.map.clock.update(this.stationMinutes);
    this.map.led.update(this.stationMinutes, o.dt);
    const vh = this.renderer.domElement.height;
    this.atmosphere.update(performance.now() / 1000, vh, this.camera.fov, this.effects.particleScale);
    this.trains.update(world.trains.trains, this.hideTrainsBeyond, o.alpha);
    this.viewmodel.setActivity(o.showViewmodel && !o.drawn ? o.activity : 'none');
    this.viewmodel.update(o.dt, o.drawn && o.showViewmodel, o.aiming, o.reloadProgress, o.moveSpeed, o.running, this.camera.aspect, this.fov * 0.85);

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
