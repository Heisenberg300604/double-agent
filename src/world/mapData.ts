// "Grand Station" — the whole level authored as plain data. Shared by the
// collision world, the nav graph and the render mesh builder.
//
// Axes: X runs west (-40) → east (+40, platforms). Z runs south (-25) → north (+25).
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
}

/** Render-only atmosphere hints (halos, light pools on the floor, light shafts). */
export interface Glow { x: number; y: number; z: number; size: number; color: number }
export interface LightPool { x: number; y: number; z: number; radius: number; color: number; strength: number }
export interface Shaft { x: number; y: number; z: number; w: number; h: number; tiltX: number; tiltZ: number; color: number }
/** A train door opening (both leaves), for the animated door renderer. */
export interface TrainDoor { train: number; x: number; z: number; side: 1 | -1 }

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

export type PoiKind = 'kiosk' | 'bench' | 'cafe' | 'board' | 'platform' | 'shop' | 'chat' | 'rail' | 'news' | 'clock';

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
  shafts: Shaft[];
  doors: TrainDoor[];
}

/** Yaw that faces along world direction (dx, dz). Matches core/vec yaw convention. */
function faceYaw(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function buildGrandStation(): MapLayout {
  const boxes: Box[] = [];
  const ramps: Ramp[] = [];
  const pois: Poi[] = [];
  let chatGroup = 1;

  const box = (
    x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
    mat: MatId, collide = true, shape: Shape = 'box',
  ): void => {
    boxes.push({
      minX: Math.min(x0, x1), maxX: Math.max(x0, x1),
      minY: Math.min(y0, y1), maxY: Math.max(y0, y1),
      minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1),
      mat, collide, shape,
    });
  };
  const glows: Glow[] = [];
  const pools: LightPool[] = [];
  const shafts: Shaft[] = [];
  const doors: TrainDoor[] = [];
  const sign = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, name: string): void => {
    box(x0, x1, y0, y1, z0, z1, 'signs', false);
    boxes[boxes.length - 1].sign = name;
  };
  const sph = (x: number, y: number, z: number, r: number, mat: MatId): void =>
    box(x - r, x + r, y - r, y + r, z - r, z + r, mat, false, 'sph');
  /** Potted plant (collides as a small cylinder). */
  const plant = (x: number, z: number, big = false): void => {
    const r = big ? 0.42 : 0.32;
    cyl(x, z, r, 0, big ? 0.75 : 0.6, 'stone');
    cyl(x, z, r + 0.04, big ? 0.7 : 0.55, big ? 0.8 : 0.65, 'brass', false);
    const top = big ? 0.8 : 0.65;
    sph(x, top + 0.45, z, big ? 0.62 : 0.45, 'plant');
    sph(x + 0.18, top + 0.85, z - 0.1, big ? 0.45 : 0.32, 'plant');
    sph(x - 0.2, top + 0.7, z + 0.15, big ? 0.42 : 0.3, 'plant');
    if (big) sph(x, top + 1.25, z, 0.35, 'plant');
  };
  const cyl = (x: number, z: number, r: number, y0: number, y1: number, mat: MatId, collide = true): void =>
    box(x - r, x + r, y0, y1, z - r, z + r, mat, collide, 'cyl');
  const poi = (kind: PoiKind, x: number, z: number, yaw: number, y = 0, seat: Vec3 | null = null, group = 0): void => {
    pois.push({ id: pois.length, kind, x, y, z, yaw, seat, group });
  };

  // ---------------------------------------------------------------- floors & shell
  box(-40, 22, -0.3, 0, -14.5, 14.5, 'floor', false);
  box(-40, 22, -0.3, 0, 14.5, 25, 'floorCorridor', false);
  box(-40, 22, -0.3, 0, -25, -14.5, 'floorCorridor', false);
  // Platforms (y=0) and track beds (darker, a touch lower — always covered by trains).
  box(22, 40, -0.3, 0, 14.8, 25, 'platform', false);
  box(22, 40, -0.3, 0, -11.2, 11.2, 'platform', false);
  box(22, 40, -0.3, 0, -25, -14.8, 'platform', false);
  box(22, 40, -0.6, -0.25, 11.2, 14.8, 'track', false);
  box(22, 40, -0.6, -0.25, -14.8, -11.2, 'track', false);
  // Platform edges: pale coping stones and a yellow safety line.
  for (const z of [14.8, 11.2, -11.2, -14.8]) {
    const inward = z === 14.8 || z === -11.2 ? 1 : -1;
    box(23, 40, -0.02, 0.015, z, z + 0.45 * inward, 'plaster', false);
    box(23, 40, 0, 0.02, z + 0.55 * inward, z + 0.75 * inward, 'yellow', false);
  }
  // Brass compass inlay around the clock.
  cyl(-8, 0, 3.2, -0.02, 0.006, 'brass', false);
  cyl(-8, 0, 3.0, -0.02, 0.008, 'stone', false);
  for (const [dx, dz] of [[1, 0], [0, 1]]) box(-8 - dx * 3.1 - dz * 0.06, -8 + dx * 3.1 + dz * 0.06, 0, 0.012, -dz * 3.1 - dx * 0.06, dz * 3.1 + dx * 0.06, 'brass', false);

  // Outer walls.
  box(-41, 41, 0, 14, 25, 26, 'wall');
  box(-41, 41, 0, 14, -26, -25, 'wall');
  box(-41, -40, 0, 14, -26, 26, 'wall');
  box(40, 41, 0, 10, -26, 26, 'wall');

  // Ceilings (render only).
  box(-40, 22, 14, 14.4, -14.5, 14.5, 'ceiling', false);
  box(-40, 22, 5.2, 5.5, 15.5, 25, 'ceiling', false);
  box(-40, 22, 5.2, 5.5, -25, -15.5, 'ceiling', false);
  box(22, 40, 9, 9.3, -25, 25, 'ceiling', false);
  // Coffered ceiling: skylights between a grid of deep beams.
  for (const x of [-30, -15, 0, 14]) {
    box(x - 3, x + 3, 13.95, 14, -9, 9, 'window', false);
    shafts.push({ x, y: 7, z: -3, w: 4.5, h: 14, tiltX: 0.18, tiltZ: -0.12, color: 0x9fb4d0 });
  }
  for (let x = -37; x <= 20; x += 5.7) box(x - 0.22, x + 0.22, 13.25, 14, -14.5, 14.5, 'woodDark', false);
  for (const z of [-12, -6, 0, 6, 12]) box(-40, 22, 13.35, 14, z - 0.2, z + 0.2, 'woodDark', false);
  // Cornices, string course and pilasters on the hall walls.
  for (const [z0, z1] of [[14.1, 14.5], [-14.5, -14.1]] as [number, number][]) {
    box(-40, 22, 12.7, 13.2, z0, z1, 'plaster', false);
    box(-40, 22, 6.9, 7.15, z0 + (z0 > 0 ? 0.15 : 0), z1 - (z0 > 0 ? 0 : 0.15), 'plaster', false);
  }
  box(-40, -39.6, 12.7, 13.2, -14.5, 14.5, 'plaster', false);
  box(21.1, 21.5, 12.7, 13.2, -14.5, 14.5, 'plaster', false);
  const archSpans: Record<string, [number, number][]> = { n: [[-38, -34], [-14, -10], [0, 4]], s: [[-30, -26], [-14, -10], [4, 8]] };
  for (const side of ['n', 's'] as const) {
    const zf = side === 'n' ? 14.5 : -14.5, d = side === 'n' ? -0.14 : 0.14;
    for (let x = -36.5; x <= 20; x += 5.7) {
      if (archSpans[side].some(([a, b]) => x > a - 0.6 && x < b + 0.6)) continue;
      box(x - 0.35, x + 0.35, 0, 12.7, zf, zf + d, 'plaster', false);
      box(x - 0.5, x + 0.5, 12.4, 12.7, zf, zf + d * 1.8, 'plaster', false);
    }
    // Arched clerestory windows high on the walls.
    for (let x = -33.65; x <= 18; x += 5.7) {
      const zw = zf + d * 0.25;
      box(x - 1.5, x + 1.5, 7.6, 11.4, zw - 0.02, zw + 0.02, 'window', false);
      for (let k = 1; k <= 3; k++) {
        const hw = 1.5 * Math.sqrt(1 - (k / 4) ** 2);
        box(x - hw, x + hw, 11.4 + (k - 1) * 0.3, 11.4 + k * 0.3, zw - 0.02, zw + 0.02, 'window', false);
      }
      box(x - 0.04, x + 0.04, 7.6, 12.3, zw - 0.05, zw + 0.05, 'woodDark', false);
      for (const yy of [8.9, 10.2, 11.4]) box(x - 1.5, x + 1.5, yy - 0.04, yy + 0.04, zw - 0.05, zw + 0.05, 'woodDark', false);
      box(x - 1.65, x + 1.65, 7.45, 7.6, zf, zf + d * 1.5, 'plaster', false);
      shafts.push({ x, y: 7.5, z: zf + d * 18, w: 2.6, h: 9, tiltX: 0, tiltZ: side === 'n' ? -0.55 : 0.55, color: 0x8ea6c8 });
    }
  }
  // The great west window with a fan top.
  {
    const xw = -39.9;
    box(xw - 0.02, xw + 0.03, 4.5, 11, -6, 6, 'window', false);
    for (let k = 1; k <= 6; k++) {
      const hw = 6 * Math.sqrt(1 - (k / 7) ** 2);
      box(xw - 0.02, xw + 0.03, 11 + (k - 1) * 0.3, 11 + k * 0.3, -hw, hw, 'window', false);
    }
    for (let z = -6; z <= 6; z += 1.5) box(xw, xw + 0.1, 4.5, 12.8, z - 0.05, z + 0.05, 'woodDark', false);
    for (let y = 4.5; y <= 11; y += 1.3) box(xw, xw + 0.1, y - 0.05, y + 0.05, -6, 6, 'woodDark', false);
    box(-40, -39.5, 4.2, 4.5, -6.5, 6.5, 'plaster', false);
    shafts.push({ x: -34, y: 5.5, z: 0, w: 8, h: 10, tiltX: 0.6, tiltZ: 0, color: 0x9ab0cf });
  }

  // Inner walls between hall and corridors, with arches.
  const wallWithArches = (zMin: number, zMax: number, arches: [number, number][]): void => {
    let x = -40;
    for (const [a0, a1] of arches) {
      box(x, a0, 0, 14, zMin, zMax, 'wallGreen');
      box(a0, a1, 3.6, 14, zMin, zMax, 'wallGreen'); // lintel
      box(a0 - 0.15, a0, 0, 3.6, zMin - 0.1, zMax + 0.1, 'brass', false);
      box(a1, a1 + 0.15, 0, 3.6, zMin - 0.1, zMax + 0.1, 'brass', false);
      box(a0 - 0.15, a1 + 0.15, 3.6, 3.8, zMin - 0.1, zMax + 0.1, 'brass', false);
      x = a1;
    }
    box(x, 22, 0, 14, zMin, zMax, 'wallGreen');
    // Wainscot trim along the hall side.
    box(-40, 22, 1.1, 1.2, zMin - 0.05, zMax + 0.05, 'woodDark', false);
  };
  wallWithArches(14.5, 15.5, [[-38, -34], [-14, -10], [0, 4]]);
  wallWithArches(-15.5, -14.5, [[-30, -26], [-14, -10], [4, 8]]);
  sign(-37.6, -34.4, 3.95, 4.45, 14.38, 14.46, 'WAY OUT');
  sign(-29.6, -26.4, 3.95, 4.45, -14.46, -14.38, 'LEFT LUGGAGE');
  sign(4.4, 7.6, 3.95, 4.45, -14.46, -14.38, 'TELEGRAMS');
  sign(-13.6, -10.4, 3.95, 4.45, -14.46, -14.38, 'WAY OUT');

  // East hall wall with two gates to the platforms; departure board between them.
  box(21.5, 22.5, 0, 14, -14.5, -9, 'wallGreen');
  box(21.5, 22.5, 0, 14, -4, 4, 'wallGreen');
  box(21.5, 22.5, 0, 14, 9, 14.5, 'wallGreen');
  box(21.5, 22.5, 4, 14, -9, -4, 'wallGreen');
  box(21.5, 22.5, 4, 14, 4, 9, 'wallGreen');
  for (const [z0, z1] of [[-9, -4], [4, 9]]) {
    box(21.35, 22.65, 3.8, 4, z0, z1, 'brass', false);
    box(21.35, 22.65, 0, 4, z0 - 0.15, z0, 'brass', false);
    box(21.35, 22.65, 0, 4, z1, z1 + 0.15, 'brass', false);
  }
  box(21.15, 21.5, 3, 6.2, -3.6, 3.6, 'board', true);
  box(21.1, 21.5, 2.85, 3, -3.75, 3.75, 'brass', false);
  box(21.1, 21.5, 6.2, 6.35, -3.75, 3.75, 'brass', false);
  box(21.05, 21.15, 2.9, 6.3, -3.75, -3.6, 'brass', false);
  box(21.05, 21.15, 2.9, 6.3, 3.6, 3.75, 'brass', false);
  sign(21.3, 21.42, 6.7, 7.6, -4.2, 4.2, 'GRAND STATION');
  box(21.2, 21.5, 9.2, 11.9, -1.35, 1.35, 'clock');
  box(21.15, 21.5, 9.05, 12.05, -1.5, 1.5, 'brass', false);
  for (const zc of [-6.5, 6.5]) {
    sign(21.3, 21.42, 4.25, 4.85, zc - 2, zc + 2, 'PLATFORMS  →');
    box(22.58, 22.7, 4.2, 4.9, zc - 2, zc + 2, 'led', false);
  }
  glows.push({ x: 21, y: 4.6, z: 0, size: 6, color: 0xffcf80 });
  for (let z = -1.6; z <= 1.6; z += 1.6) poi('board', 17.6, z, faceYaw(1, 0));

  // ---------------------------------------------------------------- balcony + stairs
  const BAL_Y = 5;
  box(-20, 8, 4.6, BAL_Y, 9.5, 14.5, 'floorCorridor');
  // Railings: invisible collision slabs + rendered rails and balusters.
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
  railing(-20, 8, 9.3, 9.55);
  railing(-20.25, -20, 9.3, 11);
  railing(8, 8.25, 9.3, 11);
  box(-20, 8, 4.4, 4.6, 9.3, 9.6, 'woodDark', false); // fascia
  for (const x of [-14.5, -6, 2.5]) cyl(x, 10, 0.35, 0, 4.6, 'brass');
  for (let x = -18; x <= 6; x += 6) poi('rail', x, 10.2, faceYaw(0, -1), BAL_Y);

  // Stairs: ramps with stepped solid boxes underneath so the sides block.
  const stair = (xBottom: number, xTop: number, z0: number, z1: number): void => {
    const minX = Math.min(xBottom, xTop), maxX = Math.max(xBottom, xTop);
    const ascendingWithX = xTop > xBottom;
    ramps.push({ minX, maxX, minZ: z0, maxZ: z1, axis: 'x', y0: ascendingWithX ? 0 : BAL_Y, y1: ascendingWithX ? BAL_Y : 0 });
    const steps = 14;
    const len = maxX - minX;
    for (let i = 0; i < steps; i++) {
      // Each step's top equals the ramp height at its lower end so it never pokes above the ramp.
      const t0 = i / steps, t1 = (i + 1) / steps;
      const sx0 = minX + len * t0, sx1 = minX + len * t1;
      const top = ascendingWithX ? BAL_Y * t0 : BAL_Y * (1 - t1);
      if (top > 0.05) box(sx0, sx1, 0, top, z0, z1, 'stone');
      // Visual tread, slightly above the solid step (render only).
      const vis = ascendingWithX ? BAL_Y * t1 : BAL_Y * (1 - t0);
      box(sx0, sx1, Math.max(0, vis - 0.36), vis, z0, z1, 'woodDark', false);
    }
    // Side rail along the open edge (z0), stepped so it follows the slope.
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const sx0 = minX + len * t0, sx1 = minX + len * t1;
      const top = ascendingWithX ? BAL_Y * t1 : BAL_Y * (1 - t0);
      box(sx0, sx1, 0, top + 1, z0 - 0.2, z0, 'woodDark');
    }
  };
  stair(-30, -20, 11, 14.4);
  stair(18, 8, 11, 14.4);

  // ---------------------------------------------------------------- concourse props
  // Columns.
  const column = (x: number, z: number): void => {
    cyl(x, z, 0.6, 0, 14, 'stone');
    box(x - 0.78, x + 0.78, 0, 0.45, z - 0.78, z + 0.78, 'plaster', false);
    cyl(x, z, 0.7, 0.45, 0.6, 'brass', false);
    cyl(x, z, 0.64, 3.0, 3.15, 'brass', false);
    cyl(x, z, 0.64, 7.0, 7.15, 'brass', false);
    cyl(x, z, 0.72, 12.2, 12.5, 'plaster', false);
    cyl(x, z, 0.85, 12.5, 12.75, 'brass', false);
    box(x - 1, x + 1, 12.75, 13.3, z - 1, z + 1, 'plaster', false);
    // Column-mounted lamp pair.
    for (const s of [-1, 1]) {
      box(x + s * 0.6, x + s * 0.95, 4.6, 4.66, z - 0.04, z + 0.04, 'brass', false);
      sph(x + s * 0.95, 4.82, z, 0.17, 'bulb');
      glows.push({ x: x + s * 0.95, y: 4.82, z, size: 1.6, color: 0xffd08a });
    }
    pools.push({ x, y: 0, z, radius: 3.2, color: 0xffc070, strength: 0.35 });
  };
  for (const x of [-28, -16, 4, 14]) column(x, -9.5);
  for (const x of [-28, 14]) column(x, 7.6);

  // The great clock.
  box(-9.3, -6.7, 0, 0.9, -1.3, 1.3, 'stone');
  cyl(-8, 0, 0.45, 0.9, 4.4, 'brass');
  box(-9.1, -6.9, 4.4, 6.6, -1.1, 1.1, 'clock');
  box(-9.25, -6.75, 6.6, 6.85, -1.25, 1.25, 'brass', false);
  box(-9.25, -6.75, 4.2, 4.4, -1.25, 1.25, 'brass', false);
  sph(-8, 7.15, 0, 0.35, 'brass');
  box(-8.03, -7.97, 7.3, 7.9, -0.03, 0.03, 'brass', false);
  cyl(-8, 0, 0.6, 0.9, 1.15, 'brass', false);
  glows.push({ x: -8, y: 5.5, z: 0, size: 4.5, color: 0xfff0c8 });
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    poi('clock', -8 + dx * 2.2, dz * 2.2, faceYaw(-dx, -dz));
  }

  // Benches: seat + backrest, three seats each.
  const bench = (cx: number, cz: number, facing: 1 | -1): void => {
    // facing = direction (+z/-z) the sitter looks.
    const back = cz - facing * 0.28;
    box(cx - 1.2, cx + 1.2, 0, 0.46, cz - 0.28, cz + 0.28, 'wood');
    box(cx - 1.2, cx + 1.2, 0.46, 1.0, back - 0.06, back + 0.06, 'wood');
    box(cx - 1.25, cx - 1.15, 0, 0.7, cz - 0.3, cz + 0.3, 'metal', false);
    box(cx + 1.15, cx + 1.25, 0, 0.7, cz - 0.3, cz + 0.3, 'metal', false);
    box(cx - 1.27, cx - 1.13, 0.66, 0.72, cz - 0.32, cz + 0.32, 'brass', false);
    box(cx + 1.13, cx + 1.27, 0.66, 0.72, cz - 0.32, cz + 0.32, 'brass', false);
    for (const bx of [-0.95, 0, 0.95]) box(cx + bx - 0.05, cx + bx + 0.05, 0.46, 1.0, back - 0.075, back + 0.075, 'woodDark', false);
    for (const dx of [-0.75, 0, 0.75]) {
      poi('bench', cx + dx, cz + facing * 0.9, faceYaw(0, facing), 0, { x: cx + dx, y: 0, z: cz + facing * 0.05 });
    }
  };
  bench(0, -5.4, -1);
  bench(0, -4.6, 1);
  bench(9, -5.4, -1);
  bench(9, -4.6, 1);
  bench(-20, 3.6, 1);
  bench(-20, 2.8, -1);
  bench(5, 4.4, 1);
  bench(5, 3.6, -1);
  bench(-34, 9, -1);

  // Ticket kiosk block along the south wall.
  box(-24, -14, 0, 3.2, -14.5, -12.6, 'woodDark');
  box(-24.1, -13.9, 3.2, 3.5, -14.5, -12.4, 'brass', false);
  for (const x of [-22, -19, -16]) {
    box(x - 0.9, x + 0.9, 1.1, 2.4, -12.62, -12.58, 'glassWarm', false);
    for (let bx = -0.75; bx <= 0.76; bx += 0.25) box(x + bx - 0.012, x + bx + 0.012, 1.1, 2.4, -12.56, -12.53, 'brass', false);
    box(x - 0.95, x + 0.95, 1.05, 1.12, -12.62, -12.3, 'brass', false);
    box(x - 0.95, x + 0.95, 2.4, 2.48, -12.62, -12.55, 'brass', false);
    poi('kiosk', x, -11.7, faceYaw(0, -1));
    pools.push({ x, y: 0, z: -11.8, radius: 1.6, color: 0xffb860, strength: 0.4 });
  }
  box(-24, -14, 2.6, 3.1, -12.6, -12.5, 'lamp', false);
  sign(-21.5, -16.5, 3.55, 4.25, -12.5, -12.38, 'TICKETS');
  box(-24.2, -13.8, 0, 0.18, -12.65, -12.3, 'brass', false);
  glows.push({ x: -19, y: 2.85, z: -12.4, size: 5, color: 0xffd9a0 });

  // Newsstand.
  box(-36, -32.5, 0, 2.5, 4.6, 6.6, 'shop');
  box(-36.2, -32.3, 2.5, 2.7, 4.4, 6.8, 'woodDark', false);
  sign(-35.9, -32.6, 2.75, 3.25, 4.55, 4.62, 'NEWS & TOBACCO');
  // Magazine racks on the front.
  for (let mx = -35.7; mx < -32.8; mx += 0.42) {
    for (const [y0, mat] of [[1.0, 'paper'], [1.45, 'leather'], [1.9, 'paper']] as [number, MatId][]) {
      box(mx, mx + 0.34, y0, y0 + 0.36, 4.5, 4.58, mat, false);
    }
  }
  glows.push({ x: -34.2, y: 2.6, z: 4.4, size: 3, color: 0xffd9a0 });
  poi('news', -34.2, 3.8, faceYaw(0, 1));
  poi('news', -32.9, 3.9, faceYaw(0, 1));

  // Café corner (SW).
  box(-40, -38.8, 0, 1.1, -13, -4.5, 'wood');
  box(-40, -39.6, 1.1, 2.6, -13, -4.5, 'shop', false);
  box(-40, -38.6, 2.8, 3.1, -13.2, -4.3, 'brass', false);
  poi('cafe', -38.1, -7, faceYaw(-1, 0));
  poi('cafe', -38.1, -10, faceYaw(-1, 0));
  sign(-39.55, -39.45, 3.3, 3.9, -11, -6.5, 'CAFÉ');
  box(-39.9, -39.2, 1.1, 1.6, -12.4, -11.6, 'chrome', false); // coffee machine
  box(-39.9, -39.2, 1.1, 1.35, -9.2, -8.6, 'glassWarm', false); // pastry case
  for (let cz = -12.5; cz < -5; cz += 0.6) box(-39.4, -39.3, 1.1, 1.24, cz, cz + 0.12, 'paper', false);
  pools.push({ x: -33, y: 0, z: -8, radius: 5, color: 0xffb060, strength: 0.4 });
  const table = (tx: number, tz: number): void => {
    cyl(tx, tz, 0.45, 0, 0.76, 'woodDark');
    cyl(tx, tz, 0.47, 0.74, 0.77, 'paper', false);
    box(tx - 0.012, tx + 0.012, 2.4, 14, tz - 0.012, tz + 0.012, 'metal', false);
    cyl(tx, tz, 0.22, 2.25, 2.42, 'brass', false);
    sph(tx, 2.2, tz, 0.13, 'bulb');
    glows.push({ x: tx, y: 2.2, z: tz, size: 1.8, color: 0xffc888 });
    pools.push({ x: tx, y: 0, z: tz, radius: 1.5, color: 0xffb060, strength: 0.45 });
    for (const side of [-1, 1]) {
      const chx = tx + side * 0.95;
      box(chx - 0.22, chx + 0.22, 0, 0.45, tz - 0.22, tz + 0.22, 'fabric');
      box(chx + side * 0.18 - 0.04, chx + side * 0.18 + 0.04, 0.45, 0.95, tz - 0.22, tz + 0.22, 'fabric', false);
      poi('cafe', tx + side * 1.45, tz, faceYaw(-side, 0), 0, { x: chx, y: 0, z: tz });
    }
  };
  table(-35.5, -11.6);
  table(-35.5, -8.2);
  table(-35.5, -4.8);
  table(-30.5, -10.4);
  table(-30.5, -6.6);
  // Planters framing the café.
  box(-38, -32, 0, 0.75, -2.6, -2.0, 'wallLow');
  box(-26.6, -26, 0, 0.75, -13, -8.5, 'wallLow');
  for (let px = -37.5; px <= -32.5; px += 1) sph(px, 0.95, -2.3, 0.42, 'plant');
  for (let pz = -12.5; pz <= -9; pz += 1) sph(-26.3, 0.95, pz, 0.42, 'plant');
  // Potted palms around the hall.
  plant(-38.7, 12.8, true);
  plant(-38.7, -13.4, true);
  plant(19.8, 9.6, true);
  plant(19.8, -13.6, true);
  plant(-24.6, -13.6);
  plant(-13, -13.6);

  // Hanging lamps (render only).
  for (const [x, z] of [[-30, -6], [-20, 0], [-8, -6], [4, 0], [14, -4], [-30, 6]] as [number, number][]) {
    box(x - 0.03, x + 0.03, 9.2, 14, z - 0.03, z + 0.03, 'metal', false);
    cyl(x, z, 1.25, 8.55, 8.65, 'brass', false);
    cyl(x, z, 0.35, 8.65, 9.25, 'brass', false);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      sph(x + Math.cos(a) * 1.1, 8.4, z + Math.sin(a) * 1.1, 0.2, 'bulb');
    }
    sph(x, 8.25, z, 0.3, 'bulb');
    glows.push({ x, y: 8.4, z, size: 6, color: 0xffcf8a });
    pools.push({ x, y: 0, z, radius: 6, color: 0xffbb70, strength: 0.32 });
  }
  // Wall sconces along the corridors.
  for (let x = -36; x <= 18; x += 9) {
    for (const z of [15.6, -15.6, 24.9, -24.9]) {
      const s = z > 0 ? (z > 20 ? -1 : 1) : z < -20 ? 1 : -1;
      box(x - 0.08, x + 0.08, 3.1, 3.3, z, z + s * 0.25, 'brass', false);
      sph(x, 3.45, z + s * 0.3, 0.16, 'bulb');
      glows.push({ x, y: 3.45, z: z + s * 0.3, size: 1.8, color: 0xffcc88 });
    }
  }

  // Chat spots in the open concourse: three slots around a centre.
  const chat = (cx: number, cz: number, y = 0): void => {
    const g = chatGroup++;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const x = cx + Math.cos(a) * 0.8, z = cz + Math.sin(a) * 0.8;
      poi('chat', x, z, faceYaw(cx - x, cz - z), y, null, g);
    }
  };
  chat(-14, -4);
  chat(-2, 8);
  chat(12, 9);
  chat(-24, -6);
  chat(16, -11);
  chat(-34, 0);
  chat(-4, 12, BAL_Y);

  // ---------------------------------------------------------------- corridors & shops
  const shopNames = ['BOOKSELLER', 'FLORIST', 'BAKERY', 'WATCHMAKER', 'CHEMIST', 'TELEGRAMS', 'NEWS & TOBACCO', 'CAFÉ'];
  let shopIdx = 0;
  const shopRow = (zWall: number, s: 1 | -1): void => {
    // s = direction from wall toward corridor centre.
    for (let x = -37; x <= 15; x += 8.6) {
      const counterZ = zWall + s * 1.9;
      box(x, x + 5.6, 0, 1.0, counterZ - 0.35, counterZ + 0.35, 'wood');
      box(x - 0.05, x + 5.65, 0.98, 1.05, counterZ - 0.4, counterZ + 0.4, 'woodDark', false);
      box(x, x + 5.6, 0, 2.6, zWall, zWall + s * 0.9, 'shop');
      // Lit display shelves and goods.
      box(x + 0.2, x + 5.4, 0.9, 2.4, zWall + s * 0.9, zWall + s * 0.93, 'glassWarm', false);
      for (const yy of [1.2, 1.7, 2.2]) {
        box(x + 0.2, x + 5.4, yy - 0.03, yy, zWall + s * 0.9, zWall + s * 1.15, 'woodDark', false);
        for (let gx = x + 0.4; gx < x + 5.2; gx += 0.55) {
          box(gx, gx + 0.3, yy, yy + 0.22 + ((gx * 7) % 0.15), zWall + s * 0.95, zWall + s * 1.1, (Math.round(gx * 3) % 3 === 0 ? 'paper' : Math.round(gx * 3) % 3 === 1 ? 'leather' : 'plant') as MatId, false);
        }
      }
      sign(x + 0.6, x + 5, 3.15, 3.85, zWall + s * 0.06, zWall + s * 0.16, shopNames[shopIdx++ % shopNames.length]);
      // Striped awning.
      for (let k = 0; k < 8; k++) {
        const ax = x - 0.3 + k * 0.775;
        box(ax, ax + 0.775, 2.6, 3.0, zWall, zWall + s * 2.4, k % 2 ? 'woodDark' : 'fabric', false);
      }
      box(x - 0.3, x + 5.9, 2.55, 2.62, zWall + s * 2.3, zWall + s * 2.45, 'brass', false);
      glows.push({ x: x + 2.8, y: 2.0, z: zWall + s * 1.2, size: 4.5, color: 0xffc070 });
      pools.push({ x: x + 2.8, y: 0, z: zWall + s * 2.6, radius: 3.2, color: 0xffb060, strength: 0.4 });
      poi('shop', x + 1.6, counterZ + s * 1.0, faceYaw(0, -s));
      poi('shop', x + 4.0, counterZ + s * 1.0, faceYaw(0, -s));
    }
  };
  shopRow(25, -1);
  shopRow(-25, 1);
  // Corridor benches (back-to-back pairs along the middle).
  for (const x of [-26, -4, 14]) {
    for (const zc of [19.5, -19.5]) {
      box(x - 1.2, x + 1.2, 0, 0.46, zc - 0.28, zc + 0.28, 'wood');
      box(x - 1.2, x + 1.2, 0.46, 1.0, zc - 0.06, zc + 0.06, 'wood');
      for (const dx of [-0.75, 0.75]) {
        poi('bench', x + dx, zc - 0.95, faceYaw(0, -1), 0, { x: x + dx, y: 0, z: zc - 0.18 });
        poi('bench', x + dx, zc + 0.95, faceYaw(0, 1), 0, { x: x + dx, y: 0, z: zc + 0.18 });
      }
    }
  }

  // ---------------------------------------------------------------- platforms & trains
  let trainIdx = 0;
  const train = (z0: number, z1: number): void => {
    const ti = trainIdx++;
    const zc = (z0 + z1) / 2;
    for (const [x0, x1, cab] of [[23, 31, true], [31.25, 39.8, false]] as [number, number, boolean][]) {
      box(x0, x1, 0.3, 4.0, z0, z1, 'invisible');
      const a = z0 + 0.04, b = z1 - 0.04;
      box(x0, x1, 0.5, 1.72, a, b, 'trainBody', false);
      box(x0, x1, 1.72, 1.9, a - 0.01, b + 0.01, 'trainCream', false);
      box(x0, x1, 1.9, 3.25, a, b, 'trainBody', false);
      box(x0, x1, 3.05, 3.2, a - 0.01, b + 0.01, 'trainCream', false);
      box(x0 + 0.05, x1 - 0.05, 2.75, 4.05, a + 0.05, b - 0.05, 'trainRoof', false, 'cylX');
      box(x0, x1, 1.86, 1.89, a - 0.03, b + 0.03, 'brass', false);
      box(x0 + 0.1, x1 - 0.1, 0.3, 0.52, a + 0.15, b - 0.15, 'trainDark', false);
      // Bogies with wheels.
      for (const bx of [x0 + 1.9, x1 - 1.9]) {
        box(bx - 1.2, bx + 1.2, 0.08, 0.45, zc - 1.25, zc + 1.25, 'trainDark', false);
        for (const wx of [bx - 0.75, bx + 0.75]) {
          for (const wz of [a + 0.12, b - 0.12]) box(wx - 0.42, wx + 0.42, -0.25, 0.59, wz - 0.06, wz + 0.06, 'rubber', false, 'cylZ');
        }
      }
      // Windows (lit interior) with dark frames, both sides.
      const doorXs = [x0 + 1.6, x1 - 1.6];
      for (let wx = x0 + 2.5; wx < x1 - 2.6; wx += 1.45) {
        for (const [zf, d] of [[a, -1], [b, 1]] as [number, number][]) {
          box(wx - 0.05, wx + 1.25, 2.05, 2.95, zf + d * 0.005, zf + d * 0.02, 'rubber', false);
          box(wx, wx + 1.2, 2.1, 2.9, zf + d * 0.015, zf + d * 0.03, 'glassWarm', false);
        }
      }
      // Door openings: dark recess + warm interior; leaves are animated separately.
      for (const dx of doorXs) {
        for (const [zf, d, side] of [[a, -1, -1], [b, 1, 1]] as [number, number, 1 | -1][]) {
          box(dx - 0.72, dx + 0.72, 0.52, 3.0, zf + d * 0.005, zf + d * 0.02, 'rubber', false);
          box(dx - 0.62, dx + 0.62, 0.55, 2.92, zf - d * 0.02, zf - d * 0.01, 'glassWarm', false);
          doors.push({ train: ti, x: dx, z: zf + d * 0.04, side });
        }
      }
      // Roof vents and a pantograph on the second car.
      for (let vx = x0 + 1.5; vx < x1 - 1; vx += 2.6) box(vx, vx + 0.9, 3.95, 4.15, zc - 0.4, zc + 0.4, 'trainRoof', false);
      if (!cab) {
        box(x0 + 3, x0 + 4.4, 4.05, 4.2, zc - 0.7, zc + 0.7, 'metal', false);
        box(x0 + 3.6, x0 + 3.68, 4.2, 5.0, zc - 0.03, zc + 0.03, 'metal', false);
        box(x0 + 3.1, x0 + 4.3, 5.0, 5.05, zc - 0.9, zc + 0.9, 'chrome', false);
      }
      if (cab) {
        // Cab front facing the concourse.
        box(x0 - 0.18, x0, 0.5, 3.25, a + 0.2, b - 0.2, 'trainBody', false);
        box(x0 - 0.22, x0 - 0.18, 2.05, 2.95, a + 0.45, b - 0.45, 'glass', false);
        box(x0 - 0.22, x0 - 0.18, 3.05, 3.3, a + 0.8, b - 0.8, 'led', false);
        box(x0 - 0.2, x0 - 0.17, 1.72, 1.9, a + 0.2, b - 0.2, 'trainCream', false);
        for (const hz of [a + 0.55, b - 0.55]) {
          sph(x0 - 0.2, 1.1, hz, 0.14, 'bulb');
          glows.push({ x: x0 - 0.3, y: 1.1, z: hz, size: 1.6, color: 0xfff2d8 });
        }
        box(x0 - 0.25, x0 - 0.18, 0.5, 0.75, a + 0.3, b - 0.3, 'yellow', false);
      }
      glows.push({ x: (x0 + x1) / 2, y: 2.5, z: z0 - 0.6, size: 7, color: 0xffc078 });
      glows.push({ x: (x0 + x1) / 2, y: 2.5, z: z1 + 0.6, size: 7, color: 0xffc078 });
    }
    box(31, 31.25, 0.4, 3.6, z0 + 0.6, z1 - 0.6, 'trainDark'); // coupling
    box(22.2, 23, 0, 1.2, z0 - 0.1, z1 + 0.1, 'metal'); // buffer stop
    box(22.25, 22.35, 0.5, 0.9, z0 + 0.2, z1 - 0.2, 'yellow', false);
    for (const bz of [z0 + 0.6, z1 - 0.6]) box(22.95, 23.1, 0.8, 1.05, bz - 0.18, bz + 0.18, 'chrome', false, 'cylX');
  };
  train(11.3, 14.7);
  train(-14.7, -11.3);
  // Canopy: columns with lamp brackets, roof trusses and glazed strips.
  for (const x of [27, 35]) {
    for (const z of [0, 20, -20]) {
      cyl(x, z, 0.3, 0, 9, 'metal');
      cyl(x, z, 0.42, 0, 0.5, 'metal', false);
      for (const s of [-1, 1]) {
        box(x - 0.04, x + 0.04, 4.6, 4.68, z, z + s * 0.9, 'metal', false);
        sph(x, 4.45, z + s * 0.9, 0.2, 'lampBlue');
        glows.push({ x, y: 4.45, z: z + s * 0.9, size: 2.4, color: 0xb8d0ff });
      }
      pools.push({ x, y: 0, z, radius: 4.5, color: 0x90b0ff, strength: 0.35 });
    }
  }
  for (let x = 23.5; x <= 39.5; x += 4) {
    box(x - 0.12, x + 0.12, 8.55, 9, -25, 25, 'metal', false);
    box(x - 0.06, x + 0.06, 7.9, 8.55, -25, 25, 'metal', false);
  }
  for (const z of [-20, -6, 6, 20]) box(22, 40, 8.94, 9, z - 1.4, z + 1.4, 'window', false);
  // The open east end: tall glazed screen onto the night.
  box(39.9, 39.98, 0.5, 8.6, -25, 25, 'window', false);
  for (let z = -24; z <= 24; z += 2) box(39.8, 39.9, 0.5, 8.6, z - 0.05, z + 0.05, 'metal', false);
  for (const y of [3, 6]) box(39.8, 39.9, y - 0.05, y + 0.05, -25, 25, 'metal', false);
  // Luggage trolleys.
  for (const [lx, lz] of [[37.5, 5.5], [37.5, -5.5]] as [number, number][]) {
    box(lx - 0.5, lx + 0.5, 0.25, 0.32, lz - 0.85, lz + 0.85, 'metal');
    box(lx - 0.45, lx + 0.45, 0.32, 0.72, lz - 0.7, lz + 0.2, 'leather', false);
    box(lx - 0.38, lx + 0.38, 0.72, 1.0, lz - 0.6, lz + 0.05, 'fabric', false);
    box(lx - 0.5, lx + 0.5, 0.25, 1.35, lz + 0.8, lz + 0.86, 'metal', false);
    for (const wz of [lz - 0.7, lz + 0.7]) box(lx - 0.45, lx + 0.45, 0, 0.22, wz - 0.03, wz + 0.03, 'rubber', false, 'cylX');
  }
  // Platform benches.
  for (const [x, z] of [[31, 4], [31, -4], [31, 22.5], [31, -22.5]] as [number, number][]) {
    box(x - 1.2, x + 1.2, 0, 0.46, z - 0.28, z + 0.28, 'wood');
    const f: 1 | -1 = z > 0 ? -1 : 1;
    box(x - 1.2, x + 1.2, 0.46, 1.0, z - f * 0.28 - 0.06, z - f * 0.28 + 0.06, 'wood');
    for (const dx of [-0.75, 0.75]) {
      poi('bench', x + dx, z + f * 0.95, faceYaw(0, f), 0, { x: x + dx, y: 0, z: z + f * 0.05 });
    }
  }
  // Hanging platform signs and LED departure displays.
  const hang = (x: number, z: number, name: string): void => {
    for (const dz of [-0.04, 0.04]) box(x - 0.6 - 0.01, x - 0.6 + 0.01, 6.0, 7.9, z + dz - 0.01, z + dz + 0.01, 'metal', false);
    sign(x - 1.4, x + 1.4, 5.5, 6.0, z - 0.04, z + 0.04, name);
    box(x - 1.4, x + 1.4, 4.95, 5.45, z - 0.05, z + 0.05, 'led', false);
    box(x - 1.45, x + 1.45, 4.9, 6.05, z - 0.03, z + 0.03, 'trainDark', false);
  };
  hang(29, 17.5, 'PLATFORM 1');
  hang(29, 8.6, 'PLATFORM 2');
  hang(29, -8.6, 'PLATFORM 2');
  hang(29, -17.5, 'PLATFORM 3');
  // Platform-edge waiting spots facing the trains.
  for (const x of [25, 29, 34, 38]) {
    poi('platform', x, 16.2, faceYaw(0, -1));
    poi('platform', x, 9.8, faceYaw(0, 1));
    poi('platform', x, -9.8, faceYaw(0, -1));
    poi('platform', x, -16.2, faceYaw(0, 1));
  }
  chat(30, 0);
  chat(36, 21);
  chat(36, -21);

  // ---------------------------------------------------------------- spawns, nav, lights
  const spawns: Vec3[] = [
    { x: -36, y: 0, z: -0.5 },
    { x: -21, y: 0, z: -6 },
    { x: -4, y: 0, z: -11 },
    { x: 10, y: 0, z: -1 },
    { x: 17, y: 0, z: 6 },
    { x: -24, y: 0, z: 8 },
    { x: -30, y: 0, z: 18.5 },
    { x: -8, y: 0, z: 18 },
    { x: 12, y: 0, z: 17.5 },
    { x: -34, y: 0, z: -17.5 },
    { x: -8, y: 0, z: -18 },
    { x: 11, y: 0, z: -17.5 },
    { x: 30, y: 0, z: 19 },
    { x: 34, y: 0, z: 7 },
    { x: 30, y: 0, z: -19 },
    { x: -8, y: BAL_Y, z: 12 },
  ];

  const navRegions: NavRegion[] = [
    { minX: -38.6, maxX: 20.4, minZ: -13.4, maxZ: 13.6, y: 0, spacing: 3.2 },
    { minX: -38.6, maxX: 21.4, minZ: 16.6, maxZ: 21.8, y: 0, spacing: 3 },
    { minX: -38.6, maxX: 21.4, minZ: -21.8, maxZ: -16.6, y: 0, spacing: 3 },
    { minX: 23.5, maxX: 39, minZ: 16, maxZ: 24, y: 0, spacing: 3.1 },
    { minX: 23.5, maxX: 39, minZ: -10.2, maxZ: 10.2, y: 0, spacing: 3.4 },
    { minX: 23.5, maxX: 39, minZ: -24, maxZ: -16, y: 0, spacing: 3.1 },
    { minX: -19.2, maxX: 7.2, minZ: 10.6, maxZ: 13.8, y: BAL_Y, spacing: 3 },
  ];

  const navExtra: Vec3[] = [
    // West stair: bottom, middle, top.
    { x: -31.6, y: 0, z: 12.7 }, { x: -27.5, y: 1.25, z: 12.7 }, { x: -25, y: 2.5, z: 12.7 },
    { x: -22.5, y: 3.75, z: 12.7 }, { x: -19.5, y: BAL_Y, z: 12.7 },
    // East stair.
    { x: 19.6, y: 0, z: 12.7 }, { x: 15.5, y: 1.25, z: 12.7 }, { x: 13, y: 2.5, z: 12.7 },
    { x: 10.5, y: 3.75, z: 12.7 }, { x: 7.5, y: BAL_Y, z: 12.7 },
    // Corridor → platform connectors and arch thresholds.
    { x: 22.5, y: 0, z: 19 }, { x: 22.5, y: 0, z: -19 }, { x: 22, y: 0, z: 6.5 }, { x: 22, y: 0, z: -6.5 },
    { x: -36, y: 0, z: 15 }, { x: -12, y: 0, z: 15 }, { x: 2, y: 0, z: 15 },
    { x: -28, y: 0, z: -15 }, { x: -12, y: 0, z: -15 }, { x: 6, y: 0, z: -15 },
  ];

  const lights: LightDef[] = [
    { x: -6, y: 9, z: 0, color: 0xffc48a, intensity: 75, distance: 36 },
    { x: -31, y: 5, z: -8, color: 0xffb877, intensity: 28, distance: 18 },
    { x: 31, y: 7.5, z: 0, color: 0x86aaff, intensity: 70, distance: 36 },
  ];

  return {
    bounds: { minX: -40, maxX: 40, minZ: -25, maxZ: 25 },
    boxes,
    ramps,
    pois,
    spawns,
    navRegions,
    navExtra,
    lights,
    glows,
    pools,
    shafts,
    doors,
  };
}
