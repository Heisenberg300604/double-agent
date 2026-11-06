// "Grand Station" — the whole level authored as plain data. Shared by the
// collision world, the nav graph and the render mesh builder.
//
// Axes: X runs west (-62, waiting room) → east (+94, end of the trainshed). Z runs south (-27) → north (+27).
// Y is up. The base floor is y = 0 everywhere.

import type { Vec3 } from '../core/vec';

export type MatId =
  | 'floor'
  | 'floorCorridor'
  | 'platform'
  | 'track'
  | 'wall'
  | 'wallGreen'
  | 'wallLow'
  | 'ceiling'
  | 'wood'
  | 'woodDark'
  | 'brass'
  | 'metal'
  | 'stone'
  | 'lamp'
  | 'lampBlue'
  | 'glass'
  | 'train'
  | 'trainDark'
  | 'board'
  | 'clock'
  | 'shop'
  | 'yellow'
  | 'plant'
  | 'fabric'
  | 'plaster'
  | 'chrome'
  | 'bulb'
  | 'glassWarm'
  | 'window'
  | 'trainBody'
  | 'trainCream'
  | 'trainRoof'
  | 'rubber'
  | 'leather'
  | 'paper'
  | 'signs'
  | 'led'
  /** Collision only, never rendered. */
  | 'invisible';

export type Shape = 'box' | 'cyl' | 'cylX' | 'cylZ' | 'sph';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  mat: MatId;
  /** Solid for movement and raycasts. Render-only decor sets this false. */
  collide: boolean;
  shape: Shape;
  /** Sign name for the 'signs' atlas material. */
  sign?: string;
  /** Blocks movement only; bullets and sight pass through (track-bed guards). */
  rayIgnore?: boolean;
}

/** Render-only atmosphere hints (lamp halos, light pools on the floor). */
export interface Glow { x: number; y: number; z: number; size: number; color: number }
export interface LightPool { x: number; y: number; z: number; radius: number; color: number; strength: number }

/** A terminus track: trains arrive from the east, stop at the buffers, then leave. */
export interface Track {
  /** Platform numbers either side (for announcements). */
  platforms: [number, number];
  z0: number;
  z1: number;
  /** x of the train's front (west end) when stopped at the buffers. */
  stopX: number;
  /** Rail level (track bed top). */
  railY: number;
}

export interface Ramp {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: 'x' | 'z';
  /** Surface height at the min end and max end of the axis. */
  y0: number;
  y1: number;
}

export type PoiKind = 'kiosk' | 'bench' | 'cafe' | 'board' | 'platform' | 'shop' | 'chat' | 'rail' | 'news' | 'clock' | 'locker';

export interface Poi {
  id: number;
  kind: PoiKind;
  /** Where the agent stands (or stands up to). */
  x: number;
  y: number;
  z: number;
  /** Facing while idle. */
  yaw: number;
  /** Seat position for sitting POIs. */
  seat: Vec3 | null;
  /** Chat groups share a group id. */
  group: number;
}

export interface NavRegion {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  spacing: number;
}

export interface LightDef {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}

export interface MapLayout {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  boxes: Box[];
  ramps: Ramp[];
  pois: Poi[];
  spawns: Vec3[];
  navRegions: NavRegion[];
  /** Extra hand-placed nav nodes (stairs, doorways). */
  navExtra: Vec3[];
  lights: LightDef[];
  glows: Glow[];
  pools: LightPool[];
  tracks: Track[];
  /** Named spots used by tests and the attract camera. */
  landmarks: Record<string, Vec3>;
}

