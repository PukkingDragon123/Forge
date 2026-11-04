// Crafted skills (docs/REDESIGN.md §7). Two skill slots; each skill is a gem item (data/items.js
// `skill_<id>`). Agent P implements the effects in the action engine, keyed by id, reading `params`.
//   { id, name, icon, color, cd (s), desc (≤ 8 words), aim: 'self'|'dir'|'target'|'dash', params }
// params units: metres, seconds, damage per hit/tick (scaled by the player's dmg stat), chances 0..1
export const SKILLS = {
  spore_burst: {
    id: 'spore_burst', name: 'Spore Burst', icon: 'poison', color: '#8ad04a', cd: 7, aim: 'self',
    desc: 'Poison cloud around you.',
    params: { radius: 2.6, dur: 4, tick: 0.5, dmg: 4, poison: 3, slow: 0.2 },
  },
  stone_spikes: {
    id: 'stone_spikes', name: 'Stone Spikes', icon: 'block', color: '#9a9a90', cd: 6, aim: 'dir',
    desc: 'Spikes erupt in a line.',
    params: { length: 6.5, width: 1.1, count: 6, delay: 0.06, dmg: 22, stun: 0.5, kb: 0.8 },
  },
  ember_dash: {
    id: 'ember_dash', name: 'Ember Dash', icon: 'fire', color: '#ff7a2a', cd: 9, aim: 'dash',
    desc: 'Dashes leave burning trails.',
    params: { dur: 6, trailLife: 2.4, trailWidth: 0.9, tick: 0.4, dmg: 5, burn: 2 },
  },
  shield_bash: {
    id: 'shield_bash', name: 'Shield Bash', icon: 'shield', color: '#ffd25e', cd: 5, aim: 'dir',
    desc: 'Stun everything in front.',
    params: { range: 2.6, angle: 80, dmg: 16, stun: 1.4, kb: 2.4, lunge: 1.2 },
  },
  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind', icon: 'axe', color: '#c8ccd8', cd: 8, aim: 'self',
    desc: 'Spin, hitting all around.',
    params: { radius: 2.3, dur: 1.4, ticks: 7, dmg: 8, moveMul: 0.6, kb: 0.6 },
  },
  frost_nova: {
    id: 'frost_nova', name: 'Frost Nova', icon: 'ice', color: '#bfe8ff', cd: 10, aim: 'self',
    desc: 'Freeze a ring of foes.',
    params: { radius: 3.6, dmg: 12, freeze: 1.8, slowAfter: 2 },
  },
  chain_spark: {
    id: 'chain_spark', name: 'Chain Spark', icon: 'shock', color: '#ffe85a', cd: 6, aim: 'target',
    desc: 'Lightning leaps foe to foe.',
    params: { range: 7, jumps: 4, jumpRange: 4.5, dmg: 15, falloff: 0.85, stun: 0.25 },
  },
  root_snare: {
    id: 'root_snare', name: 'Root Snare', icon: 'harvest', color: '#9ad86a', cd: 9, aim: 'target',
    desc: 'Roots hold foes in place.',
    params: { range: 6, radius: 2.8, hold: 2.4, tick: 0.5, dmg: 3 },
  },
  gem_shards: {
    id: 'gem_shards', name: 'Gem Shards', icon: 'gem', color: '#c08aff', cd: 5, aim: 'dir',
    desc: 'A fan of piercing shards.',
    params: { count: 7, spread: 55, speed: 15, range: 9, dmg: 10, pierce: 2 },
  },
  mushroom_turret: {
    id: 'mushroom_turret', name: 'Mushroom Turret', icon: 'monster', color: '#d04a3a', cd: 14, aim: 'self',
    desc: 'Plant a spore-spitting turret.',
    params: { dur: 9, rate: 1.1, range: 7, dmg: 7, poison: 1, hp: 40 },
  },
};
export const SKILL_IDS = Object.keys(SKILLS);
export const skillOf = (id) => SKILLS[id] || null;
