// Train car layout shared by the simulation (interior collision, seats, doors)
// and the renderer (the visible shell). Everything is in train-local space:
// x runs from the train's front (0) toward its rear, z is the world z of the
// track. No Three.js here.

import { CONFIG } from '../config';
import type { Box, MatId, Shape } from './mapData';

const T = CONFIG.trains;

/** Interior floor height: one step up from the platform (below the step height). */
export const CAR_FLOOR_Y = 0.42;
/** Interior ceiling. */
export const CAR_CEIL_Y = 2.72;
/** Body bottom and top (the roof sits on top). */
export const CAR_BODY_Y0 = 0.5;
export const CAR_BODY_Y1 = 3.25;
/** Window band: low enough to see the platform while seated. */
export const CAR_WIN_Y0 = 1.3;
export const CAR_WIN_Y1 = 2.2;
export const CAR_DOOR_HALF = 0.62;
export const CAR_DOOR_TOP = 2.92;
/** Side wall: outer skin + inner lining. */
const SKIN = 0.05;
const LINING = 0.04;
const BENCH_DEPTH = 0.5;
const BENCH_TOP = CAR_FLOOR_Y + 0.46;
const SEAT_PITCH = 0.78;
/** Offset that keeps trim from sharing a plane with the surface behind it. */
const PROUD = 0.004;

export interface TrainDoor {
  /** Train-local x of the door centre. */
  x: number;
  /** World z of the car side the door is in. */
  z: number;
  /** Outward direction in z (-1 toward z0, +1 toward z1). */
  side: 1 | -1;
}

export interface TrainSeat {
  x: number;
  y: number;
  z: number;
  /** Where the sitter stands up to. */
  standZ: number;
  yaw: number;
}

export interface CarLayout {
  /** Collision boxes (train-local x), without the doorways. */
  collide: Box[];
  /** The doorways: solid only while the doors are closed. */
  doorCollide: Box[];
  /** Sight and bullet blockers: the shell with window holes (doorways separate). */
  ray: Box[];
  /** Doorway panels for rays, blocking only while the doors are closed. */
  doorRay: Box[];
  /** Per car: train-local AABB of the whole car (broad phase for rays). */
  carBounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }[];
  /** Render boxes (train-local x), not including door leaves. */
  visual: Box[];
  doors: TrainDoor[];
  seats: TrainSeat[];
  /** Side faces of the car bodies. */
  a: number;
  b: number;
}

export function carDoorXs(c: number): [number, number] {
  const x0 = c * (T.carLength + T.carGap);
  return [x0 + 1.9, x0 + T.carLength - 1.9];
}

function windowXs(x0: number, x1: number): number[] {
  const out: number[] = [];
  for (let wx = x0 + 3.3; wx + 1.2 < x1 - 3.1; wx += 1.45) out.push(wx);
  return out;
}

/** Facing yaw for a direction (same convention as core/vec dirToYaw: forward is -z at yaw 0). */
function faceZ(dir: number): number {
  return dir > 0 ? Math.PI : 0;
}

