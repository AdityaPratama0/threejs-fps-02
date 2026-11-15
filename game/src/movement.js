// One movement model for the player and the bots: acceleration toward a wish direction,
// ground friction, gravity, jump, crouch, and axis-by-axis collision so a wall never swallows a
// body. Callers pass a wish vector, not keys, so bots and input share the same physics.
import { MOVE } from './config.js';
import { overlapsBody, insideBounds } from './collision.js';

export function createBody() {
  return {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    onGround: true,
    crouch: false,
    height: MOVE.standHeight,
    eye: MOVE.standEye,
  };
}

export function placeBody(body, x, z) {
  body.pos.x = x;
  body.pos.y = 0;
  body.pos.z = z;
  body.vel.x = 0;
  body.vel.y = 0;
  body.vel.z = 0;
  body.onGround = true;
}

// wishX / wishZ are a unit (or zero) desired direction in world space. `jump` is a button press.
export function stepBody(body, dt, wishX, wishZ, wishLength, crouchWanted, jump) {
  const canStand = !overlapsBody(body.pos.x, body.pos.y, body.pos.z, MOVE.radius, MOVE.standHeight, 0.04);
  body.crouch = crouchWanted || (body.crouch && !canStand);
  body.height = body.crouch ? MOVE.crouchHeight : MOVE.standHeight;
  const eyeTarget = body.crouch ? MOVE.crouchEye : MOVE.standEye;
  body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 14);

  const maxSpeed = body.crouch ? MOVE.crouchSpeed : MOVE.speed;
  const accel = body.onGround ? MOVE.accelGround : MOVE.accelAir;
  const targetX = wishX * maxSpeed;
  const targetZ = wishZ * maxSpeed;
  const blend = Math.min(1, (accel * dt) / Math.max(0.6, maxSpeed));
  body.vel.x += (targetX - body.vel.x) * blend;
  body.vel.z += (targetZ - body.vel.z) * blend;

  if (body.onGround && wishLength < 0.01) {
    const damp = Math.max(0, 1 - MOVE.friction * dt);
    body.vel.x *= damp;
    body.vel.z *= damp;
  }

  if (jump && body.onGround) {
    body.vel.y = MOVE.jump;
    body.onGround = false;
  }
  body.vel.y = Math.max(-32, body.vel.y - MOVE.gravity * dt);

  const nextX = body.pos.x + body.vel.x * dt;
  if (insideBounds(nextX, body.pos.z) && !overlapsBody(nextX, body.pos.y, body.pos.z, MOVE.radius, body.height, 0.04)) {
    body.pos.x = nextX;
  } else {
    body.vel.x = 0;
  }

  const nextZ = body.pos.z + body.vel.z * dt;
  if (insideBounds(body.pos.x, nextZ) && !overlapsBody(body.pos.x, body.pos.y, nextZ, MOVE.radius, body.height, 0.04)) {
    body.pos.z = nextZ;
  } else {
    body.vel.z = 0;
  }

  body.pos.y += body.vel.y * dt;
  body.onGround = false;
  const hit = overlapsBody(body.pos.x, body.pos.y, body.pos.z, MOVE.radius, body.height, 0);
  if (hit && body.vel.y <= 0) {
    body.pos.y = hit.maxY;
    body.vel.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.pos.y = hit.minY - body.height;
    body.vel.y = 0;
  }
  if (body.pos.y < 0) {
    body.pos.y = 0;
    body.vel.y = 0;
    body.onGround = true;
  }

  return body;
}
