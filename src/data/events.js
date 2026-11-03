// Choice events (docs/REDESIGN.md §5.7). No NPCs, no QTEs, almost no text.
//   { id, acts: [0–3], title (≤ 3 words), text (≤ 2 short lines), vignette, choices: [choice] }
//   choice: { label (≤ 6 words), icon, risk?: 'hp'|'fight'|'stone'|'item', req?(run) → true | 'short reason',
//             out(run, rng) → outcome }
//   outcome (the event scene applies it): {
//     text: one short line,
//     gain: [[materialId, quality], …]     items into the bag (open the bag if they don't fit)
//     hp: ±n, maxHp: +n                     stone: ±x  (on the current weapon, 0..1; − cleans it)
//     weapon: finalized weapon               a found weapon to equip (may arrive part-stone)
//     buff: { name, icon, fights, dmg?|guard?|stoneResist?|loot?|regen? }   (run.addBuff)
//     learn: true (a weapon recipe) | 'stew' (a stew recipe)
//     fight: monsterId, elite?: true         a fight starts after the text
//     pick: { verb, filter(materialAndItem) → bool, then(item, run, rng) → outcome }  choose a bag item first
//     pip: 'dig' | 'bark' | 'happy'          what Pip does (flavour)
//   }
// vignette keys — the first-person props each event stands in (built by the event scene):
//   snake_nest, stone_adventurer, mushroom_ring, rootbound_chest, dwarf_forge, whispering_well,
//   hot_spring, broken_bridge, glowworm_grotto, sleeping_troll, herb_garden, shrine_of_scales,
//   mirror_pool, old_campsite, bone_pile, crystal_harp, lava_altar, cave_hive, shed_skin, statue_garden
import { MONSTERS } from './monsters.js';
import { MATERIALS } from './materials.js';
import { ACTS } from './regions.js';
import { STEWS } from './stews.js';
import { evaluate, finalizeWeapon } from '../systems/forge.js';

const firstItem = (run, pred) => run.bag.all().find(pred);
const hasItem = (run, pred) => !!firstItem(run, pred);
const cookable = (it) => !!(MATERIALS[it.id] && MATERIALS[it.id].cook);

// fights: the act's serpents (fall back to any foe of the act while the roster is being built)
const SNAKES = [['adder', 'vine_viper'], ['glass_adder', 'cistern_naga'], ['ember_asp'], ['gorgon_snake']];
function foe(run, rng, kind = 'snake') {
  const act = Math.max(0, Math.min(3, run.act));
  if (kind === 'elite') {
    const e = (ACTS[act].elite || []).filter((id) => MONSTERS[id]);
    if (e.length) return rng.pick(e);
  }
  const s = SNAKES[act].filter((id) => MONSTERS[id]);
  if (kind === 'snake' && s.length) return rng.pick(s);
  const pool = Object.values(MONSTERS).filter((m) => m.tier === (kind === 'elite' ? 'elite' : 'normal') && m.region === act && m.id !== 'mimic');
  const any = pool.length ? pool : Object.values(MONSTERS).filter((m) => m.tier === 'normal' && m.id !== 'mimic');
  return rng.pick(any).id;
}
const FORAGE = [['cave_moss', 'fern_root', 'glowcap', 'honeycomb', 'bitterbark'], ['cave_moss', 'frost_lily', 'stone_salt', 'starfruit'], ['ember_pepper', 'fern_root', 'bitterbark', 'stone_salt'], ['frost_lily', 'honeycomb', 'starfruit', 'bitterbark']];
const ORES = [['copper', 'tin', 'iron', 'coal', 'silver'], ['iron', 'silver', 'quartz', 'rime', 'sapphire'], ['iron', 'magmasteel', 'gold', 'ember', 'obsidian'], ['silver', 'gold', 'mithril', 'emerald', 'gorgonite']];
const forageOf = (run, rng) => rng.pick(FORAGE[Math.max(0, Math.min(3, run.act))]);
const oreOf = (run, rng) => rng.pick(ORES[Math.max(0, Math.min(3, run.act))]);
const unknownStew = (run, rng) => { const u = Object.keys(STEWS).filter((s) => !run.stews.includes(s)); return u.length ? rng.pick(u) : null; };

