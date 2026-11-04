// Real-time stats for an enemy: the roster's base hp/dmg (tuned for the old auto-battler) scaled by stage
// and elite rank so a normal dies in ~3–5 starter-weapon hits and a boss fight lasts about a minute.
const HP = [1, 1.7, 2.6, 3.8];
const DMG = [1, 1.3, 1.65, 2.0];

export function enemyStats(def, stage = 0, elite = false) {
  const s = Math.max(0, Math.min(3, def.region >= 0 ? def.region : stage));
  const ai = def.ai || {};
  const boss = def.tier === 'boss', eliteTier = def.tier === 'elite';
  let hp = def.hp * (boss ? 6 : 3) * HP[s];
  let dmg = def.dmg * 2 * DMG[s];
  if (elite && !boss) { hp *= eliteTier ? 1.3 : 1.8; dmg *= 1.3; }
  return {
    hp: Math.round(hp),
    dmg: Math.round(dmg),
    armor: def.armor || 0,
    speed: (ai.speed || 2) * (elite ? 1.08 : 1),
    // how much damage breaks its guard (normals flinch on every hit)
    poise: boss ? hp * 0.12 : eliteTier || elite ? hp * 0.3 : 0,
    kbTake: boss ? 0.08 : eliteTier ? 0.35 : elite ? 0.5 : 1,
    stage: s,
  };
}
