// Forge scoring: Chips × Mult resolved ingredient-by-ingredient (Balatro style), then synergies,
// recipes, hammer grade. evaluate() returns a step log for the animated calculation.
import { MATERIALS, QUALITY } from '../data/materials.js';
import { BLUEPRINTS, RECIPES } from '../data/blueprints.js';
import { RNG } from '../core/rng.js';

export const ELEMENTS = ['fire', 'ice', 'shock', 'poison', 'bleed', 'curse', 'holy'];
const STAT_KEYS = ['speed', 'crit', 'critDmg', 'lifesteal', 'block', 'multi', 'stun', 'greed', 'harvest', 'pierce', 'drain', 'slow', 'miss', 'firstCrit', 'charge'];
const GEMS = ['quartz', 'amethyst', 'ruby', 'sapphire', 'emerald', 'topaz', 'moonstone'];

export const GRADES = [
  { id: 'crude', name: 'Crude', mult: 0.8, color: '#9a8a7a' },
  { id: 'standard', name: 'Standard', mult: 1.0, color: '#f4ecd8' },
  { id: 'fine', name: 'Fine', mult: 1.15, color: '#5fd17a' },
  { id: 'superior', name: 'Superior', mult: 1.3, color: '#4fa6ff' },
  { id: 'masterwork', name: 'Masterwork', mult: 1.6, color: '#ffb63d' },
];

const has = (ids, id) => ids.includes(id);
const count = (ids, pred) => ids.filter(pred).length;
const tagged = (id, tag) => MATERIALS[id] && MATERIALS[id].tags.includes(tag);

