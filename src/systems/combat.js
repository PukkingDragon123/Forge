// Auto-battle simulation with timing windows. The combat scene feeds inputs (strike/guard/special)
// and renders the events this produces. Also usable headless for balance sims.
import { MONSTERS } from '../data/monsters.js';

export const HP_SCALE = [1, 2.2, 4.5, 10, 17, 30];
export const DMG_SCALE = [1, 1.2, 1.4, 1.6, 1.72, 1.85];
const HP_BASE = 10;

export function monsterStats(id, region) {
  const d = MONSTERS[id];
  const r = Math.max(0, d.region >= 0 ? d.region : region);
  const hp = Math.round(d.hp * HP_BASE * HP_SCALE[r]);
  return { def: d, hp, maxHp: hp, dmg: d.dmg * DMG_SCALE[r], armor: d.armor * HP_SCALE[r] * 2, region: r };
}

/** Bare-hands weapon for when nothing could be forged. */
export const FISTS = { name: 'Bare Fists', bp: 'fists', dmg: 3, interval: 0.8, critMult: 1.5, critChance: 0, el: {}, stats: {}, flags: {}, multi: 0, harvest: 1, stun: 0, pierce: false, pierceFlat: 0, parryBonus: 1, ids: [], grade: 0, synergies: [] };

export class CombatSim {
  /**
   * player: { hp, maxHp, char, coins }  weapon: finalized weapon  monsterId, region
   */
  constructor(player, weapon, monsterId, region, opts = {}) {
    this.p = player;
    this.w = weapon;
    const ms = monsterStats(monsterId, region);
    this.m = { ...ms, id: monsterId, atkTimer: 1.6 + (weapon.flags && weapon.flags.fear ? 1.5 : 0), attack: null, st: { burn: 0, chill: 0, frozen: 0, poison: 0, bleed: 0, stun: 0, cracked: 0 }, phase: 0, speed: 1, dead: false };
    this.rng = opts.rng || Math.random;
    this.t = 0;
    this.events = [];
    this.swing = null;
    this.swingCount = 0;
    this.atkTimer = weapon.firstStrike ? 0.2 : 0.9;
    this.special = 0;
    this.grit = 0;
    this.hits = 0;
    this.dotTimer = 1;
    this.kindleTimer = 3;
    this.pst = { web: 0, daze: 0, poison: 0, burn: 0, cracked: 0 };
    this.guardAt = -9;
    this.over = false; this.won = false;
    this.coinsGained = 0; this.coinsLost = 0;
    this.stats = { crits: 0, parries: 0, blocks: 0, taken: 0, dealt: 0 };
    this.paused = false;
    const ch = player.char;
    this.critEvery = ch === 'clover' || weapon.bp === 'hammer' ? 1 : 2;
    this.windowScale = (ch === 'durgan' ? 1.6 : 1) * (weapon.parryBonus || 1);
    this.firstFree = !!weapon.firstStrike;
  }
  emit(type, data = {}) { this.events.push({ type, t: this.t, ...data }); }
  drain() { const e = this.events; this.events = []; return e; }

  // ----------------------------------------------------------------- inputs
  /** Player pressed strike at current time. */
  pressStrike() {
    const s = this.swing;
    if (!s || s.pressed) return;
    s.pressed = true;
    if (!s.critRing) return;
    const d = Math.abs(this.t - s.impact);
    const win = s.critWin;
    s.result = d <= win ? 'crit' : d <= win * 2.2 ? 'good' : 'whiff';
    this.emit('critInput', { result: s.result });
  }
  pressGuard() {
    this.guardAt = this.t;
    const a = this.m.attack;
    if (a && !a.resolved && Math.abs(this.t - a.impact) <= this.parryWin(a)) { a.parried = true; }
    this.emit('guard');
  }
  parryWin() { return 0.11 * this.windowScale; }
  blockWin() { return 0.4 * this.windowScale; }