/** A weapon found in the world (already forged; may come half stone). */
export function foundWeapon(bp, ids, grade = 2, stone = 0, char = null) {
  const res = evaluate(bp, ids.map((id, i) => ({ id, q: 2, uid: 'found' + i })), { char });
  return { ...finalizeWeapon(res, grade, { char }), stone };
}

export const EVENTS = [
  {
    id: 'snake_nest', title: 'Snake Nest', acts: [0, 1, 2, 3], vignette: 'snake_nest',
    text: 'A warm nest of speckled eggs.\nWhatever laid them is close.',
    choices: [
      { label: 'Take the eggs', icon: 'gem', risk: 'fight', out: (run, rng) => (rng.chance(0.45) ? { text: 'Something hisses behind you.', gain: [['snake_egg', 2], ['snake_egg', 2]], fight: foe(run, rng) } : { text: 'Two eggs, still warm.', gain: [['snake_egg', 2], ['snake_egg', 2]] }) },
      { label: 'Leave quietly', icon: 'arrowR', out: () => ({ text: 'Pip looks back, sadly.', pip: 'happy' }) },
    ],
  },
  {
    id: 'stone_adventurer', title: 'Stone Explorer', acts: [0, 1, 2, 3], vignette: 'stone_adventurer',
    text: 'An explorer turned to stone,\nstill gripping a sword.',
    choices: [
      { label: 'Take the sword', icon: 'sword', risk: 'stone', out: (run) => ({ text: 'Half stone, still sharp.', weapon: foundWeapon('sword', ['iron', 'petrite', run.act >= 2 ? 'silver' : 'copper'], 2, 0.45, run.char) }) },
      { label: 'Search the pack', icon: 'bag', out: (run, rng) => ({ text: 'Ore and a snack.', gain: [[oreOf(run, rng), 2], [oreOf(run, rng), 2], [forageOf(run, rng), 2]] }) },
      { label: 'Pay your respects', icon: 'heart', out: () => ({ text: 'You feel steadier.', maxHp: 4, hp: 4 }) },
    ],
  },
  {
    id: 'mushroom_ring', title: 'Mushroom Ring', acts: [0, 1], vignette: 'mushroom_ring',
    text: 'Glowcaps in a perfect circle.\nOne of them winks.',
    choices: [
      { label: 'Eat the winking one', icon: 'question', risk: 'hp', out: (run, rng) => { const r = rng.next(); return r < 0.5 ? { text: 'Delicious!', hp: 20 } : r < 0.8 ? { text: 'You feel sturdier.', maxHp: 5, hp: 5 } : { text: 'Blegh. Everything is blue.', hp: -8 }; } },
      { label: 'Pick the ring', icon: 'gem', out: () => ({ text: 'A pocket full of glow.', gain: [['glowcap', 2], ['glowcap', 2], ['glowcap', 2]] }) },
    ],
  },
  {
    id: 'rootbound_chest', title: 'Root-Bound Chest', acts: [0, 3], vignette: 'rootbound_chest',
    text: 'Roots have swallowed a little chest.',
    choices: [
      { label: 'Pry it open', icon: 'chest', risk: 'hp', out: (run, rng) => ({ text: 'Splinters, and treasure.', hp: -6, gain: [[oreOf(run, rng), 3], [rng.pick(['amethyst', 'topaz', 'ruby', 'emerald']), 2]] }) },
      { label: 'Hack the roots', icon: 'sword', risk: 'stone', req: (run) => !!run.weapon || 'Needs a weapon', out: (run, rng) => ({ text: 'Your blade grows heavier.', stone: 0.15, gain: [[oreOf(run, rng), 3], [rng.pick(['amethyst', 'topaz', 'ruby', 'emerald']), 2]] }) },
      { label: 'Let Pip dig', icon: 'tool', out: (run, rng) => (rng.chance(0.6) ? { text: 'Pip drags out a gem!', pip: 'dig', gain: [[rng.pick(['amethyst', 'quartz', 'topaz']), 2]] } : { text: 'Pip finds a worm. Pip is happy.', pip: 'happy' }) },
    ],
  },
  {
    id: 'dwarf_forge', title: 'Old Dwarf Forge', acts: [2, 0], vignette: 'dwarf_forge',
    text: 'A dwarf forge.\nThe embers are still alive.',
    choices: [
      { label: 'Clean your blade', icon: 'forge', req: (run) => (run.weapon && run.weapon.stone > 0) || 'No stone to clean', out: () => ({ text: 'Stone flakes off.', stone: -0.5 }) },
      { label: 'Temper an ore', icon: 'hammer', out: () => ({ pick: { verb: 'Temper', filter: (it) => it.q < 4 && !!it.weapon, then: (it) => { it.q++; return { text: 'It gleams.' }; } } }) },
      { label: 'Read the anvil runes', icon: 'recipe', out: () => ({ text: 'A weapon recipe!', learn: true }) },
    ],
  },
  {
    id: 'whispering_well', title: 'Whispering Well', acts: [1, 3], vignette: 'whispering_well',
    text: 'A well. It whispers back.',
    choices: [
      { label: 'Drop in a gem', icon: 'gem', req: (run) => hasItem(run, (i) => MATERIALS[i.id].kind === 'gem') || 'Needs a gem', out: () => ({ pick: { verb: 'Drop', filter: (it) => it.kind === 'gem', then: (it, run, rng) => { run.removeItem(it); return { text: 'Something rises to the top.', gain: [[rng.pick(['diamond', 'moonstone', 'prism', 'emerald', 'sapphire']), 3], [oreOf(run, rng), 3]] }; } } }) },
      { label: 'Drink', icon: 'heart', out: () => ({ text: 'Cold and clean.', hp: 15 }) },
      { label: 'Walk on', icon: 'arrowR', out: () => ({ text: 'The whispers fade.' }) },
    ],
  },
  {
    id: 'hot_spring', title: 'Hot Spring', acts: [1, 2], vignette: 'hot_spring',
    text: 'Steaming water. Smells of salt.',
    choices: [
      { label: 'Soak', icon: 'heart', out: () => ({ text: 'Ahh.', hp: 25 }) },
      { label: 'Scrape the salt', icon: 'tool', out: () => ({ text: 'Pink and crunchy.', gain: [['stone_salt', 2], ['stone_salt', 2], ['stone_salt', 2]] }) },
    ],
  },
  {
    id: 'broken_bridge', title: 'Broken Bridge', acts: [0, 1, 2], vignette: 'broken_bridge',
    text: 'The bridge is gone.\nSomething glints on the far ledge.',
    choices: [
      { label: 'Jump it', icon: 'speed', risk: 'hp', out: (run, rng) => (rng.chance(0.7) ? { text: 'Made it! Pip too.', gain: [[rng.pick(['silver', 'gold', 'sapphire', 'ruby']), 3]] } : { text: 'Not quite.', hp: -12 }) },
      { label: 'Climb down and around', icon: 'arrowD', out: (run, rng) => ({ text: 'Slow, but you find herbs.', gain: [[forageOf(run, rng), 2], [forageOf(run, rng), 2]] }) },
    ],
  },
  {
    id: 'glowworm_grotto', title: 'Glowworm Grotto', acts: [0, 1], vignette: 'glowworm_grotto',
    text: 'Blue lights crawl over the ceiling.',
    choices: [
      { label: 'Rest a while', icon: 'heart', out: () => ({ text: 'Calm settles in.', hp: 12, buff: { name: 'Calm', icon: 'block', fights: 2, guard: 25 } }) },
      { label: 'Catch some', icon: 'sparkle', out: () => ({ text: 'A jar of glow.', gain: [['moth_dust', 2]] }) },
    ],
  },
  {
    id: 'sleeping_troll', title: 'Sleeping Troll', acts: [0, 2], vignette: 'sleeping_troll',
    text: 'A troll snores on a pile of ore.',
    choices: [
      { label: 'Sneak the ore', icon: 'ore', risk: 'fight', out: (run, rng) => (rng.chance(0.6) ? { text: 'Not a snore missed.', gain: [[oreOf(run, rng), 3], [oreOf(run, rng), 2]] } : { text: 'It wakes up. Grumpy.', gain: [[oreOf(run, rng), 2]], fight: foe(run, rng, 'elite'), elite: true }) },
      { label: 'Fight it', icon: 'sword', risk: 'fight', out: (run, rng) => ({ text: 'Wake up!', fight: foe(run, rng, 'elite'), elite: true }) },
      { label: 'Tiptoe past', icon: 'arrowR', out: () => ({ text: 'Shh.' }) },
    ],
  },
  {
    id: 'herb_garden', title: 'Herb Garden', acts: [0, 1, 2, 3], vignette: 'herb_garden',
    text: 'Someone grew herbs here.\nLong, long ago.',
    choices: [
      { label: 'Gather everything', icon: 'bag', out: (run, rng) => ({ text: 'A full basket.', gain: [[forageOf(run, rng), 2], [forageOf(run, rng), 2], [forageOf(run, rng), 2]] }) },
      { label: 'Study the beds', icon: 'recipe', out: (run, rng) => ({ text: 'A stew recipe, scratched in stone.', learn: unknownStew(run, rng) ? 'stew' : true, gain: [[forageOf(run, rng), 2]] }) },
    ],
  },
  {
    id: 'shrine_of_scales', title: 'Shrine of Scales', acts: [1, 2, 3], vignette: 'shrine_of_scales',
    text: 'Carved snakes coil round\nan offering bowl.',
    choices: [
      { label: 'Offer a monster part', icon: 'part', req: (run) => hasItem(run, (i) => MATERIALS[i.id].kind === 'part') || 'Needs a monster part', out: () => ({ pick: { verb: 'Offer', filter: (it) => it.kind === 'part', then: (it, run) => { run.removeItem(it); return { text: 'Stone will slide off you.', buff: { name: 'Shrine Ward', icon: 'rune', fights: 3, stoneResist: 50 } }; } } }) },
      { label: 'Smash the bowl', icon: 'hammer', risk: 'fight', out: (run, rng) => ({ text: 'The carvings move.', gain: [['snake_scale', 2], ['venom_gland', 2]], fight: foe(run, rng) }) },
      { label: 'Leave it', icon: 'arrowR', out: () => ({ text: 'The stone eyes follow you.' }) },
    ],
  },
  {
    id: 'mirror_pool', title: 'Mirror Pool', acts: [1, 3], vignette: 'mirror_pool',
    text: 'Still water.\nYour reflection blinks late.',
    choices: [
      { label: 'Dip an ore in', icon: 'ore', req: (run) => hasItem(run, (i) => ['ore', 'gem'].includes(MATERIALS[i.id].kind)) || 'Needs an ore or gem', out: () => ({ pick: { verb: 'Dip', filter: (it) => it.kind === 'ore' || it.kind === 'gem', then: (it) => ({ text: 'Its reflection climbs out too.', gain: [[it.id, Math.max(0, (it.q ?? 2) - 1)]] }) } }) },
      { label: 'Look away', icon: 'arrowR', out: () => ({ text: 'Probably wise.' }) },
    ],
  },
  {
    id: 'old_campsite', title: 'Old Campsite', acts: [0, 1, 2, 3], vignette: 'old_campsite',
    text: 'Cold ashes. A dented pot.',
    choices: [
      { label: 'Cook something quick', icon: 'campfire', req: (run) => run.bag.all().filter(cookable).length >= 1 || 'Needs something to cook', out: () => ({ pick: { verb: 'Cook', filter: (it) => !!it.cook, then: (it, run) => { run.removeItem(it); const c = MATERIALS[it.id].cook; return { text: 'Simple, but warm.', hp: 8 + (c.heal || 0) * 2, maxHp: c.maxHp || 0 }; } } }) },
      { label: 'Search the packs', icon: 'bag', out: (run, rng) => ({ text: 'Someone left in a hurry.', gain: [[oreOf(run, rng), 2], [forageOf(run, rng), 2]] }) },
      { label: 'Read the scratched notes', icon: 'recipe', out: (run, rng) => ({ text: 'A recipe!', learn: unknownStew(run, rng) ? 'stew' : true }) },
    ],
  },
  {
    id: 'bone_pile', title: 'Bone Pile', acts: [0, 2, 3], vignette: 'bone_pile',
    text: 'Old bones and a rusty helmet.',
    choices: [
      { label: 'Dig through', icon: 'bone', risk: 'fight', out: (run, rng) => (rng.chance(0.25) ? { text: 'The bones get up.', gain: [['bone', 2]], fight: foe(run, rng, 'any') } : { text: 'Bones, and a skull.', gain: [['bone', 2], ['bone', 2], rng.chance(0.4) ? ['skull', 2] : ['fossil', 2]] }) },
      { label: 'Pip, fetch!', icon: 'tool', out: () => ({ text: 'Pip brings the best one.', pip: 'dig', gain: [['bone', 3]] }) },
    ],
  },
  {
    id: 'crystal_harp', title: 'Crystal Harp', acts: [1], vignette: 'crystal_harp',
    text: 'Crystals that hum when touched.',
    choices: [
      { label: 'Play a tune', icon: 'star', out: () => ({ text: 'You feel the rhythm.', buff: { name: 'Harp Song', icon: 'block', fights: 3, guard: 40 } }) },
      { label: 'Break off a shard', icon: 'gem', risk: 'hp', out: (run, rng) => ({ text: 'Sharp!', hp: -5, gain: [[rng.pick(['prism', 'rime', 'storm', 'moonstone']), 3]] }) },
    ],
  },
  {
    id: 'lava_altar', title: 'Lava Altar', acts: [2], vignette: 'lava_altar',
    text: 'An altar over the lava.\nIt wants something hot.',
    choices: [
      { label: 'Offer an ore', icon: 'ore', req: (run) => hasItem(run, (i) => MATERIALS[i.id].kind === 'ore') || 'Needs an ore', out: () => ({ pick: { verb: 'Offer', filter: (it) => it.kind === 'ore', then: (it, run, rng) => { run.removeItem(it); return { text: 'It comes back glowing.', gain: [[rng.pick(['magmasteel', 'gold', 'magmasteel', 'mithril']), Math.min(4, (it.q ?? 2) + 1)]] }; } } }) },
      { label: 'Warm your hands', icon: 'heart', out: () => ({ text: 'Toasty.', hp: 10 }) },
    ],
  },
  {
    id: 'cave_hive', title: 'Cave Hive', acts: [0, 3], vignette: 'cave_hive',
    text: 'Glowing bees round a fat hive.',
    choices: [
      { label: 'Grab the honeycomb', icon: 'gem', risk: 'hp', out: () => ({ text: 'Stung, but sweet.', hp: -6, gain: [['honeycomb', 2], ['honeycomb', 2]] }) },
      { label: 'Smoke them out', icon: 'fire', req: (run) => hasItem(run, (i) => i.id === 'coal' || i.id === 'brimstone') || 'Needs coal', out: (run) => { run.removeItem(firstItem(run, (i) => i.id === 'coal' || i.id === 'brimstone')); return { text: 'Sleepy bees, free honey.', gain: [['honeycomb', 3], ['honeycomb', 3], ['honeycomb', 2]] }; } },
      { label: 'Leave them', icon: 'arrowR', out: () => ({ text: 'Bzz.' }) },
    ],
  },
  {
    id: 'shed_skin', title: 'Shed Skin', acts: [0, 1, 2, 3], vignette: 'shed_skin',
    text: 'A shed snakeskin,\nlonger than a cart.',
    choices: [
      { label: 'Take the scales', icon: 'part', out: () => ({ text: 'Light and tough.', gain: [['snake_scale', 2], ['snake_scale', 2], ['snake_scale', 2]] }) },
      { label: 'Follow the trail', icon: 'sword', risk: 'fight', out: (run, rng) => ({ text: 'Found it.', gain: [['venom_gland', 2]], fight: foe(run, rng) }) },
    ],
  },
  {
    id: 'statue_garden', title: 'Statue Garden', acts: [3], vignette: 'statue_garden',
    text: 'Dozens of stone faces.\nAll looking at the same door.',
    choices: [
      { label: 'Chip the statues', icon: 'pickaxe', out: () => ({ text: 'Heavy, valuable stone.', gain: [['gorgonite', 2], ['petrite', 2], ['petrite', 2]] }) },
      { label: 'Close their eyes', icon: 'eye', out: () => ({ text: 'Stone slides off you.', buff: { name: 'Quiet Faces', icon: 'rune', fights: 3, stoneResist: 40 } }) },
    ],
  },
];
