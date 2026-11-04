// The four acts of the descent after Medusa's escape (docs/REDESIGN.md §2). Palettes drive voxel
// environments, UI accents, fog and light. `REGIONS` is kept as the export name for older callers;
// `ACTS` is the same array.
export const ACTS = [
  {
    id: 'undercroft', name: 'The Mossy Undercroft', sub: 'Old vaults, green with roots', boss: 'thornscale', elite: ['coil_brood', 'mole_brute', 'rustjaw'],
    rows: 10, music: 'delve0', tone: 'green', ribbon: 'green', friendOrder: 0,
    pal: {
      rock: ['#1e2218', '#2a3022', '#36402c', '#465238', '#5a6646'], dirt: ['#2a2418', '#382e1e', '#4a3c28'],
      brick: ['#3a3430', '#4e4640', '#645a50', '#7a6e62'],
      accent: ['#ffb060', '#7ac85a', '#c8743a'], metal: ['#4a4a52', '#7a7a84', '#a8a8b0'],
      glow: '#ffb060', glow2: '#9aff8a', fog: '#0c120a', sky: '#060a05', moss: '#4a7a2a', water: '#3a8a8a', leaf: '#5aa03a', flower: '#ff8ab0',
    },
    light: { key: 0xffb060, keyI: 5.5, fill: 0x6aa05a, fillI: 0.4, ambient: 0x1a2014 },
    props: ['vaults', 'roots', 'moss', 'ferns', 'torches', 'waterfalls', 'gates'],
    critters: ['firefly', 'moth', 'dust'],
    // legacy fields for old scenes until they are removed
    tunnels: ['tunnel'], hazard: 'Thorns',
  },
  {
    id: 'cistern', name: 'The Crystal Cistern', sub: 'Halls the water took back', boss: 'glasscoil', elite: ['crystal_golem', 'rune_guardian', 'geodessa'],
    rows: 10, music: 'delve1', tone: 'blue', ribbon: 'blue', friendOrder: 1,
    pal: {
      rock: ['#141a2a', '#1c2438', '#262f48', '#323c5a', '#424e70'], dirt: ['#1a2234', '#222c42', '#2c3852'],
      brick: ['#2a3040', '#3a4256', '#4c566e', '#606a86'],
      accent: ['#6ad8ff', '#ff8af0', '#b08aff'], metal: ['#5a6a8a', '#8a9ac0', '#c0d0f0'],
      glow: '#6ad8ff', glow2: '#ff8af0', fog: '#080c18', sky: '#04060e', moss: '#3a6a7a', water: '#3a9ad0', leaf: '#4ab0a0', flower: '#ffd0ff',
    },
    light: { key: 0x6ad8ff, keyI: 5, fill: 0xb08aff, fillI: 0.45, ambient: 0x121a2c },
    props: ['arches', 'water', 'crystals', 'lilies', 'glowfish', 'pillars'],
    critters: ['wisp', 'firefly', 'bubble'],
    tunnels: ['tunnel'], hazard: 'Shard falls',
  },
  {
    id: 'foundry', name: 'The Ember Foundry', sub: 'Where the old dwarves forged', boss: 'cinderfang', elite: ['lava_wyrmling', 'pyrrhax', 'grave_colossus'],
    rows: 10, music: 'delve2', tone: 'red', ribbon: 'red', friendOrder: 2,
    pal: {
      rock: ['#160e0c', '#241816', '#32221e', '#422e28', '#543c34'], dirt: ['#2a1a14', '#3a241c', '#4a2e24'],
      brick: ['#3a2a24', '#4e3a30', '#644a3c', '#7a5c4a'],
      accent: ['#ff6a1a', '#ffd04a', '#5a3a8a'], metal: ['#4a3a3a', '#7a6a6a', '#a89a9a'],
      glow: '#ff6a1a', glow2: '#ffd04a', fog: '#160604', sky: '#080202', moss: '#6a3a1a', water: '#ff5a1a', leaf: '#ff8a3a', flower: '#ffd04a',
    },
    light: { key: 0xff6a1a, keyI: 6.5, fill: 0x5a3a8a, fillI: 0.3, ambient: 0x2a1008 },
    props: ['anvils', 'chains', 'lava', 'ashtrees', 'forges', 'statues'],
    critters: ['ember', 'ash'],
    tunnels: ['tunnel'], hazard: 'Lava bursts',
  },
  {
    id: 'garden', name: "Medusa's Garden", sub: 'A temple of stone faces', boss: 'medusa', elite: ['basilisk', 'warden', 'grave_colossus'],
    rows: 6, music: 'delve3', tone: 'jade', ribbon: 'purple', friendOrder: -1,
    pal: {
      rock: ['#1a1e1c', '#262c28', '#343c36', '#465048', '#5a665c'], dirt: ['#222a24', '#2c362e', '#38443a'],
      brick: ['#8a8a80', '#a8a89c', '#c8c6b8', '#e4e2d4'],
      accent: ['#7affc8', '#c86bff', '#e0d8c8'], metal: ['#6a7a6a', '#9aaa9a', '#d0dcd0'],
      glow: '#7affc8', glow2: '#c86bff', fog: '#0a120e', sky: '#040806', moss: '#4a7a4a', water: '#3a8a6a', leaf: '#6ab06a', flower: '#ffe0f0',
    },
    light: { key: 0x7affc8, keyI: 4.5, fill: 0xc86bff, fillI: 0.35, ambient: 0x14201a },
    props: ['marble', 'statues', 'snakes', 'vines', 'pools', 'braziers'],
    critters: ['firefly', 'petal'],
    tunnels: ['tunnel'], hazard: 'Gaze',
  },
];
export const REGIONS = ACTS;
export const actOf = (i) => ACTS[Math.max(0, Math.min(ACTS.length - 1, i | 0))];

