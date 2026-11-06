// Atmosphere: lamp halos, warm/cool light pools on the floor, light shafts
// from the high windows, drifting dust, and the animated train doors.
// Each layer is a single draw call; animation runs in shaders where possible.

import * as THREE from 'three';
import type { MapLayout } from '../world/mapData';
import { glowTexture } from './textures';

const col = new THREE.Color();

/**
 * Lamp halos as camera-facing instanced quads. (Point sprites pop out as soon
 * as their centre leaves the screen and are capped in size by the GPU, which
 * made the column lamps flicker while turning.)
 */
function haloLayer(layout: MapLayout, tex: THREE.Texture): THREE.Mesh {
  const n = layout.glows.length;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const center = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const size = new Float32Array(n);
  layout.glows.forEach((g, i) => {
    center.set([g.x, g.y, g.z], i * 3);
    col.setHex(g.color);
    color.set([col.r, col.g, col.b], i * 3);
    size[i] = g.size * 0.5;
  });
  geo.setAttribute('iCenter', new THREE.InstancedBufferAttribute(center, 3));
  geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(color, 3));
  geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 1));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex } },
    vertexShader: /* glsl */ `
      attribute vec3 iCenter; attribute vec3 iColor; attribute float iSize;
      varying vec2 vUv; varying vec3 vColor; varying float vFade;
      void main() {
        vec4 mv = viewMatrix * vec4(iCenter, 1.0);
        float d = -mv.z;
        // Fade out when very close (no giant sprite in your face) and far away.
        vFade = smoothstep(0.8, 3.5, d) * (1.0 - smoothstep(70.0, 115.0, d));
        mv.xy += position.xy * iSize;
        vUv = uv;
        vColor = iColor;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; varying vec2 vUv; varying vec3 vColor; varying float vFade;
      void main() {
        float a = texture2D(map, vUv).a;
        gl_FragColor = vec4(vColor * a * 0.5 * vFade, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

function poolLayer(layout: MapLayout, tex: THREE.Texture): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, layout.pools.length);
  const m = new THREE.Matrix4();
  layout.pools.forEach((p, i) => {
    m.makeScale(p.radius, 1, p.radius).setPosition(p.x, p.y + 0.015, p.z);
    mesh.setMatrixAt(i, m);
    col.setHex(p.color).multiplyScalar(p.strength);
    mesh.setColorAt(i, col);
  });
  mesh.renderOrder = 1;
  return mesh;
}

function shaftLayer(layout: MapLayout, uniforms: { uTime: { value: number } }): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  for (const s of layout.shafts) {
    for (const rot of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(s.w, s.h, 1, 1);
      const c = new THREE.Color(s.color);
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < g.attributes.position.count; i++) colors.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.rotateY(rot);
      g.rotateX(s.tiltX);
      g.rotateZ(s.tiltZ);
      g.translate(s.x, s.y, s.z);
      geos.push(g);
    }
  }
  const merged = new THREE.BufferGeometry();
  // Manual merge (plane geometries share layout).
  const pos: number[] = [], uv: number[] = [], color: number[] = [], index: number[] = [];
  let base = 0;
  for (const g of geos) {
    pos.push(...(g.attributes.position.array as Float32Array));
    uv.push(...(g.attributes.uv.array as Float32Array));
    color.push(...(g.attributes.color.array as Float32Array));
    for (const k of g.index!.array) index.push(k + base);
    base += g.attributes.position.count;
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  merged.setIndex(index);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 color; varying vec2 vUv; varying vec3 vColor; varying float vDist;
      void main() { vUv = uv; vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv; varying vec3 vColor; varying float vDist;
      void main() {
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float fall = smoothstep(0.0, 0.9, vUv.y) * (0.35 + 0.65 * vUv.y);
        float shimmer = 0.85 + 0.15 * sin(vUv.x * 13.0 + uTime * 0.6) * sin(vUv.y * 7.0 - uTime * 0.4);
        float near = smoothstep(1.5, 6.0, vDist);
        gl_FragColor = vec4(vColor * edge * fall * shimmer * near * 0.075, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}

function dustLayer(count: number, uniforms: { uTime: { value: number }; uScale: { value: number } }): THREE.Points {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const hall = i % 5 !== 0;
    pos[i * 3] = hall ? -39 + Math.random() * 60 : 23 + Math.random() * 16;
    pos[i * 3 + 1] = 0.5 + Math.random() * (hall ? 12 : 8);
    pos[i * 3 + 2] = hall ? -14 + Math.random() * 28 : -24 + Math.random() * 48;
    seed[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float seed; uniform float uTime; uniform float uScale; varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.11 + seed) * 0.8;
        p.y += sin(uTime * 0.07 + seed * 1.7) * 0.6;
        p.z += cos(uTime * 0.09 + seed * 0.6) * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vA = (0.5 + 0.5 * sin(uTime * 0.8 + seed * 3.0)) * smoothstep(0.5, 2.5, d) * (1.0 - smoothstep(14.0, 26.0, d));
        gl_PointSize = 0.05 * uScale / max(d, 0.1) + 1.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * (1.0 - smoothstep(0.2, 0.5, r)) * vA * 0.35, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ------------------------------------------------------------------ train doors
type DoorState = { open: number; target: number; hold: number };

class TrainDoors {
  readonly leaves: THREE.InstancedMesh;
  readonly windows: THREE.InstancedMesh;
  private readonly layout: MapLayout;
  readonly states: DoorState[] = [{ open: 0, target: 0, hold: 0 }, { open: 0, target: 0, hold: 0 }];
  private readonly m = new THREE.Matrix4();

  constructor(layout: MapLayout) {
    this.layout = layout;
    const n = layout.doors.length * 2;
    const leafGeo = new THREE.BoxGeometry(0.6, 2.36, 0.05);
    leafGeo.translate(0, 1.73, 0);
    this.leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2a405a, roughness: 0.3, metalness: 0.3 }), n);
    const winGeo = new THREE.BoxGeometry(0.4, 0.75, 0.06);
    winGeo.translate(0, 2.35, 0);
    this.windows = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ color: 0x8a6236 }), n);
    for (const mesh of [this.leaves, this.windows]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
    }
    this.update(0);
  }

  /** Open a train's doors for a while (visual only). */
  cycle(train: number, hold = 9): void {
    const s = this.states[train];
    if (!s) return;
    s.target = 1;
    s.hold = hold;
  }

  update(dt: number): void {
    for (const s of this.states) {
      if (s.target === 1 && s.open >= 1) {
        s.hold -= dt;
        if (s.hold <= 0) s.target = 0;
      }
      s.open += Math.sign(s.target - s.open) * Math.min(Math.abs(s.target - s.open), dt / 1.4);
    }
    let i = 0;
    for (const d of this.layout.doors) {
      const o = this.states[d.train].open;
      const ease = o * o * (3 - 2 * o);
      const plug = Math.min(1, ease * 4) * 0.07 * d.side;
      for (const s of [-1, 1]) {
        this.m.makeTranslation(d.x + s * (0.31 + ease * 0.58), 0, d.z + plug);
        this.leaves.setMatrixAt(i, this.m);
        this.windows.setMatrixAt(i, this.m);
        i++;
      }
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    this.windows.instanceMatrix.needsUpdate = true;
  }
}

export class Atmosphere {
  readonly group = new THREE.Group();
  readonly doors: TrainDoors;
  private readonly uniforms = { uTime: { value: 0 }, uScale: { value: 600 } };
  private readonly dust: THREE.Points;

  constructor(layout: MapLayout) {
    const glow = glowTexture(1);
    this.group.add(poolLayer(layout, glowTexture(0.8)));
    this.group.add(shaftLayer(layout, this.uniforms));
    this.dust = dustLayer(700, this.uniforms);
    this.group.add(this.dust);
    this.group.add(haloLayer(layout, glow));
    this.doors = new TrainDoors(layout);
    this.group.add(this.doors.leaves, this.doors.windows);
  }

  /** viewportHeight in device pixels; used for perspective point sizes. */
  update(dt: number, time: number, viewportHeight: number, fovDeg: number, particleScale: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uScale.value = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.dust.visible = particleScale > 0.3;
    this.doors.update(dt);
  }
}