/** Yaw that faces along world direction (dx, dz). Matches core/vec yaw convention. */
function faceYaw(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

// ------------------------------------------------------------------ key dimensions
/** West wing (waiting room + restaurant). */
const WING_X0 = -62;
/** Concourse spans HALL_X0..HALL_X1 and ±HALL_Z (inner walls sit at ±HALL_Z..±(HALL_Z+1)). */
const HALL_X0 = -44;
const HALL_X1 = 23.5;
const HALL_Z = 15;
/** Corridors run z = ±(HALL_Z+1) .. ±OUTER_Z. */
const OUTER_Z = 27;
/** Platforms run from the hall's east wall to the trainshed end. */
const PLAT_X0 = 24.5;
const PLAT_X1 = 94;
const BAL_Y = 5;
const TRACK_Z: [number, number][] = [[11.2, 14.8], [-14.8, -11.2]];
const RAIL_Y = -1.05;
/** Where a stopped train's front (west end) sits — just short of the buffers. */
export const TRAIN_STOP_X = 26.6;

export function buildGrandStation(): MapLayout {
  const boxes: Box[] = [];
  const ramps: Ramp[] = [];
  const pois: Poi[] = [];
  const glows: Glow[] = [];
  const pools: LightPool[] = [];
  let chatGroup = 1;

  const box = (
    x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
    mat: MatId, collide = true, shape: Shape = 'box',
  ): Box => {
    const b: Box = {
      minX: Math.min(x0, x1), maxX: Math.max(x0, x1),
      minY: Math.min(y0, y1), maxY: Math.max(y0, y1),
      minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1),
      mat, collide, shape,
    };
    boxes.push(b);
    return b;
  };
  const cyl = (x: number, z: number, r: number, y0: number, y1: number, mat: MatId, collide = true): void => {
    box(x - r, x + r, y0, y1, z - r, z + r, mat, collide, 'cyl');
  };
  const sph = (x: number, y: number, z: number, r: number, mat: MatId): void => {
    box(x - r, x + r, y - r, y + r, z - r, z + r, mat, false, 'sph');
  };
  const sign = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, name: string): void => {
    box(x0, x1, y0, y1, z0, z1, 'signs', false).sign = name;
  };
  const poi = (kind: PoiKind, x: number, z: number, yaw: number, y = 0, seat: Vec3 | null = null, group = 0): void => {
    pois.push({ id: pois.length, kind, x, y, z, yaw, seat, group });
  };
  const chat = (cx: number, cz: number, y = 0): void => {
    const g = chatGroup++;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const x = cx + Math.cos(a) * 0.8, z = cz + Math.sin(a) * 0.8;
      poi('chat', x, z, faceYaw(cx - x, cz - z), y, null, g);
    }
  };
  /** Potted plant (collides as a small cylinder). */
  const plant = (x: number, z: number, big = false): void => {
    const r = big ? 0.42 : 0.32;
    const top = big ? 0.8 : 0.65;
    cyl(x, z, r, 0, top - 0.05, 'stone');
    cyl(x, z, r + 0.04, top - 0.1, top, 'brass', false);
    sph(x, top + 0.45, z, big ? 0.62 : 0.45, 'plant');
    sph(x + 0.18, top + 0.85, z - 0.1, big ? 0.45 : 0.32, 'plant');
    sph(x - 0.2, top + 0.7, z + 0.15, big ? 0.42 : 0.3, 'plant');
    if (big) sph(x, top + 1.25, z, 0.35, 'plant');
  };
  /** Bench with three seats along X; `facing` is the direction (+z/-z) sitters look. */
  const bench = (cx: number, cz: number, facing: 1 | -1, seats = 3): void => {
    const back = cz - facing * 0.28;
    box(cx - 1.2, cx + 1.2, 0, 0.46, cz - 0.28, cz + 0.28, 'wood');
    box(cx - 1.2, cx + 1.2, 0.46, 1.0, back - 0.06, back + 0.06, 'wood');
    box(cx - 1.25, cx - 1.15, 0, 0.7, cz - 0.3, cz + 0.3, 'metal', false);
    box(cx + 1.15, cx + 1.25, 0, 0.7, cz - 0.3, cz + 0.3, 'metal', false);
    box(cx - 1.27, cx - 1.13, 0.66, 0.72, cz - 0.32, cz + 0.32, 'brass', false);
    box(cx + 1.13, cx + 1.27, 0.66, 0.72, cz - 0.32, cz + 0.32, 'brass', false);
    for (const bx of [-0.95, 0, 0.95]) box(cx + bx - 0.05, cx + bx + 0.05, 0.46, 1.0, back - 0.075, back + 0.075, 'woodDark', false);
    const offs = seats === 3 ? [-0.75, 0, 0.75] : [-0.6, 0.6];
    for (const dx of offs) poi('bench', cx + dx, cz + facing * 0.9, faceYaw(0, facing), 0, { x: cx + dx, y: 0, z: cz + facing * 0.05 });
  };
  /** Café table with two chairs either side along X. */
  const table = (tx: number, tz: number, hanging = true): void => {
    cyl(tx, tz, 0.45, 0, 0.76, 'woodDark');
    cyl(tx, tz, 0.47, 0.74, 0.77, 'paper', false);
    if (hanging) {
      box(tx - 0.012, tx + 0.012, 2.4, 9, tz - 0.012, tz + 0.012, 'metal', false);
      cyl(tx, tz, 0.22, 2.25, 2.42, 'brass', false);
      sph(tx, 2.2, tz, 0.13, 'bulb');
      glows.push({ x: tx, y: 2.2, z: tz, size: 1.8, color: 0xffc888 });
    }
    pools.push({ x: tx, y: 0, z: tz, radius: 1.5, color: 0xffb060, strength: 0.4 });
    for (const side of [-1, 1]) {
      const chx = tx + side * 0.95;
      box(chx - 0.22, chx + 0.22, 0, 0.45, tz - 0.22, tz + 0.22, 'fabric');
      box(chx + side * 0.18 - 0.04, chx + side * 0.18 + 0.04, 0.45, 0.95, tz - 0.22, tz + 0.22, 'fabric', false);
      poi('cafe', tx + side * 1.45, tz, faceYaw(-side, 0), 0, { x: chx, y: 0, z: tz });
    }
  };
  /** Chandelier with a pool of light underneath. */
  const chandelier = (x: number, z: number, ceil = 14): void => {
    box(x - 0.03, x + 0.03, 9.2, ceil, z - 0.03, z + 0.03, 'metal', false);
    cyl(x, z, 1.25, 8.55, 8.65, 'brass', false);
    cyl(x, z, 0.35, 8.65, 9.25, 'brass', false);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      sph(x + Math.cos(a) * 1.1, 8.4, z + Math.sin(a) * 1.1, 0.2, 'bulb');
    }
    sph(x, 8.25, z, 0.3, 'bulb');
    glows.push({ x, y: 8.4, z, size: 6, color: 0xffcf8a });
    pools.push({ x, y: 0, z, radius: 6, color: 0xffbb70, strength: 0.3 });
  };
  const column = (x: number, z: number, h = 14): void => {
    cyl(x, z, 0.6, 0, h, 'stone');
    box(x - 0.78, x + 0.78, 0, 0.45, z - 0.78, z + 0.78, 'plaster', false);
    cyl(x, z, 0.7, 0.45, 0.6, 'brass', false);
    cyl(x, z, 0.64, 3.0, 3.15, 'brass', false);
    cyl(x, z, 0.64, 7.0, 7.15, 'brass', false);
    cyl(x, z, 0.72, h - 1.8, h - 1.5, 'plaster', false);
    cyl(x, z, 0.85, h - 1.5, h - 1.25, 'brass', false);
    box(x - 1, x + 1, h - 1.25, h - 0.7, z - 1, z + 1, 'plaster', false);
    for (const s of [-1, 1]) {
      box(x + s * 0.6, x + s * 0.95, 4.6, 4.66, z - 0.04, z + 0.04, 'brass', false);
      sph(x + s * 0.95, 4.82, z, 0.17, 'bulb');
      glows.push({ x: x + s * 0.95, y: 4.82, z, size: 1.6, color: 0xffd08a });
    }
    pools.push({ x, y: 0, z, radius: 3.2, color: 0xffc070, strength: 0.3 });
  };
  /** Wall between the hall and a corridor with arches (z = face plane range). */
  const wallWithArches = (x0: number, x1: number, zMin: number, zMax: number, arches: [number, number][], mat: MatId = 'wallGreen'): void => {
    let x = x0;
    for (const [a0, a1] of arches) {
      box(x, a0, 0, 14, zMin, zMax, mat);
      box(a0, a1, 3.6, 14, zMin, zMax, mat);
      box(a0 - 0.15, a0, 0, 3.6, zMin - 0.1, zMax + 0.1, 'brass', false);
      box(a1, a1 + 0.15, 0, 3.6, zMin - 0.1, zMax + 0.1, 'brass', false);
      box(a0 - 0.15, a1 + 0.15, 3.6, 3.8, zMin - 0.1, zMax + 0.1, 'brass', false);
      x = a1;
    }
    box(x, x1, 0, 14, zMin, zMax, mat);
    box(x0, x1, 1.1, 1.2, zMin - 0.05, zMax + 0.05, 'woodDark', false);
  };
  /** Arched clerestory window on a wall face at z = zf, protruding d toward the room. */
  const clerestory = (x: number, zf: number, d: number, y0: number, y1: number): void => {
    const zw = zf + d * 0.25;
    box(x - 1.5, x + 1.5, y0, y1, zw - 0.02, zw + 0.02, 'window', false);
    for (let k = 1; k <= 3; k++) {
      const hw = 1.5 * Math.sqrt(1 - (k / 4) ** 2);
      box(x - hw, x + hw, y1 + (k - 1) * 0.3, y1 + k * 0.3, zw - 0.02, zw + 0.02, 'window', false);
    }
    box(x - 0.04, x + 0.04, y0, y1 + 0.9, zw - 0.05, zw + 0.05, 'woodDark', false);
    for (let yy = y0 + 1.3; yy < y1; yy += 1.3) box(x - 1.5, x + 1.5, yy - 0.04, yy + 0.04, zw - 0.05, zw + 0.05, 'woodDark', false);
    box(x - 1.65, x + 1.65, y0 - 0.15, y0, zf, zf + d * 1.5, 'plaster', false);
  };
  /** A big window with a fan top on a wall facing ±x. */
  const fanWindow = (xw: number, dir: 1 | -1, z0: number, z1: number, y0: number, y1: number): void => {
    const half = (z1 - z0) / 2, zc = (z0 + z1) / 2;
    box(xw - 0.02, xw + 0.03, y0, y1, z0, z1, 'window', false);
    for (let k = 1; k <= 6; k++) {
      const hw = half * Math.sqrt(1 - (k / 7) ** 2);
      box(xw - 0.02, xw + 0.03, y1 + (k - 1) * 0.3, y1 + k * 0.3, zc - hw, zc + hw, 'window', false);
    }
    for (let z = z0; z <= z1 + 0.01; z += 1.5) box(xw, xw + dir * 0.1, y0, y1 + 1.8, z - 0.05, z + 0.05, 'woodDark', false);
    for (let y = y0; y <= y1; y += 1.3) box(xw, xw + dir * 0.1, y - 0.05, y + 0.05, z0, z1, 'woodDark', false);
    box(xw, xw + dir * 0.5, y0 - 0.3, y0, z0 - 0.5, z1 + 0.5, 'plaster', false);
  };
  /** Sconce on a wall at z = zf, pointing toward the room (s = ±1). */
  const sconce = (x: number, zf: number, s: number, y = 3.3): void => {
    box(x - 0.08, x + 0.08, y - 0.2, y, zf, zf + s * 0.25, 'brass', false);
    sph(x, y + 0.15, zf + s * 0.3, 0.16, 'bulb');
    glows.push({ x, y: y + 0.15, z: zf + s * 0.3, size: 1.8, color: 0xffcc88 });
  };

  // ================================================================ floors, shell, ceilings
  box(WING_X0, HALL_X0, -0.3, 0, -HALL_Z, HALL_Z, 'floorCorridor', false);
  box(HALL_X0, PLAT_X0, -0.3, 0, -HALL_Z, HALL_Z, 'floor', false);
  box(WING_X0, PLAT_X0, -0.3, 0, HALL_Z, OUTER_Z, 'floorCorridor', false);
  box(WING_X0, PLAT_X0, -0.3, 0, -OUTER_Z, -HALL_Z, 'floorCorridor', false);
  // Platforms (y = 0) with coping, and lowered track beds with rails and sleepers.
  box(PLAT_X0, PLAT_X1, -0.3, 0, 14.8, OUTER_Z, 'platform', false);
  box(PLAT_X0, PLAT_X1, -0.3, 0, -11.2, 11.2, 'platform', false);
  box(PLAT_X0, PLAT_X1, -0.3, 0, -OUTER_Z, -14.8, 'platform', false);
  const tracks: Track[] = [];
  TRACK_Z.forEach(([z0, z1], ti) => {
    const zc = (z0 + z1) / 2;
    tracks.push({ platforms: ti === 0 ? [1, 2] : [2, 3], z0, z1, stopX: TRAIN_STOP_X, railY: RAIL_Y });
    // Track bed extends out of the trainshed into the night.
    box(PLAT_X0, 200, RAIL_Y - 0.4, RAIL_Y - 0.15, z0, z1, 'track', false);
    for (let x = PLAT_X0 + 0.6; x < 200; x += 0.9) box(x, x + 0.25, RAIL_Y - 0.17, RAIL_Y - 0.08, z0 + 0.25, z1 - 0.25, 'woodDark', false);
    for (const rz of [zc - 0.72, zc + 0.72]) box(PLAT_X0, 200, RAIL_Y - 0.08, RAIL_Y + 0.02, rz - 0.04, rz + 0.04, 'chrome', false);
    // Platform faces down to the bed + coping and safety line.
    for (const [ze, inward] of [[z0, -1], [z1, 1]] as [number, number][]) {
      box(PLAT_X0, PLAT_X1, RAIL_Y - 0.4, -0.02, ze - 0.02 * inward, ze, 'plaster', false);
      box(PLAT_X0, PLAT_X1, -0.02, 0.015, ze, ze + 0.45 * inward, 'plaster', false);
      box(PLAT_X0, PLAT_X1, 0, 0.02, ze + 0.55 * inward, ze + 0.75 * inward, 'yellow', false);
    }
    // Movement-only guard over the bed: people can't step onto the tracks, but sight lines and bullets cross freely.
    box(PLAT_X0 - 0.2, PLAT_X1 + 2, -1.5, 1.6, z0, z1, 'invisible').rayIgnore = true;
    // Buffer stop.
    box(PLAT_X0, PLAT_X0 + 1.1, RAIL_Y, 1.2, z0 + 0.1, z1 - 0.1, 'metal');
    box(PLAT_X0 + 0.05, PLAT_X0 + 0.15, 0.5, 0.9, z0 + 0.3, z1 - 0.3, 'yellow', false);
    for (const bz of [z0 + 0.6, z1 - 0.6]) box(PLAT_X0 + 1.1, PLAT_X0 + 1.4, 0.55, 0.85, bz - 0.15, bz + 0.15, 'chrome', false, 'cylX');
    sph(PLAT_X0 + 0.5, 1.4, zc, 0.12, 'bulb');
    glows.push({ x: PLAT_X0 + 0.5, y: 1.4, z: zc, size: 1.4, color: 0xffd0a0 });
  });

  // Outer walls.
  box(WING_X0 - 1, PLAT_X1 + 1, 0, 14, OUTER_Z, OUTER_Z + 1, 'wall');
  box(WING_X0 - 1, PLAT_X1 + 1, 0, 14, -OUTER_Z - 1, -OUTER_Z, 'wall');
  box(WING_X0 - 1, WING_X0, 0, 14, -OUTER_Z - 1, OUTER_Z + 1, 'wall');
  // Trainshed end: walls beside the tracks, open over them, glazed above.
  for (const [z0, z1] of [[14.8, OUTER_Z], [-11.2, 11.2], [-OUTER_Z, -14.8]] as [number, number][]) box(PLAT_X1, PLAT_X1 + 1, 0, 6, z0, z1, 'wall');
  box(PLAT_X1, PLAT_X1 + 1, 6, 9.6, -OUTER_Z, OUTER_Z, 'woodDark', false);
  for (const [z0, z1] of [[14.8, OUTER_Z], [-11.2, 11.2], [-OUTER_Z, -14.8]] as [number, number][]) box(PLAT_X1 - 0.02, PLAT_X1, 1.2, 5.8, z0 + 0.4, z1 - 0.4, 'window', false);
  for (const [z0, z1] of TRACK_Z) {
    // Portal arch over each track mouth.
    box(PLAT_X1 - 0.2, PLAT_X1 + 1.2, 5.4, 6.2, z0 - 0.4, z1 + 0.4, 'stone', false);
    box(PLAT_X1 + 1, PLAT_X1 + 1.2, -1.5, 5.4, z0 - 0.6, z0 - 0.4, 'stone', false);
    box(PLAT_X1 + 1, PLAT_X1 + 1.2, -1.5, 5.4, z1 + 0.4, z1 + 0.6, 'stone', false);
    // Signal on a post just beyond the platform.
    box(PLAT_X1 + 3, PLAT_X1 + 3.12, RAIL_Y, 4.2, z0 - 1.2, z0 - 1.08, 'metal', false);
    box(PLAT_X1 + 2.85, PLAT_X1 + 3.27, 3.3, 4.3, z0 - 1.3, z0 - 0.98, 'trainDark', false);
    sph(PLAT_X1 + 2.82, 4.0, z0 - 1.14, 0.09, 'lampBlue');
  }

  // Ceilings.
  box(WING_X0, HALL_X0, 10, 10.4, -HALL_Z, HALL_Z, 'ceiling', false);
  box(HALL_X0, HALL_X1, 14, 14.4, -HALL_Z, HALL_Z, 'ceiling', false);
  box(WING_X0, PLAT_X0, 5.2, 5.5, HALL_Z + 1, OUTER_Z, 'ceiling', false);
  box(WING_X0, PLAT_X0, 5.2, 5.5, -OUTER_Z, -HALL_Z - 1, 'ceiling', false);
  box(PLAT_X0, PLAT_X1, 9, 9.3, -OUTER_Z, OUTER_Z, 'ceiling', false);

  // ================================================================ concourse architecture
  // Coffered ceiling with skylights.
  for (const x of [-36, -22, -8, 6, 18]) box(x - 3.5, x + 3.5, 13.95, 14, -9.5, 9.5, 'window', false);
  for (let x = HALL_X0 + 2.5; x < HALL_X1; x += 5.6) box(x - 0.22, x + 0.22, 13.25, 14, -HALL_Z, HALL_Z, 'woodDark', false);
  for (const z of [-12.5, -6.25, 0, 6.25, 12.5]) box(HALL_X0, HALL_X1, 13.35, 14, z - 0.2, z + 0.2, 'woodDark', false);
  // Cornices and string course.
  for (const [z0, z1] of [[HALL_Z - 0.4, HALL_Z], [-HALL_Z, -HALL_Z + 0.4]] as [number, number][]) {
    box(HALL_X0, HALL_X1, 12.7, 13.2, z0, z1, 'plaster', false);
    box(HALL_X0, HALL_X1, 6.9, 7.15, z0 > 0 ? z0 + 0.15 : z0, z0 > 0 ? z1 : z1 - 0.15, 'plaster', false);
  }
  box(HALL_X1 - 0.4, HALL_X1, 12.7, 13.2, -HALL_Z, HALL_Z, 'plaster', false);
  // Inner walls with arches (hall + wing share them).
  const northArches: [number, number][] = [[-52, -48], [-42, -38], [-22, -18], [-6, -2]];
  const southArches: [number, number][] = [[-52, -48], [-31, -27], [-12, -8], [4, 8], [16, 20]];
  wallWithArches(WING_X0, PLAT_X0 - 0.5, HALL_Z, HALL_Z + 1, northArches);
  wallWithArches(WING_X0, PLAT_X0 - 0.5, -HALL_Z - 1, -HALL_Z, southArches);
  // Pilasters and clerestories along the hall walls.
  for (const [side, arches] of [['n', northArches], ['s', southArches]] as ['n' | 's', [number, number][]][]) {
    const zf = side === 'n' ? HALL_Z : -HALL_Z, d = side === 'n' ? -0.14 : 0.14;
    for (let x = HALL_X0 + 2.8; x < HALL_X1 - 1; x += 5.6) {
      if (arches.some(([a, b]) => x > a - 0.6 && x < b + 0.6)) continue;
      box(x - 0.35, x + 0.35, 0, 12.7, zf + d, zf, 'plaster', false);
      box(x - 0.5, x + 0.5, 12.4, 12.7, zf + d * 1.8, zf, 'plaster', false);
    }
    for (let x = HALL_X0 + 5.6; x < HALL_X1 - 2; x += 5.6) clerestory(x, zf, d, 7.6, 11.4);
  }
  // Arch signage.
  sign(-41.6, -38.4, 3.95, 4.45, HALL_Z - 0.14, HALL_Z - 0.06, 'WAY OUT');
  sign(-30.6, -27.4, 3.95, 4.45, -HALL_Z + 0.06, -HALL_Z + 0.14, 'LEFT LUGGAGE');
  sign(-11.6, -8.4, 3.95, 4.45, -HALL_Z + 0.06, -HALL_Z + 0.14, 'WAY OUT');
  sign(4.4, 7.6, 3.95, 4.45, -HALL_Z + 0.06, -HALL_Z + 0.14, 'TELEGRAMS');
  sign(16.4, 19.6, 3.95, 4.45, -HALL_Z + 0.06, -HALL_Z + 0.14, 'RESTROOMS');

  // East hall wall: two gates to the island platform, the departure board, a wall clock.
  const EW0 = HALL_X1, EW1 = PLAT_X0;
  box(EW0, EW1, 0, 14, -HALL_Z, -10, 'wallGreen');
  box(EW0, EW1, 0, 14, -4, 4, 'wallGreen');
  box(EW0, EW1, 0, 14, 10, HALL_Z, 'wallGreen');
  for (const [z0, z1] of [[-10, -4], [4, 10]] as [number, number][]) {
    box(EW0, EW1, 4, 14, z0, z1, 'wallGreen');
    box(EW0 - 0.15, EW1 + 0.15, 3.8, 4, z0, z1, 'brass', false);
    box(EW0 - 0.15, EW1 + 0.15, 0, 4, z0 - 0.15, z0, 'brass', false);
    box(EW0 - 0.15, EW1 + 0.15, 0, 4, z1, z1 + 0.15, 'brass', false);
    const zc = (z0 + z1) / 2;
    sign(EW0 - 0.12, EW0 - 0.06, 4.25, 4.85, zc - 2, zc + 2, 'PLATFORMS  →');
    box(EW1 + 0.06, EW1 + 0.12, 4.2, 4.9, zc - 2, zc + 2, 'led', false);
  }
  box(EW0 - 0.35, EW0, 3, 6.2, -3.6, 3.6, 'board');
  box(EW0 - 0.4, EW0, 2.85, 3, -3.75, 3.75, 'brass', false);
  box(EW0 - 0.4, EW0, 6.2, 6.35, -3.75, 3.75, 'brass', false);
  box(EW0 - 0.45, EW0 - 0.35, 2.9, 6.3, -3.75, -3.6, 'brass', false);
  box(EW0 - 0.45, EW0 - 0.35, 2.9, 6.3, 3.6, 3.75, 'brass', false);
  sign(EW0 - 0.2, EW0 - 0.08, 6.7, 7.6, -4.2, 4.2, 'GRAND STATION');
  // Wall clock: brass frame sits *behind* the face (the face is nearer the room).
  box(EW0 - 0.12, EW0, 9.05, 12.05, -1.5, 1.5, 'brass', false);
  box(EW0 - 0.3, EW0 - 0.1, 9.2, 11.9, -1.35, 1.35, 'clock', false);
  glows.push({ x: EW0 - 0.5, y: 4.6, z: 0, size: 6, color: 0xffcf80 });
  for (let z = -1.6; z <= 1.6; z += 1.6) poi('board', EW0 - 3.9, z, faceYaw(1, 0));

  // ================================================================ balcony + stairs
  const BX0 = -26, BX1 = 10, BZ0 = 10;
  box(BX0, BX1, 4.6, BAL_Y, BZ0, HALL_Z, 'floorCorridor');
  const railing = (x0: number, x1: number, z0: number, z1: number): void => {
    box(x0, x1, BAL_Y, BAL_Y + 1.05, z0, z1, 'invisible');
    box(x0, x1, BAL_Y + 0.98, BAL_Y + 1.08, z0 - 0.03, z1 + 0.03, 'brass', false);
    box(x0, x1, BAL_Y + 0.12, BAL_Y + 0.18, z0, z1, 'brass', false);
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    const n = Math.max(2, Math.round(len / 0.45));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (alongX) {
        const x = x0 + (x1 - x0) * t;
        box(x - 0.025, x + 0.025, BAL_Y, BAL_Y + 1, z0 + 0.06, z1 - 0.06, 'brass', false);
      } else {
        const z = z0 + (z1 - z0) * t;
        box(x0 + 0.06, x1 - 0.06, BAL_Y, BAL_Y + 1, z - 0.025, z + 0.025, 'brass', false);
      }
    }
  };
  railing(BX0, BX1, BZ0 - 0.2, BZ0 + 0.05);
  railing(BX0 - 0.25, BX0, BZ0 - 0.2, 11.5);
  railing(BX1, BX1 + 0.25, BZ0 - 0.2, 11.5);
  box(BX0, BX1, 4.4, 4.6, BZ0 - 0.2, BZ0 + 0.1, 'woodDark', false);
  for (const x of [-20, -12, -4, 4]) cyl(x, BZ0 + 0.5, 0.35, 0, 4.6, 'brass');
  for (let x = BX0 + 2; x <= BX1 - 2; x += 6) poi('rail', x, BZ0 + 0.7, faceYaw(0, -1), BAL_Y);
  chat(-8, 13, BAL_Y);
  chat(4, 13, BAL_Y);
  // Stairs: ramps with stepped solid boxes underneath so the sides block.
  const SZ0 = 11.5, SZ1 = HALL_Z - 0.1;
  const stair = (xBottom: number, xTop: number): void => {
    const minX = Math.min(xBottom, xTop), maxX = Math.max(xBottom, xTop);
    const up = xTop > xBottom;
    ramps.push({ minX, maxX, minZ: SZ0, maxZ: SZ1, axis: 'x', y0: up ? 0 : BAL_Y, y1: up ? BAL_Y : 0 });
    const steps = 14, len = maxX - minX;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const sx0 = minX + len * t0, sx1 = minX + len * t1;
      const top = up ? BAL_Y * t0 : BAL_Y * (1 - t1);
      if (top > 0.05) box(sx0, sx1, 0, top, SZ0, SZ1, 'stone');
      const vis = up ? BAL_Y * t1 : BAL_Y * (1 - t0);
      box(sx0, sx1, Math.max(0, vis - 0.36), vis, SZ0, SZ1, 'woodDark', false);
      box(sx0, sx1, 0, (up ? BAL_Y * t1 : BAL_Y * (1 - t0)) + 1, SZ0 - 0.2, SZ0, 'woodDark');
    }
  };
  stair(-36, BX0);
  stair(BX1 + 10, BX1);

  // ================================================================ concourse props
  for (const x of [-28, -16, -4, 8, 18]) column(x, -10.5);
  for (const x of [-38, 16]) column(x, 8.4);

  // The great clock.
  const CX = -10;
  box(CX - 1.3, CX + 1.3, 0, 0.9, -1.3, 1.3, 'stone');
  cyl(CX, 0, 0.45, 0.9, 4.4, 'brass');
  box(CX - 1.1, CX + 1.1, 4.4, 6.6, -1.1, 1.1, 'clock');
  box(CX - 1.25, CX + 1.25, 6.6, 6.85, -1.25, 1.25, 'brass', false);
  box(CX - 1.25, CX + 1.25, 4.2, 4.4, -1.25, 1.25, 'brass', false);
  sph(CX, 7.15, 0, 0.35, 'brass');
  cyl(CX, 0, 0.6, 0.9, 1.15, 'brass', false);
  glows.push({ x: CX, y: 5.5, z: 0, size: 4.5, color: 0xfff0c8 });
  cyl(CX, 0, 3.2, -0.02, 0.006, 'brass', false);
  cyl(CX, 0, 3.0, -0.02, 0.008, 'stone', false);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) poi('clock', CX + dx * 2.2, dz * 2.2, faceYaw(-dx, -dz));

  // Benches.
  for (const [bx, bz] of [[-2, -5], [10, -5], [-22, 3.2], [4, 4.4], [-30, 3.2], [16, 2]] as [number, number][]) {
    bench(bx, bz - 0.4, -1);
    bench(bx, bz + 0.4, 1);
  }
  // Ticket hall along the south wall.
  {
    const kz = -HALL_Z;
    box(-25, -15, 0, 3.2, kz, kz + 1.9, 'woodDark');
    box(-25.1, -14.9, 3.2, 3.5, kz, kz + 2.1, 'brass', false);
    for (const x of [-23, -20, -17]) {
      box(x - 0.9, x + 0.9, 1.1, 2.4, kz + 1.88, kz + 1.92, 'glassWarm', false);
      for (let bx = -0.75; bx <= 0.76; bx += 0.25) box(x + bx - 0.012, x + bx + 0.012, 1.1, 2.4, kz + 1.94, kz + 1.97, 'brass', false);
      box(x - 0.95, x + 0.95, 1.05, 1.12, kz + 1.9, kz + 2.2, 'brass', false);
      poi('kiosk', x, kz + 2.8, faceYaw(0, -1));
      pools.push({ x, y: 0, z: kz + 2.7, radius: 1.6, color: 0xffb860, strength: 0.4 });
    }
    box(-25, -15, 2.6, 3.1, kz + 1.9, kz + 2, 'lamp', false);
    sign(-22.5, -17.5, 3.55, 4.25, kz + 2, kz + 2.12, 'TICKETS');
    glows.push({ x: -20, y: 2.85, z: kz + 2.1, size: 5, color: 0xffd9a0 });
  }
  // Florist stall.
  {
    const fz = -HALL_Z;
    box(9.5, 13.5, 0, 1.0, fz, fz + 1.6, 'wood');
    box(9.5, 13.5, 2.6, 2.9, fz, fz + 2.2, 'fabric', false);
    for (let fx = 9.8; fx < 13.3; fx += 0.5) sph(fx + 0.2, 1.2, fz + 1.0, 0.24, 'plant');
    for (let fx = 10; fx < 13.3; fx += 0.7) sph(fx + 0.3, 1.35, fz + 1.2, 0.08, 'bulb');
    sign(10, 13, 3.0, 3.55, fz + 0.05, fz + 0.15, 'FLORIST');
    poi('shop', 11.5, fz + 2.5, faceYaw(0, -1));
  }
  // Newsstand.
  {
    box(-42, -38.5, 0, 2.5, 4.6, 6.6, 'shop');
    box(-42.2, -38.3, 2.5, 2.7, 4.4, 6.8, 'woodDark', false);
    sign(-41.9, -38.6, 2.75, 3.25, 4.55, 4.62, 'NEWS & TOBACCO');
    for (let mx = -41.7; mx < -38.8; mx += 0.42) {
      for (const [y0, mat] of [[1.0, 'paper'], [1.45, 'leather'], [1.9, 'paper']] as [number, MatId][]) box(mx, mx + 0.34, y0, y0 + 0.36, 4.5, 4.58, mat, false);
    }
    glows.push({ x: -40.2, y: 2.6, z: 4.4, size: 3, color: 0xffd9a0 });
    poi('news', -40.2, 3.8, faceYaw(0, 1));
    poi('news', -38.9, 3.9, faceYaw(0, 1));
  }
  // Café corner (SW of the hall).
  {
    box(HALL_X0, HALL_X0 + 1.2, 0, 1.1, -13, -4.5, 'wood');
    box(HALL_X0, HALL_X0 + 0.4, 1.1, 2.6, -13, -4.5, 'shop', false);
    box(HALL_X0, HALL_X0 + 1.4, 2.8, 3.1, -13.2, -4.3, 'brass', false);
    sign(HALL_X0 + 0.45, HALL_X0 + 0.55, 3.3, 3.9, -11, -6.5, 'CAFÉ');
    box(HALL_X0 + 0.1, HALL_X0 + 0.8, 1.1, 1.6, -12.4, -11.6, 'chrome', false);
    box(HALL_X0 + 0.1, HALL_X0 + 0.8, 1.1, 1.35, -9.2, -8.6, 'glassWarm', false);
    poi('cafe', HALL_X0 + 1.9, -7, faceYaw(-1, 0));
    poi('cafe', HALL_X0 + 1.9, -10, faceYaw(-1, 0));
    for (const [tx, tz] of [[-39.5, -11.6], [-39.5, -8.2], [-39.5, -4.8], [-34.5, -10.4], [-34.5, -6.6]] as [number, number][]) table(tx, tz);
    box(-42, -36, 0, 0.75, -2.6, -2.0, 'wallLow');
    for (let px = -41.5; px <= -36.5; px += 1) sph(px, 0.95, -2.3, 0.42, 'plant');
  }
  // Chandeliers, plants and chat spots.
  for (const [x, z] of [[-34, -4], [-22, 2], [-10, -6], [2, 0], [14, -4], [-36, 7]] as [number, number][]) chandelier(x, z);
  plant(HALL_X0 + 1.2, 13.4, true);
  plant(22.3, 9.6, true);
  plant(22.3, -13.6, true);
  plant(-26.6, -13.6);
  plant(-13.4, -13.6);
  for (const [x, z] of [[-18, -4], [-4, 8], [12, 9], [-28, -6], [18, -7], [-42, 0], [0, -11]] as [number, number][]) chat(x, z);

  // ================================================================ west wing: waiting room + restaurant
  {
    const WX = HALL_X0;
    // Dividing wall with three wide openings.
    const openings: [number, number][] = [[-12, -6], [-3, 3], [6, 12]];
    let z = -HALL_Z;
    for (const [o0, o1] of openings) {
      box(WX - 1, WX, 0, 14, z, o0, 'wallGreen');
      box(WX - 1, WX, 4.2, 14, o0, o1, 'wallGreen');
      box(WX - 1.1, WX + 0.1, 4.0, 4.2, o0, o1, 'brass', false);
      z = o1;
    }
    box(WX - 1, WX, 0, 14, z, HALL_Z, 'wallGreen');
    sign(WX + 0.06, WX + 0.12, 4.4, 5.0, -2, 2, 'WAITING ROOM');
    sign(WX - 1.12, WX - 1.06, 4.4, 5.0, -2, 2, 'GRAND STATION');
    // Wing interior.
    fanWindow(WING_X0 + 0.02, 1, -7, 7, 3.5, 8);
    for (const zc of [-10.5, 10.5]) clerestory(WING_X0 + 8, zc > 0 ? HALL_Z : -HALL_Z, zc > 0 ? -0.14 : 0.14, 5.5, 8);
    for (let x = WING_X0 + 2; x < WX - 1; x += 5.5) {
      box(x - 0.3, x + 0.3, 9.4, 10, -HALL_Z, HALL_Z, 'woodDark', false);
    }
    for (const x of [-56.5, -50.5]) box(x - 2, x + 2, 9.95, 10, -9, 9, 'window', false);
    for (const [x, zf, s] of [[-58, HALL_Z, -1], [-52, HALL_Z, -1], [-58, -HALL_Z, 1], [-52, -HALL_Z, 1]] as [number, number, number][]) sconce(x, zf, s, 3.6);
    // Waiting-room bench rows.
    for (const bz of [-9.5, -2]) {
      for (const bx of [-56.5, -50]) {
        bench(bx, bz - 0.4, -1);
        bench(bx, bz + 0.4, 1);
      }
    }
    chandelier(-53, -5.5, 10);
    pools.push({ x: -53, y: 0, z: -5.5, radius: 7, color: 0xffbb70, strength: 0.25 });
    // Left-luggage lockers along the west wall.
    box(WING_X0, WING_X0 + 0.9, 0, 2.4, -14, -9, 'metal');
    for (let lz = -13.9; lz < -9; lz += 0.62) {
      for (const ly of [0.1, 0.9, 1.7]) box(WING_X0 + 0.9, WING_X0 + 0.93, ly, ly + 0.7, lz, lz + 0.56, 'chrome', false);
    }
    sign(WING_X0 + 0.95, WING_X0 + 1.02, 2.6, 3.1, -13, -10, 'LOCKERS');
    poi('locker', WING_X0 + 1.8, -12.5, faceYaw(-1, 0));
    poi('locker', WING_X0 + 1.8, -10.5, faceYaw(-1, 0));
    // Restaurant in the north-west corner.
    box(WING_X0, WING_X0 + 1.2, 0, 1.1, 5, 13.5, 'wood');
    box(WING_X0, WING_X0 + 0.4, 1.1, 2.6, 5, 13.5, 'glassWarm', false);
    sign(WING_X0 + 0.45, WING_X0 + 0.55, 3.0, 3.6, 7, 11.5, 'RESTAURANT');
    poi('cafe', WING_X0 + 1.9, 7.5, faceYaw(-1, 0));
    poi('cafe', WING_X0 + 1.9, 11, faceYaw(-1, 0));
    for (const [tx, tz] of [[-57, 7.5], [-57, 11.5], [-52, 6.5], [-52, 10], [-52, 13.4]] as [number, number][]) table(tx, tz);
    box(-48.6, -48, 0, 0.75, 5, 14, 'wallLow');
    for (let pz = 5.5; pz <= 13.5; pz += 1) sph(-48.3, 0.95, pz, 0.4, 'plant');
    plant(WX - 1.6, -13.6, true);
    plant(WING_X0 + 1.4, 3.6, true);
    chat(-53, 2.5);
    chat(-47.5, -13);
  }

  // ================================================================ corridors & shops
  const shopNames = ['BOOKSELLER', 'FLORIST', 'BAKERY', 'WATCHMAKER', 'CHEMIST', 'TELEGRAMS', 'NEWS & TOBACCO', 'CAFÉ', 'TAILOR', 'SWEETS', 'TOBACCONIST'];
  let shopIdx = 0;
  const shopRow = (zWall: number, s: 1 | -1): void => {
    for (let x = WING_X0 + 2; x + 5.6 <= PLAT_X0 - 1; x += 8.6) {
      const counterZ = zWall + s * 1.9;
      box(x, x + 5.6, 0, 1.0, counterZ - 0.35, counterZ + 0.35, 'wood');
      box(x - 0.05, x + 5.65, 0.98, 1.05, counterZ - 0.4, counterZ + 0.4, 'woodDark', false);
      box(x, x + 5.6, 0, 2.6, zWall, zWall + s * 0.9, 'shop');
      box(x + 0.2, x + 5.4, 0.9, 2.4, zWall + s * 0.9, zWall + s * 0.93, 'glassWarm', false);
      for (const yy of [1.2, 1.7, 2.2]) {
        box(x + 0.2, x + 5.4, yy - 0.03, yy, zWall + s * 0.9, zWall + s * 1.15, 'woodDark', false);
        for (let gx = x + 0.4; gx < x + 5.2; gx += 0.55) {
          const k = Math.round(gx * 3) % 3;
          box(gx, gx + 0.3, yy, yy + 0.22 + ((gx * 7) % 0.15), zWall + s * 0.95, zWall + s * 1.1, (k === 0 ? 'paper' : k === 1 ? 'leather' : 'plant') as MatId, false);
        }
      }
      sign(x + 0.6, x + 5, 3.15, 3.85, zWall + s * 0.06, zWall + s * 0.16, shopNames[shopIdx++ % shopNames.length]);
      for (let k = 0; k < 8; k++) {
        const ax = x - 0.3 + k * 0.775;
        box(ax, ax + 0.775, 2.6, 3.0, zWall, zWall + s * 2.4, k % 2 ? 'woodDark' : 'fabric', false);
      }
      box(x - 0.3, x + 5.9, 2.55, 2.62, zWall + s * 2.3, zWall + s * 2.45, 'brass', false);
      glows.push({ x: x + 2.8, y: 2.0, z: zWall + s * 1.2, size: 4.5, color: 0xffc070 });
      pools.push({ x: x + 2.8, y: 0, z: zWall + s * 2.6, radius: 3.2, color: 0xffb060, strength: 0.35 });
      poi('shop', x + 1.6, counterZ + s * 1.0, faceYaw(0, -s));
      poi('shop', x + 4.0, counterZ + s * 1.0, faceYaw(0, -s));
    }
  };
  shopRow(OUTER_Z, -1);
  shopRow(-OUTER_Z, 1);
  const CZ = (HALL_Z + 1 + OUTER_Z - 3) / 2; // corridor bench line
  for (const x of [-55, -40, -24, -8, 8]) {
    for (const zc of [CZ, -CZ]) {
      box(x - 1.2, x + 1.2, 0, 0.46, zc - 0.28, zc + 0.28, 'wood');
      box(x - 1.2, x + 1.2, 0.46, 1.0, zc - 0.06, zc + 0.06, 'wood');
      for (const dx of [-0.75, 0.75]) {
        poi('bench', x + dx, zc - 0.95, faceYaw(0, -1), 0, { x: x + dx, y: 0, z: zc - 0.18 });
        poi('bench', x + dx, zc + 0.95, faceYaw(0, 1), 0, { x: x + dx, y: 0, z: zc + 0.18 });
      }
    }
  }
  for (let x = WING_X0 + 4; x <= PLAT_X0 - 3; x += 9) {
    for (const [zf, s] of [[HALL_Z + 1, 1], [-HALL_Z - 1, -1]] as [number, number][]) sconce(x, zf, s);
  }
  chat(-32, CZ + 2);
  chat(0, -CZ - 2);
  chat(-48, -CZ - 2);

  // ================================================================ platforms
  // Canopy: columns with lamp brackets, trusses and glazed strips.
  for (let x = 32; x <= PLAT_X1 - 6; x += 12) {
    for (const z of [21, 0, -21]) {
      cyl(x, z, 0.3, 0, 9, 'metal');
      cyl(x, z, 0.42, 0, 0.5, 'metal', false);
      for (const s of [-1, 1]) {
        box(x - 0.04, x + 0.04, 4.6, 4.68, z, z + s * 0.9, 'metal', false);
        sph(x, 4.45, z + s * 0.9, 0.2, 'lampBlue');
        glows.push({ x, y: 4.45, z: z + s * 0.9, size: 2.4, color: 0xb8d0ff });
      }
      pools.push({ x, y: 0, z, radius: 4.5, color: 0x90b0ff, strength: 0.3 });
    }
  }
  for (let x = PLAT_X0 + 1.5; x <= PLAT_X1; x += 4) {
    box(x - 0.12, x + 0.12, 8.55, 9, -OUTER_Z, OUTER_Z, 'metal', false);
    box(x - 0.06, x + 0.06, 7.9, 8.55, -OUTER_Z, OUTER_Z, 'metal', false);
  }
  for (const z of [-21, -6, 6, 21]) box(PLAT_X0, PLAT_X1, 8.94, 9, z - 1.4, z + 1.4, 'window', false);
  // Benches (backs to the wall on the side platforms, back-to-back on the island).
  for (const x of [38, 50, 62, 74, 86]) {
    bench(x, OUTER_Z - 2.4, -1);
    bench(x, -OUTER_Z + 2.4, 1);
  }
  for (const x of [50, 74]) {
    bench(x, -0.4, -1, 2);
    bench(x, 0.4, 1, 2);
  }
  // Waiting shelters on the island (glazed booths with a bench inside view).
  for (const sx of [37, 61]) {
    box(sx, sx + 4.4, 0, 2.6, -2.2, 2.2, 'invisible');
    box(sx, sx + 4.4, 2.6, 2.75, -2.3, 2.3, 'woodDark', false);
    // Framed booth: low wooden kick-panels, slim mullions and an open glazed band (no opaque panes).
    for (const [z0, z1] of [[-2.2, -2.12], [2.12, 2.2]] as [number, number][]) {
      box(sx + 0.05, sx + 4.35, 0, 0.95, z0, z1, 'wood', false);
      box(sx + 0.05, sx + 4.35, 0.95, 1.0, z0 - 0.02, z1 + 0.02, 'brass', false);
      for (let mx = sx + 1.1; mx < sx + 4.3; mx += 1.1) box(mx - 0.025, mx + 0.025, 1.0, 2.6, z0, z1, 'metal', false);
    }
    for (const [x0, x1] of [[sx, sx + 0.08], [sx + 4.32, sx + 4.4]] as [number, number][]) {
      box(x0, x1, 0, 0.95, -2.12, 2.12, 'wood', false);
      box(x0 - 0.02, x1 + 0.02, 0.95, 1.0, -2.12, 2.12, 'brass', false);
    }
    for (const cx of [sx, sx + 4.4]) for (const cz of [-2.2, 2.2]) box(cx - 0.05, cx + 0.05, 0, 2.6, cz - 0.05, cz + 0.05, 'metal', false);
    sign(sx + 1.2, sx + 3.2, 2.78, 3.1, -0.04, 0.04, 'WAITING ROOM');
    box(sx + 0.3, sx + 4.1, 0.4, 0.5, -0.4, 0.4, 'wood', false);
    sph(sx + 2.2, 2.45, 0, 0.15, 'bulb');
    glows.push({ x: sx + 2.2, y: 2.45, z: 0, size: 2, color: 0xffd9a0 });
  }
  // Coffee cart and vending machines.
  box(86, 88.4, 0, 1.15, -1, 1, 'wood');
  box(86, 88.4, 2.2, 2.35, -1.3, 1.3, 'fabric', false);
  for (const [px, pz] of [[86.1, -1.1], [88.3, -1.1], [86.1, 1.1], [88.3, 1.1]] as [number, number][]) box(px - 0.03, px + 0.03, 1.15, 2.2, pz - 0.03, pz + 0.03, 'brass', false);
  box(86.3, 86.8, 1.15, 1.6, -0.3, 0.3, 'chrome', false);
  sph(87.2, 2.0, 0, 0.12, 'bulb');
  glows.push({ x: 87.2, y: 2.0, z: 0, size: 2, color: 0xffc888 });
  poi('cafe', 85.2, 0, faceYaw(1, 0));
  for (const vx of [44, 68]) {
    for (const [z0, z1, s] of [[OUTER_Z - 0.9, OUTER_Z, -1], [-OUTER_Z, -OUTER_Z + 0.9, 1]] as [number, number, number][]) {
      box(vx, vx + 1.1, 0, 1.95, z0, z1, 'trainBody');
      box(vx + 0.1, vx + 0.75, 0.9, 1.75, s < 0 ? z0 - 0.01 : z1, s < 0 ? z0 : z1 + 0.01, 'glassWarm', false);
      glows.push({ x: vx + 0.4, y: 1.3, z: (s < 0 ? z0 : z1) + s * 0.3, size: 1.6, color: 0xffd9a0 });
      poi('shop', vx + 0.55, (s < 0 ? z0 : z1) + s * 0.8, faceYaw(0, -s));
    }
  }
  // Luggage trolleys.
  for (const [lx, lz] of [[90.5, 6], [90.5, -6], [30, 22.5]] as [number, number][]) {
    box(lx - 0.5, lx + 0.5, 0.25, 0.32, lz - 0.85, lz + 0.85, 'metal');
    box(lx - 0.45, lx + 0.45, 0.32, 0.72, lz - 0.7, lz + 0.2, 'leather', false);
    box(lx - 0.38, lx + 0.38, 0.72, 1.0, lz - 0.6, lz + 0.05, 'fabric', false);
    box(lx - 0.5, lx + 0.5, 0.25, 1.35, lz + 0.8, lz + 0.86, 'metal', false);
    for (const wz of [lz - 0.7, lz + 0.7]) box(lx - 0.45, lx + 0.45, 0, 0.22, wz - 0.03, wz + 0.03, 'rubber', false, 'cylX');
  }
  // Hanging platform signs with LED departure displays.
  const hang = (x: number, z: number, name: string): void => {
    for (const dx of [-1.1, 1.1]) box(x + dx - 0.01, x + dx + 0.01, 6.05, 8.6, z - 0.01, z + 0.01, 'metal', false);
    sign(x - 1.4, x + 1.4, 5.5, 6.0, z - 0.04, z + 0.04, name);
    box(x - 1.4, x + 1.4, 4.95, 5.45, z - 0.05, z + 0.05, 'led', false);
    box(x - 1.45, x + 1.45, 4.9, 6.05, z - 0.03, z + 0.03, 'trainDark', false);
  };
  for (const x of [36, 60, 84]) {
    hang(x, 17.5, 'PLATFORM 1');
    hang(x, 8.6, 'PLATFORM 2');
    hang(x, -8.6, 'PLATFORM 2');
    hang(x, -17.5, 'PLATFORM 3');
  }
  // Platform-edge waiting spots facing the tracks.
  for (let x = 30; x <= 90; x += 6) {
    poi('platform', x, 16.2, faceYaw(0, -1));
    poi('platform', x, 9.8, faceYaw(0, 1));
    poi('platform', x, -9.8, faceYaw(0, -1));
    poi('platform', x, -16.2, faceYaw(0, 1));
  }
  for (const [x, z] of [[30, -4], [56, 4], [80, -5], [47.5, 22.5], [70, -22.5], [58, 23], [82, 21.5]] as [number, number][]) chat(x, z);

  // ================================================================ spawns, nav, lights
  const spawns: Vec3[] = [
    { x: -40, y: 0, z: -0.5 }, { x: -24, y: 0, z: -7 }, { x: -6, y: 0, z: -12 }, { x: 8, y: 0, z: -1 },
    { x: 19, y: 0, z: 6 }, { x: -30, y: 0, z: 8 }, { x: -56, y: 0, z: -5.5 }, { x: -50, y: 0, z: 2.5 },
    { x: -58, y: 0, z: -13 }, { x: -44, y: 0, z: 20.5 }, { x: -16, y: 0, z: 20.5 }, { x: 14, y: 0, z: 20.5 },
    { x: -44, y: 0, z: -20.5 }, { x: -16, y: 0, z: -20.5 }, { x: 14, y: 0, z: -20.5 }, { x: 32, y: 0, z: 19.5 },
    { x: 56, y: 0, z: 19.5 }, { x: 80, y: 0, z: 19.5 }, { x: 44, y: 0, z: 6 }, { x: 68, y: 0, z: -6 },
    { x: 32, y: 0, z: -19.5 }, { x: 80, y: 0, z: -19.5 }, { x: -12, y: BAL_Y, z: 12.5 }, { x: 4, y: BAL_Y, z: 12 },
  ];

  const CORR_Z0 = HALL_Z + 1.6, CORR_Z1 = OUTER_Z - 3.6;
  const navRegions: NavRegion[] = [
    { minX: HALL_X0 + 1.4, maxX: HALL_X1 - 1.2, minZ: -HALL_Z + 0.6, maxZ: HALL_Z - 0.4, y: 0, spacing: 3.2 },
    { minX: WING_X0 + 1.4, maxX: HALL_X0 - 2.4, minZ: -HALL_Z + 1.4, maxZ: HALL_Z - 1.4, y: 0, spacing: 3.2 },
    { minX: WING_X0 + 1.4, maxX: PLAT_X0 - 1, minZ: CORR_Z0, maxZ: CORR_Z1, y: 0, spacing: 3 },
    { minX: WING_X0 + 1.4, maxX: PLAT_X0 - 1, minZ: -CORR_Z1, maxZ: -CORR_Z0, y: 0, spacing: 3 },
    { minX: PLAT_X0 + 1.6, maxX: PLAT_X1 - 1.2, minZ: 16.2, maxZ: OUTER_Z - 1.2, y: 0, spacing: 3.4 },
    { minX: PLAT_X0 + 1.6, maxX: PLAT_X1 - 1.2, minZ: -10.2, maxZ: 10.2, y: 0, spacing: 3.4 },
    { minX: PLAT_X0 + 1.6, maxX: PLAT_X1 - 1.2, minZ: -OUTER_Z + 1.2, maxZ: -16.2, y: 0, spacing: 3.4 },
    { minX: BX0 + 0.8, maxX: BX1 - 0.8, minZ: BZ0 + 0.6, maxZ: HALL_Z - 0.6, y: BAL_Y, spacing: 3 },
  ];
  const SZC = (SZ0 + SZ1) / 2;
  const navExtra: Vec3[] = [
    { x: -37.6, y: 0, z: SZC }, { x: -33.5, y: 1.25, z: SZC }, { x: -31, y: 2.5, z: SZC }, { x: -28.5, y: 3.75, z: SZC }, { x: -25.5, y: BAL_Y, z: SZC },
    { x: 21.6, y: 0, z: SZC }, { x: 17.5, y: 1.25, z: SZC }, { x: 15, y: 2.5, z: SZC }, { x: 12.5, y: 3.75, z: SZC }, { x: 9.5, y: BAL_Y, z: SZC },
    { x: PLAT_X0, y: 0, z: 7 }, { x: PLAT_X0, y: 0, z: -7 }, { x: PLAT_X0 + 0.5, y: 0, z: 21 }, { x: PLAT_X0 + 0.5, y: 0, z: -21 },
    { x: HALL_X0 - 0.5, y: 0, z: -9 }, { x: HALL_X0 - 0.5, y: 0, z: 0 }, { x: HALL_X0 - 0.5, y: 0, z: 9 },
    ...northArches.map(([a, b]) => ({ x: (a + b) / 2, y: 0, z: HALL_Z + 0.5 })),
    ...southArches.map(([a, b]) => ({ x: (a + b) / 2, y: 0, z: -HALL_Z - 0.5 })),
  ];

  const lights: LightDef[] = [
    { x: -10, y: 9, z: 0, color: 0xffc48a, intensity: 80, distance: 38 },
    { x: -53, y: 7, z: 0, color: 0xffb877, intensity: 45, distance: 24 },
    { x: 45, y: 7.5, z: 0, color: 0x86aaff, intensity: 70, distance: 34 },
    { x: 75, y: 7.5, z: 0, color: 0x86aaff, intensity: 70, distance: 34 },
  ];

  return {
    bounds: { minX: WING_X0, maxX: PLAT_X1, minZ: -OUTER_Z, maxZ: OUTER_Z },
    boxes, ramps, pois, spawns, navRegions, navExtra, lights, glows, pools, tracks,
    landmarks: {
      cafe: { x: -36, y: 0, z: -8.5 },
      balcony: { x: -8, y: BAL_Y, z: 12.5 },
      platformFar: { x: 85, y: 0, z: -20 },
      waitingRoom: { x: -53, y: 0, z: -5.5 },
      /** Under the balcony facing the solid north wall (no arch at this x). */
      wallProbe: { x: -11, y: 0, z: HALL_Z - 1.5 },
      attract: { x: -10, y: 10.5, z: 14.5 },
    },
  };
}
