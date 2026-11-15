// The roster and every fighter's shared state. A fighter is one object the simulation mutates:
// body, aim, health, guns, grenades, money and, for bots, their small brain. The view reads these
// same objects, so what is drawn is what is simulated.
import { MOVE, WEAPONS } from './config.js';
import { createBody, placeBody } from './movement.js';
import { SPAWNS } from './map.js';

export const ROSTER = {
  attack: [
    { id: 'you', name: 'You', isPlayer: true },
    { id: 'tern', name: 'Tern', isPlayer: false },
    { id: 'gull', name: 'Gull', isPlayer: false },
    { id: 'mako', name: 'Mako', isPlayer: false },
  ],
  defend: [
    { id: 'warden', name: 'Warden', isPlayer: false },
    { id: 'brack', name: 'Brack', isPlayer: false },
    { id: 'vess', name: 'Vess', isPlayer: false },
    { id: 'ondine', name: 'Ondine', isPlayer: false },
  ],
};

function makeGun(id) {
  const spec = WEAPONS[id];
  return { id, mag: spec.mag, reserve: spec.reserve };
}

function makeAi() {
  return {
    state: 'route',
    path: [],
    pathIndex: 0,
    goalNode: -1,
    postNode: -1,
    repathIn: 0,
    react: 0,
    burst: 0,
    pause: 0,
    targetId: null,
    seenAt: -99,
    lastSeenX: 0,
    lastSeenZ: 0,
    heardAt: -99,
    heardX: 0,
    heardZ: 0,
    blind: 0,
    aimYaw: 0,
    aimPitch: 0,
    strafe: 1,
    strafeIn: 1.2,
    stuck: 0,
    lastX: 0,
    lastZ: 0,
    patience: 0,
    throwIn: 8,
  };
}

export function createAgent(def, team, index) {
  const body = createBody();
  const spawn = SPAWNS[team][index % SPAWNS[team].length];
  placeBody(body, spawn.x, spawn.z);
  return {
    id: def.id,
    name: def.name,
    team,
    isPlayer: def.isPlayer,
    body,
    yaw: team === 'attack' ? 0 : Math.PI,
    pitch: 0,
    health: 100,
    armor: 0,
    alive: true,
    respawn: 0,
    guns: { primary: null, sidearm: makeGun('tally') },
    slot: 'sidearm',
    grenades: { cinder: 0, dazzle: 0 },
    cooldown: 0,
    reloadLeft: 0,
    reloadTotal: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    bloom: 0,
    lastShotAt: -99,
    stepPhase: index * 1.7,
    fall: 0,
    money: 0,
    kills: 0,
    deaths: 0,
    carried: 0,
    ai: def.isPlayer ? null : makeAi(),
  };
}

export function createRoster(playerTeam) {
  const agents = [];
  for (const team of ['attack', 'defend']) {
    ROSTER[team].forEach((def, index) => {
      agents.push(createAgent(def, team, index));
    });
  }
  const player = agents.find((agent) => agent.isPlayer);
  player.team = playerTeam;
  if (playerTeam !== 'attack') {
    throw new Error('Saltgate is played from the attack side');
  }
  return agents;
}

// Eye height above the floor, and the hit volumes the guns test.
export function eyeY(agent) {
  return agent.body.pos.y + agent.body.eye;
}

export function headCentre(agent) {
  return {
    x: agent.body.pos.x,
    y: agent.body.pos.y + agent.body.height - 0.13,
    z: agent.body.pos.z,
    r: 0.145,
  };
}

export function torsoBox(agent) {
  const pos = agent.body.pos;
  return {
    minX: pos.x - 0.24,
    maxX: pos.x + 0.24,
    minY: pos.y + (agent.body.height === MOVE.crouchHeight ? 0.34 : 0.46),
    maxY: pos.y + agent.body.height - 0.24,
    minZ: pos.z - 0.18,
    maxZ: pos.z + 0.18,
  };
}

export function legBox(agent) {
  const pos = agent.body.pos;
  return {
    minX: pos.x - 0.22,
    maxX: pos.x + 0.22,
    minY: pos.y + 0.02,
    maxY: pos.y + (agent.body.height === MOVE.crouchHeight ? 0.34 : 0.46),
    minZ: pos.z - 0.18,
    maxZ: pos.z + 0.18,
  };
}

export function currentSpec(agent) {
  if (agent.slot === 'cinder') return null;
  if (agent.slot === 'dazzle') return null;
  const gun = agent.slot === 'primary' ? agent.guns.primary : agent.guns.sidearm;
  return gun === null ? null : WEAPONS[gun.id];
}

export function currentGun(agent) {
  if (agent.slot === 'primary') return agent.guns.primary;
  if (agent.slot === 'sidearm') return agent.guns.sidearm;
  return null;
}

// A bot's automatic buy: the best primary it can pay for, then a grenade with what is left.
export function autoBuy(agent, rng) {
  const options = [
    ['rook', 2700],
    ['wasp', 1250],
    ['breaker', 1100],
  ];
  if (agent.guns.primary === null) {
    for (const [id, price] of options) {
      if (agent.money >= price) {
        agent.money -= price;
        agent.guns.primary = makeGun(id);
        agent.slot = 'primary';
        break;
      }
    }
  }
  if (agent.money >= 650 && agent.armor < 50) {
    agent.money -= 650;
    agent.armor = 100;
  }
  if (agent.money >= 300 && rng() < 0.5) {
    agent.money -= 300;
    agent.grenades.cinder += 1;
  } else if (agent.money >= 200 && rng() < 0.4) {
    agent.money -= 200;
    agent.grenades.dazzle += 1;
  }
}

export function respawnAgent(agent, index) {
  const spawn = SPAWNS[agent.team][index % SPAWNS[agent.team].length];
  placeBody(agent.body, spawn.x, spawn.z);
  agent.body.crouch = false;
  agent.body.height = MOVE.standHeight;
  agent.body.eye = MOVE.standEye;
  agent.health = 100;
  agent.alive = true;
  agent.fall = 0;
  agent.cooldown = 0;
  agent.reloadLeft = 0;
  agent.recoilPitch = 0;
  agent.recoilYaw = 0;
  agent.bloom = 0;
  agent.yaw = agent.team === 'attack' ? 0 : Math.PI;
  agent.pitch = 0;
  agent.guns.sidearm.mag = WEAPONS.tally.mag;
  agent.guns.sidearm.reserve = WEAPONS.tally.reserve;
  if (agent.guns.primary !== null) {
    const spec = WEAPONS[agent.guns.primary.id];
    agent.guns.primary.mag = spec.mag;
    agent.guns.primary.reserve = spec.reserve;
  }
  agent.slot = agent.guns.primary ? 'primary' : 'sidearm';
  if (agent.ai !== null) {
    agent.ai.state = 'route';
    agent.ai.path.length = 0;
    agent.ai.pathIndex = 0;
    agent.ai.repathIn = 0;
    agent.ai.targetId = null;
    agent.ai.seenAt = -99;
    agent.ai.blind = 0;
    agent.ai.burst = 0;
    agent.ai.pause = 0;
    agent.ai.patience = 0;
    agent.ai.aimYaw = agent.yaw;
    agent.ai.aimPitch = 0;
    agent.ai.lastX = agent.body.pos.x;
    agent.ai.lastZ = agent.body.pos.z;
  }
}
