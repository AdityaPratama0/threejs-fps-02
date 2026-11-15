// The map, as data. The simulation reads colliders, sites and spawns; the view reads boxes,
// cylinders and lamps to build meshes. Nothing here imports three or touches the DOM, so the
// arena can be tested without a renderer.
//
// Saltgate: a salt terminal cut into two lanes. The Dockers come from the south yard, the
// Customs hold the weighbridge (A) and the cistern (B) at the north end. Mid doors and two lane
// seams let either side rotate.

export const TEAMS = {
  attack: { id: 'attack', name: 'Dockers', colour: '#de7b3d' },
  defend: { id: 'defend', name: 'Customs', colour: '#dfe6dc' },
};

export const SITES = [
  { id: 'A', name: 'Weighbridge', minX: 14, maxX: 24, minZ: -20, maxZ: -6, x: 20.5, z: -13.5 },
  { id: 'B', name: 'Cistern', minX: -24, maxX: -14, minZ: -20, maxZ: -6, x: -20.5, z: -13.5 },
];

export const SPAWNS = {
  attack: [
    { x: 0, z: 25 },
    { x: -4, z: 26 },
    { x: 4, z: 26 },
    { x: 0, z: 22 },
  ],
  defend: [
    { x: 0, z: -30 },
    { x: -5, z: -29 },
    { x: 5, z: -29 },
    { x: 0, z: -27 },
  ],
};

export const BOUNDS = { minX: -28, maxX: 28, minZ: -34, maxZ: 30 };

// box: centred on x and z, sitting on y, sized w by h by d.
function box(x, z, w, d, h, mat, y = 0, solid = true) {
  return { x, z, w, d, h, mat, y, solid };
}

