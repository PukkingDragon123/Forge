// The Forglite crew. Each forger changes how forging, cooking and fighting play; the three you don't
// pick are turned to stone and, once rescued, join you as companions (docs/REDESIGN.md §5.6).
//   perks: [{ icon, name, short (≤ 6 words) }] · companion: { icon, short } · barks: one tiny line per moment
// v5 (docs/REDESIGN.md §7): weapon (starting weapon item, equipped), start (bag items), base (stats in
//   human units, see systems/loadout.js), typeBonus { weaponType: stats }, statusMul, potionMul,
//   unlock: null (playable from the start) | how to free them. Only Durgan is unlocked at first.
const crew = (o) => ({ coins: 0, ...o, passives: o.perks.map((p) => ({ name: p.name, icon: p.icon, text: p.short })) });

export const CHARACTERS = {
  bran: crew({
    id: 'bran', name: 'Bran', title: 'The Blacksmith', hp: 90,
    color: '#e07a3a', ribbon: 'red',
    blurb: 'Big heart, bigger hammer.',
    perks: [
      { icon: 'hammer', name: 'Master Smith', short: 'Crafted weapons +1 quality.' },
      { icon: 'hammer', name: 'Forge Arm', short: 'Hammers and swords hit harder.' },
      { icon: 'ore', name: 'Prospector', short: '+20% ore from stone.' },
    ],
    companion: { icon: 'hammer', short: 'Free forge. +10% damage.' },
    start: ['pickaxe', 'iron', 'healing_potion', 'coal'],
    weapon: 'smith_hammer', base: { oreLuck: 20 }, typeBonus: { hammer: { dmg: 15 }, sword: { dmg: 10 } },
    unlock: 'Free him from Grand Puffcap.',
    blueprints: ['sword', 'hammer', 'axe'],
    playstyle: 'Big alloys and perfect hammering.',
    model: { skin: '#f0c09a', hair: '#7a3a1e', cloth: '#4a5a6e', apron: '#5a3a24', accent: '#c8743a', eyes: '#3a7a5a' },
    barks: {
      start: ['Hammer\'s warm. Let\'s go.'], mine: ['Listen to that ring!'], forge: ['Feel the heat!'],
      win: ['Good steel never lies.'], hurt: ['Oof!'], shatter: ['She was a beauty…'], cook: ['Smells like home.'],
    },
  }),
  elio: crew({
    id: 'elio', name: 'Elio', title: 'The Elemental Mage', hp: 75,
    color: '#5aa0ff', ribbon: 'blue',
    blurb: 'Hand-me-down robes. Best friend: Kindle.',
    perks: [
      { icon: 'rune', name: 'Attunement', short: 'Status effects 50% likelier.' },
      { icon: 'fire', name: 'Spellwright', short: 'Skills recharge 20% faster.' },
      { icon: 'staff', name: 'Staff Adept', short: 'Staffs hit 15% harder.' },
    ],
    companion: { icon: 'fire', short: 'Kindle casts. Free enchant.' },
    start: ['pickaxe', 'ember', 'healing_potion', 'glowcap'],
    weapon: 'ember_staff', base: { skillCd: 20 }, statusMul: 1.5, typeBonus: { staff: { dmg: 15 } },
    unlock: 'Free him from Glasscoil.',
    blueprints: ['staff', 'dagger', 'sword'],
    playstyle: 'Mix elements; let Kindle help.',
    model: { skin: '#f0c8a0', hair: '#e8e0ff', cloth: '#3a4aa0', apron: '#2a2a6a', accent: '#ffd25e', eyes: '#5a8aff' },
    barks: {
      start: ['Kindle, light the way!'], mine: ['Ooh, it\'s humming!'], forge: ['Please don\'t explode…'],
      win: ['We did it!'], hurt: ['My hat!'], shatter: ['Kindle, don\'t look.'], cook: ['Is it supposed to glow?'],
    },
  }),
  durgan: crew({
    id: 'durgan', name: 'Durgan', title: 'The Gnome Warrior', hp: 110,
    color: '#7aa04a', ribbon: 'green',
    blurb: 'Three feet of beard and armour. Camp cook.',
    perks: [
      { icon: 'shield', name: 'Iron Beard', short: '+2 armor.' },
      { icon: 'axe', name: 'Heavy Hands', short: 'Axes and hammers +15% damage.' },
      { icon: 'campfire', name: 'Camp Cook', short: 'Potions heal 50% more.' },
    ],
    companion: { icon: 'shield', short: 'Blocks a hit. Tastier stews.' },
    start: ['pickaxe', 'healing_potion', 'glowcap', 'spore_sac', 'spore_sac'],
    weapon: 'stone_axe', base: { armor: 2 }, typeBonus: { axe: { dmg: 15 }, hammer: { dmg: 15 } }, potionMul: 1.5,
    unlock: null,
    blueprints: ['axe', 'hammer', 'spear'],
    playstyle: 'Tank hits, cook well, hit hard.',
    model: { skin: '#e8b088', hair: '#c8743a', cloth: '#5a6a7a', apron: '#3a4a5a', accent: '#c8a040', eyes: '#2a1a1a' },
    barks: {
      start: ['BEARD FIRST!'], mine: ['Proper rock, this.'], forge: ['Bigger. BIGGER.'],
      win: ['HAH! Next!'], hurt: ['Barely a scratch!'], shatter: ['Beards are forever.'], cook: ['Secret ingredient: more.'],
    },
  }),
  clover: crew({
    id: 'clover', name: 'Clover', title: 'The Rabbit Rogue', hp: 70,
    color: '#ff8ab0', ribbon: 'purple',
    blurb: 'Quick paws, long ears, sticky fingers.',
    perks: [
      { icon: 'crit', name: 'Lucky Paw', short: '+10% crit chance.' },
      { icon: 'speed', name: 'Quick Feet', short: 'Moves 10% faster.' },
      { icon: 'gem', name: 'Treasure Nose', short: '+25% loot.' },
    ],
    companion: { icon: 'star', short: 'Throws knives. Scouts the map.' },
    start: ['pickaxe', 'lantern', 'healing_potion', 'starfruit'],
    weapon: 'twin_daggers', base: { crit: 10, moveSpd: 10, lootLuck: 25 }, typeBonus: { dagger: { dmg: 10 } },
    unlock: 'Free her from Cinderfang.',
    blueprints: ['dagger', 'sword', 'spear'],
    playstyle: 'Fast crits and lots of loot.',
    model: { skin: '#fff0e8', hair: '#f8f0f0', cloth: '#5a3a5a', apron: '#e04a6a', accent: '#ffd23a', eyes: '#c83a6a' },
    barks: {
      start: ['I smell treasure!'], mine: ['Shiny! Mine!'], forge: ['Make it pointy!'],
      win: ['Too easy~'], hurt: ['Eep!'], shatter: ['Easy come, easy go!'], cook: ['Carrots? No? Fine.'],
    },
  }),
};
export const CHARACTER_ORDER = ['bran', 'elio', 'durgan', 'clover'];
/** v5: the hero you start with; the others are freed from the stage bosses in this order. */
export const STARTER_HERO = 'durgan';
export const RESCUE_ORDER = ['bran', 'elio', 'clover'];
