// Shrine events (docs/REDESIGN.md §3, §8): a shrine room holds one strange thing. Short text, a few
// floating dialogue lines, 2–3 choices. Places and creatures that don't talk (Durgan does, a little).
//   { id, stages: [0–3] (acts = same), title (≤ 3 words), text (≤ 2 short lines), vignette (room prop key),
//     lines: [{ who: 'durgan'|'pip'|'shrine', text (≤ 12 words) }]   (played by the dialogue overlay)
//     choices: [{ label (≤ 6 words), icon, risk?: 'hp'|'fight'|'item', req?(run) → true | 'short reason',
//                 out(run, rng) → outcome }] }
// outcome — applyOutcome(run, out) does the bookkeeping, the scene does the show:
//   text: one short line (≤ 48 chars)            hp: ±n            maxHp: +n (permanent)
//   gain: [[materialId, quality], …]   items into the bag (tools get their uses; overflow returned)
//   effect: { name, icon, rooms, stats }   temporary stats for N rooms (systems/loadout.js stat keys)
//   learn: recipeId | 'random'              a crafting recipe for the book
//   fight: monsterId, elite?: true          a fight starts after the line (the shrine room spawns it)
//   pick: { verb, filter(materialAndItem) → bool, then(item, run, rng) → outcome }   choose a bag item first
//   upgrade: item                           (from pick.then) that item gained +1 quality
//   pip: 'dig' | 'bark' | 'happy'           what Pip does (flavour)
// vignette keys (props C/U place in the shrine room):
//   spore_altar, mushroom_ring, petrified_explorer, glowing_pool, rootbound_chest, sleeping_brute,
//   weeping_cap, cave_hive, herb_garden, bone_pile, old_campfire, whispering_well, snail_shrine,
//   crystal_harp, mirror_pool, hot_spring, dwarf_forge, lava_altar, shrine_of_scales, statue_garden
import { MONSTERS } from './monsters.js';
import { MATERIALS } from './materials.js';
import { STAGES } from './regions.js';
import { evaluate, finalizeWeapon } from '../systems/forge.js';
import { makeItem } from '../systems/items.js';
import { learnRecipe, randomUnknownRecipe } from '../systems/crafting.js';

const stageOf = (run) => Math.max(0, Math.min(3, run.stage ?? run.act ?? 0));
const pickW = (rng, list) => rng.weighted(list.filter(([id]) => MATERIALS[id]));
const forage = (run, rng) => pickW(rng, STAGES[stageOf(run)].forage);
const ore = (run, rng) => pickW(rng, STAGES[stageOf(run)].veins);
/** A foe for the shrine to spawn: the stage's own creatures (elite on request). */
function foe(run, rng, elite = false) {
  const S = STAGES[stageOf(run)];
  const want = (elite ? S.elites : S.roster).filter((id) => MONSTERS[id] && MONSTERS[id].region === stageOf(run));
  if (want.length) return rng.pick(want);
  const pool = Object.values(MONSTERS).filter((m) => m.region === stageOf(run) && m.tier === (elite ? 'elite' : 'normal'));
  return pool.length ? rng.pick(pool).id : Object.keys(MONSTERS)[0];
}
const build = (run, rng, kinds) => {
  const order = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const pool = Object.values(MATERIALS).filter((m) => kinds.includes(m.kind) && !m.tags.includes('boss') && order[m.rarity] <= 1 + stageOf(run) && m.id !== 'stone_axe');
  return rng.pick(pool).id;
};
const has = (run, pred) => run.bag.all().some((it) => MATERIALS[it.id] && pred(MATERIALS[it.id], it));

