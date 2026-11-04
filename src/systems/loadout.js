// Inventory → loadout (docs/REDESIGN.md §7). Your build is what you carry: amulets, charms and spare
// weapons in the BAG give passives (charms also buff matching neighbours), the weapon in your HAND is
// what you swing, the 2 skill gems in the slots are your skills.
//
// computeLoadout(run) → {
//   weapon: { id, uid, name, type ('axe'|'hammer'|'sword'|'spear'|'dagger'|'staff'), bp (= type), q,
//             dmg (per hit, quality applied — multiply by stats.dmg yourself), speed (attack-rate ×),
//             range (m), special, element, kb (m), petrify (0..1, incl. bonuses), status {key: 0..1},
//             look { bp, ids } (for models/weapons3d buildWeaponMesh) } | null (unarmed: PICK_FIST)
//   skills: [skillId | null, skillId | null]
//   maxHp: total max HP, hp: current HP (write back to run.hp)
//   stats: {                                   ← TOTALS, ready to use
//     dmg ×, atkSpd ×, moveSpd ×, skillCd × (cooldown multiplier, ≥ 0.4)
//     crit 0..1 (weapon + bonuses), critDmg × (weapon + bonuses)
//     maxHp (bonus part), armor (flat per hit), dashCharges (int, base 2), lifesteal 0..1, thorns (flat),
//     regen (HP when a room is cleared), pickupRadius (m), lootLuck 0..1, oreLuck 0..1, pickPower (int),
//     petrify 0..1 (bonus on top of the weapon), element (string|null),
//     status { poison, burn, slow, freeze, bleed, stun: 0..1 on-hit chance (weapon + bonuses) },
//     procs [{ on, effect, chance, power, from }]
//   }
//   synergies: [{ id, name, text, active, uids }]   links: [{ a: uid, b: uid, give }] (charm lines for the bag UI)
// }
import { MATERIALS, QUALITY } from '../data/materials.js';
import { CHARACTERS } from '../data/characters.js';

export const STATUS_KEYS = ['poison', 'burn', 'slow', 'freeze', 'bleed', 'stun'];
const BASE = () => ({
  dmg: 0, atkSpd: 0, moveSpd: 0, skillCd: 0, crit: 0, critDmg: 0, maxHp: 0, armor: 0, dashCharges: 0, lifesteal: 0,
  thorns: 0, regen: 0, pickupRadius: 0, lootLuck: 0, oreLuck: 0, pickPower: 0, petrify: 0, status: {},
});
/** Bare hands when nothing is equipped. */
export const PICK_FIST = { id: 'fists', uid: 0, name: 'Bare Fists', type: 'dagger', bp: 'dagger', q: 2, dmg: 4, speed: 1.4, range: 1.2, special: 'flurry', element: null, kb: 0.3, petrify: 0, status: {}, look: null };

/** Add src stats (human units) into acc, scaled by k. */
export function addStats(acc, src, k = 1) {
  if (!src) return acc;
  for (const [key, v] of Object.entries(src)) {
    if (key === 'status') { for (const [s, c] of Object.entries(v || {})) acc.status[s] = (acc.status[s] || 0) + c * k; continue; }
    if (typeof v === 'number') acc[key] = (acc[key] || 0) + v * k;
  }
  return acc;
}

/** Weapon stats from a weapon item (or a legacy finalized weapon). */
export function weaponFromItem(it) {
  if (!it) return null;
  const m = MATERIALS[it.id];
  if (!m || !m.wpn) return null;
  const w = m.wpn, qm = QUALITY[it.q ?? 2].mult;
  return {
    id: it.id, uid: it.uid, name: (it.q >= 3 ? QUALITY[it.q].name + ' ' : '') + m.name, type: w.type, bp: w.type, q: it.q ?? 2,
    dmg: Math.max(1, Math.round(w.dmg * qm)), speed: w.speed, range: w.range, special: w.special, element: w.element || null,
    kb: w.kb ?? 0.5, petrify: w.petrify ?? 0, crit: (w.crit || 0) / 100, critDmg: w.critDmg || 1.5,
    status: Object.fromEntries(Object.entries(w.status || {}).map(([k, v]) => [k, v])), look: m.look || { bp: w.type, ids: ['iron'] },
  };
}

const matches = (m, match) => (!match.kind || m.kind === match.kind) && (!match.tag || m.tags.includes(match.tag));

