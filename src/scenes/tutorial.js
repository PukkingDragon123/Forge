// The tutorial chase (docs/REDESIGN.md §5): Durgan bolts out of the camp with Medusa's snake behind
// him. Morel, a nervous little mushroom guy, pops out of a ring of caps and teaches him on the run,
// one gated beat at a time, all in the real game (the action engine, the Hades camera, the HUD):
//   move → dash over the gap → whack two training shroomlings (the stone axe petrifies them) →
//   mine a statue (zoom-in) → craft Spore Burst at the stump bench (ingredients in order) → it's
//   slotted → use it on a little wave → the snake catches up: Morel shoves you down the hole and is
//   turned to stone saving you. You fall into Stage 1.
// Params: { char, onDone } (flow.js). Dev: ?scene=tutorial (skip after the first time: top right).
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import * as Action from '../action/index.js';
import * as Enemies from '../action/enemies/index.js';
import { buildRoom } from '../models/room_vox.js';
import { buildMonster } from '../models/monsters.js';
import { buildPet } from '../models/pet.js';
import * as Loadout from '../systems/loadout.js';
import * as RunMod from '../systems/run.js';
import * as Flow from './flow.js';
import { drawActionHud, makeHudState, hudToast } from '../ui/hud_action.js';
import { drawFloat } from './dialogue.js';
import { tagCanvas } from '../art/handpaint.js';
import { MONSTERS } from '../data/monsters.js';
import { save } from '../core/save.js';
import { clamp, ease } from '../core/math.js';

const has = (o, k) => o && typeof o[k] === 'function';
const groupOf = (m) => (m ? (m.isObject3D ? m : m.group) : null);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const playFirst = (m, names, opts = {}) => { if (!m || !m.play) return null; for (const n of [].concat(names)) { m.play(n, opts); if (m.anim === n || m.state === n) return n; } return null; };

// ------------------------------------------------------------------ a training shroomling (and a stand-in foe)
/** A passive (or simple hopping) shroomling the engine can hit, knock back and kill. */
class TutFoe extends Action.Entity {
  constructor(id, x, z, o = {}) {
    super({ x, z, team: 'enemy', radius: 0.42, mass: 1, hp: o.hp ?? 30 });
    this.id = id; this.def = MONSTERS[id] || null;
    this.passive = !!o.passive;
    let m = null;
    try { m = buildMonster(id); } catch (e) { m = null; }
    this.model = m;
    this.height = (m && m.height) || 0.9;
    this.chipColors = ['#e8d8b8', '#c84a3a', '#8ad04a'];
    this.hopT = Math.random();
    this.facing = Math.PI * 1.5;
  }
  update(h, w) {
    const P = w.player;
    if (!P || this.passive) { this.vx = this.vz = 0; return; }
    const dx = P.x - this.x, dz = P.z - this.z, d = Math.hypot(dx, dz) || 1;
    this.facing = Math.atan2(dx, dz);
    this.hopT -= h;
    if (this.hopT <= 0) { this.hopT = 0.9 + Math.random() * 0.5; this.vx = (dx / d) * 2.4; this.vz = (dz / d) * 2.4; playFirst(this.model, ['attack', 'move', 'idle']); }
    else { this.vx *= 0.92; this.vz *= 0.92; }
    if (d < this.radius + P.radius + 0.1 && (this.biteT = (this.biteT || 0) - h) <= 0) { this.biteT = 1.1; w.damage(P, { dmg: 3, kb: 0.5, dir: { x: dx / d, z: dz / d }, source: this }); }
  }
  hurt() { playFirst(this.model, ['hurt']); }
}

