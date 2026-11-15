// Gunfire: one hitscan path for the player and the bots. Spread and recoil grow with movement
// and jumping, shots are tested against head, torso and legs, and a wall always stops them.
import { MOVE, WEAPONS } from './config.js';
import { currentGun, currentSpec, eyeY, headCentre, torsoBox, legBox } from './agents.js';
import { rayWorld, raySphere, rayBox } from './collision.js';
import { state, emit, addKillfeed } from './store.js';

const probe = { t: Infinity, axis: -1, sign: 0 };
const head = { x: 0, y: 0, z: 0, r: 0 };
const torso = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
const legs = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

export const shotInfo = {
  hit: false,
  wall: false,
  part: '',
  target: null,
  x: 0,
  y: 0,
  z: 0,
  damage: 0,
  killed: false,
};

export function horizontalSpeed(agent) {
  return Math.hypot(agent.body.vel.x, agent.body.vel.z);
}

export function fireInterval(spec) {
  return 60 / spec.rpm;
}

export function startReload(agent) {
  const gun = currentGun(agent);
  const spec = currentSpec(agent);
  if (gun === null || spec === null || agent.reloadLeft > 0) return false;
  if (gun.mag >= spec.mag || gun.reserve <= 0) return false;
  agent.reloadLeft = spec.reload;
  agent.reloadTotal = spec.reload;
  emit('reload', agent);
  return true;
}

export function finishReload(agent) {
  const gun = currentGun(agent);
  const spec = currentSpec(agent);
  if (gun === null || spec === null) return;
  const need = spec.mag - gun.mag;
  const take = Math.min(need, gun.reserve);
  gun.mag += take;
  gun.reserve -= take;
}

export function stepWeapon(agent, dt) {
  agent.cooldown = Math.max(0, agent.cooldown - dt);
  agent.bloom = Math.max(0, agent.bloom - dt * 0.16);
  agent.recoilPitch *= Math.max(0, 1 - dt * 7);
  agent.recoilYaw *= Math.max(0, 1 - dt * 7);
  if (agent.reloadLeft > 0) {
    agent.reloadLeft -= dt;
    if (agent.reloadLeft <= 0) {
      agent.reloadLeft = 0;
      finishReload(agent);
      emit('reloaded', agent);
    }
  }
}

// The damage a hit does, before armour. Head shots use the weapon's multiplier, legs take less.
export function damageFor(spec, part) {
  if (part === 'head') return spec.damage * spec.headScale;
  if (part === 'legs') return spec.damage * spec.legScale;
  return spec.damage;
}

export function applyDamage(target, amount, part, attacker) {
  if (!target.alive || target.team === attacker.team) return false;
  let left = amount;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, left * 0.5);
    target.armor -= absorbed;
    left -= absorbed;
  }
  target.health -= left;
  emit('hurt', target, attacker, part);
  if (target.health <= 0) {
    target.health = 0;
    target.alive = false;
    target.deaths += 1;
    target.fall = 0;
    attacker.kills += 1;
    addKillfeed({
      killer: attacker.name,
      victim: target.name,
      part,
      killerTeam: attacker.team,
    });
    emit('death', target, attacker, part);
    if (!target.isPlayer && !attacker.isPlayer) {
      attacker.money = Math.min(9000, attacker.money + (currentSpec(attacker)?.reward ?? 300));
    }
    return true;
  }
  return false;
}

function nearestPart(agent, ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  let part = '';
  const h = headCentre(agent);
  head.x = h.x;
  head.y = h.y;
  head.z = h.z;
  head.r = h.r;
  const tHead = raySphere(ox, oy, oz, dx, dy, dz, head.x, head.y, head.z, head.r);
  if (tHead < best) {
    best = tHead;
    part = 'head';
  }
  const box = torsoBox(agent);
  torso.minX = box.minX;
  torso.maxX = box.maxX;
  torso.minY = box.minY;
  torso.maxY = box.maxY;
  torso.minZ = box.minZ;
  torso.maxZ = box.maxZ;
  const tTorso = rayBox(ox, oy, oz, dx, dy, dz, torso.minX, torso.minY, torso.minZ, torso.maxX, torso.maxY, torso.maxZ);
  if (tTorso < best) {
    best = tTorso;
    part = 'torso';
  }
  const low = legBox(agent);
  legs.minX = low.minX;
  legs.maxX = low.maxX;
  legs.minY = low.minY;
  legs.maxY = low.maxY;
  legs.minZ = low.minZ;
  legs.maxZ = low.maxZ;
  const tLegs = rayBox(ox, oy, oz, dx, dy, dz, legs.minX, legs.minY, legs.minZ, legs.maxX, legs.maxY, legs.maxZ);
  if (tLegs < best) {
    best = tLegs;
    part = 'legs';
  }
  return { t: best, part };
}