/** Map node types: icon (ui/icons name), ink colour on the old map, a ≤ 6-word line. */
export const NODE_TYPES = {
  start: { name: 'Landing', icon: 'start', color: '#e0d0b0', short: 'Where you fell in.' },
  monster: { name: 'Monster', icon: 'monster', color: '#c0442e', short: 'Fight. Petrify. Mine it.' },
  elite: { name: 'Elite', icon: 'elite', color: '#8a2a8a', short: 'Tough foe, rich stone.' },
  boss: { name: 'Herald', icon: 'boss', color: '#a8261e', short: 'A snake holds your friend.' },
  vein: { name: 'Ore Vein', icon: 'mining', color: '#2a6a8a', short: 'Swing the pick in time.' },
  treasure: { name: 'Old Chest', icon: 'treasure', color: '#a87a1a', short: 'Loot. Probably safe.' },
  event: { name: 'Unknown', icon: 'event', color: '#5a3a7a', short: 'Something strange ahead.' },
  camp: { name: 'Camp', icon: 'camp', color: '#b8641e', short: 'Rest, cook or forge.' },
  // legacy (old scenes, removed with them)
  mining: { name: 'Ore Vein', icon: 'mining', color: '#2a6a8a', short: 'Swing the pick in time.' },
  merchant: { name: 'Merchant', icon: 'merchant', color: '#ffb84a', short: '' },
};

// Legacy: tunnel kinds of the side-scrolling travel scene (removed in v4). Kept so old files build.
export const TUNNELS = {
  tunnel: { name: 'Tunnel', icon: 'arrowR', risk: 0, desc: '' },
};

