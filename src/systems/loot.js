// Loot (docs/REDESIGN.md §7). Kills drop a little; petrified foes become ore statues you mine; cleared
// rooms sometimes leave a pickup; treasure rooms hold one build item on a pedestal; bosses pay big.
//
//   rollDrops(run, def, { elite?, luck? }) → [item]                small drops on a kill (parts, forage, rare pages)
//   petrifyChance(loadout, def) → 0..1                              does this kill leave a statue? (elites/bosses: 1)
//   statueOre(run, def) → [[materialId, weight], …]                what its statue holds (systems/mining uses it)
//   roomReward(run, room) → [item]                                  room-clear pickups (0–2)
//   treasureLoot(run, { kind? }) → { pedestal: item, extras: [item] }   kind: 'amulet'|'charm'|'skill'|'weapon'|'any'
//   chestLoot(run, kind) → { items: [item], coins: 0 }               (kept name: 'old'|'wood'|'iron'|… → v5 items)
//   bossLoot(run, stage) → [item]
//   forageFor(run, n) → [item]                                      stage forage lying in rooms
import { MATERIALS, RARITY } from '../data/materials.js';
import { MONSTERS } from '../data/monsters.js';
import { STAGES } from '../data/regions.js';
import { CRAFT } from '../data/recipes.js';
import { makeItem } from './items.js';
import { randomUnknownRecipe } from './crafting.js';

const stageOfRun = (run) => Math.max(0, Math.min(STAGES.length - 1, run ? (run.stage ?? run.act ?? 0) : 0));
const luckOf = (run, extra = 0) => {
  let l = extra;
  try { if (run && run.loadout) l += run.loadout().stats.lootLuck || 0; } catch (e) { /* loadout not ready */ }
  return l;
};
const q = (rng, bonus = 0) => Math.max(0, Math.min(4, 2 + bonus + (rng.chance(0.25) ? 1 : 0) - (rng.chance(0.2) ? 1 : 0)));
const defOf = (d) => (typeof d === 'string' ? MONSTERS[d] : d) || {};
const rarityW = (m, luck = 0) => RARITY[m.rarity].weight * (RARITY[m.rarity].order >= 2 ? 1 + luck : 1);

function page(run, rng) {
  const id = randomUnknownRecipe(run, rng, stageOfRun(run));
  return id ? makeItem('recipe_page', 2, { recipe: id }) : null;
}

export function forageFor(run, n = 1) {
  const S = STAGES[stageOfRun(run)];
  const out = [];
  for (let i = 0; i < n; i++) { const id = run.rng.weighted(S.forage.filter(([x]) => MATERIALS[x])); if (id) out.push(makeItem(id, q(run.rng))); }
  return out;
}

export function rollDrops(run, defOrId, opts = {}) {
  const def = defOf(defOrId), rng = run.rng, out = [];
  const luck = luckOf(run, opts.luck || 0);
  const elite = opts.elite || def.tier === 'elite';
  for (const d of def.drops || []) if (MATERIALS[d.id] && rng.chance(Math.min(1, d.chance * 0.45 * (1 + luck)))) out.push(makeItem(d.id, q(rng)));
  if (rng.chance(0.08 * (1 + luck))) out.push(...forageFor(run, 1));
  if (rng.chance(0.03)) out.push(makeItem('healing_potion', 2));
  if (rng.chance(elite ? 0.18 : 0.015)) { const p = page(run, rng); if (p) out.push(p); }
  if (elite && rng.chance(0.3 + luck * 0.2)) out.push(buildItem(run, rng, rng.chance(0.5) ? 'charm' : 'amulet'));
  return out.slice(0, elite ? 4 : 2);
}

export function petrifyChance(loadout, defOrId) {
  const def = defOf(defOrId);
  if (def.tier === 'elite' || def.tier === 'boss') return 1;
  const w = loadout && loadout.weapon;
  return Math.max(0, Math.min(1, (w ? w.petrify || 0 : 0)));
}

/** What a statue of this monster holds: its `ore` list first, then its parts, always some petrite. */
export function statueOre(run, defOrId) {
  const def = defOf(defOrId);
  const st = stageOfRun(run);
  const table = [['petrite', 30]];
  const ore = Array.isArray(def.ore) ? def.ore : [];
  for (const id of ore) if (MATERIALS[id]) table.push([id, MATERIALS[id].kind === 'part' ? 14 : 22]);
  if (!ore.length) {
    for (const [id, w] of STAGES[st].veins.slice(0, 4)) if (MATERIALS[id]) table.push([id, w * 0.5]);
    for (const d of def.drops || []) if (MATERIALS[d.id]) table.push([d.id, 10 * d.chance]);
  }
  if (def.tier === 'elite' || def.tier === 'boss') table.push(['gorgonite', def.tier === 'boss' ? 14 : 6]);
  return table;
}

