// Item instances + text helpers.
import { MATERIALS, QUALITY, RARITY } from '../data/materials.js';
import { SHAPES, rotateCells } from '../data/shapes.js';

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

/** Item display lines for tooltips/cards. */
export function itemTooltip(it) {
  const m = matOf(it);
  const q = QUALITY[it.q ?? 2];
  const lines = [];
  if (m.weapon) lines.push(`{@sword} ${m.desc}`);
  else lines.push(m.desc);
  if (m.pick && m.pdesc) lines.push(`{@pickaxe} ${m.pdesc}`);
  if (m.bag) lines.push(`{@bag} ${m.bag.text}`);
  return {
    title: m.name,
    color: RARITY[m.rarity].color,
    body: `{${m.rarity}}${RARITY[m.rarity].name}{/} · {${q.color}}${q.name}{/}\n` + lines.join('\n') + (m.flavor ? `\n{dim}${m.flavor}{/}` : ''),
    w: 170,
  };
}