/** Synergies: test(ids, el) → bool. el = element stacks so far. */
export const SYNERGIES = [
  { id: 'prismatic', name: 'PRISMATIC', test: (i, el) => el.fire > 0 && el.ice > 0 && el.shock > 0, xmult: 2, reaction: true, text: 'Fire + Ice + Shock', fx: 'prismatic' },
  { id: 'steam', name: 'STEAM BURST', test: (i, el) => el.fire > 0 && el.ice > 0 && !(el.shock > 0), xmult: 1.5, reaction: true, text: 'Fire + Ice: every 4th hit bursts for double.', fx: 'steam' },
  { id: 'plasma', name: 'PLASMA', test: (i, el) => el.fire > 0 && el.shock > 0 && !(el.ice > 0), xmult: 1.5, reaction: true, text: 'Fire + Shock: shocks ignite burns.', fx: 'plasma' },
  { id: 'superconduct', name: 'SUPERCONDUCT', test: (i, el) => el.ice > 0 && el.shock > 0 && !(el.fire > 0), xmult: 1.5, reaction: true, text: 'Ice + Shock: frozen foes take +50%.', fx: 'superconduct' },
  { id: 'toxicflame', name: 'TOXIC FLAME', test: (i, el) => el.fire > 0 && el.poison > 0, xmult: 1.5, reaction: true, text: 'Fire + Poison: poison ticks burn too.' },
  { id: 'steel', name: 'STEEL', test: (i) => has(i, 'iron') && has(i, 'coal'), mult: 3, alloy: true, text: 'Iron + Coal: +3 Mult' },
  { id: 'bronze', name: 'BRONZE', test: (i) => (has(i, 'copper') && has(i, 'tin')) || has(i, 'bronze_ancient'), mult: 2, alloy: true, stats: { speed: 10 }, text: 'Copper + Tin: +2 Mult, +10% Speed' },
  { id: 'electrum', name: 'ELECTRUM', test: (i) => has(i, 'gold') && has(i, 'silver'), xmult: 1.5, alloy: true, text: 'Gold + Silver' },
  { id: 'pure', name: 'PURE METAL', test: (i) => i.some((id) => tagged(id, 'metal') && count(i, (x) => x === id) >= 3), xmult: 1.5, alloy: true, text: '3 of the same metal' },
  { id: 'masteralloy', name: 'MASTER ALLOY', test: (i) => new Set(i.filter((id) => tagged(id, 'metal'))).size >= 3, mult: 4, alloy: true, text: '3 different metals: +4 Mult' },
  { id: 'gemcluster', name: 'GEM CLUSTER', test: (i) => count(i, (id) => tagged(id, 'gem')) >= 3, xmult: 1.5, text: '3+ gems' },
  { id: 'scrapheap', name: 'SCRAP HEAP', test: (i) => count(i, (id) => id === 'junk') >= 3, xmult: 1.5, text: '3+ Junk' },
  { id: 'bonecollector', name: 'BONE COLLECTOR', test: (i) => count(i, (id) => tagged(id, 'bone')) >= 3, xmult: 1.5, text: '3+ bones' },
  { id: 'predator', name: 'PREDATOR', test: (i) => count(i, (id) => tagged(id, 'fang')) >= 2, stats: { lifesteal: 5 }, el: { bleed: 2 }, text: '2+ fangs: Bleed 2, Lifesteal 5%' },
  { id: 'fortress', name: 'FORTRESS', test: (i) => count(i, (id) => tagged(id, 'shell') || tagged(id, 'scale')) >= 2, stats: { block: 30 }, text: '2+ shells/scales: +30% Block' },
  { id: 'cursedpact', name: 'CURSED PACT', test: (i) => has(i, 'cursedore') && (has(i, 'skull') || has(i, 'soulstone') || has(i, 'voidcrystal')), xmult: 1.5, stats: { drain: 1 }, text: 'Cursed Ore + a dark relic' },
  { id: 'purified', name: 'PURIFIED', test: (i) => has(i, 'silver') && (has(i, 'cursedore') || has(i, 'cursed_plate')), clearDrain: true, text: 'Silver cancels the curse\'s hunger' },
  { id: 'spiderkiss', name: "SPIDER'S KISS", test: (i) => has(i, 'spider_silk') && has(i, 'venom_sac'), stats: { multi: 1 }, el: { poison: 2 }, text: 'Silk + Venom' },
  { id: 'golemheart', name: 'GOLEM HEART', test: (i) => has(i, 'golem_core') && count(i, (id) => tagged(id, 'metal')) >= 2, xmult: 1.25, stats: { stun: 10 }, text: 'Golem Core + 2 metals' },
  { id: 'molten', name: 'MOLTEN', test: (i) => (has(i, 'magmasteel') || has(i, 'lava_core')) && (has(i, 'coal') || has(i, 'brimstone')), xmult: 1.25, el: { fire: 2 }, text: 'Molten metal + fuel' },
  { id: 'hoard', name: 'TREASURE HOARD', test: (i) => has(i, 'gold') && i.some((id) => tagged(id, 'key')), xmult: 1.25, stats: { greed: 2 }, text: 'Gold + a key' },
  { id: 'nightfall', name: 'NIGHTFALL', test: (i) => has(i, 'moonstone') && (has(i, 'ectoplasm') || has(i, 'wisp_essence')), stats: { crit: 20 }, text: 'Moonstone + spirit' },
  { id: 'regalia', name: 'ROYAL REGALIA', test: (i) => count(i, (id) => tagged(id, 'boss')) >= 2, xmult: 1.5, text: '2 boss trophies' },
];

function qScale(v, q) { return v * QUALITY[q].mult; }
function xScale(x, q) { return 1 + (x - 1) * QUALITY[q].mult; }
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * items: [{id, q, uid, bagBonus?:{q, chips, mult}}]  (order = slot order)
 * ctx: { char: 'bran'|..., shattered: n, rngSeed }
 */
