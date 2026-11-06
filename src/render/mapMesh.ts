// Builds the static level. Every authored box/cylinder/sphere is merged into
// one mesh per material *group*: colours live in vertex colours (with baked
// ambient occlusion), so dozens of material ids cost ~13 draw calls in total.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Box, MapLayout, MatId } from '../world/mapData';
import {
  LiveBoard, LiveClock, LiveLed, concreteTexture, corridorTexture, floorTexture, signAtlasTexture, signUV, wallTexture,
  type SignName,
} from './textures';

type Group = 'solid' | 'panel' | 'shiny' | 'paint' | 'glow' | 'floor' | 'floorCorridor' | 'platform' | 'board' | 'clock' | 'signs' | 'led';

/** Material id → render group + base colour (sRGB). */
const MATS: Record<Exclude<MatId, 'invisible'>, [Group, number]> = {
  floor: ['floor', 0xffffff],
  floorCorridor: ['floorCorridor', 0xffffff],
  platform: ['platform', 0xffffff],
  track: ['solid', 0x121315],
  wall: ['panel', 0x4a433b],
  wallGreen: ['panel', 0x2f4d40],
  wallLow: ['panel', 0x2a4436],
  plaster: ['solid', 0x8a8070],
  ceiling: ['solid', 0x221f1c],
  wood: ['solid', 0x5c4330],
  woodDark: ['solid', 0x3a271a],
  brass: ['shiny', 0xb8914c],
  metal: ['shiny', 0x4a5058],
  chrome: ['shiny', 0x9aa1a8],
  stone: ['solid', 0x6e685f],
  lamp: ['glow', 0xffdba6],
  lampBlue: ['glow', 0xb4d0ff],
  bulb: ['glow', 0xfff0d0],
  glass: ['glow', 0x1d2c36],
  glassWarm: ['glow', 0x8a6236],
  window: ['glow', 0x2a3a52],
  train: ['paint', 0x24384f],
  trainBody: ['paint', 0x24384f],
  trainCream: ['paint', 0xc9bb98],
  trainRoof: ['solid', 0x3c4046],
  trainDark: ['solid', 0x15181d],
  rubber: ['solid', 0x0e0e10],
  leather: ['solid', 0x4a2c1c],
  board: ['board', 0xffffff],
  clock: ['clock', 0xffffff],
  signs: ['signs', 0xffffff],
  led: ['led', 0xffffff],
  shop: ['solid', 0x6a5236],
  yellow: ['solid', 0xb08f26],
  plant: ['solid', 0x2c5232],
  fabric: ['solid', 0x523634],
  paper: ['solid', 0xc8c2b0],
};

/** Texture world-space tiling size (metres per repeat). */
const TILE: Partial<Record<MatId, number>> = {
  floor: 4, floorCorridor: 6, platform: 3, wall: 3, wallGreen: 3, wallLow: 2,
};

const tmpColor = new THREE.Color();

