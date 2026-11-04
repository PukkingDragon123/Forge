// Weapon movesets (Hades-style): a 3-hit combo, a dash-strike and a special per weapon type.
// Timings in seconds at 0% attack speed. mul × the weapon's base hit damage. Shapes are measured from
// the player along the aim:
//   cone { r, arc }  · circle { r }  · line { len, width }  · bolt (projectile) { speed, range, n, spread }
// lunge = metres of forward step over wind+active. kb = knockback metres. cancel = earliest point in
// the recovery when the next combo hit may start (dash can always cancel recovery).
const A = (o) => ({ wind: 0.07, active: 0.06, rec: 0.22, cancel: 0.1, mul: 1, kb: 0.5, lunge: 0.35, shape: 'cone', r: 1.7, arc: 2.5, ...o });

export const MOVESETS = {
  axe: {
    name: 'Axe', color: '#ffb85a', core: '#fff2cc',
    combo: [
      A({ anim: ['attack1', 'chop', 'slash'], mul: 1.0, arc: 2.7, r: 1.75, kb: 0.6, lunge: 0.42, fx: { dir: 1, width: 0.62 }, sound: 'swing_axe' }),
      A({ anim: ['attack2', 'slash', 'chop'], mul: 1.1, arc: 2.7, r: 1.75, kb: 0.7, lunge: 0.4, fx: { dir: -1, width: 0.62 }, sound: 'swing_axe' }),
      A({ anim: ['attack3', 'smash', 'chop'], heavy: true, wind: 0.17, active: 0.07, rec: 0.32, cancel: 0.22, mul: 2.4, arc: 1.5, r: 2.1, kb: 2.1, lunge: 0.75, stun: 0.35, fx: { dir: 1, width: 0.9, chop: true }, quake: 1.3, sound: 'swing_heavy' }),
    ],
    dash: A({ anim: ['dashAttack', 'attack3', 'chop'], heavy: true, wind: 0.05, active: 0.07, rec: 0.26, mul: 1.6, arc: 1.9, r: 2.0, kb: 1.6, lunge: 1.1, fx: { dir: 1, width: 0.8 }, sound: 'swing_heavy' }),
    special: { kind: 'spin', cd: 1.1, mul: 1.35, r: 2.15, hits: 2, gap: 0.16, kb: 1.3, anim: ['special_axe', 'slash'], sound: 'whirl' },
  },
  hammer: {
    name: 'Hammer', color: '#ffd27a', core: '#ffffff',
    combo: [
      A({ anim: ['attack1', 'smash'], wind: 0.12, active: 0.07, rec: 0.3, cancel: 0.18, mul: 1.5, arc: 2.2, r: 1.9, kb: 1.2, lunge: 0.35, fx: { dir: 1, width: 0.75 }, sound: 'swing_heavy' }),
      A({ anim: ['attack2', 'smash'], wind: 0.12, active: 0.07, rec: 0.3, cancel: 0.18, mul: 1.6, arc: 2.2, r: 1.9, kb: 1.3, lunge: 0.35, fx: { dir: -1, width: 0.75 }, sound: 'swing_heavy' }),
      A({ anim: ['attack3', 'smash'], heavy: true, shape: 'circle', wind: 0.22, active: 0.08, rec: 0.4, cancel: 0.3, mul: 3.0, r: 2.3, kb: 2.3, lunge: 0.5, stun: 0.6, quake: 2.3, sound: 'slam' }),
    ],
    dash: A({ anim: ['dashAttack', 'smash'], heavy: true, shape: 'circle', wind: 0.08, active: 0.07, rec: 0.32, mul: 2.0, r: 1.9, kb: 1.8, lunge: 0.9, quake: 1.9, sound: 'slam' }),
    special: { kind: 'leap', cd: 2.2, mul: 3.0, r: 2.5, range: 3.6, air: 0.36, kb: 2.3, stun: 0.6, anim: ['special_hammer', 'jump', 'smash'], sound: 'slam' },
  },
  sword: {
    name: 'Sword', color: '#bfe4ff', core: '#ffffff',
    combo: [
      A({ anim: ['attack1', 'slash'], wind: 0.05, active: 0.05, rec: 0.17, cancel: 0.07, mul: 0.95, arc: 2.3, r: 1.8, kb: 0.45, lunge: 0.4, fx: { dir: 1, width: 0.5 }, sound: 'swing_sword' }),
      A({ anim: ['attack2', 'slash'], wind: 0.05, active: 0.05, rec: 0.17, cancel: 0.07, mul: 0.95, arc: 2.3, r: 1.8, kb: 0.45, lunge: 0.4, fx: { dir: -1, width: 0.5 }, sound: 'swing_sword' }),
      A({ anim: ['attack3', 'stab'], heavy: true, shape: 'line', wind: 0.1, active: 0.06, rec: 0.26, cancel: 0.18, mul: 1.8, len: 2.6, width: 1.0, kb: 1.6, lunge: 0.75, sound: 'swing_heavy' }),
    ],
    dash: A({ anim: ['dashAttack', 'stab'], heavy: true, shape: 'line', wind: 0.04, active: 0.06, rec: 0.22, mul: 1.5, len: 2.6, width: 1.0, kb: 1.3, lunge: 1.0, sound: 'swing_sword' }),
    special: { kind: 'thrust', cd: 1.4, mul: 1.9, len: 4.2, width: 1.2, dur: 0.16, kb: 1.4, anim: ['special_sword', 'stab'], sound: 'dash_strike' },
  },
  spear: {
    name: 'Spear', color: '#ffe29a', core: '#ffffff',
    combo: [
      A({ anim: ['attack1', 'stab'], shape: 'line', wind: 0.07, active: 0.05, rec: 0.2, cancel: 0.09, mul: 1.0, len: 2.7, width: 0.8, kb: 0.6, lunge: 0.3, sound: 'swing_sword' }),
      A({ anim: ['attack2', 'stab'], shape: 'line', wind: 0.07, active: 0.05, rec: 0.2, cancel: 0.09, mul: 1.0, len: 2.7, width: 0.8, kb: 0.6, lunge: 0.3, sound: 'swing_sword' }),
      A({ anim: ['attack3', 'slash'], heavy: true, shape: 'circle', wind: 0.14, active: 0.08, rec: 0.3, cancel: 0.2, mul: 1.8, r: 2.4, kb: 1.6, lunge: 0.2, fx: { spin: true }, sound: 'whirl' }),
    ],
    dash: A({ anim: ['dashAttack', 'stab'], heavy: true, shape: 'line', wind: 0.04, active: 0.06, rec: 0.22, mul: 1.6, len: 3.0, width: 0.9, kb: 1.2, lunge: 1.1, sound: 'swing_sword' }),
    special: { kind: 'throw', cd: 1.6, mul: 2.2, speed: 17, range: 9, radius: 0.32, pierce: 99, anim: ['special_spear', 'stab'], sound: 'throw' },
  },
  dagger: {
    name: 'Dagger', color: '#e8c8ff', core: '#ffffff',
    combo: [
      A({ anim: ['attack1', 'stab', 'slash'], wind: 0.035, active: 0.04, rec: 0.12, cancel: 0.05, mul: 0.65, arc: 1.7, r: 1.45, kb: 0.25, lunge: 0.3, crit: 0.12, fx: { dir: 1, width: 0.4 }, sound: 'swing_dagger' }),
      A({ anim: ['attack2', 'slash', 'stab'], wind: 0.035, active: 0.04, rec: 0.12, cancel: 0.05, mul: 0.65, arc: 1.7, r: 1.45, kb: 0.25, lunge: 0.3, crit: 0.12, fx: { dir: -1, width: 0.4 }, sound: 'swing_dagger' }),
      A({ anim: ['attack3', 'stab'], heavy: true, shape: 'line', wind: 0.06, active: 0.05, rec: 0.18, cancel: 0.1, mul: 1.15, len: 2.0, width: 0.8, kb: 0.9, lunge: 0.55, crit: 0.25, sound: 'swing_sword' }),
    ],
    dash: A({ anim: ['dashAttack', 'stab'], heavy: true, shape: 'line', wind: 0.03, active: 0.05, rec: 0.16, mul: 1.3, len: 2.2, width: 0.8, kb: 0.8, lunge: 0.9, crit: 0.35, sound: 'swing_dagger' }),
    special: { kind: 'fan', cd: 0.9, mul: 0.95, n: 3, spread: 0.5, speed: 19, range: 8, radius: 0.18, anim: ['special_dagger', 'slash'], sound: 'throw' },
  },
  staff: {
    name: 'Staff', color: '#9ae8ff', core: '#ffffff',
    combo: [
      A({ anim: ['attack1', 'cast'], shape: 'bolt', wind: 0.08, active: 0.04, rec: 0.2, cancel: 0.1, mul: 0.85, speed: 15, range: 9, n: 1, lunge: 0.05, kb: 0.4, sound: 'bolt' }),
      A({ anim: ['attack2', 'cast'], shape: 'bolt', wind: 0.08, active: 0.04, rec: 0.2, cancel: 0.1, mul: 0.85, speed: 15, range: 9, n: 1, lunge: 0.05, kb: 0.4, sound: 'bolt' }),
      A({ anim: ['attack3', 'cast'], heavy: true, shape: 'bolt', wind: 0.14, active: 0.05, rec: 0.3, cancel: 0.2, mul: 0.9, speed: 15, range: 9, n: 3, spread: 0.32, lunge: 0, kb: 0.7, sound: 'bolt' }),
    ],
    dash: A({ anim: ['dashAttack', 'cast'], heavy: true, shape: 'circle', wind: 0.04, active: 0.06, rec: 0.22, mul: 1.3, r: 1.7, kb: 1.5, lunge: 0.4, quake: 1.7, sound: 'zap' }),
    special: { kind: 'nova', cd: 2.0, mul: 1.6, r: 2.7, kb: 2.6, anim: ['special_staff', 'cast'], sound: 'nova' },
  },
  // no blade: you swing the pickaxe
  pickaxe: {
    name: 'Pickaxe', color: '#e8d8b8', core: '#ffffff',
    combo: [
      A({ anim: ['attack1', 'mine', 'chop'], mul: 0.8, arc: 1.8, r: 1.5, kb: 0.4, lunge: 0.3, fx: { dir: 1, width: 0.45 }, sound: 'swing_dagger' }),
      A({ anim: ['attack2', 'mine', 'chop'], mul: 0.8, arc: 1.8, r: 1.5, kb: 0.4, lunge: 0.3, fx: { dir: -1, width: 0.45 }, sound: 'swing_dagger' }),
      A({ anim: ['attack3', 'mine', 'chop'], heavy: true, wind: 0.13, rec: 0.28, cancel: 0.2, mul: 1.6, arc: 1.2, r: 1.7, kb: 1.4, lunge: 0.5, stun: 0.25, fx: { dir: 1, width: 0.6, chop: true }, quake: 1, sound: 'swing_heavy' }),
    ],
    dash: A({ anim: ['dashAttack', 'chop'], heavy: true, mul: 1.2, arc: 1.6, r: 1.7, kb: 1.2, lunge: 0.9, sound: 'swing_heavy' }),
    special: { kind: 'spin', cd: 1.3, mul: 0.9, r: 1.8, hits: 1, gap: 0.15, kb: 1.1, anim: ['slash'], sound: 'whirl' },
  },
};
MOVESETS.fists = MOVESETS.pickaxe;

/** The moveset for a weapon object (bp = blueprint id) or a type name. */
export function movesetOf(w) {
  const bp = typeof w === 'string' ? w : w && (w.bp || w.type || w.kind);
  return MOVESETS[bp] || MOVESETS.axe;
}
/** Base light-hit damage of a weapon (v5 weapons carry `dmg` = one light hit). */
export function weaponBase(w) {
  if (!w) return 6;
  const d = w.hitDmg ?? w.base ?? w.atk ?? w.dmg;
  return typeof d === 'number' && d > 0 ? d : 12;
}
