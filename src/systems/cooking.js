// Cooking at camp (docs/REDESIGN.md §5.5). Drop 2–4 cookable things in the pot:
//   • an exact named mix (data/stews.js) gives that stew's effects;
//   • anything else gives a plain stew: the sum of each ingredient's `cook` effects, seasoned by salt.
// Durgan (hero or companion) makes every stew 50% stronger. heal/maxHp apply at once; the rest last
// for the stew's number of fights (a run buff).
import { MATERIALS } from '../data/materials.js';
import { STEWS, STEW_FX, STEW_FX_ORDER } from '../data/stews.js';

export const POT_MIN = 2, POT_MAX = 4;
const LASTING = ['dmg', 'guard', 'stoneResist', 'loot', 'regen'];

/** Can this bag item go in the pot? */
export function isCookable(it) { const m = it && MATERIALS[it.id]; return !!(m && m.cook); }

/** The named stew whose ingredients are exactly these items, if any. */
export function stewFor(items) {
  const key = items.map((i) => i.id).sort().join();
  return Object.values(STEWS).find((s) => [...s.ings].sort().join() === key) || null;
}

function durganBonus(run) { return run && (run.char === 'durgan' || (run.companions || []).includes('durgan')) ? 1.5 : 1; }

/**
 * What these ingredients would make — no side effects.
 * → { valid, name, recipe (stew id|null), known, effects: {heal, maxHp, dmg, …}, fights, icon, color, lines }
 */
export function previewStew(run, items) {
  const cookable = items.filter(isCookable);
  const out = { valid: cookable.length >= POT_MIN && cookable.length === items.length && items.length <= POT_MAX, name: 'Stew', recipe: null, known: false, effects: {}, fights: 0, icon: 'campfire', color: '#c8843a', lines: [] };
  if (!items.length) { out.name = 'Empty pot'; return out; }
  const k = durganBonus(run);
  const named = stewFor(items);
  let fx;
  if (named) {
    out.recipe = named.id; out.name = named.name; out.icon = named.icon; out.color = named.color;
    out.known = !!(run && run.stews && run.stews.includes(named.id));
    fx = { ...named.effects };
    out.fights = named.fights;
  } else {
    fx = {};
    let salt = 0;
    for (const it of cookable) {
      const c = MATERIALS[it.id].cook;
      for (const [key, v] of Object.entries(c)) { if (key === 'salt') salt += v; else fx[key] = (fx[key] || 0) + v; }
    }
    const season = 1 + 0.25 * salt;
    for (const key of Object.keys(fx)) fx[key] *= season;
    out.fights = LASTING.some((key) => fx[key]) ? 2 + (cookable.length >= 3 ? 1 : 0) : 0;
    const top = STEW_FX_ORDER.filter((key) => fx[key]).sort((a, b) => fx[b] / weight(b) - fx[a] / weight(a))[0];
    out.name = PLAIN[top] || 'Camp Stew';
    out.icon = top ? STEW_FX[top].icon : 'campfire';
  }
  for (const key of Object.keys(fx)) out.effects[key] = Math.round(fx[key] * k);
  out.lines = effectLines(out.effects, out.fights);
  return out;
}
const weight = (key) => ({ heal: 10, maxHp: 3, dmg: 10, guard: 20, stoneResist: 20, loot: 20, regen: 1 }[key] || 10);
const PLAIN = { heal: 'Warm Stew', maxHp: 'Thick Stew', dmg: 'Spicy Stew', guard: 'Steady Stew', stoneResist: 'Bitter Stew', loot: 'Lucky Stew', regen: 'Green Stew' };

/** Short UI lines for a set of effects: [{ icon, text }] (text uses colour tags). */
export function effectLines(effects, fights = 0) {
  const lines = [];
  for (const key of STEW_FX_ORDER) {
    const v = effects[key];
    if (!v) continue;
    const f = STEW_FX[key];
    lines.push({ icon: f.icon, text: `{${f.tag}}${f.label(v)}{/}` + (LASTING.includes(key) && fights ? ` · ${fights} fights` : '') });
  }
  return lines;
}

/**
 * Cook: removes the items from the run's bag, applies heal/maxHp now, adds a buff for the lasting
 * effects, learns a named stew. → the preview result plus { fresh (newly discovered), healed }.
 */
export function cook(run, items) {
  const res = previewStew(run, items);
  if (!res.valid) return { ...res, ok: false };
  for (const it of items) run.removeItem(it);
  const e = res.effects;
  if (e.maxHp) { run.maxHp += e.maxHp; run.hp += e.maxHp; }
  const healed = e.heal ? run.heal(e.heal) : 0;
  const lasting = {};
  for (const key of LASTING) if (e[key]) lasting[key] = e[key];
  if (res.fights && Object.keys(lasting).length) run.addBuff({ id: res.recipe || 'stew', name: res.name, icon: res.icon, color: res.color, fights: res.fights, ...lasting });
  let fresh = false;
  if (res.recipe && !run.stews.includes(res.recipe)) { run.stews.push(res.recipe); fresh = true; }
  run.stats.stews = (run.stats.stews || 0) + 1;
  return { ...res, ok: true, fresh, healed };
}

/** Recipe book entries: every named stew, with whether this run knows it. */
export function stewBook(run) {
  return Object.values(STEWS).map((s) => ({ ...s, known: run.stews.includes(s.id) }));
}
