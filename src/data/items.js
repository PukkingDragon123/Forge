// v5 items (docs/REDESIGN.md §7): the build lives in the bag. Merged into MATERIALS by materials.js so
// makeItem / sprites / the bag treat them like every other material.
//
// kinds and their payloads
//   weapon  wpn: { type: axe|hammer|sword|spear|dagger|staff, dmg (per hit, Fine quality), speed (×attack
//                 rate, 1 = normal), range (m), crit (%), critDmg (×), element?, status?: {poison|burn|slow|
//                 freeze|bleed: chance 0..1}, special (weapon special id), petrify (0..1 kill → statue), kb (m) }
//           bagPassive: stats while it rides in the bag (spare weapons)
//   amulet  passive: stats · procs: [{ on: 'dash'|'hit'|'kill'|'crit'|'hurt'|'roomClear', effect, chance, power }]
//   charm   passive: stats · adj: { match: { kind?, tag? }, give: stats } — per matching neighbour in the bag
//   skill   skill: id in data/skills.js (a gem you slot into one of the 2 skill slots)
//   tool    tool: { kind: pickaxe|hammer|chisel|bomb|lantern, power, uses (0 = unlimited) }
//   potion  potion: { heal?, rooms?, stats? } — drink from the bag
//   forage / part / ore — crafting ingredients (cook kept for the old camp scene)
//
// stat keys (human units, summed by systems/loadout.js): dmg % · atkSpd % · moveSpd % · crit % ·
//   critDmg (+×) · maxHp · armor · dashCharges · lifesteal % · thorns · regen (HP per room cleared) ·
//   skillCd % (shorter cooldowns) · pickupRadius (m) · lootLuck % · oreLuck % · pickPower · petrify %
//   · status: { poison|burn|slow|freeze|bleed: % chance on hit }
//
// proc effects P implements: spores (poison cloud at the player) · fire_trail · shock (chain from the hit
//   target) · heal (power HP) · burst (ring of stone shards) · shield (block next hit) · slow_field

const W = (o) => ({ kind: 'weapon', tags: ['weapon', 'solid'], shape: 'i3', value: 12, acts: [0, 1, 2, 3], sprite: 'ingot', ...o });
const A = (o) => ({ kind: 'amulet', tags: ['amulet', 'magic'], shape: 'o1', value: 14, acts: [0, 1, 2, 3], ...o });
const C = (o) => ({ kind: 'charm', tags: ['charm'], shape: 'o1', value: 8, acts: [0, 1, 2, 3], ...o });
const S = (o) => ({ kind: 'skill', tags: ['skill', 'gem', 'magic'], shape: 'o1', value: 12, acts: [0, 1, 2, 3], sprite: 'gem', ...o });
const T = (o) => ({ kind: 'tool', tags: ['tool'], value: 6, acts: [0, 1, 2, 3], ...o });
const P = (o) => ({ kind: 'potion', tags: ['potion'], shape: 'o1', value: 6, acts: [0, 1, 2, 3], sprite: 'essence', ...o });
const F = (o) => ({ kind: 'forage', tags: ['forage', 'organic', ...(o.tags || [])], shape: 'o1', value: 2, acts: [0], ...o });
const PT = (o) => ({ kind: 'part', tags: ['part', ...(o.tags || [])], shape: 'o1', value: 3, acts: [0], ...o });

