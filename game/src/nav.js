// The bots' waypoint graph. Nodes sit in the lanes, seams and site pockets; an edge is kept only
// when a body can walk it, checked against the same colliders the player collides with. Paths are
// found on that graph, so a bot walks the map's routes instead of grinding into a crate.
import { segmentBlocked } from './collision.js';

const RAW = [
  ['s0', 0, 26], ['s1', -6, 25], ['s2', 6, 25], ['s3', 2.6, 21],
  ['seamW', -16, 17], ['seamM', 0, 16.5], ['seamE', 16, 17],
  ['yardW', -16, 24], ['yardE', 16, 24],
  ['midS', 0, 12], ['midC', 0, 6], ['midN', 0, -3], ['midNN', 0, -11],
  ['midSW', -6, 10], ['midSE', 6, 10], ['midNW', -5, -8], ['midNE', 5, -8],
  ['eastS', 14, 12], ['east1', 22, 9], ['east2', 23, 2], ['east3', 18, -4], ['eastN', 23, -9],
  ['westS', -14, 12], ['west1', -22, 9], ['west2', -23, 2], ['west3', -18, -4], ['westN', -23, -9],
  ['aSite', 19, -12], ['aBox', 16, -18], ['aBack', 22, -20], ['aMouth', 19, -23],
  ['bSite', -19, -12], ['bBox', -16, -18], ['bBack', -22, -20], ['bMouth', -19, -23],
  ['northMid', 0, -25], ['corrW', -8, -28], ['corrE', 8, -28],
  ['defYard', 0, -30], ['defW', -14, -30], ['defE', 14, -30],
  ['laneDoorE', 10, 6], ['laneDoorW', -10, 6],
];

export const NODES = RAW.map(([name, x, z], index) => ({ index, name, x, z }));

const byName = new Map(NODES.map((node) => [node.name, node]));

export function nodeByName(name) {
  return byName.get(name);
}

// Walkability: the straight line plus two shoulder lines, so an edge never threads a doorway too
// narrow to pass.
function walkable(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return false;
  const ox = (-dz / length) * 0.42;
  const oz = (dx / length) * 0.42;
  const y = 0.9;
  if (segmentBlocked(a.x, y, a.z, b.x, y, b.z)) return false;
  if (segmentBlocked(a.x + ox, y, a.z + oz, b.x + ox, y, b.z + oz)) return false;
  if (segmentBlocked(a.x - ox, y, a.z - oz, b.x - ox, y, b.z - oz)) return false;
  return true;
}

export const NEIGHBOURS = NODES.map(() => []);

for (let i = 0; i < NODES.length; i += 1) {
  for (let j = i + 1; j < NODES.length; j += 1) {
    const a = NODES[i];
    const b = NODES[j];
    const distance = Math.hypot(a.x - b.x, a.z - b.z);
    if (distance > 15 || !walkable(a, b)) continue;
    NEIGHBOURS[i].push({ index: j, cost: distance });
    NEIGHBOURS[j].push({ index: i, cost: distance });
  }
}

export function nearestNode(x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (const node of NODES) {
    const dx = node.x - x;
    const dz = node.z - z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDist) {
      bestDist = distance;
      best = node.index;
    }
  }
  return best;
}

const dist = new Float64Array(NODES.length);
const prev = new Int32Array(NODES.length);
const settled = new Uint8Array(NODES.length);

// Dijkstra from the goal, so the returned path starts at `from` and ends at `goal`.
export function findPath(fromIndex, goalIndex) {
  dist.fill(Infinity);
  prev.fill(-1);
  settled.fill(0);
  dist[goalIndex] = 0;

  for (let step = 0; step < NODES.length; step += 1) {
    let current = -1;
    let currentDist = Infinity;
    for (let i = 0; i < NODES.length; i += 1) {
      if (!settled[i] && dist[i] < currentDist) {
        current = i;
        currentDist = dist[i];
      }
    }
    if (current === -1) break;
    settled[current] = 1;
    for (const edge of NEIGHBOURS[current]) {
      const next = currentDist + edge.cost;
      if (next < dist[edge.index]) {
        dist[edge.index] = next;
        prev[edge.index] = current;
      }
    }
  }

  if (!Number.isFinite(dist[fromIndex])) return [];
  const path = [];
  let at = fromIndex;
  let guard = 0;
  while (at !== -1 && at !== goalIndex && guard < NODES.length) {
    path.push(at);
    at = prev[at];
    guard += 1;
  }
  path.push(goalIndex);
  return path;
}

export const POSTS = {
  A: ['aSite', 'aBox', 'aBack', 'eastN'],
  B: ['bSite', 'bBox', 'bBack', 'westN'],
  mid: ['midC', 'midN', 'laneDoorE', 'laneDoorW'],
};

export const ATTACK_GOALS = {
  A: ['aSite', 'aBox', 'aBack'],
  B: ['bSite', 'bBox', 'bBack'],
  mid: ['midC', 'midN'],
};