export const SHRINES = [
  // ------------------------------------------------------------ stage 0 · the Overgrown Mycelium
  {
    id: 'spore_altar', title: 'Spore Altar', stages: [0], vignette: 'spore_altar',
    text: 'A stone altar breathes\nslow green spores.',
    lines: [{ who: 'durgan', text: 'It is… breathing. Altars should not breathe.' }],
    choices: [
      { label: 'Breathe it in', icon: 'poison', risk: 'hp', out: (run, rng) => (rng.chance(0.6) ? { text: 'Your blood hums with spores.', hp: -6, effect: { name: 'Spore Blood', icon: 'poison', rooms: 4, stats: { status: { poison: 30 } } } } : { text: 'Cough! That was a mistake.', hp: -12 }) },
      { label: 'Offer a mushroom', icon: 'gem', req: (run) => has(run, (m) => m.tags.includes('spore')) || 'You have no mushrooms.', out: () => ({ pick: { verb: 'Offer', filter: (m) => m.tags.includes('spore'), then: (it, run, rng) => { run.removeItem(it); return { text: 'The altar gives something back.', gain: [[build(run, rng, ['charm', 'skill']), 2]] }; } } }) },
      { label: 'Leave it be', icon: 'arrowR', out: () => ({ text: 'Probably wise.' }) },
    ],
  },
  {
    id: 'mushroom_ring', title: 'Mushroom Ring', stages: [0, 1], vignette: 'mushroom_ring',
    text: 'Glowcaps in a perfect circle.\nOne of them winks.',
    lines: [{ who: 'pip', text: '*sniff sniff* …*wags*' }, { who: 'durgan', text: 'Pip likes it. That is never a good sign.' }],
    choices: [
      { label: 'Step inside', icon: 'question', risk: 'fight', out: (run, rng) => (rng.chance(0.55) ? { text: 'Warm light. You feel whole.', hp: 40 } : { text: 'The ring wakes up!', fight: foe(run, rng) }) },
      { label: 'Pick the glowcaps', icon: 'gem', out: () => ({ text: 'A pocket full of glow.', gain: [['glowcap', 2], ['glowcap', 2], ['glowcap', 2]] }) },
    ],
  },
  {
    id: 'petrified_explorer', title: 'Stone Explorer', stages: [0, 1, 2, 3], vignette: 'petrified_explorer',
    text: 'A miner turned to stone,\nstill gripping a pick.',
    lines: [{ who: 'durgan', text: 'Medusa got you too, friend. Sorry.' }],
    choices: [
      { label: 'Take the pick', icon: 'pickaxe', out: () => ({ text: 'A good iron pick.', gain: [['iron_pickaxe', 2]] }) },
      { label: 'Search the pack', icon: 'bag', out: (run, rng) => ({ text: 'Ore and a scrawled note.', gain: [[ore(run, rng), 2], [ore(run, rng), 2]], learn: 'random' }) },
      { label: 'Pay your respects', icon: 'heart', out: () => ({ text: 'You feel steadier.', maxHp: 8, hp: 8 }) },
    ],
  },
  {
    id: 'glowing_pool', title: 'Glowing Pool', stages: [0, 1], vignette: 'glowing_pool',
    text: 'Still water, glowing soft green.\nSomething shines at the bottom.',
    lines: [{ who: 'durgan', text: 'Either magic or very old soup.' }],
    choices: [
      { label: 'Drink deep', icon: 'heart', out: (run, rng) => (rng.chance(0.75) ? { text: 'Cool and sweet. All better.', hp: 60 } : { text: 'It tastes of feet.', hp: 10 }) },
      { label: 'Dip a weapon or charm', icon: 'star', req: (run) => has(run, (m) => ['weapon', 'charm', 'amulet'].includes(m.kind)) || 'Nothing to dip.', out: () => ({ pick: { verb: 'Dip', filter: (m) => ['weapon', 'charm', 'amulet'].includes(m.kind), then: (it) => { it.q = Math.min(4, (it.q ?? 2) + 1); return { text: 'It comes out gleaming.', upgrade: it }; } } }) },
      { label: 'Fish for the shine', icon: 'gem', risk: 'fight', out: (run, rng) => (rng.chance(0.5) ? { text: 'A gem! And no teeth.', gain: [[rng.pick(['amethyst', 'emerald', 'quartz']), 3]] } : { text: 'The shine had teeth.', fight: foe(run, rng) }) },
    ],
  },
  {
    id: 'rootbound_chest', title: 'Root-Bound Chest', stages: [0, 3], vignette: 'rootbound_chest',
    text: 'An old chest, swallowed\nby roots and moss.',
    lines: [{ who: 'durgan', text: 'Roots, meet axe.' }],
    choices: [
      { label: 'Hack the roots', icon: 'axe', out: (run, rng) => ({ text: 'Roots, and loot inside.', gain: [['root_fiber', 2], ['root_fiber', 2], [build(run, rng, ['charm', 'amulet']), 2]] }) },
      { label: 'Yank it free', icon: 'hp', risk: 'hp', out: (run, rng) => ({ text: 'Ow. Worth it.', hp: -10, gain: [[build(run, rng, ['amulet', 'skill', 'weapon']), 3]] }) },
    ],
  },
  {
    id: 'sleeping_brute', title: 'Sleeping Brute', stages: [0, 2], vignette: 'sleeping_brute',
    text: 'A myconid brute snores\non a pile of shiny things.',
    lines: [{ who: 'durgan', text: 'Shhh. Tiptoe, Pip. TIPTOE.' }, { who: 'pip', text: '*tiny tiptoe*' }],
    choices: [
      { label: 'Sneak some loot', icon: 'bag', risk: 'fight', out: (run, rng) => (rng.chance(0.6) ? { text: 'Snatched it. Still snoring.', gain: [[ore(run, rng), 3], [build(run, rng, ['charm']), 2]] } : { text: 'It wakes up. Grumpy.', fight: foe(run, rng, true), elite: true }) },
      { label: 'Wake it and fight', icon: 'elite', risk: 'fight', out: (run, rng) => ({ text: 'BEARD FIRST!', fight: foe(run, rng, true), elite: true, gain: [[build(run, rng, ['amulet', 'weapon']), 3]] }) },
      { label: 'Let it sleep', icon: 'arrowR', out: () => ({ text: 'Good brute. Stay.' }) },
    ],
  },
  {
    id: 'weeping_cap', title: 'Weeping Cap', stages: [0], vignette: 'weeping_cap',
    text: 'A giant mushroom drips\nglowing jelly into the dark.',
    lines: [{ who: 'durgan', text: 'Free jelly. Glowing jelly. Hmm.' }],
    choices: [
      { label: 'Collect the jelly', icon: 'gem', out: () => ({ text: 'Two wobbly handfuls.', gain: [['glow_jelly', 2], ['glow_jelly', 2]] }) },
      { label: 'Taste the jelly', icon: 'question', risk: 'hp', out: (run, rng) => (rng.chance(0.65) ? { text: 'You feel fast. Very fast.', effect: { name: 'Jelly Rush', icon: 'speed', rooms: 4, stats: { moveSpd: 15, atkSpd: 10 } } } : { text: 'Your tongue glows. Ugh.', hp: -8 }) },
    ],
  },
  {
    id: 'cave_hive', title: 'Cave Hive', stages: [0, 3], vignette: 'cave_hive',
    text: 'Glowing bees round a fat hive.\nHoney drips.',
    lines: [{ who: 'pip', text: '*whimpers at the buzzing*' }],
    choices: [
      { label: 'Grab the honeycomb', icon: 'hp', risk: 'hp', out: () => ({ text: 'Stung, but sweet.', hp: -6, gain: [['honeycomb', 2], ['honeycomb', 3]] }) },
      { label: 'Leave them be', icon: 'arrowR', out: () => ({ text: 'The bees approve.', pip: 'happy' }) },
    ],
  },
  {
    id: 'herb_garden', title: 'Wild Garden', stages: [0, 1, 2, 3], vignette: 'herb_garden',
    text: 'Herbs grow in the lamplight\nof a forgotten garden.',
    lines: [{ who: 'durgan', text: 'Ingredients! Pip, dig. Gently.' }],
    choices: [
      { label: 'Pick carefully', icon: 'campfire', out: (run, rng) => ({ text: 'A tidy bundle.', gain: [[forage(run, rng), 2], [forage(run, rng), 2]], pip: 'dig' }) },
      { label: 'Dig everything up', icon: 'bag', risk: 'fight', out: (run, rng) => ({ text: 'Something lived in there.', gain: [[forage(run, rng), 2], [forage(run, rng), 2], [forage(run, rng), 3], [forage(run, rng), 2]], fight: foe(run, rng) }) },
    ],
  },
  {
    id: 'bone_pile', title: 'Bone Pile', stages: [0, 2, 3], vignette: 'bone_pile',
    text: 'Old bones, picked clean.\nSomething glints beneath.',
    lines: [{ who: 'durgan', text: 'Pip. Drop it. Pip. PIP.' }],
    choices: [
      { label: 'Dig through', icon: 'bone', risk: 'hp', out: (run, rng) => ({ text: 'Bones, and a find.', hp: -5, gain: [['bone', 2], ['bone', 2], [rng.chance(0.5) ? 'bone_charm' : ore(run, rng), 2]], pip: 'dig' }) },
      { label: 'Let Pip sniff', icon: 'eye', out: (run, rng) => ({ text: 'Pip found a pocket!', gain: [[rng.pick(['bomb', 'lantern', 'chisel', 'healing_potion']), 2]], pip: 'happy' }) },
    ],
  },
  {
    id: 'old_campfire', title: 'Old Campfire', stages: [0, 1, 2, 3], vignette: 'old_campfire',
    text: 'Somebody camped here once.\nThe embers are still warm.',
    lines: [{ who: 'durgan', text: 'Five minutes. Just five.' }],
    choices: [
      { label: 'Rest a while', icon: 'campfire', out: () => ({ text: 'Warm toes, calm heart.', hp: 30 }) },
      { label: 'Search their things', icon: 'bag', out: (run, rng) => ({ text: 'A note, and supplies.', learn: 'random', gain: [[rng.pick(['healing_potion', 'bomb']), 2]] }) },
    ],
  },
  {
    id: 'whispering_well', title: 'Whispering Well', stages: [0, 1, 2, 3], vignette: 'whispering_well',
    text: 'Something whispers\nfrom the dark water.',
    lines: [{ who: 'shrine', text: '…give… and receive…' }, { who: 'durgan', text: 'I do not like wells that talk.' }],
    choices: [
      { label: 'Toss in an ore', icon: 'ore', req: (run) => has(run, (m) => m.kind === 'ore' || m.kind === 'gem') || 'No ore to toss.', out: () => ({ pick: { verb: 'Toss', filter: (m) => m.kind === 'ore' || m.kind === 'gem', then: (it, run, rng) => { run.removeItem(it); return { text: 'Something floats up.', gain: [[build(run, rng, ['amulet', 'charm']), Math.max(2, it.q ?? 2)]] }; } } }) },
      { label: 'Listen closely', icon: 'eye', risk: 'hp', out: () => ({ text: 'It tells you a recipe.', hp: -6, learn: 'random' }) },
      { label: 'Walk away', icon: 'arrowR', out: () => ({ text: 'The whispers fade.' }) },
    ],
  },
  {
    id: 'snail_shrine', title: 'Snail Shrine', stages: [0], vignette: 'snail_shrine',
    text: 'A tiny shrine. Snails\nhave left it shells.',
    lines: [{ who: 'durgan', text: 'A shrine for snails. By snails.' }],
    choices: [
      { label: 'Take a shell', icon: 'shield', out: () => ({ text: 'A sturdy mossy shell.', gain: [['snail_shell', 3]] }) },
      { label: 'Leave a gift', icon: 'heart', req: (run) => has(run, (m) => m.kind === 'forage') || 'No forage to give.', out: () => ({ pick: { verb: 'Give', filter: (m) => m.kind === 'forage', then: (it, run) => { run.removeItem(it); return { text: 'Slow blessings upon you.', effect: { name: 'Snail Blessing', icon: 'shield', rooms: 6, stats: { armor: 3 } } }; } } }) },
    ],
  },

  // ------------------------------------------------------------ later stages
  {
    id: 'crystal_harp', title: 'Crystal Harp', stages: [1], vignette: 'crystal_harp',
    text: 'Crystals ring like a harp\nwhen the drips hit them.',
    lines: [{ who: 'durgan', text: 'Pretty. Breakable. Pretty breakable.' }],
    choices: [
      { label: 'Play a tune', icon: 'star', out: () => ({ text: 'The song sharpens your eye.', effect: { name: 'Crystal Song', icon: 'crit', rooms: 5, stats: { crit: 12 } } }) },
      { label: 'Snap off crystals', icon: 'gem', risk: 'hp', out: (run, rng) => ({ text: 'Shards everywhere.', hp: -8, gain: [[rng.pick(['quartz', 'sapphire', 'amethyst']), 2], [rng.pick(['rime', 'storm']), 2]] }) },
    ],
  },
  {
    id: 'mirror_pool', title: 'Mirror Pool', stages: [1, 3], vignette: 'mirror_pool',
    text: 'Perfectly still water.\nYour reflection blinks late.',
    lines: [{ who: 'durgan', text: 'My reflection has a better beard.' }],
    choices: [
      { label: 'Copy an item', icon: 'question', risk: 'hp', req: (run) => run.bag.all().length > 0 || 'Your bag is empty.', out: () => ({ pick: { verb: 'Copy', filter: (m) => !m.tags.includes('boss'), then: (it) => ({ text: 'Two of them now.', hp: -15, gain: [[it.id, it.q ?? 2]] }) } }) },
      { label: 'Look away', icon: 'arrowR', out: () => ({ text: 'Your reflection waves.' }) },
    ],
  },
  {
    id: 'hot_spring', title: 'Hot Spring', stages: [1, 2], vignette: 'hot_spring',
    text: 'Steaming water. Smells of\nsulphur and relief.',
    lines: [{ who: 'pip', text: '*already in the water*' }],
    choices: [
      { label: 'Soak your bones', icon: 'heart', out: () => ({ text: 'Fully restored.', hp: 999 }) },
      { label: 'Boil a potion', icon: 'campfire', out: () => ({ text: 'A spring-fresh potion.', gain: [['healing_potion', 3], ['healing_potion', 2]] }) },
    ],
  },
  {
    id: 'dwarf_forge', title: 'Old Dwarf Forge', stages: [2, 0], vignette: 'dwarf_forge',
    text: 'An ancient anvil, still warm.\nA rune glows on its horn.',
    lines: [{ who: 'durgan', text: 'Now THIS is a proper anvil.' }],
    choices: [
      { label: 'Temper your weapon', icon: 'hammer', req: (run) => !!run.hand || 'No weapon in hand.', out: (run) => { run.hand.q = Math.min(4, (run.hand.q ?? 2) + 1); return { text: 'Your weapon rings truer.', upgrade: run.hand }; } },
      { label: 'Smelt some ore', icon: 'ore', req: (run) => has(run, (m) => m.kind === 'ore') || 'No ore.', out: () => ({ pick: { verb: 'Smelt', filter: (m) => m.kind === 'ore', then: (it) => { it.q = Math.min(4, (it.q ?? 2) + 2); return { text: 'Pure as starlight.', upgrade: it }; } } }) },
    ],
  },
  {
    id: 'lava_altar', title: 'Lava Altar', stages: [2], vignette: 'lava_altar',
    text: 'An altar over a lava pool.\nGems melt into fire.',
    lines: [{ who: 'durgan', text: 'Hot. Very hot. Beard-singeing hot.' }],
    choices: [
      { label: 'Offer a gem', icon: 'fire', req: (run) => has(run, (m) => m.kind === 'gem') || 'No gems.', out: () => ({ pick: { verb: 'Offer', filter: (m) => m.kind === 'gem', then: (it, run) => { run.removeItem(it); return { text: 'The lava answers.', gain: [['ember_heart', Math.max(2, it.q ?? 2)]] }; } } }) },
      { label: 'Warm your hands', icon: 'heart', out: () => ({ text: 'Toasty.', hp: 20 }) },
    ],
  },
  {
    id: 'shrine_of_scales', title: 'Shrine of Scales', stages: [1, 2, 3], vignette: 'shrine_of_scales',
    text: 'A serpent shrine.\nShed skins hang like flags.',
    lines: [{ who: 'durgan', text: 'Medusa\'s folk prayed here.' }],
    choices: [
      { label: 'Take the scales', icon: 'shield', risk: 'fight', out: (run, rng) => ({ text: 'Something slithers in.', gain: [['snake_scale', 2], ['snake_scale', 2]], fight: foe(run, rng) }) },
      { label: 'Smash the idol', icon: 'hammer', out: (run, rng) => ({ text: 'Stone and a green glint.', gain: [['petrite', 2], [rng.chance(0.3) ? 'gorgonite' : 'petrite', 3]] }) },
    ],
  },
  {
    id: 'statue_garden', title: 'Statue Garden', stages: [3], vignette: 'statue_garden',
    text: 'Dozens of adventurers,\nall turned to stone.',
    lines: [{ who: 'durgan', text: 'We will free you. All of you.' }],
    choices: [
      { label: 'Search the statues', icon: 'bag', out: (run, rng) => ({ text: 'Their gear is yours now.', gain: [[build(run, rng, ['weapon', 'amulet']), 3]] }) },
      { label: 'Chip a statue', icon: 'pickaxe', out: () => ({ text: 'Green-black stone.', gain: [['gorgonite', 2]] }) },
    ],
  },
];
// v4 name, and acts = stages for older readers
for (const e of SHRINES) e.acts = e.stages;
export const EVENTS = SHRINES;

