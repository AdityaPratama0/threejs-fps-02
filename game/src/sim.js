// The fixed-step simulation, and nothing else: it owns the roster, the random stream and the
// order of a tick. Rendering, input capture and sound all read from here and never write to it.
import { TICK } from './config.js';
import { createRng } from './rng.js';
import { state } from './store.js';
import { createRoster } from './agents.js';
import { beginMatch, stepRounds } from './rounds.js';
import { stepBots, reportShot } from './bots.js';
import { stepPlayer } from './player.js';
import { stepGrenades } from './grenades.js';
import { stepWeapon } from './combat.js';

export function createSim(seed = 7) {
  const random = createRng(seed);
  state.random = random;
  state.agents = createRoster('attack');
  state.player = state.agents.find((agent) => agent.isPlayer);
  return {
    start() {
      beginMatch(random);
    },
    step(dt, input) {
      state.time += dt;
      if (state.paused) return;

      // The player's own weapon ticks inside stepPlayer; the bots' tick here.
      stepPlayer(dt, input);
      stepBots(dt, random);
      for (const agent of state.agents) {
        if (!agent.isPlayer && agent.alive) stepWeapon(agent, dt);
      }
      stepGrenades(dt);
      stepRounds(dt, random);

      if (state.shot !== null) reportShot(state.shot.agent);
      drainEvents();
    },
  };
}

// Events the view and the audio react to are handed to the sinks and then cleared, so the queue
// never grows during a match.
function drainEvents() {
  if (state.events.length === 0) return;
  const sinks = state.eventSinks;
  if (sinks !== undefined) {
    for (const event of state.events) for (const sink of sinks) sink(event);
  }
  state.events.length = 0;
}

export { TICK };
