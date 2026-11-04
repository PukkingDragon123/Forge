// A single run (docs/REDESIGN.md §7). v5: the hero, the bag (6×5, your build), the weapon in your hand,
// two skill gems, temporary effects, the Isaac floor of the current stage, the recipe book, rescues.
//
//   new Run(charId, seed)       starts on stage 0 with the hero's weapon equipped and starting bag
//   .char .seed .rng .stage .floor .roomId .hp .baseHp .maxHp (getter: with bonuses) .bag .hand (weapon item)
//   .skills [item|null, item|null] .effects [{ name, icon, rooms, stats }] .recipesKnown [] .companions []
//   .statues (friends still in stone) .stats .flags
//   .loadout() → computeLoadout(this) (systems/loadout.js)
//   .equipWeapon(item) → old weapon item (goes back to the bag / overflow) · .equipSkill(item, slot) · .unequipSkill(slot)
//   .drink(item) → { healed, effect } · .addEffect(e) · .roomCleared() → { healed, expired: [names] }
//   .enterStage(n) → floor · .nextStage() → floor | null (after the last) · .room (getter: current room)
//   .moveTo(roomId) · .rescue(id) (also unlocks the hero) · .friendForStage(stage)
//   .toolItems() · .heal(n) · .hurt(n) → dead? · .addItem(it) → placed? · .removeItem(it)
// v4 names are kept (act, map, weapon, pick, buffs, …) so the older scenes keep building until removed.
import { RNG } from '../core/rng.js';
import { save } from '../core/save.js';
import { CHARACTERS, CHARACTER_ORDER } from '../data/characters.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { RECIPES, BLUEPRINTS } from '../data/blueprints.js';
import { STAGES } from '../data/regions.js';
import { evaluate, finalizeWeapon } from './forge.js';
import { Backpack } from './backpack.js';
import { makeItem, matOf } from './items.js';
import { generateMap } from './mapgen.js';
import { generateFloor, revealAround } from './floorgen.js';
import { unlockedMaterial, ensureSaveV5, unlockHero, friendForStage } from './unlocks.js';
import { computeLoadout, weaponFromItem } from './loadout.js';

export const BAG_W = 6, BAG_H = 5;
const BUFF_KEYS = ['dmg', 'guard', 'stoneResist', 'loot', 'regen'];

// v4: Medusa's gaze turned your weapon to stone (kept for the old forge/camp scenes)
const STONE_BLADES = { bran: ['sword', ['iron', 'copper']], elio: ['staff', ['ember', 'copper']], durgan: ['axe', ['iron', 'tin']], clover: ['dagger', ['silver']] };
function stoneBlade(charId) {
  const [bp, ids] = STONE_BLADES[charId] || STONE_BLADES.bran;
  try {
    const res = evaluate(bp, ids.map((id) => makeItem(id, 2)), { char: charId });
    const w = finalizeWeapon(res, 1, { char: charId });
    return { ...w, name: 'Stonebitten ' + (BLUEPRINTS[bp] ? BLUEPRINTS[bp].name : 'Blade'), stone: 0.3, starter: true };
  } catch (e) { return null; }
}
const withUses = (it) => { const t = MATERIALS[it.id] && MATERIALS[it.id].tool; if (t && t.uses && it.uses === undefined) it.uses = t.uses; return it; };

export class Run {
  constructor(charId, seed = String(Date.now())) {
    ensureSaveV5();
    const c = CHARACTERS[charId] || CHARACTERS.durgan;
    this.char = c.id;
    this.seed = String(seed);
    this.rng = new RNG(this.seed);
    this.baseHp = c.hp; this.hp = c.hp;
    this.coins = 0;
    this.bag = new Backpack(BAG_W, BAG_H);
    for (const id of c.start || []) if (MATERIALS[id]) this.bag.add(withUses(makeItem(id, 2)));
    this.hand = c.weapon && MATERIALS[c.weapon] ? makeItem(c.weapon, 2) : null;
    this.skills = [null, null];
    this.effects = [];
    this.recipesKnown = [];
    this.stats = { kills: 0, elites: 0, bosses: 0, statues: 0, mined: 0, ores: 0, crafted: 0, rooms: 0, stages: 0, rescues: 0, time: 0,
      // v4
      veins: 0, stews: 0, forged: 0, masterworks: 0, crumbled: 0, shattered: 0, floors: 0, coins: 0 };
    this.flags = {};
    this.companions = [];
    this.statues = CHARACTER_ORDER.filter((id) => id !== this.char);
    this.stage = 0;
    this.floor = generateFloor(this.rng.fork('floor0'), 0);
    this.roomId = this.floor.startId;
    // ---- v4 compatibility (old scenes)
    this.blueprints = [...(c.blueprints || ['sword']), 'pickaxe'];
    this.recipes = [...save.data.discovered.recipes];
    this.stews = [...(save.data.discovered.stews || [])];
    this.map = generateMap(this.rng.fork('map0'), 0);
    this.pick = { swings: 3, quality: 0, perks: {} };
    this.buffs = [];
    this.rescueQueue = [0, 1, 2].map((s) => friendForStage(this.char, s));
    this.lastWeapon = null; this.lastBp = null; this.bonusGrade = 0;
    this._v4weapon = undefined;
    save.data.stats.runs++;
    save.write();
  }
  get def() { return CHARACTERS[this.char]; }
  get stageDef() { return STAGES[this.stage]; }
  get room() { return this.floor ? this.floor.rooms.get(this.roomId) : null; }
  get isFinalStage() { return this.stage >= STAGES.length - 1; }
  get maxHp() { return computeLoadout(this).maxHp; }
  set maxHp(v) { this.baseHp = Math.max(1, v - computeLoadout({ ...this, baseHp: 0, hp: 0 }).stats.maxHp); }
  loadout() { return computeLoadout(this); }

