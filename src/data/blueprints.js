// Weapon & tool frames. A blueprint sets base Chips/Mult, swing speed, slots, crit and harvest,
// plus the rhythm pattern used by the hammering minigame (beats in 8th notes).
export const BLUEPRINTS = {
  dagger: {
    id: 'dagger', name: 'Dagger', icon: 'dagger', chips: 3, mult: 1, speed: 0.6, slots: 3, crit: 2.5, harvest: 3,
    desc: 'Fast and precise. Carves monsters beautifully.', rhythm: [0, 1, 2, 3, 4, 6], bpm: 132,
  },
  sword: {
    id: 'sword', name: 'Sword', icon: 'sword', chips: 6, mult: 1, speed: 0.95, slots: 4, crit: 2, harvest: 2, parry: 1.2,
    desc: 'Balanced. Wider parry window.', rhythm: [0, 2, 3, 4, 6], bpm: 118,
  },
  axe: {
    id: 'axe', name: 'Axe', icon: 'axe', chips: 10, mult: 1, speed: 1.3, slots: 4, crit: 2, harvest: 2, bleed: 1,
    desc: 'Heavy chops. Every hit causes Bleed.', rhythm: [0, 2, 4, 5, 6], bpm: 108,
  },
  hammer: {
    id: 'hammer', name: 'Hammer', icon: 'hammer', chips: 16, mult: 1, speed: 1.8, slots: 5, crit: 2.5, harvest: 1, stun: 15,
    desc: 'Slow, crushing, stuns. Ignores 2 armor.', rhythm: [0, 2, 4, 6], bpm: 96, pierceFlat: 2,
  },
  spear: {
    id: 'spear', name: 'Spear', icon: 'spear', chips: 8, mult: 1, speed: 1.1, slots: 4, crit: 2, harvest: 2, firstStrike: true,
    desc: 'Reach: strikes once for free when the fight starts.', rhythm: [0, 1, 3, 4, 6], bpm: 112,
  },
  staff: {
    id: 'staff', name: 'Staff', icon: 'staff', chips: 4, mult: 2, speed: 1.15, slots: 4, crit: 2, harvest: 1, element: 1.5,
    desc: 'Elements are 50% stronger.', rhythm: [0, 2, 3, 5, 6], bpm: 104,
  },
  pickaxe: {
    id: 'pickaxe', name: 'Pickaxe', icon: 'pickaxe', slots: 3, tool: true, strikes: 0,
    desc: 'Adds strikes and effects to your next dig. Shatters afterwards.', rhythm: [0, 2, 4], bpm: 110,
  },
};
export const WEAPON_TYPES = ['dagger', 'sword', 'axe', 'hammer', 'spear', 'staff'];

/** Named secret weapons. ingredients: exact multiset of material ids (order free). */
export const RECIPES = {
  fangblade: {
    name: 'Fangblade', bp: 'sword', ings: ['iron', 'bat_fang', 'bat_fang'],
    bonus: { xmult: 1.5, lifesteal: 15 }, text: 'Drinks deep: {heal}+15% Lifesteal{/}, {xmult}×1.5{/}.',
    hint: 'A sword with two thirsty teeth.',
  },
  silkstring: {
    name: 'Silkstring Kris', bp: 'dagger', ings: ['silver', 'spider_silk', 'spider_silk'],
    bonus: { multi: 2, crit: 15 }, text: 'Strikes {good}3 times{/} per swing.',
    hint: 'Silver, and silk twice over, on a short blade.',
  },
  golembreaker: {
    name: 'Golem Breaker', bp: 'hammer', ings: ['golem_core', 'iron', 'iron', 'coal'],
    bonus: { xmult: 2, stun: 25, pierce: 1 }, text: 'Crushes armor. {good}+25% Stun{/}.',
    hint: 'A heart of stone, a body of steel.',
  },
  junkyard: {
    name: 'Junkyard King', bp: 'axe', ings: ['junk', 'junk', 'junk', 'junk'],
    bonus: { xmult: 3 }, text: 'Somehow… {xmult}×3 Mult{/}?!',
    hint: 'Four of the least wanted ores, on an axe.',
  },
  stormcaller: {
    name: 'Stormcaller', bp: 'spear', ings: ['storm', 'copper', 'copper', 'topaz'],
    bonus: { shock: 4, xmult: 1.5 }, text: 'Lightning arcs to the sky: {shock}+4 Shock{/}.',
    hint: 'A spear that loves copper and storms.',
  },
  prismedge: {
    name: 'Prism Edge', bp: 'sword', ings: ['quartz', 'ember', 'rime', 'storm'],
    bonus: { xmult: 2, fx: 'prismatic' }, text: 'Every element at once. {xmult}×2 more{/}.',
    hint: 'Clear crystal, plus fire, ice and storm.',
  },
  lockbreaker: {
    name: 'Lockbreaker', bp: 'axe', ings: ['rusty_key', 'bone', 'iron'],
    bonus: { firstCrit: 1, critDmg: 1, xmult: 1.5 }, text: 'Every lock opens. {crit}+1× Crit damage{/}.',
    hint: 'A key, a bone, and iron to bind them.',
  },
  mimicmaw: {
    name: "Mimic's Maw", bp: 'axe', ings: ['mimic_teeth', 'mimic_tongue', 'gold'],
    bonus: { greed: 4, xmult: 2 }, text: 'It eats gold. {gold}+4{@coin} per hit{/}.',
    hint: 'Teeth, tongue, and gold to feed them.',
  },
  frostfang: {
    name: 'Frostfang', bp: 'dagger', ings: ['rime', 'bat_fang', 'sapphire'],
    bonus: { ice: 3, lifesteal: 10, xmult: 1.5 }, text: 'Freezing bite. {ice}+3 Ice{/}.',
    hint: 'Cold shard, cold gem, warm fang.',
  },
  emberheart: {
    name: 'Emberheart Maul', bp: 'hammer', ings: ['magmasteel', 'fire_gland', 'brimstone', 'coal'],
    bonus: { fire: 4, xmult: 2 }, text: 'Explodes with every swing. {fire}+4 Fire{/}.',
    hint: 'Fire-forged steel, a dragon\'s gland, sulfur and coal.',
  },
  bonecrusher: {
    name: 'Ossuary', bp: 'hammer', ings: ['skull', 'bone', 'bone', 'fossil'],
    bonus: { xmult: 2.5 }, text: 'A hammer of the honored dead. {xmult}×2.5{/}.',
    hint: 'A skull, two bones and something even older.',
  },
  moonwhisper: {
    name: 'Moonwhisper', bp: 'staff', ings: ['moonstone', 'silver', 'wisp_essence'],
    bonus: { crit: 25, holy: 3, xmult: 1.5 }, text: 'Glows in the dark. {holy}+3 Holy{/}.',
    hint: 'Moon, silver and a wisp\'s light on a staff.',
  },
  cursebreaker: {
    name: 'Cursebreaker', bp: 'sword', ings: ['silver', 'silver', 'soulstone', 'stariron'],
    bonus: { holy: 6, xmult: 3 }, text: 'The only blade the Lord fears. {holy}+6 Holy{/} {xmult}×3{/}.',
    hint: 'Twin silver, a soul and a falling star.',
  },
};
