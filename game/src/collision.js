// Collision and line queries against the map's axis-aligned colliders. Plain numbers, no three,
// no allocation per query: the hot loops of movement, sight and gunfire all call in here.
import { COLLIDERS, BOUNDS } from './map.js';

const EPS = 0.0001;

// Does a body (a vertical rounded box) overlap any collider? `lift` ignores that much of the
// body's top and bottom, so standing on a floor is not read as being inside it.
export function overlapsBody(x, y, z, radius, height, lift = 0) {
  const minX = x - radius;
  const maxX = x + radius;
  const minZ = z - radius;
  const maxZ = z + radius;
  const minY = y + lift;
  const maxY = y + height - lift;
  for (let index = 0; index < COLLIDERS.length; index += 1) {
    const c = COLLIDERS[index];
    if (maxX > c.minX && minX < c.maxX && maxY > c.minY && minY < c.maxY && maxZ > c.minZ && minZ < c.maxZ) return c;
  }
  return null;
}

export function insideBounds(x, z) {
  return x > BOUNDS.minX + 0.6 && x < BOUNDS.maxX - 0.6 && z > BOUNDS.minZ + 0.6 && z < BOUNDS.maxZ - 0.6;
}

// One ray against the world, including the floor. Fills `out` with the distance, the axis that
// was crossed (0 x, 1 y, 2 z) and the sign of the face normal, then returns out.t (Infinity when
// nothing is hit within range).
export function rayWorld(ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = maxDist;
  let axis = -1;
  let sign = 0;
  const invX = 1 / (dx || EPS);
  const invY = 1 / (dy || EPS);
  const invZ = 1 / (dz || EPS);

  if (dy < 0 && oy > 0) {
    const tFloor = -oy / dy;
    if (tFloor > 0.02 && tFloor < best) {
      best = tFloor;
      axis = 1;
      sign = 1;
    }
  }

  for (let index = 0; index < COLLIDERS.length; index += 1) {
    const c = COLLIDERS[index];
    let tmin = -Infinity;
    let tmax = Infinity;
    let hitAxis = -1;
    let hitSign = 0;

    if (Math.abs(dx) < EPS) {
      if (ox < c.minX || ox > c.maxX) continue;
    } else {
      let t1 = (c.minX - ox) * invX;
      let t2 = (c.maxX - ox) * invX;
      let s = -1;
      if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; s = 1; }
      if (t1 > tmin) { tmin = t1; hitAxis = 0; hitSign = s; }
      if (t2 < tmax) tmax = t2;
    }
    if (Math.abs(dy) < EPS) {
      if (oy < c.minY || oy > c.maxY) continue;
    } else {
      let t1 = (c.minY - oy) * invY;
      let t2 = (c.maxY - oy) * invY;
      let s = -1;
      if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; s = 1; }
      if (t1 > tmin) { tmin = t1; hitAxis = 1; hitSign = s; }
      if (t2 < tmax) tmax = t2;
    }
    if (Math.abs(dz) < EPS) {
      if (oz < c.minZ || oz > c.maxZ) continue;
    } else {
      let t1 = (c.minZ - oz) * invZ;
      let t2 = (c.maxZ - oz) * invZ;
      let s = -1;
      if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; s = 1; }
      if (t1 > tmin) { tmin = t1; hitAxis = 2; hitSign = s; }
      if (t2 < tmax) tmax = t2;
    }

    if (tmin <= tmax && tmin > 0.02 && tmin < best) {
      best = tmin;
      axis = hitAxis;
      sign = hitSign;
    }
  }

  out.t = axis === -1 ? Infinity : best;
  out.axis = axis;
  out.sign = sign;
  return out.t;
}

// Is the straight segment from a to b broken by the world?
export function segmentBlocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.001) return false;
  const out = { t: Infinity, axis: -1, sign: 0 };
  rayWorld(ax, ay, az, dx / length, dy / length, dz / length, length, out);
  return out.t < length - 0.08;
}

// Ray against a sphere, the test a head hitbox needs. Returns the near hit distance or Infinity.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const projected = lx * dx + ly * dy + lz * dz;
  if (projected < 0) return Infinity;
  const distanceSq = lx * lx + ly * ly + lz * lz - projected * projected;
  const radiusSq = radius * radius;
  if (distanceSq > radiusSq) return Infinity;
  const near = projected - Math.sqrt(radiusSq - distanceSq);
  return near > 0 ? near : Infinity;
}

// Slab test for a body's axis-aligned hitbox. Returns the near hit distance or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let near = 0;
  let far = Infinity;
  if (Math.abs(dx) < EPS) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
    if (t1 > near) near = t1;
    if (t2 < far) far = t2;
  }
  if (Math.abs(dy) < EPS) {
    if (oy < minY || oy > maxY) return Infinity;
  } else {
    let t1 = (minY - oy) / dy;
    let t2 = (maxY - oy) / dy;
    if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
    if (t1 > near) near = t1;
    if (t2 < far) far = t2;
  }
  if (Math.abs(dz) < EPS) {
    if (oz < minZ || oz > maxZ) return Infinity;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
    if (t1 > near) near = t1;
    if (t2 < far) far = t2;
  }
  if (near > far || far < 0) return Infinity;
  return near > 0 ? near : Infinity;
}
