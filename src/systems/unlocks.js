// Meta progression: no stats carry over — only new materials, recipes, events and story scenes.
import { save } from '../core/save.js';
import { MATERIALS } from '../data/materials.js';

const RULES = {
  reach3: { test: (d) => d.stats.bestRegion >= 3, text: 'Reach the Sunken Halls' },
  reach5: { test: (d) => d.stats.bestRegion >= 5, text: 'Reach the Forbidden Tomb' },
  win1: { test: (d) => d.stats.wins >= 1, text: 'Break the curse once' },
  masterwork: { test: (d) => d.stats.masterworks >= 1, text: 'Hammer a Masterwork' },
  prismatic: { test: (d) => d.discovered.synergies.includes('prismatic'), text: 'Trigger PRISMATIC' },
  shatter30: { test: (d) => d.stats.weaponsShattered >= 30, text: 'Shatter 30 weapons' },
};

export function unlockedMaterial(id) {
  const m = MATERIALS[id];
  if (!m || !m.unlock) return true;
  return save.data.unlocks.materials.includes(id);
}
export function unlockHint(id) { const m = MATERIALS[id]; return m && m.unlock ? RULES[m.unlock].text : ''; }

/** Check all rules; returns newly unlocked material ids. */
export function checkUnlocks() {
  const d = save.data;
  const fresh = [];
  for (const m of Object.values(MATERIALS)) {
    if (!m.unlock || d.unlocks.materials.includes(m.id)) continue;
    if (RULES[m.unlock] && RULES[m.unlock].test(d)) { d.unlocks.materials.push(m.id); fresh.push(m.id); }
  }
  if (fresh.length) save.write();
  return fresh;
}

/** Story scenes unlocked by reaching regions (shown at the campfire). */
export const STORY = [
  { id: 'story0', region: 0, title: 'The Seal', need: 0 },
  { id: 'story1', region: 1, title: 'Light Below', need: 1 },
  { id: 'story2', region: 2, title: 'The Forest Underground', need: 2 },
  { id: 'story3', region: 3, title: 'The First Miners', need: 3 },
  { id: 'story4', region: 4, title: 'Heart of the Mountain', need: 4 },
  { id: 'story5', region: 5, title: 'The Lord\'s Name', need: 5 },
  { id: 'ending', region: 6, title: 'Morning', need: 6 },
];

// ---------------------------------------------------------------- v5: heroes and save keys
// Only the warrior is playable at first; each stage boss frees one friend, who becomes playable.
// Save keys (added here at runtime; the integrator can add them to the save DEFAULT):
//   save.data.unlocks.heroes: ['durgan', …] · save.data.discovered.craft: [recipe ids] (the recipe book)
//   save.data.discovered.items: [material ids seen] · save.data.seen.tutorial: bool
//   save.data.stats.statues / crafted / bestStage
import { STARTER_HERO, RESCUE_ORDER, CHARACTERS } from '../data/characters.js';

export function ensureSaveV5() {
  const d = save.data;
  d.unlocks = d.unlocks || { materials: [], events: [], story: [] };
  if (!Array.isArray(d.unlocks.heroes)) d.unlocks.heroes = [STARTER_HERO];
  if (!d.unlocks.heroes.includes(STARTER_HERO)) d.unlocks.heroes.unshift(STARTER_HERO);
  d.discovered = d.discovered || {};
  for (const k of ['craft', 'items', 'stews', 'recipes', 'materials', 'synergies', 'monsters', 'events']) if (!Array.isArray(d.discovered[k])) d.discovered[k] = [];
  d.seen = d.seen || { intro: false, tips: {} };
  if (typeof d.seen.tutorial !== 'boolean') d.seen.tutorial = false;
  d.stats = d.stats || {};
  for (const k of ['statues', 'crafted', 'bestStage', 'runs', 'wins', 'deaths']) if (typeof d.stats[k] !== 'number') d.stats[k] = 0;
  return d;
}
export function unlockedHeroes() { return ensureSaveV5().unlocks.heroes.filter((id) => CHARACTERS[id]); }
export function heroUnlocked(id) { return unlockedHeroes().includes(id); }
/** Unlock a hero for future runs; returns true when new. */
export function unlockHero(id) {
  const d = ensureSaveV5();
  if (!CHARACTERS[id] || d.unlocks.heroes.includes(id)) return false;
  d.unlocks.heroes.push(id);
  save.write();
  return true;
}
/** The friend stage `stage`'s boss holds for this hero (null on the last stage). */
export function friendForStage(heroId, stage) {
  // playing as a freed friend: Durgan takes their place in the rescue order
  const order = RESCUE_ORDER.map((id) => (id === heroId ? STARTER_HERO : id));
  return order[stage] || null;
}
/** How a locked hero is unlocked (for the title). */
export function unlockHintFor(id) { return CHARACTERS[id] ? CHARACTERS[id].unlock || '' : ''; }
