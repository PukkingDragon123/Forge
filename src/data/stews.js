// Camp stews (docs/REDESIGN.md §5.5). A named stew is an exact mix of ingredients (order free); any
// other mix of cookable things still makes a plain stew from the ingredients' own `cook` effects.
// effects: heal (HP now) maxHp (+max HP, permanent) | for the next `fights` fights: dmg (% damage)
//   guard (% wider guard window) stoneResist (% less stone per kill) loot (% more loot from stone)
//   regen (HP every 3 s in a fight)
export const STEWS = {
  hearty: {
    id: 'hearty', name: 'Hearty Stew', ings: ['fern_root', 'cave_moss', 'honeycomb'],
    effects: { heal: 30, maxHp: 6 }, fights: 0, icon: 'heart', color: '#e0804a', hint: 'Root, moss and honey.',
  },
  gorgon_broth: {
    id: 'gorgon_broth', name: 'Gorgon Broth', ings: ['bitterbark', 'snake_egg', 'stone_salt'],
    effects: { stoneResist: 50, heal: 8 }, fights: 4, icon: 'rune', color: '#7affc8', hint: 'Bark, an egg, a pinch of salt.',
  },
  dragon_chili: {
    id: 'dragon_chili', name: 'Dragonfire Chili', ings: ['ember_pepper', 'ember_pepper', 'fire_gland'],
    effects: { dmg: 40 }, fights: 3, icon: 'fire', color: '#ff5a2a', hint: 'Two peppers and something angrier.',
  },
  frostbloom: {
    id: 'frostbloom', name: 'Frostbloom Soup', ings: ['frost_lily', 'glowcap', 'stone_salt'],
    effects: { guard: 70, regen: 2 }, fights: 3, icon: 'ice', color: '#9ae0ff', hint: 'A lily, a glowcap, salt.',
  },
  prospector: {
    id: 'prospector', name: "Prospector's Porridge", ings: ['starfruit', 'honeycomb', 'stone_salt'],
    effects: { loot: 60, heal: 10 }, fights: 4, icon: 'gem', color: '#ffe85a', hint: 'Starfruit, honey, salt.',
  },
  medley: {
    id: 'medley', name: 'Glowcap Medley', ings: ['glowcap', 'glowcap', 'cave_moss'],
    effects: { heal: 20, regen: 2 }, fights: 3, icon: 'lifesteal', color: '#5af0c8', hint: 'Two glowcaps on moss.',
  },
  viper_gumbo: {
    id: 'viper_gumbo', name: 'Viper Gumbo', ings: ['snake_scale', 'venom_gland', 'ember_pepper'],
    effects: { dmg: 25, stoneResist: 25 }, fights: 3, icon: 'poison', color: '#8ad04a', hint: 'Scale, venom and a pepper.',
  },
  miners_breakfast: {
    id: 'miners_breakfast', name: "Miner's Breakfast", ings: ['snake_egg', 'fern_root', 'stone_salt'],
    effects: { maxHp: 8, heal: 15, loot: 20 }, fights: 2, icon: 'pickaxe', color: '#ffb03a', hint: 'Egg, root and salt.',
  },
  herald_soup: {
    id: 'herald_soup', name: 'Herald Scale Soup', ings: ['herald_scale', 'bitterbark', 'stone_salt'],
    effects: { stoneResist: 80, maxHp: 10 }, fights: 5, icon: 'boss', color: '#2a8a5a', hint: "A Herald's scale, bark, salt.",
  },
  tear_tea: {
    id: 'tear_tea', name: 'Gorgon-Tear Tea', ings: ['gorgon_tear', 'frost_lily'],
    effects: { stoneResist: 100, guard: 40 }, fights: 3, icon: 'eye', color: '#7affc8', hint: 'A tear and a lily.',
  },
};

/** How each effect reads in the UI: icon, colour tag, and a ≤ 4-word label maker. */
export const STEW_FX = {
  heal: { icon: 'heart', tag: 'heal', label: (v) => `+${v} HP` },
  maxHp: { icon: 'hp', tag: 'good', label: (v) => `+${v} max HP` },
  dmg: { icon: 'sword', tag: 'mult', label: (v) => `+${v}% damage` },
  guard: { icon: 'block', tag: 'block', label: (v) => `+${v}% guard` },
  stoneResist: { icon: 'rune', tag: 'good', label: (v) => `−${v}% stone` },
  loot: { icon: 'gem', tag: 'gold', label: (v) => `+${v}% loot` },
  regen: { icon: 'lifesteal', tag: 'heal', label: (v) => `regen ${v}` },
};
export const STEW_FX_ORDER = ['heal', 'maxHp', 'dmg', 'guard', 'stoneResist', 'loot', 'regen'];
