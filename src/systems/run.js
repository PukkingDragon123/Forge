// A single descent after Medusa's escape (docs/REDESIGN.md §5.1): the hero, Pip, HP, the backpack,
// the weapon (and the stone creeping up it), stews, rescued friends and the act map.
import { RNG } from '../core/rng.js';
import { save } from '../core/save.js';
import { CHARACTERS, CHARACTER_ORDER } from '../data/characters.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { RECIPES, BLUEPRINTS } from '../data/blueprints.js';
import { evaluate, finalizeWeapon } from './forge.js';
import { ACTS } from '../data/regions.js';
import { Backpack } from './backpack.js';
import { makeItem, matOf } from './items.js';
import { generateMap } from './mapgen.js';
import { unlockedMaterial } from './unlocks.js';

export const BAG_W = 6, BAG_H = 5;
const BUFF_KEYS = ['dmg', 'guard', 'stoneResist', 'loot', 'regen'];

// Medusa's gaze turned your weapon to stone. It still cuts, and now it petrifies whatever it kills,
// but it starts a third of the way to crumbling: forging a fresh blade is the first big decision.
const STONE_BLADES = { bran: ['sword', ['iron', 'copper']], elio: ['staff', ['ember', 'copper']], durgan: ['axe', ['iron', 'tin']], clover: ['dagger', ['silver']] };
function stoneBlade(charId) {
  const [bp, ids] = STONE_BLADES[charId] || STONE_BLADES.bran;
  try {
    const res = evaluate(bp, ids.map((id) => makeItem(id, 2)), { char: charId });
    const w = finalizeWeapon(res, 1, { char: charId });
    return { ...w, name: 'Stonebitten ' + (BLUEPRINTS[bp] ? BLUEPRINTS[bp].name : 'Blade'), stone: 0.3, starter: true };
  } catch (e) { return null; }
}

export class Run {
  constructor(charId, seed = String(Date.now())) {
    const c = CHARACTERS[charId] || CHARACTERS.bran;
    this.char = c.id;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.maxHp = c.hp; this.hp = c.hp;
    this.coins = 0; // v4 has no coins; kept so older screens read 0
    this.bag = new Backpack(BAG_W, BAG_H);
    for (const id of c.start) this.bag.add(makeItem(id, 2));
    this.blueprints = [...c.blueprints, 'pickaxe'];
    const d = save.data.discovered;
    if (!d.stews) d.stews = [];
    this.recipes = [...d.recipes];   // weapon recipes (data/blueprints.js RECIPES)
    this.stews = [...d.stews];       // stew recipes (data/stews.js)
    this.act = 0;
    this.map = generateMap(this.rng.fork('map0'), 0);
    this.stats = { kills: 0, elites: 0, bosses: 0, statues: 0, veins: 0, ores: 0, stews: 0, forged: 0, masterworks: 0, crumbled: 0, shattered: 0, rescues: 0, floors: 0, time: 0, coins: 0 };
    this.flags = {};
    this.weapon = stoneBlade(this.char); // finalized weapon + { stone: 0..1 }; null → you fight with the pickaxe
    this.pick = { swings: 3, quality: 0, perks: {} }; // vein mining: swings per vein, +quality, pickaxe traits
    this.companions = [];      // rescued friends, in rescue order
    this.statues = CHARACTER_ORDER.filter((id) => id !== this.char); // still in stone
    this.rescueQueue = this.statues.slice(); // the Herald of act i holds rescueQueue[i]
    this.buffs = [];           // stews: [{ id, name, icon, color, fights, dmg?, guard?, stoneResist?, loot?, regen? }]
    this.lastWeapon = null;
    this.lastBp = null;
    this.bonusGrade = 0;
    save.data.stats.runs++;
    save.write();
  }
  get def() { return CHARACTERS[this.char]; }
  get actDef() { return ACTS[this.act]; }
  get regionDef() { return ACTS[this.act]; }
  /** Older code says "region"; in v4 that is the act. */
  get region() { return this.act; }
  set region(v) { this.act = v; }
  get isFinalAct() { return this.act >= ACTS.length - 1; }

  /** Next act: new map, heal 30% of max HP. */
  nextAct() {
    this.act = Math.min(ACTS.length - 1, this.act + 1);
    if (this.act > save.data.stats.bestRegion) { save.data.stats.bestRegion = this.act; save.write(); }
    this.map = generateMap(this.rng.fork('map' + this.act), this.act);
    this.heal(Math.round(this.maxHp * 0.3));
    return this.map;
  }
  nextRegion() { return this.nextAct(); }

  // ------------------------------------------------------------ friends
  /** The friend the Herald of this act holds (null in the last act). */
  friendForAct(act = this.act) { return this.rescueQueue[act] || null; }
  rescue(id) {
    const i = this.statues.indexOf(id);
    if (i >= 0) this.statues.splice(i, 1);
    if (!this.companions.includes(id)) this.companions.push(id);
    this.stats.rescues++;
  }
  hasCompanion(id) { return this.companions.includes(id); }
  /** Hero or rescued friend has this crew member's knack (e.g. Durgan's cooking). */
  hasKnack(id) { return this.char === id || this.companions.includes(id); }

  // ------------------------------------------------------------ bag & body
  addItem(it) { return this.bag.add(it); }
  removeItem(it) { this.bag.remove(it); }
  forgeables() { return this.bag.items.filter((it) => matOf(it).weapon); }
  heal(n) { const b = this.hp; this.hp = Math.min(this.maxHp, this.hp + Math.max(0, n)); return this.hp - b; }
  hurt(n) { this.hp = Math.max(0, this.hp - n); return this.hp <= 0; }
  gain() { return 0; } // no coins in v4

