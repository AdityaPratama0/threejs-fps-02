// The render side of the match: fighter meshes, the first-person weapon in the player's hands,
// tracer and muzzle pools, impacts, grenades and the bomb. It only reads the state store, and
// every pool is allocated once, so a busy round makes no garbage besides three's own matrices.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { TEAMS } from './map.js';
import { MOVE } from './config.js';
import { state } from './store.js';

const TRACERS = 20;
const FLASHES = 16;
const SPARKS = 24;
const GRENADE_MESHES = 8;

const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();

function boxMaterial(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
}

function makeFighter(team) {
  const teamColor = new THREE.Color(TEAMS[team].colour);
  const cloth = boxMaterial(PALETTE.hairline, 0.9, 0.02);
  const skin = boxMaterial(PALETTE.muted, 0.8, 0.02);
  const band = boxMaterial(teamColor, 0.65, 0.1);
  const group = new THREE.Group();

  const legGeometry = new THREE.BoxGeometry(0.16, 0.82, 0.2);
  const leftLeg = new THREE.Mesh(legGeometry, cloth);
  leftLeg.position.set(-0.1, 0.41, 0);
  const rightLeg = new THREE.Mesh(legGeometry, cloth);
  rightLeg.position.set(0.1, 0.41, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.6, 0.26), cloth);
  torso.position.set(0, 1.12, 0);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.28), band);
  vest.position.set(0, 1.22, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10), skin);
  head.position.set(0, 1.55, 0);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), band);
  helmet.position.set(0, 1.57, 0);
  const armGeometry = new THREE.BoxGeometry(0.11, 0.48, 0.11);
  const leftArm = new THREE.Mesh(armGeometry, cloth);
  leftArm.position.set(-0.29, 1.13, -0.04);
  const rightArm = new THREE.Mesh(armGeometry, cloth);
  rightArm.position.set(0.29, 1.13, -0.04);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.52), boxMaterial(PALETTE.surface, 0.6, 0.3));
  gun.position.set(0.2, 1.2, -0.36);
  group.add(leftLeg, rightLeg, torso, vest, head, helmet, leftArm, rightArm, gun);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return { group, gun };
}

// One viewmodel, posed per slot: a pistol sits closer and smaller than a rifle, and the
// grenade slots swap the gun out for a thrown body. Offsets are camera-local metres.
const GUN_POSE = {
  tally: { y: -0.235, z: -0.46, scale: 0.70, rifle: true },
  rook: { y: -0.225, z: -0.50, scale: 0.80, rifle: true },
  wasp: { y: -0.235, z: -0.47, scale: 0.74, rifle: true },
  breaker: { y: -0.225, z: -0.50, scale: 0.86, rifle: true },
  cinder: { y: -0.26, z: -0.44, scale: 0.62, rifle: false },
  dazzle: { y: -0.26, z: -0.44, scale: 0.62, rifle: false },
};

function makeViewWeapon(camera) {
  // Held in the lower right, angled slightly toward the centre: a dark stock and grip, a bright
  // receiver and handguard, an orange front sight. Small enough on screen to leave the map clear.
  const group = new THREE.Group();
  group.position.set(0.26, -0.23, -0.5);
  group.rotation.set(0.02, 0.1, 0.03);
  group.scale.setScalar(0.82);
  camera.add(group);

  const steel = boxMaterial(PALETTE.muted, 0.42, 0.55);
  const dark = boxMaterial(PALETTE.hairline, 0.7, 0.2);
  const rubber = boxMaterial(PALETTE.surface, 0.95, 0.02);

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.085, 0.26), steel);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), dark);
  handguard.position.set(0, 0.01, -0.25);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 10), steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.44);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.075, 0.19), rubber);
  stock.position.set(0, -0.008, 0.22);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.13, 0.055), dark);
  magazine.position.set(0, -0.1, -0.06);
  magazine.rotation.x = 0.14;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.05), rubber);
  grip.position.set(0, -0.09, 0.07);
  grip.rotation.x = -0.22;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.03, 0.02), boxMaterial(PALETTE.accent, 0.4, 0.2));
  sight.position.set(0, 0.058, -0.37);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.2), dark);
  rail.position.set(0, 0.05, -0.1);
  group.add(receiver, handguard, barrel, stock, magazine, grip, sight, rail);

  const grenade = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 9), boxMaterial(PALETTE.wound, 0.72, 0.2));
  grenade.position.set(0, 0.01, -0.12);
  grenade.visible = false;
  group.add(grenade);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0, 0.012, -0.55);
  flash.visible = false;
  group.add(flash);

  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6, 2);
  light.position.set(0, 0.02, -0.5);
  group.add(light);
  const fill = new THREE.PointLight(new THREE.Color(PALETTE.ink), 1.4, 1.1, 2);
  fill.position.set(0.12, 0.3, 0.12);
  group.add(fill);
  const rifleParts = [receiver, handguard, barrel, stock, magazine, grip, sight, rail];
  return { group, flash, light, grenade, rifleParts };
}

