// Monster roster (v4, Medusa's Curse). `region` is the ACT the creature lives in: 0 Mossy Undercroft,
// 1 Crystal Cistern, 2 Ember Foundry, 3 Medusa's Garden (−1 = anywhere (mimic), −2 = retired, never rolled).
// hp/dmg are base values, scaled by act in systems/combat.js. Old bosses now serve as elites; each act's boss is
// one of Medusa's Snake Heralds, and Medusa herself waits at the end of act 3. actPool(act, tier) picks from here.
// attack kinds: normal (block/parry), heavy (block halves less; parry negates), multi (several quick hits),
//   unblockable (only a perfect parry negates), special (scripted effect)
// model: archetype for models/monsters.js + palette
export const MONSTERS = {};
function mon(id, o) {
  MONSTERS[id] = {
    id, tier: 'normal', armor: 0, dodge: 0, weak: [], resist: [], traits: [], coins: [4, 9],
    interval: 3.0, attacks: [{ name: 'Strike', dmg: 1, windup: 0.8, kind: 'normal' }], ...o,
  };
}

// ============================================================ 0 · HOLLOWDEEP MINE
mon('rustrat', {
  name: 'Rust Gremlin', region: 0, hp: 42, dmg: 4, interval: 2.4,
  attacks: [{ name: 'Nail Shiv', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Scrap Frenzy', dmg: 0.5, windup: 0.7, kind: 'multi', hits: 3, weight: 0.4 }],
  drops: [{ id: 'rat_tooth', chance: 1 }, { id: 'rat_tail', chance: 0.7 }, { id: 'junk', chance: 0.3 }],
  model: { arch: 'gremlin', body: '#7c9c5e', belly: '#cace94', accent: '#6c8c52', eye: '#ffd24a', scale: 1.15 },
  desc: 'Picks the rails clean of scrap. Its lantern eyes find your coin purse first.',
});
mon('cave_bat', {
  name: 'Lanternwing', region: 0, hp: 36, dmg: 4, interval: 2.2, dodge: 0.12,
  attacks: [{ name: 'Lantern Swoop', dmg: 1, windup: 0.7, kind: 'normal' }, { name: 'Flare Shriek', dmg: 0.6, windup: 0.9, kind: 'special', effect: 'daze', weight: 0.3 }],
  drops: [{ id: 'bat_fang', chance: 1 }, { id: 'bat_wing', chance: 0.6 }],
  model: { arch: 'lanternwing', body: '#a8463e', belly: '#6a3434', accent: '#d8784a', eye: '#ffe04a', scale: 1.15 },
  desc: 'An imp that moved into a lost miner\'s lantern. Flits. Dodges. 12% chance your swing hits nothing.',
});
mon('ooze', {
  name: 'Tar Ooze', region: 0, hp: 68, dmg: 5, interval: 3.0, resist: ['bleed'], weak: ['fire'],
  attacks: [{ name: 'Tar Slam', dmg: 1, windup: 1.0, kind: 'normal' }, { name: 'Engulf', dmg: 1.4, windup: 1.3, kind: 'heavy', weight: 0.4 }],
  drops: [{ id: 'slime_gel', chance: 1 }, { id: 'slime_gel', chance: 0.5 }, { id: 'copper', chance: 0.3 }],
  model: { arch: 'slime', body: '#342c3e', belly: '#8a78a8', accent: '#1c1624', eye: '#ffc24a', scale: 1.15, inside: 'nails' },
  desc: 'Pit tar that swallowed nails, ore and at least one pickaxe.',
});
mon('kobold', {
  name: 'Kobold Digger', region: 0, hp: 55, dmg: 5, interval: 2.6,
  attacks: [{ name: 'Pick Jab', dmg: 1, windup: 0.7, kind: 'normal' }, { name: 'Grab Coins', dmg: 0.4, windup: 0.8, kind: 'special', effect: 'steal', weight: 0.35 }],
  drops: [{ id: 'kobold_rag', chance: 0.9 }, { id: 'iron', chance: 0.5 }, { id: 'coal', chance: 0.5 }],
  model: { arch: 'kobold', body: '#c86a3a', belly: '#e8b88a', accent: '#6a4a2a', eye: '#ffe04a', scale: 1.15 },
  coins: [8, 14],
  desc: 'Small, sneaky, smells of lamp oil. Steals coins.',
});
mon('rock_beetle', {
  name: 'Pebble Golem', region: 1, hp: 80, dmg: 5, interval: 3.0, armor: 2, weak: ['shock'],
  attacks: [{ name: 'Boulder Bash', dmg: 1, windup: 0.9, kind: 'normal' }, { name: 'Rockslide Roll', dmg: 0.5, windup: 1.0, kind: 'multi', hits: 3, weight: 0.4 }],
  drops: [{ id: 'beetle_shell', chance: 0.9 }, { id: 'mandible', chance: 0.6 }],
  model: { arch: 'pebblegolem', body: '#8e8278', belly: '#6c6058', accent: '#7ae8ff', eye: '#ffb84a', scale: 1.15 },
  desc: 'A rolling knot of ore and gravel. Armor 2: every hit is reduced by 2.',
});
mon('mole_brute', {
  name: 'Drill Troll', region: 0, tier: 'elite', hp: 210, dmg: 7, interval: 3.0, armor: 1,
  attacks: [{ name: 'Fist Swipe', dmg: 1, windup: 0.8, kind: 'normal' }, { name: 'Ground Pound', dmg: 1.8, windup: 1.4, kind: 'heavy', weight: 0.5 }, { name: 'Burrow Drill', dmg: 1.2, windup: 1.6, kind: 'unblockable', weight: 0.3 }],
  drops: [{ id: 'mole_claw', chance: 1 }, { id: 'mole_claw', chance: 0.5 }, { id: 'golem_core', chance: 0.25 }, { id: 'silver', chance: 0.4 }],
  model: { arch: 'drilltroll', body: '#6a8476', belly: '#a8b89c', accent: '#44564e', eye: '#ffb84a', scale: 1 },
  coins: [18, 26],
  desc: 'Traded an arm for a drill. Iron ore grows on its back like moss.',
});
mon('rustjaw', {
  name: 'Old Rustjaw', title: 'The Minecart Colossus', region: 0, tier: 'elite', hp: 300, dmg: 8, interval: 3.2, armor: 2, weak: ['shock'],
  attacks: [
    { name: 'Rail Smash', dmg: 1, windup: 0.9, kind: 'normal' },
    { name: 'Runaway Cart', dmg: 1.6, windup: 1.3, kind: 'heavy', weight: 0.6 },
    { name: 'Gear Grind', dmg: 0.45, windup: 1.0, kind: 'multi', hits: 4, weight: 0.4 },
    { name: 'Derail', dmg: 2.0, windup: 1.8, kind: 'unblockable', weight: 0.25, phase: 2 },
  ],
  phases: [{ at: 0.5, text: 'Rustjaw\'s furnace roars!', speed: 1.25 }],
  drops: [{ id: 'rustjaw_gear', chance: 1 }, { id: 'iron', chance: 1 }, { id: 'golem_core', chance: 0.6 }, { id: 'gold', chance: 0.5 }],
  model: { arch: 'rustjaw', body: '#8a5a3a', belly: '#4a4a52', accent: '#ffb84a', eye: '#ff6a1a', scale: 1 },
  coins: [40, 55],
  intro: 'A pile of wrecked minecarts shudders… and stands up.',
  desc: 'The old mine\'s carts, welded by the curse into one furious machine.',
});

// ============================================================ 1 · PRISM HOLLOWS
mon('shard_bat', {
  name: 'Shard Sprite', region: 1, hp: 40, dmg: 4, interval: 2.0, dodge: 0.15, weak: ['shock'],
  attacks: [{ name: 'Crystal Dive', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Shard Rain', dmg: 0.4, windup: 0.9, kind: 'multi', hits: 3, weight: 0.4 }],
  drops: [{ id: 'bat_fang', chance: 0.8 }, { id: 'quartz', chance: 0.6 }, { id: 'bat_wing', chance: 0.4 }],
  model: { arch: 'sprite', body: '#dce6ff', belly: '#a0b4ff', accent: '#ff9af0', eye: '#7affff', scale: 1.3, crystals: '#8ae8ff' },
  desc: 'A crystal fairy. Its wings chime like glass when it dives.',
});
mon('crystal_crab', {
  name: 'Prism Knight', region: 1, hp: 70, dmg: 5, interval: 2.8, armor: 3, weak: ['shock'],
  attacks: [{ name: 'Prism Slash', dmg: 1, windup: 0.7, kind: 'normal' }, { name: 'Refract', dmg: 1.4, windup: 1.2, kind: 'heavy', weight: 0.4 }],
  drops: [{ id: 'crab_shell', chance: 0.9 }, { id: 'crystal_claw', chance: 0.7 }, { id: 'amethyst', chance: 0.2 }],
  model: { arch: 'prismknight', body: '#8c98dc', belly: '#cad2ff', accent: '#ff9af0', eye: '#e4f6ff', scale: 1.1, crystals: '#9ae8ff' },
  desc: 'Empty crystal armour that still keeps its oath. Armor 3.',
});
mon('gem_slime', {
  name: 'Gem Slime', region: 1, hp: 62, dmg: 4, interval: 2.6, resist: ['poison'], weak: ['fire'],
  attacks: [{ name: 'Bounce', dmg: 1, windup: 0.9, kind: 'normal' }, { name: 'Sparkle Burst', dmg: 0.5, windup: 1.1, kind: 'multi', hits: 3, weight: 0.4 }],
  drops: [{ id: 'slime_gel', chance: 1 }, { id: 'amethyst', chance: 0.35 }, { id: 'topaz', chance: 0.15 }],
  model: { arch: 'slime', body: '#c08aff', belly: '#f0d8ff', accent: '#7a4ab0', eye: '#2a1a3a', scale: 1.05, inside: 'gem' },
  desc: 'Ate a jewelry box. Still hungry.',
});
mon('prism_wisp', {
  name: 'Prism Wisp', region: 1, hp: 48, dmg: 5, interval: 2.4, dodge: 0.1, resist: ['bleed', 'poison'],
  attacks: [{ name: 'Flicker', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Lance of Light', dmg: 1.5, windup: 1.2, kind: 'unblockable', weight: 0.3 }],
  drops: [{ id: 'wisp_essence', chance: 0.8 }, { id: 'moonstone', chance: 0.2 }],
  model: { arch: 'prismwisp', body: '#9af0ff', belly: '#ffffff', accent: '#ff9af0', eye: '#1a2a4a', scale: 1.15 },
  desc: 'A lost light that forgot how to be kind.',
});
mon('crystal_golem', {
  name: 'Crystal Golem', region: 1, tier: 'elite', hp: 240, dmg: 7, interval: 3.2, armor: 4, weak: ['shock'],
  attacks: [{ name: 'Crush', dmg: 1, windup: 0.9, kind: 'normal' }, { name: 'Crystal Spikes', dmg: 1.7, windup: 1.4, kind: 'heavy', weight: 0.5 }, { name: 'Prism Beam', dmg: 1.3, windup: 1.6, kind: 'unblockable', weight: 0.25 }],
  drops: [{ id: 'golem_core', chance: 1 }, { id: 'crystal_claw', chance: 0.6 }, { id: 'sapphire', chance: 0.4 }, { id: 'diamond', chance: 0.08 }],
  model: { arch: 'golem', body: '#5a6a9a', belly: '#3a4a6a', accent: '#9ae8ff', eye: '#7affff', scale: 1.5, crystals: '#9ae8ff' },
  coins: [20, 28],
  desc: 'Armor 4. Lightning finds the cracks.',
});
mon('geodessa', {
  name: 'Queen Geodessa', title: 'Matriarch of the Prism Web', region: 1, tier: 'elite', hp: 330, dmg: 8, interval: 2.9, armor: 2, weak: ['fire'],
  attacks: [
    { name: 'Talon Lunge', dmg: 1, windup: 0.8, kind: 'normal' },
    { name: 'Web Spit', dmg: 0.6, windup: 1.0, kind: 'special', effect: 'web', weight: 0.4 },
    { name: 'Crystal Legs', dmg: 0.4, windup: 1.0, kind: 'multi', hits: 5, weight: 0.4 },
    { name: 'Shatter Storm', dmg: 1.8, windup: 1.8, kind: 'unblockable', weight: 0.3, phase: 2 },
  ],
  phases: [{ at: 0.5, text: 'Geodessa\'s crystal armor shatters into a frenzy!', speed: 1.3, armor: 0 }],
  drops: [{ id: 'queen_heart', chance: 1 }, { id: 'spider_silk', chance: 1 }, { id: 'amethyst', chance: 0.8 }, { id: 'prism', chance: 0.2 }],
  model: { arch: 'geodessa', body: '#5a4a8a', belly: '#4a4060', accent: '#c08aff', eye: '#ff5af0', scale: 1, crystals: '#c08aff' },
  coins: [45, 60],
  intro: 'The crystals above you blink. They are eyes.',
  desc: 'Half queen, half spider, all crystal. Web threads cut like glass. Fire melts her silk.',
});

// ============================================================ 2 · SPOREWOOD
mon('shroomling', {
  name: 'Shroomling', region: 0, hp: 58, dmg: 4, interval: 2.4, weak: ['fire'], resist: ['poison'],
  attacks: [{ name: 'Headbutt', dmg: 1, windup: 0.7, kind: 'normal' }, { name: 'Spore Puff', dmg: 0.6, windup: 1.0, kind: 'special', effect: 'poison', weight: 0.4 }],
  drops: [{ id: 'mushroom_cap', chance: 1 }, { id: 'spore_sac', chance: 0.6 }, { id: 'glowcap', chance: 0.4 }],
  model: { arch: 'mushroom', body: '#e0d0b0', belly: '#f0e8d0', accent: '#d04a3a', eye: '#1a1a1a', scale: 1.1, cap: '#d04a3a' },
  desc: 'Angry little hat with legs.',
});
mon('moss_snail', {
  name: 'Moss Golem', region: 0, hp: 78, dmg: 5, interval: 3.4, armor: 2, weak: ['ice'],
  attacks: [{ name: 'Moss Slap', dmg: 1, windup: 1.0, kind: 'normal' }, { name: 'Boulder Slam', dmg: 1.6, windup: 1.5, kind: 'heavy', weight: 0.4 }],
  drops: [{ id: 'snail_shell', chance: 1 }, { id: 'slime_gel', chance: 0.6 }, { id: 'fossil', chance: 0.2 }],
  model: { arch: 'mossgolem', body: '#7e8074', belly: '#b8e070', accent: '#5a9a3e', eye: '#9affd0', scale: 1.15 },
  desc: 'A walking hillside with a sapling on its back. Slow. Very slow. Armor 4.',
});
mon('lantern_moth', {
  name: 'Glowcap Wisp', region: 0, hp: 50, dmg: 5, interval: 2.2, dodge: 0.15, weak: ['fire'],
  attacks: [{ name: 'Spore Puff', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Spore Glare', dmg: 0.5, windup: 0.9, kind: 'special', effect: 'daze', weight: 0.35 }],
  drops: [{ id: 'moth_dust', chance: 1 }, { id: 'feather', chance: 0.25 }],
  model: { arch: 'glowwisp', body: '#bff8ec', belly: '#ffffff', accent: '#5af0c8', cap: '#4a58c8', eye: '#141a2e', scale: 1.2 },
  desc: 'A lost spirit wearing a glowing mushroom. Drawn to your lantern. And your face.',
});
mon('bloat_toad', {
  name: 'Bloatcap', region: 1, hp: 85, dmg: 6, interval: 3.0, weak: ['shock'],
  attacks: [{ name: 'Tongue Lash', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Spore Flop', dmg: 1.7, windup: 1.4, kind: 'heavy', weight: 0.45 }],
  drops: [{ id: 'toad_tongue', chance: 1 }, { id: 'venomite', chance: 0.3 }, { id: 'emerald', chance: 0.1 }],
  model: { arch: 'bloatcap', body: '#6c8c5a', belly: '#e6d69c', accent: '#b4c86a', tongue: '#e0607a', eye: '#ffd24a', cap: '#c8462e', spore: '#5af0c8', scale: 1.2 },
  desc: 'Half toad, half toadstool. Mostly mouth.',
});
mon('silk_spider', {
  name: 'Spore Goblin', region: 3, hp: 105, dmg: 8, interval: 2.3, weak: ['fire'],
  attacks: [{ name: 'Staff Bonk', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Spore Snare', dmg: 0.5, windup: 0.9, kind: 'special', effect: 'web', weight: 0.4 }],
  drops: [{ id: 'spider_silk', chance: 1 }, { id: 'venom_sac', chance: 0.6 }],
  model: { arch: 'sporegoblin', body: '#8aa860', belly: '#c8d890', accent: '#c0ff4a', cap: '#8a4ab0', eye: '#ff6a3a', scale: 1.15 },
  desc: 'A goblin shaman with a mushroom for a hat. Its spore snares slow your swings. Fire burns them away.',
});
mon('myconid_brute', {
  name: 'Myconid Brute', region: 0, tier: 'elite', hp: 230, dmg: 8, interval: 3.2, weak: ['fire'], resist: ['poison'],
  attacks: [{ name: 'Fungal Fist', dmg: 1, windup: 0.8, kind: 'normal' }, { name: 'Spore Cloud', dmg: 0.8, windup: 1.2, kind: 'special', effect: 'poison', weight: 0.4 }, { name: 'Trunk Slam', dmg: 1.9, windup: 1.5, kind: 'heavy', weight: 0.4 }],
  drops: [{ id: 'spore_sac', chance: 1 }, { id: 'mushroom_cap', chance: 1 }, { id: 'amber', chance: 0.5 }, { id: 'emerald', chance: 0.3 }],
  model: { arch: 'mushroom', body: '#c8b090', belly: '#e8d8b8', accent: '#5af0c8', eye: '#1a1a1a', scale: 1.5, cap: '#3ab08a' },
  coins: [22, 30],
  desc: 'A walking tree of mushrooms with a grudge.',
});
mon('mycel', {
  name: 'Mother Mycel', title: 'Heart of the Sporewood', region: -2, tier: 'boss', hp: 560, dmg: 9, interval: 3.0, weak: ['fire'], resist: ['poison'],
  attacks: [
    { name: 'Root Lash', dmg: 1, windup: 0.8, kind: 'normal' },
    { name: 'Spore Nova', dmg: 0.7, windup: 1.2, kind: 'special', effect: 'poison', weight: 0.4 },
    { name: 'Root Barrage', dmg: 0.45, windup: 1.0, kind: 'multi', hits: 5, weight: 0.4 },
    { name: 'Fungal Bloom', dmg: 0, windup: 1.6, kind: 'special', effect: 'heal', weight: 0.2, phase: 2 },
  ],
  phases: [{ at: 0.5, text: 'Mother Mycel blooms! She starts healing.', speed: 1.15 }],
  drops: [{ id: 'mycel_crown', chance: 1 }, { id: 'spore_sac', chance: 1 }, { id: 'emerald', chance: 0.7 }, { id: 'amber', chance: 0.5 }],
  model: { arch: 'mycel', body: '#e0c8a0', belly: '#a08a6a', accent: '#5af0c8', eye: '#ffe04a', scale: 1, cap: '#d04a8a' },
  coins: [50, 65],
  intro: 'The whole forest breathes in…',
  desc: 'Every mushroom in the Sporewood is one of her fingers.',
});

// ============================================================ 3 · SUNKEN HALLS
mon('bonepicker', {
  name: 'Bonepicker', region: 2, hp: 75, dmg: 6, interval: 2.4, weak: ['holy'], resist: ['poison', 'bleed'],
  attacks: [{ name: 'Pick Swing', dmg: 1, windup: 0.7, kind: 'normal' }, { name: 'Rattle Rush', dmg: 0.5, windup: 0.9, kind: 'multi', hits: 3, weight: 0.4 }],
  drops: [{ id: 'bone', chance: 1 }, { id: 'skull', chance: 0.4 }, { id: 'gold', chance: 0.2 }],
  model: { arch: 'skeleton', body: '#efe6d0', belly: '#b8a888', accent: '#8a5a3a', eye: '#4affe0', scale: 1.1 },
  desc: 'A miner who never clocked out. Holy hurts.',
});
mon('stone_sentinel', {
  name: 'Stone Sentinel', region: 3, hp: 110, dmg: 6, interval: 3.2, armor: 5, weak: ['shock'],
  attacks: [{ name: 'Glare', dmg: 1, windup: 0.8, kind: 'normal' }, { name: 'Eye Beam', dmg: 1.6, windup: 1.4, kind: 'unblockable', weight: 0.35 }],
  drops: [{ id: 'sentinel_eye', chance: 0.7 }, { id: 'runestone', chance: 0.3 }, { id: 'bronze_ancient', chance: 0.6 }],
  model: { arch: 'sentinel', body: '#8a7a5e', belly: '#6a5a44', accent: '#ffd24a', eye: '#4affe0', scale: 1.0 },
  desc: 'Armor 5. A floating head that never blinks.',
});
mon('ruin_owl', {
  name: 'Gargoyle', region: 3, hp: 70, dmg: 6, interval: 2.2, dodge: 0.15,
  attacks: [{ name: 'Stone Talons', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Silent Dive', dmg: 1.4, windup: 1.0, kind: 'unblockable', weight: 0.3 }],
  drops: [{ id: 'feather', chance: 1 }, { id: 'gold', chance: 0.25 }],
  model: { arch: 'gargoyle', body: '#8e8a84', belly: '#6e6a66', accent: '#ffd24a', eye: '#4affe0', scale: 1.25 },
  desc: 'Guarded a library until the library forgot it. Now it guards nothing, fiercely.',
});
mon('gilded_guard', {
  name: 'Gilded Guard', region: 2, hp: 120, dmg: 7, interval: 2.8, armor: 3, weak: ['shock'],
  attacks: [{ name: 'Halberd', dmg: 1, windup: 0.8, kind: 'normal' }, { name: 'Shield Bash', dmg: 1.5, windup: 1.2, kind: 'heavy', weight: 0.45 }],
  drops: [{ id: 'gold', chance: 0.6 }, { id: 'bronze_ancient', chance: 0.7 }, { id: 'cursed_plate', chance: 0.25 }],
  model: { arch: 'knight', body: '#c8a040', belly: '#4a3a2a', accent: '#ff4a4a', eye: '#4affe0', scale: 1.15 },
  coins: [10, 18],
  desc: 'Empty golden armor, still on duty.',
});
mon('rune_guardian', {
  name: 'Rune Guardian', region: 2, tier: 'elite', hp: 320, dmg: 9, interval: 3.1, armor: 5, weak: ['shock'],
  attacks: [{ name: 'Rune Fist', dmg: 1, windup: 0.8, kind: 'normal' }, { name: 'Glyph Burst', dmg: 0.6, windup: 1.1, kind: 'multi', hits: 3, weight: 0.4 }, { name: 'Seal', dmg: 1.8, windup: 1.6, kind: 'unblockable', weight: 0.3 }],
  drops: [{ id: 'runestone', chance: 1 }, { id: 'golem_core', chance: 0.6 }, { id: 'rune_echo', chance: 0.25 }, { id: 'mithril', chance: 0.15 }],
  model: { arch: 'golem', body: '#8a7a5e', belly: '#5a4a3a', accent: '#4affe0', eye: '#4affe0', scale: 1.5, runes: '#4affe0' },
  coins: [24, 34],
  desc: 'Its runes spell a single word: NO.',
});
mon('warden', {
  name: 'The Gilded Warden', title: 'Keeper of the Sunken Halls', region: 3, tier: 'elite', hp: 430, dmg: 10, interval: 3.0, armor: 6, weak: ['shock'],
  attacks: [
    { name: 'Scepter Strike', dmg: 1, windup: 0.8, kind: 'normal' },
    { name: 'Golden Verdict', dmg: 2.0, windup: 1.6, kind: 'heavy', weight: 0.4 },
    { name: 'Rune Volley', dmg: 0.5, windup: 1.0, kind: 'multi', hits: 4, weight: 0.4 },
    { name: 'Judgement Beam', dmg: 2.2, windup: 2.0, kind: 'unblockable', weight: 0.3, phase: 2 },
  ],
  phases: [{ at: 0.5, text: 'The Warden\'s golden shell cracks — the eye opens!', speed: 1.2, armor: 2 }],
  drops: [{ id: 'warden_eye', chance: 1 }, { id: 'gold', chance: 1 }, { id: 'runestone', chance: 0.8 }, { id: 'mithril', chance: 0.4 }],
  model: { arch: 'warden', body: '#d8a840', belly: '#5a4a3a', accent: '#4affe0', eye: '#4affe0', scale: 1 },
  coins: [55, 70],
  intro: 'A statue as tall as the hall turns its head toward you.',
  desc: 'Armor 6. Lightning cracks gold.',
});

// ============================================================ 4 · EMBERDEEP
mon('magma_slime', {
  name: 'Magma Slime', region: 2, hp: 95, dmg: 7, interval: 2.8, weak: ['ice'], resist: ['fire'],
  attacks: [{ name: 'Splash', dmg: 1, windup: 0.8, kind: 'normal' }, { name: 'Eruption', dmg: 1.6, windup: 1.3, kind: 'heavy', effect: 'burn', weight: 0.4 }],
  drops: [{ id: 'lava_core', chance: 1 }, { id: 'brimstone', chance: 0.6 }, { id: 'magmasteel', chance: 0.2 }],
  model: { arch: 'slime', body: '#ff6a1a', belly: '#ffd04a', accent: '#3a1a14', eye: '#1a0a0a', scale: 1.05, glow: true },
  desc: 'Fire-proof. Ice makes it crumble.',
});
mon('salamander', {
  name: 'Magma Imp', region: 2, hp: 90, dmg: 7, interval: 2.3, weak: ['ice'], resist: ['fire'],
  attacks: [{ name: 'Ember Claw', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Fire Spit', dmg: 0.5, windup: 1.0, kind: 'multi', hits: 3, effect: 'burn', weight: 0.4 }],
  drops: [{ id: 'salamander_scale', chance: 1 }, { id: 'fire_gland', chance: 0.4 }],
  model: { arch: 'magmaimp', body: '#6a3a2e', belly: '#ffb04a', accent: '#ff7a1a', eye: '#ffe04a', scale: 1.15 },
  desc: 'Born in the lava pools. Thinks you look chilly.',
});
mon('cinder_bat', {
  name: 'Flame Skull', region: 2, hp: 70, dmg: 6, interval: 2.0, dodge: 0.15, weak: ['ice'],
  attacks: [{ name: 'Burning Bite', dmg: 1, windup: 0.6, kind: 'normal', effect: 'burn' }, { name: 'Ash Cloud', dmg: 0.4, windup: 0.9, kind: 'special', effect: 'daze', weight: 0.3 }],
  drops: [{ id: 'bat_fang', chance: 1 }, { id: 'ember', chance: 0.6 }],
  model: { arch: 'flameskull', body: '#ecdfc2', belly: '#ff7a2a', accent: '#ffd04a', eye: '#ffe04a', scale: 1.3 },
  desc: 'A miner who swore he would never leave the forge. He kept his word.',
});
mon('cinder_golem', {
  name: 'Cinder Golem', region: 2, hp: 140, dmg: 8, interval: 3.2, armor: 5, weak: ['ice'], resist: ['fire'],
  attacks: [{ name: 'Basalt Fist', dmg: 1, windup: 0.9, kind: 'normal' }, { name: 'Magma Pound', dmg: 1.8, windup: 1.5, kind: 'heavy', effect: 'burn', weight: 0.45 }],
  drops: [{ id: 'golem_core', chance: 0.8 }, { id: 'obsidian', chance: 0.7 }, { id: 'magmasteel', chance: 0.3 }],
  model: { arch: 'golem', body: '#3a2e2c', belly: '#2a2224', accent: '#ff6a1a', eye: '#ffb84a', scale: 1.1, glow: true },
  desc: 'Armor 5. Cracks glow when it\'s angry. It\'s always angry.',
});
mon('lava_wyrmling', {
  name: 'Lava Drake', region: 2, tier: 'elite', hp: 380, dmg: 10, interval: 2.8, armor: 3, weak: ['ice'], resist: ['fire'],
  attacks: [{ name: 'Tail Whip', dmg: 1, windup: 0.7, kind: 'normal' }, { name: 'Fire Breath', dmg: 0.6, windup: 1.2, kind: 'multi', hits: 4, effect: 'burn', weight: 0.4 }, { name: 'Molten Dive', dmg: 2.0, windup: 1.6, kind: 'unblockable', weight: 0.3 }],
  drops: [{ id: 'wyrm_scale', chance: 1 }, { id: 'fire_gland', chance: 0.8 }, { id: 'ruby', chance: 0.4 }],
  model: { arch: 'lavadrake', body: '#c83a1a', belly: '#ffb04a', accent: '#3a1a14', eye: '#ffe04a', scale: 1 },
  coins: [26, 36],
  desc: 'Pyrrhax\'s youngest. Already grumpy.',
});
mon('pyrrhax', {
  name: 'Pyrrhax', title: 'The Molten Wyrm', region: 2, tier: 'elite', hp: 400, dmg: 11, interval: 2.9, armor: 3, weak: ['ice'], resist: ['fire'],
  attacks: [
    { name: 'Molten Bite', dmg: 1, windup: 0.8, kind: 'normal' },
    { name: 'Inferno', dmg: 0.55, windup: 1.2, kind: 'multi', hits: 5, effect: 'burn', weight: 0.4 },
    { name: 'Tail Quake', dmg: 1.9, windup: 1.4, kind: 'heavy', weight: 0.4 },
    { name: 'Magma Rain', dmg: 2.4, windup: 2.0, kind: 'unblockable', weight: 0.3, phase: 2 },
  ],
  phases: [{ at: 0.5, text: 'Pyrrhax dives into the lava and erupts, white-hot!', speed: 1.25 }],
  drops: [{ id: 'wyrm_heart', chance: 1 }, { id: 'wyrm_scale', chance: 1 }, { id: 'fire_gland', chance: 1 }, { id: 'stariron', chance: 0.2 }],
  model: { arch: 'pyrrhax', body: '#b8301a', belly: '#ffb04a', accent: '#2a1410', eye: '#fff04a', scale: 1, glow: true },
  coins: [60, 80],
  intro: 'The lava lake rises. Something underneath is breathing.',
  desc: 'Fire feeds it. Ice makes it flinch.',
});

// ============================================================ 5 · FORBIDDEN TOMB
mon('cursed_knight', {
  name: 'Cursed Knight', region: 3, hp: 150, dmg: 9, interval: 2.7, armor: 4, weak: ['holy'], resist: ['curse'],
  attacks: [{ name: 'Cursed Blade', dmg: 1, windup: 0.8, kind: 'normal' }, { name: 'Crack Weapon', dmg: 0.8, windup: 1.2, kind: 'special', effect: 'crack', weight: 0.35 }, { name: 'Execution', dmg: 2.0, windup: 1.6, kind: 'heavy', weight: 0.3 }],
  drops: [{ id: 'cursed_plate', chance: 1 }, { id: 'cursedore', chance: 0.4 }, { id: 'soulstone', chance: 0.04 }],
  model: { arch: 'knight', body: '#3a3448', belly: '#1a1420', accent: '#c86bff', eye: '#ff5af0', scale: 1.15 },
  desc: 'Served the Lord in life. Still does.',
});
mon('wraith', {
  name: 'Tomb Wraith', region: 3, hp: 110, dmg: 9, interval: 2.4, dodge: 0.2, weak: ['holy', 'fire'], resist: ['bleed', 'poison'],
  attacks: [{ name: 'Chill Touch', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Wail', dmg: 1.5, windup: 1.2, kind: 'unblockable', weight: 0.35 }],
  drops: [{ id: 'ectoplasm', chance: 1 }, { id: 'voidcrystal', chance: 0.1 }],
  model: { arch: 'wraith', body: '#5a4a7a', belly: '#9a8ac0', accent: '#c86bff', eye: '#9affc8', scale: 1.1 },
  desc: 'Mostly hate, partly sheet.',
});
mon('bone_hound', {
  name: 'Grave Ghoul', region: 3, hp: 120, dmg: 8, interval: 2.0, weak: ['holy'], resist: ['poison'],
  attacks: [{ name: 'Grave Rend', dmg: 1, windup: 0.5, kind: 'normal' }, { name: 'Feeding Frenzy', dmg: 0.45, windup: 0.8, kind: 'multi', hits: 4, weight: 0.4 }],
  drops: [{ id: 'hound_fang', chance: 1 }, { id: 'bone', chance: 1 }, { id: 'skull', chance: 0.3 }],
  model: { arch: 'ghoul', body: '#9aa894', belly: '#5a3a7a', accent: '#c86bff', eye: '#c86bff', scale: 1.15 },
  desc: 'Crawled out of the tomb hungry and never stopped.',
});
mon('grave_colossus', {
  name: 'Grave Colossus', region: 3, tier: 'elite', hp: 460, dmg: 12, interval: 3.2, armor: 5, weak: ['holy'],
  attacks: [{ name: 'Coffin Swing', dmg: 1, windup: 0.9, kind: 'normal' }, { name: 'Bone Storm', dmg: 0.5, windup: 1.1, kind: 'multi', hits: 5, weight: 0.4 }, { name: 'Grave Slam', dmg: 2.2, windup: 1.7, kind: 'unblockable', weight: 0.3 }],
  drops: [{ id: 'skull', chance: 1 }, { id: 'bone', chance: 1 }, { id: 'soulstone', chance: 0.15 }, { id: 'voidcrystal', chance: 0.3 }],
  model: { arch: 'golem', body: '#d8d0c0', belly: '#3a3448', accent: '#c86bff', eye: '#ff5af0', scale: 1.6, bones: true },
  coins: [30, 40],
  desc: 'Built from a thousand forgotten graves.',
});
mon('cursed_lord', {
  name: 'The Cursed Lord', title: 'King Beneath the Mine', region: -2, tier: 'boss', hp: 460, dmg: 13, interval: 2.8, armor: 4, weak: ['holy'], resist: ['curse'],
  attacks: [
    { name: 'Hollow Blade', dmg: 1, windup: 0.8, kind: 'normal' },
    { name: 'Curse of Shattering', dmg: 0.6, windup: 1.3, kind: 'special', effect: 'crack', weight: 0.35 },
    { name: 'Chains of the Tomb', dmg: 0.5, windup: 1.0, kind: 'multi', hits: 5, weight: 0.35 },
    { name: 'Crown of Ruin', dmg: 2.4, windup: 1.9, kind: 'unblockable', weight: 0.3, phase: 2 },
    { name: 'Endless Night', dmg: 0.6, windup: 1.4, kind: 'multi', hits: 7, weight: 0.35, phase: 3 },
  ],
  phases: [
    { at: 0.66, text: 'The Lord laughs. Your weapon SHATTERS mid-battle!', speed: 1.15, event: 'shatter' },
    { at: 0.33, text: 'The crown blazes. The tomb itself fights for him!', speed: 1.3 },
  ],
  drops: [],
  model: { arch: 'cursedlord', body: '#2a2238', belly: '#14101c', accent: '#c86bff', eye: '#ff5af0', scale: 1 },
  coins: [0, 0],
  intro: 'The sarcophagus lid slides away. He has been waiting.',
  desc: 'He cursed your weapons to break. Forge faster than he can curse.',
});

// ============================================================ MEDUSA'S BROOD (v4)
// -- act 0 · the Mossy Undercroft
mon('adder', {
  name: 'Horned Adder', region: 0, hp: 40, dmg: 4, interval: 2.0, dodge: 0.08,
  attacks: [{ name: 'Fang Strike', dmg: 1, windup: 0.5, kind: 'normal' }, { name: 'Venom Bite', dmg: 0.7, windup: 0.8, kind: 'special', effect: 'poison', weight: 0.4 }],
  drops: [{ id: 'snake_scale', chance: 1 }, { id: 'venom_gland', chance: 0.5 }, { id: 'petrite', chance: 0.6 }, { id: 'copper', chance: 0.3 }],
  model: { arch: 'adder', body: '#6a7438', belly: '#e0cc8a', accent: '#ffb03a', eye: '#ffd84a', horn: '#3a2614', back: '#4e5a2a', rattle: '#d8b878', ore: '#d2843a', scale: 1.9 },
  desc: 'Quick, horned, rattles before it bites.',
});
mon('vine_viper', {
  name: 'Vine Viper', region: 0, hp: 52, dmg: 5, interval: 2.4,
  attacks: [{ name: 'Thorn Lash', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Strangle', dmg: 0.45, windup: 0.9, kind: 'multi', hits: 3, weight: 0.4 }],
  drops: [{ id: 'snake_scale', chance: 1 }, { id: 'cave_moss', chance: 0.6 }, { id: 'venom_gland', chance: 0.3 }, { id: 'petrite', chance: 0.5 }],
  model: { arch: 'vine_viper', body: '#3a6a3a', belly: '#c8e08a', accent: '#ff8ad0', eye: '#aaff6a', horn: '#2a1e14', leaf: '#5a9a3e', flower: '#ff8ad0', thorn: '#4a3020', back: '#2e5430', ore: '#9ad86a', scale: 1.9 },
  desc: 'Half snake, half bramble. Blooms when it bites.',
});
mon('coil_brood', {
  name: 'Coil Brood', region: 0, tier: 'elite', hp: 230, dmg: 6, interval: 2.4,
  attacks: [{ name: 'Four Fangs', dmg: 0.4, windup: 0.8, kind: 'multi', hits: 4 }, { name: 'Venom Spray', dmg: 0.8, windup: 1.1, kind: 'special', effect: 'poison', weight: 0.4 }, { name: 'Nest Lunge', dmg: 1.7, windup: 1.4, kind: 'heavy', weight: 0.35 }],
  drops: [{ id: 'snake_egg', chance: 1 }, { id: 'snake_scale', chance: 1 }, { id: 'venom_gland', chance: 0.8 }, { id: 'silver', chance: 0.4 }],
  model: { arch: 'coilbrood', body: '#5a6a34', belly: '#e0cc8a', accent: '#ffb03a', eye: '#ffd84a', horn: '#3a2614', ore: '#d2843a', scale: 1.6 },
  desc: 'A nest that bites back. Four times.',
});
mon('thornscale', {
  name: 'Thornscale', title: 'Herald of the Undercroft', region: 0, tier: 'boss', hp: 470, dmg: 8, interval: 3.0, armor: 2, weak: ['fire'], resist: ['poison'],
  attacks: [
    { name: 'Thorn Fang', dmg: 1, windup: 0.8, kind: 'normal' },
    { name: 'Bramble Coil', dmg: 0.45, windup: 1.0, kind: 'multi', hits: 4, weight: 0.4 },
    { name: 'Root Crush', dmg: 1.7, windup: 1.4, kind: 'heavy', weight: 0.45 },
    { name: 'Pollen Venom', dmg: 0.8, windup: 1.2, kind: 'special', effect: 'poison', weight: 0.35, phase: 2 },
  ],
  phases: [{ at: 0.5, text: 'Thornscale blooms with venom!', speed: 1.2 }],
  drops: [{ id: 'herald_scale', chance: 1 }, { id: 'serpent_fang', chance: 1 }, { id: 'gorgonite', chance: 0.7 }, { id: 'emerald', chance: 0.6 }, { id: 'bitterbark', chance: 0.5 }],
  model: { arch: 'thornscale', body: '#4a5a32', belly: '#d0c890', accent: '#c8ff6a', eye: '#ffcc4a', horn: '#2a1e14', leaf: '#4a8a3a', flower: '#ff9ad8', thorn: '#3a2a1a', back: '#3a4a26', ore: '#9ad86a', scale: 2.4 },
  intro: 'The hillside uncoils.',
  desc: 'A living hillside of moss and thorns.',
});
// -- act 1 · the Crystal Cistern
mon('glass_adder', {
  name: 'Glass Adder', region: 1, hp: 50, dmg: 5, interval: 2.1, dodge: 0.12, weak: ['shock'],
  attacks: [{ name: 'Shard Fang', dmg: 1, windup: 0.5, kind: 'normal' }, { name: 'Prism Spit', dmg: 1.4, windup: 1.1, kind: 'unblockable', weight: 0.3 }],
  drops: [{ id: 'snake_scale', chance: 1 }, { id: 'quartz', chance: 0.6 }, { id: 'serpent_fang', chance: 0.3 }, { id: 'petrite', chance: 0.5 }],
  model: { arch: 'glass_adder', body: '#6a74b8', belly: '#dce4ff', accent: '#8ae8ff', eye: '#ff8af0', horn: '#3a3466', back: '#545c9a', ore: '#9ae8ff', scale: 1.9 },
  desc: 'You can see its heart through its scales.',
});
mon('cistern_naga', {
  name: 'Cistern Naga', region: 1, hp: 76, dmg: 6, interval: 2.6, weak: ['shock'],
  attacks: [{ name: 'Trident', dmg: 1, windup: 0.7, kind: 'normal' }, { name: 'Tide Pull', dmg: 1.5, windup: 1.2, kind: 'heavy', weight: 0.4 }],
  drops: [{ id: 'serpent_fang', chance: 1 }, { id: 'snake_scale', chance: 0.7 }, { id: 'frost_lily', chance: 0.35 }, { id: 'sapphire', chance: 0.15 }],
  model: { arch: 'naga', body: '#2e7a7e', belly: '#c8ecd8', accent: '#5af0e0', eye: '#ffe04a', skin: '#3e9a94', fin: '#5ad8c8', back: '#246064', ore: '#6ad8ff', scale: 1.55 },
  desc: 'Guards the drowned halls with a rusted trident.',
});
mon('glasscoil', {
  name: 'Glasscoil', title: 'Herald of the Cistern', region: 1, tier: 'boss', hp: 560, dmg: 9, interval: 2.9, armor: 3, weak: ['shock'],
  attacks: [
    { name: 'Crystal Fang', dmg: 1, windup: 0.8, kind: 'normal' },
    { name: 'Shard Storm', dmg: 0.4, windup: 1.0, kind: 'multi', hits: 5, weight: 0.4 },
    { name: 'Glass Coil', dmg: 1.8, windup: 1.5, kind: 'heavy', weight: 0.4 },
    { name: 'Prism Beam', dmg: 2.0, windup: 1.8, kind: 'unblockable', weight: 0.3, phase: 2 },
  ],
  phases: [{ at: 0.5, text: 'Glasscoil\'s crystals blaze!', speed: 1.25, armor: 1 }],
  drops: [{ id: 'herald_scale', chance: 1 }, { id: 'sapphire', chance: 0.8 }, { id: 'diamond', chance: 0.4 }, { id: 'prism', chance: 0.2 }, { id: 'gorgonite', chance: 0.6 }],
  model: { arch: 'glasscoil', body: '#5a4a9a', belly: '#e0dcff', accent: '#9ae8ff', eye: '#ff7af0', horn: '#2a2450', crystal: '#c08aff', plate: '#3a3270', plateAcc: '#8a7ad8', back: '#463a80', ore: '#c08aff', scale: 2.4 },
  intro: 'The water goes still. Then it rises.',
  desc: 'A serpent of living crystal.',
});
// -- act 2 · the Ember Foundry
mon('ember_asp', {
  name: 'Ember Asp', region: 2, hp: 84, dmg: 7, interval: 2.3, weak: ['ice'], resist: ['fire'],
  attacks: [{ name: 'Molten Bite', dmg: 1, windup: 0.6, kind: 'normal', effect: 'burn' }, { name: 'Hood Flare', dmg: 0.5, windup: 1.0, kind: 'multi', hits: 3, effect: 'burn', weight: 0.4 }],
  drops: [{ id: 'snake_scale', chance: 1 }, { id: 'venom_gland', chance: 0.6 }, { id: 'ember', chance: 0.4 }, { id: 'ember_pepper', chance: 0.3 }],
  model: { arch: 'ember_asp', body: '#3a2a2c', belly: '#ff9a3a', accent: '#ff6a1a', eye: '#ffe04a', horn: '#1a1214', plate: '#241a1c', plateAcc: '#5a3a30', back: '#2a1e20', ore: '#ff8a2a', mouth: '#ff5a1a', scale: 1.75 },
  desc: 'Its hood glows like a forge door.',
});
mon('cinderfang', {
  name: 'Cinderfang', title: 'Herald of the Foundry', region: 2, tier: 'boss', hp: 520, dmg: 10, interval: 2.8, armor: 3, weak: ['ice'], resist: ['fire'],
  attacks: [
    { name: 'Twin Bite', dmg: 0.6, windup: 0.8, kind: 'multi', hits: 2 },
    { name: 'Cinder Breath', dmg: 0.5, windup: 1.2, kind: 'multi', hits: 4, effect: 'burn', weight: 0.4 },
    { name: 'Obsidian Coil', dmg: 1.9, windup: 1.5, kind: 'heavy', weight: 0.4 },
    { name: 'Meltdown', dmg: 2.3, windup: 1.9, kind: 'unblockable', weight: 0.3, phase: 2 },
  ],
  phases: [{ at: 0.5, text: 'Both heads roar. White-hot!', speed: 1.25 }],
  drops: [{ id: 'herald_scale', chance: 1 }, { id: 'fire_gland', chance: 1 }, { id: 'magmasteel', chance: 0.8 }, { id: 'ruby', chance: 0.6 }, { id: 'gorgonite', chance: 0.6 }],
  model: { arch: 'cinderfang', body: '#2a2022', belly: '#ff8a2a', accent: '#ff6a1a', eye: '#ffe04a', horn: '#141012', plate: '#1e1618', plateAcc: '#4a3430', back: '#3a1a14', mouth: '#ff5a1a', ore: '#ff8a2a', scale: 2.5 },
  intro: 'Two heads. One hunger.',
  desc: 'A two-headed serpent of obsidian and lava.',
});
// -- act 3 · Medusa's Garden
mon('gorgon_snake', {
  name: 'Gorgon Serpent', region: 3, hp: 120, dmg: 8, interval: 2.4, weak: ['holy'],
  attacks: [{ name: 'Marble Fang', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Third Eye', dmg: 0.8, windup: 1.2, kind: 'special', effect: 'stone', weight: 0.35 }],
  drops: [{ id: 'serpent_fang', chance: 1 }, { id: 'snake_scale', chance: 0.8 }, { id: 'gorgonite', chance: 0.25 }, { id: 'emerald', chance: 0.1 }],
  model: { arch: 'gorgon_snake', body: '#7aa890', belly: '#ece4cc', accent: '#ffd25e', eye: '#9affc8', eye3: '#c8ffe0', horn: '#2a3a30', gold: '#e8b840', back: '#5a8a70', ore: '#5affb0', scale: 1.6 },
  desc: 'One of Medusa\'s own locks, grown wild.',
});
mon('basilisk', {
  name: 'Basilisk', region: 3, tier: 'elite', hp: 440, dmg: 11, interval: 3.0, armor: 4, weak: ['holy'],
  attacks: [{ name: 'Crown Bite', dmg: 1, windup: 0.8, kind: 'normal' }, { name: 'Claw Rake', dmg: 0.5, windup: 1.0, kind: 'multi', hits: 3, weight: 0.4 }, { name: 'Stone Gaze', dmg: 1.9, windup: 1.7, kind: 'unblockable', effect: 'stone', weight: 0.3 }],
  drops: [{ id: 'gorgonite', chance: 0.8 }, { id: 'serpent_fang', chance: 1 }, { id: 'gorgon_tear', chance: 0.2 }, { id: 'diamond', chance: 0.1 }],
  model: { arch: 'basilisk', body: '#4a6a4e', belly: '#d8d0a8', accent: '#ffd25e', eye: '#9affc8', eye3: '#ffffff', horn: '#1e2a22', gold: '#e8b840', plate: '#2e4434', back: '#3a5640', ore: '#5affb0', scale: 1.5 },
  desc: 'King of serpents. Don\'t meet its eyes.',
});
mon('medusa', {
  name: 'Medusa', title: 'The Gorgon Queen', region: 3, tier: 'boss', hp: 560, dmg: 12, interval: 2.8, armor: 3, weak: ['holy'],
  attacks: [
    { name: 'Serpent Lash', dmg: 1, windup: 0.8, kind: 'normal' },
    { name: 'Hair of Vipers', dmg: 0.4, windup: 1.0, kind: 'multi', hits: 5, weight: 0.4 },
    { name: 'Coil Crush', dmg: 1.8, windup: 1.4, kind: 'heavy', weight: 0.35 },
    { name: 'Stone Gaze', dmg: 1.2, windup: 1.6, kind: 'special', effect: 'stone', weight: 0.3, phase: 2 },
    { name: 'Gorgon\'s Glare', dmg: 2.4, windup: 2.0, kind: 'unblockable', weight: 0.3, phase: 3 },
  ],
  phases: [{ at: 0.66, text: 'She lowers her hands.', speed: 1.15 }, { at: 0.33, text: 'Every snake hisses at once!', speed: 1.3 }],
  drops: [{ id: 'gorgon_tear', chance: 1 }, { id: 'gorgonite', chance: 1 }, { id: 'soulstone', chance: 0.5 }],
  model: { arch: 'medusa', body: '#7aa890', belly: '#ece4cc', accent: '#9affc8', eye: '#9affc8', ore: '#5affb0', scale: 1 },
  intro: 'Thank you for coming back, little forger.',
  desc: 'She spared you once.',
});

// treasure-room ambusher (any region)
mon('mimic', {
  name: 'Mimic', region: -1, hp: 80, dmg: 6, interval: 2.4, weak: ['shock'],
  attacks: [{ name: 'CHOMP', dmg: 1, windup: 0.6, kind: 'normal' }, { name: 'Gobble Gold', dmg: 0.5, windup: 0.8, kind: 'special', effect: 'steal', weight: 0.35 }, { name: 'Lid Slam', dmg: 1.6, windup: 1.2, kind: 'heavy', weight: 0.35 }],
  drops: [{ id: 'mimic_tongue', chance: 1 }, { id: 'mimic_teeth', chance: 1 }, { id: 'golden_key', chance: 0.2 }],
  model: { arch: 'mimic', body: '#8a5a33', belly: '#ff6a9a', accent: '#ffd23a', eye: '#ffffff', scale: 1.0 },
  coins: [25, 40],
  desc: 'It was never a chest. It was always teeth.',
});

export const monster = (id) => MONSTERS[id];
/** Monsters of one act and tier ('normal' | 'elite' | 'boss'). */
export function actPool(act, tier = 'normal') {
  return Object.values(MONSTERS).filter((m) => m.region === act && m.tier === tier);
}
/** The Herald (or Medusa) who ends an act. */
export const ACT_BOSS = ['thornscale', 'glasscoil', 'cinderfang', 'medusa'];
/** @deprecated v3 name — kept until the old scenes are removed. */
export const regionPool = actPool;
