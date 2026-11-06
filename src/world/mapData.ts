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
  /** Collision only, never rendered. */
  | 'invisible';

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
  shape: 'box' | 'cyl';
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
    mat: MatId, collide = true, shape: 'box' | 'cyl' = 'box',
  ): void => {
    boxes.push({
      minX: Math.min(x0, x1), maxX: Math.max(x0, x1),
      minY: Math.min(y0, y1), maxY: Math.max(y0, y1),
      minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1),
      mat, collide, shape,
    });
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
  // Yellow safety lines along platform edges.
  for (const z of [14.8, 11.2, -11.2, -14.8]) {
    const inward = z === 14.8 || z === -11.2 ? 1 : -1;
    box(23, 40, 0, 0.012, z, z + 0.35 * inward, 'yellow', false);
  }

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
  // Skylight strips in the hall ceiling.
  for (const x of [-30, -15, 0, 14]) box(x - 3, x + 3, 13.9, 14, -9, 9, 'lamp', false);

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
  for (let z = -1.6; z <= 1.6; z += 1.6) poi('board', 17.6, z, faceYaw(1, 0));

  // ---------------------------------------------------------------- balcony + stairs
  const BAL_Y = 5;
  box(-20, 8, 4.6, BAL_Y, 9.5, 14.5, 'wood');
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
  for (const x of [-28, -16, 4, 14]) {
    cyl(x, -9.5, 0.6, 0, 14, 'stone');
    cyl(x, -9.5, 0.75, 0, 0.6, 'brass', false);
  }
  for (const x of [-28, 14]) {
    cyl(x, 7.6, 0.6, 0, 14, 'stone');
    cyl(x, 7.6, 0.75, 0, 0.6, 'brass', false);
  }

  // The great clock.
  box(-9.3, -6.7, 0, 0.9, -1.3, 1.3, 'stone');
  cyl(-8, 0, 0.45, 0.9, 4.4, 'brass');
  box(-9.1, -6.9, 4.4, 6.6, -1.1, 1.1, 'clock');
  box(-9.25, -6.75, 6.6, 6.85, -1.25, 1.25, 'brass', false);
  box(-9.25, -6.75, 4.2, 4.4, -1.25, 1.25, 'brass', false);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    poi('clock', -8 + dx * 2.2, dz * 2.2, faceYaw(-dx, -dz));
  }

  // Benches: seat + backrest, three seats each.
  const bench = (cx: number, cz: number, facing: 1 | -1): void => {
    // facing = direction (+z/-z) the sitter looks.
    const back = cz - facing * 0.28;
    box(cx - 1.2, cx + 1.2, 0, 0.46, cz - 0.28, cz + 0.28, 'wood');
    box(cx - 1.2, cx + 1.2, 0.46, 1.0, back - 0.06, back + 0.06, 'wood');
    box(cx - 1.25, cx - 1.15, 0, 0.7, cz - 0.3, cz + 0.3, 'brass', false);
    box(cx + 1.15, cx + 1.25, 0, 0.7, cz - 0.3, cz + 0.3, 'brass', false);
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
    box(x - 0.9, x + 0.9, 1.1, 2.4, -12.62, -12.58, 'glass', false);
    poi('kiosk', x, -11.7, faceYaw(0, -1));
  }
  box(-24, -14, 2.6, 3.1, -12.6, -12.5, 'lamp', false);

  // Newsstand.
  box(-36, -32.5, 0, 2.5, 4.6, 6.6, 'shop');
  box(-36.2, -32.3, 2.5, 2.7, 4.4, 6.8, 'woodDark', false);
  poi('news', -34.2, 3.8, faceYaw(0, 1));
  poi('news', -32.9, 3.9, faceYaw(0, 1));

  // Café corner (SW).
  box(-40, -38.8, 0, 1.1, -13, -4.5, 'wood');
  box(-40, -39.6, 1.1, 2.6, -13, -4.5, 'shop', false);
  box(-40, -38.6, 2.8, 3.1, -13.2, -4.3, 'brass', false);
  poi('cafe', -38.1, -7, faceYaw(-1, 0));
  poi('cafe', -38.1, -10, faceYaw(-1, 0));
  const table = (tx: number, tz: number): void => {
    cyl(tx, tz, 0.45, 0, 0.76, 'woodDark');
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
  box(-38, -32, 0.75, 1.2, -2.5, -2.1, 'plant', false);
  box(-26.6, -26, 0, 0.75, -13, -8.5, 'wallLow');
  box(-26.5, -26.1, 0.75, 1.2, -13, -8.5, 'plant', false);

  // Hanging lamps (render only).
  for (const [x, z] of [[-30, -6], [-20, 0], [-8, -6], [4, 0], [14, -4], [-30, 6]] as [number, number][]) {
    box(x - 0.03, x + 0.03, 8.5, 14, z - 0.03, z + 0.03, 'metal', false);
    cyl(x, z, 0.55, 8.1, 8.5, 'lamp', false);
    cyl(x, z, 0.7, 8.45, 8.6, 'brass', false);
  }
  // Wall sconces along the corridors.
  for (let x = -36; x <= 18; x += 9) {
    for (const z of [15.6, -15.6, 24.9, -24.9]) {
      const s = z > 0 ? (z > 20 ? -1 : 1) : z < -20 ? 1 : -1;
      box(x - 0.2, x + 0.2, 3.3, 3.8, z, z + s * 0.2, 'lamp', false);
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
  const shopRow = (zWall: number, s: 1 | -1): void => {
    // s = direction from wall toward corridor centre.
    for (let x = -37; x <= 15; x += 8.6) {
      const counterZ = zWall + s * 1.9;
      box(x, x + 5.6, 0, 1.0, counterZ - 0.35, counterZ + 0.35, 'wood');
      box(x, x + 5.6, 0, 2.6, zWall, zWall + s * 0.9, 'shop');
      box(x - 0.2, x + 5.8, 3.2, 3.9, zWall + s * 0.05, zWall + s * 0.25, 'lamp', false);
      box(x - 0.3, x + 5.9, 2.6, 3.0, zWall, zWall + s * 2.4, 'woodDark', false); // awning
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
  const train = (z0: number, z1: number): void => {
    for (const [x0, x1] of [[23, 31], [31.25, 39.8]] as [number, number][]) {
      box(x0, x1, 0.3, 4.0, z0, z1, 'train');
      box(x0 + 0.1, x1 - 0.1, 4.0, 4.35, z0 + 0.15, z1 - 0.15, 'trainDark', false);
      box(x0, x1, 0, 0.3, z0 + 0.4, z1 - 0.4, 'trainDark', false);
      // Windows on both long sides.
      for (let wx = x0 + 0.8; wx < x1 - 1.2; wx += 1.9) {
        box(wx, wx + 1.3, 2.0, 2.9, z0 - 0.03, z0, 'glass', false);
        box(wx, wx + 1.3, 2.0, 2.9, z1, z1 + 0.03, 'glass', false);
      }
      box(x0, x1, 1.2, 1.32, z0 - 0.03, z0, 'brass', false);
      box(x0, x1, 1.2, 1.32, z1, z1 + 0.03, 'brass', false);
    }
    box(31, 31.25, 0.4, 3.6, z0 + 0.6, z1 - 0.6, 'trainDark'); // coupling
    box(22.2, 23, 0, 1.2, z0 - 0.1, z1 + 0.1, 'metal'); // buffer stop
  };
  train(11.3, 14.7);
  train(-14.7, -11.3);
  // Canopy columns + lamp posts.
  for (const x of [27, 35]) {
    for (const z of [0, 20, -20]) {
      cyl(x, z, 0.3, 0, 9, 'metal');
      box(x - 0.6, x + 0.6, 4.2, 4.5, z - 0.12, z + 0.12, 'lampBlue', false);
    }
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
  // Hanging platform signs.
  for (const z of [13, -13]) box(24.5, 26.5, 6, 6.8, z - 0.05, z + 0.05, 'board', false);
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
  };
}
