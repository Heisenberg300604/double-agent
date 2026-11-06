// Atmosphere: lamp halos, warm/cool light pools on the floor and drifting dust
// in the halls. Each layer is a single draw call; dust animates in its shader.

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
        vFade = smoothstep(0.8, 3.5, d) * (1.0 - smoothstep(90.0, 150.0, d));
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
  // Lifted 2.5 cm off the floor instead of a large negative polygon offset: the
  // offset is slope-scaled, so at grazing angles it pulled the pools in front of
  // bench legs and wall bases and they flickered through them while turning.
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, layout.pools.length);
  const m = new THREE.Matrix4();
  layout.pools.forEach((p, i) => {
    m.makeScale(p.radius, 1, p.radius).setPosition(p.x, p.y + 0.025, p.z);
    mesh.setMatrixAt(i, m);
    col.setHex(p.color).multiplyScalar(p.strength);
    mesh.setColorAt(i, col);
  });
  mesh.renderOrder = 1;
  return mesh;
}

function dustLayer(count: number, uniforms: { uTime: { value: number }; uScale: { value: number } }): THREE.Points {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  // Dust drifts in the concourse and waiting room only (not on the platforms).
  for (let i = 0; i < count; i++) {
    pos[i * 3] = -61 + Math.random() * 84;
    pos[i * 3 + 1] = 0.5 + Math.random() * 11;
    pos[i * 3 + 2] = -14 + Math.random() * 28;
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

export class Atmosphere {
  readonly group = new THREE.Group();
  private readonly uniforms = { uTime: { value: 0 }, uScale: { value: 600 } };
  private readonly dust: THREE.Points;

  constructor(layout: MapLayout) {
    this.group.add(poolLayer(layout, glowTexture(0.8)));
    this.dust = dustLayer(800, this.uniforms);
    this.group.add(this.dust);
    this.group.add(haloLayer(layout, glowTexture(1)));
  }

  /** viewportHeight in device pixels; used for perspective point sizes. */
  update(time: number, viewportHeight: number, fovDeg: number, particleScale: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uScale.value = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.dust.visible = particleScale > 0.3;
  }
}
