// v5 crafting (docs/REDESIGN.md §7): put ingredients in ORDER at a station. The exact order crafts the
// item (and teaches the recipe if you didn't know it); the right ingredients in the wrong order only
// earn a hint ("2 in place, 1 misplaced"). Recipe Pages found as loot teach a recipe; the recipe book
// is remembered between runs.
//
//   craft(run, ordered, station?) → { ok, out (item), recipe (id), newRecipe, placed, partial, hint, consumed }
//   craftPreview(run, ordered, station?) → same shape, nothing changes
//   recipeBook(run, station?) → [{ id, recipe, known, have (all ingredients in the bag), missing [ids], out (material) }]
//   learnRecipe(run, id) → true if new · readRecipePage(run, item) → { id, new } · knownRecipes(run) → [ids]
//   randomUnknownRecipe(run, rng, stage?) → id | null (never a hidden one) · usedIn(materialId) → [recipe ids]
import { CRAFT } from '../data/recipes.js';
import { MATERIALS } from '../data/materials.js';
import { save } from '../core/save.js';
import { makeItem } from './items.js';

export { CRAFT as RECIPES, STATIONS } from '../data/recipes.js';

const book = () => {
  const d = save.data.discovered;
  if (!Array.isArray(d.craft)) d.craft = [];
  return d.craft;
};
const key = (ids) => ids.slice().sort().join('|');
const BY_SET = new Map(Object.entries(CRAFT).map(([id, r]) => [key(r.ings), id]));
const BY_ORDER = new Map(Object.entries(CRAFT).map(([id, r]) => [r.ings.join('>'), id]));
const idOf = (x) => (typeof x === 'string' ? x : x && x.id);

/** Ids of the recipes this run knows (start recipes + the persistent book + pages read this run). */
export function knownRecipes(run) {
  const set = new Set(Object.keys(CRAFT).filter((id) => CRAFT[id].known));
  for (const id of book()) if (CRAFT[id]) set.add(id);
  for (const id of (run && run.recipesKnown) || []) if (CRAFT[id]) set.add(id);
  return [...set];
}
export const isKnown = (run, id) => knownRecipes(run).includes(id);

export function learnRecipe(run, id) {
  if (!CRAFT[id]) return false;
  const fresh = !isKnown(run, id);
  if (run && run.recipesKnown && !run.recipesKnown.includes(id)) run.recipesKnown.push(id);
  if (!book().includes(id)) { book().push(id); save.write(); }
  return fresh;
}

/** Read a Recipe Page item (removes it from the bag). */
export function readRecipePage(run, item) {
  let id = item && item.recipe;
  if (!id || !CRAFT[id]) id = randomUnknownRecipe(run, run.rng, run.stage);
  if (run && item) run.removeItem(item);
  if (!id) return { id: null, new: false };
  return { id, new: learnRecipe(run, id) };
}

export function randomUnknownRecipe(run, rng, stage = 0) {
  const known = new Set(knownRecipes(run));
  const pool = Object.entries(CRAFT).filter(([id, r]) => !r.hidden && !known.has(id));
  if (!pool.length) return null;
  // pages lean toward the current stage's ingredients
  const w = pool.map(([id, r]) => [id, r.stage <= stage ? 3 : 1]);
  return rng ? rng.weighted(w) : w[0][0];
}

export function usedIn(materialId) {
  return Object.entries(CRAFT).filter(([, r]) => r.ings.includes(materialId)).map(([id]) => id);
}

/** Recipes for the book / a station, with what you have. */
export function recipeBook(run, station = null) {
  const known = new Set(knownRecipes(run));
  const bagCount = {};
  for (const it of (run && run.bag ? run.bag.all() : [])) bagCount[it.id] = (bagCount[it.id] || 0) + 1;
  return Object.entries(CRAFT)
    .filter(([, r]) => !station || r.station === station)
    .map(([id, r]) => {
      const need = {};
      for (const x of r.ings) need[x] = (need[x] || 0) + 1;
      const missing = [];
      for (const [x, n] of Object.entries(need)) for (let k = (bagCount[x] || 0); k < n; k++) missing.push(x);
      return { id, recipe: r, known: known.has(id), have: !missing.length, missing, out: MATERIALS[r.out] };
    })
    .sort((a, b) => (b.known - a.known) || (b.have - a.have));
}

/** The recipe these exact ingredients (in this order) make, or null. */
export function matchRecipe(ids) { return BY_ORDER.get(ids.join('>')) || null; }

export function craftPreview(run, ordered, station = null) {
  const ids = (ordered || []).map(idOf).filter(Boolean);
  const res = { ok: false, out: null, recipe: null, newRecipe: false, placed: false, partial: { correct: 0, misplaced: 0 }, hint: '', consumed: [] };
  if (ids.length < 2) { res.hint = 'Add at least two ingredients.'; return res; }
  const exact = matchRecipe(ids);
  if (exact && (!station || CRAFT[exact].station === station || station === 'any')) {
    res.ok = true; res.recipe = exact; res.out = CRAFT[exact].out; res.newRecipe = !isKnown(run, exact);
    res.hint = res.newRecipe ? 'Something new…' : MATERIALS[CRAFT[exact].out].name;
    return res;
  }
  if (exact) { res.recipe = exact; res.hint = `Needs the ${CRAFT[exact].station}.`; return res; }
  const same = BY_SET.get(key(ids));
  if (same) {
    const want = CRAFT[same].ings;
    let correct = 0;
    for (let i = 0; i < want.length; i++) if (want[i] === ids[i]) correct++;
    res.recipe = isKnown(run, same) ? same : null;
    res.partial = { correct, misplaced: want.length - correct };
    res.hint = `${correct} in place, ${want.length - correct} misplaced.`;
    return res;
  }
  // near miss: a known recipe that shares most ingredients
  let best = null, bestN = 0;
  for (const id of knownRecipes(run)) {
    const r = CRAFT[id];
    const left = ids.slice();
    let n = 0;
    for (const x of r.ings) { const i = left.indexOf(x); if (i >= 0) { n++; left.splice(i, 1); } }
    if (n > bestN && n >= r.ings.length - 1) { best = id; bestN = n; }
  }
  res.hint = best ? `Close to ${MATERIALS[CRAFT[best].out].name}.` : 'Nothing happens.';
  return res;
}

/** Craft from bag items (or ids for tests). Consumes the ingredients only on success. */
export function craft(run, ordered, station = null) {
  const res = craftPreview(run, ordered, station);
  if (!res.ok) return res;
  const items = (ordered || []).filter((x) => x && typeof x === 'object');
  const q = items.length ? Math.round(items.reduce((a, it) => a + (it.q ?? 2), 0) / items.length) : 2;
  if (run && run.bag) for (const it of items) { run.removeItem(it); res.consumed.push(it); }
  const out = makeItem(res.out, Math.max(1, Math.min(4, q + (run && run.char === 'bran' && MATERIALS[res.out].kind === 'weapon' ? 1 : 0))));
  const tool = MATERIALS[res.out].tool;
  if (tool && tool.uses) out.uses = tool.uses;
  res.out = out;
  if (res.newRecipe) learnRecipe(run, res.recipe);
  res.placed = run && run.bag ? run.addItem(out) : false;
  if (run && run.stats) run.stats.crafted = (run.stats.crafted || 0) + 1;
  return res;
}
