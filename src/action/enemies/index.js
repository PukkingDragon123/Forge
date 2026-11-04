// Enemy runtime for the v5 action game (docs/REDESIGN.md §9.3).
//   spawnEnemy(world, id, x, z, opts) → Enemy   opts: { elite, stage, delay, spawn: 'ground'|'spores'|'drop'|'burrow',
//                                                        instant, face, radius }
//   spawnWave(world, list, opts) → Enemy[]       list: [{ id, n, elite?, x?, z? }] spread over room.spawns
//   BRAINS                                      archetype → brain class (data/monsters.js `ai.brain`)
//   tickEnemyFx(world, dt)                      call every frame (telegraphs, clouds, shockwaves, statues, NPCs);
//                                               every living enemy also ticks it once per frame
//   statues(world)                              statues of the fallen still standing (for mining)
//   spawnNPC(world, 'morel', x, z) → NPC        friendly puppet: walkTo, face, play('talk'|'wave'|…), petrify, headPos
//   preloadEnemies(ids)                         build models once so first spawns don't hitch
// Enemies petrify on death into statues that stay put; the world emits 'enemyKilled'
// { enemy, def, id, x, z, monster, statue, elite, boss } and bosses emit 'bossPhase' { enemy, phase, text }.
import { MONSTERS } from '../../data/monsters.js';
import { buildMonster } from '../../models/monsters.js';
import { Enemy, tickEnemyFx as tickFx } from './enemy.js';
import { BRAINS, Brain } from './brains.js';
import { manager } from './fx.js';
import { NPC, spawnNPC } from './npc.js';
import { enemyStats } from './stats.js';

export { BRAINS, Brain, Enemy, NPC, spawnNPC, enemyStats };

export function spawnEnemy(world, id, x, z, opts = {}) {
  const def = MONSTERS[id];
  if (!def) { console.warn('spawnEnemy: unknown id', id); return null; }
  world._spawnEnemy = spawnEnemy; // brains summon through this (no import cycle)
  const e = new Enemy(world, id, x, z, opts);
  const ai = def.ai || {};
  const B = BRAINS[ai.brain] || BRAINS.chaser;
  e.brain = new B(e, ai);
  if (opts.minion) e.minion = true;
  if (typeof world.add === 'function') world.add(e);
  else (world.enemies || (world.enemies = [])).push(e);
  if (world.enemies && !world.enemies.includes(e)) world.enemies.push(e);
  if (world.scene && !e.model.parent) world.scene.add(e.model);
  return e;
}

/** Spawn a wave over the room's spawn points (staggered entrances, never on top of the player). */
export function spawnWave(world, list, opts = {}) {
  const room = world.room || {};
  const pts = (room.spawns || [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 0, z: 2 }]).slice();
  const p = world.player;
  pts.sort((a, b) => (p ? Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z) : 0));
  const out = [];
  let i = 0;
  for (const g of list) {
    for (let k = 0; k < (g.n || 1); k++) {
      const pt = g.x !== undefined ? { x: g.x, z: g.z } : pts[i % pts.length];
      const jit = g.x !== undefined ? 0 : Math.floor(i / pts.length) * 0.7;
      const e = spawnEnemy(world, g.id, pt.x + (Math.random() - 0.5) * jit, pt.z + (Math.random() - 0.5) * jit, { elite: g.elite, stage: opts.stage, delay: (opts.delay ?? 0.2) + i * (opts.stagger ?? 0.18), spawn: g.spawn });
      if (e) out.push(e);
      i++;
    }
  }
  return out;
}

export function tickEnemyFx(world, dt) {
  tickFx(world, dt);
  const M = manager(world);
  if (M.npcs) for (const n of M.npcs) n.update(dt);
}

export function statues(world) {
  const M = manager(world);
  return (M.statues || []).filter((s) => !s.gone).map((s) => s.mon);
}

/** Build each monster once (geometry is cached per id afterwards). */
export function preloadEnemies(ids) {
  for (const id of ids) {
    if (!MONSTERS[id]) continue;
    try { const m = buildMonster(id); m.dispose && m.dispose(); } catch (e) { console.warn('preload', id, e); }
  }
}