  // ------------------------------------------------------------ weapon
  /** Equip a freshly forged (or found) weapon; stone starts at 0. Returns the equipped weapon. */
  equip(weapon) { this.lastWeapon = this.weapon; this.weapon = weapon ? { ...weapon, stone: weapon.stone || 0 } : null; return this.weapon; }

  // ------------------------------------------------------------ stews (buffs)
  addBuff(b) { this.buffs.push({ ...b }); }
  /** Sum of the active stews: { dmg, guard, stoneResist, loot, regen }. */
  buffTotals() {
    const t = {};
    for (const k of BUFF_KEYS) t[k] = 0;
    for (const b of this.buffs) for (const k of BUFF_KEYS) t[k] += b[k] || 0;
    t.stoneResist = Math.min(100, t.stoneResist);
    return t;
  }
  /** After a fight: every stew loses one fight; returns the names that ran out. */
  tickBuffs() {
    const gone = [];
    for (const b of this.buffs) { b.fights--; if (b.fights <= 0) gone.push(b.name); }
    this.buffs = this.buffs.filter((b) => b.fights > 0);
    return gone;
  }

  // ------------------------------------------------------------ recipes
  learnRecipe(id) {
    if (!this.recipes.includes(id)) this.recipes.push(id);
    return save.learn('discovered.recipes', id);
  }
  learnStew(id) {
    if (!this.stews.includes(id)) this.stews.push(id);
    return save.learn('discovered.stews', id);
  }
  unknownRecipe(rng = this.rng) {
    const unknown = Object.keys(RECIPES).filter((r) => !this.recipes.includes(r) && RECIPES[r].ings.every((i) => unlockedMaterial(i)));
    return unknown.length ? rng.pick(unknown) : null;
  }
}

// ---------------------------------------------------------------- loot helpers
const pool = (act, kinds, minRarity = 0, maxRarity = 4) => Object.values(MATERIALS).filter((m) =>
  kinds.includes(m.kind) && unlockedMaterial(m.id) && !m.tags.includes('boss') && RARITY[m.rarity].order >= minRarity && RARITY[m.rarity].order <= maxRarity &&
  (!m.acts || m.acts.includes(act)));

/** A random material id of the given kinds, weighted by rarity (luck raises rare+). */
export function rollMaterial(rng, act, kinds, minR = 0, maxR = 4, luck = 0) {
  let p = pool(act, kinds, minR, maxR);
  if (!p.length) p = pool(act, kinds, 0, 4);
  if (!p.length) return 'petrite';
  return rng.weighted(p.map((m) => [m.id, RARITY[m.rarity].weight * (RARITY[m.rarity].order >= 2 ? 1 + luck : 1)]));
}

export function rollQuality(rng, bonus = 0) {
  return Math.max(0, Math.min(4, 2 + bonus + (rng.chance(0.25) ? 1 : 0) - (rng.chance(0.2) ? 1 : 0)));
}

/** Old chests (treasure nodes). */
export const CHESTS = {
  old: { name: 'Old Chest', items: 3, kinds: ['ore', 'gem', 'crystal', 'forage', 'scroll'], minR: 0, maxR: 3, recipe: 0.25 },
  wood: { name: 'Wooden Chest', items: 2, kinds: ['ore', 'mineral', 'crystal', 'forage'], minR: 0, maxR: 2 },
  iron: { name: 'Iron Chest', items: 3, kinds: ['ore', 'gem', 'crystal', 'scroll'], minR: 1, maxR: 3 },
  crystal: { name: 'Crystal Chest', items: 3, kinds: ['gem', 'crystal'], minR: 1, maxR: 3 },
  bone: { name: 'Bone Chest', items: 3, kinds: ['part', 'scroll'], minR: 1, maxR: 3 },
  gold: { name: 'Golden Chest', items: 3, kinds: ['ore', 'gem', 'scroll', 'part'], minR: 2, maxR: 4, recipe: 0.5 },
};

/** Loot for a chest kind → { items, coins: 0 }. */
export function chestLoot(run, kind = 'old') {
  const c = CHESTS[kind] || CHESTS.old;
  const rng = run.rng;
  const items = [];
  const luck = run.hasKnack('clover') ? 0.5 : 0;
  const n = c.items + (run.hasCompanion('clover') ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const id = rollMaterial(rng, run.act, c.kinds, c.minR, c.maxR, luck);
    items.push(makeItem(id, rollQuality(rng, kind === 'gold' ? 1 : 0)));
  }
  if (rng.chance(c.recipe || 0.12)) {
    const r = run.unknownRecipe();
    if (r) items.push(makeItem('recipe_scroll', 2, { recipe: r }));
  }
  return { items, coins: 0 };
}

/** Legacy (merchants are gone in v4). */
export function merchantStock() { return []; }

/** Legacy harvest picks of the old combat scene. */
export function monsterDrops(run, monsterDef, picks = 1, weapon = {}) {
  const rng = run.rng;
  const out = [];
  for (const d of monsterDef.drops || []) if (rng.chance(Math.min(1, d.chance + ((weapon.grade || 0) >= 3 ? 0.15 : 0)))) out.push(d.id);
  while (out.length < Math.max(2, picks + 1) && monsterDef.drops && monsterDef.drops.length) out.push(rng.pick(monsterDef.drops).id);
  return out.slice(0, 6);
}