export function evaluate(bpId, items, ctx = {}) {
  const bp = BLUEPRINTS[bpId];
  const char = ctx.char;
  const res = {
    bp: bpId, steps: [], chips: 0, mult: 0, el: {}, stats: {}, flags: {}, synergies: [], recipe: null,
    valid: true, error: null, gradeBonus: 0, ids: items.map((i) => i.id),
  };
  for (const e of ELEMENTS) res.el[e] = 0;
  for (const k of STAT_KEYS) res.stats[k] = 0;
  if (!bp) { res.valid = false; res.error = 'Pick a blueprint'; return res; }

  if (bp.tool) return evaluatePick(items, ctx, res);

  if (!items.length || !items.some((it) => MATERIALS[it.id].tags.includes('solid'))) {
    res.valid = false; res.error = 'Needs at least one solid ingredient (ore, gem, bone, shell…)';
  }

  // ---- base
  let chips = bp.chips, mult = bp.mult;
  let baseNote = '';
  if (char === 'durgan' && (bpId === 'axe' || bpId === 'hammer')) { mult += 2; baseNote = ' (Heavy Hands +2)'; }
  if (char === 'elio' && bpId === 'staff') { mult += 3; baseNote = ' (Spellwright +3)'; }
  res.steps.push({ kind: 'base', text: bp.name + baseNote, chips, mult });
  if (bp.bleed) res.el.bleed += bp.bleed;
  if (bp.stun) res.stats.stun += bp.stun;

  const ids = items.map((i) => i.id);
  const hasMetal = ids.some((id) => tagged(id, 'metal'));
  const amber = has(ids, 'amber');
  const rng = new RNG('geode:' + (ctx.rngSeed || 0));

  // expand geodes into two gems each (deterministic per uid)
  const resolveFx = (it) => {
    if (it.id !== 'geode') return [it];
    const r = new RNG('geode' + it.uid);
    return [{ ...it, id: r.pick(GEMS), fromGeode: true }, { ...it, id: r.pick(GEMS), fromGeode: true }];
  };
  const elementsPresent = () => ELEMENTS.filter((e) => res.el[e] > 0);

  const applyOne = (it, idx, isEcho = false) => {
    const m = MATERIALS[it.id];
    const w = m.weapon || {};
    let q = Math.min(4, (it.q ?? 2) + ((it.bagBonus && it.bagBonus.q) || 0));
    const step = { kind: 'item', idx, id: it.id, q, chips: 0, mult: 0, xmult: 1, notes: [], echo: isEcho };
    let boost = 1;
    if (char === 'durgan' && ['bone', 'shell', 'scale', 'core'].some((t) => m.tags.includes(t))) { boost *= 1.5; step.notes.push('Trophy ×1.5'); }
    if (amber && m.kind === 'part') { boost *= 1.5; step.notes.push('Amber ×1.5'); }
    let c = (w.chips || 0) * boost, mu = (w.mult || 0) * boost;
    if (char === 'bran' && m.tags.includes('metal') && c) { c *= 1.5; step.notes.push('Master Smith'); }
    // special hooks
    switch (w.fx) {
      case 'scrap': c += 2 * (count(ids, (x) => x === 'junk') - 1); break;
      case 'coal': if (hasMetal) mu += 2; break;
      case 'magnetic': mu += count(ids, (x) => tagged(x, 'metal')) - 1; break;
      case 'bones': c += 2 * (count(ids, (x) => tagged(x, 'bone')) - 1); break;
      case 'fossil': mu += count(ids, (x) => tagged(x, 'bone') && x !== 'fossil'); break;
      case 'brimstone': if (ids.some((x) => (MATERIALS[x].weapon || {}).fire || MATERIALS[x].tags.includes('fire'))) mu += 4; break;
      case 'clarity': step.xmult *= Math.pow(1.1, count(ids, (x) => tagged(x, 'gem'))); break;
      case 'soulstone': step.xmult *= 1 + 0.1 * (ctx.shattered || 0); break;
      case 'mastery': res.gradeBonus += 1; step.notes.push('Grade +1'); break;
      case 'fear': res.flags.fear = true; break;
      case 'regen': res.flags.regen = (res.flags.regen || 0) + 1; break;
      case 'mycel': res.flags.mycel = true; break;
      case 'conductive': res.flags.conductive = true; break;
      default: break;
    }
    if (it.bagBonus) { c += it.bagBonus.chips || 0; mu += it.bagBonus.mult || 0; if (it.bagBonus.chips || it.bagBonus.mult) step.notes.push('Bag bonus'); }
    step.chips = Math.round(qScale(c, q));
    step.mult = round1(qScale(mu, q));
    if (w.xmult) step.xmult *= xScale(w.xmult, q) * (boost > 1 ? 1 + (boost - 1) * 0.5 : 1);
    step.xmult = round1(step.xmult * 100) / 100;
    for (const e of ELEMENTS) if (w[e]) {
      let s = Math.max(1, Math.round(qScale(w[e], q) * boost));
      if (char === 'elio' && ['fire', 'ice', 'shock', 'poison'].includes(e)) s *= 2;
      res.el[e] += s;
      step.notes.push(`+${s} ${e}`);
      step[e] = s;
    }
    for (const k of STAT_KEYS) if (w[k]) res.stats[k] += k === 'critDmg' ? w[k] * QUALITY[q].mult : Math.round(w[k] * (k === 'harvest' || k === 'multi' || k === 'firstCrit' || k === 'pierce' || k === 'drain' ? 1 : QUALITY[q].mult * boost));
    chips += step.chips; mult += step.mult; mult *= step.xmult;
    step.totalChips = chips; step.totalMult = round1(mult);
    res.steps.push(step);
    return step;
  };

  let prev = null;
  items.forEach((raw, idx) => {
    const m = MATERIALS[raw.id];
    if (m.weapon && m.weapon.fx === 'echo') {
      if (prev) { const s = applyOne(prev, idx, true); s.notes.unshift('ECHO'); }
      else res.steps.push({ kind: 'item', idx, id: raw.id, chips: 0, mult: 0, xmult: 1, notes: ['Nothing to echo'] });
      return;
    }
    for (const it of resolveFx(raw)) { applyOne(it, idx); prev = it; }
    if (m.weapon && m.weapon.fx === 'wisp') {
      for (const e of elementsPresent()) res.el[e] += 1;
    }
  });
  // deferred whole-weapon effects
  if (ids.includes('prism')) {
    const n = elementsPresent().filter((e) => ['fire', 'ice', 'shock', 'poison', 'curse', 'holy'].includes(e)).length;
    const x = Math.pow(1.3, n);
    if (n) { mult *= x; res.steps.push({ kind: 'fx', text: `Prism: ${n} elements`, xmult: round1(x * 100) / 100, totalChips: chips, totalMult: round1(mult) }); }
  }
  if (ids.includes('runestone')) {
    const n = elementsPresent().length;
    if (n) { mult += 2 * n; res.steps.push({ kind: 'fx', text: `Runestone: ${n} elements`, mult: 2 * n, totalChips: chips, totalMult: round1(mult) }); }
  }
  if (res.flags.conductive && res.el.shock) res.el.shock *= 2;
  if (bp.element) for (const e of ['fire', 'ice', 'shock', 'poison']) res.el[e] = Math.round(res.el[e] * bp.element);

  // ---- synergies
  for (const s of SYNERGIES) {
    if (!s.test(ids, res.el)) continue;
    let x = s.xmult || 1;
    let note = '';
    let addM = s.mult || 0;
    if (s.alloy && char === 'bran') { if (x > 1) x += 0.25; addM *= 2; note = ' (Bran)'; }
    if (x > 1 && s.reaction && char === 'elio') { x += 0.5; note = ' (+0.5 Elio)'; }
    if (addM) mult += addM;
    if (x > 1) mult *= x;
    if (s.stats) for (const k in s.stats) res.stats[k] += s.stats[k];
    if (s.el) for (const k in s.el) res.el[k] += s.el[k];
    if (s.fx) res.flags[s.fx] = true;
    if (s.clearDrain) res.flags.purified = true;
    res.synergies.push(s.id);
    res.steps.push({ kind: 'synergy', id: s.id, text: s.name + note, desc: s.text, xmult: x > 1 ? x : 1, mult: addM, totalChips: chips, totalMult: round1(mult) });
    if (s.id === 'prismatic') { /* replaces the pair reactions: they test !third element already */ }
  }
  if (res.flags.purified) res.stats.drain = 0;

  // ---- recipe
  for (const [rid, r] of Object.entries(RECIPES)) {
    if (r.bp !== bpId || r.ings.length !== ids.length) continue;
    const a = [...r.ings].sort().join(), b = [...ids].sort().join();
    if (a === b) {
      res.recipe = rid;
      const bn = r.bonus;
      if (bn.xmult) mult *= bn.xmult;
      for (const k of STAT_KEYS) if (bn[k]) res.stats[k] += bn[k];
      for (const e of ELEMENTS) if (bn[e]) res.el[e] += bn[e];
      if (bn.fx) res.flags[bn.fx] = true;
      res.steps.push({ kind: 'recipe', id: rid, text: r.name.toUpperCase(), desc: r.text, xmult: bn.xmult || 1, totalChips: chips, totalMult: round1(mult) });
      break;
    }
  }

  res.chips = Math.max(1, Math.round(chips));
  res.mult = Math.max(1, round1(mult));
  res.dmg = Math.max(1, Math.floor(res.chips * res.mult));
  res.name = res.recipe ? RECIPES[res.recipe].name : weaponName(bpId, ids, res);
  return res;
}

