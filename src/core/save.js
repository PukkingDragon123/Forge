// Persistent meta-progression + settings in localStorage (defensive: storage may be unavailable).

const KEY = 'forglite.save.v1';

const DEFAULT = () => ({
  version: 1,
  settings: { master: 0.8, music: 0.6, sfx: 0.9, shake: 1, travelSpeed: 1, pixelScale: 0, hints: true },
  stats: { runs: 0, wins: 0, deaths: 0, bestRegion: 0, weaponsShattered: 0, masterworks: 0, monsters: 0, oresMined: 0 },
  discovered: { recipes: [], materials: [], synergies: [], monsters: [], events: [] },
  unlocks: { materials: [], events: [], story: [] },
  seen: { intro: false, tips: {} },
  winsBy: {},
});

let data = null;

function merge(base, over) {
  for (const k in over) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') merge(base[k], over[k]);
    else base[k] = over[k];
  }
  return base;
}

export const save = {
  load() {
    data = DEFAULT();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) merge(data, JSON.parse(raw));
    } catch (e) { /* storage blocked — play without persistence */ }
    return data;
  },
  get data() { return data || this.load(); },
  write() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  },
  /** Add a value to a persistent list; returns true if it was new. */
  learn(list, id) {
    const path = list.split('.');
    let o = this.data;
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    const arr = o[path[path.length - 1]];
    if (arr.includes(id)) return false;
    arr.push(id);
    this.write();
    return true;
  },
  knows(list, id) {
    const path = list.split('.');
    let o = this.data;
    for (const p of path) o = o[p];
    return o.includes(id);
  },
  reset() { data = DEFAULT(); this.write(); },
};
