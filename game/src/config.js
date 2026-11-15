// Every tunable number in one place: the tick, movement feel, weapon tables, grenades, the
// economy, the round clock and bot senses. Nothing else in the game hard-codes a balance value.

export const TICK = 1 / 60;
export const MATCH_POINTS = 7;

export const MOVE = {
  radius: 0.36,
  standHeight: 1.76,
  crouchHeight: 1.18,
  standEye: 1.58,
  crouchEye: 1.06,
  speed: 5.3,
  crouchSpeed: 2.5,
  accelGround: 56,
  accelAir: 11,
  friction: 10,
  gravity: 21,
  jump: 6.1,
};

// spread and moveSpread are radians. moveSpread is added in full at walking speed, so a shot
// taken on the move lands far from the sights and stopping is what makes a rifle accurate.
export const WEAPONS = {
  tally: {
    name: 'Tally', slot: 'sidearm', price: 0, damage: 26, headScale: 3.6, legScale: 0.75,
    rpm: 380, mag: 12, reserve: 48, reload: 1.55, spread: 0.0045, moveSpread: 0.055,
    recoil: 0.014, kick: 0.03, range: 60, pellets: 1, reward: 300, sound: 'pistol',
  },
  rook: {
    name: 'Rook-9', slot: 'primary', price: 2700, damage: 34, headScale: 3.7, legScale: 0.72,
    rpm: 600, mag: 30, reserve: 90, reload: 2.2, spread: 0.0024, moveSpread: 0.07,
    recoil: 0.011, kick: 0.026, range: 90, pellets: 1, reward: 300, sound: 'rifle',
  },
  wasp: {
    name: 'Wasp', slot: 'primary', price: 1250, damage: 22, headScale: 3.2, legScale: 0.7,
    rpm: 860, mag: 25, reserve: 100, reload: 1.75, spread: 0.0065, moveSpread: 0.05,
    recoil: 0.0075, kick: 0.016, range: 55, pellets: 1, reward: 600, sound: 'smg',
  },
  breaker: {
    name: 'Breaker', slot: 'primary', price: 1100, damage: 15, headScale: 2.6, legScale: 0.62,
    rpm: 78, mag: 8, reserve: 32, reload: 2.7, spread: 0.065, moveSpread: 0.09,
    recoil: 0.05, kick: 0.07, range: 28, pellets: 8, reward: 900, sound: 'shotgun',
  },
};

export const GRENADES = {
  cinder: { name: 'Cinder', price: 300, fuse: 2.4, radius: 8, damage: 110, sound: 'frag' },
  dazzle: { name: 'Dazzle', price: 200, fuse: 1.6, radius: 11, damage: 0, sound: 'flash' },
};

export const ECONOMY = {
  start: 800,
  max: 9000,
  win: 3250,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  plant: 300,
  defuse: 300,
  armor: 650,
  kit: 400,
};

export const ROUND = {
  freeze: 6,
  live: 100,
  over: 5.5,
  plant: 3.2,
  defuse: 7,
  defuseKit: 4.5,
  bomb: 40,
  buyWindow: 9,
};

export const BOT = {
  fov: Math.cos((100 * Math.PI) / 360),
  sight: 46,
  reactMin: 0.22,
  reactMax: 0.5,
  aimSpeed: 4.5,
  aimError: 0.045,
  burstShots: 5,
  burstPause: 0.28,
  hearRadius: 26,
};