// ------------------------------------------------------------------ the scene
export class TutorialScene extends Scene {
  enter(params = {}) {
    const game = this.game;
    this.params = params;
    if (!game.run && RunMod.Run) game.run = new RunMod.Run(params.char || 'durgan', params.seed || String(Date.now()));
    const run = (this.run = game.run);
    // ---- the strip and the engine
    let room = null;
    try { room = buildRoom(0, { type: 'chase', seed: 11 }, { type: 'chase', size: 'chase', seed: 11 }); } catch (e) { room = buildRoom(0, { type: 'fight', seed: 11 }, { size: 'large' }); }
    if (has(room, 'finishCore')) room.finishCore();
    this.room = room;
    const aw = (this.aw = new Action.ActionWorld(game, { room }));
    this.cam = aw.cam;
    this.world = { scene: aw.scene, camera: aw.cam.camera, post: { bloom: 0.75, threshold: 0.8, vignette: 0.46, outline: 0.55, edge: 0.3, saturation: 1.12, contrast: 1.05 } };
    const A = (this.A = room.anchors || {});
    const B = room.bounds || { x0: -22, x1: 22, z0: -4.5, z1: 4.5 };
    this.start = A.start ? A.start.clone() : V(B.x0 + 1.5, 0, 0);
    this.ringAt = A.ring ? A.ring.clone() : V(B.x0 + 8, 0, 0);
    this.gap = A.gap || { x0: B.x0 + 13.5, x1: B.x0 + 15, z0: B.z0, z1: B.z1 };
    this.dummyAt = (A.dummies && A.dummies.length ? A.dummies : [V(-1, 0, -1.4), V(1.6, 0, 1.3)]).map((v) => v.clone());
    this.benchAt = A.benchFront ? A.benchFront.clone() : A.bench ? A.bench.clone().setY(0).add(V(0, 0, 1.2)) : V(11, 0, -1.2);
    this.waveAt = A.wave ? A.wave.clone() : V(B.x1 - 5, 0, 0);
    this.holeAt = A.hole ? A.hole.clone() : V(B.x1 - 1.2, 0, 0);
    // ---- Durgan (and Pip at his heel)
    this.loadout = this.computeLoadout();
    this.player = new Action.Player(aw, run.char || 'durgan', this.loadout, { facing: Math.PI / 2 });
    this.player.x = this.start.x; this.player.z = this.start.z;
    if (has(this.cam, 'snap')) this.cam.snap(this.player.x + 2, this.player.z);
    try { const pm = buildPet(); this.pet = new Action.PetFollower(aw, pm); this.pet.x = this.start.x - 1; this.pet.z = 0.6; aw.add(this.pet); } catch (e) { this.pet = null; }
    // ---- Morel (hidden in his ring of caps until he pops out)
    const m0 = this.ringAt.clone().add(V(0.6, 0, -0.6));
    try { this.morel = has(Enemies, 'spawnNPC') ? Enemies.spawnNPC(aw, 'morel', m0.x, m0.z) : null; } catch (e) { this.morel = null; }
    if (this.morel && this.morel.model && !this.morel.model.parent) aw.scene.add(this.morel.model);
    if (!this.morel) this.morel = this.prop('morel', m0, -Math.PI / 2);
    const mg0 = this.mg();
    if (mg0) { mg0.visible = false; mg0.scale.setScalar(0.01); }
    // ---- the snake, always somewhere behind you
    this.snake = this.prop(MONSTERS.gorgon_snake ? 'gorgon_snake' : 'adder', V(B.x0 - 4, 0, 0.3), Math.PI / 2);
    this.snakeX = B.x0 - 4;
    // ---- state
    this.hud = makeHudState();
    this.statues = [];
    this.foes = [];
    this.step = -1;
    this.stepT = 0;
    this.fade = 1;
    this.talking = false;
    this.hint = null;
    this.flags = { dashed: 0, killed: 0, mined: false, crafted: false, cast: 0 };
    this.outroT = -1;
    aw.on('dash', () => this.onDash());
    aw.on('enemyKilled', (ev) => this.onKill(ev));
    aw.on('skillCast', () => { this.flags.cast++; });
    aw.on('playerDead', () => this.later(1.2, () => { if (has(this.player, 'revive')) this.player.revive(this.player.maxHp); this.say('morel', 'Up you get, beardy!'); }));
    this.timers = [];
    if (game.audio) { game.audio.music('tutorial'); this.amb = game.audio.loop && game.audio.loop('cave', 0.35); }
    // dev: ?scene=tutorial&beat=N starts at a later beat
    const beat = +(params.beat || 0) | 0;
    if (beat > 0) {
      const spots = [this.start.x, this.ringAt.x + 1.5, this.gap.x1 + 1, this.gap.x1 + 2, this.benchAt.x - 2, this.benchAt.x + 1, this.waveAt.x - 3];
      this.player.x = spots[Math.min(beat, spots.length - 1)]; this.player.z = 0;
      const mg = this.mg(); if (mg) { mg.visible = true; mg.scale.setScalar(1); mg.position.set(this.player.x + 1.5, 0, -0.8); }
      if (this.morel && this.morel.walkTo) { this.morel.x = this.player.x + 1.5; this.morel.z = -0.8; }
      this.snakeX = this.player.x - 10;
      if (beat > 3) this.flags.mined = true;
      if (beat === 3) {
        // a ready statue to mine
        const p = this.dummyAt[0], f = new TutFoe('shroomling', p.x, p.z, { passive: true });
        if (f.obj) { f.obj.position.set(p.x, 0, p.z); this.aw.scene.add(f.obj); }
        const st = { e: f, model: f.model, x: p.x, z: p.z, k: 1, mined: false };
        if (has(f.model, 'setStone')) f.model.setStone(1);
        this.statues.push(st);
        st.it = this.aw.addInteractable({ x: p.x, z: p.z, r: 1.5, label: 'Mine', onInteract: () => this.mineStatue(st) });
      }
      this.step = beat - 1;
    }
    this.next();
  }
  exit() {
    this.amb && this.amb.stop && this.amb.stop(1);
    try { this.aw.dispose(); } catch (e) { /* placeholder engine */ }
    try { this.room.dispose && this.room.dispose(); } catch (e) { /* placeholder room */ }
  }

