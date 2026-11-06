// Builds the static level: all boxes/cylinders merged into one mesh per
// material (< 30 draw calls for the whole station).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Box, MapLayout, MatId } from '../world/mapData';
import { boardTexture, clockTexture, concreteTexture, corridorTexture, floorTexture, wallTexture } from './textures';

/** Texture world-space tiling size (metres per repeat). */
const TILE: Partial<Record<MatId, number>> = {
  floor: 4,
  floorCorridor: 3,
  platform: 3,
  wall: 3,
  wallGreen: 3,
  wallLow: 2,
};

function makeMaterials(): Record<Exclude<MatId, 'invisible'>, THREE.Material> {
  const floor = floorTexture();
  const corridor = corridorTexture();
  const concrete = concreteTexture();
  const panel = wallTexture();
  const L = (color: number, opts: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial =>
    new THREE.MeshLambertMaterial({ color, vertexColors: true, ...opts });
  const P = (color: number, shininess: number, opts: THREE.MeshPhongMaterialParameters = {}): THREE.MeshPhongMaterial =>
    new THREE.MeshPhongMaterial({ color, shininess, vertexColors: true, ...opts });
  return {
    floor: P(0xffffff, 40, { map: floor, specular: 0x222018 }),
    floorCorridor: L(0xffffff, { map: corridor }),
    platform: L(0xffffff, { map: concrete }),
    track: L(0x111214),
    wall: L(0x3a3530, { map: panel }),
    wallGreen: L(0x2c4a3d, { map: panel }),
    wallLow: L(0x284034, { map: panel }),
    ceiling: L(0x1d1b19),
    wood: L(0x5a4430),
    woodDark: L(0x3e2818),
    brass: P(0x9a7b45, 60, { specular: 0x705a30, emissive: 0x0d0904 }),
    metal: P(0x40454c, 30, { specular: 0x333333 }),
    stone: L(0x6a655e),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true }),
    lampBlue: new THREE.MeshBasicMaterial({ color: 0xa8ccff, fog: true }),
    glass: L(0x22323c, { emissive: 0x1a2c38 }),
    train: P(0x2c3d52, 50, { specular: 0x333a44 }),
    trainDark: L(0x161a20),
    board: new THREE.MeshBasicMaterial({ map: boardTexture() }),
    clock: new THREE.MeshBasicMaterial({ map: clockTexture() }),
    shop: L(0x4a3a2a, { emissive: 0x3a2610 }),
    yellow: L(0xa88a22),
    plant: L(0x2a4a2e),
    fabric: L(0x4a3030),
  };
}

const tmpColor = new THREE.Color();

function geometryFor(b: Box): THREE.BufferGeometry {
  const w = b.maxX - b.minX, h = b.maxY - b.minY, d = b.maxZ - b.minZ;
  let g: THREE.BufferGeometry;
  if (b.shape === 'cyl') {
    g = new THREE.CylinderGeometry(w / 2, w / 2, h, 14, 1);
  } else {
    g = new THREE.BoxGeometry(w, h, d);
  }
  g.translate((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  if (g.index) g = g.toNonIndexed();

  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const tile = TILE[b.mat];
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (tile) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
      else if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
      else uv.setXY(i, x / tile, y / tile);
    }
    // Cheap baked ambient occlusion: darker near the floor and under the ceiling.
    let ao = 0.62 + 0.38 * Math.min(1, Math.max(0, y) / 2.5);
    if (nrm.getY(i) < -0.5) ao *= 0.7;
    if (b.mat === 'floor' || b.mat === 'floorCorridor' || b.mat === 'platform') ao = 1;
    tmpColor.setScalar(ao);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function buildMapMeshes(layout: MapLayout): THREE.Group {
  const mats = makeMaterials();
  const byMat = new Map<Exclude<MatId, 'invisible'>, THREE.BufferGeometry[]>();
  for (const b of layout.boxes) {
    if (b.mat === 'invisible') continue;
    const list = byMat.get(b.mat) ?? [];
    list.push(geometryFor(b));
    byMat.set(b.mat, list);
  }
  const group = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mats[mat]);
    mesh.name = `map:${mat}`;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }
  return group;
}