  // ------------------------------------------------------------ v4 names
  get act() { return this.stage; }
  set act(v) { this.stage = v; }
  get region() { return this.stage; }
  set region(v) { this.stage = v; }
  get actDef() { return STAGES[this.stage]; }
  get regionDef() { return STAGES[this.stage]; }
  get isFinalAct() { return this.isFinalStage; }
  /** v4 scenes read run.weapon as a forged weapon; v5 derives it from the hand. */
  get weapon() {
    if (this._v4weapon !== undefined) return this._v4weapon;
    const w = weaponFromItem(this.hand);
    if (!w) return null;
    return { ...w, v5: true, interval: 1 / Math.max(0.2, w.speed), critChance: w.crit, critMult: w.critDmg, el: {}, stats: {}, flags: {}, multi: 0, harvest: 1, stun: w.status.stun || 0, pierce: false, pierceFlat: 0, firstStrike: false, parryBonus: 1, ids: (w.look && w.look.ids) || [], grade: Math.min(4, w.q), synergies: [], stone: this._stone || 0 };
  }
  set weapon(w) { this._v4weapon = w; }
  equip(weapon) { this.lastWeapon = this.weapon; this._v4weapon = weapon ? { ...weapon, stone: weapon.stone || 0 } : null; return this._v4weapon; }
  nextAct() { return this.nextStage(); }
  nextRegion() { return this.nextStage(); }
  friendForAct(act = this.stage) { return this.friendForStage(act); }
  hasCompanion(id) { return this.companions.includes(id); }
  hasKnack(id) { return this.char === id || this.companions.includes(id); }
  forgeables() { return this.bag.items.filter((it) => matOf(it).weapon); }
  gain() { return 0; }
  addBuff(b) { this.buffs.push({ ...b }); }
  buffTotals() { const t = {}; for (const k of BUFF_KEYS) t[k] = 0; for (const b of this.buffs) for (const k of BUFF_KEYS) t[k] += b[k] || 0; t.stoneResist = Math.min(100, t.stoneResist); return t; }
  tickBuffs() { const gone = []; for (const b of this.buffs) { b.fights--; if (b.fights <= 0) gone.push(b.name); } this.buffs = this.buffs.filter((b) => b.fights > 0); return gone; }
  learnRecipe(id) { if (!this.recipes.includes(id)) this.recipes.push(id); return save.learn('discovered.recipes', id); }
  learnStew(id) { if (!this.stews.includes(id)) this.stews.push(id); return save.learn('discovered.stews', id); }
  unknownRecipe(rng = this.rng) {
    const unknown = Object.keys(RECIPES).filter((r) => !this.recipes.includes(r) && RECIPES[r].ings.every((i) => unlockedMaterial(i)));
    return unknown.length ? rng.pick(unknown) : null;
  }

  // ------------------------------------------------------------ stages & rooms
  enterStage(n) {
    this.stage = Math.max(0, Math.min(STAGES.length - 1, n));
    this.floor = generateFloor(this.rng.fork('floor' + this.stage), this.stage);
    this.roomId = this.floor.startId;
    this.map = generateMap(this.rng.fork('map' + this.stage), this.stage);
    if (this.stage > save.data.stats.bestStage) { save.data.stats.bestStage = this.stage; save.data.stats.bestRegion = Math.max(save.data.stats.bestRegion || 0, this.stage); save.write(); }
    return this.floor;
  }
  /** After a stage boss: heal 30%, next floor (null after the last stage). */
  nextStage() {
    this.stats.stages++;
    if (this.isFinalStage) return null;
    this.heal(Math.round(this.maxHp * 0.3));
    return this.enterStage(this.stage + 1);
  }
  moveTo(roomId) {
    if (!this.floor.rooms.has(roomId)) return null;
    this.roomId = roomId;
    const r = this.room;
    if (!r.visited) { r.visited = true; this.stats.rooms++; }
    revealAround(this.floor, roomId);
    return r;
  }

