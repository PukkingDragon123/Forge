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
