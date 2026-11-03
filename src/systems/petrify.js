// Medusa's stone (docs/REDESIGN.md §5.4). Every kill turns the foe to stone — and the stone creeps up
// your blade. A blade that is fully stone crumbles after the fight; then you fight with the old
// pickaxe until you forge again. Statues and ore veins are where ore comes from.
import { MATERIALS } from '../data/materials.js';
import { MONSTERS } from '../data/monsters.js';
import { makeItem } from './items.js';
import { rollMaterial, rollQuality } from './run.js';

export const STONE_COST = { normal: 0.12, elite: 0.25, boss: 0.4 };

/** How much stone one kill of `def` adds to `weapon` (0..1 scale). */
export function stoneCost(def, weapon = null, run = null) {
  if (weapon && weapon.noStone) return 0;
  let cost = STONE_COST[(def && def.tier) || 'normal'] ?? STONE_COST.normal;
  if (weapon) {
    // serpent and stone parts in the blade shrug the curse off (−10% each, up to −40%)
    const warded = (weapon.ids || []).filter((id) => MATERIALS[id] && MATERIALS[id].tags.some((t) => t === 'serpent' || t === 'stone')).length;
    cost *= 1 - Math.min(0.4, warded * 0.1);
    if (weapon.flags && weapon.flags.stoneward) cost *= 0.5;
  }
  if (run) cost *= 1 - Math.min(100, run.buffTotals().stoneResist) / 100;
  return Math.max(0, cost);
}

/**
 * Call when a foe is petrified. Adds stone to the run's weapon.
 * → { cost, stone (0..1 after), crumbles (true when the blade is now fully stone) }
 */
export function addStone(run, def) {
  const w = run.weapon;
  if (!w) return { cost: 0, stone: 0, crumbles: false };
  const cost = stoneCost(def, w, run);
  w.stone = Math.min(1, (w.stone || 0) + cost);
  return { cost, stone: w.stone, crumbles: w.stone >= 1 };
}

/** The stone blade breaks: back to the pickaxe. Returns the lost weapon. */
export function crumbleWeapon(run) {
  const w = run.weapon;
  if (!w) return null;
  run.lastWeapon = w;
  run.weapon = null;
  run.stats.crumbled++;
  run.stats.shattered++;
  return w;
}

/** Kills left before the blade is all stone, against normal foes (for a tiny meter). */
export function killsLeft(run) {
  const w = run.weapon;
  if (!w) return Infinity;
  const c = stoneCost({ tier: 'normal' }, w, run);
  return c > 0 ? Math.max(0, Math.ceil((1 - (w.stone || 0)) / c - 1e-6)) : Infinity;
}

const BOSS_DROP = (def) => (def.id === 'medusa' ? 'gorgon_tear' : 'herald_scale');

/**
 * Loot from mining a petrified foe.
 *   cracksHit / cracksTotal — how many glowing cracks the player struck (all = flawless, better ore).
 * → array of item instances (always some petrite; the monster's parts; an ore or gem of its act).
 */
export function statueLoot(run, monsterDef, cracksHit = 3, cracksTotal = 3) {
  const def = typeof monsterDef === 'string' ? MONSTERS[monsterDef] : monsterDef;
  const rng = run.rng;
  const tier = def.tier || 'normal';
  const ratio = cracksTotal ? cracksHit / cracksTotal : 1;
  const qb = ratio >= 1 ? 1 : ratio >= 0.5 ? 0 : -1;
  const luck = run.buffTotals().loot / 100 + (run.char === 'clover' ? 0.25 : 0);
  const items = [];
  const add = (id, q = rollQuality(rng, qb)) => { if (MATERIALS[id]) items.push(makeItem(id, q)); };
  // stone ore
  const petrite = 1 + (tier === 'elite' ? 1 : 0) + (tier === 'boss' ? 2 : 0);
  for (let i = 0; i < petrite; i++) add('petrite');
  // the foe's own parts
  const drops = (def.drops || []).filter((d) => MATERIALS[d.id] && !MATERIALS[d.id].tags.includes('boss'));
  let got = 0;
  for (const d of drops) if (rng.chance(Math.min(1, d.chance * (0.75 + ratio * 0.25) + luck * 0.3))) { add(d.id); got++; }
  if (!got && drops.length) add(rng.pick(drops).id);
  // an ore or gem of this act (better from elites, bosses, flawless mining)
  const act = Math.max(0, Math.min(3, def.region >= 0 ? def.region : run.act));
  const minR = tier === 'boss' ? 2 : tier === 'elite' ? 1 : 0;
  add(rollMaterial(rng, act, ['ore', 'gem', 'crystal', 'mineral'], minR, minR + 2, luck));
  if (ratio >= 1 || rng.chance(luck)) add(rollMaterial(rng, act, ['ore', 'gem', 'forage'], 0, 3, luck));
  if (tier !== 'normal' && rng.chance(tier === 'boss' ? 1 : 0.5)) add('gorgonite');
  if (tier === 'boss') add(BOSS_DROP(def), 3);
  // the odd snake egg from serpents
  if ((def.traits || []).includes('serpent') || /snake|viper|adder|naga|asp|coil|basilisk|scale|fang/.test(def.id)) if (rng.chance(0.35)) add('snake_egg');
  run.stats.statues++;
  run.stats.ores += items.length;
  return items;
}

