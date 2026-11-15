// The player's controls: keys and mouse into wishes, then the same movement, gunfire and grenade
// code the bots use. Nothing here renders; it writes yaw, pitch and body state that the
// simulation steps and the view reads.
import { state, say } from './store.js';
import { stepBody } from './movement.js';
import { currentGun, currentSpec } from './agents.js';
import { stepWeapon, tryFire, startReload } from './combat.js';
import { throwGrenade } from './grenades.js';
import { siteAt } from './map.js';
import { playerCarriesBomb } from './rounds.js';

const controls = {
  forward: 0,
  strafe: 0,
  jump: false,
  crouch: false,
  fire: false,
  reload: false,
  plant: false,
};

const trigger = { held: false, semiWasDown: false };

export function look(dx, dy, sensitivity = 0.0021) {
  const player = state.player;
  if (player === null || !state.started) return;
  player.yaw -= dx * sensitivity;
  player.pitch = Math.max(-1.42, Math.min(1.42, player.pitch - dy * sensitivity));
}

export function readControls(input) {
  const keys = input.keys;
  controls.forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  controls.strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  controls.jump = keys.has('Space');
  controls.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  controls.fire = input.firing;
  controls.reload = keys.has('KeyR');
  controls.plant = keys.has('KeyE');
  return controls;
}

export function useSlot(player, slot) {
  if (slot === 'primary' && player.guns.primary === null) return false;
  if ((slot === 'cinder' || slot === 'dazzle') && player.grenades[slot] <= 0) return false;
  if (player.slot === slot) return false;
  player.reloadLeft = 0;
  player.slot = slot;
  if (slot === 'cinder') say('Cinder ready: fire to throw.', 1.2);
  if (slot === 'dazzle') say('Dazzle ready: fire to throw.', 1.2);
  return true;
}

export function cycleSlot(player, step) {
  const order = ['primary', 'sidearm'];
  if (player.grenades.cinder > 0) order.push('cinder');
  if (player.grenades.dazzle > 0) order.push('dazzle');
  const usable = order.filter((slot) => slot === 'sidearm' || (slot === 'primary' ? player.guns.primary !== null : true));
  if (usable.length === 0) return;
  const at = usable.indexOf(player.slot);
  const next = usable[(at + step + usable.length) % usable.length];
  useSlot(player, next);
}

function throwSelected(player, kind) {
  if (player.grenades[kind] <= 0) return;
  player.grenades[kind] -= 1;
  throwGrenade(player, kind);
  player.cooldown = 0.55;
  player.slot = player.guns.primary ? 'primary' : 'sidearm';
}

export function stepPlayer(dt, input) {
  const player = state.player;
  if (player === null || !state.started) return;
  const c = readControls(input);
  stepWeapon(player, dt);
  if (!player.alive) {
    state.plantHeld = false;
    trigger.semiWasDown = false;
    trigger.held = false;
    return;
  }

  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  let wishX = -sin * c.forward + cos * c.strafe;
  let wishZ = -cos * c.forward - sin * c.strafe;
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 0.001) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }
  stepBody(player.body, dt, wishX, wishZ, wishLength, c.crouch, c.jump && !state.plantHeld);

  if (input.consume('Digit1')) useSlot(player, 'primary');
  if (input.consume('Digit2')) useSlot(player, 'sidearm');
  if (input.consume('Digit4')) useSlot(player, 'cinder');
  if (input.consume('Digit5')) useSlot(player, 'dazzle');
  if (input.consume('KeyQ')) cycleSlot(player, 1);
  const wheel = input.takeWheel();
  if (wheel !== 0) cycleSlot(player, wheel > 0 ? 1 : -1);

  if (c.reload) startReload(player);
  const gun = currentGun(player);
  if (gun !== null && gun.mag === 0 && player.reloadLeft <= 0) startReload(player);

  const spec = currentSpec(player);
  const down = c.fire && input.locked;
  const live = state.phase === 'live' || state.phase === 'freeze';

  if (spec !== null && live) {
    const semi = spec.sound === 'pistol' || spec.sound === 'shotgun';
    if (semi) {
      if (down && !trigger.semiWasDown) tryFire(player, state.random);
    } else if (down) {
      tryFire(player, state.random);
    }
  } else if (down && !trigger.semiWasDown && player.slot === 'cinder') {
    throwSelected(player, 'cinder');
  } else if (down && !trigger.semiWasDown && player.slot === 'dazzle') {
    throwSelected(player, 'dazzle');
  }
  trigger.semiWasDown = down;
  trigger.held = down;

  const site = siteAt(player.body.pos.x, player.body.pos.z);
  const carrying = playerCarriesBomb();
  state.plantHeld = Boolean(c.plant && carrying && site !== null && state.phase === 'live');
  if (c.plant && carrying && site === null && state.messageTimer <= 0) say('Stand on A or B to plant.', 1.2);
}