  // ----------------------------------------------------------------- loop
  update(dt) {
    if (this.over || this.paused) return;
    this.t += dt;
    for (const k in this.pst) this.pst[k] = Math.max(0, this.pst[k] - dt);
    const m = this.m;
    m.st.stun = Math.max(0, m.st.stun - dt);
    m.st.frozen = Math.max(0, m.st.frozen - dt);

    // --- player swing cycle
    if (!this.swing) {
      this.atkTimer -= dt;
      if (this.atkTimer <= 0) this.startSwing();
    } else if (this.t >= this.swing.impact + (this.swing.critRing ? 0.06 : 0)) {
      this.resolveSwing();
    }

    // --- DoTs
    this.dotTimer -= dt;
    if (this.dotTimer <= 0) { this.dotTimer += 1; this.tickDots(); }

    // --- Kindle (Elio)
    if (this.p.char === 'elio') {
      this.kindleTimer -= dt;
      if (this.kindleTimer <= 0) {
        this.kindleTimer = 3;
        const el = this.topElement() || 'fire';
        const dmg = Math.max(2, Math.round(this.w.dmg * 0.35 * (this.topElement() ? 1 : 0.6)));
        this.applyStatus(el, 1);
        this.damageMonster(dmg, { source: 'kindle', element: el });
      }
    }

    // --- monster cycle
    if (m.dead) return;
    if (m.attack) {
      const a = m.attack;
      if (!a.resolved && this.t >= a.impact) this.resolveMonsterAttack(a);
      if (a.resolved && this.t >= a.end) m.attack = null;
    } else if (m.st.stun <= 0 && m.st.frozen <= 0) {
      const chill = Math.min(0.6, m.st.chill * 0.06);
      const slow = (this.w.stats.slow || 0) / 100;
      m.atkTimer -= dt * m.speed * (1 - chill) / (1 + slow);
      if (m.atkTimer <= 0) this.startMonsterAttack();
    }
  }

  topElement() {
    const el = this.w.el || {};
    let best = null;
    for (const k of ['fire', 'ice', 'shock', 'poison', 'curse', 'holy']) if ((el[k] || 0) > 0 && (!best || el[k] > el[best])) best = k;
    return best;
  }

  startSwing() {
    this.swingCount++;
    const iv = this.w.interval * (this.pst.web > 0 && !(this.w.el.fire > 0) ? 1.4 : 1);
    const windup = Math.min(0.85, Math.max(0.32, iv * 0.55)) * (this.p.char === 'clover' ? 0.85 : 1);
    const critRing = this.firstFree ? false : this.swingCount % this.critEvery === 0;
    const critWin = (this.p.char === 'clover' ? 0.11 : 0.085) * (this.pst.daze > 0 ? 0.55 : 1) * (1 + (this.w.critChance || 0) * 0.5);
    this.swing = { start: this.t, impact: this.t + windup, windup, critRing, critWin, pressed: false, result: null };
    this.atkTimer = Math.max(0.12, iv - windup);
    this.emit('swing', { windup, critRing });
  }

  resolveSwing() {
    const s = this.swing;
    this.swing = null;
    if (this.firstFree) { this.firstFree = false; this.emit('firstStrike'); }
    const m = this.m;
    let crit = s.result === 'crit';
    if (!crit && s.result !== 'whiff' && this.rng() < (this.w.critChance || 0)) crit = true;
    if (this.w.stats.firstCrit && this.hits === 0) crit = true;
    if (!crit && m.def.dodge && this.rng() < m.def.dodge) { this.emit('miss'); return; }
    let dmg = this.w.dmg;
    if (crit) dmg *= this.w.critMult;
    if (s.result === 'whiff') dmg *= 0.6;
    this.hits++;
    if (this.w.flags.steam && this.hits % 4 === 0) { dmg *= 2; this.emit('reaction', { name: 'STEAM BURST' }); }
    this.dealHit(dmg, { crit, whiff: s.result === 'whiff' });
    for (let i = 0; i < (this.w.multi || 0); i++) this.dealHit(this.w.dmg * 0.5, { extra: true });
    this.special = Math.min(1, this.special + (crit ? 0.15 : 0.08) * (1 + (this.w.stats.charge || 0) / 100));
    if (crit) this.stats.crits++;
    if (this.w.flags.regen && this.hits % 3 === 0) this.healPlayer(this.w.flags.regen);
    if (this.w.stats.drain) this.hurtPlayer(this.w.stats.drain, { self: true });
    if (this.w.stats.greed) this.gainCoins(this.w.stats.greed);
  }