export const V5_ITEMS = {
  // ================================================================ WEAPONS
  stone_axe: W({ name: 'Stone Axe', rarity: 'uncommon', color: '#8a8a84', color2: '#7affc8', look: { bp: 'axe', ids: ['petrite', 'iron'] },
    wpn: { type: 'axe', dmg: 14, speed: 1, range: 1.9, crit: 5, critDmg: 1.6, special: 'spin', petrify: 1, kb: 0.7 }, bagPassive: { dmg: 2 },
    desc: 'Petrifies what it kills.', flavor: 'Medusa looked at it. Now it looks back.', tags: ['weapon', 'solid', 'stone'] }),
  smith_hammer: W({ name: 'Smith Hammer', rarity: 'common', color: '#7a7a84', color2: '#ffb060', look: { bp: 'hammer', ids: ['iron', 'iron'] }, shape: 'l3',
    wpn: { type: 'hammer', dmg: 22, speed: 0.75, range: 1.8, crit: 4, critDmg: 1.8, special: 'slam', petrify: 0.5, kb: 1.4, status: { stun: 0.12 } }, bagPassive: { armor: 1 },
    desc: 'Slow, huge hits. Stuns.' }),
  ember_staff: W({ name: 'Ember Staff', rarity: 'common', color: '#6a4a2a', color2: '#ff8a3a', look: { bp: 'staff', ids: ['ember', 'copper'] }, shape: 'v3',
    wpn: { type: 'staff', dmg: 9, speed: 1.1, range: 7, crit: 5, critDmg: 1.5, element: 'burn', status: { burn: 0.3 }, special: 'bolt', petrify: 0.5, kb: 0.3 }, bagPassive: { status: { burn: 4 } },
    desc: 'Fire bolts at range.' }),
  twin_daggers: W({ name: 'Twin Daggers', rarity: 'common', color: '#c8ccd8', color2: '#ff5a7a', look: { bp: 'dagger', ids: ['silver'] }, shape: 'i2',
    wpn: { type: 'dagger', dmg: 6, speed: 1.7, range: 1.4, crit: 15, critDmg: 2, special: 'flurry', petrify: 0.5, kb: 0.2, status: { bleed: 0.15 } }, bagPassive: { crit: 2 },
    desc: 'Fast. Crits a lot.' }),
  copper_sword: W({ name: 'Copper Sword', rarity: 'common', color: '#c8743a', color2: '#5fbf9a', look: { bp: 'sword', ids: ['copper', 'copper'] },
    wpn: { type: 'sword', dmg: 12, speed: 1.2, range: 2, crit: 8, critDmg: 1.7, special: 'thrust', petrify: 0.35, kb: 0.5, status: { slow: 0.1 } }, bagPassive: { atkSpd: 3 },
    desc: 'Balanced. Dash-thrust special.' }),
  iron_axe: W({ name: 'Iron Axe', rarity: 'uncommon', color: '#a8b4c8', color2: '#5a3a24', look: { bp: 'axe', ids: ['iron', 'iron', 'coal'] },
    wpn: { type: 'axe', dmg: 18, speed: 1, range: 1.9, crit: 6, critDmg: 1.7, special: 'spin', petrify: 0.35, kb: 0.8, status: { bleed: 0.2 } }, bagPassive: { dmg: 3 },
    desc: 'Heavy chops. Bleeds.' }),
  spore_spear: W({ name: 'Spore Spear', rarity: 'uncommon', color: '#8a6a3a', color2: '#c0ff4a', look: { bp: 'spear', ids: ['iron', 'venom_sac'] }, shape: 'i3',
    wpn: { type: 'spear', dmg: 13, speed: 1.05, range: 2.8, crit: 6, critDmg: 1.6, special: 'throw', petrify: 0.35, kb: 0.6, status: { poison: 0.4 } }, bagPassive: { status: { poison: 4 } },
    desc: 'Long reach. Poisons.' }),
  puffcap_maul: W({ name: 'Puffcap Maul', rarity: 'rare', color: '#d04a3a', color2: '#f0e8d0', look: { bp: 'hammer', ids: ['petrite', 'mushroom_cap', 'iron'] }, shape: 'l3',
    wpn: { type: 'hammer', dmg: 28, speed: 0.72, range: 2, crit: 5, critDmg: 1.8, special: 'slam', petrify: 0.6, kb: 1.6, status: { poison: 0.3, stun: 0.15 } }, bagPassive: { maxHp: 5 },
    desc: 'Slams leave spore clouds.' }),
  gem_dagger: W({ name: 'Gem Dagger', rarity: 'uncommon', color: '#9a6ad8', color2: '#e0c8ff', look: { bp: 'dagger', ids: ['iron', 'amethyst'] }, shape: 'i2',
    wpn: { type: 'dagger', dmg: 8, speed: 1.8, range: 1.4, crit: 20, critDmg: 2.2, special: 'flurry', petrify: 0.35, kb: 0.2 }, bagPassive: { crit: 3 },
    desc: 'Crit machine.' }),
  mycel_staff: W({ name: 'Mycel Staff', rarity: 'uncommon', color: '#8a6a3a', color2: '#5af0c8', look: { bp: 'staff', ids: ['glowcap', 'venom_sac'] }, shape: 'v3',
    wpn: { type: 'staff', dmg: 10, speed: 1.1, range: 7, crit: 5, critDmg: 1.5, element: 'poison', status: { poison: 0.5 }, special: 'bolt', petrify: 0.35, kb: 0.3 }, bagPassive: { regen: 1 },
    desc: 'Spore bolts. Poisons.' }),
  gorgon_blade: W({ name: 'Gorgon Blade', rarity: 'epic', color: '#2a3a32', color2: '#7affc8', look: { bp: 'sword', ids: ['gorgonite', 'iron', 'emerald'] },
    wpn: { type: 'sword', dmg: 20, speed: 1.2, range: 2.1, crit: 12, critDmg: 2, special: 'thrust', petrify: 0.9, kb: 0.6, status: { slow: 0.25 } }, bagPassive: { petrify: 10 },
    desc: 'Almost everything turns to stone.', tags: ['weapon', 'solid', 'stone'] }),

  // ================================================================ AMULETS
  mycelium_heart: A({ name: 'Mycelium Heart', rarity: 'uncommon', color: '#e0c8a0', color2: '#5af0c8', sprite: 'heart', passive: { maxHp: 20, regen: 3 }, desc: '+20 max HP. Heal between rooms.' }),
  spore_lantern: A({ name: 'Spore Lantern', rarity: 'uncommon', color: '#c0ff4a', color2: '#8a6a3a', sprite: 'lantern', procs: [{ on: 'dash', effect: 'spores', chance: 1, power: 4 }], desc: 'Dashing leaves poison spores.' }),
  ore_magnet: A({ name: 'Ore Magnet', rarity: 'common', color: '#4a4c66', color2: '#ff5a5a', sprite: 'core', passive: { pickupRadius: 2, oreLuck: 25 }, desc: 'Pulls loot. More ore.' }),
  glass_fang: A({ name: 'Glass Fang', rarity: 'uncommon', color: '#e8eef8', color2: '#9ae8ff', sprite: 'fang', passive: { crit: 12, critDmg: 0.5 }, desc: '+12% crit, harder crits.' }),
  stone_skin: A({ name: 'Stone Skin', rarity: 'common', color: '#8a8a84', color2: '#c8c6b8', sprite: 'plate', passive: { armor: 3, moveSpd: -5 }, desc: '+3 armor. A bit slower.' }),
  kings_spore: A({ name: "King's Spore", rarity: 'legendary', color: '#e0a04a', color2: '#5af0c8', sprite: 'crown', passive: { dmg: 15 }, procs: [{ on: 'kill', effect: 'spores', chance: 1, power: 6 }], desc: 'Kills burst into spores.' }),
  ember_heart: A({ name: 'Ember Heart', rarity: 'uncommon', color: '#ff6a2a', color2: '#ffe08a', sprite: 'heart', passive: { status: { burn: 20 } }, desc: 'Hits may set foes ablaze.' }),
  rime_locket: A({ name: 'Rime Locket', rarity: 'rare', color: '#bfe8ff', color2: '#ffffff', sprite: 'eye', passive: { status: { freeze: 12 } }, desc: 'Hits may freeze foes.' }),
  storm_coil: A({ name: 'Storm Coil', rarity: 'rare', color: '#ffe85a', color2: '#7ad8ff', sprite: 'gear', procs: [{ on: 'crit', effect: 'shock', chance: 1, power: 12 }], desc: 'Crits chain lightning.' }),
  gorgon_eye: A({ name: 'Gorgon Eye', rarity: 'epic', color: '#2a3a32', color2: '#7affc8', sprite: 'eye', passive: { petrify: 35, oreLuck: 10 }, desc: 'More foes turn to stone.' }),
  leech_fang: A({ name: 'Leech Fang', rarity: 'uncommon', color: '#ff4a6a', color2: '#ffffff', sprite: 'fang', passive: { lifesteal: 6 }, desc: 'Heal 6% of damage dealt.' }),
  moth_wing: A({ name: 'Moth Wing', rarity: 'rare', color: '#e0d0ff', color2: '#9a8ac0', sprite: 'wing', shape: 'i2', passive: { dashCharges: 1, moveSpd: 8 }, desc: '+1 dash. Faster.' }),

  // ================================================================ CHARMS (adjacency)
  twin_edge: C({ name: 'Twin Edge', rarity: 'uncommon', color: '#c8ccd8', color2: '#ff5a5a', sprite: 'fang', adj: { match: { kind: 'weapon' }, give: { dmg: 6 } }, desc: '+6% damage per weapon beside it.' }),
  whetstone: C({ name: 'Whetstone', rarity: 'common', color: '#8a8a84', color2: '#c8c6b8', sprite: 'plate', passive: { dmg: 4 }, adj: { match: { kind: 'weapon' }, give: { crit: 4 } }, desc: '+4% damage. Weapons beside it: +4% crit.' }),
  four_leaf: C({ name: 'Four-Leaf Charm', rarity: 'uncommon', color: '#5aa03a', color2: '#ffe08a', sprite: 'feather', passive: { lootLuck: 15 }, desc: 'Better loot.' }),
  miners_charm: C({ name: "Miner's Charm", rarity: 'common', color: '#b0703a', color2: '#ffd25e', sprite: 'gear', passive: { pickPower: 1 }, adj: { match: { kind: 'tool' }, give: { oreLuck: 10 } }, desc: '+1 pick power. Tools beside it: more ore.' }),
  spore_pouch: C({ name: 'Spore Pouch', rarity: 'common', color: '#c08a4a', color2: '#f0e08a', sprite: 'sac', adj: { match: { tag: 'spore' }, give: { status: { poison: 6 } } }, desc: 'Spore items beside it: poison hits.' }),
  gem_lens: C({ name: 'Gem Lens', rarity: 'uncommon', color: '#9ae8ff', color2: '#ffffff', sprite: 'eye', adj: { match: { kind: 'gem' }, give: { crit: 3 } }, desc: '+3% crit per gem beside it.' }),
  bone_charm: C({ name: 'Bone Charm', rarity: 'common', color: '#efe6d0', color2: '#7a3ab0', sprite: 'bone', passive: { thorns: 4 }, adj: { match: { tag: 'bone' }, give: { armor: 1 } }, desc: 'Thorns 4. Bones beside it: +1 armor.' }),
  honey_charm: C({ name: 'Honey Charm', rarity: 'common', color: '#ffb03a', color2: '#ffe08a', sprite: 'core', passive: { regen: 2 }, adj: { match: { kind: 'forage' }, give: { maxHp: 3 } }, desc: 'Heal between rooms. Forage beside it: +max HP.' }),

  // ================================================================ SKILL GEMS (ids match data/skills.js)
  skill_spore_burst: S({ name: 'Spore Burst', rarity: 'common', color: '#8ad04a', color2: '#f0e08a', skill: 'spore_burst', desc: 'Skill: poison cloud around you.', tags: ['skill', 'gem', 'magic', 'spore'] }),
  skill_stone_spikes: S({ name: 'Stone Spikes', rarity: 'uncommon', color: '#8a8a84', color2: '#7affc8', skill: 'stone_spikes', desc: 'Skill: a line of stone spikes.' }),
  skill_ember_dash: S({ name: 'Ember Dash', rarity: 'uncommon', color: '#ff6a2a', color2: '#ffe08a', skill: 'ember_dash', desc: 'Skill: dashes leave fire.' }),
  skill_shield_bash: S({ name: 'Shield Bash', rarity: 'common', color: '#7a8090', color2: '#ffd25e', skill: 'shield_bash', desc: 'Skill: stun everything ahead.' }),
  skill_whirlwind: S({ name: 'Whirlwind', rarity: 'uncommon', color: '#c8ccd8', color2: '#9ae8ff', skill: 'whirlwind', desc: 'Skill: spin, hitting all around.' }),
  skill_frost_nova: S({ name: 'Frost Nova', rarity: 'rare', color: '#bfe8ff', color2: '#ffffff', skill: 'frost_nova', desc: 'Skill: freeze a ring of foes.' }),
  skill_chain_spark: S({ name: 'Chain Spark', rarity: 'rare', color: '#ffe85a', color2: '#7ad8ff', skill: 'chain_spark', desc: 'Skill: lightning leaps foe to foe.' }),
  skill_root_snare: S({ name: 'Root Snare', rarity: 'uncommon', color: '#6a4a2a', color2: '#9ad86a', skill: 'root_snare', desc: 'Skill: roots hold foes in place.' }),
  skill_gem_shards: S({ name: 'Gem Shards', rarity: 'uncommon', color: '#c08aff', color2: '#ffffff', skill: 'gem_shards', desc: 'Skill: fan of piercing shards.' }),
  skill_mushroom_turret: S({ name: 'Mushroom Turret', rarity: 'rare', color: '#d04a3a', color2: '#5af0c8', skill: 'mushroom_turret', desc: 'Skill: plant a spore turret.', tags: ['skill', 'gem', 'magic', 'spore'] }),

  // ================================================================ TOOLS (zoom-in mining)
  pickaxe: T({ name: 'Pickaxe', rarity: 'common', color: '#8a6a4a', color2: '#a8b4c8', sprite: 'drill', shape: 'i2', tool: { kind: 'pickaxe', power: 1, uses: 0 }, desc: 'Mining: breaks one rock.' }),
  iron_pickaxe: T({ name: 'Iron Pickaxe', rarity: 'uncommon', color: '#a8b4c8', color2: '#5a3a24', sprite: 'drill', shape: 'i2', tool: { kind: 'pickaxe', power: 2, uses: 0 }, desc: 'Mining: breaks hard rock too.' }),
  hammer: T({ name: 'Rock Hammer', rarity: 'common', color: '#7a7a84', color2: '#5a3a24', sprite: 'gear', shape: 'i2', tool: { kind: 'hammer', power: 1, uses: 6 }, desc: 'Mining: smashes a row of 3. Cracks gems.' }),
  chisel: T({ name: 'Chisel', rarity: 'uncommon', color: '#c8ccd8', color2: '#8a6a4a', sprite: 'drill', shape: 'o1', tool: { kind: 'chisel', power: 1, uses: 8 }, desc: 'Mining: careful cut, +1 quality.' }),
  bomb: T({ name: 'Bomb', rarity: 'common', color: '#3a3a3a', color2: '#ff4a2a', sprite: 'bomb', shape: 'o1', tool: { kind: 'bomb', power: 2, uses: 1 }, desc: 'Mining: blasts 3×3. Free.' }),
  lantern: T({ name: 'Lantern', rarity: 'common', color: '#ffb84a', color2: '#5a3a2a', sprite: 'lantern', shape: 'o1', tool: { kind: 'lantern', power: 1, uses: 3 }, desc: 'Mining: reveals a 3×3 patch. Free.' }),

  // ================================================================ POTIONS
  healing_potion: P({ name: 'Healing Potion', rarity: 'common', color: '#ff4a6a', color2: '#ffffff', potion: { heal: 35 }, desc: 'Heal 35.' }),
  golden_broth: P({ name: 'Golden Broth', rarity: 'rare', color: '#ffd25e', color2: '#fff0c0', potion: { heal: 70, rooms: 3, stats: { maxHp: 10 } }, desc: 'Heal 70. +10 max HP for 3 rooms.' }),
  spore_tonic: P({ name: 'Spore Tonic', rarity: 'common', color: '#8ad04a', color2: '#f0e08a', potion: { rooms: 3, stats: { status: { poison: 25 } } }, desc: '3 rooms: hits poison.' }),
  stoneskin_draught: P({ name: 'Stoneskin Draught', rarity: 'common', color: '#8a8a84', color2: '#c8c6b8', potion: { rooms: 3, stats: { armor: 4 } }, desc: '3 rooms: +4 armor.' }),
  haste_brew: P({ name: 'Haste Brew', rarity: 'uncommon', color: '#7affc8', color2: '#ffffff', potion: { rooms: 3, stats: { moveSpd: 15, atkSpd: 12 } }, desc: '3 rooms: faster.' }),

  // ================================================================ STAGE 0 — the Overgrown Mycelium
  puffball: F({ name: 'Puffball', rarity: 'common', color: '#e8dcc0', color2: '#c8b890', sprite: 'mushroom', cook: { heal: 4 }, desc: 'Bursts into spores.', tags: ['spore'] }),
  truffle: F({ name: 'Cave Truffle', rarity: 'rare', color: '#4a3424', color2: '#8a6a4a', sprite: 'core', cook: { heal: 10, loot: 15 }, desc: 'Rare and delicious.' }),
  cap_leather: PT({ name: 'Cap Leather', rarity: 'common', color: '#c8463e', color2: '#f0d8c0', sprite: 'plate', shape: 'i2', desc: 'Tough mushroom hide.', tags: ['organic'] }),
  mycelium_thread: PT({ name: 'Mycelium Thread', rarity: 'common', color: '#f0e8d0', color2: '#5af0c8', sprite: 'silk', desc: 'Strong, glowing fibre.', tags: ['organic', 'spore'] }),
  glow_jelly: PT({ name: 'Glow Jelly', rarity: 'uncommon', color: '#9af0e0', color2: '#ffffff', sprite: 'gel', desc: 'Wobbly, faintly glowing.', tags: ['organic', 'magic'] }),
  root_fiber: PT({ name: 'Root Fiber', rarity: 'common', color: '#6a4a2a', color2: '#9ad86a', sprite: 'tail', shape: 'i2', desc: 'Twisty and strong.', tags: ['organic'] }),
  puffcap_crown: PT({ name: 'Puffcap Crown', rarity: 'legendary', color: '#e0a04a', color2: '#d04a3a', sprite: 'crown', shape: 'i2', value: 40, desc: "Grand Puffcap's crown.", tags: ['organic', 'boss', 'spore'] }),

  // ================================================================ recipe page (v5 crafting)
  recipe_page: { kind: 'recipe', tags: ['scroll'], rarity: 'rare', name: 'Recipe Page', color: '#e8d3a3', color2: '#8a5a33', sprite: 'recipe', shape: 'o1', value: 10, acts: [0, 1, 2, 3], desc: 'Read to learn a recipe.' },
};
