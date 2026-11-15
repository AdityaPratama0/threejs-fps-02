// The DOM HUD: scores, clock, health, money, ammo, killfeed, buy menu and the round overlays.
// It reads the store and writes text and classes; it never mutates the simulation and never
// builds elements per frame (the markup lives in index.html).
import { state } from './store.js';
import { BUY_ITEMS } from './buy.js';
import { canBuyNow } from './rounds.js';
import { currentGun, currentSpec } from './agents.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud() {
  const hud = el('hud');
  const scoreAttack = el('score-attack');
  const scoreDefend = el('score-defend');
  const roundLabel = el('round-label');
  const clock = el('clock');
  const healthValue = el('health-value');
  const armorValue = el('armor-value');
  const moneyValue = el('money-value');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoBlock = el('ammo');
  const weaponName = el('weapon-name');
  const grenadeCounts = el('grenade-counts');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const killfeed = el('killfeed');
  const message = el('message');
  const bombReadout = el('bomb-readout');
  const buyMenu = el('buy-menu');
  const buyList = el('buy-list');
  const buyMoney = el('buy-money');
  const buyClose = el('buy-close');
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const playButton = el('play');
  const flash = el('flash');
  const damageArc = el('damage-arc');

  const cached = {
    attack: -1,
    defend: -1,
    round: -1,
    clock: '',
    health: -1,
    armor: -1,
    money: -1,
    mag: -1,
    reserve: -1,
    weapon: '',
    grenades: '',
    killfeed: '',
    message: '',
    bomb: '',
    hit: false,
    hitKill: false,
    phase: '',
    buyOpen: null,
    buyMoney: -1,
    buyEnabled: null,
  };

  const buttons = new Map();
  for (const item of BUY_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.item = item.id;
    const label = document.createElement('span');
    label.className = 'buy-name';
    label.textContent = item.name;
    const price = document.createElement('span');
    price.className = 'buy-price';
    price.textContent = `$${item.price}`;
    button.append(label, price);
    buyList.appendChild(button);
    buttons.set(item.id, button);
  }

  function clockText() {
    if (state.phase === 'freeze') return state.phaseTimer.toFixed(0);
    if (state.phase === 'live') {
      if (state.bomb.state === 'planted') {
        return state.bomb.timer.toFixed(1);
      }
      return state.phaseTimer.toFixed(0);
    }
    if (state.phase === 'over') return state.phaseTimer.toFixed(0);
    return '0';
  }

  return {
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyList.addEventListener('click', (event) => {
        const button = event.target.closest('.buy-item');
        if (button === null) return;
        handler(button.dataset.item);
      });
    },
    onBuyClose(handler) {
      buyClose.addEventListener('click', handler);
    },
    setOverlay(mode, detail = '') {
      if (mode === null) {
        overlay.hidden = true;
        return;
      }
      overlay.hidden = false;
      if (mode === 'start') {
        overlayTitle.textContent = 'Saltgate';
        overlayCopy.textContent = 'Two teams, one crate, four terminals of dust. Dockers plant at A or B; Customs defuse. First to 7 rounds.';
        playButton.textContent = 'Click to play';
      } else if (mode === 'paused') {
        overlayTitle.textContent = 'Held';
        overlayCopy.textContent = 'The round is paused. Click to get back on the line.';
        playButton.textContent = 'Click to resume';
      } else if (mode === 'end') {
        overlayTitle.textContent = state.winner === 'attack' ? 'Dockers take the match' : 'Customs take the match';
        overlayCopy.textContent = `${state.scoreAttack} to ${state.scoreDefend}. ${detail}`;
        playButton.textContent = 'Play again';
      }
    },
    update() {
      const player = state.player;
      if (state.scoreAttack !== cached.attack) {
        cached.attack = state.scoreAttack;
        scoreAttack.textContent = String(state.scoreAttack);
      }
      if (state.scoreDefend !== cached.defend) {
        cached.defend = state.scoreDefend;
        scoreDefend.textContent = String(state.scoreDefend);
      }
      if (state.round !== cached.round) {
        cached.round = state.round;
        roundLabel.textContent = `Round ${state.round}`;
      }
      const clockNow = clockText();
      if (clockNow !== cached.clock) {
        cached.clock = clockNow;
        clock.textContent = clockNow;
      }
      if (state.phase !== cached.phase) {
        cached.phase = state.phase;
        hud.dataset.phase = state.phase;
      }

      if (player !== null) {
        const health = Math.max(0, Math.round(player.health));
        if (health !== cached.health) {
          cached.health = health;
          healthValue.textContent = String(health);
          healthValue.classList.toggle('low', health <= 25);
        }
        const armor = Math.round(player.armor);
        if (armor !== cached.armor) {
          cached.armor = armor;
          armorValue.textContent = String(armor);
        }
        const money = Math.round(player.money);
        if (money !== cached.money) {
          cached.money = money;
          moneyValue.textContent = `$${money}`;
        }
        const gun = currentGun(player);
        const spec = currentSpec(player);
        const mag = gun === null ? 0 : gun.mag;
        const reserve = gun === null ? 0 : gun.reserve;
        if (mag !== cached.mag) {
          cached.mag = mag;
          ammoMag.textContent = String(mag);
        }
        if (reserve !== cached.reserve) {
          cached.reserve = reserve;
          ammoReserve.textContent = `/ ${reserve}`;
        }
        const name = spec === null ? (player.slot === 'cinder' ? 'Cinder' : 'Dazzle') : spec.name;
        if (name !== cached.weapon) {
          cached.weapon = name;
          weaponName.textContent = name;
        }
        const grenades = `Cinder ${player.grenades.cinder}  Dazzle ${player.grenades.dazzle}`;
        if (grenades !== cached.grenades) {
          cached.grenades = grenades;
          grenadeCounts.textContent = grenades;
        }
        ammoBlock.classList.toggle('empty', mag === 0);
        const spread = 10 + (player.bloom + spec?.spread * 8 + player.recoilPitch * 8) * 260;
        crosshair.style.setProperty('--spread', `${Math.min(46, spread).toFixed(1)}px`);
      }

      const hit = state.hitMarker > 0;
      if (hit !== cached.hit || state.hitKill !== cached.hitKill) {
        cached.hit = hit;
        cached.hitKill = state.hitKill;
        hitmarker.classList.toggle('on', hit);
        hitmarker.classList.toggle('kill', hit && state.hitKill);
      }

      if (state.killfeed.length > 0) {
        let signature = '';
        for (const line of state.killfeed) signature += `${line.killer}>${line.victim}:${line.part}|`;
        if (signature !== cached.killfeed) {
          cached.killfeed = signature;
          killfeed.innerHTML = '';
          for (const line of state.killfeed) {
            const row = document.createElement('div');
            row.className = 'feed-row';
            const killer = document.createElement('b');
            killer.textContent = line.killer;
            killer.dataset.team = line.killerTeam;
            const victim = document.createElement('span');
            victim.textContent = line.victim;
            const part = document.createElement('i');
            part.textContent = line.part === 'head' ? 'head' : line.part === 'legs' ? 'legs' : '';
            row.append(killer, part, victim);
            killfeed.appendChild(row);
          }
        }
      }

      if (state.message !== cached.message) {
        cached.message = state.message;
        message.textContent = state.message;
      }
      message.classList.toggle('on', state.messageTimer > 0 && state.message !== '');

      const bombText = state.bomb.state === 'planted'
        ? `BOMB PLANTED ${state.bomb.timer.toFixed(1)}s`
        : state.bomb.state === 'dropped'
          ? 'BOMB DROPPED'
          : state.bomb.state === 'defused'
            ? 'BOMB DEFUSED'
            : state.bomb.state === 'exploded'
              ? 'BOMB DETONATED'
              : 'BOMB CARRIED';
      if (bombText !== cached.bomb) {
        cached.bomb = bombText;
        bombReadout.textContent = bombText;
        bombReadout.classList.toggle('planted', state.bomb.state === 'planted');
      }

      const flashLevel = state.flash;
      if (flashLevel > 0.01) {
        flash.style.opacity = String(Math.min(1, flashLevel / 2.4));
        flash.hidden = false;
      } else if (!flash.hidden) {
        flash.hidden = true;
      }

      const damage = state.damageFlash;
      if (damage > 0.01) {
        damageArc.hidden = false;
        damageArc.style.opacity = String(Math.min(0.9, damage * 2.4));
        damageArc.style.transform = `translate(-50%, -50%) rotate(${state.damageFrom}rad)`;
      } else if (!damageArc.hidden) {
        damageArc.hidden = true;
      }

      const open = state.buyOpen;
      if (open !== cached.buyOpen) {
        cached.buyOpen = open;
        buyMenu.hidden = !open;
      }
      if (open) {
        const money = Math.round(player?.money ?? 0);
        if (money !== cached.buyMoney) {
          cached.buyMoney = money;
          buyMoney.textContent = `$${money}`;
        }
        const enabled = canBuyNow();
        if (enabled !== cached.buyEnabled) {
          cached.buyEnabled = enabled;
          buyMenu.dataset.enabled = String(enabled);
        }
        for (const [id, button] of buttons) {
          const item = BUY_ITEMS.find((entry) => entry.id === id);
          button.classList.toggle('unaffordable', money < item.price);
          button.classList.toggle('owned', id === 'armor' && player !== null && player.armor >= 100);
        }
      }
    },
  };
}
