// Run flow: which scene follows which. Scenes call these instead of game.go directly.
import { Run } from '../systems/run.js';
import { REGIONS } from '../data/regions.js';
import { regionPool } from '../data/monsters.js';
import { EVENTS } from '../data/events.js';
import { save } from '../core/save.js';
import { checkUnlocks } from '../systems/unlocks.js';

export function startRun(game, charId, seed) {
  game.run = new Run(charId, seed);
  game.go('map', { intro: true }, { transition: 'iris' });
}

/** Player picked a tunnel on the map. */
export function travel(game, edge, node) {
  game.go('travel', { edge, node }, { transition: 'dither' });
}

/** Arrived at a node after travel. */
export function arrive(game, node) {
  const run = game.run;
  run.map.current = node.id;
  if (!run.map.visited.includes(node.id)) run.map.visited.push(node.id);
  run.stats.floors++;
  const rng = run.rng;
  switch (node.type) {
    case 'mining': return game.go('mining', { node });
    case 'monster': return game.go('combat', { node, monster: rng.pick(regionPool(run.region, 'normal')).id });
    case 'elite': return game.go('combat', { node, monster: rng.pick(REGIONS[run.region].elite), elite: true });
    case 'boss': return game.go('combat', { node, monster: REGIONS[run.region].boss, boss: true });
    case 'treasure': return game.go('treasure', { node });
    case 'merchant': return game.go('merchant', { node });
    case 'camp': return game.go('camp', { node });
    case 'event': {
      const seen = run.flags.events || (run.flags.events = []);
      let pool = EVENTS.filter((e) => e.regions.includes(run.region) && !seen.includes(e.id));
      if (!pool.length) pool = EVENTS.filter((e) => !seen.includes(e.id));
      if (!pool.length) pool = EVENTS;
      const ev = rng.pick(pool);
      seen.push(ev.id);
      return game.go('event', { node, event: ev.id });
    }
    default: return game.go('map', {});
  }
}

/** Node resolved. Show loot overlay first if needed. */
export function finish(game, opts = {}) {
  const run = game.run;
  const node = run.map.nodes[run.map.current];
  node.done = true;
  if (node.type === 'boss') {
    run.stats.bosses++;
    if (run.region >= REGIONS.length - 1) return victory(game);
    return game.go('descend', { from: run.region }, { transition: 'fade' });
  }
  game.go('map', {}, { transition: opts.transition || 'dither' });
}

export function gameOver(game, cause = '') {
  const run = game.run;
  save.data.stats.deaths++;
  save.write();
  checkUnlocks();
  game.go('gameover', { cause, region: run ? run.region : 0 }, { transition: 'fade', dur: 1.2 });
}

export function victory(game) {
  save.data.stats.wins++;
  const run = game.run;
  if (run) save.data.winsBy[run.char] = (save.data.winsBy[run.char] || 0) + 1;
  save.write();
  checkUnlocks();
  game.go('victory', {}, { transition: 'fade', dur: 1.5 });
}

/** Open the backpack overlay (loot = items to place). */
export function openBag(game, opts = {}) {
  if (game.overlays.some((o) => o.name === 'bag')) return null;
  return game.pushOverlay('bag', opts);
}
