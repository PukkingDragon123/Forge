// Item instances + text helpers.
import { MATERIALS, QUALITY, RARITY } from '../data/materials.js';
import { SHAPES, rotateCells } from '../data/shapes.js';
import { STEW_FX, STEW_FX_ORDER } from '../data/stews.js';
import { CRAFT } from '../data/recipes.js';
import { SKILLS } from '../data/skills.js';

let UID = 1;
export function makeItem(id, q = 2, extra = {}) {
  const m = MATERIALS[id];
  if (!m) throw new Error('Unknown material ' + id);
  return { uid: UID++, id, q: Math.max(0, Math.min(4, q)), rot: 0, x: -1, y: -1, ...extra };
}
export function bumpUid(n) { UID = Math.max(UID, n + 1); }

export const matOf = (it) => MATERIALS[it.id];
export const qMult = (it) => QUALITY[it.q ?? 2].mult;
export const rarityOf = (it) => RARITY[matOf(it).rarity];
export const cellsOf = (it) => rotateCells(SHAPES[matOf(it).shape || 'o1'], it.rot || 0);
export const sizeOf = (it) => SHAPES[matOf(it).shape || 'o1'].length;

/** Sell value in coins. */
export function itemValue(it) {
  const m = matOf(it);
  return Math.max(1, Math.round(m.value * QUALITY[it.q ?? 2].mult));
}

const W_LABEL = {
  chips: (v) => `{chips}+${v} Chips{/}`, mult: (v) => `{mult}+${v} Mult{/}`, xmult: (v) => `{xmult}×${v} Mult{/}`,
  fire: (v) => `{fire}Fire ${v}{/}`, ice: (v) => `{ice}Ice ${v}{/}`, shock: (v) => `{shock}Shock ${v}{/}`,
  poison: (v) => `{poison}Poison ${v}{/}`, bleed: (v) => `{bleed}Bleed ${v}{/}`, curse: (v) => `{curse}Curse ${v}{/}`, holy: (v) => `{holy}Holy ${v}{/}`,
  speed: (v) => `{good}+${v}% Speed{/}`, crit: (v) => `{crit}+${v}% Crit{/}`, critDmg: (v) => `{crit}+${v}× Crit dmg{/}`,
  lifesteal: (v) => `{heal}${v}% Lifesteal{/}`, block: (v) => `{block}+${v}% Block{/}`, multi: (v) => `{good}+${v} hit{/}`,
  stun: (v) => `${v}% Stun`, greed: (v) => `+${v}{@coin}/hit`, harvest: (v) => (v > 0 ? `{good}+${v} Harvest{/}` : `{bad}${v} Harvest{/}`),
  pierce: () => 'Ignores armor', drain: (v) => `{bad}-${v} HP/hit{/}`, slow: (v) => `Foe {good}-${v}% speed{/}`, miss: (v) => `Foe {good}${v}% miss{/}`,
  firstCrit: () => 'First hit crits', charge: (v) => `Special {good}+${v}%{/}`,
};
export function describeWeaponFx(w) {
  if (!w) return '';
  return Object.entries(w).filter(([k]) => W_LABEL[k]).map(([k, v]) => W_LABEL[k](v)).join(' ');
}

export const KEYWORDS = {
  Fire: '{fire}Fire{/}: burns for damage over time each second.',
  Ice: '{ice}Ice{/}: chills — slows enemy attacks; 5 stacks freeze them.',
  Shock: '{shock}Shock{/}: chance to stun and arc extra damage.',
  Poison: '{poison}Poison{/}: stacking damage that grows every tick.',
  Bleed: '{bleed}Bleed{/}: each hit opens wounds that tick damage.',
  Curse: '{curse}Curse{/}: hits harder against everything — but hungers.',
  Holy: '{holy}Holy{/}: ×1.5 damage per stack vs undead and cursed.',
  Armor: 'Armor: reduces each hit by its value.',
};

