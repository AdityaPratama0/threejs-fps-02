// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate. This
// file only wires modules together and owns the camera; every rule lives in the simulation and
// every pixel in the scene and the HUD.
import * as THREE from 'three';
import { TICK } from './config.js';
import { createStage } from './scene.js';
import { createView } from './view.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createSim } from './sim.js';
import { state } from './store.js';
import { look } from './player.js';
import { buy } from './buy.js';
import { segmentBlocked } from './collision.js';
import { placeBody } from './movement.js';
import { tryFire } from './combat.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

createStage(scene);
const view = createView(scene, camera);
const hud = createHud();
const audio = createAudio();
const sim = createSim(seed);
view.register(state.agents);

let accumulator = 0;
let lastTime = performance.now();
let frozen = false;

state.eventSinks.push((event) => {
  view.handleEvent(event);
  const player = state.player;
  if (event.kind === 'shot') {
    audio.shot(event.a, event.b);
  } else if (event.kind === 'explode') {
    audio.explosion(event.a);
  } else if (event.kind === 'beep') {
    audio.beep(event.a);
  } else if (event.kind === 'throw') {
    audio.throwGrenade();
  } else if (event.kind === 'plant') {
    audio.plant();
  } else if (event.kind === 'hurt') {
    const target = event.a;
    const attacker = event.b;
    if (target === player) audio.hurt();
    if (attacker === player) {
      audio.hit(event.c);
      if (!target.alive) audio.kill();
    }
  } else if (event.kind === 'reload' && event.a === player) {
    audio.reload();
  } else if (event.kind === 'roundEnd') {
    audio.round(event.a === state.playerTeam);
  }
});

const input = createInput(renderer.domElement);

function showOverlayFor(name) {
  hud.setOverlay(name);
}

input.input.locked = false;
hud.onPlay(() => {
  audio.resume();
  if (state.matchOver) sim.start();
  input.requestLock();
  showOverlayFor(null);
});

hud.onBuy((id) => buy(id));
hud.onBuyClose(() => {
  state.buyOpen = false;
});

document.addEventListener('pointerlockchange', () => {
  if (shot !== null) return;
  if (input.input.locked) {
    showOverlayFor(null);
    state.paused = false;
  } else {
    state.paused = state.started && !state.matchOver;
    if (state.matchOver) showOverlayFor('end');
    else showOverlayFor(state.started ? 'paused' : 'start');
  }
});

function syncCamera() {
  const player = state.player;
  if (player === null) return;
  const eye = player.alive ? player.body.eye : 0.45;
  camera.position.set(player.body.pos.x, player.body.pos.y + eye, player.body.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }

  if (shot === null) {
    const lookDelta = input.takeLook();
    if (input.input.locked) look(lookDelta[0], lookDelta[1]);
    if (input.consume('KeyB')) {
      state.buyOpen = !state.buyOpen;
      hud.update();
    }
    if (input.consume('Escape')) {
      if (state.buyOpen) state.buyOpen = false;
      else input.exitLock();
    }
    if (state.matchOver && state.phase === 'done' && state.buyOpen) state.buyOpen = false;

    accumulator += dt;
    let steps = 0;
    while (accumulator >= TICK && steps < 5) {
      sim.step(TICK, input);
      accumulator -= TICK;
      steps += 1;
    }
    if (accumulator > TICK * 5) accumulator = 0;
  }

  syncCamera();
  view.update(dt);
  hud.update();

  if (state.matchOver && state.phase === 'done' && !state.buyOpen && document.pointerLockElement === null) {
    showOverlayFor('end');
  }
  renderer.render(scene, camera);
}

// The screenshots are real frames of the game's own code: each setup starts a seeded match,
// plays it forward, places the camera and (for the action shots) fires the same hitscan the
// game uses, then paints twice and freezes.
function equippedRifle() {
  const player = state.player;
  player.guns.primary = { id: 'rook', mag: 30, reserve: 90 };
  player.slot = 'primary';
  player.money = 2400;
}

