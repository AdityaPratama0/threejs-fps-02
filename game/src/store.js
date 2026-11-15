// The one state store: every number the simulation reads or writes lives on `state`. Modules
// import it, never a copy, and the view reads the same objects the sim mutates, so there is no
// second source of truth to drift. Nothing here touches three.js or the DOM.
import { ECONOMY } from './config.js';

export const state = {
  time: 0,
  phase: 'warmup',
  phaseTimer: 0,
  round: 1,
  scoreAttack: 0,
  scoreDefend: 0,
  lossStreak: { attack: 0, defend: 0 },
  playerTeam: 'attack',
  agents: [],
  player: null,
  bomb: {
    state: 'carried',
    carrier: null,
    position: { x: 0, y: 0, z: 0 },
    timer: 0,
    beepTimer: 0,
    progress: 0,
    planter: null,
    defuser: null,
  },
  grenades: [],
  events: [],
  killfeed: [],
  message: '',
  messageTimer: 0,
  buyOpen: false,
  hitMarker: 0,
  hitKill: false,
  damageFlash: 0,
  damageFrom: 0,
  flash: 0,
  matchOver: false,
  winner: '',
  paused: false,
  started: false,
  shot: null,
  plantHeld: false,
  roundReason: '',
  targetSite: 'A',
  random: () => 0.5,
  eventSinks: [],
};

export function emit(kind, a, b, c) {
  state.events.push({ kind, a, b, c });
}

export function aliveCount(team) {
  let count = 0;
  for (const agent of state.agents) if (agent.alive && agent.team === team) count += 1;
  return count;
}

export function addKillfeed(line) {
  state.killfeed.unshift(line);
  if (state.killfeed.length > 5) state.killfeed.length = 5;
}

export function award(agent, amount) {
  agent.money = Math.min(ECONOMY.max, agent.money + amount);
}

export function say(text, seconds = 2.4) {
  state.message = text;
  state.messageTimer = seconds;
}

// The losing side banks more each round it keeps losing, capped. Callers update the streak, this
// only answers what that streak is worth.
export function lossAward(streak) {
  const step = Math.max(1, streak) - 1;
  return Math.min(ECONOMY.lossMax, ECONOMY.lossBase + ECONOMY.lossStep * step);
}

export function addScore(team, points) {
  if (team === 'attack') {
    state.scoreAttack += points;
  } else {
    state.scoreDefend += points;
  }
  state.roundReason = '';
}