/** Named set bonuses for carrying the right things together. */
const SETS = [
  { id: 'spore_set', name: 'Spore Kin', text: '3+ spore items: +15% poison on hit.', test: (ms) => ms.filter((m) => m.tags.includes('spore')).length >= 3, give: { status: { poison: 15 } } },
  { id: 'gem_hoard', name: 'Gem Hoard', text: '4+ gems: +8% crit.', test: (ms) => ms.filter((m) => m.kind === 'gem').length >= 4, give: { crit: 8 } },
  { id: 'stonecutter', name: 'Stonecutter', text: 'Stone weapon + Stone Skin: +2 armor.', test: (ms, hand) => !!hand && MATERIALS[hand.id] && MATERIALS[hand.id].tags.includes('stone') && ms.some((m) => m.id === 'stone_skin'), give: { armor: 2 } },
  { id: 'arsenal', name: 'Arsenal', text: '3+ weapons carried: +10% damage.', test: (ms, hand) => ms.filter((m) => m.kind === 'weapon').length + (hand ? 1 : 0) >= 3, give: { dmg: 10 } },
  { id: 'prospector', name: 'Prospector', text: '2+ tools: +20% ore.', test: (ms) => ms.filter((m) => m.kind === 'tool').length >= 2, give: { oreLuck: 20 } },
];

export function computeLoadout(run) {
  const acc = BASE();
  const procs = [];
  const links = [];
  const synergies = [];
  const hero = run && CHARACTERS[run.char];
  if (hero && hero.base) addStats(acc, hero.base);
  const bagItems = run && run.bag ? run.bag.items : [];
  const mats = bagItems.map((it) => MATERIALS[it.id]).filter(Boolean);
  // bag passives
  for (const it of bagItems) {
    const m = MATERIALS[it.id];
    if (!m) continue;
    const qk = m.kind === 'weapon' ? 1 : QUALITY[it.q ?? 2].mult;
    if (m.passive) addStats(acc, m.passive, qk);
    if (m.kind === 'weapon' && m.bagPassive) addStats(acc, m.bagPassive);
    for (const p of m.procs || []) procs.push({ ...p, from: m.id, power: Math.round(p.power * qk) });
    if (m.adj && run.bag.neighbors) {
      for (const n of run.bag.neighbors(it)) {
        const nm = MATERIALS[n.id];
        if (nm && matches(nm, m.adj.match)) { addStats(acc, m.adj.give, qk); links.push({ a: it.uid, b: n.uid, give: m.adj.give }); }
      }
    }
  }
  // set bonuses
  const hand = run && run.hand;
  for (const s of SETS) {
    const active = s.test(mats, hand);
    if (active) addStats(acc, s.give);
    synergies.push({ id: s.id, name: s.name, text: s.text, active, uids: [] });
  }
  // temporary effects (potions, shrines)
  for (const e of (run && run.effects) || []) addStats(acc, e.stats);
  // hero weapon-type bonus
  let weapon = weaponFromItem(hand) || (run && run.weapon && run.weapon.v5 ? run.weapon : null) || { ...PICK_FIST };
  if (hero && hero.typeBonus && hero.typeBonus[weapon.type]) addStats(acc, hero.typeBonus[weapon.type]);

  const status = {};
  for (const k of STATUS_KEYS) status[k] = Math.min(0.95, (weapon.status[k] || 0) + (acc.status[k] || 0) / 100 * (hero && hero.statusMul ? hero.statusMul : 1));
  const stats = {
    dmg: 1 + acc.dmg / 100, atkSpd: 1 + acc.atkSpd / 100, moveSpd: Math.max(0.5, 1 + acc.moveSpd / 100), skillCd: Math.max(0.4, 1 - acc.skillCd / 100),
    crit: Math.min(0.9, (weapon.crit || 0) + acc.crit / 100), critDmg: (weapon.critDmg || 1.5) + acc.critDmg,
    maxHp: Math.round(acc.maxHp), armor: Math.round(acc.armor), dashCharges: 2 + Math.round(acc.dashCharges), lifesteal: acc.lifesteal / 100,
    thorns: Math.round(acc.thorns), regen: Math.round(acc.regen), pickupRadius: 1.2 + acc.pickupRadius, lootLuck: acc.lootLuck / 100,
    oreLuck: acc.oreLuck / 100, pickPower: 1 + Math.round(acc.pickPower), petrify: acc.petrify / 100,
    element: weapon.element || null, status, procs,
  };
  weapon = { ...weapon, petrify: Math.min(1, (weapon.petrify || 0) + stats.petrify) };
  const skills = ((run && run.skills) || [null, null]).slice(0, 2).map((s) => (s ? (typeof s === 'string' ? s : MATERIALS[s.id] && MATERIALS[s.id].skill) || null : null));
  while (skills.length < 2) skills.push(null);
  const maxHp = ((run && run.baseHp) || (hero && hero.hp) || 100) + stats.maxHp;
  return { weapon, skills, stats, maxHp, hp: run ? Math.min(run.hp ?? maxHp, maxHp) : maxHp, synergies, links };
}
