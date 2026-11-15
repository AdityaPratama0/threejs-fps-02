// The buy menu's catalogue and the one function that takes money and hands out gear. Prices come
// from config, availability from the phase, and every purchase is refused politely when it cannot
// happen instead of going through halfway.
import { WEAPONS, GRENADES } from './config.js';
import { state, say } from './store.js';
import { canBuyNow } from './rounds.js';

export const BUY_ITEMS = [
  { id: 'rook', kind: 'weapon', name: WEAPONS.rook.name, price: WEAPONS.rook.price, note: 'rifle' },
  { id: 'wasp', kind: 'weapon', name: WEAPONS.wasp.name, price: WEAPONS.wasp.price, note: 'smg' },
  { id: 'breaker', kind: 'weapon', name: WEAPONS.breaker.name, price: WEAPONS.breaker.price, note: 'shotgun' },
  { id: 'armor', kind: 'armor', name: 'Flak vest', price: 650, note: 'armour' },
  { id: 'cinder', kind: 'grenade', name: GRENADES.cinder.name, price: GRENADES.cinder.price, note: 'frag' },
  { id: 'dazzle', kind: 'grenade', name: GRENADES.dazzle.name, price: GRENADES.dazzle.price, note: 'flash' },
];

export function buy(itemId) {
  const player = state.player;
  const item = BUY_ITEMS.find((entry) => entry.id === itemId);
  if (player === null || item === undefined) return false;
  if (!canBuyNow()) {
    say('Buying is closed. Wait for freeze time.', 1.6);
    return false;
  }
  if (player.money < item.price) {
    say(`Not enough. ${item.name} costs ${item.price}.`, 1.6);
    return false;
  }
  if (item.kind === 'armor' && player.armor >= 100) {
    say('The vest is already on.', 1.4);
    return false;
  }
  if (item.kind === 'weapon' && player.guns.primary !== null && player.guns.primary.id === item.id) {
    say(`${item.name} is already in hand.`, 1.4);
    return false;
  }
  player.money -= item.price;
  if (item.kind === 'weapon') {
    const spec = WEAPONS[item.id];
    player.guns.primary = { id: item.id, mag: spec.mag, reserve: spec.reserve };
    player.slot = 'primary';
    player.reloadLeft = 0;
  } else if (item.kind === 'armor') {
    player.armor = 100;
  } else {
    player.grenades[item.id] = Math.min(2, player.grenades[item.id] + 1);
  }
  say(`${item.name} bought.`, 1.3);
  return true;
}