const V5_KINDS = new Set(['weapon', 'amulet', 'charm', 'skill', 'tool', 'potion']);
const STAT_LABEL = {
  dmg: (v) => `{mult}${v > 0 ? '+' : ''}${v}% dmg{/}`, atkSpd: (v) => `{good}+${v}% attack speed{/}`, moveSpd: (v) => (v > 0 ? `{good}+${v}% speed{/}` : `{bad}${v}% speed{/}`),
  crit: (v) => `{crit}+${v}% crit{/}`, critDmg: (v) => `{crit}+${v}× crit dmg{/}`, maxHp: (v) => `{heal}+${v} max HP{/}`, armor: (v) => `{block}+${v} armor{/}`,
  dashCharges: (v) => `{good}+${v} dash{/}`, lifesteal: (v) => `{heal}${v}% lifesteal{/}`, thorns: (v) => `thorns ${v}`, regen: (v) => `{heal}+${v} HP per room{/}`,
  skillCd: (v) => `{good}-${v}% cooldowns{/}`, pickupRadius: (v) => `+${v}m pickup`, lootLuck: (v) => `{gold}+${v}% loot{/}`, oreLuck: (v) => `{gold}+${v}% ore{/}`,
  pickPower: (v) => `+${v} pick power`, petrify: (v) => `{good}+${v}% petrify{/}`,
};
/** One short line of stats, e.g. "+12% crit, +0.5× crit dmg". */
export function statSummary(st = {}) {
  const out = [];
  for (const [k, v] of Object.entries(st)) {
    if (k === 'status') { for (const [s, c] of Object.entries(v || {})) out.push(`{${s === 'stun' ? 'shock' : s === 'slow' ? 'ice' : s}}${c}% ${s}{/}`); continue; }
    if (STAT_LABEL[k] && v) out.push(STAT_LABEL[k](v));
  }
  return out.join(', ');
}
const usedInCount = (id) => Object.values(CRAFT).filter((r) => r.ings.includes(id)).length;

/** v5 tooltip lines: what the item does for your build (short). */
function v5Lines(it, m) {
  const L = [m.desc];
  if (m.wpn) { const w = m.wpn; L.push(`{@${w.type}} ${Math.round(w.dmg * QUALITY[it.q ?? 2].mult)} dmg · ${w.type}${w.petrify ? ` · {good}${Math.round(w.petrify * 100)}% petrify{/}` : ''}`); if (m.bagPassive) L.push(`{@bag} ${statSummary(m.bagPassive)}`); }
  if (m.passive) L.push(statSummary(m.passive));
  if (m.adj) L.push(`{@bag} beside ${m.adj.match.kind || m.adj.match.tag}: ${statSummary(m.adj.give)}`);
  if (m.skill && SKILLS[m.skill]) L.push(`{@clock} ${SKILLS[m.skill].cd}s cooldown`);
  if (m.tool) L.push(m.tool.uses ? `${it.uses ?? m.tool.uses}/${m.tool.uses} uses` : 'Unbreakable');
  return L;
}

/** Item display lines for tooltips/cards. */
export function itemTooltip(it) {
  const m = matOf(it);
  if (V5_KINDS.has(m.kind) || m.kind === 'recipe' && it.recipe) {
    const lines = m.kind === 'recipe' && it.recipe && CRAFT[it.recipe] ? [`Teaches: ${MATERIALS[CRAFT[it.recipe].out].name}`] : v5Lines(it, m);
    const q = QUALITY[it.q ?? 2];
    return { title: m.name, color: RARITY[m.rarity].color, body: `{${m.rarity}}${RARITY[m.rarity].name}{/} · {${q.color}}${q.name}{/}\n` + lines.join('\n'), w: 170 };
  }
  if (['ore', 'gem', 'crystal', 'mineral', 'part', 'forage'].includes(m.kind) && usedInCount(m.id)) {
    const q = QUALITY[it.q ?? 2];
    return { title: m.name, color: RARITY[m.rarity].color, body: `{${m.rarity}}${RARITY[m.rarity].name}{/} · {${q.color}}${q.name}{/}\nIngredient · ${usedInCount(m.id)} recipe${usedInCount(m.id) > 1 ? 's' : ''}` + (m.flavor ? `\n{dim}${m.flavor}{/}` : ''), w: 170 };
  }
  const q = QUALITY[it.q ?? 2];
  const lines = [];
  if (m.weapon) lines.push(`{@sword} ${m.desc}`);
  else if (!m.cook) lines.push(m.desc);
  if (m.pick && m.pdesc) lines.push(`{@pickaxe} ${m.pdesc}`);
  if (m.bag) lines.push(`{@bag} ${m.bag.text}`);
  if (m.cook) lines.push(`{@campfire} ` + cookSummary(m.cook));
  return {
    title: m.name,
    color: RARITY[m.rarity].color,
    body: `{${m.rarity}}${RARITY[m.rarity].name}{/} · {${q.color}}${q.name}{/}\n` + lines.join('\n') + (m.flavor ? `\n{dim}${m.flavor}{/}` : ''),
    w: 170,
  };
}

/** One short line for an ingredient's cooking effects, e.g. "+6 HP, regen 1". */
export function cookSummary(c) {
  const parts = STEW_FX_ORDER.filter((k) => c[k]).map((k) => `{${STEW_FX[k].tag}}${STEW_FX[k].label(c[k])}{/}`);
  if (c.salt) parts.push('{gold}seasons{/}');
  return parts.join(', ');
}
