// v5 crafting (docs/REDESIGN.md §7): ingredients go in ORDER. A recipe is found as a Recipe Page (or
// guessed); the same ingredients in the wrong order only earn a hint. Every recipe's ingredient set is
// unique, so a hint always points at exactly one recipe.
//   { out: item id, ings: [ordered ingredient ids], station: workbench|forge|cauldron, known?: start
//     in the book, hidden?: never drops as a page (discover by experimenting), stage?: first stage it
//     tends to drop on }
const R = (out, ings, station, o = {}) => ({ out, ings, station, stage: 0, ...o });

export const CRAFT = {
  // ---------------------------------------------------------------- skills
  spore_burst: R('skill_spore_burst', ['spore_sac', 'glowcap', 'spore_sac'], 'workbench', { known: true }),
  stone_spikes: R('skill_stone_spikes', ['petrite', 'iron', 'petrite'], 'forge'),
  ember_dash: R('skill_ember_dash', ['coal', 'ember', 'cap_leather'], 'forge', { stage: 1 }),
  shield_bash: R('skill_shield_bash', ['snail_shell', 'iron', 'cap_leather'], 'workbench'),
  whirlwind: R('skill_whirlwind', ['mycelium_thread', 'iron', 'mycelium_thread'], 'workbench'),
  frost_nova: R('skill_frost_nova', ['rime', 'quartz', 'rime'], 'cauldron', { stage: 1 }),
  chain_spark: R('skill_chain_spark', ['copper', 'storm', 'copper'], 'forge', { stage: 1 }),
  root_snare: R('skill_root_snare', ['root_fiber', 'fern_root', 'root_fiber'], 'cauldron'),
  gem_shards: R('skill_gem_shards', ['quartz', 'amethyst', 'quartz'], 'workbench'),
  mushroom_turret: R('skill_mushroom_turret', ['mushroom_cap', 'glow_jelly', 'spore_sac', 'glowcap'], 'cauldron'),

  // ---------------------------------------------------------------- amulets & charms
  mycelium_heart: R('mycelium_heart', ['mycelium_thread', 'honeycomb', 'glowcap'], 'workbench'),
  spore_lantern: R('spore_lantern', ['copper', 'glow_jelly', 'spore_sac'], 'workbench'),
  ore_magnet: R('ore_magnet', ['iron', 'copper', 'iron'], 'forge'),
  glass_fang: R('glass_fang', ['cap_leather', 'quartz', 'quartz'], 'workbench'),
  stone_skin: R('stone_skin', ['petrite', 'snail_shell', 'petrite'], 'workbench'),
  twin_edge: R('twin_edge', ['iron', 'tin', 'iron'], 'forge'),
  whetstone: R('whetstone', ['petrite', 'quartz'], 'workbench'),
  miners_charm: R('miners_charm', ['iron', 'root_fiber'], 'workbench'),
  honey_charm: R('honey_charm', ['honeycomb', 'cap_leather'], 'workbench'),
  gem_lens: R('gem_lens', ['quartz', 'copper', 'amethyst'], 'workbench'),
  four_leaf: R('four_leaf', ['fern_root', 'emerald', 'fern_root'], 'workbench'),
  spore_pouch: R('spore_pouch', ['cap_leather', 'spore_sac'], 'workbench'),
  bone_charm: R('bone_charm', ['bone', 'cap_leather', 'bone'], 'workbench'),
  leech_fang: R('leech_fang', ['bat_fang', 'slime_gel', 'iron'], 'workbench', { stage: 1 }),
  moth_wing: R('moth_wing', ['glow_jelly', 'mycelium_thread', 'glow_jelly'], 'workbench'),
  ember_heart: R('ember_heart', ['ember', 'ruby', 'ember'], 'forge', { stage: 2 }),
  rime_locket: R('rime_locket', ['sapphire', 'rime', 'silver'], 'forge', { stage: 1 }),
  storm_coil: R('storm_coil', ['copper', 'copper', 'storm', 'silver'], 'forge', { stage: 1 }),
  kings_spore: R('kings_spore', ['puffcap_crown', 'glow_jelly', 'emerald'], 'workbench'),
  gorgon_eye: R('gorgon_eye', ['gorgonite', 'emerald', 'gorgonite'], 'forge', { hidden: true }),

  // ---------------------------------------------------------------- weapons
  copper_sword: R('copper_sword', ['copper', 'copper', 'coal'], 'forge'),
  iron_axe: R('iron_axe', ['iron', 'coal', 'iron', 'cap_leather'], 'forge'),
  spore_spear: R('spore_spear', ['root_fiber', 'iron', 'spore_sac'], 'forge'),
  puffcap_maul: R('puffcap_maul', ['petrite', 'mushroom_cap', 'iron', 'petrite'], 'forge'),
  gem_dagger: R('gem_dagger', ['iron', 'amethyst'], 'forge'),
  mycel_staff: R('mycel_staff', ['fern_root', 'mycelium_thread', 'glow_jelly'], 'forge'),
  gorgon_blade: R('gorgon_blade', ['gorgonite', 'iron', 'gorgonite', 'emerald'], 'forge', { hidden: true }),

  // ---------------------------------------------------------------- tools
  iron_pickaxe: R('iron_pickaxe', ['iron', 'fern_root', 'iron'], 'forge'),
  hammer: R('hammer', ['iron', 'iron', 'cap_leather'], 'forge'),
  chisel: R('chisel', ['iron', 'quartz'], 'forge'),
  bomb: R('bomb', ['coal', 'spore_sac'], 'cauldron', { known: true }),
  lantern: R('lantern', ['glow_jelly', 'copper'], 'workbench'),

  // ---------------------------------------------------------------- potions
  healing_potion: R('healing_potion', ['cave_moss', 'honeycomb'], 'cauldron', { known: true }),
  spore_tonic: R('spore_tonic', ['spore_sac', 'glowcap'], 'cauldron'),
  stoneskin_draught: R('stoneskin_draught', ['snail_shell', 'cave_moss'], 'cauldron'),
  haste_brew: R('haste_brew', ['glow_jelly', 'fern_root'], 'cauldron'),
  golden_broth: R('golden_broth', ['truffle', 'honeycomb', 'glowcap'], 'cauldron', { hidden: true }),
};
export const RECIPES = CRAFT;
export const STATIONS = ['workbench', 'forge', 'cauldron'];
