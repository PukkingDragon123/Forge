// Run flow (docs/REDESIGN.md v5 §3): which scene follows which. Scenes call these instead of game.go.
//   startRun → (first time: cutscene 'intro' → tutorial with Morel) → dungeon stage 0
//   dungeon: rooms → boss → hole → nextFloor → dungeon stage 1 … → victory
//   death anywhere → gameOver
// Overlays: openBag, openCraft, openMine. Older names (enterNode, finishNode, …) stay as thin
// wrappers until the old first-person scenes are removed.
import { Run } from '../systems/run.js';
import * as Regions from '../data/regions.js';
import * as MON from '../data/monsters.js';
import { CHARACTER_ORDER } from '../data/characters.js';
import { save } from '../core/save.js';
import { checkUnlocks } from '../systems/unlocks.js';

const stages = () => Regions.STAGES || Regions.ACTS || Regions.REGIONS || [];
const seen = () => (save.data.seen || (save.data.seen = {}));
const markSeen = (k) => { seen()[k] = true; save.write(); };

// ------------------------------------------------------------------ run start
/** Start a run with a hero (only Durgan at first). First run: the intro, then Morel's tutorial. */
export function startRun(game, charId = 'durgan', seed) {
  game.run = new Run(charId, seed);
  const toDungeon = () => game.go('dungeon', { stage: 0, newFloor: true }, { transition: 'fade', dur: 0.8 });
  const tutorial = () => {
    if (game.scenes.tutorial && !seen().v5tutorial) {
      game.go('tutorial', { char: charId, onDone: () => { markSeen('v5tutorial'); toDungeon(); } }, { transition: 'fade' });
    } else toDungeon();
  };
  if (game.scenes.cutscene && !seen().v5intro) {
    game.go('cutscene', { id: 'intro', char: charId, onDone: () => { markSeen('v5intro'); tutorial(); } }, { transition: 'iris' });
  } else tutorial();
}

/** Boss beaten and the hole taken: the next stage, or the ending after the last. */
export function nextFloor(game) {
  const run = game.run;
  if (!run) return game.go('title', {}, { transition: 'fade' });
  if (typeof run.nextStage === 'function') {
    // the run heals 30% and lays out the next stage's floor (null after the last stage)
    if (!run.nextStage()) return victory(game);
  } else {
    const next = (run.stage ?? 0) + 1;
    if (next >= Math.max(1, stages().length)) return victory(game);
    run.stage = next;
  }
  if (run.stage > (save.data.stats.bestRegion || 0)) { save.data.stats.bestRegion = run.stage; save.write(); }
  game.go('dungeon', { stage: run.stage }, { transition: 'fade', dur: 1.0 });
}

export function gameOver(game, cause = '') {
  const run = game.run;
  save.data.stats.deaths = (save.data.stats.deaths || 0) + 1;
  save.write();
  try { checkUnlocks(); } catch (e) { /* data not ready */ }
  game.go('gameover', { cause, region: run ? run.stage ?? 0 : 0, stage: run ? run.stage ?? 0 : 0 }, { transition: 'fade', dur: 1.2 });
}

export function victory(game) {
  save.data.stats.wins = (save.data.stats.wins || 0) + 1;
  const run = game.run;
  if (run) save.data.winsBy[run.char] = (save.data.winsBy[run.char] || 0) + 1;
  save.write();
  try { checkUnlocks(); } catch (e) { /* data not ready */ }
  game.go('victory', {}, { transition: 'fade', dur: 1.5 });
}

// ------------------------------------------------------------------ overlays
/** The backpack (inventory + equipment). opts: { onClose, loot, title } */
export function openBag(game, opts = {}) {
  if (game.overlays.some((o) => o.name === 'bag')) return null;
  return game.pushOverlay('bag', opts);
}
/** The workbench close-up. opts: { station: 'workbench'|'forge'|'cauldron', onClose } */
export function openCraft(game, opts = {}) {
  if (game.overlays.some((o) => o.name === 'craft')) return null;
  return game.pushOverlay(game.scenes.craft ? 'craft' : 'bag', opts);
}
/** Zoom in on a vein or a statue and mine it. opts: { kind:'vein'|'statue', def, monster, vein, stage, at, cam, scene, onDone(res) } */
export function openMine(game, opts = {}) {
  if (game.overlays.some((o) => o.name === 'minezoom')) return null;
  if (!game.scenes.minezoom) { opts.onDone && opts.onDone({ items: [], left: true }); return null; }
  return game.pushOverlay('minezoom', opts);
}
/** v4 had an old-map overlay; v5 uses the minimap (M in the dungeon). */
export function openMap(game, opts = {}) { opts.onClose && opts.onClose(); return null; }

// ------------------------------------------------------------------ helpers kept for older callers
export const actOf = (run) => (run ? run.stage ?? run.act ?? run.region ?? 0 : 0);
export const actDef = (run) => { const A = stages(); return A[Math.min(A.length - 1, actOf(run))] || A[0] || {}; };
export function monsterPool(act, tier = 'normal') {
  const pool = MON.actPool ? MON.actPool(act, tier) : MON.regionPool ? MON.regionPool(act, tier) : [];
  if (pool && pool.length) return pool;
  return Object.values(MON.MONSTERS || {}).filter((m) => m.tier === tier).slice(0, 4);
}
export function monsterFor(run, nodeOrType = 'monster') {
  const type = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType && nodeOrType.type;
  const tier = type === 'boss' ? 'boss' : type === 'elite' ? 'elite' : 'normal';
  const pool = monsterPool(actOf(run), tier);
  return pool.length ? (run.rng ? run.rng.pick(pool) : pool[0]).id : 'shroomling';
}
export function friendOf(run, act = actOf(run)) {
  if (run.friendForAct) return run.friendForAct(act);
  const order = CHARACTER_ORDER.filter((id) => id !== run.char);
  return order[act] || null;
}
export function pickEvent() { return null; }
/** Old first-person scenes: anything that arrives or finishes goes back to the dungeon. */
export function enterNode(game) { game.go('dungeon', {}, { transition: 'fade' }); }
export function finishNode(game) { game.go('dungeon', {}, { transition: 'fade' }); }
export const arrive = (game) => enterNode(game);
export const finish = (game) => finishNode(game);
export const travel = (game) => enterNode(game);

// handy for automated tests (like window.FORGLITE)
if (typeof window !== 'undefined') window.FORGLITE_FLOW = { startRun, nextFloor, gameOver, victory, openBag, openCraft, openMine };