export function roomReward(run, room) {
  const rng = run.rng, out = [];
  const luck = luckOf(run);
  if (rng.chance(0.42 + luck * 0.2)) {
    const r = rng.next();
    if (r < 0.45) out.push(...forageFor(run, 1));
    else if (r < 0.75) { const S = STAGES[stageOfRun(run)]; out.push(makeItem(rng.weighted(S.veins.filter(([x]) => MATERIALS[x])), q(rng))); }
    else if (r < 0.92) out.push(makeItem(rng.chance(0.7) ? 'healing_potion' : rng.pick(['bomb', 'lantern', 'chisel']), 2));
    else { const p = page(run, rng); if (p) out.push(p); }
  }
  if (room && room.size === 'large' && rng.chance(0.35)) out.push(buildItem(run, rng, 'charm'));
  return out;
}

/** A build item (amulet / charm / skill gem / weapon) for the stage, avoiding amulets you already own. */
export function buildItem(run, rng, kind = 'any', minOrder = 0) {
  const owned = new Set([...(run.bag ? run.bag.all() : []), run.hand, ...(run.skills || [])].filter(Boolean).map((it) => it.id));
  const kinds = kind === 'any' ? ['amulet', 'charm', 'skill', 'weapon'] : [kind];
  const st = stageOfRun(run);
  const luck = luckOf(run);
  let pool = Object.values(MATERIALS).filter((m) => kinds.includes(m.kind) && !m.tags.includes('boss') && RARITY[m.rarity].order >= minOrder &&
    RARITY[m.rarity].order <= 1 + st + (rng.chance(0.25) ? 1 : 0) && !(m.kind === 'amulet' && owned.has(m.id)) && !['stone_axe'].includes(m.id));
  if (!pool.length) pool = Object.values(MATERIALS).filter((m) => kinds.includes(m.kind) && !m.tags.includes('boss'));
  const id = rng.weighted(pool.map((m) => [m.id, rarityW(m, luck)]));
  const it = makeItem(id, q(rng, st >= 2 ? 1 : 0));
  if (MATERIALS[id].tool && MATERIALS[id].tool.uses) it.uses = MATERIALS[id].tool.uses;
  return it;
}

export function treasureLoot(run, opts = {}) {
  const rng = run.rng;
  const kind = opts.kind || rng.weighted([['amulet', 34], ['skill', 26], ['weapon', 22], ['charm', 18]]);
  const pedestal = buildItem(run, rng, kind, rng.chance(0.35) ? 1 : 0);
  const extras = [];
  if (rng.chance(0.4)) { const p = page(run, rng); if (p) extras.push(p); }
  return { pedestal, extras };
}

const CHEST_V5 = {
  old: { n: 2, build: 0.35, page: 0.3 }, wood: { n: 2, build: 0.2, page: 0.2 }, iron: { n: 3, build: 0.45, page: 0.3 },
  crystal: { n: 3, build: 0.4, page: 0.3 }, bone: { n: 3, build: 0.4, page: 0.3 }, gold: { n: 3, build: 0.8, page: 0.5 },
};
export function chestLoot(run, kind = 'old') {
  const c = CHEST_V5[kind] || CHEST_V5.old, rng = run.rng, items = [];
  const S = STAGES[stageOfRun(run)];
  for (let i = 0; i < c.n; i++) {
    if (rng.chance(0.5)) items.push(makeItem(rng.weighted(S.veins.filter(([x]) => MATERIALS[x])), q(rng)));
    else items.push(...forageFor(run, 1));
  }
  if (rng.chance(c.build)) items.push(buildItem(run, rng, 'any'));
  if (rng.chance(c.page)) { const p = page(run, rng); if (p) items.push(p); }
  return { items, coins: 0 };
}

const BOSS_PART = { grand_puffcap: 'puffcap_crown', glasscoil: 'herald_scale', cinderfang: 'herald_scale', medusa: 'gorgon_tear', thornscale: 'herald_scale' };
export function bossLoot(run, stage = stageOfRun(run)) {
  const rng = run.rng, out = [];
  const boss = STAGES[Math.max(0, Math.min(3, stage))].boss;
  const part = BOSS_PART[boss] || 'herald_scale';
  if (MATERIALS[part]) out.push(makeItem(part, 3));
  out.push(buildItem(run, rng, rng.chance(0.5) ? 'amulet' : 'weapon', 2));
  const p = page(run, rng); if (p) out.push(p);
  out.push(makeItem('healing_potion', 3));
  // the boss part's own recipe page, if one uses it
  const rid = Object.keys(CRAFT).find((id) => CRAFT[id].ings.includes(part));
  if (rid) out.push(makeItem('recipe_page', 3, { recipe: rid }));
  return out;
}
