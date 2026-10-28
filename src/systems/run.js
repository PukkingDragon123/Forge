// A single descent: explorer, HP, coins, backpack, maps, discoveries.
import { RNG } from '../core/rng.js';
import { save } from '../core/save.js';
import { CHARACTERS } from '../data/characters.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { RECIPES } from '../data/blueprints.js';
import { REGIONS } from '../data/regions.js';
import { Backpack } from './backpack.js';
import { makeItem, matOf } from './items.js';
import { generateMap } from './mapgen.js';
import { unlockedMaterial } from './unlocks.js';

export class Run {
  constructor(charId, seed = String(Date.now())) {
    const c = CHARACTERS[charId];
    this.char = charId;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.maxHp = c.hp; this.hp = c.hp;
    this.coins = c.coins;
    this.bag = new Backpack(5, 5);
    for (const id of c.start) this.bag.add(makeItem(id, 2));
    this.blueprints = [...c.blueprints, 'pickaxe'];
    this.recipes = [...save.data.discovered.recipes];
    this.region = 0;
    this.map = generateMap(this.rng.fork('map0'), 0);
    this.stats = { kills: 0, elites: 0, bosses: 0, mined: 0, forged: 0, masterworks: 0, shattered: 0, coins: 0, floors: 0, time: 0 };
    this.flags = {};
    this.weapon = null;
    this.lastWeapon = null;
    this.bonusGrade = 0;
    save.data.stats.runs++;
    save.write();
  }
  get def() { return CHARACTERS[this.char]; }
  get regionDef() { return REGIONS[this.region]; }

  nextRegion() {
    this.region++;
    if (this.region > save.data.stats.bestRegion) { save.data.stats.bestRegion = this.region; save.write(); }
    this.map = generateMap(this.rng.fork('map' + this.region), this.region);
    this.hp = Math.min(this.maxHp, this.hp + Math.round((this.maxHp - this.hp) * 0.5));
  }

  addItem(it) { return this.bag.add(it); }
  removeItem(it) { this.bag.remove(it); }
  forgeables() { return this.bag.items.filter((it) => matOf(it).weapon); }
  heal(n) { const b = this.hp; this.hp = Math.min(this.maxHp, this.hp + n); return this.hp - b; }
  hurt(n) { this.hp = Math.max(0, this.hp - n); return this.hp <= 0; }
  gain(n) { const c = this.char === 'clover' ? Math.ceil(n * 1.5) : n; this.coins += c; this.stats.coins += c; return c; }

  learnRecipe(id) {
    if (!this.recipes.includes(id)) this.recipes.push(id);
    return save.learn('discovered.recipes', id);
  }
  unknownRecipe(rng = this.rng) {
    const unknown = Object.keys(RECIPES).filter((r) => !this.recipes.includes(r) && RECIPES[r].ings.every((i) => unlockedMaterial(i)));
    return unknown.length ? rng.pick(unknown) : null;
  }
}

// ---------------------------------------------------------------- loot
const pool = (region, kinds, minRarity = 0, maxRarity = 4) => Object.values(MATERIALS).filter((m) =>
  kinds.includes(m.kind) && unlockedMaterial(m.id) && RARITY[m.rarity].order >= minRarity && RARITY[m.rarity].order <= maxRarity &&
  (!m.regions || m.regions.includes(region) || m.kind !== 'ore'));

export function rollMaterial(rng, region, kinds, minR = 0, maxR = 4, luck = 0) {
  const p = pool(region, kinds, minR, maxR);
  if (!p.length) return 'junk';
  return rng.weighted(p.map((m) => [m.id, RARITY[m.rarity].weight * (RARITY[m.rarity].order >= 2 ? 1 + luck : 1)]));
}

export function rollQuality(rng, bonus = 0) {
  return Math.max(0, Math.min(4, 2 + bonus + (rng.chance(0.25) ? 1 : 0) - (rng.chance(0.2) ? 1 : 0)));
}

export const CHESTS = {
  wood: { name: 'Wooden Chest', lock: null, items: 2, kinds: ['ore', 'mineral', 'tool', 'crystal'], minR: 0, maxR: 2, coins: [6, 14] },
  iron: { name: 'Iron Chest', lock: 'iron', items: 3, kinds: ['ore', 'gem', 'crystal', 'scroll', 'tool'], minR: 1, maxR: 3, coins: [12, 24] },
  crystal: { name: 'Crystal Chest', lock: 'crystal', items: 3, kinds: ['gem', 'crystal'], minR: 1, maxR: 3, coins: [10, 20] },
  bone: { name: 'Bone Chest', lock: 'bone', items: 3, kinds: ['part', 'scroll'], minR: 1, maxR: 3, coins: [10, 20] },
  gold: { name: 'Golden Chest', lock: 'gold', items: 3, kinds: ['ore', 'gem', 'scroll', 'part'], minR: 2, maxR: 4, coins: [25, 45], recipe: 0.5 },
};

export function chestLoot(run, kind) {
  const c = CHESTS[kind];
  const rng = run.rng;
  const items = [];
  for (let i = 0; i < c.items; i++) {
    const id = rollMaterial(rng, run.region, c.kinds, c.minR, c.maxR, run.char === 'clover' ? 0.5 : 0);
    if (MATERIALS[id].tags.includes('boss')) continue;
    items.push(makeItem(id, rollQuality(rng, kind === 'gold' ? 1 : 0)));
  }
  if (rng.chance(c.recipe || 0.15)) {
    const r = run.unknownRecipe();
    if (r) items.push(makeItem('recipe_scroll', 2, { recipe: r }));
  }
  const coins = rng.int(c.coins[0], c.coins[1]) + run.region * 3;
  return { items, coins };
}

export function merchantStock(run) {
  const rng = run.rng.fork('shop' + run.map.current);
  const stock = [];
  const add = (id, q = rollQuality(rng), extra) => {
    const it = makeItem(id, q, extra);
    const base = MATERIALS[id].value;
    it.price = Math.max(3, Math.round(base * 2.2 * (0.9 + q * 0.08) + run.region * 2));
    stock.push(it);
  };
  for (let i = 0; i < 3; i++) add(rollMaterial(rng, run.region, ['ore', 'mineral', 'crystal'], 0, 2));
  add(rollMaterial(rng, run.region, ['gem'], 1, 3));
  add(rollMaterial(rng, run.region, ['part'], 0, 2));
  add(rng.pick(['blast', 'drill', 'scanner', 'radar', 'flare']), 2);
  add(rng.pick(['rusty_key', 'crystal_key', 'bone_key', 'golden_key']), 2);
  add(rng.pick(['rune_haste', 'rune_echo', 'rune_mastery', 'rune_fury', 'rune_plenty']), 2);
  const r = run.unknownRecipe(rng);
  if (r) add('recipe_scroll', 2, { recipe: r });
  return stock;
}

export function monsterDrops(run, monsterDef, picks, weapon) {
  // candidate parts the player can choose to carve (face-down cards)
  const rng = run.rng;
  const out = [];
  for (const d of monsterDef.drops || []) if (rng.chance(Math.min(1, d.chance + (weapon.grade >= 3 ? 0.15 : 0)))) out.push(d.id);
  while (out.length < Math.max(2, picks + 1) && monsterDef.drops && monsterDef.drops.length) out.push(rng.pick(monsterDef.drops).id);
  return out.slice(0, 6);
}