function evaluatePick(items, ctx, res) {
  const p = { strikes: 0 };
  res.steps.push({ kind: 'base', text: 'Pickaxe', chips: 0, mult: 0 });
  for (const it of items) {
    const m = MATERIALS[it.id];
    const pk = m.pick || {};
    const step = { kind: 'item', id: it.id, q: it.q, notes: [] };
    for (const k in pk) {
      const v = k === 'strikes' && (it.q ?? 2) >= 4 ? pk[k] + 1 : pk[k];
      p[k] = (p[k] || 0) + v;
      step.notes.push(k === 'strikes' ? `+${v} Strike${v > 1 ? 's' : ''}` : k);
    }
    if (ctx.char === 'clover' && m.id === 'junk') { p.lucky = (p.lucky || 0) + 1; step.notes.push('lucky (Clover)'); }
    res.steps.push(step);
  }
  if (!items.length) { res.valid = false; res.error = 'Add at least one material'; }
  res.pick = p;
  res.name = pickName(items.map((i) => i.id), p);
  res.dmg = 0;
  return res;
}

const ELEMENT_PREFIX = { fire: 'Searing', ice: 'Frostbitten', shock: 'Thundering', poison: 'Venomous', curse: 'Accursed', holy: 'Blessed', bleed: 'Serrated' };
const METAL_NAME = { iron: 'Iron', copper: 'Copper', tin: 'Tin', silver: 'Silver', gold: 'Golden', mithril: 'Mithril', stariron: 'Star-Iron', magmasteel: 'Magmasteel', bronze_ancient: 'Bronze', lodestone: 'Lodestone', junk: 'Junk', cursedore: 'Cursed', obsidian: 'Obsidian' };
const PART_SUFFIX = { bat_fang: 'of the Bat', spider_silk: 'of the Spider', golem_core: 'of the Golem', wyrm_scale: 'of the Wyrm', ectoplasm: 'of the Wraith', rat_tooth: 'of the Rat', mimic_teeth: 'of the Mimic', skull: 'of the Grave', beetle_shell: 'of the Beetle', feather: 'of the Owl', wisp_essence: 'of Wisps', moth_dust: 'of Moths', fire_gland: 'of Embers', salamander_scale: 'of the Salamander', hound_fang: 'of the Hound', venom_sac: 'of Venom' };

