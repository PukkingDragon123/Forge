// PLACEHOLDER (owner: agent D) — petrify + statue loot. Contract: docs/REDESIGN.md §5.4.
export function stoneCost(def) { return def && def.tier === 'boss' ? 0.4 : def && def.tier === 'elite' ? 0.25 : 0.12; }
export function statueLoot() { return []; }
export function veinLoot() { return []; }
