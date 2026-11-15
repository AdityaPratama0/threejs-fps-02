// Round and match flow: freeze time, buying, the bomb objective, eliminations, the timer, the
// score, and the money each team takes out of a round. It reads and writes the shared store and
// decides nothing about how anything looks.
import { ROUND, ECONOMY, MATCH_POINTS } from './config.js';
import { siteAt } from './map.js';
import { autoBuy, respawnAgent } from './agents.js';
import { state, emit, aliveCount, say, addScore, award, lossAward } from './store.js';

function distance2d(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function teamName(team) {
  return team === 'attack' ? 'Dockers' : 'Customs';
}

export function canBuyNow() {
  if (state.phase === 'freeze') return true;
  if (state.phase !== 'live') return false;
  return state.phaseTimer > ROUND.live - ROUND.buyWindow;
}

export function beginMatch(rng) {
  state.round = 0;
  state.scoreAttack = 0;
  state.scoreDefend = 0;
  state.lossStreak.attack = 0;
  state.lossStreak.defend = 0;
  state.matchOver = false;
  state.winner = '';
  state.killfeed.length = 0;
  state.started = true;
  state.plantHeld = false;
  for (const agent of state.agents) {
    agent.money = ECONOMY.start;
    agent.kills = 0;
    agent.deaths = 0;
    agent.guns.primary = null;
    agent.guns.sidearm.mag = 12;
    agent.guns.sidearm.reserve = 48;
    agent.slot = 'sidearm';
    agent.grenades.cinder = 0;
    agent.grenades.dazzle = 0;
    agent.alive = false;
  }
  startRound(rng);
}

export function startRound(rng) {
  state.round += 1;
  state.phase = 'freeze';
  state.phaseTimer = ROUND.freeze;
  state.plantHeld = false;
  state.buyOpen = false;
  state.roundReason = '';
  state.hitMarker = 0;
  state.hitKill = false;
  state.damageFlash = 0;
  state.flash = 0;
  state.shot = null;
  state.grenades.length = 0;
  const bomb = state.bomb;
  bomb.state = 'carried';
  bomb.carrier = null;
  bomb.position.x = 0;
  bomb.position.y = 0;
  bomb.position.z = 0;
  bomb.timer = 0;
  bomb.beepTimer = 0;
  bomb.progress = 0;
  bomb.defuser = null;
  bomb.planter = null;

  let attackerIndex = 0;
  let defenderIndex = 0;
  for (const agent of state.agents) {
    const died = !agent.alive;
    const index = agent.team === 'attack' ? attackerIndex++ : defenderIndex++;
    respawnAgent(agent, index);
    if (died) {
      agent.guns.primary = null;
      agent.armor = 0;
      agent.slot = 'sidearm';
    }
    agent.grenades.cinder = 0;
    agent.grenades.dazzle = 0;
    agent.ai && (agent.ai.throwIn = 8 + rng() * 8);
    if (!agent.isPlayer) autoBuy(agent, rng);
  }

  const player = state.player;
  bomb.carrier = player;
  bomb.position.x = player.body.pos.x;
  bomb.position.y = player.body.pos.y + 0.9;
  bomb.position.z = player.body.pos.z;
  state.targetSite = rng() < 0.5 ? 'A' : 'B';
  say(`Round ${state.round}. Dockers move on site ${state.targetSite}.`, 3.2);
  emit('roundStart', state.round);
}

export function dropBomb(carrier) {
  const bomb = state.bomb;
  bomb.state = 'dropped';
  bomb.carrier = null;
  bomb.position.x = carrier.body.pos.x;
  bomb.position.y = 0.12;
  bomb.position.z = carrier.body.pos.z;
  bomb.progress = 0;
  emit('bombDrop', bomb);
}

function plantBomb(carrier, site) {
  const bomb = state.bomb;
  bomb.state = 'planted';
  bomb.carrier = null;
  bomb.position.x = carrier.body.pos.x;
  bomb.position.y = 0.05;
  bomb.position.z = carrier.body.pos.z;
  bomb.timer = ROUND.bomb;
  bomb.beepTimer = 0.4;
  bomb.progress = 0;
  award(carrier, ECONOMY.plant);
  say(`Bomb planted at ${site.name}. ${Math.round(ROUND.bomb)} seconds.`, 3);
  emit('plant', bomb, carrier);
}

function explodeBomb() {
  const bomb = state.bomb;
  bomb.state = 'exploded';
  bomb.timer = 0;
  emit('explodeBomb', bomb);
  endRound('attack', 'the bomb went off');
}

function defuseBomb(defuser) {
  const bomb = state.bomb;
  bomb.state = 'defused';
  bomb.progress = 0;
  award(defuser, ECONOMY.defuse);
  emit('defuse', bomb, defuser);
  endRound('defend', 'bomb defused');
}

function stepObjective(dt) {
  const bomb = state.bomb;
  const player = state.player;

  if (bomb.state === 'carried') {
    const carrier = bomb.carrier;
    if (carrier === null || !carrier.alive) {
      if (carrier !== null) dropBomb(carrier);
      return;
    }
    bomb.position.x = carrier.body.pos.x;
    bomb.position.y = carrier.body.pos.y + 0.9;
    bomb.position.z = carrier.body.pos.z;
    const site = siteAt(carrier.body.pos.x, carrier.body.pos.z);
    const wants = carrier.isPlayer ? state.plantHeld : carrier.ai.state === 'plant';
    if (site !== null && wants) {
      bomb.progress += dt;
      if (bomb.progress >= ROUND.plant) plantBomb(carrier, site);
    } else {
      bomb.progress = 0;
    }
    return;
  }

  if (bomb.state === 'dropped') {
    for (const agent of state.agents) {
      if (!agent.alive || agent.team !== 'attack') continue;
      if (distance2d(agent.body.pos.x, agent.body.pos.z, bomb.position.x, bomb.position.z) > 1.15) continue;
      bomb.state = 'carried';
      bomb.carrier = agent;
      bomb.progress = 0;
      emit('bombPickup', agent);
      if (agent.isPlayer) say('Bomb recovered. Plant it at A or B.');
      break;
    }
    return;
  }

  if (bomb.state !== 'planted') return;

  bomb.timer -= dt;
  bomb.beepTimer -= dt;
  const interval = bomb.timer > 20 ? 1 : bomb.timer > 10 ? 0.55 : 0.28;
  if (bomb.beepTimer <= 0) {
    bomb.beepTimer = interval;
    emit('beep', bomb);
  }
  if (bomb.timer <= 0) {
    explodeBomb();
    return;
  }

  let defuser = null;
  for (const agent of state.agents) {
    if (!agent.alive || agent.team !== 'defend') continue;
    if (distance2d(agent.body.pos.x, agent.body.pos.z, bomb.position.x, bomb.position.z) > 2.2) continue;
    if (agent.ai.state !== 'defuse') continue;
    defuser = agent;
    break;
  }
  if (defuser === null) {
    bomb.defuser = null;
    bomb.progress = 0;
    return;
  }
  if (bomb.defuser !== defuser) {
    bomb.defuser = defuser;
    bomb.progress = 0;
  }
  bomb.progress += dt;
  if (bomb.progress >= ROUND.defuse) defuseBomb(defuser);
}

export function endRound(winner, reason) {
  if (state.phase !== 'live') return;
  state.phase = 'over';
  state.phaseTimer = ROUND.over;
  state.roundReason = reason;
  state.buyOpen = false;
  state.plantHeld = false;
  const loser = winner === 'attack' ? 'defend' : 'attack';
  state.lossStreak[winner] = 0;
  state.lossStreak[loser] = Math.min(4, state.lossStreak[loser] + 1);
  const consolation = lossAward(state.lossStreak[loser]);
  for (const agent of state.agents) {
    award(agent, agent.team === winner ? ECONOMY.win : consolation);
  }
  addScore(winner, 1);
  say(`${teamName(winner)} take round ${state.round}: ${reason}.`, ROUND.over - 0.2);
  emit('roundEnd', winner, reason);
  const score = winner === 'attack' ? state.scoreAttack : state.scoreDefend;
  if (score >= MATCH_POINTS) {
    state.matchOver = true;
    state.winner = winner;
  }
}

export function stepRounds(dt, rng) {
  if (state.messageTimer > 0) state.messageTimer -= dt;
  state.hitMarker = Math.max(0, state.hitMarker - dt);
  state.damageFlash = Math.max(0, state.damageFlash - dt);
  state.flash = Math.max(0, state.flash - dt * 0.8);

  if (state.phase === 'freeze') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      state.phaseTimer = ROUND.live;
      state.phase = 'live';
      state.buyOpen = false;
      say('Round live. Bomb is with the player carrying the crate.', 2.4);
      emit('live', state.round);
    }
    return;
  }

  if (state.phase === 'live') {
    stepObjective(dt);
    if (state.phase !== 'live') return;
    state.phaseTimer -= dt;
    if (state.bomb.state === 'planted') {
      if (aliveCount('defend') === 0) {
        endRound('attack', 'no Customs left to defuse');
        return;
      }
    } else if (aliveCount('defend') === 0) {
      endRound('attack', 'Customs eliminated');
      return;
    } else if (aliveCount('attack') === 0) {
      endRound('defend', 'Dockers eliminated');
      return;
    } else if (state.phaseTimer <= 0) {
      endRound('defend', 'time ran out');
      return;
    }
    return;
  }

  if (state.phase === 'over') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      if (state.matchOver) {
        state.phase = 'done';
        state.roundReason = state.winner === 'attack' ? 'Dockers win the match' : 'Customs win the match';
        emit('matchEnd', state.winner);
      } else {
        startRound(rng);
      }
    }
  }
}

export function playerCarriesBomb() {
  return state.bomb.state === 'carried' && state.bomb.carrier === state.player;
}
