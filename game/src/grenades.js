// Thrown grenades. Two kinds share one body: Cinder hurts through nothing (walls stop it) and
// Dazzle blinds anyone looking at it. Physics is a point with gravity, two substeps a tick and a
// bounce off whichever face the world ray reports.
import { GRENADES } from './config.js';
import { rayWorld, segmentBlocked } from './collision.js';
import { eyeY } from './agents.js';
import { applyDamage } from './combat.js';
import { state, emit } from './store.js';

const probe = { t: Infinity, axis: -1, sign: 0 };

export function throwGrenade(agent, kind) {
  const spec = GRENADES[kind];
  const cos = Math.cos(agent.pitch);
  const speed = 15.5;
  const dirX = -Math.sin(agent.yaw) * cos;
  const dirY = Math.sin(agent.pitch);
  const dirZ = -Math.cos(agent.yaw) * cos;
  state.grenades.push({
    kind,
    team: agent.team,
    owner: agent,
    x: agent.body.pos.x + dirX * 0.42,
    y: eyeY(agent) - 0.12,
    z: agent.body.pos.z + dirZ * 0.42,
    vx: dirX * speed,
    vy: dirY * speed + 1.4,
    vz: dirZ * speed,
    fuse: spec.fuse,
    bounces: 0,
  });
  emit('throw', agent, kind);
}

function bounce(g, axis, sign) {
  if (axis === 0) g.vx = -g.vx * 0.42;
  else if (axis === 1) g.vy = -g.vy * 0.42;
  else g.vz = -g.vz * 0.42;
  g.bounces += 1;
  emit('bounce', g, sign);
}

function explode(g) {
  const spec = GRENADES[g.kind];
  for (const target of state.agents) {
    if (!target.alive || target.team === g.team) continue;
    const dx = target.body.pos.x - g.x;
    const dz = target.body.pos.z - g.z;
    const dy = target.body.pos.y + target.body.height * 0.5 - g.y;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > spec.radius) continue;
    const chestY = target.body.pos.y + target.body.height * 0.62;
    if (segmentBlocked(g.x, g.y, g.z, target.body.pos.x, chestY, target.body.pos.z)) continue;
    if (g.kind === 'cinder') {
      const falloff = 1 - distance / spec.radius;
      applyDamage(target, spec.damage * falloff, 'blast', g.owner);
    } else {
      const facing = target.isPlayer
        ? Math.cos(target.yaw - Math.atan2(-dx, -dz))
        : Math.cos(target.ai?.aimYaw - Math.atan2(-dx, -dz));
      if (facing > -0.15) {
        if (target.isPlayer) state.flash = Math.max(state.flash, 2.1 * falloff + 0.5);
        else target.ai.blind = Math.max(target.ai.blind, 2.6 * falloff + 0.5);
      }
    }
  }
  emit('explode', g, spec);
}

export function stepGrenades(dt) {
  for (let index = state.grenades.length - 1; index >= 0; index -= 1) {
    const g = state.grenades[index];
    g.fuse -= dt;
    g.vy -= 20 * dt;
    const substeps = 2;
    const h = dt / substeps;
    for (let step = 0; step < substeps; step += 1) {
      const dx = g.vx * h;
      const dy = g.vy * h;
      const dz = g.vz * h;
      const length = Math.hypot(dx, dy, dz);
      if (length > 0.00001) {
        rayWorld(g.x, g.y, g.z, dx / length, dy / length, dz / length, length, probe);
        if (probe.t < length) {
          const back = Math.max(0, probe.t - 0.02);
          g.x += (dx / length) * back;
          g.y += (dy / length) * back;
          g.z += (dz / length) * back;
          bounce(g, probe.axis, probe.sign);
        } else {
          g.x += dx;
          g.y += dy;
          g.z += dz;
        }
      }
      if (g.y < 0.09) {
        g.y = 0.09;
        if (g.vy < 0) g.vy = -g.vy * 0.38;
        g.vx *= 0.72;
        g.vz *= 0.72;
      }
    }
    if (g.fuse <= 0) {
      explode(g);
      state.grenades.splice(index, 1);
    }
  }
}
