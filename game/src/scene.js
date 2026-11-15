// The map's look, built from map.js data: clad walls, rusted containers, concrete blocks, crates,
// painted bomb floors, lamp posts and their light. Geometry is merged into a few meshes per
// material so the whole terminal costs a handful of draw calls; nothing here simulates.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { BOXES, CYLINDERS, LAMPS, SITES } from './map.js';

const MATERIALS = {
  clad: { color: PALETTE.surface, roughness: 0.88, metalness: 0.12 },
  rust: { color: PALETTE.wound, roughness: 0.74, metalness: 0.18 },
  crate: { color: PALETTE.hairline, roughness: 0.92, metalness: 0.02 },
  concrete: { color: PALETTE.muted, roughness: 0.95, metalness: 0.01 },
  mark: { color: PALETTE.accent, roughness: 0.7, metalness: 0.0 },
  line: { color: PALETTE.muted, roughness: 0.8, metalness: 0.0 },
};

export function createStage(scene) {
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 42, 96);

  const materials = {};
  for (const [name, spec] of Object.entries(MATERIALS)) {
    materials[name] = new THREE.MeshStandardMaterial(spec);
  }
  materials.mark.emissive = new THREE.Color(PALETTE.accent);
  materials.mark.emissiveIntensity = 0.22;

  const byMaterial = new Map();
  for (const item of BOXES) {
    const list = byMaterial.get(item.mat) ?? [];
    list.push(item);
    byMaterial.set(item.mat, list);
  }

  const merged = new THREE.Group();
  scene.add(merged);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 18);

  for (const [matName, items] of byMaterial) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const count = items.length;
    const instanced = new THREE.InstancedMesh(geometry, materials[matName], count);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    items.forEach((item, index) => {
      position.set(item.x, item.y + item.h / 2, item.z);
      scale.set(item.w, item.h, item.d);
      matrix.compose(position, quaternion, scale);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.castShadow = matName !== 'mark' && matName !== 'line';
    instanced.receiveShadow = matName !== 'mark' && matName !== 'line';
    instanced.instanceMatrix.needsUpdate = true;
    merged.add(instanced);
  }

  // Cylinders (silos and pipes) are few, so each is its own mesh.
  for (const item of CYLINDERS) {
    const mesh = new THREE.Mesh(unitCylinder, materials[item.mat]);
    mesh.scale.set(item.r, item.h, item.r);
    mesh.position.set(item.x, item.h / 2, item.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    merged.add(mesh);
  }

  // The floor slab, read as wet concrete under the lamps.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(58, 66),
    new THREE.MeshStandardMaterial({ color: PALETTE.surface, roughness: 0.7, metalness: 0.2 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Painted site letters on the floor, so the two objectives read at a glance.
  for (const site of SITES) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = PALETTE.accent;
    context.globalAlpha = 0.5;
    context.font = 'bold 104px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(site.id, 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(site.id === 'A' ? 20.5 : -20.5, 0.02, -13.5);
    plane.renderOrder = 1;
    scene.add(plane);
  }

  // Lamps: a post, a head and a short-range point light with no shadows (the key light does that).
  const postGeometry = new THREE.CylinderGeometry(0.06, 0.08, 5.2, 8);
  const headGeometry = new THREE.BoxGeometry(0.5, 0.14, 0.34);
  const postMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.hairline, roughness: 0.8, metalness: 0.3 });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.ink,
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  for (const lamp of LAMPS) {
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(lamp.x, 2.6, lamp.z);
    post.castShadow = true;
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(lamp.x, lamp.h, lamp.z);
    scene.add(post, head);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 90, 21, 1.7);
    light.position.set(lamp.x, lamp.h - 0.2, lamp.z);
    scene.add(light);
  }

  const hemi = new THREE.HemisphereLight(new THREE.Color(PALETTE.muted), new THREE.Color(PALETTE.canvas), 3.1);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.6);
  key.position.set(16, 26, 12);
  key.target.position.set(0, 0, -8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -34;
  key.shadow.camera.right = 34;
  key.shadow.camera.top = 34;
  key.shadow.camera.bottom = -34;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.035;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.9);
  fill.position.set(-18, 14, 16);
  scene.add(fill);

  return { materials, merged };
}
