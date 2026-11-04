// The player: Hades-feel controller. Snappy movement, a 2-charge dash with i-frames and after-images,
// 3-hit weapon combos with lunges and hit-stop, dash-strikes, a special per weapon type, 2 crafted
// skills, interactables, hurt/i-frames/death. Input is sampled once per rendered frame and buffered;
// the simulation steps at 60 Hz in ActionWorld.
import * as THREE from 'three';
import { Entity } from './entity.js';
import { movesetOf, weaponBase, specialOf, REF } from './weapons.js';
import { castSkill, skillDef } from './skills.js';
import { drawControls } from './touch.js';
import * as Chars from '../models/characters.js';
import * as W3D from '../models/weapons3d.js';
import { CHARACTERS } from '../data/characters.js';

export const FEEL = {
  speed: 5.6,        // m/s
  accelT: 0.06,      // s to reach target velocity (time constant)
  turnRate: 22,      // rad/s while moving
  dashT: 0.17, dashD: 4.2, dashIFrames: 0.2, dashRecharge: 0.85, dashCharges: 2,
  dashAtkWindow: 0.15,
  hurtIFrames: 0.6, hurtStagger: 0.16,
  buffer: 0.25, comboReset: 0.5,
  autoAimCone: (70 * Math.PI) / 180, autoAimRange: 6,
};
// loadout stats (systems/loadout.js): dmg/atkSpd/moveSpd/skillCd are multipliers (1 = none), crit 0..1,
// critDmg ×, status = on-hit chances 0..1 per status, procs = [{ on, effect, chance, power }]
const DEFAULT_STATS = { dmg: 1, atkSpd: 1, moveSpd: 1, skillCd: 1, crit: 0.05, critDmg: 1.5, maxHp: 0, armor: 0, dashCharges: 2, lifesteal: 0, thorns: 0, regen: 0, status: {}, procs: [], element: null, lootLuck: 0, oreLuck: 0, pickPower: 1, pickupRadius: 1.2, petrify: 0 };
const STATUS_DUR = { poison: 3, burn: 3, slow: 2, freeze: 1.2, bleed: 3, stun: 0.45, root: 2 };
const clampK = (v, a, b) => (v < a ? a : v > b ? b : v);
const ELEMENT_FX = { burn: '#ff8a3a', fire: '#ff8a3a', poison: '#8aff5a', freeze: '#9ae8ff', ice: '#9ae8ff', shock: '#bff4ff', bleed: '#ff4a5a', stun: '#ffe85a' };
const ELEMENT_STATUS = { fire: 'burn', burn: 'burn', ice: 'freeze', freeze: 'freeze', poison: 'poison', shock: 'stun', stun: 'stun', bleed: 'bleed', slow: 'slow', root: 'root' };
const angOf = (x, z) => Math.atan2(x, z);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** Play the first animation the model knows; returns the name played or null. */
export function tryPlay(model, names, opts = {}) {
  if (!model || !model.play) return null;
  for (const n of [].concat(names)) {
    if (!n) continue;
    const before = model.anim;
    model.play(n, { restart: true, ...opts });
    if (model.anim === n || (before !== n && model.anim !== before)) return n;
  }
  return null;
}

function fallbackModel(color = '#c8743a') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.4, 3, 8), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.48;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), new THREE.MeshLambertMaterial({ color: '#f0d0a0' }));
  nose.position.set(0, 0.62, 0.26);
  g.add(body, nose);
  return { group: g, anim: 'idle', play(a) { this.anim = a; }, update() {}, flash() {}, hold() {} };
}

/** A burning floor patch (ember dash trails, fire_trail procs). */
export function firePatch(P, w, x, z, r, life, tick, dmg, burn) {
  w.fx.disc(x, z, r, '#ff6a1a', { life, alpha: 0.7, pulse: true });
  w.every(tick, Math.max(1, Math.floor(life / tick)), () => {
    w.areaDamage({ shape: 'circle', x, z, r }, P.skillHit(dmg, { kb: 0, status: { burn }, quiet: true, hitstop: 0, tag: 'proc' }));
    w.fx.glow(x, 0.15, z, ['#ffb03a', '#ff6a1a', '#ffe08a'], 2, { spread: r * 0.6, vel: [0, 1.4, 0] });
  });
}
/** Loadout proc effects (data/items.js): power = damage / heal / strength. */
export const PROCS = {
  spores(P, w, power) {
    const x = P.x, z = P.z;
    w.fx.disc(x, z, 1.8, '#6ac83a', { life: 2.5, alpha: 0.4, pulse: true });
    w.fx.smoke(x, 0.3, z, ['#7ab84a', '#9ad86a'], 10, { spread: 0.8, rise: 0.25 });
    w.every(0.5, 5, () => w.areaDamage({ shape: 'circle', x, z, r: 1.8 }, P.skillHit(power * 0.5, { kb: 0, status: { poison: 3 }, quiet: true, hitstop: 0, tag: 'proc' })));
  },
  fire_trail(P, w, power) { firePatch(P, w, P.x, P.z, 0.7, 2.2, 0.4, power * 0.5, 2); },
  shock(P, w, power, target) {
    const t = target && !target.dead ? target : w.nearestEnemy(P.x, P.z, 6);
    if (!t) return;
    const pts = [new THREE.Vector3(t.x, (t.height || 1) * 0.6, t.z)];
    let cur = t; const seen = new Set([t]);
    for (let i = 0; i < 2; i++) { const n = w.nearestEnemy(cur.x, cur.z, 4, (e) => !seen.has(e)); if (!n) break; seen.add(n); pts.push(new THREE.Vector3(n.x, (n.height || 1) * 0.6, n.z)); cur = n; }
    [...seen].forEach((e, i) => { if (i > 0 || e !== target) w.damage(e, P.skillHit(power, { kb: 0.2, stun: 0.2, tag: 'proc', hitstop: 0 })); });
    if (pts.length > 1) w.fx.bolt(pts, '#bff4ff', { life: 0.2 });
    w.fx.spark(t.x, 0.8, t.z, '#bff4ff', 8);
  },
  heal(P, w, power) { w.heal(P, power); w.fx.glow(P.x, 0.8, P.z, ['#7aff9a', '#ffffff'], 8, { spread: 0.3, vel: [0, 1.2, 0] }); },
  burst(P, w, power) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      w.spawnProjectile({ team: 'player', x: P.x, z: P.z, y: 0.6, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: 13, radius: 0.15, dmg: power * (P.stats.dmg || 1), kb: 0.4, life: 0.45, color: '#c8baa8', source: P, pierce: 1 });
    }
    w.fx.ring(P.x, P.z, 1.5, '#e8d8b8', { life: 0.25 });
  },
  shield(P, w) { P.shield = Math.max(P.shield, 1); w.fx.ring(P.x, P.z, 0.8, '#9ae8ff', { life: 0.35 }); },
  slow_field(P, w, power) {
    const x = P.x, z = P.z, r = 2.4;
    w.fx.disc(x, z, r, '#7a9aff', { life: 3, alpha: 0.35, pulse: true });
    w.every(0.5, 6, () => w.areaDamage({ shape: 'circle', x, z, r }, P.skillHit(power * 0.2, { kb: 0, status: { slow: 1 }, quiet: true, hitstop: 0, tag: 'proc' })));
  },
};