/** Ore pools for veins, per act: [id, weight]. Rarer ores come from perfect swings. */
const VEIN = [
  [['copper', 30], ['tin', 26], ['iron', 24], ['coal', 18], ['silver', 8], ['gold', 3], ['amethyst', 6], ['quartz', 8]],
  [['iron', 22], ['silver', 20], ['copper', 10], ['quartz', 14], ['sapphire', 6], ['moonstone', 5], ['rime', 10], ['storm', 8], ['prism', 2]],
  [['iron', 18], ['magmasteel', 12], ['gold', 10], ['obsidian', 12], ['ember', 12], ['brimstone', 10], ['ruby', 6], ['mithril', 3]],
  [['silver', 14], ['gold', 14], ['mithril', 10], ['gorgonite', 8], ['emerald', 8], ['diamond', 4], ['runestone', 8], ['stariron', 2]],
];

/**
 * Loot from an ore vein. hits: ['perfect'|'good'|'miss', …] or [{ q: … }, …] (one per swing).
 * perfect → an ore, +1 quality and a better roll; good → an ore; miss → maybe a chip of petrite.
 * All perfect → a bonus gem. → array of item instances.
 */
export function veinLoot(run, act = run.act, hits = []) {
  const rng = run.rng;
  const pool = VEIN[Math.max(0, Math.min(3, act))].filter(([id]) => MATERIALS[id]);
  const perks = (run.pick && run.pick.perks) || {};
  const luck = run.buffTotals().loot / 100 + (perks.lucky ? 0.25 : 0);
  const q0 = (run.pick ? run.pick.quality || 0 : 0) + (perks.quality ? 1 : 0);
  const items = [];
  const results = hits.map((h) => (typeof h === 'string' ? h : h && h.q) || 'miss');
  for (const r of results) {
    if (r === 'miss') { if (rng.chance(0.3)) items.push(makeItem('petrite', rollQuality(rng, -1))); continue; }
    const perfect = r === 'perfect' || (perks.lucky && rng.chance(0.2));
    // perfect swings favour the rarer half of the pool
    const weighted = pool.map(([id, w], i) => [id, perfect ? w * (0.5 + (i / pool.length) * 1.5) : w]);
    const id = rng.weighted(weighted);
    const smelt = perks.smelt && MATERIALS[id].tags.includes('metal') ? 1 : 0;
    items.push(makeItem(id, rollQuality(rng, (perfect ? 1 : 0) + q0 + smelt)));
  }
  if (results.length && results.every((r) => r === 'perfect')) items.push(makeItem(rollMaterial(rng, act, ['gem'], 1, 4, luck), rollQuality(rng, 1)));
  if (luck > 0 && rng.chance(Math.min(0.8, luck))) items.push(makeItem(rng.weighted(pool), rollQuality(rng, q0)));
  // Pip sometimes digs out a little extra
  if (rng.chance(0.25)) items.push(makeItem(rng.pick(['petrite', 'stone_salt', 'fern_root', 'cave_moss']), 2));
  run.stats.veins++;
  run.stats.ores += items.length;
  return items;
}
