// PLACEHOLDER (owner: agent D) — inventory → loadout. Contract: docs/REDESIGN.md §7.
export function computeLoadout(run) {
  return { weapon: run && run.weapon, skills: (run && run.skills) || [null, null], stats: { dmg: 0, atkSpd: 0, moveSpd: 0, crit: 0.05, critDmg: 1.5, maxHp: 0, armor: 0, dashCharges: 2, lifesteal: 0, thorns: 0, statusChance: {}, element: null, lootLuck: 0, oreLuck: 0, pickPower: 1 }, synergies: [] };
}
