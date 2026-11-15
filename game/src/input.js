// Browser input, kept dumb: key set, mouse delta, buttons, and the pointer lock that makes the
// mouse a look axis. Nothing here knows what the game does with a key.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    locked: false,
    firing: false,
    lookX: 0,
    lookY: 0,
    pressed: new Set(),
    wheel: 0,
  };

  function onKeyDown(event) {
    if (event.repeat) {
      if (event.code === 'Space') event.preventDefault();
      return;
    }
    keys.add(event.code);
    input.pressed.add(event.code);
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    keys.clear();
    input.firing = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!input.locked) return;
    input.lookX += event.movementX;
    input.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!input.locked) return;
    if (event.button === 0) input.firing = true;
    if (event.button === 2) {
      input.pressed.add('MouseRight');
      event.preventDefault();
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) input.firing = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('wheel', (event) => {
    if (!input.locked) return;
    input.wheel += Math.sign(event.deltaY);
  }, { passive: true });

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) {
      keys.clear();
      input.firing = false;
    }
  });

  return {
    input,
    get keys() {
      return input.keys;
    },
    get firing() {
      return input.firing;
    },
    get locked() {
      return input.locked;
    },
    requestLock() {
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const x = input.lookX;
      const y = input.lookY;
      input.lookX = 0;
      input.lookY = 0;
      return [x, y];
    },
    consume(code) {
      if (!input.pressed.has(code)) return false;
      input.pressed.delete(code);
      return true;
    },
    clearPressed() {
      input.pressed.clear();
      input.wheel = 0;
    },
    takeWheel() {
      const steps = input.wheel;
      input.wheel = 0;
      return steps;
    },
  };
}