function aimAt(x, y, z) {
  const player = state.player;
  const eyeX = player.body.pos.x;
  const eyeYPos = player.body.pos.y + player.body.eye;
  const eyeZ = player.body.pos.z;
  const dx = x - eyeX;
  const dy = y - eyeYPos;
  const dz = z - eyeZ;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.asin(Math.max(-1, Math.min(1, dy / (Math.hypot(dx, dy, dz) || 1))));
}

function visibleEnemy() {
  const player = state.player;
  const eye = player.body.pos.y + player.body.eye;
  let best = null;
  let bestDist = Infinity;
  for (const agent of state.agents) {
    if (!agent.alive || agent.team === player.team) continue;
    const chestY = agent.body.pos.y + agent.body.height * 0.62;
    if (segmentBlocked(player.body.pos.x, eye, player.body.pos.z, agent.body.pos.x, chestY, agent.body.pos.z)) continue;
    const distance = Math.hypot(agent.body.pos.x - player.body.pos.x, agent.body.pos.z - player.body.pos.z);
    if (distance < bestDist) {
      bestDist = distance;
      best = agent;
    }
  }
  return best;
}

function shootAt(agent, shots, rng) {
  for (let i = 0; i < shots; i += 1) {
    if (!agent.alive) break;
    const chestY = agent.body.pos.y + agent.body.height * 0.62;
    aimAt(agent.body.pos.x, chestY, agent.body.pos.z);
    const player = state.player;
    player.recoilPitch = 0;
    player.recoilYaw = 0;
    player.bloom = 0;
    player.cooldown = 0;
    tryFire(player, rng, 0);
  }
}

function settle(seconds) {
  const steps = Math.round(seconds / TICK);
  for (let i = 0; i < steps; i += 1) sim.step(TICK, input);
}

function setupShot(name) {
  state.started = true;
  hud.setOverlay(null);
  sim.start();
  const player = state.player;

  if (name === 'start') {
    placeBody(player.body, 0, 25);
    player.yaw = 0;
    player.pitch = -0.03;
    settle(0.5);
    hud.setOverlay('start');
  } else if (name === 'play') {
    equippedRifle();
    settle(15);
    const target = visibleEnemy();
    placeBody(player.body, 6, 2);
    player.yaw = 0;
    player.pitch = 0;
    settle(0.2);
    const enemy = visibleEnemy() ?? target;
    if (enemy !== null) {
      shootAt(enemy, 3, state.random);
      const next = visibleEnemy();
      if (next !== null && next !== enemy) shootAt(next, 1, state.random);
    }
    settle(1 / 60);
    hud.update();
  } else if (name === 'plant') {
    equippedRifle();
    settle(13);
    state.bomb.state = 'planted';
    state.bomb.position.x = 19;
    state.bomb.position.y = 0.05;
    state.bomb.position.z = -14;
    state.bomb.timer = 26.4;
    state.bomb.beepTimer = 0.3;
    placeBody(player.body, 16, -14);
    aimAt(19, 0.2, -14);
    settle(3);
    hud.update();
  } else if (name === 'end') {
    equippedRifle();
    // A real match played to its own end. If it somehow will not finish, fail the capture rather
    // than invent a winner.
    let guard = 0;
    while (!state.matchOver && guard < 60 * 60 * 40) {
      sim.step(TICK, input);
      guard += 1;
    }
    if (!state.matchOver) throw new Error('match did not finish');
    state.phase = 'done';
    state.buyOpen = false;
    placeBody(player.body, 0, 25);
    player.yaw = 0;
    player.pitch = 0;
    view.update(TICK);
    hud.setOverlay('end');
  }
  hud.update();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera();
    view.update(TICK);
    hud.update();
    renderer.render(scene, camera);
    painted += 1;
    if (painted >= 3) {
      frozen = true;
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shot !== null) {
  setupShot(shot);
  paintTwiceThenReady();
} else {
  showOverlayFor('start');
  requestAnimationFrame(frame);
}