export function weaponName(bpId, ids, res) {
  const bp = BLUEPRINTS[bpId].name;
  let material = '';
  if (res.synergies.includes('steel')) material = 'Steel';
  else if (res.synergies.includes('electrum')) material = 'Electrum';
  else if (res.synergies.includes('bronze')) material = 'Bronze';
  else {
    const metals = ids.filter((id) => METAL_NAME[id]);
    if (metals.length) material = METAL_NAME[metals.sort((a, b) => MATERIALS[b].value - MATERIALS[a].value)[0]];
    else if (ids.some((id) => tagged(id, 'gem'))) material = 'Crystal';
    else if (ids.some((id) => tagged(id, 'bone'))) material = 'Bone';
  }
  const topEl = ELEMENTS.filter((e) => res.el[e] > 0).sort((a, b) => res.el[b] - res.el[a])[0];
  const prefix = res.synergies.includes('prismatic') ? 'Prismatic' : topEl ? ELEMENT_PREFIX[topEl] : '';
  const part = ids.find((id) => PART_SUFFIX[id]);
  return [prefix, material, bp, part ? PART_SUFFIX[part] : ''].filter(Boolean).join(' ');
}
function pickName(ids, p) {
  if (p.column) return 'Starfall Pick';
  if (p.cursed) return 'Cursed Pick';
  if (p.magnetic) return 'Magnetic Pick';
  if (p.gemDupe) return 'Crystal Pick';
  if (p.lucky) return 'Lucky Pick';
  if (p.chain) return 'Storm Pick';
  if (p.smelt) return 'Ember Pick';
  if (ids.every((id) => id === 'junk')) return 'Junk Pick';
  return 'Sturdy Pick';
}

