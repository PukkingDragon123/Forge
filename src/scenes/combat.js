// Combat: monster entrance → portable forge → cinematic auto-battle with QTEs → harvest → curse shatter.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { save } from '../core/save.js';
import { clamp, damp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import { MONSTERS } from '../data/monsters.js';
import { MATERIALS, QUALITY } from '../data/materials.js';
import { CombatSim, FISTS, monsterStats } from '../systems/combat.js';
import { GRADES } from '../systems/forge.js';
import { monsterDrops, rollQuality } from '../systems/run.js';
import { makeItem, itemTooltip } from '../systems/items.js';
import { buildSet } from '../models/environments.js';
import { buildCharacter } from '../models/characters.js';
import { buildMonster } from '../models/monsters.js';
import { buildWeaponMesh, crackWeapon, shatterPieces } from '../models/weapons3d.js';
import { buildProp } from '../models/props.js';
import { weaponSprite } from '../art/sprites.js';
import { cardBack, materialCard, drawCard } from '../ui/cards.js';
import { COLORS } from '../ui/font.js';
import { bar } from '../ui/frames.js';
import { Debris } from '../gfx/particles.js';
import { openForge } from './forgeui.js';
import { makeWorld, hud, speech, ribbonTitle, prompt, ring, dim, bark } from './common.js';
import { finish, openBag, gameOver } from './flow.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const EL_COLOR = { fire: '#ff7b2e', ice: '#7fe3ff', shock: '#ffe74a', poison: '#8fe04a', bleed: '#ff4f6a', curse: '#c86bff', holy: '#fff3b0' };
const EL_GRAD = { fire: ['#fff0b0', '#ff6a1a'], ice: ['#ffffff', '#4fc0ff'], shock: ['#fffbd0', '#ffc81a'], poison: ['#e8ffc0', '#5ab02a'], bleed: ['#ffd0d8', '#d02a4a'], curse: ['#f0d0ff', '#9a3ae0'], holy: ['#ffffff', '#ffd25e'] };
const SWING = { dagger: 'stab', sword: 'slash', axe: 'chop', hammer: 'smash', spear: 'stab', staff: 'cast', fists: 'slash' };
const STEP = { dagger: 0.28, sword: 0.32, axe: 0.36, hammer: 0.4, spear: 0.22, staff: 0, fists: 0.3 };
const RANGE = { spear: 1.45, staff: 2.3 };
const KINDLE_EL = ['fire', 'ice', 'shock', 'poison'];
const fmt = (n) => (n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
const topElement = (w) => {
  let best = null;
  for (const k of ['fire', 'ice', 'shock', 'poison', 'curse', 'holy', 'bleed']) if ((w.el?.[k] || 0) > 0 && (!best || w.el[k] > w.el[best])) best = k;
  return best;
};

export class CombatScene extends Scene {
  enter(p = {}) {
    const game = this.game, run = game.run;
    this.p = p; this.run = run;
    this.mid = p.monster || 'rustrat';
    this.def = MONSTERS[this.mid];
    this.boss = this.def.tier === 'boss';
    this.elite = this.def.tier === 'elite' || !!p.elite;
    this.lord = this.mid === 'cursed_lord';
    this.auto = !!p.autoplay;

    // ---- world
    this.set = buildSet(this.lord ? 'tomb' : 'arena', run.region, {});
    const W = makeWorld(this.set, { fogDensity: 0.035 });
    // EnvSet carries real Fog/Color objects (makeWorld expects hex): use them directly
    if (this.set.fog && this.set.fog.isFogExp2) W.scene.fog = this.set.fog;
    if (this.set.background && this.set.background.isColor) W.scene.background = this.set.background;
    this.W = W; this.rig = W.rig;
    this.world = { scene: W.scene, camera: W.camera, post: { bloom: 0.75, vignette: 0.4, exposure: 1 } };
    this.debris = new Debris(260, 0.035);
    W.scene.add(this.debris.object);
    const A = this.set.anchors || {};
    this.heroHome = (A.player || V3(-1.6, 0, 0)).clone();
    this.monHome = (A.monster || V3(1.8, 0, 0)).clone();

    // ---- monster (placed so big bosses never overlap the hero)
    this.mon = buildMonster(this.mid);
    const front = this.mon.bounds ? this.mon.bounds.min.x : -0.35;
    this.monHome.x = Math.max(this.monHome.x, this.heroHome.x + 2.1 - front);
    this.mon.group.position.copy(this.monHome);
    this.mon.group.rotation.y = 0.3;
    W.scene.add(this.mon.group);

    // ---- hero
    this.hero = buildCharacter(run.char);
    this.hero.group.position.copy(this.heroHome);
    this.face(1);
    W.scene.add(this.hero.group);
    this.heroAct('idleCombat', true);

    // ---- portable forge (hidden until set up)
    const fp = A.forge ? A.forge.clone() : V3(this.heroHome.x - 1.3, 0, this.heroHome.z - 0.75);
    if (Math.abs(fp.x - this.heroHome.x) < 0.9 && Math.abs(fp.z - this.heroHome.z) < 0.7) fp.set(this.heroHome.x - 1.3, 0, this.heroHome.z - 0.75);
    this.forgeGrp = new THREE.Group();
    this.forgeGrp.position.copy(fp);
    const forge = buildProp('forge', { intensity: 3 });
    forge.scale.setScalar(0.55);
    forge.position.set(-0.4, 0, -0.15);
    const anvil = buildProp('anvil');
    anvil.scale.setScalar(0.85);
    anvil.position.set(0.42, 0, 0.18);
    this.forgeGrp.add(forge, anvil);
    this.forgeGrp.scale.setScalar(0.001);
    this.forgeGrp.visible = false;
    W.scene.add(this.forgeGrp);
    this.anvilBase = fp.clone().add(V3(0.42, 0, 0.18));

    // ---- state
    this.phase = 'intro';
    this.letter = 0; this.letterTarget = 0;
    this.titleCard = null; this.caption = null;
    this.bubbles = []; this.bigs = []; this.slashes = []; this.shards = [];
    this.sim = null; this.weapon = null; this.wmesh = null;
    this.tele = null; this.critRing = null; this.critFlash = null;
    this.hpTrail = 1; this.simHold = 0; this.slowUntil = 0;
    this.choice = false; this.flee = null; this.harvest = null; this.specialQ = null; this.tip = false;
    this.defeatFade = 0;
    this.heroFightX = this.heroHome.x;
    game.audio && game.audio.music(this.lord ? 'finalboss' : this.boss ? 'boss' : 'combat');
    this.co.start(this.introSeq.bind(this));
  }

  exit() {
    this.game.timeScale = 1;
    this.mon && this.mon.dispose && this.mon.dispose();
  }

  // =============================================================== helpers
  sfx(name, o) { this.game.audio && this.game.audio.play(name, o); }
  face(dir) { this.hero.group.rotation.y = dir > 0 ? Math.PI / 2 - 0.4 : -Math.PI / 2 + 0.4; }
  heroAct(anim, loop = false, o = {}) {
    const h = this.hero;
    if (loop) { h.play(anim, { loop: true, ...o }); return; }
    h.play(anim, { ...o, onDone: () => { if (this.phase === 'fight' || this.phase === 'forge' || this.phase === 'choice') h.play(this.phase === 'fight' ? 'idleCombat' : 'idle', { loop: true }); o.onDone && o.onDone(); } });
  }
  monFront() { return this.mon.group.position.x + (this.mon.bounds ? this.mon.bounds.min.x : -0.35); }
  monWorld(local) { return this.mon.group.localToWorld(local.clone()); }
  hitWorld() { return this.monWorld(this.mon.hitPoint || V3(0, 0.5, 0)); }
  screen(v) { const ui = this.game.ui; return this.rig.project(v, ui.w, ui.h); }
  heroHead() {
    const h = this.hero.headPos ? this.hero.headPos() : null;
    return h ? h.clone() : this.hero.group.localToWorld(V3(0, 1.4, 0));
  }
  monTop() { return this.monWorld(V3(0, (this.mon.height || 1) + 0.25, 0)); }
  say(text, dur = 2, who = 'hero') { if (text) this.bubbles.push({ text, dur, t: 0, who }); }
  big(text, dur = 1, o = {}) { this.bigs.push({ text, dur, t: 0, ...o }); }
  slowmo(scale, dur) {
    this.game.timeScale = Math.min(this.game.timeScale, scale);
    this.slowUntil = Math.max(this.slowUntil, performance.now() / 1000 + dur);
  }
  fightShot() {
    const hx = this.heroFightX, mh = (this.mon.height || 1) + (this.mon.fly || 0);
    const mid = (hx + this.monHome.x) / 2;
    const span = this.monHome.x - hx + Math.max(0.6, mh * 0.4);
    const ty = Math.max(0.75, mh * 0.45);
    const dist = Math.max(4.2, span * 1.25 + mh * 0.65);
    return { pos: [mid - 0.25, ty + dist * 0.2, this.heroHome.z + dist], look: [mid, ty * 0.85, 0], fov: 38 };
  }
  goFightShot(dur = 1) { const s = this.fightShot(); return this.rig.moveTo(s.pos, s.look, s.fov, dur, 'inOutCubic'); }
  walkTo(x, z, dur = 0.6) {
    const g = this.hero.group;
    this.face(x >= g.position.x ? 1 : -1);
    this.hero.play('walk', { loop: true });
    this.tw.to(g.position, { x, z }, dur, { ease: 'inOutQuad' });
    return dur;
  }

  // =============================================================== intro
  *introSeq() {
    const rig = this.rig, mon = this.mon, hero = this.hero;
    const shot = this.fightShot();
    if (this.boss) yield* this.bossIntro(shot);
    else if (this.mid === 'mimic') {
      mon.play('disguise');
      rig.cut([this.monHome.x - 1.4, 1.1, this.monHome.z + 2.6], [this.monHome.x, 0.5, 0], 38);
      yield 0.8;
      mon.play('intro');
      this.sfx('mimic_reveal'); rig.shake(0.6); this.game.renderer.doFlash(0.25, [1, 0.8, 0.8]);
      hero.setExpression('surprised');
      this.say("It's a MIMIC!", 1.6);
      yield 0.9;
      this.showTitle(this.def.name, null, 1.6);
      rig.moveTo(shot.pos, shot.look, shot.fov, 1.0);
      yield 1.0;
      mon.play('idle');
    } else {
      const mg = mon.group;
      const flyer = (mon.fly || 0) > 0.2;
      mg.position.x = this.monHome.x + 3.4;
      if (flyer) mg.position.y = this.monHome.y + 1.4;
      rig.cut([this.heroHome.x + 0.7, 1.15, this.heroHome.z + 3.1], [this.heroHome.x + 1.3, 0.75, 0], 40);
      hero.setExpression('surprised');
      this.say('!', 0.9);
      mon.play('intro');
      this.sfx('monster_growl');
      this.tw.to(mg.position, { x: this.monHome.x, y: this.monHome.y }, 0.9, { ease: 'outCubic' });
      rig.moveTo(shot.pos, shot.look, shot.fov, 1.2, 'inOutCubic');
      yield 0.55;
      this.showTitle(this.def.name, this.elite ? 'ELITE' : null, 1.8);
      yield 1.0;
      mon.play('idle');
    }
    hero.setExpression('determined');
    yield* this.setupForge();
  }

  *bossIntro(shot) {
    const rig = this.rig, mon = this.mon, hero = this.hero, post = this.world.post;
    this.letterTarget = 1;
    post.exposure = 0.55;
    this.tw.to(post, { exposure: 1 }, 3.2, { ease: 'inOutSine' });
    rig.cut([this.heroHome.x + 0.8, 0.85, this.heroHome.z + 2.3], [this.heroHome.x + 0.3, 1.0, 0], 36);
    hero.setExpression('surprised');
    this.sfx('rumble'); rig.shake(0.5);
    this.caption = this.def.intro || '';
    yield 1.7;
    const mh = this.mon.height || 3;
    mon.play('intro');
    this.sfx('boss_intro');
    const dur = mon.introDur || 2.6;
    rig.moveTo([this.monHome.x - 1.5, Math.max(0.6, mh * 0.3), this.monHome.z + mh * 1.5 + 2.2], [this.monHome.x, mh * 0.6, 0], 42, dur, 'inOutSine');
    yield dur;
    mon.play('roar');
    this.sfx('boss_roar'); rig.shake(0.9); rig.fovPunch(6);
    this.game.renderer.doFlash(0.3, [1, 0.8, 0.6]);
    this.showTitle(this.def.name, this.def.title, 2.8, true);
    yield 1.8;
    this.caption = null;
    rig.moveTo(shot.pos, shot.look, shot.fov, 1.4);
    yield 1.4;
    this.letterTarget = 0;
    mon.play('idle');
  }

  showTitle(name, sub, dur, boss = false) { this.titleCard = { name, sub, dur, t: 0, boss }; }

  *setupForge() {
    const run = this.run;
    this.say(bark(run.char, 'forge') || 'Forge time!', 1.6);
    this.forgeGrp.visible = true;
    this.sfx('forge_ignite');
    this.tw.to(this.forgeGrp.scale, { x: 1, y: 1, z: 1 }, 0.45, { ease: 'outBack' });
    const fp = this.forgeGrp.position;
    this.W.dust.emit({ pos: [fp.x, 0.3, fp.z], posSpread: [0.5, 0.1, 0.3], vel: [0, 0.6, 0], spread: 0.5, count: 30, life: [0.6, 1.2], size: [1, 2], color: '#c8b8a0', alpha: 0.6 });
    yield* this.goToAnvil(0.6);
    this.hero.play('forge');
    yield 0.6;
    this.openForgeUI(false);
  }

  *goToAnvil(dur) {
    const a = this.anvilBase;
    yield this.walkTo(a.x + 0.04, a.z - 0.5, dur);
    this.hero.group.rotation.y = 0.15;
    this.rig.moveTo([a.x + 0.55, 1.5, a.z + 2.7], [a.x - 0.1, 0.65, a.z - 0.25], 38, 0.8);
  }

  openForgeUI(emergency) {
    this.phase = emergency ? 'emergency' : 'forge';
    this.forgeCtrl = openForge(this, {
      mode: 'weapon', monster: this.mid, emergency, anvil: this.anvilBase.clone(), rig: this.rig, world: this.W,
      onHammerStart: () => this.hero.play('hammer', { loop: true }),
      onDone: (w) => this.onForged(w, emergency),
    });
  }

  onForged(w, emergency) {
    this.forgeCtrl = null;
    if (emergency) { this.equip(w || FISTS); this.co.start(this.resumeAfterEmergency.bind(this)); return; }
    if (!w) {
      this.phase = 'choice';
      this.hero.setExpression('sad');
      this.say('Nothing solid to forge with…', 2);
      this.goFightShot(0.8);
      return;
    }
    this.equip(w);
    this.co.start(this.fightIntro.bind(this));
  }

  equip(w) {
    this.weapon = w;
    if (this.wmesh) { this.hero.hold(null); this.wmesh.parent && this.wmesh.parent.remove(this.wmesh); this.wmesh = null; }
    if (w.bp !== 'fists') {
      this.wmesh = buildWeaponMesh(w);
      this.hero.hold(this.wmesh, 'right');
      if (!this.wmesh.parent) { this.hero.group.add(this.wmesh); this.wmesh.position.set(0.25, 0.55, 0.15); this.wmesh.rotation.z = -0.5; }
    }
    if (this.hero.backItem) this.hero.backItem.visible = w.bp === 'fists';
    const el = topElement(w);
    if (this.hero.kindle && KINDLE_EL.includes(el)) this.hero.kindle.setElement(el);
    const range = RANGE[w.bp] || 1.1;
    this.heroFightX = Math.max(this.heroHome.x, this.monFront() - range);
  }

  *fightIntro() {
    this.hero.setExpression('determined');
    yield this.walkTo(this.heroFightX, this.heroHome.z, 0.55);
    this.face(1);
    this.heroAct('idleCombat', true);
    this.goFightShot(0.9);
    yield 0.6;
    this.big('FIGHT!', 1.0, { scale: 4, top: '#fff6c8', bottom: '#ff7a2a' });
    this.sfx('qte_prompt');
    yield 0.45;
    this.startFight();
  }

  startFight() {
    this.sim = new CombatSim(this.run, this.weapon, this.mid, this.run.region, {});
    if ((this.run.flags.courage || 0) > 0) { this.sim.special = 1; this.run.flags.courage--; }
    this.phase = 'fight';
    const s = this.fightShot();
    this.rig.aim(s.pos, s.look, s.fov, 2.5);
    if (!save.data.seen.tips.combat) this.tip = true;
  }

  // =============================================================== update
  update(dt, rdt = dt) {
    const now = performance.now() / 1000;
    if (this.slowUntil && now > this.slowUntil) { this.game.timeScale = 1; this.slowUntil = 0; }
    this.letter = damp(this.letter, this.letterTarget, 6, rdt);
    this.set.update && this.set.update(dt, this.time);
    this.forgeGrp.traverse((o) => {
      const u = o.userData;
      if (u.update) u.update(dt, this.time);
      if (u.emit) u.emit({ add: this.W.sparks, alpha: this.W.dust }, dt);
    });
    this.hero.update(dt);
    this.mon.update(dt);
    this.W.sparks.update(dt); this.W.dust.update(dt);
    this.debris.update(dt);
    this.updateShards(dt);
    this.rig.update(dt);
    for (const b of this.bubbles) b.t += rdt;
    this.bubbles = this.bubbles.filter((b) => b.t < b.dur);
    for (const b of this.bigs) b.t += rdt;
    this.bigs = this.bigs.filter((b) => b.t < b.dur);
    for (const s of this.slashes) s.t += rdt;
    this.slashes = this.slashes.filter((s) => s.t < 0.3);
    if (this.titleCard) { this.titleCard.t += rdt; if (this.titleCard.t > this.titleCard.dur) this.titleCard = null; }
    if (this.critFlash) { this.critFlash.t += rdt; if (this.critFlash.t > 0.35) this.critFlash = null; }
    if (this.forgeCtrl && this.forgeCtrl.active) this.forgeCtrl.update(dt);
    if (this.sim) this.hpTrail = damp(this.hpTrail, this.sim.m.hp / this.sim.m.maxHp, this.hpTrail > this.sim.m.hp / this.sim.m.maxHp + 0.002 ? 3 : 30, rdt);

    if (this.phase === 'fight') this.updateFight(dt, rdt);
    else if (this.phase === 'flee') this.updateFlee(rdt);
    else if (this.phase === 'harvest') this.updateHarvest(rdt);
    else if (this.phase === 'choice' && this.auto) this.chooseFists();
    if (this.phase === 'defeat') this.defeatFade = Math.min(1, this.defeatFade + rdt * 0.5);
  }

  // =============================================================== fight
  updateFight(dt, rdt) {
    const sim = this.sim, inp = this.game.input, ui = this.game.ui;
    if (this.tip) {
      if (this.auto || inp.actionPressed('confirm')) this.closeTip();
      return;
    }
    if (this.specialQ) { this.updateSpecial(rdt); return; }
    const freeClick = inp.pressed && !ui.overUI() && !inp.consumed;
    const freeR = inp.rpressed && !ui.overUI();
    if (inp.actionPressed('strike') || freeClick) sim.pressStrike();
    if (inp.actionPressed('block') || freeR) sim.pressGuard();
    if (inp.actionPressed('special') && sim.special >= 1) { this.startSpecial(); return; }
    if (this.auto) this.autoInputs();
    const a = sim.m.attack;
    if (a && !a.animStarted && !a.resolved && sim.t >= a.impact - 0.14) { a.animStarted = true; this.monsterStrike(a); }
    if (this.simHold > 0) { this.simHold -= dt; return; }
    sim.update(dt);
    for (const e of sim.drain()) { this.onEvent(e); if (this.phase !== 'fight') break; }
  }

  autoInputs() {
    const sim = this.sim;
    if (sim.swing && sim.swing.critRing && !sim.swing.pressed && sim.t >= sim.swing.impact - 0.02) sim.pressStrike();
    const a = sim.m.attack;
    if (a && !a.resolved && sim.t >= a.impact - 0.03 && sim.guardAt < a.start) sim.pressGuard();
    if (sim.special >= 1 && !this.specialQ) this.startSpecial();
  }

  closeTip() {
    this.tip = false;
    save.data.seen.tips.combat = true;
    save.write();
  }

  monsterStrike(a) {
    const kind = a.def.kind;
    const mon = this.mon;
    mon.play(kind === 'multi' ? 'multi' : kind === 'special' ? 'special' : 'attack', { hits: a.hits, onDone: () => this.phase === 'fight' && mon.play('idle') });
    const reach = mon.reach ?? 0.35;
    const gap = this.monFront() - (this.hero.group.position.x + 0.3);
    const lunge = Math.max(0, gap - reach - 0.2) * (this.boss ? 0.35 : 0.7);
    if (lunge > 0.04) {
      const g = mon.group.position;
      this.tw.to(g, { x: this.monHome.x - lunge }, 0.12, { ease: 'outQuad' });
      this.co.start(function* (s) { yield 0.32; s.tw.to(g, { x: s.monHome.x }, 0.4, { ease: 'outCubic' }); }, this);
    }
    if (a.def.effect === 'burn' || a.def.effect === 'poison') {
      const m = this.monWorld(mon.mouthPoint || V3(-0.3, 0.5, 0));
      const h = this.hero.group.position;
      const col = a.def.effect === 'burn' ? ['#ffd27a', '#ff6a1a'] : ['#c0ff8a', '#5ab02a'];
      this.W.sparks.emit({ pos: [m.x, m.y, m.z], vel: [(h.x - m.x) * 2.2, 0.4, 0], spread: 0.6, count: 40, life: [0.3, 0.6], size: [1, 2], color: col, glow: 3, drag: 1 });
    }
  }

  onEvent(e) {
    const ui = this.game.ui, sim = this.sim, rig = this.rig;
    switch (e.type) {
      case 'swing': return this.onSwing(e);
      case 'critInput': {
        const p = this.screen(this.hitWorld());
        if (e.result === 'crit') { this.critFlash = { t: 0, x: p.x, y: p.y }; this.sfx('qte_success'); }
        else if (e.result === 'whiff') { ui.float('whiff', p.x, p.y - 18, { color: '#8a8078', vy: -12, life: 0.7 }); this.sfx('qte_fail', { vol: 0.5 }); }
        return;
      }
      case 'firstStrike': { const p = this.screen(this.hitWorld()); ui.float('FIRST STRIKE!', p.x, p.y - 30, { color: COLORS.gold, life: 1.2 }); return; }
      case 'miss': { const p = this.screen(this.hitWorld()); ui.float('MISS', p.x, p.y - 16, { color: '#c9c1b3', vy: -16 }); this.sfx('dodge'); this.hopMonster(); return; }
      case 'mhit': return this.onMonsterHit(e);
      case 'stun': { if (!sim.m.attack) this.mon.play('stun', { onDone: () => this.mon.play('idle') }); const p = this.screen(this.monTop()); ui.float(e.by === 'shock' ? 'ZAP! Stunned' : 'Stunned!', p.x, p.y, { color: COLORS.shock, vy: -14 }); return; }
      case 'freeze': {
        const p = this.screen(this.monTop());
        ui.float('FROZEN!', p.x, p.y, { big: true, scale: 2, top: '#ffffff', bottom: '#4fc0ff' });
        this.sfx('ice_crack'); this.mon.flash('#bff4ff', 0.6);
        const w = this.hitWorld();
        this.W.sparks.emit({ pos: [w.x, w.y, w.z], radial: [1, 3], count: 40, life: [0.4, 1], size: [1, 2], color: ['#ffffff', '#9ae8ff'], glow: 2, gravity: 3, drag: 1.5 });
        return;
      }
      case 'interrupt': { const p = this.screen(this.monTop()); ui.float('Interrupted!', p.x, p.y, { color: COLORS.ice, vy: -14 }); this.endTele('interrupt'); this.mon.play('stun', { onDone: () => this.mon.play('idle') }); return; }
      case 'reaction': { const p = this.screen(this.hitWorld()); ui.float(e.name, p.x, p.y - 30, { big: true, scale: 2, top: '#ffffff', bottom: '#c08aff', life: 1.2 }); this.sfx('synergy'); return; }
      case 'telegraph': {
        this.tele = { start: sim.t, impact: sim.t + e.windup, windup: e.windup, kind: e.kind, name: e.attack.name, res: null, rt: 0 };
        this.mon.play('windup');
        this.sfx(e.kind === 'unblockable' ? 'qte_prompt' : 'monster_growl', { vol: 0.55 });
        return;
      }
      case 'guard': if (!this.hero.anim || this.hero.anim !== 'parry') this.heroAct('block'); return;
      case 'parry': {
        this.endTele('parry');
        const mid = this.contactPoint();
        this.W.sparks.emit({ pos: mid, radial: [2, 6], count: 60, life: [0.2, 0.7], size: [1, 2], color: ['#ffffff', '#fff0b0', '#ffd25e'], glow: 4, gravity: 5, drag: 2 });
        const p = this.screen(V3(...mid));
        ui.float('PARRY!', p.x, p.y - 20, { big: true, scale: 3, top: '#ffffff', bottom: '#ffd25e', life: 1.1 });
        this.sfx('parry');
        this.heroAct('parry');
        this.mon.play('hurt', { onDone: () => this.mon.play('idle') });
        this.game.hitStop(0.12); this.slowmo(0.35, 0.3);
        rig.shake(0.3); rig.fovPunch(-4);
        this.game.renderer.doFlash(0.18, [1, 0.95, 0.8]);
        if (this.run.char === 'durgan') { const h = this.screen(this.heroHead()); ui.float(`GRIT ${sim.grit}`, h.x, h.y - 6, { color: COLORS.gold, vy: -12 }); }
        return;
      }
      case 'block': {
        this.endTele('block');
        const mid = this.contactPoint();
        this.W.sparks.emit({ pos: mid, radial: [1, 3], count: 25, life: [0.2, 0.5], size: 1, color: ['#ffffff', '#a9c2d9'], glow: 2, gravity: 6, drag: 2 });
        const h = this.screen(this.heroHead());
        ui.float('Block', h.x, h.y - 8, { color: COLORS.block, vy: -14 });
        this.sfx('block');
        this.heroAct('block');
        rig.shake(0.15);
        return;
      }
      case 'phit': return this.onHeroHit(e);
      case 'pmiss': { this.endTele('miss'); const h = this.screen(this.heroHead()); ui.float('Dodged!', h.x, h.y - 8, { color: COLORS.good, vy: -14 }); this.sfx('dodge'); this.heroAct('dodge'); return; }
      case 'pheal': { const h = this.screen(this.heroHead()); ui.float(`+${e.amount}`, h.x + 8, h.y, { color: COLORS.heal, vy: -16, life: 0.8 }); return; }
      case 'mheal': { const p = this.screen(this.monTop()); ui.float(`+${fmt(e.amount)}`, p.x, p.y, { color: COLORS.heal, vy: -16 }); this.sfx('heal', { vol: 0.5 }); return; }
      case 'coins': { if (rnd.chance(0.5)) this.sfx('coin', { vol: 0.4 }); const p = this.screen(this.hitWorld()); ui.burst(p.x, p.y, 3, { colors: ['#ffd25e', '#fff0a8'], speed: 60, up: 40, gravity: 160 }); return; }
      case 'steal': { const h = this.screen(this.heroHead()); ui.float(`-${e.coins} coins!`, h.x, h.y - 6, { color: COLORS.gold, vy: -14 }); this.sfx('coins'); return; }
      case 'status': {
        const names = { web: 'Webbed!', daze: 'Dazed!', poison: 'Poisoned!', burn: 'Burning!', cracked: 'Weapon cracked!' };
        const h = this.screen(this.heroHead());
        ui.float(names[e.st] || e.st, h.x, h.y - 18, { color: e.st === 'cracked' ? COLORS.curse : COLORS.bad, vy: -12, life: 1.2 });
        if (e.st === 'cracked' && this.wmesh) { crackWeapon(this.wmesh, 0.4); this.sfx('crack'); }
        return;
      }
      case 'phase': return this.onPhase(e);
      case 'victory': this.phase = 'victory'; this.co.start(this.victorySeq.bind(this)); return;
      case 'defeat': this.phase = 'defeat'; this.co.start(this.defeatSeq.bind(this)); return;
      default: return;
    }
  }

  endTele(res) { if (this.tele) { this.tele.res = res; this.tele.rt = 0; } }
  contactPoint() {
    const h = this.hero.group.position, m = this.monFront();
    return [(h.x + 0.35 + m) / 2, 0.75, this.heroHome.z + 0.1];
  }
  hopMonster() {
    const g = this.mon.group.position;
    this.tw.to(g, { x: this.monHome.x + 0.35 }, 0.12, { ease: 'outQuad' });
    this.co.start(function* (s) { yield 0.2; s.tw.to(g, { x: s.monHome.x }, 0.3); }, this);
  }

  onSwing(e) {
    const bp = this.weapon.bp;
    const g = this.hero.group;
    const wind = e.windup;
    const anim = SWING[bp] || 'slash';
    const base = this.hero.impactTime ? this.hero.impactTime(anim) * ((this.hero.animOpts && this.hero.animOpts.speed) || 1) : 0.3;
    this.hero.play(anim, { restart: true, speed: clamp(base / (wind * 0.95), 0.6, 3) });
    const step = STEP[bp] ?? 0.3;
    if (step > 0) {
      this.tw.to(g.position, { x: this.heroFightX + step }, wind * 0.8, { ease: 'inOutQuad' });
      this.co.start(function* (s) { yield wind + 0.06; if (s.phase === 'fight') s.tw.to(g.position, { x: s.heroFightX }, 0.3, { ease: 'outCubic' }); }, this);
    }
    this.co.start(function* (s) { yield wind * 0.72; s.sfx('sword_swing', { vol: 0.6, pitch: 0.9 + rnd.next() * 0.2 }); }, this);
    this.critRing = e.critRing ? { impact: this.sim.swing.impact, windup: wind, win: this.sim.swing.critWin } : null;
  }

  onMonsterHit(e) {
    const ui = this.game.ui, rig = this.rig;
    const hw = this.hitWorld();
    const p = this.screen(hw);
    const jx = rnd.float(-12, 12);
    if (e.dot) {
      const col = EL_COLOR[e.element] || COLORS.text;
      ui.float(fmt(e.dmg), p.x + jx, p.y + 4, { color: col, vy: -18, life: 0.8 });
      const up = e.element === 'bleed' ? -1.2 : 0.8;
      this.W.sparks.emit({ pos: [hw.x, hw.y, hw.z], posSpread: 0.2, vel: [0, up, 0], spread: 0.3, count: 8, life: [0.4, 0.8], size: 1, color: [col], glow: 2, drag: 1 });
      return;
    }
    if (e.source === 'kindle') this.kindleBolt(e.element);
    const crit = !!e.crit, special = !!e.special;
    const grad = crit || special ? ['#fff6c8', '#ff8a1a'] : e.element && EL_GRAD[e.element] ? EL_GRAD[e.element] : e.extra ? ['#e8e0ff', '#a090d0'] : ['#ffffff', '#ffd0a0'];
    ui.float(fmt(e.dmg), p.x + jx, p.y - 10, { big: true, scale: special ? 4 : crit ? 3 : e.extra || e.arc ? 1 : 2, top: grad[0], bottom: grad[1], vy: crit ? -40 : -28, life: crit || special ? 1.2 : 0.9 });
    const el = topElement(this.weapon || FISTS);
    const cols = crit ? ['#ffffff', '#fff0b0', '#ffd25e', '#ff8a3a'] : el ? ['#ffffff', EL_COLOR[el]] : ['#ffffff', '#ffe0b0', '#ffb070'];
    this.W.sparks.emit({ pos: [hw.x, hw.y, hw.z], radial: [1.5, crit || special ? 5.5 : 3], count: special ? 90 : crit ? 50 : e.extra ? 8 : 20, life: [0.2, 0.6], size: 1, color: cols, glow: 3, gravity: 6, drag: 2 });
    if (e.arc) { this.sfx('zap', { vol: 0.6 }); return; }
    if (e.extra) { this.mon.flash('#ffffff', 0.05); return; }
    this.mon.flash(crit ? '#fff0c0' : '#ffffff', crit ? 0.12 : 0.08);
    if (!this.sim.m.attack && this.sim.m.st.stun <= 0) this.mon.play('hurt', { onDone: () => this.phase === 'fight' && this.mon.play('idle') });
    const heavy = ['hammer', 'axe'].includes(this.weapon.bp);
    this.sfx(special ? 'special_fire' : crit ? 'crit' : heavy ? 'heavy_hit' : 'hit', { pitch: 0.95 + rnd.next() * 0.1 });
    if (heavy || crit) this.debris.spawn({ pos: [hw.x, hw.y, hw.z], count: crit ? 8 : 4, colors: [this.def.model.body, this.def.model.belly || this.def.model.body], speed: 2, up: 2.5, floor: 0.02, life: 1.2 });
    if (e.riposte) ui.float('RIPOSTE', p.x, p.y - 34, { color: COLORS.gold, vy: -14 });
    this.game.hitStop(special ? 0.18 : crit ? 0.09 : 0.035);
    rig.shake(special ? 1.0 : crit ? 0.35 : heavy ? 0.2 : 0.1);
    if (crit && !special) {
      this.slowmo(0.35, 0.22);
      this.game.renderer.doFlash(0.18, [1, 0.95, 0.8]);
      rig.fovPunch(-3);
      ui.float('CRIT!', p.x, p.y - 38, { big: true, scale: 2, top: '#ffffff', bottom: '#ff5a3a', vy: -20, life: 0.8 });
    }
  }

  onHeroHit(e) {
    const ui = this.game.ui;
    if (e.dot) {
      const h = this.screen(this.heroHead());
      ui.float(`-${e.dmg}`, h.x + rnd.float(-6, 6), h.y, { color: e.dot === 'fire' ? COLORS.fire : COLORS.poison, vy: -14, life: 0.7 });
      return;
    }
    if (e.self) { const h = this.screen(this.heroHead()); ui.float(`-${e.dmg}`, h.x - 8, h.y, { color: COLORS.curse, vy: -12, life: 0.7 }); return; }
    if (!e.blocked) this.endTele('hit');
    const h = this.screen(this.heroHead());
    ui.float(`-${e.dmg}`, h.x, h.y - 6, { big: true, scale: e.dmg >= 15 ? 3 : 2, top: '#ffd0c0', bottom: '#e03a3a', vy: -24 });
    if (!e.blocked) {
      this.heroAct('hurt');
      this.hero.setExpression('hurt');
      this.co.start(function* (s) { yield 0.8; if (s.phase === 'fight') s.hero.setExpression('determined'); }, this);
      this.sfx('hurt');
      this.rig.shake(Math.min(0.9, 0.2 + e.dmg / 40));
      if (e.dmg >= this.run.maxHp * 0.12) this.game.renderer.doFlash(0.22, [1, 0.25, 0.2]);
      const c = this.hero.group.position;
      this.W.sparks.emit({ pos: [c.x, 0.8, c.z], radial: [1, 2.5], count: 16, life: [0.2, 0.5], size: 1, color: ['#ff6a5a', '#ffffff'], glow: 2, gravity: 6, drag: 2 });
      if (rnd.chance(0.3)) this.say(bark(this.run.char, 'hurt'), 1.0);
    }
  }

  kindleBolt(el) {
    const from = this.heroHead().add(V3(0.35, 0.15, 0.1));
    const to = this.hitWorld();
    const col = EL_COLOR[el] || EL_COLOR.fire;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      this.W.sparks.emit({ pos: [from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * 0.4, from.z + (to.z - from.z) * t], spread: 0.15, count: 3, life: [0.15, 0.4], size: 1, color: ['#ffffff', col], glow: 3, drag: 2 });
    }
    this.sfx('kindle_cast', { vol: 0.7 });
  }

  onPhase(e) {
    const rig = this.rig;
    this.mon.setPhase && this.mon.setPhase(e.phase + 1);
    this.showTitle(e.text, null, 2.6);
    if (e.event === 'shatter') { this.co.start(this.lordShatterSeq.bind(this)); return; }
    this.mon.play('roar', { onDone: () => this.mon.play('idle') });
    this.sfx('boss_roar'); rig.shake(0.8); rig.fovPunch(5);
    this.game.renderer.doFlash(0.3, [1, 0.6, 0.9]);
    this.simHold = 1.3;
    this.tele = null;
  }

  // =============================================================== special attack
  startSpecial() {
    const sim = this.sim;
    if (!sim || sim.special < 1 || this.specialQ) return;
    this.specialQ = { t: 0, dur: 1.15, sweet: 0.74, res: null, done: false };
    this.critRing = null;
    this.sfx('special_charge');
    const h = this.hero.group.position;
    this.rig.moveTo([h.x + 0.5, 0.55, h.z + 2.1], [h.x + 0.9, 0.95, 0], 32, 0.35, 'outCubic');
    this.letterTarget = 0.6;
    this.hero.setExpression('determined');
    this.hero.play('cast');
  }

  updateSpecial(rdt) {
    const q = this.specialQ, inp = this.game.input;
    if (q.done) return;
    q.t += rdt;
    const u = q.t / q.dur;
    const pressed = inp.actionPressed('strike') || inp.actionPressed('special') || inp.pressed;
    const autoNow = this.auto && Math.abs(u - q.sweet) < 0.02;
    if (pressed || autoNow || u >= 1) {
      const d = Math.abs(u - q.sweet);
      q.quality = u >= 1 && !pressed ? 0.15 : d <= 0.05 ? 1 : d <= 0.14 ? 0.6 : 0.25;
      q.done = true;
      this.co.start(this.specialSeq.bind(this));
    }
  }

  *specialSeq() {
    const q = this.specialQ, rig = this.rig, ui = this.game.ui;
    const label = q.quality >= 1 ? 'PERFECT!' : q.quality >= 0.6 ? 'GREAT!' : 'OK';
    const g = this.hero.group;
    this.sfx(q.quality >= 1 ? 'qte_success' : 'qte_fail', { vol: q.quality >= 1 ? 1 : 0.5 });
    ui.float(label, ui.w / 2, ui.h / 2 - 50, { big: true, scale: 3, top: '#ffffff', bottom: q.quality >= 1 ? '#ffd25e' : '#a0a0c0', life: 0.9 });
    const target = this.monFront() - 0.55;
    this.hero.play(SWING[this.weapon.bp] === 'cast' ? 'cast' : 'smash', { speed: 1.4 });
    this.tw.to(g.position, { x: target, y: 0.35 }, 0.22, { ease: 'outQuad' });
    const hw = this.hitWorld();
    rig.moveTo([hw.x - 1.2, hw.y + 0.3, hw.z + 2.4], [hw.x, hw.y, 0], 34, 0.25, 'outCubic');
    yield 0.24;
    this.tw.to(g.position, { y: 0 }, 0.15);
    const el = topElement(this.weapon);
    const col = el ? EL_COLOR[el] : '#ffd25e';
    this.W.sparks.emit({ pos: [hw.x, hw.y, hw.z], radial: [2, 8], count: 160, life: [0.3, 1.1], size: [1, 2], color: ['#ffffff', col, '#ffd25e'], glow: 4, gravity: 4, drag: 1.5 });
    this.game.renderer.doFlash(0.55, [1, 0.95, 0.85]);
    this.sim.useSpecial(q.quality);
    for (const e of this.sim.drain()) this.onEvent(e);
    yield 0.5;
    this.letterTarget = 0;
    if (this.phase === 'fight') {
      this.tw.to(g.position, { x: this.heroFightX }, 0.35);
      this.goFightShot(0.6);
      this.heroAct('idleCombat', true);
    }
    this.specialQ = null;
  }

  // =============================================================== choice / flee
  chooseFists() {
    this.phase = 'cutscene';
    this.say('Fine. Knuckles it is!', 1.5);
    this.equip(FISTS);
    this.co.start(this.fightIntro.bind(this));
  }
  chooseFlee() {
    this.phase = 'flee';
    this.flee = { t: 0, dur: 2.4, need: 12, count: 0, res: null };
    this.sfx('qte_prompt');
  }
  updateFlee(rdt) {
    const f = this.flee, inp = this.game.input;
    if (f.res) return;
    f.t += rdt;
    if (inp.actionPressed('strike') || (inp.pressed && !this.game.ui.overUI()) || (this.auto && rnd.chance(0.5))) {
      f.count++;
      this.sfx('footstep', { pitch: 1 + f.count * 0.03 });
      this.hero.group.position.y = 0.06;
      this.tw.to(this.hero.group.position, { y: 0 }, 0.12);
    }
    if (f.count >= f.need) { f.res = 'win'; this.co.start(this.fleeSeq.bind(this, true)); }
    else if (f.t >= f.dur) { f.res = 'lose'; this.co.start(this.fleeSeq.bind(this, false)); }
  }
  *fleeSeq(ok) {
    if (!ok) {
      this.mon.play('attack', { onDone: () => this.mon.play('idle') });
      yield 0.15;
      const dmg = Math.max(1, Math.round(monsterStats(this.mid, this.run.region).dmg * 1.6));
      const dead = this.run.hurt(dmg);
      const h = this.screen(this.heroHead());
      this.game.ui.float(`-${dmg}`, h.x, h.y - 6, { big: true, scale: 3, top: '#ffd0c0', bottom: '#e03a3a' });
      this.sfx('hurt'); this.rig.shake(0.6); this.hero.play('hurt');
      if (dead) { this.phase = 'defeat'; yield* this.defeatSeq(); return; }
      yield 0.5;
    } else this.sfx('qte_success');
    this.say(ok ? 'Nope nope nope!' : 'Ow! Leaving now!', 1.4);
    this.face(-1);
    this.hero.play('run', { loop: true });
    this.tw.to(this.hero.group.position, { x: this.heroHome.x - 6 }, 1.3, { ease: 'inQuad' });
    yield 1.3;
    finish(this.game);
  }

  // =============================================================== victory / harvest / shatter
  *victorySeq() {
    const rig = this.rig, ui = this.game.ui, run = this.run;
    this.tele = null; this.critRing = null;
    this.slowmo(0.2, 0.7);
    const hw = this.hitWorld();
    rig.moveTo([hw.x - 1.6, hw.y + 0.4, hw.z + 2.6 + (this.mon.height || 1) * 0.6], [hw.x, hw.y, 0], 34, 0.5, 'outCubic');
    this.game.renderer.doFlash(0.45, [1, 1, 1]);
    rig.shake(0.7);
    this.mon.play('die');
    this.sfx('monster_die');
    this.W.sparks.emit({ pos: [hw.x, hw.y, hw.z], radial: [2, 6], count: 120, life: [0.4, 1.2], size: [1, 2], color: ['#ffffff', '#ffd25e', '#ff8a3a'], glow: 3, gravity: 4, drag: 1.5 });
    yield 0.25;
    yield 1.0;
    this.hero.setExpression('happy');
    this.heroAct('victory');
    this.big(this.boss ? (this.lord ? 'THE CURSE IS BROKEN' : 'BOSS DEFEATED') : 'VICTORY', 2.0, { scale: this.lord ? 3 : 4, top: '#fff6c8', bottom: '#ffb63d' });
    this.sfx('victory_sting');
    this.game.audio && this.game.audio.music('victory');
    this.say(bark(run.char, 'win'), 1.8);
    // rewards
    const [c0, c1] = this.def.coins || [5, 10];
    const coins = run.gain(c0 + Math.floor(rnd.next() * (c1 - c0 + 1)) + run.region * 3);
    if (coins > 0) {
      const p = this.screen(hw);
      ui.burst(p.x, p.y, 24, { colors: ['#ffd25e', '#fff0a8', '#d9902b'], speed: 120, up: 80, gravity: 200, kind: 'star' });
      ui.float(`+${coins}`, p.x, p.y - 30, { big: true, scale: 2, top: '#fff6c8', bottom: '#ffb63d', life: 1.4 });
      this.sfx('coins');
    }
    run.stats.kills++;
    if (this.elite) run.stats.elites++;
    save.data.stats.monsters++;
    save.learn('discovered.monsters', this.mid);
    yield 2.0;
    if (this.lord) { yield* this.curseBrokenSeq(); return; }
    this.startHarvest();
  }

  *curseBrokenSeq() {
    if (this.wmesh) {
      const wp = this.wmesh.getWorldPosition(V3());
      for (let i = 0; i < 40; i++) {
        this.W.sparks.emit({ pos: [wp.x, wp.y, wp.z], radial: [0.5, 2], count: 6, life: [0.6, 1.4], size: 1, color: ['#ffffff', '#fff0a8', '#ffd25e'], glow: 4, gravity: -1, drag: 1 });
        yield 0.04;
      }
    }
    this.say('It… didn\'t break!', 2.4);
    this.game.renderer.doFlash(0.6, [1, 0.95, 0.7]);
    yield 2.6;
    finish(this.game, { transition: 'fade' });
  }

  startHarvest() {
    const run = this.run, w = this.weapon || FISTS;
    const picks = Math.max(1, w.harvest || 1);
    const drops = monsterDrops(run, this.def, picks, w);
    if (!drops.length) { this.co.start(this.shatterSeq.bind(this)); return; }
    this.phase = 'harvest';
    this.harvest = { picks, left: picks, cards: drops.map((id) => ({ id, state: 'down', item: null, flip: 0, lift: 0 })), cut: null, contT: 0 };
    const hw = this.hitWorld();
    const mh = this.mon.height || 1;
    this.walkTo(Math.max(this.heroHome.x, this.monFront() - 0.75), this.heroHome.z + 0.25, 0.5);
    this.co.start(function* (s) { yield 0.5; s.face(1); s.hero.play('harvest', { loop: true }); }, this);
    this.rig.moveTo([hw.x + 0.8, Math.max(1.0, mh * 0.75), hw.z + 2.5 + mh * 0.8], [hw.x - 0.25, Math.max(0.35, mh * 0.3), 0], 36, 0.9);
    this.sfx('page_turn');
  }

  updateHarvest(rdt) {
    const H = this.harvest, inp = this.game.input;
    if (!H) return;
    for (const c of H.cards) c.lift = damp(c.lift, c.hover ? 4 : 0, 14, rdt);
    if (H.cut) {
      const c = H.cut;
      c.t += rdt;
      const u = c.t / c.dur;
      const pressed = inp.actionPressed('strike') || inp.pressed;
      if (pressed || (this.auto && Math.abs(u - 0.5) < 0.03) || u >= 1) this.resolveCut(u >= 1 && !pressed ? 1 : u);
      return;
    }
    if (this.auto) {
      if (H.left > 0) { const c = H.cards.find((x) => x.state === 'down'); if (c) this.startCut(c); else H.left = 0; }
      else { H.contT += rdt; if (H.contT > 1.2) this.endHarvest(); }
    }
  }

  startCut(card) {
    const H = this.harvest;
    if (!H || H.cut || H.left <= 0 || card.state !== 'down') return;
    const cps = this.mon.cutPoints && this.mon.cutPoints.length ? this.mon.cutPoints : [this.mon.hitPoint || V3(0, 0.5, 0)];
    const i = H.cards.indexOf(card);
    const wp = this.monWorld(cps[i % cps.length]);
    const ang = rnd.float(-0.9, -0.35) * (rnd.chance(0.5) ? 1 : -1);
    H.cut = { card, wp, t: 0, dur: 0.85, ang, len: 54 };
    card.state = 'cutting';
    this.sfx('qte_prompt', { vol: 0.5 });
  }

  resolveCut(u) {
    const H = this.harvest, c = H.cut, run = this.run, ui = this.game.ui;
    H.cut = null;
    const d = Math.abs(u - 0.5);
    const timing = d <= 0.08 ? 1 : d <= 0.2 ? 0 : -1;
    const grade = (this.weapon || FISTS).grade || 0;
    const gb = [-1, 0, 0, 1, 1][grade] ?? 0;
    const q = clamp(rollQuality(run.rng, gb + timing), 0, 4);
    const item = makeItem(c.card.id, q);
    run.bag.overflow.push(item);
    save.learn('discovered.materials', item.id);
    const card = c.card;
    card.item = item; card.state = 'flipping';
    this.tw.to(card, { flip: 1 }, 0.4, { ease: 'inOutQuad', onDone: () => (card.state = 'up') });
    H.left--;
    // slash FX
    const p = this.screen(c.wp);
    const dx = Math.cos(c.ang) * c.len / 2, dy = Math.sin(c.ang) * c.len / 2;
    this.slashes.push({ x1: p.x - dx, y1: p.y - dy, x2: p.x + dx, y2: p.y + dy, t: 0, good: timing >= 0 });
    this.W.sparks.emit({ pos: [c.wp.x, c.wp.y, c.wp.z], radial: [1, 3], count: 30, life: [0.2, 0.6], size: 1, color: ['#ffffff', this.def.model.accent || '#ffd25e'], glow: 2, gravity: 6, drag: 2 });
    this.debris.spawn({ pos: [c.wp.x, c.wp.y, c.wp.z], count: 5, colors: [this.def.model.body, this.def.model.belly || this.def.model.body], speed: 1.5, up: 2, floor: 0.02, life: 1 });
    this.sfx('harvest_slice');
    this.co.start(function* (s) { yield 0.18; s.sfx('card_flip'); }, this);
    this.game.hitStop(0.05);
    this.rig.shake(0.15);
    const label = timing > 0 ? 'CLEAN CUT!' : timing === 0 ? 'Cut' : 'Hacked';
    ui.float(label, p.x, p.y - 22, { color: timing > 0 ? COLORS.gold : timing === 0 ? COLORS.text : COLORS.dim, vy: -16 });
    ui.float(QUALITY[q].name, p.x, p.y - 10, { color: QUALITY[q].color, vy: -12, life: 1.1 });
  }

  endHarvest() {
    if (this.phase !== 'harvest') return;
    this.phase = 'shatter';
    this.co.start(this.shatterSeq.bind(this));
  }

  *shatterSeq() {
    this.phase = 'shatter';
    this.harvest = null;
    const run = this.run;
    const h = this.hero.group.position;
    this.face(1);
    this.heroAct('idle', true);
    if (!this.wmesh) {
      this.say('My knuckles survive. The curse doesn\'t care about knuckles.', 2.2);
      yield 2.4;
      yield* this.wrapUp();
      return;
    }
    this.walkTo(this.heroFightX, this.heroHome.z, 0.4);
    yield 0.4;
    this.face(1);
    this.hero.play('victory', { loop: true, expr: false });
    this.hero.setExpression('surprised');
    yield 0.35;
    const wp = this.wmesh.getWorldPosition(V3());
    this.rig.moveTo([wp.x + 0.75, wp.y + 0.2, wp.z + 2.1], [wp.x + 0.1, wp.y - 0.15, wp.z], 34, 0.8, 'inOutCubic');
    yield 0.6;
    this.caption = 'The curse stirs…';
    yield* this.shatterWeapon(1.5);
    this.caption = null;
    this.hero.play('idle', { loop: true });
    this.hero.setExpression('sad');
    this.say(bark(run.char, 'shatter'), 2.2);
    yield 2.2;
    yield* this.wrapUp();
  }

  /** Crack + explode the held weapon. */
  *shatterWeapon(dur = 1.5) {
    const run = this.run;
    const mesh = this.wmesh;
    if (!mesh) return;
    this.sfx('curse_hum');
    const t0 = this.time;
    const ticks = [0, 0.4, 0.75];
    let k = 0, ti = 0;
    while (k < 1) {
      k = clamp((this.time - t0) / dur, 0, 1);
      crackWeapon(mesh, k);
      if (ti < ticks.length && k >= ticks[ti]) { this.sfx('crack', { pitch: 1 + ti * 0.15 }); this.rig.shake(0.1 + ti * 0.1); ti++; }
      const wp = mesh.getWorldPosition(V3());
      if (rnd.chance(0.6)) this.W.sparks.emit({ pos: [wp.x, wp.y + 0.2, wp.z], posSpread: 0.25, vel: [0, 0.5, 0], spread: 0.3, count: 2, life: [0.3, 0.7], size: 1, color: ['#c86bff', '#ff5af0', '#ffffff'], glow: 3, drag: 1 });
      yield null;
    }
    const wp = mesh.getWorldPosition(V3());
    mesh.updateMatrixWorld(true);
    let pieces = [];
    try { pieces = shatterPieces(mesh) || []; } catch (err) { pieces = []; }
    const scene = this.W.scene;
    for (const pc of pieces) {
      const m = pc.mesh;
      if (m.parent) scene.attach(m);
      else { m.applyMatrix4(mesh.matrixWorld); scene.add(m); }
      const v = pc.velocity ? (pc.velocity.isVector3 ? pc.velocity.clone() : V3(...pc.velocity)) : V3();
      v.add(V3(rnd.float(-1.5, 1.5), rnd.float(1, 3), rnd.float(-0.5, 1.5)));
      this.shards.push({ m, v, w: V3(rnd.float(-10, 10), rnd.float(-10, 10), rnd.float(-10, 10)), t: 0, life: rnd.float(1.2, 1.8) });
    }
    this.hero.hold(null);
    if (mesh.parent) mesh.parent.remove(mesh);
    this.wmesh = null;
    const ids = (this.weapon && this.weapon.ids) || [];
    const cols = ids.map((id) => MATERIALS[id] && MATERIALS[id].color).filter(Boolean);
    this.debris.spawn({ pos: [wp.x, wp.y, wp.z], count: 24, colors: cols.length ? cols : ['#c0c8d0'], speed: 3, up: 3, floor: 0.02, life: 1.6, scale: [0.4, 1] });
    this.W.sparks.emit({ pos: [wp.x, wp.y, wp.z], radial: [2, 6], count: 120, life: [0.3, 1.0], size: [1, 2], color: ['#ffffff', '#c86bff', '#ff5af0'], glow: 4, gravity: 5, drag: 1.5 });
    this.sfx('shatter');
    this.game.renderer.doFlash(0.4, [0.85, 0.5, 1]);
    this.game.hitStop(0.08);
    this.rig.shake(0.7);
    const p = this.screen(wp);
    this.game.ui.float('SHATTERED', p.x, p.y - 20, { big: true, scale: 2, top: '#f0d0ff', bottom: '#9a3ae0', life: 1.4 });
    run.stats.shattered++;
    save.data.stats.weaponsShattered++;
    save.write();
    if (run.char === 'bran') {
      const metals = ids.filter((id) => MATERIALS[id] && MATERIALS[id].tags.includes('metal')).sort((a, b) => MATERIALS[b].value - MATERIALS[a].value);
      const sal = makeItem(metals[0] || 'junk', 1);
      run.bag.overflow.push(sal);
      this.game.ui.toast(`Salvaged: ${MATERIALS[sal.id].name}`, { icon: 'ore', color: COLORS.gold });
    }
  }

  updateShards(dt) {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      s.v.y -= 9.8 * dt;
      s.m.position.addScaledVector(s.v, dt);
      if (s.m.position.y < 0.02) { s.m.position.y = 0.02; s.v.y *= -0.3; s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.5); }
      s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
      const k = s.t / s.life;
      if (k > 0.7) s.m.scale.setScalar(Math.max(0.01, 1 - (k - 0.7) / 0.3));
      if (k >= 1) { s.m.parent && s.m.parent.remove(s.m); this.shards.splice(i, 1); }
    }
  }

  *wrapUp() {
    const game = this.game, run = this.run;
    this.phase = 'done';
    if (run.bag.overflow.length) {
      const o = openBag(game, { title: 'Spoils', onClose: () => finish(game) });
      if (!o) finish(game);
    } else finish(game);
  }

  // =============================================================== cursed lord: mid-fight shatter
  *lordShatterSeq() {
    this.phase = 'cutscene';
    this.tele = null; this.critRing = null;
    this.mon.play('special', { onDone: () => this.mon.play('idle') });
    this.sfx('curse_hum'); this.rig.shake(0.6);
    const h = this.hero.group.position;
    this.rig.moveTo([h.x + 0.4, 1.15, h.z + 2.0], [h.x + 0.2, 0.95, 0], 34, 0.5, 'outCubic');
    yield 0.6;
    if (this.wmesh) yield* this.shatterWeapon(0.7);
    this.hero.setExpression('angry');
    this.say(this.run.char === 'durgan' ? 'THEN I\'LL MAKE ANOTHER!' : 'Then I\'ll forge another!', 1.8);
    yield 1.4;
    yield* this.goToAnvil(0.45);
    this.hero.play('forge');
    yield 0.4;
    this.openForgeUI(true);
  }

  *resumeAfterEmergency() {
    yield this.walkTo(this.heroFightX, this.heroHome.z, 0.45);
    this.face(1);
    this.heroAct('idleCombat', true);
    this.goFightShot(0.6);
    yield 0.5;
    this.big('FIGHT ON!', 1.0, { scale: 3, top: '#fff6c8', bottom: '#c86bff' });
    this.sim.rearm(this.weapon);
    this.phase = 'fight';
  }

  // =============================================================== defeat
  *defeatSeq() {
    this.phase = 'defeat';
    this.tele = null; this.critRing = null; this.specialQ = null;
    this.slowmo(0.3, 1.0);
    this.hero.play('defeat');
    this.hero.setExpression('hurt');
    const h = this.hero.group.position;
    this.rig.moveTo([h.x + 0.3, 0.9, h.z + 2.2], [h.x, 0.5, 0], 34, 1.4, 'inOutCubic');
    this.sfx('defeat_sting');
    this.game.audio && this.game.audio.stopMusic(1.5);
    yield 3.0;
    gameOver(this.game, this.def.name);
  }

  // =============================================================== drawing
  draw(ui) {
    const sim = this.sim;
    const showHud = this.letter < 0.5 && this.phase !== 'defeat';
    // world-anchored UI
    if (this.phase === 'fight' && sim && !this.specialQ) { this.drawCritRing(ui); this.drawTelegraph(ui); }
    for (const s of this.slashes) this.drawSlash(ui, s);
    for (const b of this.bubbles) {
      const pos = b.who === 'hero' ? this.screen(this.heroHead().add(V3(0, 0.25, 0))) : this.screen(this.monTop());
      speech(ui, pos.x, pos.y, b.text, { alpha: b.t < 0.12 ? b.t / 0.12 : b.t > b.dur - 0.25 ? Math.max(0, (b.dur - b.t) / 0.25) : 1 });
    }

    if (showHud) {
      hud(ui, this.game, { bag: false });
      if (sim || this.phase === 'forge' || this.phase === 'choice') this.drawMonsterBar(ui);
      if (sim && ['fight', 'cutscene', 'emergency'].includes(this.phase)) { this.drawWeaponPanel(ui); this.drawSpecial(ui); this.drawPlayerStatus(ui); }
    }
    if (this.specialQ && !this.specialQ.done) this.drawSpecialQTE(ui);

    if (this.forgeCtrl && this.forgeCtrl.active) this.forgeCtrl.draw(ui);
    if (this.phase === 'choice') this.drawChoice(ui);
    if (this.phase === 'flee' && this.flee) this.drawFlee(ui);
    if (this.phase === 'harvest' && this.harvest) this.drawHarvest(ui);
    if (this.tip && this.phase === 'fight') this.drawTip(ui);

    // cinematic overlays
    if (this.letter > 0.01) {
      const bh = Math.round(30 * this.letter);
      ui.rect(0, 0, ui.w, bh, '#000000');
      ui.rect(0, ui.h - bh, ui.w, bh, '#000000');
    }
    if (this.caption) ui.text(this.caption, ui.w / 2, ui.h - 22, { align: 'center', color: COLORS.white, outline: '#000000', outlineShadow: false, maxW: ui.w - 60 });
    this.drawTitleCard(ui);
    for (const b of this.bigs) {
      const k = b.t / b.dur;
      const pop = k < 0.15 ? 1 + (1 - k / 0.15) * 0.8 : 1;
      ui.big(b.text, ui.w / 2, b.y ?? ui.h / 2 - 30, { scale: b.scale || 3, top: b.top, bottom: b.bottom, pop: Math.round(pop * 4) / 4, alpha: k > 0.8 ? (1 - k) / 0.2 : 1 });
    }
    if (this.phase === 'defeat' && this.defeatFade > 0) {
      ui.rect(0, 0, ui.w, ui.h, '#07060b', this.defeatFade * 0.85);
      ui.ctx.globalAlpha = this.defeatFade;
      ui.big('FALLEN', ui.w / 2, ui.h / 2 - 20, { scale: 4, top: '#e0c0ff', bottom: '#7a3ab0' });
      ui.text('The curse drags you back to the campfire…', ui.w / 2, ui.h / 2 + 10, { align: 'center', color: '#c8b8d8' });
      ui.ctx.globalAlpha = 1;
    }
  }

  drawTitleCard(ui) {
    const tc = this.titleCard;
    if (!tc) return;
    const k = tc.t / tc.dur;
    const a = k < 0.12 ? k / 0.12 : k > 0.82 ? Math.max(0, (1 - k) / 0.18) : 1;
    if (tc.boss) {
      ui.ctx.globalAlpha = a;
      ui.big(tc.name.toUpperCase(), ui.w / 2, ui.h / 2 - 34, { scale: 3, top: '#fff6c8', bottom: '#ff8a3a' });
      if (tc.sub) ui.text(tc.sub, ui.w / 2, ui.h / 2 - 12, { align: 'center', color: '#e8d8c0', outline: '#140c10', outlineShadow: false });
      ui.ctx.globalAlpha = 1;
    } else {
      const y = this.sim ? 46 : 40;
      ribbonTitle(ui, tc.name, ui.w / 2, y, this.boss ? 'gold' : this.elite ? 'purple' : 'red', a);
      if (tc.sub) ui.text(tc.sub, ui.w / 2, y + 17, { align: 'center', font: 'small', color: this.elite ? COLORS.epic : COLORS.gold, outline: '#140c10' });
    }
  }

  drawMonsterBar(ui) {
    const sim = this.sim;
    const hp = sim ? sim.m.hp : 1, max = sim ? sim.m.maxHp : 1;
    const big = this.boss;
    const bw = big ? Math.min(300, ui.w - 260) : 150;
    const x = Math.round(ui.w / 2 - bw / 2), y = 8;
    ui.panel('dark', x - 5, y - 4, bw + 10, big ? 30 : 27, { accent: big ? 'gold' : this.elite ? 'purple' : 'red' });
    ui.text(this.def.name + (this.elite ? ' {epic}★{/}' : ''), ui.w / 2, y, { align: 'center', color: big ? COLORS.gold : COLORS.white, outline: '#140c10', outlineShadow: false });
    const by = y + 11, bh = big ? 9 : 7;
    ui.img(bar(bw, bh, Math.max(this.hpTrail, hp / max), ['#8a8478', '#e8e0d0', '#ffffff']), x, by);
    const fw = Math.round((bw - 2) * clamp(hp / max, 0, 1));
    const cols = big ? ['#5a1a6a', '#b03ad0', '#ff9af0'] : ['#7a1a22', '#d03a3a', '#ff8a7a'];
    if (fw > 0) {
      ui.rect(x + 1, by + 1, fw, bh - 2, cols[1]);
      ui.rect(x + 1, by + 1, fw, 1, cols[2]);
      ui.rect(x + 1, by + bh - 2, fw, 1, cols[0]);
    }
    if (sim) ui.text(`${fmt(Math.max(0, hp))}/${fmt(max)}`, ui.w / 2, by + 1, { align: 'center', font: 'small', color: '#ffffff', outline: '#140c10' });
    if (big && this.def.phases) for (const ph of this.def.phases) { const px = x + Math.round(bw * ph.at); ui.rect(px, by - 1, 1, bh + 2, '#ffd25e'); }
    // statuses
    if (!sim) return;
    const st = sim.m.st;
    const list = [];
    if (st.burn > 0) list.push(['fire', st.burn]);
    if (st.frozen > 0) list.push(['ice', 'FROZEN']); else if (st.chill > 0) list.push(['ice', st.chill]);
    if (st.poison > 0) list.push(['poison', st.poison]);
    if (st.bleed > 0) list.push(['bleed', st.bleed]);
    if (st.stun > 0) list.push(['shock', 'STUN']);
    if (sim.m.armor > 0) list.push(['shield', fmt(Math.round(sim.m.armor))]);
    let sx = x, sy = by + bh + 3;
    for (const [ic, n] of list) {
      ui.icon(ic, sx, sy);
      ui.text(String(n), sx + 10, sy + 2, { font: 'small', color: COLORS.white, outline: '#140c10' });
      sx += 14 + ui.measure(String(n), 'small');
    }
    if (list.length && ui.hit('mon-status', x, sy, Math.max(20, sx - x), 10, { cursor: false }).hover) ui.tooltip({ title: 'Status', body: 'Burn, Poison and Bleed tick every second. 5 Chill = Freeze. Armor reduces every hit.' });
  }

  drawWeaponPanel(ui) {
    const w = this.weapon;
    if (!w) return;
    const x = 4, y = ui.h - 42, pw = 168;
    ui.panel('dark', x, y, pw, 38, { accent: w.grade >= 4 ? 'gold' : 'blue' });
    if (w.bp !== 'fists') ui.img(weaponSprite(w, 30), x + 4, y + 4);
    else ui.icon('crit', x + 12, y + 14);
    const g = GRADES[w.grade || 0];
    ui.text(w.name, x + 38, y + 5, { font: 'small', color: g.color, maxW: pw - 44, lineHeight: 7 });
    ui.text(`{@sword}${fmt(w.dmg)}  {@clock}${w.interval.toFixed(2)}s`, x + 38, y + 24, { color: COLORS.white });
    if (ui.hit('wpn-panel', x, y, pw, 38, { cursor: false }).hover) {
      const el = Object.entries(w.el || {}).filter(([, v]) => v > 0).map(([k, v]) => `{${k}}${k} ${v}{/}`).join(' ');
      ui.tooltip({ title: w.name, color: g.color, body: `${g.name} · ${fmt(w.dmg)} per hit\nCrit ×${(w.critMult || 2).toFixed(1)}${el ? '\n' + el : ''}${w.multi ? `\n+${w.multi} extra hit` : ''}` });
    }
  }

  drawSpecial(ui) {
    const sim = this.sim;
    const w = 120, x = Math.round(ui.w / 2 - w / 2), y = ui.h - 20;
    const full = sim.special >= 1;
    ui.panel('dark', x - 4, y - 5, w + 8, 18, { accent: full ? 'gold' : 'purple' });
    const pulse = full ? 0.5 + Math.sin(this.time * 10) * 0.5 : 0;
    ui.img(bar(w, 8, sim.special, full ? ['#a06a10', '#ffd25e', '#ffffff'] : ['#3a1a5a', '#8a4ad0', '#d0a0ff']), x, y);
    if (full) {
      ui.rect(x, y, w, 8, '#ffffff', pulse * 0.25);
      ui.text('SPECIAL READY', ui.w / 2, y - 14, { align: 'center', color: COLORS.gold, outline: '#140c10' });
      ui.keycap('E', x + w + 8, y - 2, pulse > 0.5);
      if (ui.hit('special-btn', x - 4, y - 5, w + 8, 18).clicked) this.startSpecial();
    } else ui.text('SPECIAL', ui.w / 2, y + 1, { align: 'center', font: 'small', color: '#e0d0ff', outline: '#140c10' });
    if (this.run.char === 'durgan') {
      for (let i = 0; i < 5; i++) {
        const gx = x - 4 - 9 * 5 + i * 9 - 4, gy = y - 2;
        ui.rect(gx, gy, 6, 6, '#140c10');
        ui.rect(gx + 1, gy + 1, 4, 4, i < sim.grit ? '#ffd25e' : '#3a2e2a');
      }
      if (ui.hit('grit', x - 54, y - 4, 48, 12, { cursor: false }).hover) ui.tooltip({ title: 'Grit', body: `Perfect blocks build Grit: +8% damage each (${sim.grit}/5).` });
    }
  }

  drawPlayerStatus(ui) {
    const st = this.sim.pst;
    const map = [['web', 'event', 'Webbed: slower swings'], ['daze', 'eye', 'Dazed: smaller crit window'], ['poison', 'poison', 'Poisoned'], ['burn', 'fire', 'Burning'], ['cracked', 'curse', 'Weapon cracked: -20% damage']];
    let x = 36;
    for (const [k, ic, tip] of map) {
      if (!(st[k] > 0)) continue;
      ui.icon(ic, x, 36);
      if (ui.hit('pst-' + k, x, 36, 10, 10, { cursor: false }).hover) ui.tooltip(tip);
      x += 12;
    }
  }

  drawCritRing(ui) {
    const sim = this.sim, cr = this.critRing;
    const p = this.screen(this.hitWorld());
    if (this.critFlash) {
      const k = this.critFlash.t / 0.35;
      ring(ui.ctx, this.critFlash.x, this.critFlash.y, 10 + k * 26, '#ffd25e', 2, 1 - k);
      ring(ui.ctx, this.critFlash.x, this.critFlash.y, 10 + k * 16, '#ffffff', 1, 1 - k);
    }
    if (!cr || !sim.swing || !sim.swing.critRing || sim.swing.pressed) return;
    const remain = (cr.impact - sim.t) / cr.windup;
    if (remain < -0.3) return;
    const r = 9 + Math.max(0, remain) * 42;
    const inWin = Math.abs(cr.impact - sim.t) <= cr.win;
    ring(ui.ctx, p.x, p.y, 9, inWin ? '#ffffff' : '#ffd25e', 2, 0.9);
    ring(ui.ctx, p.x, p.y, r, inWin ? '#ffffff' : '#fff0b0', remain < 0.25 ? 2 : 1, clamp(1.2 - remain, 0.3, 1));
    ui.rect(Math.round(p.x) - 1, Math.round(p.y), 3, 1, '#ffd25e');
    ui.rect(Math.round(p.x), Math.round(p.y) - 1, 1, 3, '#ffd25e');
    if (this.run.stats.kills < 3 || this.auto) prompt(ui, p.x + 16, p.y + 8, 'SPACE', 'Crit!', this.time, { mouse: 'mouseL', pulse: inWin });
  }

  drawTelegraph(ui) {
    const sim = this.sim, T = this.tele;
    if (!T) return;
    if (T.res) {
      T.rt += this.game.ui.dt || 0.016;
      if (T.rt > 0.45) { this.tele = null; return; }
    }
    const p = this.screen(this.monTop());
    const x = Math.round(p.x), y = Math.round(Math.max(48, p.y - 4));
    const alpha = T.res ? 1 - T.rt / 0.45 : 1;
    const color = T.kind === 'unblockable' ? '#ff4a4a' : T.kind === 'heavy' ? '#ff9a3a' : T.kind === 'special' ? '#c08aff' : '#ffe08a';
    ui.ctx.globalAlpha = alpha;
    const label = T.kind === 'multi' ? `${T.name} ×${(sim.m.attack && sim.m.attack.hits) || ''}` : T.name;
    ui.text(label, x, y - 30, { align: 'center', font: 'small', color, outline: '#140c10' });
    ui.icon(T.kind === 'unblockable' ? 'skull' : T.kind === 'heavy' ? 'crit' : T.kind === 'special' ? 'curse' : 'block', x, y - 18, { center: true });
    const bw = 46, bx = x - bw / 2, by = y - 9;
    ui.rect(bx - 1, by - 1, bw + 2, 6, '#140c10');
    ui.rect(bx, by, bw, 4, '#2a1d22');
    const win = sim.parryWin(), bwin = sim.blockWin();
    if (T.kind !== 'unblockable') { const zb = Math.min(1, bwin / T.windup) * bw; ui.rect(bx + bw - zb, by, zb, 4, '#4a6a8a'); }
    const zp = Math.max(2, Math.min(1, win / T.windup) * bw);
    ui.rect(bx + bw - zp, by, zp, 4, '#ffd25e');
    const prog = clamp((sim.t - T.start) / T.windup, 0, 1.1);
    ui.rect(Math.round(bx + Math.min(bw, prog * bw)), by - 2, 1, 8, '#ffffff');
    if (!T.res) prompt(ui, x + bw / 2 + 4, by - 5, 'SHIFT', T.kind === 'unblockable' ? 'Parry only!' : '', this.time, { mouse: 'mouseR', pulse: prog > 1 - (bwin / T.windup), color });
    if (T.res) {
      const txt = { parry: 'PARRIED', block: 'BLOCKED', hit: 'HIT', miss: 'MISSED', interrupt: 'INTERRUPTED' }[T.res];
      ui.text(txt, x, by + 7, { align: 'center', font: 'small', color: T.res === 'hit' ? COLORS.bad : COLORS.good, outline: '#140c10' });
    }
    ui.ctx.globalAlpha = 1;
  }

  drawSpecialQTE(ui) {
    const q = this.specialQ;
    const w = 180, x = Math.round(ui.w / 2 - w / 2), y = Math.round(ui.h / 2 + 30);
    ui.panel('dark', x - 8, y - 22, w + 16, 40, { accent: 'gold' });
    ui.text('UNLEASH!', ui.w / 2, y - 16, { align: 'center', color: COLORS.gold, outline: '#140c10' });
    ui.rect(x, y, w, 8, '#2a1d22');
    const sx = x + Math.round(q.sweet * w);
    ui.rect(sx - Math.round(0.14 * w), y, Math.round(0.28 * w), 8, '#5a4a2a');
    ui.rect(sx - Math.round(0.05 * w), y, Math.round(0.1 * w), 8, '#ffd25e');
    const mx = x + Math.round(clamp(q.t / q.dur, 0, 1) * w);
    ui.rect(mx - 1, y - 3, 3, 14, '#ffffff');
    prompt(ui, x + w + 4, y - 2, 'SPACE', '', this.time, { mouse: 'mouseL' });
  }

  drawChoice(ui) {
    dim(ui, 0.35);
    const w = 240, h = 92, x = Math.round(ui.w / 2 - w / 2), y = Math.round(ui.h / 2 - h / 2);
    ui.panel('parchment', x, y, w, h);
    ui.text('No solid materials to forge a weapon!', ui.w / 2, y + 12, { align: 'center', color: '#3a2618', maxW: w - 20 });
    ui.text('{dim}Ore, gems, bones or shells give a blade its body.{/}', ui.w / 2, y + 26, { align: 'center', font: 'small', color: '#5a4030', maxW: w - 20 });
    if (ui.button('cb-fists', x + 14, y + 50, 100, 22, 'Bare fists', { style: 'iron', icon: 'crit', tip: 'Weak, fast punches. Better than nothing!' })) this.chooseFists();
    const canFlee = !this.boss;
    if (ui.button('cb-flee', x + w - 114, y + 50, 100, 22, 'Flee', { style: 'red', icon: 'flee', disabled: !canFlee, tip: canFlee ? 'Mash to escape. Fail and you take a heavy hit.' : 'The boss blocks the way!' })) this.chooseFlee();
  }

  drawFlee(ui) {
    const f = this.flee;
    const w = 160, x = Math.round(ui.w / 2 - w / 2), y = Math.round(ui.h / 2 + 20);
    ui.panel('dark', x - 8, y - 24, w + 16, 46, { accent: 'red' });
    ui.text(f.res === 'win' ? 'ESCAPED!' : f.res === 'lose' ? 'CAUGHT!' : 'MASH TO RUN!', ui.w / 2, y - 18, { align: 'center', color: f.res === 'lose' ? COLORS.bad : COLORS.gold, outline: '#140c10' });
    ui.img(bar(w, 8, f.count / f.need, ['#2a6a3a', '#5fd17a', '#b8f5a8']), x, y - 4);
    ui.img(bar(w, 4, 1 - f.t / f.dur, ['#7a5a1a', '#e0b85a', '#fff0b0']), x, y + 8);
    if (!f.res) prompt(ui, x + w / 2 - 20, y + 15, 'SPACE', '', this.time, { mouse: 'mouseL' });
  }

  drawHarvest(ui) {
    const H = this.harvest;
    ribbonTitle(ui, H.left > 0 ? `HARVEST · ${H.left} cut${H.left > 1 ? 's' : ''} left` : 'HARVEST', ui.w / 2, 40, 'green');
    if (H.left > 0 && !H.cut) ui.text('Pick a card, then strike as the blade crosses the mark.', ui.w / 2, 58, { align: 'center', color: COLORS.white, outline: '#140c10', outlineShadow: false });
    const n = H.cards.length, cw = 48, gap = 8;
    const total = n * cw + (n - 1) * gap;
    const x0 = Math.round(ui.w / 2 - total / 2), y0 = ui.h - 64 - 34;
    let hoverItem = null;
    H.cards.forEach((c, i) => {
      const x = x0 + i * (cw + gap);
      const hit = ui.hit('hv' + i, x, y0 - 4, cw, 68, { cursor: c.state === 'down' && H.left > 0 && !H.cut ? 'hand' : false });
      c.hover = hit.hover && c.state === 'down' && H.left > 0 && !H.cut;
      if (hit.clicked && c.state === 'down') this.startCut(c);
      if (hit.hover && c.item) hoverItem = c.item;
      const showFace = c.flip >= 0.5 && c.item;
      const sx = Math.max(0.04, Math.abs(Math.cos(c.flip * Math.PI)));
      const img = showFace ? materialCard(c.item) : cardBack('part');
      const ctx = ui.ctx;
      ctx.save();
      ctx.translate(Math.round(x + cw / 2), 0);
      ctx.scale(Math.round(sx * 16) / 16, 1);
      ctx.translate(-Math.round(x + cw / 2), 0);
      drawCard(ui, img, x, y0, { lift: Math.round(c.lift), hover: c.hover, dim: c.state === 'down' && H.left <= 0 });
      ctx.restore();
      if (c.state === 'cutting') ring(ui.ctx, x + cw / 2, y0 + 32, 30 + Math.sin(this.time * 12) * 2, '#ffd25e', 1, 0.7);
      if (c.state === 'down' && H.left <= 0) ui.rect(x, y0, cw, 64, '#07060b', 0.5);
    });
    if (hoverItem) ui.tooltip(itemTooltip(hoverItem));
    if (H.cut) this.drawCut(ui, H.cut);
    if (H.left <= 0 && !H.cut) {
      if (ui.button('hv-done', ui.w / 2 - 50, ui.h - 30, 100, 22, 'Continue', { style: 'gold', icon: 'arrowR' }) || this.game.input.actionPressed('confirm')) this.endHarvest();
    } else if (!H.cut && ui.button('hv-skip', ui.w - 84, ui.h - 30, 80, 20, 'Skip', { style: 'stone' })) { H.left = 0; }
  }

  drawCut(ui, c) {
    const p = this.screen(c.wp);
    const dx = Math.cos(c.ang), dy = Math.sin(c.ang);
    const L = c.len;
    const ctx = ui.ctx;
    for (let i = -L / 2; i <= L / 2; i += 2) {
      const u = (i + L / 2) / L;
      const inSweet = Math.abs(u - 0.5) <= 0.08, inGood = Math.abs(u - 0.5) <= 0.2;
      ctx.fillStyle = inSweet ? '#ffd25e' : inGood ? '#e8d8b0' : '#8a7a6a';
      ctx.fillRect(Math.round(p.x + dx * i), Math.round(p.y + dy * i), inSweet ? 2 : 1, inSweet ? 2 : 1);
    }
    const u = clamp(c.t / c.dur, 0, 1);
    const mx = p.x + dx * (u - 0.5) * L, my = p.y + dy * (u - 0.5) * L;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3);
    for (let k = 1; k < 5; k++) { ctx.globalAlpha = 1 - k / 5; ctx.fillRect(Math.round(mx - dx * k * 3), Math.round(my - dy * k * 3), 1, 1); }
    ctx.globalAlpha = 1;
    ring(ctx, p.x, p.y, 5, '#ffd25e', 1, 0.8);
    prompt(ui, p.x + 30, p.y + 10, 'SPACE', 'Slice!', this.time, { mouse: 'mouseL' });
  }

  drawSlash(ui, s) {
    const k = s.t / 0.3;
    const ctx = ui.ctx;
    const n = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1));
    ctx.globalAlpha = 1 - k;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const w = Math.sin(u * Math.PI) * (s.good ? 3 : 2) * (1 - k * 0.5);
      ctx.fillStyle = u > 0.3 && u < 0.7 ? '#ffffff' : '#fff0b0';
      ctx.fillRect(Math.round(s.x1 + (s.x2 - s.x1) * u), Math.round(s.y1 + (s.y2 - s.y1) * u - w / 2), 1, Math.max(1, Math.round(w)));
    }
    ctx.globalAlpha = 1;
  }

  drawTip(ui) {
    dim(ui, 0.45);
    const w = 268, h = 118, x = Math.round(ui.w / 2 - w / 2), y = Math.round(ui.h / 2 - h / 2);
    ui.panel('parchment', x, y, w, h);
    ui.text('How to fight', ui.w / 2, y + 9, { align: 'center', color: '#3a2618' });
    const ink = '#3a2618';
    ui.keycap('SPACE', x + 14, y + 26); ui.icon('mouseL', x + 44, y + 27);
    ui.text('when the ring closes: {crit}CRIT{/}', x + 58, y + 28, { color: ink });
    ui.keycap('SHIFT', x + 14, y + 44); ui.icon('mouseR', x + 44, y + 45);
    ui.text('as a hit lands: {gold}PARRY{/} / block', x + 58, y + 46, { color: ink });
    ui.keycap('E', x + 14, y + 62);
    ui.text('when charged: {mult}SPECIAL{/}', x + 58, y + 64, { color: ink });
    ui.text('{bad}Red attacks{/} can only be parried.', x + 14, y + 80, { color: ink });
    if (ui.button('tip-ok', ui.w / 2 - 40, y + h - 24, 80, 18, 'Got it!', { style: 'gold' })) this.closeTip();
  }
}
