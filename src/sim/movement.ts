// Kinematic character movement: acceleration toward the desired velocity,
// gravity/jumps, step-up/step-down on stairs, circle-vs-AABB collision.

import { CONFIG } from '../config';
import { moveTowardAngle, dirToYaw } from '../core/vec';
import type { CollisionWorld } from '../world/collision';
import type { Agent } from './types';

const M = CONFIG.movement;
const B = CONFIG.body;

export function bodyHeight(a: Agent): number {
  if (a.pose === 'sit') return B.sitHeight * a.appearance.scale;
  return (a.crouch ? B.crouchHeight : B.height) * a.appearance.scale;
}

export function eyeHeight(a: Agent): number {
  if (a.pose === 'sit') return (B.sitHeight - 0.15) * a.appearance.scale;
  return a.crouch ? B.crouchEyeHeight : B.eyeHeight * a.appearance.scale;
}

/** Returns true if the agent jumped this tick. */
export function stepMovement(a: Agent, col: CollisionWorld, dt: number, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
  if (!a.alive) {
    a.vx = a.vz = 0;
    a.speed = 0;
    return false;
  }
  if (a.pose === 'sit') {
    a.x = a.seatX;
    a.y = a.seatY;
    a.z = a.seatZ;
    a.vx = a.vz = a.vy = 0;
    a.speed = 0;
    if (!Number.isNaN(a.faceYaw)) a.yaw = moveTowardAngle(a.yaw, a.faceYaw, 6 * dt);
    return false;
  }

  // Accelerate toward desired velocity.
  const accel = (a.onGround ? M.groundAccel : M.airAccel) * dt * Math.max(1, a.maxSpeed);
  const dvx = a.wantX - a.vx, dvz = a.wantZ - a.vz;
  const dl = Math.hypot(dvx, dvz);
  if (dl <= accel) {
    a.vx = a.wantX;
    a.vz = a.wantZ;
  } else {
    a.vx += (dvx / dl) * accel;
    a.vz += (dvz / dl) * accel;
  }

  let jumped = false;
  if (a.wantJump && a.onGround && !a.crouch) {
    a.vy = M.jumpVelocity;
    a.onGround = false;
    jumped = true;
  }
  a.wantJump = false;

  if (!a.onGround) a.vy -= M.gravity * dt;

  const oldX = a.x, oldY = a.y, oldZ = a.z;
  a.x += a.vx * dt;
  a.z += a.vz * dt;
  a.y += a.vy * dt;

  const h = bodyHeight(a);
  col.resolveCircle(a, B.radius, h);

  // Ground handling.
  const g = col.groundHeight(a.x, a.z, Math.max(a.y, oldY));
  if (a.onGround) {
    if (g >= a.y - 0.4) {
      a.y = g;
      a.vy = 0;
    } else {
      a.onGround = false;
    }
  } else if (a.y <= g && a.vy <= 0) {
    a.y = g;
    a.vy = 0;
    a.onGround = true;
  }

  // Safety: bounds and NaN guard.
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)) {
    a.x = oldX;
    a.y = oldY;
    a.z = oldZ;
    a.vx = a.vy = a.vz = 0;
  }
  a.x = Math.min(bounds.maxX - B.radius, Math.max(bounds.minX + B.radius, a.x));
  a.z = Math.min(bounds.maxZ - B.radius, Math.max(bounds.minZ + B.radius, a.z));
  if (a.y < 0) a.y = 0;

  a.speed = Math.hypot(a.x - oldX, a.z - oldZ) / dt;
  a.animPhase += a.speed * dt * 2.7;
  if (a.animPhase > 1000) a.animPhase -= 1000;

  // AI agents face where they walk, or their requested facing when still.
  if (!a.isPlayer) {
    if (a.speed > 0.3 && Number.isNaN(a.faceYaw)) {
      a.yaw = moveTowardAngle(a.yaw, dirToYaw(a.vx, a.vz), 7 * dt);
    } else if (!Number.isNaN(a.faceYaw)) {
      a.yaw = moveTowardAngle(a.yaw, a.faceYaw, 7 * dt);
    }
  }
  return jumped;
}