/** Run a choice → outcome (does not change the run yet, except picks' then()). */
export function resolveChoice(run, ev, choice, rng) {
  if (choice.req) { const ok = choice.req(run); if (ok !== true) return { text: ok, blocked: true }; }
  return choice.out(run, rng) || {};
}

/** Apply an outcome to the run. → { items (added), overflow (didn't fit), fight, elite, learned (recipe id), upgrade } */
export function applyOutcome(run, out) {
  const res = { items: [], overflow: [], fight: out.fight || null, elite: !!out.elite, learned: null, upgrade: out.upgrade || null };
  if (out.maxHp) run.baseHp = (run.baseHp || 0) + out.maxHp;
  if (out.hp) { if (out.hp > 0) run.heal(out.hp); else run.hurt(-out.hp); }
  if (out.effect && run.addEffect) run.addEffect(out.effect);
  for (const [id, q] of out.gain || []) {
    if (!MATERIALS[id]) continue;
    const it = makeItem(id, q ?? 2);
    if (MATERIALS[id].tool && MATERIALS[id].tool.uses) it.uses = MATERIALS[id].tool.uses;
    (run.addItem(it) ? res.items : res.overflow).push(it);
  }
  if (out.learn) {
    const id = out.learn === 'random' || out.learn === true ? randomUnknownRecipe(run, run.rng, run.stage ?? 0) : out.learn;
    if (id) { learnRecipe(run, id); res.learned = id; }
  }
  return res;
}

/** v4: a weapon found in the world (kept for older scenes). */
export function foundWeapon(bp, ids, grade = 2, stone = 0, char = null) {
  const res = evaluate(bp, ids.map((id, i) => ({ id, q: 2, uid: 'found' + i })), { char });
  return { ...finalizeWeapon(res, grade, { char }), stone };
}