export class Player extends Entity {
  constructor(world, charId = 'durgan', loadout = {}, opts = {}) {
    super({ team: 'player', radius: 0.36, mass: 1.3 });
    this.world = world;
    this.charId = charId;
    this.moveSelf = true;
    this.controls = opts.controls !== false;
    this.state = 'move'; this.stateT = 0; this.stateDur = 0; this.stateOpts = {};
    this.facing = opts.facing ?? Math.PI; // face north (into the room) by default
    this.aimX = 0; this.aimZ = -1;
    this.inMove = { x: 0, z: 0 };
    this.queue = [];
    this.holdAttack = false;
    this.combo = 0; this.comboT = 9; this.atk = null;
    this.dash = null; this.sinceDash = 9; this.dashT = 0;
    this.specialCd = 0;
    this.skills = [null, null]; this.skillCd = [0, 0]; this.skillCdMax = [1, 1];
    this.interactTarget = null;
    this.ghosting = false;
    this.height = 1.0;
    this.lifeAcc = 0;
    this.buffs = {};          // timed effects from skills: { ember: { until, d } }
    this.shield = 0;          // hits blocked (shield proc)
    this.mouseAim = new THREE.Vector3();
    this.hasMouseAim = false;
    // model
    let m = null;
    try { if (typeof Chars.buildCharacter === 'function') m = Chars.buildCharacter(charId); } catch (e) { console.warn('player model', e); }
    this.model = m || fallbackModel();
    if (this.model.height) this.height = this.model.height;
    // a warm key light that keeps the hero readable, and a soft team ring under the feet
    this.light = new THREE.PointLight(0xffd8a8, 1.3, 5, 1.8);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.32, depthWrite: false }));
    this.ring.renderOrder = 3;
    world.scene.add(this.light, this.ring);
    // hp: run → opts → character data
    const run = world.game && world.game.run;
    const base = (CHARACTERS[charId] && CHARACTERS[charId].hp) || 100;
    this.applyLoadout(loadout, { keepHp: false });
    this.maxHp = opts.maxHp ?? loadout.maxHp ?? (run && run.maxHp) ?? base + (this.stats.maxHp || 0);
    this.hp = Math.min(this.maxHp, opts.hp ?? loadout.hp ?? (run && run.hp) ?? this.maxHp);
    this.unsub = world.on('roomCleared', () => { this.proc('roomClear'); if (this.stats.regen > 0 && !this.dead) world.heal(this, this.stats.regen); });
    this.dashCharges = this.dashMax;
    world.setPlayer(this);
  }

  // ---------------------------------------------------------------- loadout
  /** loadout = computeLoadout(run): { weapon, skills:[id|null,id|null], stats:{…} } */
  applyLoadout(loadout = {}, o = {}) {
    this.loadout = loadout;
    this.stats = { ...DEFAULT_STATS, ...(loadout.stats || {}) };
    this.weapon = loadout.weapon || null;
    const type = this.weapon ? this.weapon.type || this.weapon.bp || 'axe' : 'pickaxe';
    const base = movesetOf(type);
    // reach and knockback scale from the type's reference; specials come from the weapon's special id
    const ref = REF[type] || REF.axe;
    const rk = this.weapon && this.weapon.range ? clampK(this.weapon.range / ref[0], 0.7, 1.5) : 1;
    const kk = this.weapon && this.weapon.kb !== undefined ? clampK(this.weapon.kb / ref[1], 0.5, 2) : 1;
    const scale = (m) => ({ ...m, r: m.r && m.r * rk, len: m.len && m.len * rk, range: m.range && m.range * rk, quake: m.quake && m.quake * Math.sqrt(rk), kb: (m.kb || 0) * kk });
    this.moves = { ...base, combo: base.combo.map(scale), dash: scale(base.dash), special: this.weapon ? specialOf(this.weapon) : base.special };
    this.base = this.weapon ? weaponBase(this.weapon) : 6;
    this.atkMul = (this.stats.atkSpd || 1) * ((this.weapon && this.weapon.speed) || 1);
    this.armor = this.stats.armor || 0;
    this.dashMax = Math.max(1, this.stats.dashCharges || FEEL.dashCharges);
    if (this.dashCharges > this.dashMax) this.dashCharges = this.dashMax;
    const sk = loadout.skills || [null, null];
    for (let i = 0; i < 2; i++) {
      const id = sk[i] || null;
      if (this.skills[i] !== id) { this.skills[i] = id; this.skillCd[i] = 0; }
      const d = id && skillDef(id);
      this.skillCdMax[i] = d ? d.cd * (this.stats.skillCd || 1) : 1;
    }
    if (o.keepHp !== false && this.maxHp && loadout.maxHp) {
      const grow = loadout.maxHp - this.maxHp;
      this.maxHp = loadout.maxHp;
      this.hp = Math.min(this.maxHp, this.hp + Math.max(0, grow));
    }
    this.equipMesh();
  }
  equipMesh() {
    if (!this.model || !this.model.hold) return;
    let mesh = null;
    try {
      const w = this.weapon || { bp: 'pickaxe', ids: ['iron'], grade: 1 };
      const look = w.look || { bp: w.type || w.bp || 'axe', ids: w.ids || ['iron', 'iron'], el: w.el, grade: w.grade ?? 1 };
      if (typeof W3D.buildWeaponMesh === 'function') mesh = W3D.buildWeaponMesh(look);
    } catch (e) { mesh = null; }
    if (mesh) { this.model.hold(mesh, 'right'); this.weaponMesh = mesh; }
  }
  lockInput(b = true) { this.controls = !b; if (b) { this.queue = []; this.inMove = { x: 0, z: 0 }; this.holdAttack = false; } }

  // ---------------------------------------------------------------- input (per rendered frame)
  sample() {
    const g = this.world.game, inp = g && g.input;
    if (!inp || !this.controls || this.dead) { this.inMove.x = 0; this.inMove.z = 0; this.holdAttack = false; return; }
    let mx = 0, mz = 0;
    if (inp.action('left')) mx -= 1;
    if (inp.action('right')) mx += 1;
    if (inp.action('up')) mz -= 1;
    if (inp.action('down')) mz += 1;
    if (inp.stick && inp.stick.on && (inp.stick.dx || inp.stick.dy)) { mx = inp.stick.dx; mz = inp.stick.dy; }
    const L = Math.hypot(mx, mz);
    if (L > 1) { mx /= L; mz /= L; }
    this.inMove.x = mx; this.inMove.z = mz;
    const touch = inp.touch;
    const ui = g.ui;
    const overUI = !!(ui && ui.overUI && ui.overUI());
    // desktop: aim at the mouse on the floor
    this.hasMouseAim = false;
    if (!touch && inp.x > -900 && ui) {
      const p = this.world.cam.groundAt(inp.x, inp.y, ui.w, ui.h, this.mouseAim);
      if (p) this.hasMouseAim = true;
    }
    const now = this.world.time;
    const push = (k) => { this.queue.push({ k, t: now }); };
    if (inp.actionPressed('a_attack') || (!touch && !overUI && inp.pressed)) push('attack');
    this.holdAttack = inp.action('a_attack') || (!touch && !overUI && inp.down) || (touch && inp.held.has('a_attack'));
    if (inp.actionPressed('a_dash')) push('dash');
    if (inp.actionPressed('a_special') || (!touch && !overUI && inp.rpressed)) push('special');
    if (inp.actionPressed('a_skill1')) push('skill0');
    if (inp.actionPressed('a_skill2')) push('skill1');
    if (inp.actionPressed('a_interact')) push('interact');
  }
  /** Take a buffered command (younger than the buffer window). */
  take(k) {
    const now = this.world.time;
    this.queue = this.queue.filter((q) => now - q.t <= FEEL.buffer);
    const i = this.queue.findIndex((q) => q.k === k);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    return true;
  }
  peek(k) { const now = this.world.time; return this.queue.some((q) => q.k === k && now - q.t <= FEEL.buffer); }

  // ---------------------------------------------------------------- aim helpers
  moveDir() { const L = Math.hypot(this.inMove.x, this.inMove.z); return L > 0.2 ? { x: this.inMove.x / L, z: this.inMove.z / L } : null; }
  /** Where the player means to hit: mouse on desktop, auto-aim (cone around stick/facing) on touch/keys. */
  resolveAim(auto = true) {
    if (this.hasMouseAim) {
      const dx = this.mouseAim.x - this.x, dz = this.mouseAim.z - this.z, L = Math.hypot(dx, dz);
      if (L > 0.15) return { x: dx / L, z: dz / L };
    }
    const want = this.moveDir() || { x: Math.sin(this.facing), z: Math.cos(this.facing) };
    if (auto) {
      const w = this.world;
      let best = null, bs = -1e9;
      for (const e of w.enemies) {
        if (e.dead || e.untargetable) continue;
        const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz);
        if (d > FEEL.autoAimRange || d < 1e-3) continue;
        const cos = (dx * want.x + dz * want.z) / d;
        const inCone = Math.acos(Math.max(-1, Math.min(1, cos))) <= FEEL.autoAimCone / 2;
        const close = d < 1.6;
        if (!inCone && !close) continue;
        const s = cos * 2 - d * 0.35;
        if (s > bs) { bs = s; best = { x: dx / d, z: dz / d }; }
      }
      if (best) return best;
    }
    return want;
  }
  /** Aim point on the floor up to `range` metres away (mouse point, or the auto-aim target). */
  aimPoint(range = 6) {
    if (this.hasMouseAim) {
      const dx = this.mouseAim.x - this.x, dz = this.mouseAim.z - this.z, L = Math.hypot(dx, dz);
      const k = L > range ? range / L : 1;
      return { x: this.x + dx * k, z: this.z + dz * k };
    }
    const a = this.resolveAim(true);
    const t = this.world.nearestEnemy(this.x + a.x * 2, this.z + a.z * 2, range);
    if (t && Math.hypot(t.x - this.x, t.z - this.z) <= range) return { x: t.x, z: t.z };
    return { x: this.x + a.x * Math.min(range, 3.5), z: this.z + a.z * Math.min(range, 3.5) };
  }

  // ---------------------------------------------------------------- damage helpers
  /** A skill hit: absolute damage (data/skills.js) scaled by the dmg stat, crits allowed. */
  skillHit(dmg, extra = {}) { return this.hitOf(1, { ...extra, base: dmg, noProc: extra.noProc ?? true }); }
  /** A hit from the player with buffs, crits and status procs folded in. */
  hitOf(mul, extra = {}) {
    const st = this.stats;
    let dmg = (extra.base ?? this.base) * mul * (st.dmg || 1);
    const crit = extra.crit !== undefined ? extra.crit : Math.random() < (st.crit || 0) + (extra.critBonus || 0);
    if (crit) dmg *= st.critDmg || 1.5;
    const status = { ...(extra.status || {}) };
    if (!extra.noProc) {
      const chances = { ...((this.weapon && this.weapon.status) || {}) };
      for (const [k, v] of Object.entries(st.status || {})) chances[k] = Math.max(chances[k] || 0, v);
      for (const [k, ch] of Object.entries(chances)) {
        if (!ch || Math.random() >= ch) continue;
        const key = ELEMENT_STATUS[k] || k;
        status[key] = Math.max(status[key] || 0, STATUS_DUR[key] || 2);
      }
    }
    const el = st.element || (this.weapon && this.weapon.element) || null;
    return { dmg, crit, kb: extra.kb ?? 0.5, dir: extra.dir || { x: this.aimX, z: this.aimZ }, stun: extra.stun, status: Object.keys(status).length ? status : null, source: this, heavy: extra.heavy, tag: extra.tag, hitstop: extra.hitstop, quiet: extra.quiet, element: el, petrify: (this.weapon && this.weapon.petrify) || 0, skill: !!extra.base };
  }
  onDealt(dmg, target, hit) {
    const ls = this.stats.lifesteal || 0;
    if (ls > 0) { this.lifeAcc += dmg * ls; if (this.lifeAcc >= 1) { const n = Math.floor(this.lifeAcc); this.lifeAcc -= n; this.world.heal(this, n, n < 3); } }
    if (hit && hit.tag !== 'dot' && hit.tag !== 'proc') {
      this.proc('hit', target);
      if (hit.crit) this.proc('crit', target);
      if (target.dead || target.hp <= 0) this.proc('kill', target);
    }
  }
  /** Fire the loadout's procs for an event: dash | hit | kill | crit | hurt | roomClear. */
  proc(on, target = null) {
    const list = this.stats.procs;
    if (!list || !list.length) return;
    for (const p of list) {
      if (p.on !== on) continue;
      if (Math.random() >= (p.chance ?? 1)) continue;
      const k = 'proc:' + (p.from || '') + p.effect;
      this.procCd = this.procCd || {};
      if ((this.procCd[k] || 0) > this.world.time) continue;
      this.procCd[k] = this.world.time + (on === 'hit' ? 0.4 : 0.15);
      PROCS[p.effect] && PROCS[p.effect](this, this.world, p.power || 5, target);
    }
  }
  onDamaged(dmg, hit, world) {
    if (this.state === 'dead') return dmg;
    if (this.shield > 0 && hit.tag !== 'dot') {
      this.shield--;
      world.fx.ring(this.x, this.z, 1, '#9ae8ff', { life: 0.3 });
      world.fx.number(this.x, 1.3, this.z, 'BLOCKED', 'status', { color: '#9ae8ff' });
      this.invuln = Math.max(this.invuln, 0.4);
      const au = world.game && world.game.audio; au && au.play('shield_block', { vol: 0.7 });
      return 0;
    }
    this.proc('hurt', hit.source);
    this.invuln = Math.max(this.invuln, FEEL.hurtIFrames);
    if (this.state !== 'dash' && this.state !== 'whirl') this.enterState('hurt', FEEL.hurtStagger);
    tryPlay(this.model, ['hurt']);
    if (this.model.setExpression) this.model.setExpression('hurt', { auto: true });
    const src = hit.source;
    if (this.stats.thorns && src && src.team === 'enemy' && !src.dead) world.damage(src, { dmg: this.stats.thorns, kb: 0.4, dir: { x: src.x - this.x, z: src.z - this.z }, source: this, quiet: false, hitstop: 0 });
    return dmg;
  }

  // ---------------------------------------------------------------- state helpers
  enterState(name, dur = 0, opts = {}) { this.state = name; this.stateT = 0; this.stateDur = dur; this.stateOpts = opts; }
  lunge(dir, dist, dur) { this.lungeV = { x: dir.x * (dist / dur), z: dir.z * (dist / dur), t: dur }; }
  canAct() { return !this.dead && (this.state === 'move' || this.state === 'hurt' && this.stateT > 0.08); }

  startDash(dir, o = {}) {
    if (!o.free) { if (this.dashCharges <= 0) return false; this.dashCharges--; if (this.dashT <= 0) this.dashT = FEEL.dashRecharge; }
    const d = dir || this.moveDir() || { x: Math.sin(this.facing), z: Math.cos(this.facing) };
    const dist = (o.dist ?? FEEL.dashD) * (1 + ((this.stats.moveSpd || 1) - 1) * 0.4);
    this.dash = { x: d.x, z: d.z, speed: dist / FEEL.dashT, t: 0, ghost: 0, color: o.color || this.moves.color, onStep: o.onStep };
    this.facing = angOf(d.x, d.z);
    this.atk = null;
    this.enterState('dash', FEEL.dashT);
    this.invuln = Math.max(this.invuln, FEEL.dashIFrames);
    this.ghosting = true;
    tryPlay(this.model, ['dash', 'dodge'], { speed: 1.6 });
    const w = this.world;
    w.fx.dust(this.x, this.z, 7, { speed: [0.8, 2.2] });
    w.fx.ring(this.x, this.z, 0.9, '#ffffff', { life: 0.18, alpha: 0.5 });
    w.cam.punch(d, 0.08);
    const au = w.game && w.game.audio; au && au.play(o.free ? 'dash_fire' : 'dash', { vol: 0.7, pitch: 0.95 + Math.random() * 0.1 });
    if (!o.free) this.proc('dash');
    const ember = this.buffs.ember;
    if (ember && ember.until > w.time && !o.onStep) {
      const d = ember.d, prev = { x: 1e9, z: 1e9 };
      this.dash.onStep = (x, z) => {
        if (Math.hypot(x - prev.x, z - prev.z) < d.trailWidth * 0.6) return;
        prev.x = x; prev.z = z;
        firePatch(this, w, x, z, d.trailWidth * 0.6, d.trailLife, d.tick, d.dmg, d.burn);
      };
    }
    w.emit('dash', { player: this });
    return true;
  }

  startAttack(dash = false) {
    const m = this.moves;
    const move = dash ? m.dash : m.combo[this.combo % m.combo.length];
    const aim = this.resolveAim(true);
    this.aimX = aim.x; this.aimZ = aim.z;
    this.facing = angOf(aim.x, aim.z);
    const sp = this.atkMul || 1;
    this.atk = { move, t: 0, hit: false, sp, wind: move.wind / sp, active: move.active / sp, rec: move.rec / sp, cancel: move.cancel / sp, dash, dir: aim, idx: this.combo };
    this.enterState('attack');
    // lunge: step toward the foe but stop short of it (Hades magnetism)
    let lunge = move.lunge || 0;
    const t = this.world.nearestEnemy(this.x + aim.x * 0.8, this.z + aim.z * 0.8, (move.r || move.len || 2) + 0.8);
    if (t) { const d = Math.hypot(t.x - this.x, t.z - this.z) - (t.radius + this.radius + 0.25); lunge = Math.max(0, Math.min(lunge, d)); }
    const lt = Math.max(0.05, this.atk.wind + this.atk.active);
    this.lungeV = { x: aim.x * (lunge / lt), z: aim.z * (lunge / lt), t: lt };
    const animSpeed = 1.6 * sp * (move.heavy ? 0.9 : 1.15);
    tryPlay(this.model, move.anim, { speed: animSpeed, weapon: this.weapon && this.weapon.bp });
    this.comboT = 0;
    if (!dash) this.combo = (this.combo + 1) % m.combo.length; else this.combo = 0;
    const au = this.world.game && this.world.game.audio; au && au.play(move.sound || 'swing', { vol: 0.55, pitch: (move.heavy ? 0.85 : 1) + Math.random() * 0.12 });
    this.world.emit('attack', { player: this, move });
  }

  /** The active frame of an attack: shape test, FX, feel. */
  strike(move, dir) {
    const w = this.world, x = this.x, z = this.z, ang = angOf(dir.x, dir.z);
    const hit = this.hitOf(move.mul, { kb: move.kb, stun: move.stun, heavy: move.heavy, dir, critBonus: move.crit || 0 });
    const col = (hit.element && ELEMENT_FX[hit.element]) || this.moves.color;
    let hits = [];
    if (move.shape === 'bolt') {
      const n = move.n || 1;
      for (let i = 0; i < n; i++) {
        const a = ang + (n === 1 ? 0 : (i / (n - 1) - 0.5) * (move.spread || 0.3));
        const h = this.hitOf(move.mul, { kb: move.kb });
        w.spawnProjectile({ team: 'player', x: x + Math.sin(a) * 0.45, z: z + Math.cos(a) * 0.45, y: 0.75, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: move.speed, radius: 0.2, dmg: h.dmg, crit: h.crit, kb: move.kb, life: move.range / move.speed, color: col, source: this, status: h.status, homing: 1.5 });
      }
      w.fx.glow(x + dir.x * 0.5, 0.8, z + dir.z * 0.5, [col, '#ffffff'], 6, { spread: 0.1 });
      w.fx.light(x + dir.x * 0.5, 1, z + dir.z * 0.5, col, 2.5, 4, 0.15);
      return;
    }
    if (move.shape === 'circle') hits = w.areaDamage({ shape: 'circle', x, z, r: move.r }, hit);
    else if (move.shape === 'line') hits = w.areaDamage({ shape: 'line', x: x - dir.x * 0.2, z: z - dir.z * 0.2, len: move.len + 0.2, width: move.width, dir }, hit);
    else hits = w.areaDamage({ shape: 'cone', x: x - dir.x * 0.15, z: z - dir.z * 0.15, r: move.r + 0.15, angle: move.arc, dir }, hit);
    // FX
    if (move.shape === 'line') w.fx.thrust(x + dir.x * 0.3, z + dir.z * 0.3, ang, move.len, { color: col, width: move.heavy ? 0.5 : 0.32 });
    else if (move.shape === 'circle' && !move.quake) w.fx.slash(x, z, ang, Math.PI * 1.95, move.r, { color: col, core: this.moves.core, width: 0.7, dir: 1, sweep: 0.08 });
    else if (move.shape !== 'circle') w.fx.slash(x, z, ang, move.arc, move.r, { color: col, core: this.moves.core, width: (move.fx && move.fx.width) || 0.55, dir: (move.fx && move.fx.dir) || 1, sweep: move.heavy ? 0.07 : 0.06, tilt: move.fx && move.fx.chop ? -0.25 : 0 });
    if (move.quake) {
      const qx = x + dir.x * (move.shape === 'circle' ? 0 : move.r * 0.6), qz = z + dir.z * (move.shape === 'circle' ? 0 : move.r * 0.6);
      w.fx.ring(qx, qz, move.quake, '#ffe8b0', { life: 0.3 });
      w.fx.dust(qx, qz, 12, { speed: [1, 3], spread: 0.4 });
      w.fx.chipsAt(qx, 0.1, qz, ['#8a7a64', '#6a5a48', '#a8987e'], 8, { speed: 2.4, up: 3 });
      w.fx.decal(qx, qz, move.quake * 0.45, '#2a2018', { life: 4, alpha: 0.4 });
      w.fx.light(qx, 0.6, qz, '#ffd8a0', 4, 5, 0.2);
      if (move.shape !== 'circle' && move.quake) hits = hits.concat(w.areaDamage({ shape: 'circle', x: qx, z: qz, r: move.quake * 0.75 }, { ...hit, mul: undefined, dmg: hit.dmg * 0.4, kb: 0.8, quiet: false }, { exclude: new Set(hits) }));
      w.shake(0.32);
    }
    if (hits.length) { w.cam.punch(dir, move.heavy ? 0.14 : 0.07); if (move.heavy) w.shake(0.2); }
  }

  startSpecial() {
    const sp = this.moves.special;
    if (!sp || this.specialCd > 0) return false;
    this.specialCd = sp.cd;
    const w = this.world, aim = this.resolveAim(true);
    this.aimX = aim.x; this.aimZ = aim.z; this.facing = angOf(aim.x, aim.z);
    this.atk = null;
    tryPlay(this.model, sp.anim || ['cast'], { speed: 1.6 });
    const au = w.game && w.game.audio; au && au.play(sp.sound || 'special', { vol: 0.75 });
    const col = this.moves.color;
    if (sp.kind === 'spin') {
      this.enterState('special', sp.hits * sp.gap + 0.12, { moveMul: 0.5 });
      w.every(sp.gap, sp.hits, (i) => {
        if (this.dead) return;
        w.areaDamage({ shape: 'circle', x: this.x, z: this.z, r: sp.r }, this.hitOf(sp.mul, { kb: sp.kb, heavy: i === sp.hits - 1 }));
        w.fx.slash(this.x, this.z, this.facing + i * 2.4, Math.PI * 1.95, sp.r, { color: col, core: this.moves.core, width: 0.85, dir: 1, sweep: sp.gap * 0.8 });
        w.fx.dust(this.x, this.z, 6, { speed: [1, 2.5] });
      });
    } else if (sp.kind === 'leap') {
      const p = this.aimPoint(sp.range);
      const [tx, tz] = w.grid.circleFree(p.x, p.z, this.radius) ? [p.x, p.z] : w.grid.freeNear(p.x, p.z, this.radius);
      this.leap = { x0: this.x, z0: this.z, x1: tx, z1: tz, t: 0, dur: sp.air };
      this.enterState('leap', sp.air + 0.18);
      this.invuln = Math.max(this.invuln, sp.air + 0.05);
      w.telegraph({ shape: 'circle', x: tx, z: tz, r: sp.r, dur: sp.air, color: '#ffd27a' });
      w.after(sp.air, () => {
        if (this.dead) return;
        const hits = w.areaDamage({ shape: 'circle', x: this.x, z: this.z, r: sp.r }, this.hitOf(sp.mul, { kb: sp.kb, stun: sp.stun, heavy: true }));
        w.fx.ring(this.x, this.z, sp.r, '#ffe8b0', { life: 0.35 }); w.fx.ring(this.x, this.z, sp.r * 0.6, '#ffffff', { life: 0.25 });
        w.fx.dust(this.x, this.z, 18, { speed: [1.5, 4], spread: 0.5 });
        w.fx.chipsAt(this.x, 0.1, this.z, ['#8a7a64', '#6a5a48', '#a8987e'], 14, { speed: 3, up: 3.5 });
        w.fx.decal(this.x, this.z, sp.r * 0.5, '#241a14', { life: 5, alpha: 0.45 });
        w.fx.light(this.x, 0.6, this.z, '#ffd8a0', 6, 6, 0.25);
        w.shake(0.55); w.hitStop(hits.length ? 0.1 : 0.05);
        au && au.play('slam', { vol: 0.9 });
      });
    } else if (sp.kind === 'thrust') {
      const exclude = new Set();
      this.startDash(aim, { free: true, dist: sp.len, color: col, onStep: (x, z) => { w.areaDamage({ shape: 'circle', x, z, r: sp.width * 0.75 }, this.hitOf(sp.mul, { kb: sp.kb, dir: aim, heavy: true }), { exclude }); } });
      this.enterState('dash', sp.dur);
      w.fx.thrust(this.x, this.z, this.facing, sp.len + 0.8, { color: col, width: 0.6, sweep: sp.dur });
    } else if (sp.kind === 'throw' || sp.kind === 'fan') {
      const n = sp.n || 1;
      this.enterState('special', 0.2, { moveMul: 0.4 });
      for (let i = 0; i < n; i++) {
        const a = this.facing + (n === 1 ? 0 : (i / (n - 1) - 0.5) * sp.spread);
        let model = null;
        try { if (typeof W3D.buildWeaponMesh === 'function') { model = W3D.buildWeaponMesh({ bp: this.weapon ? this.weapon.bp : 'dagger', ids: (this.weapon && this.weapon.ids) || ['iron'], grade: 1 }); model.scale.setScalar(0.7); } } catch (e) { model = null; }
        const h = this.hitOf(sp.mul, { kb: 0.6 });
        const pr = w.spawnProjectile({ team: 'player', x: this.x + Math.sin(a) * 0.4, z: this.z + Math.cos(a) * 0.4, y: 0.7, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: sp.speed, radius: sp.radius, dmg: h.dmg, crit: h.crit, kb: 0.6, pierce: sp.pierce ?? 0, life: sp.range / sp.speed, color: col, source: this, model, spin: model ? 0 : 10 });
        if (model) { model.rotation.set(Math.PI / 2, 0, -a); pr.spin = 0; pr.sync = function (dt) { this.mesh.position.set(this.x, this.y, this.z); this.mesh.rotation.y += dt * 18; if (Math.random() < 0.6) this.world.fx.glow(this.x, this.y, this.z, col, 1, { spread: 0.03, life: [0.1, 0.2] }); }; }
      }
    } else if (sp.kind === 'flurry') {
      this.enterState('special', sp.hits * sp.gap + 0.1, { moveMul: 0.35 });
      w.every(sp.gap, sp.hits, (i) => {
        if (this.dead) return;
        const dir = { x: Math.sin(this.facing), z: Math.cos(this.facing) };
        w.areaDamage({ shape: 'cone', x: this.x, z: this.z, r: sp.r, angle: sp.arc, dir }, this.hitOf(sp.mul, { kb: sp.kb, dir, critBonus: 0.1, hitstop: 0.02 }));
        w.fx.thrust(this.x + dir.x * 0.2 + (Math.random() - 0.5) * 0.3, this.z + dir.z * 0.2 + (Math.random() - 0.5) * 0.3, this.facing + (Math.random() - 0.5) * 0.6, sp.r, { color: col, width: 0.22, sweep: 0.04 });
        tryPlay(this.model, i % 2 ? ['attack2', 'slash', 'stab'] : ['attack1', 'stab'], { speed: 3 });
      });
    } else if (sp.kind === 'bigbolt') {
      this.enterState('special', 0.25, { moveMul: 0.2 });
      const h = this.hitOf(sp.mul, { kb: 1.2, heavy: true });
      const burst = (x, z) => {
        w.areaDamage({ shape: 'circle', x, z, r: sp.burst }, this.hitOf(sp.mul * 0.6, { kb: 1.4, heavy: true }));
        w.fx.ring(x, z, sp.burst, col, { life: 0.3 }); w.fx.glow(x, 0.5, z, [col, '#ffffff'], 16, { spread: 0.4 }); w.fx.light(x, 0.8, z, col, 5, 5, 0.2); w.shake(0.25);
      };
      w.spawnProjectile({ team: 'player', x: this.x + aim.x * 0.5, z: this.z + aim.z * 0.5, y: 0.8, dir: aim, speed: sp.speed, radius: sp.radius, dmg: h.dmg, crit: h.crit, kb: 1.2, pierce: 0, life: sp.range / sp.speed, color: col, source: this, scale: 1.6, status: h.status, onEnd: (pr) => burst(pr.x, pr.z) });
    } else if (sp.kind === 'nova') {
      this.enterState('special', 0.25);
      const hits = w.areaDamage({ shape: 'circle', x: this.x, z: this.z, r: sp.r }, this.hitOf(sp.mul, { kb: sp.kb, heavy: true }));
      w.fx.ring(this.x, this.z, sp.r, col, { life: 0.35 }); w.fx.disc(this.x, this.z, sp.r, col, { life: 0.3, alpha: 0.5 });
      w.fx.glow(this.x, 0.6, this.z, [col, '#ffffff'], 24, { spread: sp.r * 0.5, vel: [0, 1, 0] });
      w.fx.light(this.x, 1, this.z, col, 5, 6, 0.25);
      w.shake(0.3); if (hits.length) w.hitStop(0.06);
    }
    w.emit('special', { player: this, kind: sp.kind });
    return true;
  }

  useSkill(i) {
    const id = this.skills[i];
    if (!id || this.skillCd[i] > 0) { if (id) { const au = this.world.game && this.world.game.audio; au && au.play('deny', { vol: 0.4 }); } return false; }
    const ok = castSkill(this, this.world, id);
    if (!ok) return false;
    const d = skillDef(id);
    this.skillCd[i] = this.skillCdMax[i] = (d ? d.cd : 6) * (this.stats.skillCd || 1);
    if (this.state !== 'whirl' && this.state !== 'dash') { this.atk = null; this.enterState('skill', 0.18, { moveMul: 0.3 }); }
    tryPlay(this.model, ['cast', 'block'], { speed: 1.8 });
    this.world.emit('skillCast', { player: this, id, slot: i });
    return true;
  }

  // ---------------------------------------------------------------- the 60 Hz step
  step(h, w) {
    this.age += h;
    if (this.invuln > 0) this.invuln -= h;
    this.stateT += h;
    this.comboT += h; this.sinceDash += h;
    if (this.comboT > FEEL.comboReset && this.state !== 'attack') this.combo = 0;
    if (this.specialCd > 0) this.specialCd -= h;
    for (let i = 0; i < 2; i++) if (this.skillCd[i] > 0) this.skillCd[i] -= h;
    if (this.dashCharges < this.dashMax) { this.dashT -= h; if (this.dashT <= 0) { this.dashCharges++; this.dashT = this.dashCharges < this.dashMax ? FEEL.dashRecharge : 0; } }
    if (this.dead) { this.vx = this.vz = 0; return; }
    this.findInteract();

    const st = this.state;
    const disabled = this.status.stun > 0 || this.status.freeze > 0;
    // dash cancels almost anything
    if (!disabled && st !== 'leap' && this.peek('dash') && this.dashCharges > 0 && st !== 'dash') { this.take('dash'); this.startDash(this.moveDir()); }
    else if (!disabled && (st === 'move' || st === 'hurt' && this.stateT > 0.08 || st === 'attack' && this.atk && this.atk.t > this.atk.wind + this.atk.active)) {
      if (this.take('skill0')) this.useSkill(0);
      else if (this.take('skill1')) this.useSkill(1);
      else if (this.peek('special') && this.specialCd <= 0) { this.take('special'); this.startSpecial(); }
    }
    if (this.take('interact') && this.interactTarget && this.state === 'move') { const it = this.interactTarget; if (it.onInteract) it.onInteract(this, w); }

    // state machine
    let tvx = 0, tvz = 0, moveMul = 1;
    const mv = this.inMove, speed = FEEL.speed * (this.stats.moveSpd || 1) * (this.status.slow > 0 ? 0.55 : 1);
    if (this.state === 'dash') {
      const d = this.dash;
      if (d) {
        d.t += h;
        tvx = d.x * d.speed; tvz = d.z * d.speed;
        this.vx = tvx; this.vz = tvz;
        const before = { x: this.x, z: this.z };
        w.moveCircle(this, tvx * h, tvz * h);
        if (d.onStep) d.onStep(this.x, this.z);
        d.ghost -= h;
        if (d.ghost <= 0) { d.ghost = 0.035; w.fx.ghost(before.x, before.z, this.facing, d.color); }
        if (Math.random() < 0.5) w.fx.dust(this.x, this.z, 1, { speed: [0.2, 0.6], size: [2, 3] });
      }
      if (this.stateT >= this.stateDur) {
        this.state = 'move'; this.dash = null; this.ghosting = false; this.sinceDash = 0;
        this.vx *= 0.25; this.vz *= 0.25;
        if (this.peek('attack') || this.holdAttack) { this.take('attack'); this.startAttack(true); }
      }
      this.integrate(h, w, false);
      return;
    }
    if (this.state === 'leap') {
      const L = this.leap;
      if (L && L.t < L.dur) {
        L.t += h;
        const k = Math.min(1, L.t / L.dur);
        this.x = L.x0 + (L.x1 - L.x0) * k; this.z = L.z0 + (L.z1 - L.z0) * k;
        this.y = Math.sin(k * Math.PI) * 1.4;
      } else this.y = 0;
      if (this.stateT >= this.stateDur) { this.state = 'move'; this.leap = null; this.y = 0; }
      this.vx = this.vz = 0;
      this.integrate(h, w, false);
      return;
    }
    if (this.state === 'attack' && this.atk) {
      const a = this.atk;
      a.t += h;
      if (!a.hit && a.t >= a.wind) { a.hit = true; this.strike(a.move, a.dir); }
      const end = a.wind + a.active + a.rec;
      const canChain = a.t >= a.wind + a.active + a.cancel;
      if (canChain && (this.peek('attack') || this.holdAttack)) { this.take('attack'); this.startAttack(false); }
      else if (a.t >= end) { this.state = 'move'; this.atk = null; }
      moveMul = a.t < a.wind + a.active ? 0 : 0.18;
    } else if (this.state === 'special' || this.state === 'skill' || this.state === 'whirl' || this.state === 'hurt') {
      moveMul = this.state === 'hurt' ? 0.2 : this.stateOpts.moveMul ?? 0.3;
      if (this.stateT >= this.stateDur) this.state = 'move';
    }
    if (this.state === 'move') {
      moveMul = 1;
      if (!disabled && (this.peek('attack') || this.holdAttack)) { this.take('attack'); this.startAttack(this.sinceDash < FEEL.dashAtkWindow); moveMul = 0; }
    }
    if (disabled || this.status.root > 0) moveMul = 0;
    tvx = mv.x * speed * moveMul; tvz = mv.z * speed * moveMul;
    const k = 1 - Math.exp(-h / FEEL.accelT);
    this.vx += (tvx - this.vx) * k; this.vz += (tvz - this.vz) * k;
    if (this.lungeV && this.lungeV.t > 0) { this.lungeV.t -= h; this.vx = this.lungeV.x + tvx * 0.1; this.vz = this.lungeV.z + tvz * 0.1; }
    // facing: attacks snap to aim; walking turns smoothly toward the stick/keys
    if (this.state === 'move' || this.state === 'whirl' || this.state === 'hurt') {
      const sp2 = Math.hypot(mv.x, mv.z);
      if (sp2 > 0.2) {
        const want = angOf(mv.x, mv.z), d = wrap(want - this.facing);
        this.facing += Math.sign(d) * Math.min(Math.abs(d), FEEL.turnRate * h);
        this.aimX = mv.x / sp2; this.aimZ = mv.z / sp2;
      }
    }
    if (this.hasMouseAim && this.state === 'move') { const dx = this.mouseAim.x - this.x, dz = this.mouseAim.z - this.z, L = Math.hypot(dx, dz); if (L > 0.2) { this.aimX = dx / L; this.aimZ = dz / L; } }
    this.integrate(h, w, true);
  }
  integrate(h, w, useVel) {
    const dx = (useVel ? this.vx : 0) + this.kbx, dz = (useVel ? this.vz : 0) + this.kbz;
    if (dx || dz) w.moveCircle(this, dx * h, dz * h);
    const kd = Math.exp(-9 * h);
    this.kbx *= kd; this.kbz *= kd;
  }
  findInteract() {
    let best = null, bd = 1e9;
    for (const it of this.world.interactables) {
      if (it.enabled === false) continue;
      const d = Math.hypot(it.x - this.x, it.z - this.z);
      if (d <= (it.r ?? 1.3) && d < bd) { bd = d; best = it; }
    }
    this.interactTarget = best;
  }

  // ---------------------------------------------------------------- death
  die(world) {
    this.state = 'dead';
    this.atk = null; this.dash = null;
    tryPlay(this.model, ['die', 'defeat', 'lie']);
    world.slowmo(0.2, 1.5);
    world.shake(0.6);
    world.flash('#ff2a1a', 0.35);
    const au = world.game && world.game.audio; au && au.play('player_die');
  }
  /** Bring the player back (e.g. after a revive item). */
  revive(hp) { this.dead = false; this.hp = Math.min(this.maxHp, hp ?? this.maxHp); this.state = 'move'; this.invuln = 1.5; tryPlay(this.model, ['idleCombat', 'idle']); }

  // ---------------------------------------------------------------- render sync
  sync(dt) {
    const o = this.obj;
    if (!o) return;
    o.position.set(this.x, this.y, this.z);
    o.rotation.y = this.facing;
    const m = this.model;
    if (m && m.play && this.state === 'move' && !this.dead) {
      const spd = Math.hypot(this.vx, this.vz);
      if (spd > 0.6) tryPlay(m, ['run', 'walk'], { speed: 0.9 + (spd / FEEL.speed) * 0.6, restart: false });
      else if (m.anim === 'run' || m.anim === 'walk' || !m.anim || this.stateT > 0.5 && !['idleCombat', 'idle'].includes(m.anim)) tryPlay(m, ['idleCombat', 'idle'], { restart: false });
    }
    if (m && m.update) m.update(dt);
    // flicker while invulnerable after a hit
    o.visible = !(this.invuln > 0 && this.state !== 'dash' && this.state !== 'leap' && Math.floor(this.age * 20) % 3 === 0 && this.age > 0.5);
    this.light.position.set(this.x, 2.2 + this.y, this.z + 0.6);
    this.ring.position.set(this.x, 0.03, this.z);
    this.ring.material.opacity = this.dead ? 0 : 0.28 + (this.invuln > 0 ? 0.25 : 0);
  }
  drawControls(ui) { drawControls(ui, this); }
  dispose() { this.light.parent && this.light.parent.remove(this.light); this.ring.parent && this.ring.parent.remove(this.ring); this.ring.geometry.dispose(); this.ring.material.dispose(); }
}
