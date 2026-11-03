// The Forglite crew. Each forger changes how forging, cooking and fighting play; the three you don't
// pick are turned to stone and, once rescued, join you as companions (docs/REDESIGN.md §5.6).
//   perks: [{ icon, name, short (≤ 6 words) }] · companion: { icon, short } · barks: one tiny line per moment
const crew = (o) => ({ coins: 0, ...o, passives: o.perks.map((p) => ({ name: p.name, icon: p.icon, text: p.short })) });

export const CHARACTERS = {
  bran: crew({
    id: 'bran', name: 'Bran', title: 'The Blacksmith', hp: 80,
    color: '#e07a3a', ribbon: 'red',
    blurb: 'Big heart, bigger hammer.',
    perks: [
      { icon: 'hammer', name: 'Master Smith', short: 'Metals give 1.5× Chips.' },
      { icon: 'star', name: 'Perfect Rhythm', short: 'Perfect hammer blows add Mult.' },
      { icon: 'ore', name: 'Salvage', short: 'Crumbled blades leave scrap.' },
    ],
    companion: { icon: 'hammer', short: 'Free forge. +10% damage.' },
    start: ['iron', 'iron', 'copper', 'coal', 'cave_moss', 'fern_root'],
    blueprints: ['sword', 'hammer', 'axe'],
    playstyle: 'Big alloys and perfect hammering.',
    model: { skin: '#f0c09a', hair: '#7a3a1e', cloth: '#4a5a6e', apron: '#5a3a24', accent: '#c8743a', eyes: '#3a7a5a' },
    barks: {
      start: ['Hammer\'s warm. Let\'s go.'], mine: ['Listen to that ring!'], forge: ['Feel the heat!'],
      win: ['Good steel never lies.'], hurt: ['Oof!'], shatter: ['She was a beauty…'], cook: ['Smells like home.'],
    },
  }),
  elio: crew({
    id: 'elio', name: 'Elio', title: 'The Elemental Mage', hp: 65,
    color: '#5aa0ff', ribbon: 'blue',
    blurb: 'Hand-me-down robes. Best friend: Kindle.',
    perks: [
      { icon: 'rune', name: 'Attunement', short: 'Elements stack twice as high.' },
      { icon: 'fire', name: 'Kindle', short: 'Kindle casts every 3 seconds.' },
      { icon: 'staff', name: 'Spellwright', short: 'Staffs get +3 Mult.' },
    ],
    companion: { icon: 'fire', short: 'Kindle casts. Free enchant.' },
    start: ['ember', 'rime', 'storm', 'copper', 'quartz', 'frost_lily', 'glowcap'],
    blueprints: ['staff', 'dagger', 'sword'],
    playstyle: 'Mix elements; let Kindle help.',
    model: { skin: '#f0c8a0', hair: '#e8e0ff', cloth: '#3a4aa0', apron: '#2a2a6a', accent: '#ffd25e', eyes: '#5a8aff' },
    barks: {
      start: ['Kindle, light the way!'], mine: ['Ooh, it\'s humming!'], forge: ['Please don\'t explode…'],
      win: ['We did it!'], hurt: ['My hat!'], shatter: ['Kindle, don\'t look.'], cook: ['Is it supposed to glow?'],
    },
  }),
  durgan: crew({
    id: 'durgan', name: 'Durgan', title: 'The Gnome Warrior', hp: 100,
    color: '#7aa04a', ribbon: 'green',
    blurb: 'Three feet of beard and armour. Camp cook.',
    perks: [
      { icon: 'shield', name: 'Bulwark', short: 'Wider guard and parry windows.' },
      { icon: 'campfire', name: 'Camp Cook', short: 'Stews are 50% stronger.' },
      { icon: 'axe', name: 'Heavy Hands', short: 'Axes and hammers +2 Mult.' },
    ],
    companion: { icon: 'shield', short: 'Blocks a hit. Tastier stews.' },
    start: ['iron', 'tin', 'bone', 'bone', 'beetle_shell', 'honeycomb', 'fern_root', 'stone_salt'],
    blueprints: ['axe', 'hammer', 'spear'],
    playstyle: 'Tank hits, cook well, hit hard.',
    model: { skin: '#e8b088', hair: '#c8743a', cloth: '#5a6a7a', apron: '#3a4a5a', accent: '#c8a040', eyes: '#2a1a1a' },
    barks: {
      start: ['BEARD FIRST!'], mine: ['Proper rock, this.'], forge: ['Bigger. BIGGER.'],
      win: ['HAH! Next!'], hurt: ['Barely a scratch!'], shatter: ['Beards are forever.'], cook: ['Secret ingredient: more.'],
    },
  }),
  clover: crew({
    id: 'clover', name: 'Clover', title: 'The Rabbit Rogue', hp: 60,
    color: '#ff8ab0', ribbon: 'purple',
    blurb: 'Quick paws, long ears, sticky fingers.',
    perks: [
      { icon: 'crit', name: 'Lucky Paw', short: 'More crits, harder crits.' },
      { icon: 'dagger', name: 'Quick Blades', short: 'Daggers strike twice.' },
      { icon: 'gem', name: 'Treasure Nose', short: 'More loot from stone.' },
    ],
    companion: { icon: 'star', short: 'Throws knives. Scouts the map.' },
    start: ['copper', 'copper', 'silver', 'rusty_key', 'starfruit', 'cave_moss'],
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