  // ------------------------------------------------------------------ helpers
  /** Morel's scene object (an NPC carries .model; a bare monster .group). */
  mg() { const m = this.morel; return m ? (m.model && m.model.isObject3D ? m.model : groupOf(m)) : null; }
  mplay(names, opts) { const m = this.morel; if (!m) return; if (m.walkTo) m.play([].concat(names)[0], opts); else playFirst(m, names, opts); }
  computeLoadout() { try { return Loadout.computeLoadout(this.run); } catch (e) { return { weapon: this.run.weapon || this.run.hand, skills: [null, null], stats: {} }; } }
  refreshLoadout() { this.loadout = this.computeLoadout(); if (has(this.player, 'applyLoadout')) this.player.applyLoadout(this.loadout); }
  prop(id, pos, rotY = 0) {
    let m = null;
    try { m = buildMonster(id); } catch (e) { m = null; }
    const g = groupOf(m);
    if (!g) return null;
    g.position.copy(pos); g.rotation.y = rotY;
    this.aw.scene.add(g);
    m.update && m.update(0.016);
    return m;
  }
  later(t, fn) { this.timers.push({ t, fn }); }
  /** A floating aside (no reply, no camera move): Morel shouting while you play. */
  say(who, text, dur = 2.6) { this.aside = { who, text, t: 0, dur }; }
  /** A proper exchange: the camera leans in, the world keeps breathing, you can't move until it's done. */
  talk(lines, then) {
    const g = this.game;
    this.talking = true;
    if (has(this.player, 'lockInput')) this.player.lockInput(true);
    const done = (r) => { this.talking = false; if (has(this.player, 'lockInput') && this.outroT < 0) this.player.lockInput(false); if (then) then(r); };
    if (!g.scenes.dialogue) { done({ choices: {} }); return; }
    g.pushOverlay('dialogue', { cam: this.cam, freeze: false, lines, with: this.player, replyAt: this.player, onDone: done });
  }
  moveMorel(to, dur = 1, anim = 'run', then = null, ghost = false) {
    const m = this.morel;
    if (m && m.walkTo) {
      m.ghost = ghost;
      const d = Math.hypot(to.x - m.x, to.z - m.z);
      m.walkTo(to.x, to.z, { run: anim === 'run', speed: Math.max(1.5, d / Math.max(0.3, dur)), onArrive: () => { m.ghost = false; if (then) then(); } });
      return;
    }
    const g = groupOf(m);
    if (!g) { if (then) then(); return; }
    const from = g.position.clone(), dest = to.clone();
    g.rotation.y = Math.atan2(dest.x - from.x, dest.z - from.z);
    playFirst(m, [anim, 'move', 'walk', 'idle'], { loop: true });
    this.morelMove = { from, dest, t: 0, dur, then };
  }
  faceMorelTo(x, z) { const m = this.morel; if (m && m.face) { m.face({ x, z }); return; } const g = groupOf(m); if (g) g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z); }

  // ------------------------------------------------------------------ the beats
  next() {
    this.step++; this.stepT = 0; this.hint = null;
    const B = this.BEATS[this.step];
    if (B) B.enter.call(this);
  }
  get BEATS() { return this._beats || (this._beats = this.makeBeats()); }
  makeBeats() {
    return [
      // 0 · running from the snake; Morel pops out of his ring
      { enter() {
        if (has(this.player, 'lockInput')) this.player.lockInput(true);
        this.autorun = { to: this.start.x + 3.2, t: 0 };
        this.snakeX = this.start.x - 7;
        this.game.audio && this.game.audio.play('hiss', { vol: 0.8 });
        this.later(1.2, () => {
          const g = this.mg();
          if (g) {
            g.visible = true;
            this.popT = 0;
            this.game.audio && this.game.audio.play('morel_pop', { vol: 0.8 });
            this.mplay(['wave', 'cheer', 'idle'], { loop: true });
            this.aw.fx.dust(g.position.x, g.position.z, 12, { speed: [0.6, 1.8] });
          }
          this.later(0.8, () => this.talk([
            { who: 'morel', at: this.morel, text: 'Psst! Over here, beardy!', with: this.player, replies: [{ text: 'Who are you?!' }, { text: 'Snake! Run!' }], replyAt: this.player },
            { who: 'morel', at: this.morel, text: "Morel. Spore-keeper. The spores slow it. Come!", auto: 2.2 },
          ], () => { this.hint = { keys: this.game.input.touch ? ['stick'] : ['W', 'A', 'S', 'D'], label: 'move' }; this.moveMorel(this.ringAt.clone().add(V(3.2, 0, -0.4)), 1.4, 'run'); }));
        });
      }, done() { return this.player.x > this.ringAt.x + 1.2; } },
      // 1 · the gap: dash over it
      { enter() {
        this.moveMorel(V(this.gap.x1 + 1.4, 0, -1.0), 1.0, 'run', () => { this.faceMorelTo(this.player.x, this.player.z); this.mplay(['wave', 'idle'], { loop: true }); }, true);
        this.say('morel', 'Jump the gap — DASH!', 2.6);
        this.hint = { keys: this.game.input.touch ? ['dash'] : ['SPACE'], label: 'dash' };
      }, done() { return this.player.x > this.gap.x1 + 0.3; } },
      // 2 · two training shroomlings
      { enter() {
        this.foes = this.dummyAt.map((p) => this.addFoe('shroomling', p.x, p.z, { passive: true, hp: 24 }));
        this.moveMorel(this.dummyAt[0].clone().add(V(-2.2, 0, -1.2)), 1.2, 'run', () => { this.faceMorelTo(this.dummyAt[0].x, this.dummyAt[0].z); this.mplay(['point', 'idle'], { loop: true }); });
        this.talk([
          { who: 'morel', at: this.morel, text: 'Practice shrooms! Whack them!', with: this.player, auto: 1.8 },
        ], () => { this.hint = { keys: this.game.input.touch ? ['attack'] : ['click', 'J'], label: 'attack' }; });
      }, done() { return this.flags.killed >= 2 && this.statues.every((s) => s.k >= 1); } },
      // 3 · mine a statue
      { enter() {
        this.mplay(['scared', 'surprised', 'idle'], { loop: true });
        this.talk([
          { who: 'morel', at: this.morel, text: 'Your axe… it turned them to STONE!', with: this.player, replies: [{ text: 'Medusa cursed it.' }, { text: 'Is that bad?' }], replyAt: this.player },
          { who: 'morel', at: this.morel, text: 'Stone holds ore. Mine one!', auto: 1.8 },
        ], () => { this.mplay(['idle'], { loop: true }); this.hint = { keys: this.game.input.touch ? ['tap'] : ['F'], label: 'mine the statue' }; });
      }, done() { return this.flags.mined; } },
      // 4 · craft at the stump bench
      { enter() {
        this.moveMorel(this.benchAt.clone().add(V(1.4, 0, 0.4)), 1.4, 'run', () => { this.faceMorelTo(this.player.x, this.player.z); this.mplay(['idle'], { loop: true }); });
        this.benchIt = this.aw.addInteractable({ x: this.benchAt.x, z: this.benchAt.z - 0.6, r: 1.6, label: 'Craft', onInteract: () => this.openBench() });
        this.later(1.0, () => this.say('morel', 'A stump bench! Come, come!', 2.4));
        this.hint = { keys: [], label: 'go to the bench' };
        this.benchTalked = false;
      }, update() {
        if (!this.benchTalked && Math.hypot(this.player.x - this.benchAt.x, this.player.z - this.benchAt.z) < 2.4) {
          this.benchTalked = true;
          this.talk([
            { who: 'morel', at: this.morel, text: 'Order matters! Spore sac, glowcap, spore sac.', with: this.player, replies: [{ text: 'Got it.' }, { text: 'Why that order?' }], replyAt: this.player },
            { who: 'morel', at: this.morel, text: 'Because mushrooms are fussy. Like me.', auto: 2.0 },
          ], () => { this.hint = { keys: this.game.input.touch ? ['tap'] : ['F'], label: 'craft' }; });
        }
      }, done() { return this.flags.crafted; } },
      // 5 · it's slotted: use it on a little wave
      { enter() {
        if (this.benchIt) { this.aw.removeInteractable(this.benchIt); this.benchIt = null; }
        this.mplay(['cheer', 'idle'], {});
        this.talk([
          { who: 'morel', at: this.morel, text: 'Spore Burst! I slotted it for you.', with: this.player, auto: 1.8 },
          { who: 'morel', at: this.morel, text: 'Uh-oh. Visitors. Use it!', auto: 1.4 },
        ], () => {
          this.hint = { keys: this.game.input.touch ? ['skill'] : ['Q'], label: 'Spore Burst' };
          const w = this.waveAt;
          this.foes = [[-2.4, -1.4], [-1.2, 1.6], [0.4, -0.2]].map(([dx, dz], i) => this.spawnFoe('shroomling', w.x + dx, w.z + dz, i));
          this.moveMorel(this.benchAt.clone().add(V(0.6, 0, 1.8)), 0.9, 'run', () => this.mplay(['scared', 'idle'], { loop: true }));
        });
      }, done() { return this.foes.length > 0 && this.foes.every((f) => f.dead) && (this.flags.cast > 0 || this.stepT > 16); } },
      // 6 · the snake catches up; Morel saves you
      { enter() { this.outro(); }, done() { return false; } },
    ];
  }

  addFoe(id, x, z, o = {}) {
    const f = new TutFoe(id, x, z, o);
    this.aw.add(f);
    playFirst(f.model, ['intro', 'idle'], {});
    this.aw.fx.dust(x, z, 8, { speed: [0.5, 1.6] });
    return f;
  }
  /** A real enemy from agent N's brains when they exist; a hopping stand-in until then. */
  spawnFoe(id, x, z, i) {
    let e = null;
    try { e = Enemies.spawnEnemy(this.aw, id, x, z, { delay: i * 0.25, from: 'spores' }); } catch (err) { e = null; }
    if (!e || !e.obj) { if (e) this.aw.remove(e); e = this.addFoe(id, x, z, { hp: 26 }); }
    return e;
  }
  onDash() {
    // the gap: a dash carries you over it (pits stop walkers)
    const P = this.player, g = this.gap;
    if (P.x > g.x0 - 3.6 && P.x < g.x1 && Math.abs(Math.cos(P.facing)) < 0.85) { /* moving mostly sideways: let the pit stop you */ }
    if (P.x > g.x0 - 3.6 && P.x < g.x1 + 0.2) {
      P.fly = true;
      this.later(0.22, () => {
        P.fly = false;
        if (P.x > g.x0 - 0.3 && P.x < g.x1 + 0.3) P.x = Math.sin(P.facing) > 0 ? g.x1 + 0.45 : g.x0 - 0.45;
      });
    }
    this.flags.dashed++;
  }
  onKill(ev) {
    const e = ev.enemy || ev;
    this.flags.killed++;
    if (this.step === 2 || this.step === 5) this.makeStatue(e, ev.x ?? e.x, ev.z ?? e.z);
  }
  makeStatue(e, x, z) {
    const m = e.model;
    e.statue = true; e.keepModel = true;
    const g = groupOf(m);
    const s = { e, model: m, x, z, k: 0, mined: false };
    this.statues.push(s);
    this.later(0.05, () => { if (g && !g.parent) { g.position.set(x, 0, z); this.aw.scene.add(g); } });
    this.game.audio && this.game.audio.play('petrify', { vol: 0.6 });
    if (this.step === 2) {
      s.it = this.aw.addInteractable({ x, z, r: 1.5, label: 'Mine', onInteract: () => this.mineStatue(s) });
    }
  }
  mineStatue(s) {
    if (s.mined || this.step < 3) return;
    const game = this.game;
    if (has(this.player, 'lockInput')) this.player.lockInput(true);
    const done = () => {
      if (s.mined) return;
      s.mined = true; this.flags.mined = true;
      if (s.it) this.aw.removeInteractable(s.it);
      if (has(this.player, 'lockInput')) this.player.lockInput(false);
      // the statue bursts into rubble and ore glints
      let sh = null;
      try { sh = has(s.model, 'shatter') ? s.model.shatter() : null; } catch (e) { sh = null; }
      if (sh && sh.update) this.shards = (this.shards || []).concat([sh]);
      else { const g = groupOf(s.model); if (g && g.parent) g.parent.remove(g); }
      this.later(0.4, () => this.say('morel', 'Ooh, shiny! Into the bag!', 2.2));
      this.refreshLoadout();
    };
    const ov = Flow.openMine ? Flow.openMine(game, { kind: 'statue', def: MONSTERS.shroomling, monster: 'shroomling', stage: 0, at: { x: s.x, y: 0.7, z: s.z }, cam: this.cam, scene: this, onDone: done }) : null;
    if (!ov && !game.overlays.some((o) => o.name === 'minezoom')) done();
  }
  openBench() {
    if (this.step !== 4) return;
    const game = this.game, run = this.run;
    if (has(this.player, 'lockInput')) this.player.lockInput(true);
    const close = () => {
      if (has(this.player, 'lockInput')) this.player.lockInput(false);
      // did Spore Burst come out of it? slot it into Q
      const gem = this.findSkillGem('spore_burst');
      if (gem) {
        if (has(run, 'equipSkill') && !(run.skills || []).includes(gem)) run.equipSkill(gem, 0);
        this.flags.crafted = true;
        this.refreshLoadout();
        hudToast(this.hud, 'Spore Burst → Q', { icon: 'poison', color: '#b8ff8a' });
        game.audio && game.audio.play('equip', { vol: 0.7 });
      } else this.say('morel', 'Sac, glowcap, sac! In that order!', 2.6);
    };
    const ov = Flow.openCraft ? Flow.openCraft(game, { station: 'workbench', onClose: close }) : null;
    if (!ov) close();
  }
  findSkillGem(skill) {
    const run = this.run;
    const inBag = run.bag && (run.bag.items || []).concat(run.bag.overflow || []);
    const all = [...(run.skills || []), ...(inBag || [])].filter(Boolean);
    return all.find((it) => it && (it.id === 'skill_' + skill || it.skill === skill)) || null;
  }

  // ------------------------------------------------------------------ the outro: Morel's sacrifice
  outro() {
    const P = this.player, game = this.game;
    this.outroT = 0;
    this.hint = null;
    if (has(P, 'lockInput')) P.lockInput(true);
    game.audio && game.audio.play('hiss', { vol: 1 });
    game.audio && game.audio.play('snake_rattle', { vol: 0.9 });
    this.aw.shake(0.4);
    this.snakeRush = { from: this.snakeX, to: P.x - 3.4, t: 0, dur: 1.4 };
    playFirst(this.snake, ['intro', 'attack', 'idle'], {});
    this.moveMorel(V(P.x - 1.2, 0, P.z + 0.3), 0.6, 'run', () => { this.faceMorelTo(P.x - 6, P.z); this.mplay(['scared', 'idle'], { loop: true }); });
    this.later(1.6, () => {
      if (has(this.room, 'openHole')) this.room.openHole(1);
      this.talk([
        { who: 'morel', at: this.morel, text: 'Go! Down the hole! NOW!', with: this.player, mood: 'shout', replies: [{ text: 'Not without you!' }, { text: 'Come with me!' }], replyAt: this.player },
        { who: 'morel', at: this.morel, text: 'Find your friends, beardy.', auto: 1.6 },
      ], () => this.shove());
    });
  }
  shove() {
    const P = this.player, game = this.game;
    if (has(P, 'lockInput')) P.lockInput(true);
    this.mplay(['attack', 'cheer', 'idle'], {});
    game.audio && game.audio.play('trip', { vol: 0.7 });
    // Durgan stumbles toward the hole and drops
    this.fall = { from: V(P.x, 0, P.z), to: this.holeAt.clone(), t: 0, dur: 1.0 };
    this.later(0.5, () => {
      // the snake's gaze: Morel turns to stone
      game.audio && game.audio.play('gaze', { vol: 0.9 });
      game.renderer && game.renderer.doFlash && game.renderer.doFlash(0.45, [0.48, 1, 0.75]);
      playFirst(this.snake, ['special', 'roar', 'idle'], {});
      this.stoneT = 0;
      if (this.morel && this.morel.petrify) this.morel.petrify(1.1);
      game.audio && game.audio.play('petrify', { vol: 0.8 });
    });
    this.later(2.6, () => { this.fadeOut = true; game.audio && game.audio.play('fall_whoosh', { vol: 0.8 }); });
    this.later(3.6, () => this.finish());
  }
  finish() {
    if (this.finished) return;
    this.finished = true;
    if (save.data.seen) { save.data.seen.tutorial = true; save.write(); }
    const fn = this.params.onDone;
    if (fn) fn();
    else if (this.game.scenes.dungeon) this.game.go('dungeon', { stage: 0, newFloor: true }, { transition: 'fade' });
    else this.game.go('title', {}, { transition: 'fade' });
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const aw = this.aw, P = this.player;
    this.stepT += dt;
    this.fade = this.fadeOut ? Math.min(1, this.fade + dt * 1.2) : Math.max(0, this.fade - dt * 1.4);
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    // opening: Durgan runs in on his own
    if (this.autorun) {
      const a = this.autorun; a.t += dt;
      P.x = Math.min(a.to, P.x + 5 * dt); P.facing = Math.PI / 2;
      playFirst(P.model, ['run'], { loop: true });
      if (P.x >= a.to || a.t > 2) { this.autorun = null; playFirst(P.model, ['idleCombat', 'idle'], { loop: true }); }
    }
    // Morel's scripted moves and pop-up
    const mg = this.mg();
    if (mg && this.popT !== undefined && this.popT < 1) { this.popT = Math.min(1, this.popT + dt * 2.4); mg.scale.setScalar(Math.max(0.01, ease.outBack(this.popT))); }
    if (this.morel && this.morel.walkTo) this.morel.update(dt);
    if (this.morelMove && mg) {
      const m = this.morelMove; m.t += dt;
      const k = ease.inOutSine(clamp(m.t / m.dur));
      mg.position.lerpVectors(m.from, m.dest, k);
      mg.position.y = Math.abs(Math.sin(k * Math.PI * 4)) * 0.08;
      if (m.t >= m.dur) { this.morelMove = null; mg.position.y = 0; this.mplay(['idle'], { loop: true }); if (m.then) m.then(); }
    }
    if (this.morel && !this.morel.walkTo && this.morel.update && !(this.stoneT >= 1.2)) this.morel.update(dt);
    if (this.stoneT !== undefined && this.stoneT < 1.2 && !(this.morel && this.morel.walkTo)) { this.stoneT += dt; if (has(this.morel, 'setStone')) this.morel.setStone(ease.inOutSine(clamp(this.stoneT / 1.1))); }
    // the snake trails you (never far), rushes at the end
    const sg = groupOf(this.snake);
    if (sg) {
      if (this.snakeRush) { const r = this.snakeRush; r.t += dt; this.snakeX = r.from + (r.to - r.from) * ease.outCubic(clamp(r.t / r.dur)); }
      else if (this.step >= 0) { const want = P.x - 9.5; this.snakeX = Math.max(this.snakeX, Math.min(want, this.snakeX + dt * 1.6)); }
      const vx = this.snakeX - (this.snakeLast ?? this.snakeX); this.snakeLast = this.snakeX;
      sg.position.set(this.snakeX, 0, 0.3 + Math.sin(this.time * 2) * 0.3);
      sg.rotation.y = Math.PI / 2;
      if (has(this.snake, 'setMove')) this.snake.setMove(clamp(Math.abs(vx) / Math.max(1e-4, dt) / 3, 0, 1), Math.abs(vx) / Math.max(1e-4, dt));
      if (this.snake.update) this.snake.update(dt);
      if (!this.snakeRush && (this.hissT = (this.hissT || 6) - dt) <= 0) { this.hissT = 7 + Math.random() * 5; this.game.audio && this.game.audio.play('hiss', { vol: 0.4 }); }
    }
    // Durgan's fall into the hole
    if (this.fall) {
      const f = this.fall; f.t += dt;
      const k = clamp(f.t / f.dur);
      P.x = f.from.x + (f.to.x - f.from.x) * ease.inQuad(k); P.z = f.from.z + (f.to.z - f.from.z) * ease.inQuad(k);
      P.facing = Math.PI / 2;
      const o = P.obj;
      if (o && k >= 1) { o.position.y = -Math.min(3, (f.t - f.dur) * (f.t - f.dur) * 9); }
      if (k < 1) playFirst(P.model, ['trip', 'run'], {});
    }
    // statues: the stone sweeps over the fallen shrooms; shattered rubble settles
    for (const s of this.statues) if (s.k < 1) { s.k = Math.min(1, s.k + dt * 1.4); if (has(s.model, 'setStone')) s.model.setStone(ease.inOutSine(s.k)); }
    if (this.shards) for (let i = this.shards.length - 1; i >= 0; i--) { const sh = this.shards[i]; try { sh.update(dt); } catch (e) { sh.done = true; } if (sh.done) { try { sh.dispose && sh.dispose(); } catch (e) { /* ignore */ } this.shards.splice(i, 1); } }
    if (this.aside) { this.aside.t += dt; if (this.aside.t > this.aside.dur) this.aside = null; }
    // the world (Durgan's input is locked while anyone is talking)
    aw.update(dt);
    if (this.fall && P.obj && this.fall.t >= this.fall.dur) P.obj.position.y = -Math.min(3, (this.fall.t - this.fall.dur) ** 2 * 9);
    // beats
    const B = this.BEATS[this.step];
    if (B) {
      if (B.update) B.update.call(this, dt);
      if (!this.talking && B.done.call(this)) this.next();
    }
  }

  // ------------------------------------------------------------------ 2D
  project(x, y, z) {
    if (has(this.cam, 'project')) return this.cam.project(x, y, z, 960, 540);
    const v = V(x, y, z).project(this.cam.camera);
    return { x: (v.x * 0.5 + 0.5) * 960, y: (-v.y * 0.5 + 0.5) * 540 };
  }
  draw(ui) {
    const game = this.game, P = this.player;
    const ctx = ui.ctx;
    // the HUD (hidden in the opening and the outro)
    const overlay = game.overlays.length > 0;
    const hidden = this.step === 0 && this.stepT < 2 || this.outroT >= 0 || this.talking || overlay;
    let prompt = null;
    const it = P && P.interactTarget;
    if (it && !hidden) { const p = this.project(it.x, 1.3, it.z); prompt = { x: p.x, y: p.y, label: it.label, key: 'F' }; }
    const out = drawActionHud(ui, this.hud, { player: P, loadout: this.loadout, run: this.run, touch: ui.touch, hidden, interact: prompt });
    if (out.interact && it && it.onInteract) it.onInteract(P, this.aw);
    if (!hidden) this.aw.drawUI(ui);
    // Morel shouting while you play
    if (this.aside && !this.talking && !overlay) {
      const a = this.aside;
      const g = this.mg();
      const at = this.morel && this.morel.headPos ? this.morel.headPos(V()).add(V(0, 0.2, 0)) : g ? g.position.clone().add(V(0, (this.morel.height || 1) + 0.35, 0)) : null;
      const p = at ? this.project(at.x, at.y, at.z) : { x: ui.w / 2, y: ui.h * 0.3 };
      drawFloat(ui, p.x, p.y, a.text, { name: 'Morel', color: '#b8f08a', alpha: clamp(a.t / 0.15) * clamp((a.dur - a.t) / 0.3), shown: Math.floor(a.t * 42), now: a.t, revealT: (i) => i / 42, maxW: 240 });
    }
    // the control hint for this beat
    if (this.hint && !this.talking && this.outroT < 0 && !overlay) this.drawHint(ui);
    // skip (only once you've seen it)
    const seen = save.data.seen && (save.data.seen.tutorial || save.data.seen.v5tutorial);
    if (seen && !this.finished) {
      const label = 'Skip tutorial >>', w = ui.measure(label) + 16, c = tagCanvas(w), x = ui.w - c.width - 12, y = 12;
      const h = ui.hit('tut-skip', x, y, c.width, c.height + 4, { sound: false });
      ctx.globalAlpha = h.hover ? 1 : 0.6; ui.img(c, x, y); ui.text(label, x + 10, y + 11, { color: '#3a2214' }); ctx.globalAlpha = 1;
      if (h.clicked) this.finish();
    }
    if (this.fade > 0.01) { ctx.globalAlpha = clamp(this.fade); ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, ui.w, ui.h); ctx.globalAlpha = 1; }
  }
  drawHint(ui) {
    const h = this.hint, touch = ui.touch;
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 4);
    const y = ui.h - (touch ? 150 : 70);
    const label = h.label;
    let w = ui.measure(label, 'large') + 20;
    const keys = touch ? [] : h.keys;
    for (const k of keys) w += Math.max(14, ui.measure(k, 'small') + 10) + 3;
    let x = Math.round(ui.w / 2 - w / 2);
    const ctx = ui.ctx;
    ctx.save(); ctx.globalAlpha = 0.55 * pulse; ctx.fillStyle = '#06040a'; ctx.fillRect(x - 8, y - 6, w + 16, 26); ctx.restore();
    for (const k of keys) { ui.keycap(k, x, y); x += Math.max(14, ui.measure(k, 'small') + 10) + 3; }
    ctx.globalAlpha = pulse;
    ui.text(label, x + 6, y + 1, { font: 'large', color: '#ffe8b8', outline: '#08060c' });
    ctx.globalAlpha = 1;
  }
}