export const BOXES = [
  // Perimeter.
  box(0, 30, 56, 1.2, 5, 'clad'),
  box(0, -34, 56, 1.2, 5, 'clad'),
  box(-28, -2, 1.2, 64, 5, 'clad'),
  box(28, -2, 1.2, 64, 5, 'clad'),

  // South divider, with the west seam, mid doors and the east arch left open.
  box(-23, 18, 10, 1, 4.2, 'clad'),
  box(-8, 18, 12, 1, 4.2, 'clad'),
  box(8, 18, 12, 1, 4.2, 'clad'),
  box(23, 18, 10, 1, 4.2, 'clad'),

  // North divider, open at both sites and at mid.
  box(-24, -24, 8, 1, 4.2, 'clad'),
  box(-8, -24, 8, 1, 4.2, 'clad'),
  box(8, -24, 8, 1, 4.2, 'clad'),
  box(24, -24, 8, 1, 4.2, 'clad'),

  // Mid walls: two seams each, one into the lane, one into a site.
  box(10, 13, 1, 10, 4, 'clad'),
  box(10, -3, 1, 10, 4, 'clad'),
  box(10, -19, 1, 10, 4, 'clad'),
  box(-10, 13, 1, 10, 4, 'clad'),
  box(-10, -3, 1, 10, 4, 'clad'),
  box(-10, -19, 1, 10, 4, 'clad'),

  // Attack yard cover.
  box(-8, 23, 2.2, 2.2, 1.7, 'rust'),
  box(8, 23, 2.2, 2.2, 1.7, 'rust'),
  box(-3.6, 20.5, 3.2, 0.8, 1.1, 'concrete'),

  // Mid.
  box(0, 10, 5, 2.6, 2.6, 'rust'),
  box(-4.5, 4, 2, 2, 1.8, 'crate'),
  box(4.5, 4, 2, 2, 1.8, 'crate'),
  box(0, -8, 1.6, 1.6, 4, 'concrete'),
  box(-6, -15, 4, 1, 1.2, 'concrete'),
  box(6, -15, 4, 1, 1.2, 'concrete'),
  box(0, -18, 2.2, 2.2, 1.6, 'crate'),

  // East lane.
  box(13, 12, 2, 2, 1.5, 'crate'),
  box(22, 9, 2.8, 6, 2.8, 'rust'),
  box(13.5, -1, 2, 2, 1.7, 'crate'),
  box(23.5, -2, 2, 2, 2.4, 'rust'),
  box(17, -5, 1.2, 3, 1.4, 'concrete'),

  // Site A: weighbridge, silo, crates.
  box(18, -9, 7, 2.4, 0.65, 'concrete'),
  box(15, -12.5, 2, 2, 1.7, 'crate'),
  box(19.5, -19, 2.2, 2.2, 1.7, 'crate'),
  box(24.5, -12, 2, 2, 2.2, 'rust'),

  // West lane.
  box(-13, 12, 2, 2, 1.5, 'crate'),
  box(-22, 9, 2.8, 6, 2.8, 'rust'),
  box(-13.5, -1, 2, 2, 1.7, 'crate'),
  box(-23.5, -2, 2, 2, 2.4, 'rust'),
  box(-17, -5, 1.2, 3, 1.4, 'concrete'),

  // Site B.
  box(-18, -9, 7, 2.4, 0.65, 'concrete'),
  box(-15, -12.5, 2, 2, 1.7, 'crate'),
  box(-19.5, -19, 2.2, 2.2, 1.7, 'crate'),
  box(-24.5, -12, 2, 2, 2.2, 'rust'),

  // North corridor and defend yard.
  box(-11, -28, 2.2, 2.2, 1.7, 'crate'),
  box(11, -28, 2.2, 2.2, 1.7, 'crate'),
  box(0, -31.5, 4, 1.2, 1, 'concrete'),
  box(-17, -31, 2, 2, 1.9, 'rust'),
  box(17, -31, 2, 2, 1.9, 'rust'),

  // Painted floors and lane lines, no collision: the site rectangles, the mid threshold and a
  // centre line down each lane so the map reads from the first frame.
  box(19, -13, 8.4, 12, 0.03, 'mark', 0, false),
  box(-19, -13, 8.4, 12, 0.03, 'mark', 0, false),
  box(0, 18, 3.6, 0.5, 0.02, 'mark', 0, false),
  box(0, -24, 7.4, 0.5, 0.02, 'mark', 0, false),
  box(19, 4, 0.22, 22, 0.02, 'mark', 0, false),
  box(-19, 4, 0.22, 22, 0.02, 'mark', 0, false),
  box(0, 2, 0.22, 26, 0.02, 'line', 0, false),
];

export const CYLINDERS = [
  { x: 23, z: -17, r: 2.2, h: 7, mat: 'rust', solid: true },
  { x: 12.5, z: -19, r: 1.5, h: 4.4, mat: 'clad', solid: true },
  { x: -23, z: -17, r: 2.2, h: 6.4, mat: 'clad', solid: true },
  { x: -12.5, z: -19, r: 1.5, h: 5, mat: 'rust', solid: true },
];

export const LAMPS = [
  { x: 11, z: 17, h: 5.2, colour: 'warm' },
  { x: -11, z: 17, h: 5.2, colour: 'warm' },
  { x: 0, z: -23.2, h: 5.2, colour: 'warm' },
  { x: 21, z: -7, h: 4.6, colour: 'warm' },
  { x: -21, z: -7, h: 4.6, colour: 'warm' },
];

export const COLLIDERS = [];

for (const item of BOXES) {
  if (!item.solid) continue;
  COLLIDERS.push({
    minX: item.x - item.w / 2,
    maxX: item.x + item.w / 2,
    minY: item.y,
    maxY: item.y + item.h,
    minZ: item.z - item.d / 2,
    maxZ: item.z + item.d / 2,
  });
}
for (const item of CYLINDERS) {
  if (!item.solid) continue;
  const half = item.r * 0.86;
  COLLIDERS.push({
    minX: item.x - half,
    maxX: item.x + half,
    minY: 0,
    maxY: item.h,
    minZ: item.z - half,
    maxZ: item.z + half,
  });
}

export function siteAt(x, z) {
  for (const site of SITES) {
    if (x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ) return site;
  }
  return null;
}

