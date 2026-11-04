// Every material in FORGLITE. Each has a weapon effect, a pickaxe effect, a backpack shape and (for
// cooking ingredients) a `cook` effect. v4: ores are bulky (3–4 cells), gems small, forage 1 cell.
// cook keys: heal (HP now) maxHp (+max HP) dmg (% damage) guard (% wider guard window)
//   stoneResist (% less stone per kill) loot (% more statue/vein loot) regen (HP every 3 s in fights)
//   salt (seasoning: each one makes the other effects 25% stronger)
// weapon keys: chips mult xmult | fire ice shock poison bleed curse holy (stacks) | speed crit critDmg
//   lifesteal block multi stun greed harvest pierce drain slow miss firstCrit charge | fx (special hook id)
// pick keys: strikes magnetic gemDupe cursed lucky smelt hard freeze chain reveal column area preserve
//   unlock archaeo seehaz quality
// regions: indices of mine regions where it can be dug (0 Hollowdeep … 5 Forbidden Tomb)

import { V5_ITEMS } from './items.js';

export const RARITY = {
  common: { order: 0, color: '#c9c1b3', name: 'Common', weight: 100 },
  uncommon: { order: 1, color: '#5fd17a', name: 'Uncommon', weight: 42 },
  rare: { order: 2, color: '#4fa6ff', name: 'Rare', weight: 16 },
  epic: { order: 3, color: '#c071ff', name: 'Epic', weight: 5 },
  legendary: { order: 4, color: '#ffb63d', name: 'Legendary', weight: 1.2 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const QUALITY = [
  { name: 'Cracked', mult: 0.6, color: '#8a7a6a' },
  { name: 'Rough', mult: 0.8, color: '#b8a888' },
  { name: 'Fine', mult: 1.0, color: '#f4ecd8' },
  { name: 'Pristine', mult: 1.25, color: '#7fe3ff' },
  { name: 'Flawless', mult: 1.5, color: '#ffd25e' },
];

const M = {};
function def(id, o) { M[id] = { id, tags: [], value: 3, shape: 'o1', ...o }; }

// ------------------------------------------------------------------ METAL ORES
def('junk', {
  name: 'Junk Ore', kind: 'ore', rarity: 'common', tags: ['junk', 'solid'], color: '#7a6e64', color2: '#a0583a', sprite: 'chunk',
  value: 1, regions: [0, 1, 2, 3, 4, 5], depth: 0,
  weapon: { chips: 2, fx: 'scrap' }, pick: { strikes: 1 },
  desc: '{chips}+2 Chips{/}. {chips}+2 Chips{/} more for each other Junk.', pdesc: '+1 Strike. Cheap!',
  flavor: 'Rusty, lumpy, mostly rock. Someone has to love it.',
});
def('coal', {
  name: 'Coal', kind: 'ore', rarity: 'common', tags: ['fuel', 'solid'], color: '#2e2a2c', color2: '#5a5258', sprite: 'nuggets',
  value: 2, regions: [0, 2, 4], depth: 0.1,
  weapon: { chips: 1, fx: 'coal' }, pick: { smelt: 1 },
  desc: '{chips}+1 Chips{/}. {mult}+2 Mult{/} if a Metal is in the weapon.', pdesc: 'Smelt: mined metals +1 quality.',
  bag: { near: 'metal', text: 'Stokes adjacent metals: they forge at +1 quality.' },
  flavor: 'Burns hot, smudges everything.',
});
def('copper', {
  name: 'Copper Ore', kind: 'ore', rarity: 'common', tags: ['metal', 'solid'], color: '#c8743a', color2: '#5fbf9a', sprite: 'chunk',
  value: 3, regions: [0, 1, 2], depth: 0.1,
  weapon: { chips: 4, mult: 1, fx: 'conductive' }, pick: { strikes: 1, chain: 1 },
  desc: '{chips}+4 Chips{/} {mult}+1 Mult{/}. Conductive: doubles {shock}Shock{/}.', pdesc: '+1 Strike. Conductive: Chain reaches 1 further.',
  flavor: 'Hums faintly when lightning is near.',
});
def('tin', {
  name: 'Tin Ore', kind: 'ore', rarity: 'common', tags: ['metal', 'solid'], color: '#b8bcc4', color2: '#7a8090', sprite: 'nuggets',
  value: 2, regions: [0, 1], depth: 0.05,
  weapon: { chips: 3, fx: 'tin' }, pick: { strikes: 1 },
  desc: '{chips}+3 Chips{/}. With Copper: makes {gold}Bronze{/}.', pdesc: '+1 Strike.',
  flavor: 'Soft alone. Brilliant in company.',
});
def('iron', {
  name: 'Iron Ore', kind: 'ore', rarity: 'common', tags: ['metal', 'solid'], color: '#8e8a92', color2: '#b0583a', sprite: 'chunk',
  value: 4, regions: [0, 1, 3, 4], depth: 0.15,
  weapon: { chips: 8 }, pick: { strikes: 1 },
  desc: '{chips}+8 Chips{/}. With Coal: makes {gold}Steel{/}.', pdesc: '+1 Strike.',
  flavor: 'The backbone of every blade.',
});
def('lodestone', {
  name: 'Lodestone', kind: 'ore', rarity: 'uncommon', tags: ['metal', 'solid', 'magnet'], color: '#3a3a4a', color2: '#d04040', sprite: 'chunk',
  value: 7, regions: [0, 3], depth: 0.4,
  weapon: { chips: 5, fx: 'magnetic' }, pick: { magnetic: 1 },
  desc: '{chips}+5 Chips{/}. {mult}+1 Mult{/} for each other Metal.', pdesc: 'Magnetic: breaking a tile pulls out adjacent metal ores.',
  bag: { near: 'metal', text: 'Adjacent metals snap together: +2 Chips each when forged.' },
  flavor: 'Paperclips fear it.',
});
def('silver', {
  name: 'Silver Ore', kind: 'ore', rarity: 'uncommon', tags: ['metal', 'solid'], color: '#d8dee8', color2: '#8aa0c0', sprite: 'nuggets',
  value: 8, regions: [0, 1, 3, 5], depth: 0.45,
  weapon: { chips: 6, mult: 2, holy: 2 }, pick: { reveal: 1 },
  desc: '{chips}+6 Chips{/} {mult}+2 Mult{/} {holy}Holy 2{/}.', pdesc: 'Glint: reveals the rarity of hidden ores.',
  flavor: 'Undead hate this one weird metal.',
});
def('gold', {
  name: 'Gold Ore', kind: 'ore', rarity: 'rare', tags: ['metal', 'solid', 'precious'], color: '#ffc83a', color2: '#c87a1a', sprite: 'nuggets',
  value: 14, regions: [0, 3, 4], depth: 0.6,
  weapon: { chips: 4, mult: 3, greed: 1 }, pick: { lucky: 1 },
  desc: '{chips}+4 Chips{/} {mult}+3 Mult{/}. Greed: +1{@coin} per hit.', pdesc: 'Lucky: better ores appear.',
  flavor: 'Soft, heavy, and absolutely worth it.',
});
def('mithril', {
  name: 'Mithril', kind: 'ore', rarity: 'epic', tags: ['metal', 'solid', 'precious'], color: '#9ae8ff', color2: '#e0fbff', sprite: 'ingot',
  value: 28, regions: [1, 3, 5], depth: 0.8, unlock: 'reach3',
  weapon: { chips: 14, mult: 4, speed: 20 }, pick: { strikes: 2 },
  desc: '{chips}+14 Chips{/} {mult}+4 Mult{/}. +20% Speed.', pdesc: '+2 Strikes.',
  flavor: 'Light as a feather, sings when swung.',
});
def('stariron', {
  name: 'Star Iron', kind: 'ore', rarity: 'legendary', tags: ['metal', 'solid', 'star'], color: '#3a3a6a', color2: '#ffe08a', sprite: 'meteor',
  value: 50, regions: [2, 4, 5], depth: 0.95, unlock: 'win1',
  weapon: { chips: 24, xmult: 2 }, pick: { column: 1, strikes: 1 },
  desc: '{chips}+24 Chips{/} {xmult}×2 Mult{/}.', pdesc: 'Starfall: your first strike breaks the whole column.',
  flavor: 'It fell from a sky nobody down here has seen.',
});
def('magmasteel', {
  name: 'Magmasteel', kind: 'ore', rarity: 'rare', tags: ['metal', 'solid', 'fire'], color: '#ff6a2a', color2: '#3a1a14', sprite: 'chunk',
  value: 16, regions: [4], depth: 0.5,
  weapon: { chips: 14, fire: 2 }, pick: { hard: 1, smelt: 1 },
  desc: '{chips}+14 Chips{/} {fire}Fire 2{/}.', pdesc: 'Breaks hard rock in one hit. Smelts metals.',
  flavor: 'Still warm from the mountain\'s heart.',
});
def('bronze_ancient', {
  name: 'Ancient Bronze', kind: 'ore', rarity: 'uncommon', tags: ['metal', 'solid', 'bronze'], color: '#b8863a', color2: '#4a9a7a', sprite: 'ingot',
  value: 10, regions: [3], depth: 0.3,
  weapon: { chips: 9, mult: 2 }, pick: { strikes: 1 },
  desc: '{chips}+9 Chips{/} {mult}+2 Mult{/}. Already {gold}Bronze{/}.', pdesc: '+1 Strike.',
  flavor: 'Cast by hands that turned to dust long ago.',
});
def('obsidian', {
  name: 'Obsidian', kind: 'mineral', rarity: 'uncommon', tags: ['solid', 'sharp'], color: '#2a1e3a', color2: '#8a6ac0', sprite: 'shard',
  value: 9, regions: [4, 5], depth: 0.35,
  weapon: { chips: 12, critDmg: 0.5 }, pick: { quality: 1 },
  desc: '{chips}+12 Chips{/}. {crit}+0.5× Crit damage{/}.', pdesc: 'Razor edge: mined gems +1 quality.',
  flavor: 'Volcanic glass. Sharper than any steel.',
});

// ------------------------------------------------------------------ GEMS
def('quartz', {
  name: 'Quartz', kind: 'gem', rarity: 'common', tags: ['gem', 'solid'], color: '#e8e0f0', color2: '#b0a0d0', sprite: 'cluster',
  value: 4, regions: [1, 2], depth: 0.2,
  weapon: { mult: 1, fx: 'clarity' }, pick: { gemDupe: 1 },
  desc: '{mult}+1 Mult{/}. {xmult}×1.1 Mult{/} for each Gem in the weapon.', pdesc: 'Crystal: the first gem you mine is doubled.',
  bag: { near: 'gem', text: 'Adjacent gems resonate: +1 Mult each when forged.' },
  flavor: 'Clear as cave water.',
});
def('amethyst', {
  name: 'Amethyst', kind: 'gem', rarity: 'uncommon', tags: ['gem', 'solid'], color: '#b06bff', color2: '#e0b8ff', sprite: 'cluster',
  value: 9, regions: [1, 2, 5], depth: 0.4,
  weapon: { xmult: 1.5 }, pick: { gemDupe: 1 },
  desc: '{xmult}×1.5 Mult{/}.', pdesc: 'Crystal: the first gem you mine is doubled.',
  flavor: 'Purple promises.',
});
def('ruby', {
  name: 'Ruby', kind: 'gem', rarity: 'rare', tags: ['gem', 'solid', 'fire'], color: '#ff3a4a', color2: '#ffb0b0', sprite: 'gem',
  value: 15, regions: [0, 4], depth: 0.65,
  weapon: { xmult: 1.5, fire: 1 }, pick: { gemDupe: 1, smelt: 1 },
  desc: '{xmult}×1.5 Mult{/} {fire}Fire 1{/}.', pdesc: 'Crystal + Smelt.',
  flavor: 'A heartbeat trapped in stone.',
});
def('sapphire', {
  name: 'Sapphire', kind: 'gem', rarity: 'rare', tags: ['gem', 'solid', 'ice'], color: '#3a7aff', color2: '#b0d8ff', sprite: 'gem',
  value: 15, regions: [1, 3], depth: 0.65,
  weapon: { xmult: 1.5, ice: 1 }, pick: { gemDupe: 1, freeze: 1 },
  desc: '{xmult}×1.5 Mult{/} {ice}Ice 1{/}.', pdesc: 'Crystal + Freeze hazards.',
  flavor: 'Cold blue calm.',
});
def('emerald', {
  name: 'Emerald', kind: 'gem', rarity: 'rare', tags: ['gem', 'solid', 'poison'], color: '#2ad06a', color2: '#b0ffc8', sprite: 'gem',
  value: 15, regions: [2], depth: 0.65,
  weapon: { xmult: 1.5, poison: 1 }, pick: { gemDupe: 1, seehaz: 1 },
  desc: '{xmult}×1.5 Mult{/} {poison}Poison 1{/}.', pdesc: 'Crystal + reveals hazards.',
  flavor: 'Green like the first moss.',
});
def('topaz', {
  name: 'Topaz', kind: 'gem', rarity: 'rare', tags: ['gem', 'solid', 'shock'], color: '#ffd23a', color2: '#fff4b0', sprite: 'gem',
  value: 15, regions: [1, 3], depth: 0.65,
  weapon: { xmult: 1.5, shock: 1 }, pick: { gemDupe: 1, chain: 1 },
  desc: '{xmult}×1.5 Mult{/} {shock}Shock 1{/}.', pdesc: 'Crystal + Chain.',
  flavor: 'Crackles when you rub it on your sleeve.',
});
def('diamond', {
  name: 'Diamond', kind: 'gem', rarity: 'epic', tags: ['gem', 'solid'], color: '#e8fbff', color2: '#9ae0ff', sprite: 'gem',
  value: 32, regions: [1, 4, 5], depth: 0.85, unlock: 'masterwork',
  weapon: { xmult: 2, critDmg: 1 }, pick: { strikes: 1, hard: 1, gemDupe: 1 },
  desc: '{xmult}×2 Mult{/}. {crit}+1× Crit damage{/}.', pdesc: '+1 Strike, breaks hard rock, Crystal.',
  flavor: 'Pressure made perfect.',
});
def('moonstone', {
  name: 'Moonstone', kind: 'gem', rarity: 'rare', tags: ['gem', 'solid'], color: '#c8d8ff', color2: '#ffffff', sprite: 'gem',
  value: 13, regions: [1, 2, 5], depth: 0.55,
  weapon: { mult: 3, crit: 15 }, pick: { reveal: 1 },
  desc: '{mult}+3 Mult{/}. {crit}+15% Crit{/}.', pdesc: 'Glint: reveals the rarity of hidden ores.',
  flavor: 'Glows brighter the deeper you go.',
});
def('prism', {
  name: 'Prism Shard', kind: 'gem', rarity: 'epic', tags: ['gem', 'solid', 'prism'], color: '#ff9af0', color2: '#9af0ff', sprite: 'shard',
  value: 30, regions: [1], depth: 0.85, unlock: 'prismatic',
  weapon: { fx: 'prism' }, pick: { gemDupe: 1, reveal: 1 },
  desc: '{xmult}×1.3 Mult{/} for each distinct Element in the weapon.', pdesc: 'Crystal + Glint.',
  flavor: 'Splits one light into seven.',
});
def('voidcrystal', {
  name: 'Void Crystal', kind: 'gem', rarity: 'epic', tags: ['gem', 'solid', 'cursed'], color: '#1a0a2a', color2: '#c86bff', sprite: 'shard',
  value: 26, regions: [5], depth: 0.7, unlock: 'reach5',
  weapon: { xmult: 3, harvest: -1 }, pick: { cursed: 1, preserve: 1 },
  desc: '{xmult}×3 Mult{/}. {bad}-1 Harvest{/} (it eats the loot).', pdesc: 'Cursed strikes (3×3) without quality loss.',
  flavor: 'Looking into it is like falling.',
});
def('soulstone', {
  name: 'Soulstone', kind: 'gem', rarity: 'legendary', tags: ['gem', 'solid', 'cursed'], color: '#5affd0', color2: '#1a4a5a', sprite: 'gem',
  value: 45, regions: [5], depth: 0.95, unlock: 'shatter30',
  weapon: { xmult: 1.5, fx: 'soulstone' }, pick: { reveal: 1, preserve: 1 },
  desc: '{xmult}×1.5 Mult{/}, plus {xmult}×0.1{/} for every weapon shattered this run.', pdesc: 'Glint + Preserve.',
  flavor: 'Every broken blade whispers into it.',
});

// ------------------------------------------------------------------ ELEMENTAL CRYSTALS
def('ember', {
  name: 'Ember Crystal', kind: 'crystal', rarity: 'uncommon', tags: ['solid', 'fire', 'elemental'], color: '#ff7a2a', color2: '#ffe08a', sprite: 'crystal',
  value: 7, regions: [0, 2, 4], depth: 0.3,
  weapon: { chips: 3, fire: 2 }, pick: { smelt: 1, hard: 1, melt: 1 },
  desc: '{chips}+3 Chips{/} {fire}Fire 2{/}.', pdesc: 'Smelt + breaks hard rock. Melts ice ores!',
  flavor: 'Warm to hold. Too warm, actually.',
});
def('rime', {
  name: 'Rime Shard', kind: 'crystal', rarity: 'uncommon', tags: ['solid', 'ice', 'elemental'], color: '#7fe3ff', color2: '#ffffff', sprite: 'crystal',
  value: 7, regions: [1, 2, 3], depth: 0.3,
  weapon: { chips: 3, ice: 2 }, pick: { freeze: 1 },
  desc: '{chips}+3 Chips{/} {ice}Ice 2{/}.', pdesc: 'Freeze: hazards are frozen solid.',
  flavor: 'Frost blooms where it rests.',
});
def('storm', {
  name: 'Storm Shard', kind: 'crystal', rarity: 'uncommon', tags: ['solid', 'shock', 'elemental'], color: '#ffe74a', color2: '#9a7aff', sprite: 'crystal',
  value: 7, regions: [0, 1, 3], depth: 0.3,
  weapon: { chips: 3, shock: 2 }, pick: { chain: 2 },
  desc: '{chips}+3 Chips{/} {shock}Shock 2{/}.', pdesc: 'Chain: breaking an ore also breaks connected ores of its kind.',
  flavor: 'Your hair stands up just looking at it.',
});
def('venomite', {
  name: 'Venomite', kind: 'crystal', rarity: 'uncommon', tags: ['solid', 'poison', 'elemental'], color: '#8fe04a', color2: '#3a6a1a', sprite: 'crystal',
  value: 6, regions: [2, 5], depth: 0.3,
  weapon: { chips: 2, poison: 2 }, pick: { seehaz: 1 },
  desc: '{chips}+2 Chips{/} {poison}Poison 2{/}.', pdesc: 'Reveals hazards (they smell).',
  flavor: 'Do not lick. We checked.',
});
def('cursedore', {
  name: 'Cursed Ore', kind: 'ore', rarity: 'rare', tags: ['solid', 'cursed', 'metal'], color: '#7a3ab0', color2: '#ff5af0', sprite: 'chunk',
  value: 12, regions: [3, 5], depth: 0.6,
  weapon: { xmult: 2.5, curse: 2, drain: 1 }, pick: { cursed: 1 },
  desc: '{xmult}×2.5 Mult{/} {curse}Curse 2{/}. {bad}Lose 1 HP per hit.{/}', pdesc: 'Cursed: every strike breaks 3×3, but ores lose 1 quality.',
  flavor: 'It remembers the Lord\'s voice.',
});
def('brimstone', {
  name: 'Brimstone', kind: 'mineral', rarity: 'common', tags: ['solid', 'fuel'], color: '#f0d040', color2: '#a07a1a', sprite: 'nuggets',
  value: 3, regions: [4], depth: 0.1,
  weapon: { chips: 2, fx: 'brimstone' }, pick: { area: 1 },
  desc: '{chips}+2 Chips{/}. {mult}+4 Mult{/} if the weapon has {fire}Fire{/}.', pdesc: 'Blasty: each strike also breaks the tile below.',
  flavor: 'Smells like a dragon\'s breakfast.',
});
def('glowcap', {
  name: 'Glowcap', kind: 'forage', rarity: 'common', tags: ['organic', 'poison', 'forage', 'spore'], color: '#5af0c8', color2: '#2a6a7a', sprite: 'mushroom',
  value: 3, regions: [2], depth: 0.1,
  weapon: { mult: 2, poison: 1 }, pick: { seehaz: 1, reveal: 1 },
  desc: '{mult}+2 Mult{/} {poison}Poison 1{/}.', pdesc: 'Lights the wall: reveals hazards and glints.',
  flavor: 'A mushroom that refuses to stop glowing.',
});
def('amber', {
  name: 'Amber', kind: 'mineral', rarity: 'uncommon', tags: ['solid', 'fossil'], color: '#ffa82a', color2: '#7a3a0a', sprite: 'gem',
  value: 9, regions: [2, 3], depth: 0.4,
  weapon: { mult: 2, fx: 'amber' }, pick: { preserve: 1 },
  desc: '{mult}+2 Mult{/}. Monster parts in the weapon are {good}50% stronger{/}.', pdesc: 'Preserve: no quality loss from cursed or blast strikes.',
  bag: { near: 'part', text: 'Preserves adjacent monster parts: +1 quality when forged.' },
  flavor: 'There is a tiny beetle inside. It looks surprised.',
});
def('fossil', {
  name: 'Fossil', kind: 'mineral', rarity: 'uncommon', tags: ['solid', 'fossil', 'bone'], color: '#d8c8a8', color2: '#8a7a5a', sprite: 'fossil',
  value: 8, regions: [0, 2, 3], depth: 0.45,
  weapon: { chips: 6, fx: 'fossil' }, pick: { archaeo: 1 },
  desc: '{chips}+6 Chips{/}. {mult}+1 Mult{/} for each Bone in the weapon.', pdesc: 'Archaeologist: fossils & relics come out +1 quality.',
  flavor: 'An ancient fish, very confused about the mine.',
});
def('runestone', {
  name: 'Runestone', kind: 'mineral', rarity: 'rare', tags: ['solid', 'rune'], color: '#5a6a8a', color2: '#7affe8', sprite: 'rune',
  value: 14, regions: [3, 5], depth: 0.55,
  weapon: { fx: 'runestone', charge: 50 }, pick: { strikes: 1, reveal: 1 },
  desc: '{mult}+2 Mult{/} per distinct Element. Special charges {good}50% faster{/}.', pdesc: '+1 Strike + Glint.',
  flavor: 'The carvings rearrange when you blink.',
});
def('geode', {
  name: 'Geode', kind: 'mineral', rarity: 'uncommon', tags: ['solid', 'gem'], color: '#7a6a5a', color2: '#c08aff', sprite: 'geode',
  value: 8, regions: [1, 2, 3, 4], depth: 0.5, shape: 'o4',
  weapon: { fx: 'geode' }, pick: { gemDupe: 1 },
  desc: 'Counts as {good}2 random Gems{/} when forged. Who knows which?', pdesc: 'Crystal: first gem doubled.',
  flavor: 'Plain outside. Party inside.',
});

// ------------------------------------------------------------------ MONSTER PARTS
const part = (id, o) => def(id, { kind: 'part', tags: ['part', ...(o.tags || [])], ...o });
part('rat_tooth', { name: 'Gremlin Tooth', rarity: 'common', color: '#f0e6c8', sprite: 'fang', value: 2, weapon: { chips: 3, bleed: 1 }, pick: { strikes: 1 }, desc: '{chips}+3 Chips{/} {bleed}Bleed 1{/}.', pdesc: '+1 Strike (it gnaws).', tags: ['fang'] });
part('rat_tail', { name: 'Gremlin Tail', rarity: 'common', color: '#c88a8a', sprite: 'tail', shape: 'i2', value: 2, weapon: { speed: 10 }, pick: {}, desc: '+10% Speed. Whippy!' });
part('bat_fang', { name: 'Needle Fang', rarity: 'common', color: '#ffffff', color2: '#ff4a6a', sprite: 'fang', value: 3, weapon: { chips: 2, lifesteal: 10 }, pick: {}, desc: '{chips}+2 Chips{/} {heal}10% Lifesteal{/}.', tags: ['fang'] });
part('bat_wing', { name: 'Imp Wing', rarity: 'common', color: '#5a3a5a', color2: '#9a6a8a', sprite: 'wing', shape: 'i2', value: 2, weapon: { speed: 15 }, pick: {}, desc: '+15% Speed.' });
part('slime_gel', { name: 'Slime Gel', rarity: 'common', color: '#6ae04a', color2: '#c0ff9a', sprite: 'gel', value: 2, weapon: { slow: 15 }, pick: { freeze: 1 }, desc: 'Sticky: enemy attacks {good}15% slower{/}.', pdesc: 'Gums up hazards (they don\'t trigger).', tags: ['organic'] });
part('beetle_shell', { name: 'Pebble Plate', rarity: 'common', color: '#3a5a8a', color2: '#7ab0ff', sprite: 'shell', shape: 'o4', value: 4, weapon: { chips: 4, block: 25 }, pick: {}, desc: '{chips}+4 Chips{/} {block}+25% Block{/}.', tags: ['shell', 'solid'] });
part('mandible', { name: 'Flint Knuckle', rarity: 'uncommon', color: '#4a3a2a', color2: '#c8a060', sprite: 'claw', value: 5, weapon: { chips: 5, crit: 10 }, pick: { strikes: 1 }, desc: '{chips}+5 Chips{/} {crit}+10% Crit{/}.', tags: ['fang', 'solid'] });
part('spider_silk', { name: 'Snare Silk', rarity: 'uncommon', color: '#f0f0ff', color2: '#b0b0d0', sprite: 'silk', value: 6, weapon: { multi: 1 }, pick: {}, desc: '{good}+1 extra hit{/} per attack (half damage).', tags: ['organic'] });
part('venom_sac', { name: 'Toxin Sac', rarity: 'uncommon', color: '#8a4ad0', color2: '#c0ff4a', sprite: 'sac', value: 6, weapon: { poison: 3 }, pick: {}, desc: '{poison}Poison 3{/}.', tags: ['organic', 'poison'] });
part('crystal_claw', { name: 'Crystal Claw', rarity: 'uncommon', color: '#7ad8ff', color2: '#e0f8ff', sprite: 'claw', value: 7, weapon: { chips: 4, critDmg: 0.5 }, pick: { gemDupe: 1 }, desc: '{chips}+4 Chips{/} {crit}+0.5× Crit damage{/}.', tags: ['solid', 'gem'] });
part('golem_core', { name: 'Golem Core', rarity: 'rare', color: '#ffb84a', color2: '#5a4a3a', sprite: 'core', shape: 'o4', value: 14, weapon: { chips: 18, stun: 10 }, pick: { area: 1, strikes: 1 }, desc: '{chips}+18 Chips{/}. 10% Stun. Hammers love it.', pdesc: '+1 Strike, each strike also breaks the tile below.', tags: ['core', 'solid'] });
part('wisp_essence', { name: 'Wisp Essence', rarity: 'rare', color: '#9af0ff', color2: '#ffffff', sprite: 'essence', value: 12, weapon: { mult: 2, fx: 'wisp' }, pick: { reveal: 1 }, desc: '{mult}+2 Mult{/}. +1 stack of each Element already present.', tags: ['magic'] });
part('spore_sac', { name: 'Spore Sac', rarity: 'common', color: '#c08a4a', color2: '#f0e08a', sprite: 'sac', value: 3, weapon: { poison: 2, miss: 10 }, pick: {}, desc: '{poison}Poison 2{/}. Spores: enemy {good}10% miss{/}.', tags: ['organic', 'poison', 'spore'] });
part('moth_dust', { name: 'Glowcap Dust', rarity: 'uncommon', color: '#e0d0ff', color2: '#9a8ac0', sprite: 'dust', value: 5, weapon: { miss: 15 }, pick: {}, desc: 'Dazzle: enemy {good}15% miss{/}.', tags: ['magic'] });
part('snail_shell', { name: 'Mossy Stone', rarity: 'common', color: '#c88a5a', color2: '#f0d0a0', sprite: 'shell', shape: 'o4', value: 4, weapon: { chips: 3, block: 30 }, pick: {}, desc: '{chips}+3 Chips{/} {block}+30% Block{/}.', tags: ['shell', 'solid'] });
part('salamander_scale', { name: 'Magma Hide', rarity: 'uncommon', color: '#ff5a2a', color2: '#ffd04a', sprite: 'scale', value: 6, weapon: { chips: 4, fire: 2 }, pick: { smelt: 1 }, desc: '{chips}+4 Chips{/} {fire}Fire 2{/}.', tags: ['scale', 'solid'] });
part('bone', { name: 'Bone', rarity: 'common', color: '#efe6d0', color2: '#b8a888', sprite: 'bone', shape: 'i2', value: 2, weapon: { chips: 4, fx: 'bones' }, pick: { strikes: 1 }, desc: '{chips}+4 Chips{/}. {chips}+2 Chips{/} per other Bone.', pdesc: '+1 Strike.', tags: ['bone', 'solid'] });
part('skull', { name: 'Skull', rarity: 'uncommon', color: '#efe6d0', color2: '#5a4a3a', sprite: 'skull', value: 6, weapon: { xmult: 1.5, fx: 'fear' }, pick: {}, desc: '{xmult}×1.5 Mult{/}. Fear: the enemy hesitates before its first attack.', tags: ['bone', 'solid'] });
part('ectoplasm', { name: 'Ectoplasm', rarity: 'rare', color: '#9affc8', color2: '#3ab08a', sprite: 'gel', value: 10, weapon: { mult: 2, pierce: 1 }, pick: {}, desc: '{mult}+2 Mult{/}. Ghostly: ignores armor.', tags: ['magic'] });
part('wyrm_scale', { name: 'Drake Scale', rarity: 'rare', color: '#c83a2a', color2: '#ffb04a', sprite: 'scale', shape: 'o4', value: 12, weapon: { chips: 8, block: 30, fire: 1 }, pick: {}, desc: '{chips}+8 Chips{/} {block}+30% Block{/} {fire}Fire 1{/}.', tags: ['scale', 'solid'] });
part('fire_gland', { name: 'Fire Gland', rarity: 'rare', color: '#ff7a2a', color2: '#ffe0a0', sprite: 'sac', value: 10, weapon: { fire: 3, xmult: 1.25 }, pick: { smelt: 1 }, desc: '{fire}Fire 3{/} {xmult}×1.25 Mult{/}.', tags: ['organic', 'fire'] });
part('mimic_tongue', { name: 'Mimic Tongue', rarity: 'rare', color: '#ff6a9a', color2: '#9a2a4a', sprite: 'tongue', shape: 'i2', value: 12, weapon: { greed: 2, mult: 1 }, pick: { unlock: 1 }, desc: '{mult}+1 Mult{/}. Greed: +2{@coin} per hit.', pdesc: 'Licks open treasure pockets.', tags: ['organic'] });
part('mimic_teeth', { name: 'Mimic Teeth', rarity: 'rare', color: '#fff6e0', color2: '#c8a060', sprite: 'teeth', value: 11, weapon: { bleed: 2, xmult: 1.2 }, pick: { strikes: 1 }, desc: '{bleed}Bleed 2{/} {xmult}×1.2 Mult{/}.', tags: ['fang', 'solid'] });
part('mushroom_cap', { name: 'Shroom Cap', rarity: 'common', color: '#d04a3a', color2: '#ffffff', sprite: 'mushroom', value: 3, weapon: { chips: 3, fx: 'regen' }, pick: {}, desc: '{chips}+3 Chips{/}. Heal {heal}1 HP{/} every 3 hits.', tags: ['organic', 'spore'] });
part('lava_core', { name: 'Lava Core', rarity: 'uncommon', color: '#ff8a2a', color2: '#3a1a14', sprite: 'core', value: 7, weapon: { chips: 6, fire: 2 }, pick: { hard: 1 }, desc: '{chips}+6 Chips{/} {fire}Fire 2{/}.', pdesc: 'Breaks hard rock in one hit.', tags: ['core', 'solid', 'fire'] });
part('cursed_plate', { name: 'Cursed Plate', rarity: 'uncommon', color: '#4a3a5a', color2: '#c86bff', sprite: 'plate', shape: 'o4', value: 8, weapon: { chips: 6, block: 40, curse: 1 }, pick: {}, desc: '{chips}+6 Chips{/} {block}+40% Block{/} {curse}Curse 1{/}.', tags: ['solid', 'cursed'] });
part('hound_fang', { name: 'Ghoul Fang', rarity: 'uncommon', color: '#e0d8c8', color2: '#7a3ab0', sprite: 'fang', value: 6, weapon: { bleed: 2, speed: 10 }, pick: {}, desc: '{bleed}Bleed 2{/}. +10% Speed.', tags: ['fang', 'bone'] });
part('sentinel_eye', { name: 'Sentinel Eye', rarity: 'rare', color: '#4affe0', color2: '#2a4a4a', sprite: 'eye', value: 11, weapon: { crit: 20, chips: 4 }, pick: { reveal: 1 }, desc: '{chips}+4 Chips{/} {crit}+20% Crit{/}.', tags: ['magic', 'solid'] });
part('toad_tongue', { name: 'Toad Tongue', rarity: 'common', color: '#ff8aa0', color2: '#a03a5a', sprite: 'tongue', shape: 'i2', value: 3, weapon: { slow: 10, lifesteal: 5 }, pick: {}, desc: 'Enemy {good}10% slower{/}. {heal}5% Lifesteal{/}.', tags: ['organic'] });
part('crab_shell', { name: 'Prism Plate', rarity: 'uncommon', color: '#9ab0ff', color2: '#f0b0ff', sprite: 'shell', shape: 'o4', value: 7, weapon: { chips: 5, block: 25, mult: 1 }, pick: {}, desc: '{chips}+5 Chips{/} {mult}+1 Mult{/} {block}+25% Block{/}.', tags: ['shell', 'solid', 'gem'] });
part('kobold_rag', { name: 'Kobold Lantern', rarity: 'common', color: '#ffb84a', color2: '#5a3a2a', sprite: 'lantern', value: 3, weapon: { fire: 1, chips: 2 }, pick: { reveal: 1, seehaz: 1 }, desc: '{chips}+2 Chips{/} {fire}Fire 1{/}.', pdesc: 'Light: reveals glints and hazards.', tags: ['fire'] });
part('mole_claw', { name: 'Troll Claw', rarity: 'uncommon', color: '#3a2a2a', color2: '#e0d0b0', sprite: 'claw', value: 7, weapon: { chips: 7, crit: 10 }, pick: { strikes: 2 }, desc: '{chips}+7 Chips{/} {crit}+10% Crit{/}.', pdesc: 'Digging claws: +2 Strikes.', tags: ['fang', 'solid'] });
part('feather', { name: 'Stone Feather', rarity: 'uncommon', color: '#c8b8a0', color2: '#5a4a3a', sprite: 'feather', shape: 'v2', value: 5, weapon: { speed: 20, crit: 5 }, pick: {}, desc: '+20% Speed {crit}+5% Crit{/}.' });

// boss parts
part('rustjaw_gear', { name: 'Rustjaw Gear', rarity: 'legendary', color: '#c8743a', color2: '#ffe08a', sprite: 'gear', shape: 'o4', value: 40, weapon: { chips: 12, speed: 30, multi: 1 }, pick: { strikes: 2 }, desc: '{chips}+12 Chips{/}. +30% Speed. {good}+1 extra hit{/}.', tags: ['solid', 'metal', 'boss'] });
part('queen_heart', { name: "Geodessa's Heart", rarity: 'legendary', color: '#c08aff', color2: '#7affff', sprite: 'heart', shape: 'o4', value: 40, weapon: { xmult: 2.5, shock: 2 }, pick: { gemDupe: 2 }, desc: '{xmult}×2.5 Mult{/} {shock}Shock 2{/}.', tags: ['solid', 'gem', 'boss'] });
part('mycel_crown', { name: 'Mycel Crown', rarity: 'legendary', color: '#e0a04a', color2: '#5af0c8', sprite: 'crown', shape: 'i2', value: 40, weapon: { poison: 4, fx: 'mycel' }, pick: { seehaz: 1, reveal: 1 }, desc: '{poison}Poison 4{/}. {xmult}×2 Mult{/} against poisoned foes.', tags: ['organic', 'boss'] });
part('warden_eye', { name: "Warden's Eye", rarity: 'legendary', color: '#ffe08a', color2: '#4affe0', sprite: 'eye', shape: 'o4', value: 40, weapon: { critDmg: 2, crit: 20 }, pick: { reveal: 1, unlock: 1 }, desc: '{crit}+2× Crit damage{/} {crit}+20% Crit{/}.', tags: ['solid', 'magic', 'boss'] });
part('wyrm_heart', { name: 'Wyrm Heart', rarity: 'legendary', color: '#ff4a1a', color2: '#ffe08a', sprite: 'heart', shape: 'o4', value: 40, weapon: { fire: 5, xmult: 2 }, pick: { hard: 1, smelt: 1 }, desc: '{fire}Fire 5{/} {xmult}×2 Mult{/}.', tags: ['solid', 'fire', 'boss'] });

// ------------------------------------------------------------------ KEYS
const key = (id, o) => def(id, { kind: 'key', tags: ['key', ...(o.tags || [])], sprite: 'key', ...o });
key('rusty_key', { name: 'Rusty Key', rarity: 'common', color: '#b0703a', color2: '#5a3a2a', value: 4, opens: ['iron'], weapon: { chips: 2, firstCrit: 1 }, pick: { unlock: 1 }, desc: 'Opens iron chests. Forged: {crit}first hit always crits{/}.', pdesc: 'Opens treasure pockets.' });
key('crystal_key', { name: 'Crystal Key', rarity: 'uncommon', color: '#7ad8ff', color2: '#ffffff', value: 8, opens: ['iron', 'crystal'], weapon: { ice: 1, crit: 10 }, pick: { unlock: 1 }, desc: 'Opens crystal & iron chests. Forged: {ice}Ice 1{/} {crit}+10% Crit{/}.', pdesc: 'Opens treasure pockets.' });
key('bone_key', { name: 'Bone Key', rarity: 'uncommon', color: '#efe6d0', color2: '#7a3ab0', value: 8, opens: ['bone', 'iron'], weapon: { chips: 6, fx: 'bones' }, pick: { unlock: 1 }, tags: ['bone'], desc: 'Opens bone chests & cursed doors. Forged: counts as a Bone.', pdesc: 'Opens treasure pockets.' });
key('golden_key', { name: 'Golden Key', rarity: 'rare', color: '#ffd23a', color2: '#c87a1a', value: 16, opens: ['gold', 'iron', 'crystal', 'bone'], weapon: { xmult: 1.5, greed: 1 }, pick: { unlock: 1, lucky: 1 }, desc: 'Opens any chest. Forged: {xmult}×1.5 Mult{/}, Greed 1.', pdesc: 'Opens pockets. Lucky.' });

// ------------------------------------------------------------------ RUNE SCROLLS (forge ingredients)
const rune = (id, o) => def(id, { kind: 'scroll', tags: ['rune'], sprite: 'scroll', shape: 'v2', ...o });
rune('rune_haste', { name: 'Rune of Haste', rarity: 'uncommon', color: '#7affc8', value: 8, weapon: { speed: 30 }, pick: { strikes: 1 }, desc: 'Inscribe: {good}+30% Speed{/}.' });
rune('rune_echo', { name: 'Rune of Echo', rarity: 'rare', color: '#9a8aff', value: 14, weapon: { fx: 'echo' }, pick: { strikes: 1 }, desc: 'Inscribe: {good}repeats the ingredient before it{/}.' });
rune('rune_mastery', { name: 'Rune of Mastery', rarity: 'rare', color: '#ffd25e', value: 14, weapon: { fx: 'mastery' }, pick: { quality: 1 }, desc: 'Inscribe: hammering grade {good}+1 tier{/}.' });
rune('rune_fury', { name: 'Rune of Fury', rarity: 'uncommon', color: '#ff6a5a', value: 9, weapon: { crit: 20, critDmg: 0.5 }, pick: {}, desc: 'Inscribe: {crit}+20% Crit, +0.5× Crit damage{/}.' });
rune('rune_plenty', { name: 'Rune of Plenty', rarity: 'uncommon', color: '#ffb84a', value: 9, weapon: { harvest: 1, greed: 1 }, pick: { lucky: 1 }, desc: 'Inscribe: {good}+1 Harvest{/}, Greed 1.' });

// recipe scroll — consumed when read, learns the named weapon recipe in data.recipe
def('recipe_scroll', { name: 'Recipe Scroll', kind: 'recipe', rarity: 'rare', tags: ['scroll'], sprite: 'recipe', shape: 'v2', color: '#e8d3a3', value: 10, weapon: null, pick: null, desc: 'Click {gold}Read{/} to learn a secret weapon recipe.' });

// ------------------------------------------------------------------ TOOLS (mining consumables)
const tool = (id, o) => def(id, { kind: 'tool', tags: ['tool'], weapon: null, pick: null, ...o });
tool('blast', { name: 'Blast Charge', rarity: 'common', color: '#3a3a3a', color2: '#ff4a2a', sprite: 'bomb', value: 5, use: 'blast', desc: 'Mining: breaks a 3×3 area (ores -1 quality). Free action.' });
tool('drill', { name: 'Hand Drill', rarity: 'uncommon', color: '#b0b8c8', color2: '#ffc83a', sprite: 'drill', shape: 'v2', value: 8, use: 'drill', desc: 'Mining: bores straight down 4 tiles. Free action.' });
tool('scanner', { name: 'Ore Scanner', rarity: 'uncommon', color: '#3a8a6a', color2: '#7affc8', sprite: 'scanner', shape: 'i2', value: 8, use: 'scan', desc: 'Mining: reveals a 3×3 area. Free action.' });
tool('radar', { name: 'Radar Chip', rarity: 'rare', color: '#2a6a4a', color2: '#7aff8a', sprite: 'radar', value: 10, use: 'radar', desc: 'Mining: marks the rarest ore in the wall.' });
tool('flare', { name: 'Flare', rarity: 'common', color: '#ff4a2a', color2: '#ffe08a', sprite: 'flare', value: 3, use: 'flare', desc: 'Mining: lights every clue and hazard.' });

// ------------------------------------------------------------------ v4: STONE ORES (from petrified foes)
def('petrite', {
  name: 'Petrite', kind: 'ore', rarity: 'common', tags: ['solid', 'stone'], color: '#8a8a84', color2: '#c8c6b8', sprite: 'chunk',
  value: 2, acts: [0, 1, 2, 3], depth: 0, shape: 'o4',
  weapon: { chips: 4, block: 10 }, pick: { strikes: 1 },
  desc: '{chips}+4 Chips{/} {block}+10% Block{/}.', pdesc: '+1 swing.',
  flavor: 'Somebody, once. Now: ore.',
});
def('gorgonite', {
  name: 'Gorgonite', kind: 'ore', rarity: 'rare', tags: ['solid', 'stone', 'metal'], color: '#2a3a32', color2: '#7affc8', sprite: 'chunk',
  value: 14, acts: [0, 1, 2, 3], depth: 0.6, shape: 'o4',
  weapon: { chips: 10, xmult: 1.5, stun: 10 }, pick: { strikes: 1, lucky: 1 },
  desc: '{chips}+10 Chips{/} {xmult}×1.5 Mult{/}. 10% Stun.', pdesc: '+1 swing. Lucky.',
  flavor: 'Green-black stone that remembers a gaze.',
});

// ------------------------------------------------------------------ v4: FORAGE (cooking ingredients)
const forage = (id, o) => def(id, { kind: 'forage', tags: ['forage', 'organic', ...(o.tags || [])], weapon: null, pick: null, shape: 'o1', value: 2, acts: [0, 1, 2, 3], ...o });
forage('cave_moss', { name: 'Cave Moss', rarity: 'common', color: '#5a9a3a', color2: '#b8e070', sprite: 'gel', acts: [0, 1], cook: { heal: 6, regen: 1 }, desc: 'Cook: heals, slow regen.', flavor: 'Soft, damp, faintly minty.' });
forage('fern_root', { name: 'Fern Root', rarity: 'common', color: '#8a5a3a', color2: '#c8a070', sprite: 'tail', acts: [0, 2], cook: { heal: 5, maxHp: 2 }, desc: 'Cook: heals, +max HP.', flavor: 'Tastes like a potato that went exploring.' });
forage('ember_pepper', { name: 'Ember Pepper', rarity: 'uncommon', color: '#ff4a1a', color2: '#ffd04a', sprite: 'tongue', acts: [2, 0], cook: { dmg: 12 }, desc: 'Cook: +12% damage.', flavor: 'Glows in the dark. So will you.' });
forage('frost_lily', { name: 'Frost Lily', rarity: 'uncommon', color: '#bfe8ff', color2: '#ffffff', sprite: 'essence', acts: [1, 3], cook: { guard: 30 }, desc: 'Cook: wider guard window.', flavor: 'Cold enough to keep your nerves.' });
forage('honeycomb', { name: 'Honeycomb', rarity: 'common', color: '#ffb03a', color2: '#ffe08a', sprite: 'core', acts: [0, 3], cook: { heal: 14 }, desc: 'Cook: heals a lot.', flavor: 'The cave bees are very proud of it.' });
forage('snake_egg', { name: 'Snake Egg', rarity: 'uncommon', color: '#e8e0c8', color2: '#7ac85a', sprite: 'sac', acts: [0, 1, 2, 3], cook: { maxHp: 4, heal: 4 }, desc: 'Cook: +max HP.', flavor: 'It wiggled once. Cook it quickly.' });
forage('bitterbark', { name: 'Bitterbark', rarity: 'common', color: '#6a4a2a', color2: '#a8845a', sprite: 'plate', acts: [0, 2, 3], cook: { stoneResist: 25 }, desc: 'Cook: blade takes less stone.', flavor: 'Old trees hate Medusa too.' });
forage('stone_salt', { name: 'Stone Salt', rarity: 'common', color: '#f0d8e0', color2: '#ffffff', sprite: 'cluster', acts: [1, 2, 3], cook: { salt: 1, stoneResist: 5 }, desc: 'Cook: seasons — other effects +25%.', flavor: 'Pink, crunchy, very fancy.' });
forage('starfruit', { name: 'Starfruit', rarity: 'rare', color: '#ffe85a', color2: '#ffffff', sprite: 'gem', acts: [1, 3], cook: { loot: 25, heal: 4 }, desc: 'Cook: more loot from stone.', flavor: 'Grows where light leaks in from above.' });

// ------------------------------------------------------------------ v4: SERPENT PARTS
part('snake_scale', { name: 'Snake Scale', rarity: 'common', color: '#5a9a4a', color2: '#c8e08a', sprite: 'scale', value: 3, weapon: { chips: 3, block: 15 }, pick: {}, cook: { stoneResist: 10 }, desc: '{chips}+3 Chips{/} {block}+15% Block{/}.', tags: ['scale', 'solid', 'serpent'] });
part('venom_gland', { name: 'Venom Gland', rarity: 'uncommon', color: '#8ad04a', color2: '#6a2a8a', sprite: 'sac', value: 6, weapon: { poison: 3, mult: 1 }, pick: {}, cook: { dmg: 10 }, desc: '{poison}Poison 3{/} {mult}+1 Mult{/}.', tags: ['organic', 'poison', 'serpent'] });
part('serpent_fang', { name: 'Serpent Fang', rarity: 'uncommon', color: '#fff6e0', color2: '#7ac85a', sprite: 'fang', value: 6, weapon: { chips: 5, poison: 1, crit: 10 }, pick: { strikes: 1 }, desc: '{chips}+5 Chips{/} {poison}Poison 1{/} {crit}+10% Crit{/}.', tags: ['fang', 'solid', 'serpent'] });
part('herald_scale', { name: 'Herald Scale', rarity: 'legendary', color: '#2a8a5a', color2: '#ffe08a', sprite: 'scale', shape: 'i2', value: 40, weapon: { chips: 14, xmult: 2, block: 30 }, pick: { strikes: 2 }, cook: { stoneResist: 30 }, desc: '{chips}+14 Chips{/} {xmult}×2 Mult{/} {block}+30% Block{/}.', tags: ['scale', 'solid', 'serpent', 'boss'] });
part('gorgon_tear', { name: 'Gorgon Tear', rarity: 'legendary', color: '#7affc8', color2: '#ffffff', sprite: 'gem', value: 50, weapon: { xmult: 3, holy: 3 }, pick: { lucky: 1 }, cook: { stoneResist: 60 }, desc: '{xmult}×3 Mult{/} {holy}Holy 3{/}.', tags: ['magic', 'boss', 'serpent'] });

// ------------------------------------------------------------------ v4: cooking effects of older ingredients
const COOK = {
  glowcap: { heal: 4, regen: 1 }, mushroom_cap: { heal: 6 }, slime_gel: { heal: 3, guard: 10 }, toad_tongue: { regen: 1 },
  spore_sac: { regen: 1 }, fire_gland: { dmg: 18 }, wisp_essence: { loot: 20 }, amber: { loot: 10 }, rat_tail: { heal: 2 },
};
for (const [id, c] of Object.entries(COOK)) if (M[id]) M[id].cook = c;

// ------------------------------------------------------------------ v4: backpack room (ores are bulky)
// every ore is a fat 2×2 lump (4 cells); crystals, minerals and long parts take 2; gems and forage 1
const ROOM = {
  obsidian: 'i2', prism: 'v2', voidcrystal: 'v2', ember: 'v2', rime: 'v2', storm: 'v2', venomite: 'v2',
  brimstone: 'i2', amber: 'i2', fossil: 'i2', runestone: 'v2', geode: 'i2',
};
for (const m of Object.values(M)) if (m.kind === 'ore') m.shape = 'o4';
for (const [id, sh] of Object.entries(ROOM)) if (M[id]) M[id].shape = sh;
// parts take 1–2 cells
for (const m of Object.values(M)) if (m.kind === 'part' && m.shape === 'o4') m.shape = 'i2';

// ------------------------------------------------------------------ v4: acts (0 Undercroft, 1 Cistern, 2 Foundry, 3 Garden)
// Older materials list the six layers of the first design; map them onto the four acts.
const OLD2ACT = [0, 1, 0, 3, 2, 3];
for (const m of Object.values(M)) {
  if (m.acts) { m.regions = m.acts; continue; }
  if (!m.regions) { m.acts = [0, 1, 2, 3]; continue; }
  m.acts = [...new Set(m.regions.map((r) => OLD2ACT[r] ?? 3))].sort();
  m.regions = m.acts;
}

// ------------------------------------------------------------------ v5: the build items (data/items.js)
for (const [id, o] of Object.entries(V5_ITEMS)) M[id] = { id, tags: [], value: 3, shape: 'o1', weapon: null, pick: null, ...o, regions: o.acts || [0, 1, 2, 3] };
// v5 bag room: ores are bulky (2×2 or L), rare ores take odd shapes; gems 1, crystals/minerals 2
const ORE_SHAPE = { copper: 'l4', tin: 'l3', coal: 'l3', silver: 't4', gold: 's4', mithril: 'l3', stariron: 't4', magmasteel: 's4', bronze_ancient: 'l4', lodestone: 'l3', junk: 'l3', cursedore: 't4', gorgonite: 't4' };
for (const [id, sh] of Object.entries(ORE_SHAPE)) if (M[id]) M[id].shape = sh;
// v5 stages are the v4 acts (0 shroom/undercroft, 1 cistern, 2 foundry, 3 garden)
for (const m of Object.values(M)) m.stages = m.acts;

export const MATERIALS = M;
export const mat = (id) => M[id];

/** Ingredient that gives a weapon a body. */
export const isSolid = (m) => m && m.tags.includes('solid');
export const isForgeable = (m) => m && !!m.weapon;

/** Default tool crafting recipes (shown in the forge's Tools page). */
export const TOOL_RECIPES = [
  { out: 'blast', needs: [['coal', 1], ['ember', 1]], alt: [['brimstone', 1], ['coal', 1]] },
  { out: 'flare', needs: [['coal', 1], ['junk', 1]] },
  { out: 'drill', needs: [['iron', 2], ['copper', 1]] },
  { out: 'scanner', needs: [['copper', 1], ['storm', 1]] },
  { out: 'radar', needs: [['silver', 1], ['storm', 1], ['copper', 1]] },
];