/** Grade from rhythm results. hits: array of 'perfect'|'good'|'miss'. */
export function gradeFrom(hits, bonus = 0) {
  const n = hits.length || 1;
  const perfect = hits.filter((h) => h === 'perfect').length;
  const score = hits.reduce((a, h) => a + (h === 'perfect' ? 1 : h === 'good' ? 0.6 : 0), 0) / n;
  let g = perfect === n ? 4 : score >= 0.8 ? 3 : score >= 0.6 ? 2 : score >= 0.35 ? 1 : 0;
  g = Math.min(4, g + bonus);
  return g;
}

/** Turn an evaluation + grade into a combat-ready weapon object. */
export function finalizeWeapon(res, gradeIdx, ctx = {}) {
  const bp = BLUEPRINTS[res.bp];
  const grade = GRADES[gradeIdx];
  const perfects = ctx.perfects || 0;
  let mult = res.mult + (ctx.char === 'bran' ? perfects : 0);
  let dmg = Math.max(1, Math.floor(res.chips * mult * grade.mult));
  const s = res.stats;
  const speedMul = 1 + (s.speed + (ctx.char === 'clover' ? 15 : 0)) / 100;
  return {
    name: (grade.id === 'masterwork' ? 'Masterwork ' : '') + res.name,
    bp: res.bp, recipe: res.recipe, ids: res.ids, grade: gradeIdx,
    chips: res.chips, mult: round1(mult), dmg,
    interval: Math.max(0.25, bp.speed / speedMul),
    critMult: bp.crit + s.critDmg + (ctx.char === 'clover' ? 1 : 0),
    critChance: Math.min(60, s.crit) / 100,
    el: { ...res.el }, stats: { ...s }, flags: { ...res.flags },
    multi: s.multi + (ctx.char === 'clover' && res.bp === 'dagger' ? 1 : 0),
    harvest: Math.max(1, bp.harvest + s.harvest + (gradeIdx >= 4 ? 1 : 0) + (gradeIdx >= 3 ? 0 : gradeIdx <= 0 ? -1 : 0)),
    stun: s.stun / 100, pierce: s.pierce > 0, pierceFlat: bp.pierceFlat || 0,
    firstStrike: !!bp.firstStrike, parryBonus: bp.parry || 1,
    synergies: res.synergies,
  };
}
