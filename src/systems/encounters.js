// What waits at a map node (for scenes/flow.js): the scene to open and its params. Deterministic per
// node (node.seed), so revisiting a save or re-rendering never rerolls an encounter.
import * as MON from '../data/monsters.js';
import { EVENTS } from '../data/events.js';
import { ACTS } from '../data/regions.js';
import { RNG } from '../core/rng.js';

const { MONSTERS } = MON;

/** Monsters of an act and tier (uses data/monsters.js actPool when present). */
export function monstersOf(act, tier = 'normal') {
  if (typeof MON.actPool === 'function') {
    const p = MON.actPool(act, tier);
    if (p && p.length) return p.map((m) => (typeof m === 'string' ? m : m.id));
  }
  const all = Object.values(MONSTERS).filter((m) => m.tier === tier && m.id !== 'mimic');
  const here = all.filter((m) => m.region === act);
  return (here.length ? here : all).map((m) => m.id);
}

const rngFor = (run, node, salt = '') => new RNG(`${run.seed}|${run.act}|${node ? node.seed ?? node.id : 'x'}|${salt}`);

/** A monster id for a node: normal, elite or the act's boss. */
export function monsterFor(run, node, tier = node && node.type === 'elite' ? 'elite' : node && node.type === 'boss' ? 'boss' : 'normal') {
  const act = ACTS[run.act];
  if (tier === 'boss') return act.boss;
  const rng = rngFor(run, node, tier);
  if (tier === 'elite') {
    const listed = (act.elite || []).filter((id) => MONSTERS[id]);
    const pool = listed.length ? listed : monstersOf(run.act, 'elite');
    return rng.pick(pool);
  }
  const pool = monstersOf(run.act, 'normal');
  // don't meet the same foe twice in a row
  const last = run.flags.lastMonster;
  const fresh = pool.filter((id) => id !== last);
  return rng.pick(fresh.length ? fresh : pool);
}

/** An event id for a node: one that fits the act and hasn't happened this run. */
export function eventFor(run, node) {
  if (node && node.event) return node.event; // decided once (scouting shows the same event you'll find)
  const seen = run.flags.events || (run.flags.events = []);
  const fits = (e) => (e.acts || e.regions || []).includes(run.act);
  let pool = EVENTS.filter((e) => fits(e) && !seen.includes(e.id));
  if (!pool.length) pool = EVENTS.filter((e) => !seen.includes(e.id));
  if (!pool.length) pool = EVENTS;
  const id = rngFor(run, node, 'ev').pick(pool).id;
  if (node) node.event = id;
  return id;
}

/**
 * The encounter at a node → { scene, params } (or null for the landing).
 *   monster/elite/boss → 'combat' { monster, elite?, boss?, friend? }
 *   vein → 'vein' {}, event → 'event' { event }, treasure → 'treasure' { mimic }, camp → 'camp' {}
 * Marks the chosen event as seen.
 */
export function encounterFor(run, node) {
  switch (node.type) {
    case 'monster': return { scene: 'combat', params: { node, monster: monsterFor(run, node, 'normal') } };
    case 'elite': return { scene: 'combat', params: { node, monster: monsterFor(run, node, 'elite'), elite: true } };
    case 'boss': return { scene: 'combat', params: { node, monster: monsterFor(run, node, 'boss'), boss: true, friend: run.friendForAct() } };
    case 'vein': case 'mining': return { scene: 'vein', params: { node } };
    case 'event': {
      const id = eventFor(run, node);
      (run.flags.events || (run.flags.events = [])).push(id);
      return { scene: 'event', params: { node, event: id } };
    }
    case 'treasure': {
      const mimic = rngFor(run, node, 'mimic').chance(0.2);
      return { scene: 'treasure', params: { node, mimic, monster: mimic ? (MONSTERS.mimic ? 'mimic' : monsterFor(run, node, 'normal')) : null } };
    }
    case 'camp': return { scene: 'camp', params: { node } };
    default: return null;
  }
}

/** A monster that ambushes you in the tunnel on the way to `node` (≈20%), or null. */
export function ambushFor(run, node) {
  if (!node || node.type === 'boss' || node.type === 'camp' || node.type === 'elite') return null;
  const rng = rngFor(run, node, 'ambush');
  return rng.chance(0.2) ? rng.pick(monstersOf(run.act, 'normal')) : null;
}