  // ------------------------------------------------------------ friends
  friendForStage(stage = this.stage) { return friendForStage(this.char, stage); }
  rescue(id) {
    const i = this.statues.indexOf(id);
    if (i >= 0) this.statues.splice(i, 1);
    if (!this.companions.includes(id)) this.companions.push(id);
    this.stats.rescues++;
    return unlockHero(id);
  }

  // ------------------------------------------------------------ bag & body
  addItem(it) { withUses(it); return this.bag.add(it); }
  removeItem(it) { this.bag.remove(it); }
  toolItems() { return this.bag.all().filter((it) => matOf(it) && matOf(it).tool); }
  heal(n) { const max = this.maxHp; const b = this.hp; this.hp = Math.min(max, this.hp + Math.max(0, n)); return this.hp - b; }
  hurt(n) { this.hp = Math.max(0, this.hp - n); return this.hp <= 0; }

  /** Take a weapon item from the bag into your hand; the old one goes back into the bag. */
  equipWeapon(item) {
    if (!item || !matOf(item) || matOf(item).kind !== 'weapon') return null;
    this.bag.remove(item);
    const old = this.hand;
    this.hand = item;
    this._v4weapon = undefined;
    if (old) this.bag.add(old);
    return old;
  }
  /** Slot a skill gem (from the bag) into slot 0/1; the gem that was there returns to the bag. */
  equipSkill(item, slot = 0) {
    if (!item || !matOf(item) || matOf(item).kind !== 'skill') return null;
    slot = slot ? 1 : 0;
    this.bag.remove(item);
    const old = this.skills[slot];
    this.skills[slot] = item;
    if (old) this.bag.add(old);
    return old;
  }
  unequipSkill(slot = 0) {
    const old = this.skills[slot ? 1 : 0];
    if (!old) return null;
    this.skills[slot ? 1 : 0] = null;
    this.bag.add(old);
    return old;
  }
  /** Drink a potion from the bag. */
  drink(item) {
    const m = item && matOf(item);
    if (!m || !m.potion) return null;
    this.bag.remove(item);
    const mul = (this.def.potionMul || 1) * (0.8 + 0.1 * (item.q ?? 2));
    const healed = m.potion.heal ? this.heal(Math.round(m.potion.heal * mul)) : 0;
    let effect = null;
    if (m.potion.rooms) { effect = { name: m.name, icon: m.sprite, rooms: m.potion.rooms, stats: m.potion.stats || {} }; this.addEffect(effect); }
    return { healed, effect };
  }
  addEffect(e) { this.effects.push({ ...e }); }
  /** A room was cleared: regen heals, effects tick down. */
  roomCleared() {
    const lo = computeLoadout(this);
    const healed = lo.stats.regen ? this.heal(lo.stats.regen) : 0;
    const expired = [];
    for (const e of this.effects) { e.rooms--; if (e.rooms <= 0) expired.push(e.name); }
    this.effects = this.effects.filter((e) => e.rooms > 0);
    return { healed, expired };
  }
}

// ---------------------------------------------------------------- v4 loot helpers (old scenes)
const pool = (act, kinds, minRarity = 0, maxRarity = 4) => Object.values(MATERIALS).filter((m) =>
  kinds.includes(m.kind) && unlockedMaterial(m.id) && !m.tags.includes('boss') && RARITY[m.rarity].order >= minRarity && RARITY[m.rarity].order <= maxRarity &&
  (!m.acts || m.acts.includes(act)));

export function rollMaterial(rng, act, kinds, minR = 0, maxR = 4, luck = 0) {
  let p = pool(act, kinds, minR, maxR);
  if (!p.length) p = pool(act, kinds, 0, 4);
  if (!p.length) return 'petrite';
  return rng.weighted(p.map((m) => [m.id, RARITY[m.rarity].weight * (RARITY[m.rarity].order >= 2 ? 1 + luck : 1)]));
}
export function rollQuality(rng, bonus = 0) {
  return Math.max(0, Math.min(4, 2 + bonus + (rng.chance(0.25) ? 1 : 0) - (rng.chance(0.2) ? 1 : 0)));
}
export { chestLoot } from './loot.js';
export const CHESTS = { old: { name: 'Old Chest' }, wood: { name: 'Wooden Chest' }, iron: { name: 'Iron Chest' }, crystal: { name: 'Crystal Chest' }, bone: { name: 'Bone Chest' }, gold: { name: 'Golden Chest' } };
export function merchantStock() { return []; }
export function monsterDrops(run, monsterDef, picks = 1) {
  const rng = run.rng;
  const out = [];
  for (const d of monsterDef.drops || []) if (rng.chance(Math.min(1, d.chance))) out.push(d.id);
  while (out.length < Math.max(2, picks + 1) && monsterDef.drops && monsterDef.drops.length) out.push(rng.pick(monsterDef.drops).id);
  return out.slice(0, 6);
}
void stoneBlade;
// hero unlocks, re-exported for convenience
export { unlockHero, unlockedHeroes, heroUnlocked, friendForStage, unlockHintFor, ensureSaveV5 } from './unlocks.js';