function geometryFor(b: Box): THREE.BufferGeometry {
  const w = b.maxX - b.minX, h = b.maxY - b.minY, d = b.maxZ - b.minZ;
  let g: THREE.BufferGeometry;
  if (b.shape === 'cyl') {
    g = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1).scale(w, h, d);
  } else if (b.shape === 'cylX') {
    g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1).rotateZ(Math.PI / 2).scale(w, h, d);
  } else if (b.shape === 'cylZ') {
    g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1).rotateX(Math.PI / 2).scale(w, h, d);
  } else if (b.shape === 'sph') {
    g = new THREE.SphereGeometry(0.5, 12, 8).scale(w, h, d);
  } else {
    g = new THREE.BoxGeometry(w, h, d);
  }
  g.translate((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  if (g.index) g = g.toNonIndexed();

  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const mat = b.mat as Exclude<MatId, 'invisible'>;
  const tile = TILE[mat];
  const sign = b.sign ? signUV(b.sign as SignName) : null;
  const [grp, base] = MATS[mat];
  const baseColor = new THREE.Color().setHex(base);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (tile) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
      else if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
      else uv.setXY(i, x / tile, y / tile);
    } else if (sign) {
      uv.setXY(i, sign[0] + uv.getX(i) * (sign[2] - sign[0]), sign[1] + uv.getY(i) * (sign[3] - sign[1]));
    }
    // Baked ambient occlusion: darker near the floor and on undersides.
    let ao = 0.6 + 0.4 * Math.min(1, Math.max(0, y) / 2.6);
    if (nrm.getY(i) < -0.5) ao *= 0.65;
    if (grp === 'floor' || grp === 'floorCorridor' || grp === 'platform' || grp === 'glow') ao = 1;
    tmpColor.copy(baseColor).multiplyScalar(ao);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export interface MapMaterials {
  mats: Record<Group, THREE.Material>;
  envMaterials: THREE.MeshStandardMaterial[];
  board: LiveBoard;
  clock: LiveClock;
  led: LiveLed;
  /** The polished floor is the most expensive material; swapped on low/medium. */
  floorRich: THREE.MeshStandardMaterial;
  floorCheap: THREE.MeshLambertMaterial;
}

export function createMapMaterials(): MapMaterials {
  const board = new LiveBoard();
  const clock = new LiveClock();
  const led = new LiveLed();
  const floorTex = floorTexture();
  const floorRich = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.38, metalness: 0, envMapIntensity: 0.8 });
  const floorCheap = new THREE.MeshLambertMaterial({ map: floorTex });
  // Rougher metal: glossy thin rings sparkle (specular aliasing) as the view turns.
  const shiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.7, envMapIntensity: 1.0 });
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.25, envMapIntensity: 1.1 });
  const mats: Record<Group, THREE.Material> = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    panel: new THREE.MeshLambertMaterial({ vertexColors: true, map: wallTexture() }),
    shiny,
    paint,
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    floor: floorRich,
    floorCorridor: new THREE.MeshLambertMaterial({ map: corridorTexture() }),
    platform: new THREE.MeshLambertMaterial({ map: concreteTexture() }),
    board: new THREE.MeshBasicMaterial({ map: board.texture }),
    clock: new THREE.MeshBasicMaterial({ map: clock.texture }),
    signs: new THREE.MeshBasicMaterial({ map: signAtlasTexture() }),
    led: new THREE.MeshBasicMaterial({ map: led.texture }),
  };
  return { mats, envMaterials: [floorRich, shiny, paint], board, clock, led, floorRich, floorCheap };
}

/** Merge boxes into one mesh per material group. */
export function mergeBoxes(boxes: readonly Box[], mats: Record<Group, THREE.Material>, name: string): THREE.Group {
  const byGroup = new Map<Group, THREE.BufferGeometry[]>();
  for (const b of boxes) {
    if (b.mat === 'invisible') continue;
    const grp = MATS[b.mat][0];
    const list = byGroup.get(grp) ?? [];
    list.push(geometryFor(b));
    byGroup.set(grp, list);
  }
  const group = new THREE.Group();
  for (const [grp, geos] of byGroup) {
    const merged = mergeGeometries(geos, false);
    if (!merged) {
      console.warn(`[map] could not merge group ${grp}`);
      continue;
    }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mats[grp]);
    mesh.name = `${name}:${grp}`;
    mesh.userData.group = grp;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }
  return group;
}

export interface MapVisuals extends MapMaterials {
  group: THREE.Group;
}

export function buildMapMeshes(layout: MapLayout, materials: MapMaterials): MapVisuals {
  const group = mergeBoxes(layout.boxes, materials.mats, 'map');
  group.traverse((o) => {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  return { ...materials, group };
}

/**
 * A tiny procedural "station" environment for reflections: dark walls,
 * warm lamp strips overhead and a cool glow from the platform end.
 */
export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15130f);
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 40), new THREE.MeshBasicMaterial({ color: 0x1c1813, side: THREE.BackSide }));
  room.position.y = 6;
  scene.add(room);
  const strip = (x: number, y: number, z: number, w: number, d: number, color: number): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
  };
  for (let x = -15; x <= 15; x += 10) strip(x, 13.5, 0, 4, 18, 0xf2d7aa);
  for (const [x, z] of [[-8, -6], [6, 6], [-4, 8], [10, -8]]) strip(x, 8, z, 1.4, 1.4, 0xffc27a);
  const blue = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ color: 0x5c7fb8 }));
  blue.rotation.y = -Math.PI / 2;
  blue.position.set(19.5, 5, 0);
  scene.add(blue);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  return env;
}