  dealHit(base, info = {}) {
    const m = this.m;
    if (m.dead) return 0;
    let dmg = base * (1 + this.grit * 0.08);
    const d = m.def;
    const el = this.w.el || {};
    const top = this.topElement();
    if (top && d.weak.includes(top)) dmg *= 1.5;
    if (top && d.resist.includes(top)) dmg *= 0.6;
    if (el.holy && d.weak.includes('holy')) dmg *= 1 + 0.25 * Math.min(8, el.holy);
    if (el.curse) dmg *= 1 + 0.12 * el.curse;
    if (this.w.flags.superconduct && m.st.frozen > 0) dmg *= 1.5;
    if (this.w.flags.mycel && m.st.poison > 0) dmg *= 2;
    if (this.pst.cracked > 0) dmg *= 0.8;
    const armor = this.w.pierce ? 0 : Math.max(0, m.armor - (this.w.pierceFlat || 0) * HP_SCALE[m.region] * 2);
    dmg = Math.max(1, Math.round(dmg - armor));
    this.damageMonster(dmg, info);
    // on-hit statuses
    if (el.fire) this.applyStatus('fire', el.fire);
    if (el.ice) this.applyStatus('ice', el.ice);
    if (el.poison) this.applyStatus('poison', el.poison);
    if (el.bleed) this.applyStatus('bleed', el.bleed);
    if (el.shock && this.rng() < Math.min(0.5, 0.06 * el.shock)) {
      m.st.stun = Math.max(m.st.stun, 0.7);
      const arc = Math.max(1, Math.round(dmg * 0.15 * Math.min(6, el.shock)));
      this.damageMonster(arc, { element: 'shock', arc: true });
      if (this.w.flags.plasma && m.st.burn) this.damageMonster(Math.round(m.st.burn * this.dotBase(0.08)), { element: 'fire' });
      this.emit('stun', { by: 'shock' });
    }
    if (this.w.stun && this.rng() < this.w.stun) { m.st.stun = Math.max(m.st.stun, 0.6); this.emit('stun', { by: 'weapon' }); }
    if (this.w.stats.lifesteal) this.healPlayer(Math.max(1, Math.round(this.p.maxHp * this.w.stats.lifesteal / 100 * 0.25)));
    return dmg;
  }

  dotBase(f) { return Math.max(1, this.w.dmg * f); }
  applyStatus(el, n) {
    const st = this.m.st;
    if (el === 'fire') st.burn = Math.min(st.burn + n, 30);
    else if (el === 'poison') st.poison = Math.min(st.poison + n, 40);
    else if (el === 'bleed') st.bleed = Math.min(st.bleed + n, 30);
    else if (el === 'ice') {
      st.chill += n;
      if (st.chill >= 5) { st.chill = 0; st.frozen = 1.6; this.emit('freeze'); if (this.m.attack && !this.m.attack.resolved) { this.m.attack = null; this.emit('interrupt'); } }
    }
  }
  tickDots() {
    const st = this.m.st;
    if (this.m.dead) return;
    if (st.burn > 0) { this.damageMonster(Math.round(st.burn * this.dotBase(0.06)), { element: 'fire', dot: true }); st.burn = Math.max(0, st.burn - 1); }
    if (st.poison > 0) {
      const tox = this.w.flags && this.w.synergies && this.w.synergies.includes('toxicflame') ? 1.5 : 1;
      this.damageMonster(Math.round(st.poison * this.dotBase(0.04) * tox), { element: 'poison', dot: true });
      st.poison = Math.min(40, st.poison + 1);
    }
    if (st.bleed > 0) { this.damageMonster(Math.round(st.bleed * this.dotBase(0.05)), { element: 'bleed', dot: true }); st.bleed = Math.max(0, st.bleed - 1); }
    if (this.pst.poison > 0) this.hurtPlayer(1, { dot: 'poison' });
    if (this.pst.burn > 0) this.hurtPlayer(2, { dot: 'fire' });
  }

