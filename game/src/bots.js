// The bots' brain, one function per job: find what they can see, pick a place to be, walk the
// waypoint graph there, aim, burst-fire, reload, throw a grenade and work the bomb. Bots call the
// same movement, gunfire and damage code the player does, so nothing here is a special case.
import { BOT, WEAPONS } from './config.js';
import { state } from './store.js';
import { findPath, nearestNode, nodeByName, POSTS, ATTACK_GOALS, NODES } from './nav.js';
import { segmentBlocked } from './collision.js';
import { stepBody } from './movement.js';
import { eyeY } from './agents.js';
import { startReload, tryFire } from './combat.js';
import { throwGrenade } from './grenades.js';
import { siteAt } from './map.js';

function chestOf(agent) {
  return {
    x: agent.body.pos.x,
    y: agent.body.pos.y + agent.body.height * 0.62,
    z: agent.body.pos.z,
  };
}

// Closest enemy in the bot's cone with an unbroken line to the chest. Also records the last seen
// spot, which the bot walks to when it loses the target.
function spotEnemy(bot) {
  let best = null;
  let bestDist = BOT.sight;
  const eye = eyeY(bot);
  const fx = -Math.sin(bot.yaw) * Math.cos(bot.pitch);
  const fy = Math.sin(bot.pitch);
  const fz = -Math.cos(bot.yaw) * Math.cos(bot.pitch);
  for (const other of state.agents) {
    if (!other.alive || other.team === bot.team) continue;
    const dx = other.body.pos.x - bot.body.pos.x;
    const dz = other.body.pos.z - bot.body.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance > bestDist || distance < 0.001) continue;
    const dot = (dx / distance) * fx + (dz / distance) * fz;
    if (dot < BOT.fov) continue;
    const chest = chestOf(other);
    if (segmentBlocked(bot.body.pos.x, eye, bot.body.pos.z, chest.x, chest.y, chest.z)) continue;
    best = other;
    bestDist = distance;
  }
  return best;
}

function pickPath(bot, nodeIndex) {
  const from = nearestNode(bot.body.pos.x, bot.body.pos.z);
  const path = findPath(from, nodeIndex);
  bot.ai.path = path;
  bot.ai.pathIndex = path.length > 1 ? 1 : 0;
  bot.ai.goalNode = nodeIndex;
  bot.ai.repathIn = 1.6 + (bot.ai.strafeIn % 0.7);
}

function goTo(bot, nodeIndex, rng) {
  if (bot.ai.goalNode === nodeIndex && bot.ai.path.length > 0 && bot.ai.repathIn > 0) return;
  pickPath(bot, nodeIndex);
  bot.ai.strafeIn = 1 + rng();
}

function goalForAttack() {
  const goals = ATTACK_GOALS[state.targetSite];
  return goals;
}

function pickPost(bot, index) {
  const ai = bot.ai;
  if (ai.postNode >= 0 && ai.patience > 0) return ai.postNode;
  const site = index % 2 === 0 ? 'A' : 'B';
  const posts = POSTS[site];
  const choice = posts[(index + Math.floor(state.time / 11)) % posts.length];
  ai.postNode = nodeByName(choice).index;
  ai.patience = 9 + (index % 3) * 4;
  return ai.postNode;
}

function aimAt(bot, target, dt) {
  const ai = bot.ai;
  const chest = chestOf(target);
  const dx = chest.x - bot.body.pos.x;
  const dz = chest.z - bot.body.pos.z;
  const dy = chest.y - eyeY(bot);
  const distance = Math.hypot(dx, dz);
  const jitter = Math.min(0.09, BOT.aimError * (0.4 + distance / 40));
  const wantYaw = Math.atan2(-dx, -dz) + (ai.aimYaw * 0 + (ai.strafe - 0.5) * jitter);
  const wantPitch = Math.atan2(dy, Math.max(0.2, distance));
  const rate = BOT.aimSpeed * dt * (ai.blind > 0 ? 0.25 : 1);
  let yawGap = wantYaw - ai.aimYaw;
  while (yawGap > Math.PI) yawGap -= Math.PI * 2;
  while (yawGap < -Math.PI) yawGap += Math.PI * 2;
  ai.aimYaw += Math.max(-rate, Math.min(rate, yawGap));
  ai.aimPitch += Math.max(-rate, Math.min(rate, wantPitch - ai.aimPitch));
  const tolerance = Math.max(0.02, jitter);
  return Math.abs(yawGap) < tolerance && Math.abs(wantPitch - ai.aimPitch) < tolerance;
}

function tryThrow(bot, target, rng) {
  const ai = bot.ai;
  if (ai.throwIn > 0 || ai.blind > 0) return;
  if (bot.grenades.cinder <= 0 && bot.grenades.dazzle <= 0) return;
  const distance = Math.hypot(target.body.pos.x - bot.body.pos.x, target.body.pos.z - bot.body.pos.z);
  if (distance < 7 || distance > 22) return;
  const kind = bot.grenades.cinder > 0 && rng() < 0.65 ? 'cinder' : 'dazzle';
  if (bot.grenades[kind] <= 0) return;
  bot.grenades[kind] -= 1;
  ai.aimPitch = 0.34;
  throwGrenade(bot, kind);
  ai.throwIn = 7 + rng() * 6;
}

