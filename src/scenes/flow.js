// Run flow: which scene follows which (docs/REDESIGN.md §3). Scenes call these instead of game.go.
//   startRun → cutscene 'intro' → cutscene 'chase' → delve (act start)
//   delve → enterNode → combat | vein | event | treasure | camp → finishNode → delve (walk on)
//   boss → cutscene 'rescue_<friend>' → next act's delve … last boss → victory
import { Run } from '../systems/run.js';
import * as RG from '../data/regions.js';
import * as MON from '../data/monsters.js';
import * as EV from '../data/events.js';
import { CHARACTER_ORDER } from '../data/characters.js';
import { save } from '../core/save.js';
import { checkUnlocks } from '../systems/unlocks.js';

const ACTS = () => RG.ACTS || RG.REGIONS;
export const actOf = (run) => (run ? run.act ?? run.region ?? 0 : 0);
export const actDef = (run) => { const A = ACTS(); return A[Math.min(A.length - 1, actOf(run))] || A[0]; };

/** Monster defs for an act and tier ('normal' | 'elite' | 'boss'). */
export function monsterPool(act, tier = 'normal') {
  const pool = MON.actPool ? MON.actPool(act, tier) : MON.regionPool ? MON.regionPool(act, tier) : [];
  if (pool && pool.length) return pool;
  const all = Object.values(MON.MONSTERS || {});
  return all.filter((m) => m.tier === tier).slice(0, 4);
}
/** The monster id for a node (elites/bosses by act, normals from the act pool). */
export function monsterFor(run, type) {
  const act = actOf(run), A = actDef(run), rng = run.rng;
  if (type === 'boss') return A.boss;
  if (type === 'elite') {
    const pool = monsterPool(act, 'elite');
    return pool.length ? rng.pick(pool).id : (A.elite && A.elite[0]);
  }
  const pool = monsterPool(act, 'normal');
  return rng.pick(pool).id;
}

/** The friend a herald of this act holds (rescue order = CHARACTER_ORDER minus the hero). */
export function friendOf(run, act = actOf(run)) {
  if (run.friendForAct) return run.friendForAct(act);
  if (run.statues && run.statues.length) return run.statues[0];
  const order = CHARACTER_ORDER.filter((id) => id !== run.char);
  return order[act] || null;
}

// ------------------------------------------------------------------ run start
export function startRun(game, charId, seed) {
  game.run = new Run(charId, seed);
  const chase = () => game.go('cutscene', { id: 'chase', char: charId, onDone: () => game.go('delve', { start: true }, { transition: 'fade' }) }, { transition: 'none' });
  game.go('cutscene', { id: 'intro', char: charId, onDone: chase }, { transition: 'iris' });
}

// ------------------------------------------------------------------ nodes
/** Delve arrived at a node: route to its first-person scene. opts: { ambush } (a monster that jumped you in the tunnel). */
export function enterNode(game, node, opts = {}) {
  const run = game.run;
  run.map.current = node.id;
  if (!run.map.visited.includes(node.id)) run.map.visited.push(node.id);
  run.stats.floors = (run.stats.floors || 0) + 1;
  const rng = run.rng;
  switch (node.type) {
    case 'monster': return game.go('combat', { node, monster: monsterFor(run, 'monster'), ambush: !!opts.ambush }, { transition: opts.ambush ? 'none' : 'fade', dur: 0.35 });
    case 'elite': return game.go('combat', { node, monster: monsterFor(run, 'elite'), elite: true }, { transition: 'fade', dur: 0.35 });
    case 'boss': return game.go('combat', { node, monster: monsterFor(run, 'boss'), boss: true }, { transition: 'fade' });
    case 'vein': case 'mining': return game.go('vein', { node }, { transition: 'fade', dur: 0.35 });
    case 'treasure': return game.go('treasure', { node }, { transition: 'fade', dur: 0.35 });
    case 'camp': return game.go('camp', { node }, { transition: 'fade' });
    case 'event': return game.go('event', { node, event: pickEvent(run, rng).id }, { transition: 'fade', dur: 0.35 });
    default: return game.go('delve', {}, { transition: 'fade' });
  }
}

/** A fresh event for this act (each event at most once per run while others remain). */
export function pickEvent(run, rng = run.rng) {
  const act = actOf(run);
  const all = EV.EVENTS || [];
  const seen = run.flags.events || (run.flags.events = []);
  const inAct = (e) => (e.acts || e.regions || [act]).includes(act);
  let pool = all.filter((e) => inAct(e) && !seen.includes(e.id));
  if (!pool.length) pool = all.filter((e) => !seen.includes(e.id));
  if (!pool.length) pool = all;
  const ev = rng.pick(pool);
  seen.push(ev.id);
  return ev;
}

/** Encounter done. A boss frees a friend and opens the next act; anything else walks on. */
export function finishNode(game, opts = {}) {
  const run = game.run;
  const node = run.map.nodes[run.map.current];
  if (node) node.done = true;
  if (node && node.type === 'boss') {
    run.stats.bosses = (run.stats.bosses || 0) + 1;
    if (actOf(run) >= ACTS().length - 1) return victory(game);
    const friend = friendOf(run);
    if (friend && run.rescue) run.rescue(friend);
    const next = () => {
      if (run.nextAct) run.nextAct(); else if (run.nextRegion) run.nextRegion();
      game.go('delve', { start: true }, { transition: 'fade' });
    };
    if (!friend) return next();
    return game.go('cutscene', { id: 'rescue_' + friend, char: run.char, friend, onDone: next }, { transition: 'fade' });
  }
  game.go('delve', { from: node ? node.id : null }, { transition: opts.transition || 'fade', dur: opts.dur ?? 0.4 });
}

export function gameOver(game, cause = '') {
  const run = game.run;
  save.data.stats.deaths++;
  save.write();
  checkUnlocks();
  game.go('gameover', { cause, act: actOf(run), region: actOf(run) }, { transition: 'fade', dur: 1.2 });
}

export function victory(game) {
  save.data.stats.wins++;
  const run = game.run;
  if (run) save.data.winsBy[run.char] = (save.data.winsBy[run.char] || 0) + 1;
  save.write();
  checkUnlocks();
  game.go('victory', {}, { transition: 'fade', dur: 1.5 });
}

/** Open the backpack overlay. opts: { loot, title, onClose }. */
export function openBag(game, opts = {}) {
  if (game.overlays.some((o) => o.name === 'bag')) return null;
  return game.pushOverlay('bag', opts);
}

/** Open the old map. opts: { pick, options (nodes you may choose), onPick(node), onClose }. */
export function openMap(game, opts = {}) {
  if (game.overlays.some((o) => o.name === 'oldmap')) return null;
  if (!game.scenes.oldmap) return null;
  return game.pushOverlay('oldmap', opts);
}

// ------------------------------------------------------------------ old names (until the old scenes are removed)
export const arrive = (game, node) => enterNode(game, node);
export const finish = (game, opts) => finishNode(game, opts);
export const travel = (game, edge, node) => enterNode(game, node);