export function createView(scene, camera) {
  const fighters = new Map();
  const weapon = makeViewWeapon(camera);

  const tracerGeometry = new THREE.BoxGeometry(1, 0.022, 0.022);
  const tracerMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.75, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }

  const flashGeometry = new THREE.PlaneGeometry(0.5, 0.5);
  const flashes = [];
  for (let i = 0; i < FLASHES; i += 1) {
    const mesh = new THREE.Mesh(flashGeometry, new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    mesh.visible = false;
    scene.add(mesh);
    flashes.push({ mesh, life: 0 });
  }

  const sparkGeometry = new THREE.PlaneGeometry(0.12, 0.12);
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const mesh = new THREE.Mesh(sparkGeometry, new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0 });
  }

  const grenadeGeometry = new THREE.SphereGeometry(0.1, 10, 8);
  const grenadeMeshes = [];
  for (let i = 0; i < GRENADE_MESHES; i += 1) {
    const mesh = new THREE.Mesh(grenadeGeometry, boxMaterial(PALETTE.wound, 0.7, 0.2));
    mesh.visible = false;
    scene.add(mesh);
    grenadeMeshes.push(mesh);
  }

  const bombGroup = new THREE.Group();
  scene.add(bombGroup);
  const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.26), boxMaterial(PALETTE.surface, 0.7, 0.3));
  const bombStripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.28), new THREE.MeshBasicMaterial({ color: PALETTE.accent }));
  bombStripe.position.y = 0.04;
  const bombLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 4, 2);
  bombLight.position.y = 0.2;
  bombGroup.add(bombBody, bombStripe, bombLight);
  bombGroup.visible = false;

  let flashTimer = 0;
  let kick = 0;
  let swayX = 0;
  let swayY = 0;

  function spawnTracer(x, y, z, ex, ey, ez) {
    let slot = tracers.find((entry) => entry.life <= 0);
    if (slot === undefined) slot = tracers[0];
    tmpPos.set(x, y, z);
    tmpDir.set(ex - x, ey - y, ez - z);
    const length = tmpDir.length();
    if (length < 0.2) return;
    tmpDir.divideScalar(length);
    slot.mesh.position.set((x + ex) / 2, (y + ey) / 2, (z + ez) / 2);
    tmpQuat.setFromUnitVectors(UP, tmpDir);
    slot.mesh.quaternion.copy(tmpQuat);
    slot.mesh.scale.set(0.11, length, 0.11);
    slot.mesh.visible = true;
    slot.life = 0.07;
  }

  function spawnFlash(x, y, z) {
    let slot = flashes.find((entry) => entry.life <= 0);
    if (slot === undefined) slot = flashes[0];
    slot.mesh.position.set(x, y, z);
    slot.mesh.rotation.set(0, Math.random() * 6.28, Math.random() * 6.28);
    slot.mesh.visible = true;
    slot.life = 0.06;
  }

  function spawnSpark(x, y, z) {
    let slot = sparks.find((entry) => entry.life <= 0);
    if (slot === undefined) slot = sparks[0];
    slot.mesh.position.set(x, y, z);
    slot.mesh.rotation.set(Math.random() * 3, Math.random() * 6.28, 0);
    slot.mesh.visible = true;
    slot.life = 0.18;
  }

  return {
    register(playerRoster) {
      for (const agent of playerRoster) {
        const fighter = makeFighter(agent.team);
        scene.add(fighter.group);
        fighters.set(agent.id, fighter);
      }
    },

    handleEvent(event) {
      if (event.kind === 'shot') {
        const shot = event.a;
        spawnTracer(shot.x, shot.y, shot.z, shot.ex, shot.ey, shot.ez);
        spawnFlash(shot.x, shot.y - 0.06, shot.z);
        if (shot.agent === state.player) {
          kick = Math.min(1, kick + 0.4);
          flashTimer = 0.05;
        }
      } else if (event.kind === 'explode') {
        const g = event.a;
        spawnSpark(g.x, g.y, g.z);
        spawnSpark(g.x, g.y + 0.3, g.z);
        if (g.kind === 'cinder') {
          for (let i = 0; i < 4; i += 1) spawnSpark(g.x + (Math.random() - 0.5) * 1.6, g.y + Math.random() * 0.8, g.z + (Math.random() - 0.5) * 1.6);
        }
      } else if (event.kind === 'hurt' || event.kind === 'death') {
        const target = event.a;
        spawnSpark(target.body.pos.x, target.body.pos.y + target.body.height * 0.6, target.body.pos.z);
      } else if (event.kind === 'plant') {
        bombGroup.position.set(event.a.position.x, 0.13, event.a.position.z);
      }
    },

    update(dt) {
      const player = state.player;
      for (const agent of state.agents) {
        const fighter = fighters.get(agent.id);
        if (fighter === undefined) continue;
        fighter.group.visible = agent.alive && agent !== player;
        if (!agent.alive) continue;
        fighter.group.position.set(agent.body.pos.x, agent.body.pos.y, agent.body.pos.z);
        fighter.group.rotation.y = agent.yaw;
        const crouchScale = agent.body.height / MOVE.standHeight;
        fighter.group.scale.set(1, crouchScale, 1);
        fighter.gun.rotation.x = -agent.pitch * 0.6;
      }

      if (player !== null) {
        weapon.group.visible = player.alive;
        const pose = GUN_POSE[player.slot] ?? GUN_POSE.tally;
        for (const part of weapon.rifleParts) part.visible = pose.rifle;
        weapon.grenade.visible = !pose.rifle;
        const speed = Math.hypot(player.body.vel.x, player.body.vel.z);
        swayX += ((Math.sin(state.time * 7) * speed * 0.0016) - swayX) * Math.min(1, dt * 6);
        swayY += ((Math.abs(Math.cos(state.time * 7)) * speed * 0.0012) - swayY) * Math.min(1, dt * 6);
        const bob = player.body.onGround ? 1 : 1.4;
        kick = Math.max(0, kick - dt * 4.2);
        weapon.group.position.set(0.25 + swayX, pose.y - swayY * bob - kick * 0.018, pose.z + kick * 0.045);
        weapon.group.rotation.set(0.02 + kick * 0.09, 0.1, 0.03);
        weapon.group.scale.setScalar(pose.scale * (1 + kick * 0.02));
        flashTimer = Math.max(0, flashTimer - dt);
        weapon.flash.visible = flashTimer > 0;
        weapon.flash.rotation.z += dt * 20;
        weapon.flash.position.z = pose.rifle ? -0.56 : -0.16;
        weapon.light.intensity = flashTimer > 0 ? 18 : 0;
      }

      for (const tracer of tracers) {
        if (tracer.life <= 0) continue;
        tracer.life -= dt;
        tracer.mesh.material.opacity = Math.max(0, tracer.life / 0.07) * 0.75;
        if (tracer.life <= 0) tracer.mesh.visible = false;
      }
      for (const flash of flashes) {
        if (flash.life <= 0) continue;
        flash.life -= dt;
        flash.mesh.material.opacity = Math.max(0, flash.life / 0.06);
        if (flash.life <= 0) flash.mesh.visible = false;
      }
      for (const spark of sparks) {
        if (spark.life <= 0) continue;
        spark.life -= dt;
        spark.mesh.material.opacity = Math.max(0, spark.life / 0.18) * 0.8;
        spark.mesh.lookAt(camera.position);
        if (spark.life <= 0) spark.mesh.visible = false;
      }

      const grenades = state.grenades;
      for (let i = 0; i < grenadeMeshes.length; i += 1) {
        const mesh = grenadeMeshes[i];
        const g = grenades[i];
        if (g === undefined) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        mesh.position.set(g.x, g.y, g.z);
      }

      const bomb = state.bomb;
      const visible = bomb.state === 'planted' || bomb.state === 'dropped';
      bombGroup.visible = visible;
      if (visible) {
        bombGroup.position.set(bomb.position.x, 0.13, bomb.position.z);
        bombGroup.rotation.y += dt * 0.4;
        const pulse = bomb.state === 'planted' ? Math.max(0, Math.sin(state.time * (bomb.timer < 10 ? 18 : 8))) : 0;
        bombLight.intensity = pulse * 6;
      } else if (bomb.state === 'carried') {
        // Carried means out of sight: the HUD's BOMB CARRIED line is what tells the player.
        bombGroup.visible = false;
        bombLight.intensity = 0;
      }
    },
  };
}