// ---------------------------------------------------------------- v5: stages (Isaac floors)
// docs/REDESIGN.md §2. Stage 0 is the showcase. roster: preferred normal foes (ids that exist in
// data/monsters.js are used; otherwise actPool(stage)). elites / boss likewise. veins: ore table for
// vein rooms and walls [id, weight]. forage: ingredients found lying around. Who actually lives on a
// stage is data/monsters.js (`region`); roster/elites only order the preferred ones first.
export const STAGES = [
  {
    id: 'shroom', name: 'The Overgrown Mycelium', sub: 'A dungeon swallowed by mushrooms', music: 'delve0', tone: 'green',
    boss: 'grand_puffcap', bossFallback: 'myconid_brute', frees: 'bran',
    roster: ['shroomling', 'sporegoblin', 'bloatcap', 'glowwisp', 'moss_snail', 'rootling', 'cap_archer', 'vine_viper'],
    elites: ['myconid_brute', 'coil_brood'],
    veins: [['copper', 30], ['tin', 22], ['iron', 22], ['coal', 18], ['petrite', 12], ['quartz', 16], ['amethyst', 7], ['emerald', 5], ['silver', 4]],
    forage: [['glowcap', 30], ['puffball', 24], ['cave_moss', 20], ['fern_root', 16], ['honeycomb', 8], ['truffle', 2]],
    pal: { fog: '#0c140e', glow: '#5af0c8', glow2: '#ff8ab0' },
  },
  {
    id: 'cistern', name: 'The Crystal Cistern', sub: 'Halls the water took back', music: 'delve1', tone: 'blue',
    boss: 'glasscoil', bossFallback: 'crystal_golem', frees: 'elio',
    roster: ['glass_adder', 'cistern_naga', 'shard_bat', 'crystal_crab', 'gem_slime', 'prism_wisp', 'rock_beetle'],
    elites: ['crystal_golem', 'geodessa'],
    veins: [['silver', 22], ['iron', 18], ['quartz', 20], ['sapphire', 10], ['amethyst', 12], ['rime', 12], ['storm', 10], ['moonstone', 5], ['diamond', 2]],
    forage: [['frost_lily', 24], ['cave_moss', 20], ['snake_egg', 16], ['starfruit', 6], ['stone_salt', 14]],
    pal: { fog: '#080c18', glow: '#6ad8ff', glow2: '#ff8af0' },
  },
  {
    id: 'foundry', name: 'The Ember Foundry', sub: 'Forge-halls of a lost clan', music: 'delve2', tone: 'red',
    boss: 'cinderfang', bossFallback: 'lava_wyrmling', frees: 'clover',
    roster: ['ember_asp', 'magma_slime', 'salamander', 'cinder_bat', 'cinder_golem', 'bonepicker', 'gilded_guard'],
    elites: ['lava_wyrmling', 'pyrrhax', 'rune_guardian'],
    veins: [['iron', 20], ['coal', 20], ['gold', 10], ['magmasteel', 8], ['ember', 14], ['ruby', 10], ['obsidian', 10], ['brimstone', 10]],
    forage: [['ember_pepper', 24], ['fern_root', 16], ['bitterbark', 16], ['honeycomb', 8]],
    pal: { fog: '#140806', glow: '#ff8a3a', glow2: '#ffd25e' },
  },
  {
    id: 'garden', name: "Medusa's Garden", sub: 'Marble, moss and statues', music: 'delve3', tone: 'jade',
    boss: 'medusa', bossFallback: 'basilisk', frees: null,
    roster: ['gorgon_snake', 'cursed_knight', 'wraith', 'bone_hound', 'stone_sentinel', 'ruin_owl'],
    elites: ['basilisk', 'warden', 'grave_colossus'],
    veins: [['gorgonite', 14], ['petrite', 20], ['gold', 12], ['mithril', 6], ['emerald', 14], ['soulstone', 2], ['runestone', 10]],
    forage: [['bitterbark', 20], ['starfruit', 10], ['snake_egg', 16], ['stone_salt', 12]],
    pal: { fog: '#0c1410', glow: '#7affc0', glow2: '#ffe08a' },
  },
];
export const stageOf = (i) => STAGES[Math.max(0, Math.min(STAGES.length - 1, i | 0))];

/** v5 room types (Isaac floors): icon, minimap colour, a ≤ 6-word line. */
export const ROOM_TYPES = {
  start: { name: 'Landing', icon: 'start', color: '#e0d0b0', short: 'Where you fell in.' },
  fight: { name: 'Fight', icon: 'monster', color: '#c0442e', short: 'Clear it to open doors.' },
  vein: { name: 'Ore Vein', icon: 'mining', color: '#2a8aaa', short: 'Rich rock. Mine it.' },
  treasure: { name: 'Treasure', icon: 'treasure', color: '#e0b03a', short: 'An item on a pedestal.' },
  craft: { name: 'Workshop', icon: 'forge', color: '#d07a2a', short: 'Craft in order.' },
  shrine: { name: 'Shrine', icon: 'event', color: '#8a5ad0', short: 'Something strange.' },
  secret: { name: 'Secret', icon: 'question', color: '#5a5a7a', short: 'Hidden. Rewarding.' },
  boss: { name: 'Boss', icon: 'boss', color: '#a8261e', short: 'The stage boss waits.' },
};
