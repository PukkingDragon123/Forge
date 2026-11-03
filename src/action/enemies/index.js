// PLACEHOLDER (owner: agent N) — enemy brains + spawning. Contract: docs/REDESIGN.md §9.3.
import { Entity } from '../index.js';
export const BRAINS = {};
export function spawnEnemy(world, id, x, z, opts = {}) {
  const e = new Entity(); e.id = id; e.x = x; e.z = z; e.team = 'enemy'; world.add(e); return e;
}