  damageMonster(dmg, info = {}) {
    const m = this.m;
    if (m.dead) return;
    m.hp -= dmg;
    this.stats.dealt += dmg;
    this.emit('mhit', { dmg, ...info });
    // phases
    const phases = m.def.phases || [];
    while (m.phase < phases.length && m.hp / m.maxHp <= phases[m.phase].at && m.hp > 0) {
      const ph = phases[m.phase];
      m.phase++;
      if (ph.speed) m.speed = ph.speed;
      if (ph.armor !== undefined) m.armor = ph.armor * HP_SCALE[m.region] * 2;
      this.emit('phase', { phase: m.phase, text: ph.text, event: ph.event });
      if (ph.event === 'shatter') { this.paused = true; }
    }
    if (m.hp <= 0) { m.hp = 0; m.dead = true; this.over = true; this.won = true; this.emit('victory'); }
  }

  startMonsterAttack() {
    const m = this.m;
    const opts = m.def.attacks.filter((a) => !a.phase || a.phase <= m.phase + 1);
    let total = opts.reduce((s, a) => s + (a.weight ?? 1), 0);
    let r = this.rng() * total;
    let a = opts[0];
    for (const o of opts) { r -= o.weight ?? 1; if (r <= 0) { a = o; break; } }
    const windup = a.windup / Math.max(0.7, m.speed * 0.9);
    const hits = a.kind === 'multi' ? a.hits || 3 : 1;
    m.attack = { def: a, start: this.t, impact: this.t + windup, end: this.t + windup + 0.25 + (hits - 1) * 0.16, hits, resolved: false, parried: false };
    m.atkTimer = m.def.interval * (0.85 + this.rng() * 0.3);
    this.emit('telegraph', { attack: a, windup, kind: a.kind });
  }

  resolveMonsterAttack(a) {
    a.resolved = true;
    const m = this.m;
    const def = a.def;
    if (m.st.stun > 0 || m.st.frozen > 0) { this.emit('interrupt'); return; }
    if (this.w.stats.miss && this.rng() < this.w.stats.miss / 100) { this.emit('pmiss'); return; }
    const since = this.t - this.guardAt;
    const parried = a.parried || Math.abs(since) <= this.parryWin();
    const blocked = !parried && since >= 0 && since <= this.blockWin() && def.kind !== 'unblockable';
    let dmg = m.dmg * def.dmg * a.hits;
    if (parried) {
      this.stats.parries++;
      this.special = Math.min(1, this.special + 0.2);
      if (this.p.char === 'durgan') this.grit = Math.min(5, this.grit + 1);
      this.emit('parry', { attack: def });
      // riposte
      this.dealHit(this.w.dmg * 0.75, { riposte: true });
      m.atkTimer += 0.5;
      return;
    }
    if (blocked) {
      this.stats.blocks++;
      let pct = Math.min(0.9, 0.5 + (this.w.stats.block || 0) / 100);
      if (def.kind === 'heavy') pct *= 0.6;
      dmg *= 1 - pct;
      if (this.p.char === 'durgan' && since <= this.parryWin() * 2.5) this.grit = Math.min(5, this.grit + 1);
      this.emit('block', { attack: def, pct });
    }
    dmg = Math.max(1, Math.round(dmg));
    this.hurtPlayer(dmg, { attack: def, blocked, hits: a.hits });
    if (!blocked) {
      if (def.effect === 'steal') { const c = Math.min(this.p.coins, 4 + Math.round(this.rng() * 6)); this.p.coins -= c; this.coinsLost += c; this.emit('steal', { coins: c }); }
      if (def.effect === 'daze') { this.pst.daze = 3; this.emit('status', { st: 'daze' }); }
      if (def.effect === 'web') { this.pst.web = 4; this.emit('status', { st: 'web' }); }
      if (def.effect === 'poison') { this.pst.poison = 4; this.emit('status', { st: 'poison' }); }
      if (def.effect === 'burn') { this.pst.burn = 3; this.emit('status', { st: 'burn' }); }
      if (def.effect === 'crack') { this.pst.cracked = 99; this.emit('status', { st: 'cracked' }); }
    }
    if (def.effect === 'heal') { const h = Math.round(m.maxHp * 0.06); m.hp = Math.min(m.maxHp, m.hp + h); this.emit('mheal', { amount: h }); }
  }