function walkPath(bot, dt) {
  const ai = bot.ai;
  if (ai.path.length === 0) return;
  let node = NODES[ai.path[ai.pathIndex]];
  let dx = node.x - bot.body.pos.x;
  let dz = node.z - bot.body.pos.z;
  let distance = Math.hypot(dx, dz);
  while (distance < 0.7 && ai.pathIndex < ai.path.length - 1) {
    ai.pathIndex += 1;
    node = NODES[ai.path[ai.pathIndex]];
    dx = node.x - bot.body.pos.x;
    dz = node.z - bot.body.pos.z;
    distance = Math.hypot(dx, dz);
  }
  if (distance < 0.55) {
    stepBody(bot.body, dt, 0, 0, 0, false, false);
    return;
  }
  let wishX = dx / distance;
  let wishZ = dz / distance;
  if (ai.strafeIn > 0) {
    wishX += (-dz / distance) * ai.strafe * 0.25;
    wishZ += (dx / distance) * ai.strafe * 0.25;
    const norm = Math.hypot(wishX, wishZ) || 1;
    wishX /= norm;
    wishZ /= norm;
  }
  stepBody(bot.body, dt, wishX, wishZ, 1, false, false);
  bot.yaw = Math.atan2(-wishX, -wishZ);
}

function checkStuck(bot) {
  const ai = bot.ai;
  ai.stuck += 0.0166;
  if (ai.stuck < 1.1) return;
  const moved = Math.hypot(bot.body.pos.x - ai.lastX, bot.body.pos.z - ai.lastZ);
  if (moved < 0.25) {
    const here = nearestNode(bot.body.pos.x, bot.body.pos.z);
    const neighbours = NODES.map((node, index) => ({ node, index })).filter(
      (entry) => entry.index !== here && Math.hypot(entry.node.x - bot.body.pos.x, entry.node.z - bot.body.pos.z) < 6,
    );
    if (neighbours.length > 0) {
      const jump = neighbours[Math.floor((ai.strafe * 0.5 + 0.5) * neighbours.length) % neighbours.length];
      pickPath(bot, jump.index);
    }
  }
  ai.lastX = bot.body.pos.x;
  ai.lastZ = bot.body.pos.z;
  ai.stuck = 0;
}

function stepBot(bot, index, dt, rng) {
  const ai = bot.ai;
  ai.react = Math.max(0, ai.react - dt);
  ai.pause = Math.max(0, ai.pause - dt);
  ai.repathIn -= dt;
  ai.strafeIn -= dt;
  ai.patience -= dt;
  if (ai.strafeIn <= 0) {
    ai.strafe = rng() < 0.5 ? -1 : 1;
    ai.strafeIn = 0.8 + rng() * 1.6;
  }

  const target = ai.blind > 0 ? null : spotEnemy(bot);
  if (target !== null) {
    ai.targetId = target.id;
    ai.seenAt = state.time;
    ai.lastSeenX = target.body.pos.x;
    ai.lastSeenZ = target.body.pos.z;
    if (ai.react <= 0 && ai.state !== 'route') ai.react = BOT.reactMin + rng() * (BOT.reactMax - BOT.reactMin);
  }

  // Objective work first: defusing outranks shooting, and planting outranks walking.
  const bomb = state.bomb;
  if (bomb.state === 'planted' && bot.team === 'defend') {
    const distance = Math.hypot(bot.body.pos.x - bomb.position.x, bot.body.pos.z - bomb.position.z);
    if (distance < 2 && target === null) {
      ai.state = 'defuse';
      bot.yaw = Math.atan2(-(bomb.position.x - bot.body.pos.x), -(bomb.position.z - bot.body.pos.z));
      bot.pitch = -0.8;
      stepBody(bot.body, dt, 0, 0, 0, true, false);
      return;
    }
    ai.state = 'route';
    const bombNode = nearestNode(bomb.position.x, bomb.position.z);
    if (ai.goalNode !== bombNode) goTo(bot, bombNode, rng);
    if (target !== null) engage(bot, target, dt, rng);
    else walkPath(bot, dt);
    return;
  }

  if (bomb.state === 'carried' && bomb.carrier === bot) {
    const site = siteAt(bot.body.pos.x, bot.body.pos.z);
    if (site !== null) {
      ai.state = 'plant';
      bot.pitch = -0.9;
      stepBody(bot.body, dt, 0, 0, 0, true, false);
      return;
    }
    ai.state = 'route';
    goTo(bot, nearestNode(siteOfTarget().x, siteOfTarget().z), rng);
    walkPath(bot, dt);
    return;
  }

  if (bomb.state === 'dropped' && bot.team === 'attack') {
    const distance = Math.hypot(bot.body.pos.x - bomb.position.x, bot.body.pos.z - bomb.position.z);
    if (distance < Math.hypot(state.player.body.pos.x - bomb.position.x, state.player.body.pos.z - bomb.position.z)) {
      if (distance < 1.2) {
        stepBody(bot.body, dt, 0, 0, 0, false, false);
        return;
      }
      goTo(bot, nearestNode(bomb.position.x, bomb.position.z), rng);
      if (target !== null) engage(bot, target, dt, rng);
      else walkPath(bot, dt);
      return;
    }
  }

  if (target !== null) {
    engage(bot, target, dt, rng);
    return;
  }

  ai.state = 'route';

  // No sight: walk to the last known spot, or to the post or attack goal.
  if (state.time - ai.seenAt < 6 && ai.lastSeenX !== 0) {
    const distance = Math.hypot(ai.lastSeenX - bot.body.pos.x, ai.lastSeenZ - bot.body.pos.z);
    if (distance > 1.4) {
      goTo(bot, nearestNode(ai.lastSeenX, ai.lastSeenZ), rng);
    }
  } else if (state.time - ai.heardAt < 4) {
    const distance = Math.hypot(ai.heardX - bot.body.pos.x, ai.heardZ - bot.body.pos.z);
    if (distance > 3) goTo(bot, nearestNode(ai.heardX, ai.heardZ), rng);
  } else if (bot.team === 'defend') {
    goTo(bot, pickPost(bot, index), rng);
  } else {
    const goals = goalForAttack();
    const choice = goals[index % goals.length];
    goTo(bot, nodeByName(choice).index, rng);
  }

  // Hold the post: face the way the map opens and idle instead of orbiting the node.
  const aiNode = bot.ai.path.length > 0 ? NODES[bot.ai.path[bot.ai.path.length - 1]] : null;
  const nearEnd = aiNode !== null && Math.hypot(aiNode.x - bot.body.pos.x, aiNode.z - bot.body.pos.z) < 1.6;
  if (nearEnd && bot.team === 'defend') {
    const look = Math.atan2(-(0 - bot.body.pos.x), -(-10 - bot.body.pos.z));
    let gap = look - bot.yaw;
    while (gap > Math.PI) gap -= Math.PI * 2;
    while (gap < -Math.PI) gap += Math.PI * 2;
    bot.yaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, gap));
    bot.pitch *= 0.9;
    stepBody(bot.body, dt, 0, 0, 0, false, false);
    checkStuck(bot);
    return;
  }

  walkPath(bot, dt);
  checkStuck(bot);
}

