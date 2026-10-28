// Mystery events. Each choice returns an outcome the event scene resolves:
//   { text, gain:[[id,q]], coins, hp, maxHp, learn, qte:{kind:'mash'|'timing', label, win, lose}, fight, pick:{filter, verb, then(item)} }
// req(run) → true | 'reason it is unavailable'. pick.filter receives {...material, ...item}; then() receives the item.
import { matOf } from '../systems/items.js';

const hasItem = (run, pred) => run.bag.all().some(pred);
const firstItem = (run, pred) => run.bag.all().find(pred);

export const EVENTS = [
  {
    id: 'trapped_miner', title: 'Under the Rubble', regions: [0, 1, 2, 3], props: ['rubble', 'lantern'], npc: 'miner',
    text: 'A muffled voice under a heap of fallen timber: "Oi! Little help? I\'ve been here since Tuesday!" It is not clear which Tuesday.',
    choices: [
      { label: 'Lift the beam', hint: 'Mash STRIKE', out: () => ({ qte: { kind: 'mash', label: 'LIFT!', win: { text: 'With a mighty heave the beam rolls away. Old Gus dusts himself off and presses ore into your hands.', gain: [['iron', 3], ['silver', 2]], coins: 8 }, lose: { text: 'The beam slips and bonks you. You free him anyway; he gives you what he has.', hp: -8, gain: [['iron', 2]] } } }) },
      { label: 'Use a Blast Charge', req: (run) => hasItem(run, (i) => i.id === 'blast') || 'Needs a Blast Charge', out: (run) => { run.removeItem(firstItem(run, (i) => i.id === 'blast')); return { text: 'BOOM. Gus is free, if slightly crispy. "Take this — found it in a wall!"', gain: [['rune_mastery', 2], ['gold', 2]] }; } },
      { label: 'Leave him', out: () => ({ text: '"I\'ll remember this!" he shouts. You suspect he won\'t.' }) },
    ],
  },
  {
    id: 'workshop', title: 'Abandoned Workshop', regions: [0, 1, 3, 4], props: ['anvil', 'crate', 'books'],
    text: 'An old smithy carved into the rock. The anvil is still warm, as if someone just stepped out.',
    choices: [
      { label: 'Temper a material', hint: '+1 quality', out: () => ({ pick: { verb: 'Temper', filter: (it) => it.q < 4, then: (it) => { it.q++; return { text: 'You hammer out the impurities. It gleams.' }; } } }) },
      { label: 'Scavenge the shelves', out: (run, rng) => ({ text: 'Dusty, but useful.', gain: [[rng.pick(['blast', 'drill', 'scanner', 'flare']), 2], ['junk', 2], ['coal', 2]] }) },
      { label: 'Read the smith\'s journal', out: () => ({ text: 'The margins are full of sketches. One recipe is circled three times.', learn: true }) },
    ],
  },
  {
    id: 'cursed_door', title: 'The Cursed Door', regions: [2, 3, 4, 5], props: ['door', 'brazier'],
    text: 'A door of black stone, carved with the same runes you saw on the Lord\'s tomb. It hums. It is hungry.',
    choices: [
      { label: 'Unlock with a Bone Key', req: (run) => hasItem(run, (i) => i.id === 'bone_key' || i.id === 'golden_key') || 'Needs a Bone Key', out: (run, rng) => { run.removeItem(firstItem(run, (i) => i.id === 'bone_key' || i.id === 'golden_key')); return { text: 'The lock crumbles to dust. Inside: a forgotten hoard.', gain: [[rng.pick(['cursedore', 'voidcrystal', 'diamond', 'mithril']), 3], [rng.pick(['amethyst', 'ruby', 'sapphire']), 3]], coins: 30 }; } },
      { label: 'Pay in blood', hint: '-20% HP', out: (run, rng) => ({ text: 'You press your palm to the runes. They drink. The door grinds open.', hp: -Math.round(run.maxHp * 0.2), gain: [['cursedore', 3], [rng.pick(['gold', 'mithril', 'moonstone']), 3]] }) },
      { label: 'Walk away', out: () => ({ text: 'The humming follows you for a while.' }) },
    ],
  },
  {
    id: 'shell_game', title: 'Mister Mole\'s Shell Game', regions: [0, 1, 2, 3, 4, 5], props: ['mole', 'crate'], npc: 'mole',
    text: '"Step right up! Find the gem, double your coin! Totally fair! Mostly!" A mole in a waistcoat shuffles three walnut shells.',
    choices: [
      { label: 'Bet 10 coins', req: (run) => run.coins >= 10 || 'Needs 10 coins', out: (run) => { run.coins -= 10; return { qte: { kind: 'shells', label: 'Find the gem!', win: { text: '"Well I never!" The mole pays up, grumbling.', coins: 25 }, lose: { text: '"Ooh, so close!" The mole pockets your coins.' } } }; } },
      { label: 'Bet an ore', hint: 'random rarer ore', out: () => ({ pick: { verb: 'Wager', filter: (it) => ['ore', 'mineral', 'crystal'].includes(it.kind), then: (it, run, rng) => { run.removeItem(it); return rng.chance(0.55) ? { text: 'You win! The mole hands over something shinier.', gain: [[rng.pick(['gold', 'ruby', 'sapphire', 'topaz', 'mithril']), 3]] } : { text: 'Wrong shell. The mole bites your ore to check it\'s real.' }; } } }) },
      { label: 'Decline', out: () => ({ text: '"Your loss, friend!"' }) },
    ],
  },
  {
    id: 'scroll_niche', title: 'The Old Library Niche', regions: [3, 5, 1], props: ['books', 'statue'],
    text: 'Behind a fallen statue, a dry niche holds rolled scrolls tied with gold thread.',
    choices: [
      { label: 'Read the scrolls', out: () => ({ text: 'Ancient forging secrets! You commit one to memory.', learn: true }) },
      { label: 'Take a rune scroll', out: (run, rng) => ({ text: 'The ink glows faintly as you roll it up.', gain: [[rng.pick(['rune_echo', 'rune_haste', 'rune_mastery', 'rune_fury']), 2]] }) },
    ],
  },
  {
    id: 'mushroom_ring', title: 'Fairy Ring', regions: [2, 1], props: ['mushroom'],
    text: 'A perfect circle of glowing mushrooms. One of them is winking at you. Mushrooms should not wink.',
    choices: [
      { label: 'Eat the winking one', out: (run, rng) => { const r = rng.next(); if (r < 0.4) return { text: 'Delicious! You feel wonderful.', hp: 20 }; if (r < 0.7) return { text: 'You feel… sturdier. Permanently? For this run, anyway.', maxHp: 8, hp: 8 }; return { text: 'Blegh. Your tongue turns blue and so does your vision.', hp: -10 }; } },
      { label: 'Harvest the ring', out: () => ({ text: 'You gather the caps carefully.', gain: [['glowcap', 2], ['glowcap', 2], ['mushroom_cap', 2]] }) },
    ],
  },
  {
    id: 'rock_snail', title: 'Gravel the Snail', regions: [0, 1, 2, 3, 4], props: ['snail'], npc: 'snail',
    text: 'A snail the size of a wheelbarrow is licking the cave wall. It looks at your backpack with great interest.',
    choices: [
      { label: 'Feed it Junk Ore', req: (run) => hasItem(run, (i) => i.id === 'junk') || 'Needs Junk Ore', out: (run, rng) => { run.removeItem(firstItem(run, (i) => i.id === 'junk')); return { text: 'Crunch crunch crunch. The snail… poops out a gem. Thanks, Gravel!', gain: [[rng.pick(['amethyst', 'ruby', 'sapphire', 'emerald', 'topaz']), 3]] }; } },
      { label: 'Feed it anything', out: () => ({ pick: { verb: 'Feed', filter: () => true, then: (it, run, rng) => { run.removeItem(it); const tier = it.q >= 3 || ['rare', 'epic', 'legendary'].includes(matOf(it).rarity); return { text: tier ? 'Gravel glows with joy and produces something incredible.' : 'Gravel chews thoughtfully and produces… a geode.', gain: [[tier ? rng.pick(['diamond', 'mithril', 'moonstone']) : 'geode', 3]] }; } } }) },
      { label: 'Pet it', out: () => ({ text: 'Slimy. Worth it. You feel calmer.', hp: 6 }) },
    ],
  },
  {
    id: 'lake', title: 'The Still Lake', regions: [1, 2, 3], props: ['waterpool'],
    text: 'An underground lake so still it looks like a second cave upside down. Something glitters at the bottom.',
    choices: [
      { label: 'Fish for it', hint: 'Timing', out: (run, rng) => ({ qte: { kind: 'timing', label: 'REEL!', win: { text: 'You haul up a treasure!', gain: [[rng.pick(['sapphire', 'fossil', 'amber', 'moonstone', 'crystal_key']), 3]] }, lose: { text: 'You catch… an old boot. Full of junk ore, at least.', gain: [['junk', 1]] } } }) },
      { label: 'Drink and rest', out: (run) => ({ text: 'Cold and clean. You feel restored.', hp: Math.round(run.maxHp * 0.25) }) },
    ],
  },
  {
    id: 'forge_shrine', title: 'Shrine of the First Forge', regions: [3, 4, 5], props: ['statue', 'brazier'],
    text: 'A statue of a smith holding a hammer of white fire. An inscription: "Give, and be made stronger."',
    choices: [
      { label: 'Offer a material', hint: 'Next forge +1 grade', out: () => ({ pick: { verb: 'Offer', filter: (it) => it.rarity !== 'common', then: (it, run) => { run.removeItem(it); run.bonusGrade = (run.bonusGrade || 0) + 1; return { text: 'The fire flares. Your next weapon will be finer.' }; } } }) },
      { label: 'Pray', out: (run, rng) => (rng.chance(0.6) ? { text: 'Warmth spreads through you.', hp: 15 } : { text: 'Silence. The statue seems disappointed in you.' }) },
    ],
  },
  {
    id: 'spilled_cart', title: 'Spilled Minecart', regions: [0, 4, 1], props: ['minecart', 'rails'],
    text: 'A derailed minecart lies on its side, ore spilling out across the tracks.',
    choices: [
      { label: 'Grab what\'s on top', out: (run, rng) => ({ text: 'Easy pickings.', gain: [[rng.pick(['iron', 'copper', 'coal', 'tin']), 2], [rng.pick(['iron', 'copper', 'silver']), 2]] }) },
      { label: 'Dig under the cart', hint: 'Risky', out: (run, rng) => ({ qte: { kind: 'timing', label: 'DODGE!', win: { text: 'You roll clear as the cart shifts — clutching the good stuff.', gain: [['gold', 3], [rng.pick(['ruby', 'magmasteel', 'lodestone']), 3]] }, lose: { text: 'The cart rolls onto your foot. Ow. You grab one ore.', hp: -10, gain: [['silver', 2]] } } }) },
    ],
  },
  {
    id: 'echo', title: 'A Voice in the Dark', regions: [2, 3, 4, 5], props: ['brazier'],
    text: '"Little smith… why struggle? Every blade you make, I break. Stay. Rest. Be stone." The voice is everywhere.',
    choices: [
      { label: 'Defy him', out: (run) => { run.flags.courage = 2; return { text: '"WE\'LL SEE!" you shout. Your heart pounds. Your next two fights start with a full Special.' }; } },
      { label: 'Listen closely', out: () => ({ text: 'Between the threats, you hear something else: he fears holy silver.', learn: 'cursebreaker' }) },
    ],
  },
  {
    id: 'friends_note', title: 'A Note from Camp', regions: [0, 1, 2, 3, 4, 5], props: ['lantern', 'backpack'],
    text: 'Pinned to a support beam with a dagger, a scrap of paper in four different handwritings: "Come back safe. We saved you soup."',
    choices: [
      { label: 'Read it again', out: (run) => ({ text: 'You smile. You walk a little taller.', hp: 12 }) },
      { label: 'Keep the dagger', out: () => ({ text: 'It\'s Clover\'s. She\'ll want it back. Probably.', gain: [['silver', 2], ['rune_fury', 2]] }) },
    ],
  },
  {
    id: 'bat_swarm', title: 'The Swarm', regions: [0, 1, 4], props: ['stalactite'],
    text: 'The ceiling is moving. Thousands of bats, all waking up at once.',
    choices: [
      { label: 'Duck and run', hint: 'Mash STRIKE', out: () => ({ qte: { kind: 'mash', label: 'RUN!', win: { text: 'You sprint through untouched — and snag a few fangs that fell.', gain: [['bat_fang', 2], ['bat_wing', 2]] }, lose: { text: 'You get nibbled. A lot.', hp: -9, gain: [['bat_fang', 2]] } } }) },
      { label: 'Hold still', out: (run, rng) => (rng.chance(0.5) ? { text: 'They pass you by like a black river.' } : { text: 'One lands on your head and steals something shiny.', coins: -8 }) },
    ],
  },
  {
    id: 'hot_spring', title: 'Hot Spring', regions: [4, 2], props: ['waterpool'],
    text: 'Steam curls over a turquoise pool. It smells of sulfur and very good decisions.',
    choices: [
      { label: 'Soak', out: (run) => ({ text: 'Bliss. Every ache melts away.', hp: Math.round(run.maxHp * 0.35) }) },
      { label: 'Temper a metal in the vent', out: () => ({ pick: { verb: 'Temper', filter: (it) => it.tags && it.tags.includes('metal') && it.q < 4, then: (it) => { it.q = Math.min(4, it.q + 2); return { text: 'The volcanic heat purifies the metal: +2 quality!' }; } } }) },
    ],
  },
  {
    id: 'spider_nest', title: 'The Nest', regions: [1, 2], props: ['silk'],
    text: 'White silk curtains the tunnel, heavy with dew. Something big is asleep in the middle.',
    choices: [
      { label: 'Burn it (Ember Crystal)', req: (run) => hasItem(run, (i) => i.id === 'ember') || 'Needs an Ember Crystal', out: (run) => { run.removeItem(firstItem(run, (i) => i.id === 'ember')); return { text: 'The nest goes up like paper. You collect the fireproof threads.', gain: [['spider_silk', 3], ['spider_silk', 3], ['venom_sac', 2]] }; } },
      { label: 'Steal the silk quietly', hint: 'Timing', out: () => ({ qte: { kind: 'timing', label: 'SNIP!', win: { text: 'Snip, snip… got it.', gain: [['spider_silk', 2], ['spider_silk', 2]] }, lose: { text: 'Eight eyes open.', fight: 'silk_spider' } } }) },
      { label: 'Go around', out: () => ({ text: 'Discretion is the better part of not being eaten.' }) },
    ],
  },
  {
    id: 'kobold_trader', title: 'The Kobold\'s Trade', regions: [0, 1, 4], props: ['crate', 'lantern'], npc: 'kobold',
    text: 'A kobold with an enormous backpack waves its lantern. "Swap? Swap swap? One thing for one better thing! Kobold promise!"',
    choices: [
      { label: 'Swap an item', out: () => ({ pick: { verb: 'Swap', filter: () => true, then: (it, run, rng) => { run.removeItem(it); const pool = ['gold', 'mithril', 'ruby', 'sapphire', 'golem_core', 'rune_echo', 'golden_key', 'moonstone']; return { text: '"Good swap! Kobold happy!"', gain: [[rng.pick(pool), Math.min(4, it.q + 1)]] }; } } }) },
      { label: 'Shoo it away', out: () => ({ text: '"Hmph! Kobold remember!" It scurries off.' }) },
    ],
  },
];

export const eventById = (id) => EVENTS.find((e) => e.id === id);