  hurtPlayer(dmg, info = {}) {
    if (this.over) return;
    this.p.hp -= dmg;
    this.stats.taken += dmg;
    this.emit('phit', { dmg, ...info });
    if (this.p.hp <= 0) { this.p.hp = 0; this.over = true; this.won = false; this.emit('defeat'); }
  }
  healPlayer(n) {
    const before = this.p.hp;
    this.p.hp = Math.min(this.p.maxHp, this.p.hp + n);
    if (this.p.hp > before) this.emit('pheal', { amount: this.p.hp - before });
  }
  gainCoins(n) {
    const c = this.p.char === 'clover' ? Math.ceil(n * 1.5) : n;
    this.p.coins += c; this.coinsGained += c;
    this.emit('coins', { coins: c });
  }

  /** Special attack. quality 0..1 from the special QTE. */
  useSpecial(quality = 0.5) {
    if (this.special < 1 || this.over) return 0;
    this.special = 0;
    const mul = 3 + quality * 3;
    const el = this.w.el || {};
    for (const k of ['fire', 'ice', 'poison', 'bleed']) if (el[k]) this.applyStatus(k, el[k] * 2);
    const dmg = this.dealHit(this.w.dmg * mul, { special: true, crit: quality > 0.8 });
    this.m.st.stun = Math.max(this.m.st.stun, 1.0);
    return dmg;
  }

  /** Swap weapon mid-fight (Cursed Lord shatter phase). */
  rearm(weapon) { this.w = weapon; this.paused = false; this.swing = null; this.atkTimer = 0.5; this.pst.cracked = 0; }
}

/** Headless bot fight for balance testing. skill 0..1 = chance to nail timings. */
export function simulateFight(player, weapon, monsterId, region, skill = 0.6, maxT = 180) {
  const sim = new CombatSim({ ...player }, weapon, monsterId, region);
  const dt = 1 / 30;
  while (!sim.over && sim.t < maxT) {
    if (sim.swing && sim.swing.critRing && !sim.swing.pressed && sim.t >= sim.swing.impact - 0.03 && Math.random() < skill) sim.pressStrike();
    const a = sim.m.attack;
    if (a && !a.resolved && sim.t >= a.impact - 0.05 && sim.guardAt < a.start) {
      if (Math.random() < skill) sim.pressGuard();
      else sim.guardAt = a.start; // mark as handled (missed)
    }
    if (sim.special >= 1) sim.useSpecial(skill);
    if (sim.paused) sim.rearm(weapon);
    sim.update(dt);
  }
  return { won: sim.won, t: sim.t, hp: sim.p.hp, taken: sim.stats.taken };
}