function siteOfTarget() {
  return state.targetSite === 'A'
    ? { x: 20.5, z: -13.5 }
    : { x: -20.5, z: -13.5 };
}

function engage(bot, target, dt, rng) {
  const ai = bot.ai;
  const gun = bot.guns.primary ?? bot.guns.sidearm;
  const spec = WEAPONS[gun.id];
  const distance = Math.hypot(target.body.pos.x - bot.body.pos.x, target.body.pos.z - bot.body.pos.z);

  bot.slot = bot.guns.primary ? 'primary' : 'sidearm';
  if (gun.mag <= 0) {
    startReload(bot);
    stepBody(bot.body, dt, 0, 0, 0, false, false);
    return;
  }

  const aimed = aimAt(bot, target, dt);
  bot.yaw = ai.aimYaw;
  bot.pitch = Math.max(-0.6, Math.min(0.4, ai.aimPitch + bot.recoilPitch * 0.5));

  tryThrow(bot, target, rng);

  if (aimed && ai.react <= 0 && ai.pause <= 0 && bot.cooldown <= 0) {
    tryFire(bot, rng, 1.6);
    ai.burst += 1;
    if (ai.burst >= BOT.burstShots) {
      ai.burst = 0;
      ai.pause = BOT.burstPause;
    }
  }

  let wishX = 0;
  let wishZ = 0;
  if (distance > 9) {
    const dx = target.body.pos.x - bot.body.pos.x;
    const dz = target.body.pos.z - bot.body.pos.z;
    const length = Math.hypot(dx, dz) || 1;
    wishX = dx / length;
    wishZ = dz / length;
  } else {
    wishX = (-Math.cos(bot.yaw)) * ai.strafe * 0.55;
    wishZ = (Math.sin(bot.yaw)) * ai.strafe * 0.55;
  }
  const speed = bot.body.crouch ? 0.5 : 1;
  stepBody(bot.body, dt, wishX * speed, wishZ * speed, Math.hypot(wishX, wishZ) * speed, distance < 14 && ai.pause > 0, false);
}

export function stepBots(dt, rng) {
  let index = 0;
  for (const bot of state.agents) {
    if (bot.isPlayer || !bot.alive) continue;
    stepBot(bot, index, dt, rng);
    index += 1;
  }
}

// A shot is heard by every bot within earshot that is not already looking at the shooter.
export function reportShot(shooter) {
  for (const bot of state.agents) {
    if (bot === shooter || bot.isPlayer || !bot.alive) continue;
    const distance = Math.hypot(bot.body.pos.x - shooter.body.pos.x, bot.body.pos.z - shooter.body.pos.z);
    if (distance > BOT.hearRadius) continue;
    bot.ai.heardAt = state.time;
    bot.ai.heardX = shooter.body.pos.x;
    bot.ai.heardZ = shooter.body.pos.z;
  }
}