export function buildTrainLayout(z0: number, z1: number, railY: number): CarLayout {
  const collide: Box[] = [];
  const doorCollide: Box[] = [];
  const ray: Box[] = [];
  const doorRay: Box[] = [];
  const carBounds: CarLayout['carBounds'] = [];
  const visual: Box[] = [];
  const mk = (x0: number, x1: number, y0: number, y1: number, za: number, zb: number): Box => ({
    minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1), minZ: Math.min(za, zb), maxZ: Math.max(za, zb), mat: 'invisible', collide: true, shape: 'box',
  });
  const rbox = (x0: number, x1: number, y0: number, y1: number, za: number, zb: number): void => { ray.push(mk(x0, x1, y0, y1, za, zb)); };
  const doors: TrainDoor[] = [];
  const seats: TrainSeat[] = [];
  const vbox = (x0: number, x1: number, y0: number, y1: number, za: number, zb: number, mat: MatId, shape: Shape = 'box'): void => {
    visual.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1), minZ: Math.min(za, zb), maxZ: Math.max(za, zb), mat, collide: false, shape });
  };
  const cbox = (x0: number, x1: number, y0: number, y1: number, za: number, zb: number): void => {
    collide.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1), minZ: Math.min(za, zb), maxZ: Math.max(za, zb), mat: 'invisible', collide: true, shape: 'box' });
  };
  const a = z0 + 0.06, b = z1 - 0.06, zc = (z0 + z1) / 2;
  const L = T.carLength;

  for (let c = 0; c < T.cars; c++) {
    const x0 = c * (L + T.carGap), x1 = x0 + L;
    const [dA, dB] = carDoorXs(c);
    carBounds.push({ minX: x0, maxX: x1, minY: 0.05, maxY: 4.1, minZ: a, maxZ: b });
    // Rays: floor and underframe, roof, end walls.
    rbox(x0, x1, 0.05, CAR_FLOOR_Y, a, b);
    rbox(x0, x1, CAR_CEIL_Y, 4.05, a, b);
    rbox(x0, x0 + SKIN + LINING, CAR_FLOOR_Y, CAR_CEIL_Y, a, b);
    rbox(x1 - SKIN - LINING, x1, CAR_FLOOR_Y, CAR_CEIL_Y, a, b);
    const wins = windowXs(x0, x1);
    /** Linings stop at the end walls instead of running flush to the car ends. */
    const lx = (v: number): number => Math.min(x1 - SKIN, Math.max(x0 + SKIN, v));

    // Floor, ceiling, underframe.
    vbox(x0, x1, 0.3, CAR_FLOOR_Y, a, b, 'woodDark');
    cbox(x0, x1, 0.3, CAR_FLOOR_Y, a, b);
    vbox(x0 + 0.06, x1 - 0.06, CAR_CEIL_Y, CAR_CEIL_Y + 0.04, a + 0.05, b - 0.05, 'trainCream');
    vbox(x0 + 0.1, x1 - 0.1, 0.05, 0.3, a + 0.15, b - 0.15, 'trainDark');
    // Ceiling light strip.
    vbox(x0 + 1.2, x1 - 1.2, CAR_CEIL_Y - 0.03, CAR_CEIL_Y, zc - 0.12, zc + 0.12, 'lamp');

    // Side walls with door gaps and window holes.
    for (const [zf, d] of [[a, -1], [b, 1]] as [number, number][]) {
      const skin0 = zf, skin1 = zf - d * SKIN, lin1 = skin1 - d * LINING;
      const solid = [[x0, dA - CAR_DOOR_HALF], [dA + CAR_DOOR_HALF, dB - CAR_DOOR_HALF], [dB + CAR_DOOR_HALF, x1]];
      for (const [s0, s1] of solid) {
        // Below and above the windows, the full run.
        vbox(s0, s1, CAR_BODY_Y0, CAR_WIN_Y0, skin0, skin1, 'trainBody');
        vbox(s0, s1, CAR_WIN_Y1, CAR_BODY_Y1, skin0, skin1, 'trainBody');
        vbox(lx(s0), lx(s1), CAR_FLOOR_Y, CAR_WIN_Y0, skin1, lin1, 'wood');
        vbox(lx(s0), lx(s1), CAR_WIN_Y1, CAR_CEIL_Y, skin1, lin1, 'trainCream');
        // Piers between windows.
        let px = s0;
        for (const wx of wins) {
          if (wx < s0 || wx + 1.2 > s1) continue;
          if (wx > px) {
            vbox(px, wx, CAR_WIN_Y0, CAR_WIN_Y1, skin0, skin1, 'trainBody');
            vbox(lx(px), lx(wx), CAR_WIN_Y0, CAR_WIN_Y1, skin1, lin1, 'trainCream');
          }
          // Window frame: sill and head in rubber, a few mm proud of every surface they
          // meet (coplanar faces would z-fight and flicker).
          vbox(wx - 0.03, wx + 1.23, CAR_WIN_Y0 - 0.04, CAR_WIN_Y0 + PROUD, zf + d * 0.01, lin1 - d * PROUD, 'rubber');
          vbox(wx - 0.03, wx + 1.23, CAR_WIN_Y1 - PROUD, CAR_WIN_Y1 + 0.04, zf + d * 0.01, lin1 - d * PROUD, 'rubber');
          px = wx + 1.2;
        }
        if (px < s1) {
          vbox(px, s1, CAR_WIN_Y0, CAR_WIN_Y1, skin0, skin1, 'trainBody');
          vbox(lx(px), lx(s1), CAR_WIN_Y0, CAR_WIN_Y1, skin1, lin1, 'trainCream');
        }
        cbox(s0, s1, CAR_FLOOR_Y, CAR_CEIL_Y, skin0, lin1);
        // Rays: below and above the windows, and the piers; the window holes stay open.
        rbox(s0, s1, CAR_BODY_Y0, CAR_WIN_Y0, skin0, lin1);
        rbox(s0, s1, CAR_WIN_Y1, CAR_BODY_Y1, skin0, lin1);
        let rx = s0;
        for (const wx of wins) {
          if (wx < s0 || wx + 1.2 > s1) continue;
          if (wx > rx) rbox(rx, wx, CAR_WIN_Y0, CAR_WIN_Y1, skin0, lin1);
          rx = wx + 1.2;
        }
        if (rx < s1) rbox(rx, s1, CAR_WIN_Y0, CAR_WIN_Y1, skin0, lin1);
      }
      // Livery: cream band above the windows and a brass line.
      vbox(x0 + PROUD, x1 - PROUD, CAR_WIN_Y1 + 0.1, CAR_WIN_Y1 + 0.26, zf + d * 0.012, zf - d * 0.01, 'trainCream');
      vbox(x0 + PROUD, x1 - PROUD, CAR_WIN_Y0 - 0.12, CAR_WIN_Y0 - 0.09, zf + d * 0.03, zf - d * 0.01, 'brass');
      // Over the doors; the doorways themselves are solid for collision (the leaves),
      // so people only board and alight through the G action.
      for (const dx of [dA, dB]) {
        vbox(dx - CAR_DOOR_HALF, dx + CAR_DOOR_HALF, CAR_DOOR_TOP, CAR_BODY_Y1, skin0, skin1, 'trainBody');
        vbox(dx - CAR_DOOR_HALF, dx + CAR_DOOR_HALF, CAR_DOOR_TOP, CAR_CEIL_Y + 0.2, skin1, lin1, 'trainCream');
        vbox(dx - CAR_DOOR_HALF - 0.08, dx - CAR_DOOR_HALF + PROUD, CAR_BODY_Y0 + 0.02, CAR_DOOR_TOP, zf + d * 0.02, lin1 - d * PROUD, 'rubber');
        vbox(dx + CAR_DOOR_HALF - PROUD, dx + CAR_DOOR_HALF + 0.08, CAR_BODY_Y0 + 0.02, CAR_DOOR_TOP, zf + d * 0.02, lin1 - d * PROUD, 'rubber');
        doorCollide.push(mk(dx - CAR_DOOR_HALF, dx + CAR_DOOR_HALF, 0, CAR_CEIL_Y, skin0, lin1));
        rbox(dx - CAR_DOOR_HALF, dx + CAR_DOOR_HALF, CAR_DOOR_TOP, CAR_BODY_Y1, skin0, lin1);
        doorRay.push(mk(dx - CAR_DOOR_HALF, dx + CAR_DOOR_HALF, CAR_BODY_Y0, CAR_DOOR_TOP, skin0, lin1));
        doors.push({ x: dx, z: zf, side: d as 1 | -1 });
      }

      // Longitudinal bench between the doors, with a backrest under the windows.
      const bz0 = lin1, bz1 = lin1 - d * BENCH_DEPTH;
      const bx0 = dA + CAR_DOOR_HALF + 0.35, bx1 = dB - CAR_DOOR_HALF - 0.35;
      vbox(bx0, bx1, CAR_FLOOR_Y, BENCH_TOP - 0.08, bz0, bz1, 'trainDark');
      vbox(bx0, bx1, BENCH_TOP - 0.08, BENCH_TOP, bz0, bz1, 'leather');
      vbox(bx0, bx1, BENCH_TOP, CAR_WIN_Y0 - 0.05, bz0, bz0 - d * 0.1, 'leather');
      cbox(bx0, bx1, CAR_FLOOR_Y, BENCH_TOP + 0.02, bz0, bz1);
      const n = Math.floor((bx1 - bx0) / SEAT_PITCH);
      const off = (bx1 - bx0 - n * SEAT_PITCH) / 2 + SEAT_PITCH / 2;
      for (let i = 0; i < n; i++) {
        seats.push({ x: bx0 + off + i * SEAT_PITCH, y: CAR_FLOOR_Y, z: lin1 - d * (BENCH_DEPTH * 0.45), standZ: bz1 - d * 0.35, yaw: faceZ(-d) });
      }
      // Grab poles at the bench ends.
      for (const gx of [bx0 - 0.15, bx1 + 0.15]) vbox(gx - 0.025, gx + 0.025, CAR_FLOOR_Y, CAR_CEIL_Y, bz1 - d * 0.05, bz1 - d * 0.1, 'chrome', 'cyl');
    }

    // End walls (the gangway is closed off), set between the side skins and linings
    // so no faces are shared.
    for (const [xe, inward] of [[x0, 1], [x1, -1]] as [number, number][]) {
      vbox(xe, xe + inward * SKIN, CAR_BODY_Y0 + PROUD, CAR_BODY_Y1 - PROUD, a + SKIN, b - SKIN, 'trainBody');
      vbox(xe + inward * SKIN, xe + inward * (SKIN + LINING), CAR_FLOOR_Y + PROUD, CAR_CEIL_Y - PROUD, a + SKIN + LINING, b - SKIN - LINING, 'wood');
      cbox(xe, xe + inward * (SKIN + LINING), CAR_FLOOR_Y, CAR_CEIL_Y, a, b);
    }

    // Roof.
    vbox(x0 + 0.05, x1 - 0.05, 2.75, 4.05, a + 0.05, b - 0.05, 'trainRoof', 'cylX');
    for (let vx = x0 + 1.6; vx < x1 - 1; vx += 2.8) vbox(vx, vx + 0.9, 3.95, 4.15, zc - 0.4, zc + 0.4, 'trainRoof');
    if (c === 1) {
      vbox(x0 + 5, x0 + 6.4, 4.05, 4.2, zc - 0.7, zc + 0.7, 'metal');
      vbox(x0 + 5.6, x0 + 5.68, 4.2, 5.0, zc - 0.03, zc + 0.03, 'metal');
      vbox(x0 + 5.1, x0 + 6.3, 5.0, 5.05, zc - 0.9, zc + 0.9, 'chrome');
    }
    // Bogies with wheels sitting on the rails.
    for (const bx of [x0 + 2.6, x1 - 2.6]) {
      vbox(bx - 1.4, bx + 1.4, railY + 0.25, 0.1, zc - 1.15, zc + 1.15, 'trainDark');
      for (const wx of [bx - 0.9, bx + 0.9]) {
        for (const wz of [zc - 0.72, zc + 0.72]) vbox(wx - 0.45, wx + 0.45, railY + 0.02, railY + 0.92, wz - 0.07, wz + 0.07, 'rubber', 'cylZ');
      }
    }
    // Gangway to the next car.
    if (c < T.cars - 1) vbox(x1 - 0.02, x1 + T.carGap + 0.02, 0.6, 3.3, zc - 1.1, zc + 1.1, 'trainDark');
  }

  // Driving cabs at both ends (trains leave the terminus the way they came).
  const total = (T.cars - 1) * (L + T.carGap) + L;
  for (const [xf, dir] of [[0, -1], [total, 1]] as [number, number][]) {
    const out = (d: number): number => xf + dir * d;
    vbox(out(0), out(0.18), 0.5, 3.25, a + 0.2, b - 0.2, 'trainBody');
    vbox(out(0.18), out(0.22), 2.05, 2.95, a + 0.45, b - 0.45, 'glass');
    vbox(out(0.18), out(0.22), 3.05, 3.3, a + 0.8, b - 0.8, 'led');
    vbox(out(0.17), out(0.2), 1.72, 1.9, a + 0.19, b - 0.19, 'trainCream');
    vbox(out(0.18), out(0.25), 0.5, 0.75, a + 0.3, b - 0.3, 'yellow');
    for (const hz of [a + 0.55, b - 0.55]) vbox(out(0.12), out(0.28), 0.96, 1.24, hz - 0.14, hz + 0.14, 'bulb', 'sph');
  }
  return { collide, doorCollide, ray, doorRay, carBounds, visual, doors, seats, a, b };
}