// One round down the barrel. Returns the shot record, or null when the trigger is not ready.
export function tryFire(agent, rng, spreadScale = 1) {
  const gun = currentGun(agent);
  const spec = currentSpec(agent);
  if (gun === null || spec === null) return null;
  if (agent.cooldown > 0 || agent.reloadLeft > 0 || gun.mag <= 0) return null;

  gun.mag -= 1;
  agent.cooldown = fireInterval(spec);
  agent.lastShotAt = state.time;

  const speed = horizontalSpeed(agent);
  const bloom = agent.bloom;
  const spread = (spec.spread + spec.moveSpread * Math.min(1, speed / MOVE.speed) + bloom + (agent.body.onGround ? 0 : 0.09)) * spreadScale;
  const yaw = agent.yaw + agent.recoilYaw + (rng() - 0.5) * spread * 2;
  const pitch = Math.max(-1.5, Math.min(1.5, agent.pitch + agent.recoilPitch + (rng() - 0.5) * spread * 2));
  if (spec.pellets === 1) {
    agent.bloom = Math.min(0.09, bloom + spec.recoil * 2.4);
    agent.recoilPitch += spec.recoil * (0.7 + rng() * 0.6);
    agent.recoilYaw += (rng() - 0.5) * spec.recoil * 1.4;
  }

  const ox = agent.body.pos.x;
  const oy = eyeY(agent);
  const oz = agent.body.pos.z;
  const cosPitch = Math.cos(pitch);
  let dirX = -Math.sin(yaw) * cosPitch;
  let dirY = Math.sin(pitch);
  let dirZ = -Math.cos(yaw) * cosPitch;

  shotInfo.hit = false;
  shotInfo.wall = false;
  shotInfo.part = '';
  shotInfo.target = null;
  shotInfo.damage = 0;
  shotInfo.killed = false;
  shotInfo.x = ox + dirX * spec.range;
  shotInfo.y = oy + dirY * spec.range;
  shotInfo.z = oz + dirZ * spec.range;

  const pellets = Math.max(1, spec.pellets);
  for (let pellet = 0; pellet < pellets; pellet += 1) {
    if (pellet > 0) {
      const jitterYaw = (rng() - 0.5) * spread * 2;
      const jitterPitch = (rng() - 0.5) * spread * 2;
      const py = yaw + jitterYaw;
      const pp = Math.max(-1.5, Math.min(1.5, pitch + jitterPitch));
      const cp = Math.cos(pp);
      dirX = -Math.sin(py) * cp;
      dirY = Math.sin(pp);
      dirZ = -Math.cos(py) * cp;
    }

    rayWorld(ox, oy, oz, dirX, dirY, dirZ, spec.range, probe);
    let bestT = Math.min(probe.t, spec.range);
    let part = '';
    let victim = null;

    for (const other of state.agents) {
      if (other === agent || !other.alive || other.team === agent.team) continue;
      const hit = nearestPart(other, ox, oy, oz, dirX, dirY, dirZ, bestT);
      if (hit.part !== '' && hit.t < bestT) {
        bestT = hit.t;
        part = hit.part;
        victim = other;
      }
    }

    const endX = ox + dirX * bestT;
    const endY = oy + dirY * bestT;
    const endZ = oz + dirZ * bestT;

    if (victim !== null) {
      const amount = damageFor(spec, part);
      shotInfo.hit = true;
      shotInfo.target = victim;
      shotInfo.part = part;
      shotInfo.damage = amount;
      shotInfo.x = endX;
      shotInfo.y = endY;
      shotInfo.z = endZ;
      if (part === 'head') shotInfo.killed = victim.health - amount <= 0;
      applyDamage(victim, amount, part, agent);
      if (victim.isPlayer) {
        state.damageFlash = 0.55;
        state.damageFrom = Math.atan2(-(agent.body.pos.x - ox), -(agent.body.pos.z - oz));
      }
      if (agent.isPlayer) {
        state.hitMarker = 0.22;
        state.hitKill = shotInfo.killed;
      }
    } else if (pellet === 0) {
      shotInfo.wall = probe.t < spec.range;
      shotInfo.x = endX;
      shotInfo.y = endY;
      shotInfo.z = endZ;
    }
  }

  state.shot = { agent, x: ox, y: oy, z: oz, ex: shotInfo.x, ey: shotInfo.y, ez: shotInfo.z, sound: spec.sound };
  emit('shot', state.shot, spec);
  return shotInfo;
}
